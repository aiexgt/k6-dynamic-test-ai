const path = require('path');
const fs = require('fs');
const { Client } = require(path.resolve(__dirname, '../server/node_modules/pg'));

const envPath = path.resolve(__dirname, '../.env');
const content = fs.readFileSync(envPath, 'utf-8');
const match = content.match(/SHARED_DATABASE_URL=(.*)/);
const connStr = match ? match[1].trim() : '';

const client = new Client({ connectionString: connStr });

async function main() {
  await client.connect();
  console.log('Connected to shared online database.');

  await client.query(`
    CREATE TABLE IF NOT EXISTS item_versions (
      id VARCHAR(255) PRIMARY KEY,
      entity_type VARCHAR(50) NOT NULL,
      entity_id VARCHAR(255) NOT NULL,
      version_number INT NOT NULL,
      snapshot JSONB NOT NULL,
      created_by VARCHAR(255),
      created_by_name VARCHAR(255),
      change_summary TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_item_versions_entity ON item_versions(entity_type, entity_id, version_number DESC);
  `);
  console.log('Table item_versions and index created in online DB.');

  const res = await client.query('SELECT COUNT(*) FROM item_versions');
  console.log('item_versions count:', res.rows[0].count);

  await client.end();
  console.log('SUCCESS: Online shared database versioning table initialized!');
}

main().catch(err => {
  console.error('Fatal setup error:', err);
  process.exit(1);
});
