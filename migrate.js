const db = require('./db');
const bcrypt = require('bcryptjs');

async function migrate() {
  try {
    console.log('Running database migration for PostgreSQL...');

    // 1. Create Users Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        mobile_number VARCHAR(15) NOT NULL UNIQUE,
        email VARCHAR(100),
        password VARCHAR(255) NOT NULL,
        otp VARCHAR(6),
        otp_expires_at TIMESTAMP,
        is_verified BOOLEAN DEFAULT FALSE,
        profile_image VARCHAR(255),
        location VARCHAR(150),
        farm_size VARCHAR(50),
        main_crop VARCHAR(100),
        soil_type VARCHAR(100),
        sowing_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Users table checked/created.');

    // 2. Create Scans Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS scans (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        crop_name VARCHAR(100),
        disease_name VARCHAR(150),
        disease_description TEXT,
        severity VARCHAR(50) DEFAULT 'Low Risk',
        image_url VARCHAR(255),
        treatment_advice TEXT,
        fertilizer_advice TEXT,
        confidence_score DECIMAL(5,2),
        scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Scans table checked/created.');

    // 3. Create Crop Diseases Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS crop_diseases (
        id SERIAL PRIMARY KEY,
        crop_name VARCHAR(100) NOT NULL,
        disease_name VARCHAR(150) NOT NULL,
        symptoms TEXT,
        treatment TEXT,
        prevention TEXT,
        image_url VARCHAR(255),
        severity_level VARCHAR(50) DEFAULT 'Medium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Crop diseases table checked/created.');

    // 4. Create Alerts Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id SERIAL PRIMARY KEY,
        user_id INT,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'general',
        is_read BOOLEAN DEFAULT FALSE,
        scheduled_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Alerts table checked/created.');

    // 5. Create Fertilizer Guide Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS fertilizer_guide (
        id SERIAL PRIMARY KEY,
        crop_name VARCHAR(100) NOT NULL,
        soil_type VARCHAR(100),
        fertilizer_name VARCHAR(150) NOT NULL,
        fertilizer_type VARCHAR(50) DEFAULT 'NPK',
        dose VARCHAR(100),
        stage VARCHAR(100),
        application_method TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Fertilizer guide table checked/created.');

    // 6. Create Expert Questions Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS expert_questions (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT,
        answered_by VARCHAR(100),
        answered_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Expert questions table checked/created.');

    // 7. Create Urea Requests Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS urea_requests (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        full_name VARCHAR(100) NOT NULL,
        mobile_number VARCHAR(15) NOT NULL,
        location VARCHAR(255) NOT NULL,
        quantity INT NOT NULL,
        note VARCHAR(255),
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Urea requests table checked/created.');

    // ─── SEED REFERENCE DATA ───────────────────────────────────────────────────

    // Seed Crop Diseases Reference Data
    const [existingDiseases] = await db.query('SELECT id FROM crop_diseases LIMIT 1');
    if (existingDiseases.length === 0) {
      console.log('Seeding crop diseases...');
      await db.query(`
        INSERT INTO crop_diseases (crop_name, disease_name, symptoms, treatment, prevention, severity_level) VALUES
        ('Tomato', 'Early Blight', 'Dark brown spots with yellow rings on lower leaves', 'Apply copper-based fungicide every 7-10 days', 'Rotate crops, remove infected leaves, ensure good air circulation', 'Medium'),
        ('Tomato', 'Late Blight', 'Water-soaked spots on leaves that turn brown; white mold underneath', 'Apply mancozeb fungicide immediately; remove affected parts', 'Avoid overhead watering, plant resistant varieties', 'High'),
        ('Wheat', 'Rust Disease', 'Orange-red pustules on leaves and stems', 'Use triazole fungicides, remove infected plants', 'Use resistant varieties, timely sowing, balanced fertilization', 'High'),
        ('Rice', 'Blast Disease', 'Diamond-shaped gray lesions on leaves', 'Apply tricyclazole fungicide', 'Avoid excessive nitrogen, use resistant varieties', 'High'),
        ('Cotton', 'Leaf Curl Virus', 'Upward curling of leaves, thickened veins', 'Remove and destroy infected plants', 'Control whitefly population, use virus-resistant varieties', 'High'),
        ('Maize', 'Gray Leaf Spot', 'Rectangular gray-brown lesions parallel to leaf veins', 'Apply strobilurin fungicides', 'Crop rotation, remove crop debris', 'Medium'),
        ('Potato', 'Late Blight', 'Dark green to brown water-soaked lesions on leaves', 'Spray metalaxyl + mancozeb', 'Use certified seed, proper spacing', 'High'),
        ('Chili', 'Leaf Curl', 'Curling and puckering of leaves, stunted growth', 'Apply imidacloprid for whitefly control', 'Use virus-free seedlings, yellow sticky traps', 'Medium'),
        ('Grapes', 'Downy Mildew', 'Yellow spots on upper surface, white fungal growth below', 'Apply bordeaux mixture or metalaxyl', 'Prune for air circulation, avoid wet foliage', 'High')
      `);
      console.log('Seed crop diseases populated.');
    }

    // Seed Fertilizer Guide
    const [existingFertilizers] = await db.query('SELECT id FROM fertilizer_guide LIMIT 1');
    if (existingFertilizers.length === 0) {
      console.log('Seeding fertilizer guide...');
      await db.query(`
        INSERT INTO fertilizer_guide (crop_name, soil_type, fertilizer_name, fertilizer_type, dose, stage, notes) VALUES
        ('Tomato', 'Black Soil', 'NPK 19:19:19', 'NPK', '1 kg per acre', 'Vegetative', 'Apply fertilizers as per crop stage and soil test.'),
        ('Tomato', 'Black Soil', 'Zinc Sulphate', 'Micronutrient', '25 kg per acre', 'Flowering', 'Essential for fruit development.'),
        ('Tomato', 'Black Soil', 'Vermi Compost', 'Organic', '2 ton per acre', 'Pre-sowing', 'Improves soil structure and water retention.'),
        ('Wheat', 'Alluvial Soil', 'DAP 18:46:0', 'NPK', '50 kg per acre', 'Sowing', 'Apply as basal dose during sowing.'),
        ('Wheat', 'Alluvial Soil', 'Urea', 'NPK', '65 kg per acre', 'Tillering', 'Split application recommended.'),
        ('Rice', 'Clay Soil', 'NPK 20:20:0', 'NPK', '50 kg per acre', 'Transplanting', 'Apply at transplanting time.'),
        ('Rice', 'Clay Soil', 'Potash (MOP)', 'NPK', '25 kg per acre', 'Panicle Initiation', 'Improves grain filling.'),
        ('Cotton', 'Black Soil', 'NPK 10:26:26', 'NPK', '75 kg per acre', 'Sowing', 'Basal dose at sowing.'),
        ('Maize', 'Red Soil', 'Urea', 'NPK', '100 kg per acre', 'Knee High', 'Apply in 2-3 splits.'),
        ('Grapes', 'Sandy Loam', 'Calcium Nitrate', 'Micronutrient', '10 kg per acre', 'Berry Development', 'Prevents fruit cracking.')
      `);
      console.log('Seed fertilizer guide populated.');
    }

    // Seed Alerts
    const [existingAlerts] = await db.query('SELECT id FROM alerts LIMIT 1');
    if (existingAlerts.length === 0) {
      console.log('Seeding default alerts...');
      await db.query(`
        INSERT INTO alerts (title, message, type, scheduled_at) VALUES
        ('Spray Reminder', 'Time to spray for Early Blight\nTomorrow, 7:00 AM', 'spray', NOW() + INTERVAL '1 day'),
        ('Irrigation Reminder', 'Irrigate your field\nToday, 6:00 PM', 'reminder', NOW()),
        ('Fertilizer Reminder', 'Apply NPK 19:19:19\n25 May 2025', 'fertilizer', NOW()),
        ('Weather Alert', 'Rain expected in 2 days\n22 May 2025', 'weather', NOW() + INTERVAL '2 days'),
        ('Pest Alert', 'Aphids activity high\n23 May 2025', 'disease', NOW()),
        ('Disease Alert: Tomato Blight Detected', 'High humidity conditions favor Early Blight development. Check your tomato crops.', 'disease', NOW()),
        ('Weather Alert: Heavy Rain Expected', 'Heavy rainfall predicted in next 48 hours. Ensure proper drainage in fields.', 'weather', NOW())
      `);
      console.log('Seed alerts populated.');
    }

    // Create the test user
    const testEmail = 'vaibhavsonawane2005@gmail.com';
    const testPassword = 'Vaibhav@9022';
    const hashedPw = await bcrypt.hash(testPassword, 10);
    const [existingTestUser] = await db.query('SELECT id FROM users WHERE email = ?', [testEmail]);
    if (existingTestUser.length === 0) {
      await db.query(`
        INSERT INTO users (full_name, mobile_number, email, password, is_verified) 
        VALUES ('Vaibhav Sonawane', '9999999999', ?, ?, true)
      `, [testEmail, hashedPw]);
      console.log('Test user created successfully!');
    } else {
      await db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPw, testEmail]);
      console.log('Test user already exists. Password updated.');
    }

    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

if (require.main === module) {
  migrate().then(() => {
    process.exit(0);
  });
}

module.exports = migrate;
