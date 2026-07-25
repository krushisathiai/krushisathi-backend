require('dotenv').config({ path: './.env' });
const mysql = require('mysql2/promise');

async function checkDb() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await connection.execute('SELECT id, crop_name, scanned_at FROM scans ORDER BY scanned_at DESC LIMIT 5');
  console.log("Recent scans:");
  console.table(rows);
  await connection.end();
}
checkDb().catch(console.error);
