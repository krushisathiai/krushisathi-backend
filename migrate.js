const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
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
    
    // Add new columns if they don't exist
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user'`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_name VARCHAR(150)`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_location VARCHAR(200)`);
    console.log('Users table checked/created with new columns.');

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
        language VARCHAR(10) DEFAULT 'mr',
        answered_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    try {
      await db.query(`ALTER TABLE expert_questions ADD COLUMN language VARCHAR(10) DEFAULT 'mr';`);
    } catch (e) {
      // column already exists
    }
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

    // 8. Create Shop Products Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS shop_products (
        id SERIAL PRIMARY KEY,
        shop_owner_id INT NOT NULL,
        name VARCHAR(150) NOT NULL,
        category VARCHAR(100),
        company VARCHAR(100),
        price DECIMAL(10,2),
        stock_quantity INT DEFAULT 0,
        unit VARCHAR(50),
        description TEXT,
        image_url VARCHAR(255),
        status VARCHAR(50) DEFAULT 'Available',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shop_owner_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Shop products table checked/created.');

    // 9. Create Shop Inquiries Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS shop_inquiries (
        id SERIAL PRIMARY KEY,
        product_id INT NOT NULL,
        shop_owner_id INT NOT NULL,
        user_id INT NOT NULL,
        user_name VARCHAR(100),
        user_mobile VARCHAR(15),
        user_location VARCHAR(150),
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES shop_products(id) ON DELETE CASCADE,
        FOREIGN KEY (shop_owner_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Shop inquiries table checked/created.');

    // 10. Performance Indexes for 10k High Load
    await db.query(`CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile_number)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scans_user_id ON scans(user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_scans_scanned_at ON scans(scanned_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_shop_owner ON shop_products(shop_owner_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_shop_status ON shop_products(status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_shop_inquiries_owner ON shop_inquiries(shop_owner_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_expert_questions_user ON expert_questions(user_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_crop_diseases_name ON crop_diseases(crop_name)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_fertilizer_crop ON fertilizer_guide(crop_name)`);
    console.log('Performance indexes verified/created successfully.');

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

    // Seed Dynamic Alerts
    await db.query(`DELETE FROM alerts WHERE message LIKE '%2025%'`);
    const [existingAlerts] = await db.query('SELECT id FROM alerts LIMIT 1');
    if (existingAlerts.length === 0) {
      console.log('Seeding dynamic alerts...');
      await db.query(`
        INSERT INTO alerts (title, message, type, scheduled_at) VALUES
        ('Weather Alert 🌤️', 'Mild temperature with high humidity expected. Favorable conditions for healthy crop growth.', 'weather', NOW()),
        ('Disease Prevention Alert 🌾', 'High humidity conditions favor leaf spot and blight. Monitor your crops regularly.', 'disease', NOW()),
        ('Fertilizer Recommendation 🧪', 'Foliar application of NPK 19:19:19 recommended during active vegetative stage.', 'fertilizer', NOW()),
        ('Marketplace Alert 🛍️', 'New fungicides and organic pest repellents available at Krushi Agro Center!', 'shop', NOW())
      `);
      console.log('Seed alerts populated.');
    }

    // Seed Multiple Shop Owners and Products
    const [existingShopProducts] = await db.query('SELECT id FROM shop_products LIMIT 1');
    if (existingShopProducts.length === 0) {
      console.log('Seeding regional shop owners and products...');
      const shopOwnerPw = await bcrypt.hash('Shop@123', 10);

      // Shop 1: Sangamner Shop 1
      const [s1] = await db.query(`
        INSERT INTO users (full_name, mobile_number, email, password, is_verified, role, shop_name, shop_location)
        VALUES ('Vaibhav Patil', '9822012345', 'vaibhav@krushisathi.com', ?, true, 'shop_owner', 'Vaibhav Krushi Seva Kendra', 'Sangamner, Maharashtra')
        ON CONFLICT (mobile_number) DO UPDATE SET shop_name = 'Vaibhav Krushi Seva Kendra', shop_location = 'Sangamner, Maharashtra'
        RETURNING id
      `, [shopOwnerPw]);
      const shop1Id = s1[0]?.id || 1;

      // Shop 2: Sangamner Shop 2
      const [s2] = await db.query(`
        INSERT INTO users (full_name, mobile_number, email, password, is_verified, role, shop_name, shop_location)
        VALUES ('Sanjay Deshmukh', '9850123456', 'kisan@krushisathi.com', ?, true, 'shop_owner', 'Kisan Agro Center Sangamner', 'Sangamner, Maharashtra')
        ON CONFLICT (mobile_number) DO UPDATE SET shop_name = 'Kisan Agro Center Sangamner', shop_location = 'Sangamner, Maharashtra'
        RETURNING id
      `, [shopOwnerPw]);
      const shop2Id = s2[0]?.id || 2;

      // Shop 3: Pune Shop
      const [s3] = await db.query(`
        INSERT INTO users (full_name, mobile_number, email, password, is_verified, role, shop_name, shop_location)
        VALUES ('Mahesh Shinde', '9763112233', 'mauli@krushisathi.com', ?, true, 'shop_owner', 'Mauli Agro Center', 'Pune, Maharashtra')
        ON CONFLICT (mobile_number) DO UPDATE SET shop_name = 'Mauli Agro Center', shop_location = 'Pune, Maharashtra'
        RETURNING id
      `, [shopOwnerPw]);
      const shop3Id = s3[0]?.id || 3;

      // Shop 4: Nashik Shop
      const [s4] = await db.query(`
        INSERT INTO users (full_name, mobile_number, email, password, is_verified, role, shop_name, shop_location)
        VALUES ('Rajesh Jadhav', '9921445566', 'ganesh@krushisathi.com', ?, true, 'shop_owner', 'Shri Ganesh Fertilisers & Seeds', 'Nashik, Maharashtra')
        ON CONFLICT (mobile_number) DO UPDATE SET shop_name = 'Shri Ganesh Fertilisers & Seeds', shop_location = 'Nashik, Maharashtra'
        RETURNING id
      `, [shopOwnerPw]);
      const shop4Id = s4[0]?.id || 4;

      await db.query(`
        INSERT INTO shop_products (shop_owner_id, name, category, company, price, stock_quantity, unit, description, image_url, status) VALUES
        (?, 'Mancozeb 75% WP Fungicide', 'Pesticides', 'Tata Rallis', 350.00, 50, '500g', 'Broad spectrum protective fungicide for leaf spots and blight diseases.', NULL, 'Available'),
        (?, 'NPK 19:19:19 Water Soluble Fertilizer', 'Fertilizer', 'Mahadhan', 180.00, 100, '1kg', '100% water soluble NPK fertilizer for healthy plant vegetative growth.', NULL, 'Available'),
        (?, 'Imidacloprid 17.8% SL Insecticide', 'Pesticides', 'Bayer', 280.00, 40, '250ml', 'Systemic insecticide for whitefly, aphids, and thrips control.', NULL, 'Available'),
        (?, 'Neem Oil Pure Organic Spray', 'Organic', 'Organic India', 220.00, 60, '500ml', 'Natural organic pest repellent and fungicide safe for all crops.', NULL, 'Available'),
        (?, 'Copper Oxychloride 50% WP', 'Pesticides', 'Dhanuka', 420.00, 30, '500g', 'Effective copper fungicide for downy mildew and bacterial blight.', NULL, 'Available'),
        (?, 'Hybrid Tomato Seeds (Syngenta 3150)', 'Seeds', 'Syngenta', 650.00, 25, '10g', 'High yield disease-resistant tomato seeds suitable for rainy season.', NULL, 'Available'),
        (?, 'Zinc Sulphate 21% Micronutrient', 'Micronutrients', 'Mahadhan', 240.00, 80, '1kg', 'Corrects zinc deficiency in cotton, paddy, and wheat crop.', NULL, 'Available'),
        (?, 'Manual Crop Battery Knapsack Sprayer', 'Tools', 'Aspee', 2450.00, 10, '16L', '16-liter heavy duty rechargeable battery sprayer pump.', NULL, 'Available')
      `, [shop1Id, shop1Id, shop2Id, shop2Id, shop3Id, shop3Id, shop4Id, shop4Id]);
      console.log('Regional shop owners and products populated successfully.');
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
