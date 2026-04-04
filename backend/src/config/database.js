// ============================================================
// nexus/backend/src/config/database.js
// MySQL connection pool via mysql2. Configured for XAMPP.
// ============================================================
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

let pool;

async function connectDB() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'nexus_db_fresh_1775201113113';

  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: true,

    // 🔥 ADD THIS LINE (IMPORTANT)
    connectTimeout: 10000,

    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: '+00:00',
    charset: 'utf8mb4',
  });

  const conn = await pool.getConnection();
  await conn.query('SELECT 1');
  conn.release();

  // In dev, auto-recreate schema if the DB contains broken tables
  // (MariaDB may report "doesn't exist in engine" for certain tables).
  let effectiveDatabase = database;
  if (process.env.NODE_ENV !== 'production') {
    const maybeFreshDb = await ensureMysqlSchemaIfBroken({ pool, database, host, port, user, password });
    if (maybeFreshDb) {
      await pool.end();
      pool = mysql.createPool({
        host,
        port,
        user,
        password,
        database: maybeFreshDb,
        multipleStatements: true,
        connectTimeout: 10000,
        waitForConnections: true,
        connectionLimit: 20,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        timezone: '+00:00',
        charset: 'utf8mb4',
      });
      const conn2 = await pool.getConnection();
      await conn2.query('SELECT 1');
      conn2.release();
      logger.warn(`Using fresh MySQL database: ${maybeFreshDb}`);
      effectiveDatabase = maybeFreshDb;
    }
  }

  logger.info(`MySQL connected: ${host}/${effectiveDatabase}`);
}

async function isTableBroken(poolToCheck, tableName) {
  const sql = `CHECK TABLE \`${tableName}\``;
  const [rows] = await poolToCheck.query(sql);
  if (!rows || rows.length === 0) return false;
  return rows.some((r) => {
    const msg = r?.Msg_text;
    return typeof msg === 'string' && msg.toLowerCase().includes("doesn't exist");
  });
}

async function ensureMysqlSchemaIfBroken({ pool: poolToUse, database, host, port, user, password }) {
  const migrationPath = path.join(__dirname, '../../migrations/001_mysql_schema.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  const normalizedMigrationSql = migrationSql.replace(/\bnexus_db\b/g, database);

  try {
    const usersBroken = await isTableBroken(poolToUse, 'users');
    const sessionsBroken = await isTableBroken(poolToUse, 'sessions');
    if (!usersBroken && !sessionsBroken) return null;

    logger.warn(
      `Detected broken MySQL tables (users=${usersBroken}, sessions=${sessionsBroken}). Recreating schema from migrations…`,
    );

    // Discard broken InnoDB tablespaces (fixes ER_TABLESPACE_EXISTS)
    const discardTablespace = async (tableName) => {
      try {
        await poolToUse.query(`ALTER TABLE \`${tableName}\` DISCARD TABLESPACE`);
      } catch {
        // Best-effort: some table states/disconnects may not support DISCARD.
      }
    };

    await discardTablespace('users');
    await discardTablespace('sessions');

    // Drop core auth tables first to avoid "broken engine" leftovers.
    await poolToUse.query(
      'DROP TABLE IF EXISTS sessions, users',
    );

    // Execute full baseline schema.
    await poolToUse.query(normalizedMigrationSql);

    logger.info('MySQL schema recreation completed.');
    return null;
  } catch (err) {
    logger.error('MySQL schema recreation failed:', {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlMessage: err?.sqlMessage,
      sqlState: err?.sqlState,
      stack: err?.stack,
    });

    // Fallback: dropping the whole DB usually clears leftover InnoDB tablespaces.
    const code = err?.code || '';
    const message = (err?.message || '').toString();
    const needsFullReset = code === 'ER_TABLESPACE_EXISTS' || message.toLowerCase().includes('tablespace');
    if (process.env.NODE_ENV !== 'production' && needsFullReset) {
      try {
        const serverConn = await mysql.createConnection({
          host,
          port,
          user,
          password,
          multipleStatements: true,
        });
        await serverConn.query(`DROP DATABASE IF EXISTS \`${database}\``);
        await serverConn.query(normalizedMigrationSql);
        await serverConn.end();
        logger.warn('MySQL database reset completed.');
        return null;
      } catch (resetErr) {
        logger.error('MySQL database reset failed:', {
          message: resetErr?.message,
          code: resetErr?.code,
          sqlMessage: resetErr?.sqlMessage,
          sqlState: resetErr?.sqlState,
          stack: resetErr?.stack,
        });
      }

      // Last-resort fallback: create a fresh DB instead of deleting the broken one.
      try {
        const freshDb = `${database}_fresh_${Date.now()}`;
        const normalizedFreshMigrationSql = migrationSql.replace(/\bnexus_db\b/g, freshDb);
        const serverConn = await mysql.createConnection({
          host,
          port,
          user,
          password,
          multipleStatements: true,
        });
        await serverConn.query(normalizedFreshMigrationSql);
        await serverConn.end();
        logger.warn(`Created fresh MySQL database: ${freshDb}`);
        return freshDb;
      } catch (freshErr) {
        logger.error('MySQL fresh database fallback failed:', {
          message: freshErr?.message,
          code: freshErr?.code,
          sqlMessage: freshErr?.sqlMessage,
          sqlState: freshErr?.sqlState,
          stack: freshErr?.stack,
        });
      }
    }
  }

  return null;
}

function getPool() {
  if (!pool) throw new Error('Database not initialised. Call connectDB() first.');
  return pool;
}

// Helper: converts PostgreSQL $1,$2 placeholders to MySQL ?
async function query(text, params) {
  const start = Date.now();
  const mysqlText = text.replace(/\$\d+/g, '?');
  const [rows] = await getPool().execute(mysqlText, params);
  const duration = Date.now() - start;
  if (duration > 1000) logger.warn(`Slow query (${duration}ms): ${text.slice(0, 80)}`);
  return { rows: Array.isArray(rows) ? rows : [rows] };
}

async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { connectDB, getPool, query, withTransaction };
