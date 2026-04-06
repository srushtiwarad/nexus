// ============================================================
// nexus/backend/src/config/database.js
// PostgreSQL connection pool via pg.
// ============================================================
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

let pool;

async function connectDB() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  const user = process.env.DB_USER || 'nexus_app';
  const password = process.env.DB_PASSWORD || 'devpassword123';
  const database = process.env.DB_NAME || 'nexus_db';
  const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

  pool = new Pool({
    host,
    port,
    user,
    password,
    database,
    ssl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    
    // Check if tables exist — if not, auto-import schema
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tableNames = res.rows.map(t => t.table_name.toLowerCase());
    
    if (!tableNames.includes('users') || !tableNames.includes('sessions')) {
      logger.warn('Core database tables missing. Initializing PostgreSQL schema…');
      const migrationPath = path.join(__dirname, '../../migrations/001_initial_schema.sql');
      const migrationSql = fs.readFileSync(migrationPath, 'utf8');
      
      await client.query(migrationSql);
      logger.info('PostgreSQL schema initialized successfully.');
    }
    
    client.release();
    logger.info(`PostgreSQL connected: ${host}/${database}`);
  } catch (err) {
    logger.error('Database connection or initialization failed:', err.message);
    throw err;
  }
}

function getPool() {
  if (!pool) throw new Error('Database not initialised. Call connectDB() first.');
  return pool;
}

// Standard PostgreSQL query helper
async function query(text, params) {
  const start = Date.now();
  
  // Auto-convert ? to $n if needed (fallback for convenience during migration)
  let pgText = text;
  if (params && params.length > 0 && text.includes('?')) {
    let index = 1;
    pgText = text.replace(/\?/g, () => `$${index++}`);
  }

  try {
    const result = await getPool().query(pgText, params);
    const duration = Date.now() - start;
    if (duration > 1000) logger.warn(`Slow query (${duration}ms): ${pgText.slice(0, 80)}`);
    return { rows: result.rows, rowCount: result.rowCount };
  } catch (err) {
    logger.error(`Query Error: ${err.message} | SQL: ${pgText}`);
    throw err;
  }
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { connectDB, getPool, query, withTransaction };

