const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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
    CREATE TABLE IF NOT EXISTS shared_team_members (
      email VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'DEVELOPER',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Table shared_team_members ready.');

  await client.query(`
    CREATE TABLE IF NOT EXISTS shared_system_config (
      config_key VARCHAR(100) PRIMARY KEY,
      config_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Table shared_system_config ready.');

  const defaultMasterHash = crypto.createHash('sha256').update('admin_flowrunner_2026').digest('hex');
  await client.query(
    `INSERT INTO shared_system_config (config_key, config_value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = NOW()`,
    ['admin_master_pin_hash', defaultMasterHash]
  );
  console.log('admin_master_pin_hash registered in online database.');

  const res = await client.query('SELECT * FROM shared_system_config');
  console.log('Online config rows:', res.rows);
  await client.end();
  console.log('SUCCESS: Online shared database auth tables initialized!');
}

main().catch(err => {
  console.error('Fatal setup error:', err);
  process.exit(1);
});
