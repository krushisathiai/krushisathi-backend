const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Vaibhav@575@localhost:5432/royal_shetkari',
  ssl: process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('neon.tech') || process.env.DATABASE_URL.includes('sslmode=require'))
    ? { rejectUnauthorized: false } 
    : false,
  max: 25, // Maximum number of clients in pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection not established
});

// Handle idle client connection errors to prevent process crash
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

module.exports = {
  pool,
  async query(sql, params = []) {
    let pgSql = sql;
    let pIndex = 1;
    // Translate parameter placeholders from ? to $1, $2, etc.
    pgSql = pgSql.replace(/\?/g, () => `$${pIndex++}`);

    const isInsert = pgSql.trim().toLowerCase().startsWith('insert');
    
    // Automatically return ID on insert queries to mimic MySQL insertId
    if (isInsert && !pgSql.toLowerCase().includes('returning')) {
      pgSql += ' RETURNING id';
    }

    const startTime = Date.now();
    try {
      const res = await pool.query(pgSql, params);
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        console.warn(`Slow DB Query warning (${duration}ms):`, pgSql.slice(0, 100));
      }
      
      if (isInsert && res.rows && res.rows.length > 0) {
        return [{ insertId: res.rows[0].id }, null];
      }
      
      return [res.rows, null];
    } catch (err) {
      console.error('Postgres database query error:', err.message, 'SQL:', pgSql);
      throw err;
    }
  }
};
