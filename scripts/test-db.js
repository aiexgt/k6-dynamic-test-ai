/**
 * Script de prueba de conexión a la Base de Datos Central Compartida
 * Uso: node scripts/test-db.js [CONNECTION_STRING_OPCIONAL]
 */
const path = require('path');
const fs = require('fs');
const { Client } = require(path.resolve(__dirname, '../server/node_modules/pg'));

// Cargar .env si existe
const envPath = path.resolve(__dirname, '../.env');
let envConfig = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      envConfig[match[1]] = match[2]?.replace(/^['"]|['"]$/g, '') || '';
    }
  });
}

const customConnStr = process.argv[2];
const connStr = customConnStr || process.env.SHARED_DATABASE_URL || envConfig.SHARED_DATABASE_URL;

if (!connStr) {
  console.error('❌ Error: No se definió SHARED_DATABASE_URL en el entorno ni en .env');
  console.log('💡 Ejemplo de uso: node scripts/test-db.js "postgresql://usuario:password@host:5432/dbname"');
  process.exit(1);
}

console.log('🐘 Probando conexión a:', connStr.replace(/:[^:@]+@/, ':***@'));

const client = new Client({
  connectionString: connStr,
  connectionTimeoutMillis: 5000
});

client.connect()
  .then(async () => {
    console.log('✅ ¡CONEXIÓN EXITOSA!');
    const res = await client.query('SELECT current_database(), current_user, version()');
    console.log('📊 Detalles:', res.rows[0]);
    await client.end();
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error de conexión:', err.message);
    process.exit(1);
  });
