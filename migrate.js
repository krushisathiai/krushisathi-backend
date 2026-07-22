const db = require('./db');

async function migrate() {
  try {
    console.log('Running database migration...');
    
    // Add columns to users table (ignoring errors if they already exist)
    const columns = [
      'location VARCHAR(150)',
      'farm_size VARCHAR(50)',
      'main_crop VARCHAR(100)',
      'soil_type VARCHAR(100)',
      'sowing_date DATE'
    ];
    
    for (const col of columns) {
      try {
        await db.query(`ALTER TABLE users ADD COLUMN ${col}`);
        console.log(`Added column: ${col}`);
      } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
          console.log(`Column already exists: ${col.split(' ')[0]}`);
        } else {
          console.error(`Error adding ${col}:`, e.message);
        }
      }
    }

    // Creating new tables just in case they don't exist yet
    await db.query(`
      CREATE TABLE IF NOT EXISTS fertilizer_guide (
        id INT AUTO_INCREMENT PRIMARY KEY,
        crop_name VARCHAR(100) NOT NULL,
        soil_type VARCHAR(100),
        fertilizer_name VARCHAR(150) NOT NULL,
        fertilizer_type ENUM('NPK', 'Micronutrient', 'Organic') DEFAULT 'NPK',
        dose VARCHAR(100),
        stage VARCHAR(100),
        application_method TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS expert_questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT,
        answered_by VARCHAR(100),
        answered_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS urea_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        full_name VARCHAR(100) NOT NULL,
        mobile_number VARCHAR(15) NOT NULL,
        location VARCHAR(255) NOT NULL,
        quantity INT NOT NULL,
        note VARCHAR(255),
        status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Created urea_requests table if it did not exist.');

    // Create the test user required by the tester
    const bcrypt = require('bcryptjs');
    const testEmail = 'vaibhavsonawane2005@gmail.com';
    const testPassword = 'Vaibhav@9022';
    const hashedPw = await bcrypt.hash(testPassword, 10);
    
    // Check if test user exists
    const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [testEmail]);
    if (existing.length === 0) {
      await db.query(
        'INSERT INTO users (full_name, mobile_number, email, password, is_verified) VALUES (?, ?, ?, ?, ?)',
        ['Vaibhav Sonawane', '9999999999', testEmail, hashedPw, true]
      );
      console.log('Test user created successfully!');
    } else {
      // Update password just in case
      await db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPw, testEmail]);
      console.log('Test user already exists. Password updated.');
    }

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
