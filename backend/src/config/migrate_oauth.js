const { query } = require('./database');
const logger = require('../utils/logger');

async function migrate() {
    try {
        logger.info('Starting OAuth migration...');

        // Check if columns already exist
        const tableInfo = await query("PRAGMA table_info(users)");
        const columnNames = tableInfo.map(col => col.name);

        if (!columnNames.includes('google_id')) {
            await query("ALTER TABLE users ADD COLUMN google_id TEXT");
            logger.info('Added google_id column');
        }

        if (!columnNames.includes('github_id')) {
            await query("ALTER TABLE users ADD COLUMN github_id TEXT");
            logger.info('Added github_id column');
        }

        // Try to add unique indexes separately
        try {
            await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL");
            await query("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id) WHERE github_id IS NOT NULL");
            logger.info('Created unique indexes for OAuth IDs');
        } catch (e) {
            logger.warn('Could not create unique indexes (might already exist or partial failure):', e.message);
        }

        logger.info('✅ OAuth migration completed successfully');
        process.exit(0);
    } catch (err) {
        logger.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
