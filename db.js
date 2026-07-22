const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Vaibhav@575@localhost:5432/royal_shetkari',
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech') 
    ? { rejectUnauthorized: false } 
    : false
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

    try {
      const res = await pool.query(pgSql, params);
      
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
