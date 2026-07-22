-- Krushi Sathi AI Database Schema
-- Run this SQL in MySQL to create the database and tables

CREATE DATABASE IF NOT EXISTS royal_shetkari;
USE royal_shetkari;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  mobile_number VARCHAR(15) NOT NULL UNIQUE,
  email VARCHAR(100),
  password VARCHAR(255) NOT NULL,
  otp VARCHAR(6),
  otp_expires_at DATETIME,
  is_verified BOOLEAN DEFAULT FALSE,
  profile_image VARCHAR(255),
  location VARCHAR(150),
  farm_size VARCHAR(50),
  main_crop VARCHAR(100),
  soil_type VARCHAR(100),
  sowing_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Scans Table
CREATE TABLE IF NOT EXISTS scans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  crop_name VARCHAR(100),
  disease_name VARCHAR(150),
  disease_description TEXT,
  severity ENUM('Low Risk', 'Medium Risk', 'High Risk') DEFAULT 'Low Risk',
  image_url VARCHAR(255),
  treatment_advice TEXT,
  fertilizer_advice TEXT,
  confidence_score DECIMAL(5,2),
  scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Weather Table (local weather data cache)
CREATE TABLE IF NOT EXISTS weather_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  location VARCHAR(100),
  temperature DECIMAL(5,2),
  humidity DECIMAL(5,2),
  condition_text VARCHAR(100),
  wind_speed DECIMAL(5,2),
  rain_chance INT DEFAULT 0,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crop Diseases Reference Table
CREATE TABLE IF NOT EXISTS crop_diseases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  crop_name VARCHAR(100) NOT NULL,
  disease_name VARCHAR(150) NOT NULL,
  symptoms TEXT,
  treatment TEXT,
  prevention TEXT,
  image_url VARCHAR(255),
  severity_level ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alerts Table
CREATE TABLE IF NOT EXISTS alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('disease', 'weather', 'general', 'fertilizer', 'spray', 'reminder') DEFAULT 'general',
  is_read BOOLEAN DEFAULT FALSE,
  scheduled_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Fertilizer Guide Table
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
);

-- Expert Questions Table
CREATE TABLE IF NOT EXISTS expert_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  answered_by VARCHAR(100),
  answered_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── SEED DATA ───────────────────────────────────────────────────────────────

-- Crop Diseases
INSERT INTO crop_diseases (crop_name, disease_name, symptoms, treatment, prevention, severity_level) VALUES
('Tomato', 'Early Blight', 'Dark brown spots with yellow rings on lower leaves', 'Apply copper-based fungicide every 7-10 days', 'Rotate crops, remove infected leaves, ensure good air circulation', 'Medium'),
('Tomato', 'Late Blight', 'Water-soaked spots on leaves that turn brown; white mold underneath', 'Apply mancozeb fungicide immediately; remove affected parts', 'Avoid overhead watering, plant resistant varieties', 'High'),
('Wheat', 'Rust Disease', 'Orange-red pustules on leaves and stems', 'Use triazole fungicides, remove infected plants', 'Use resistant varieties, timely sowing, balanced fertilization', 'High'),
('Rice', 'Blast Disease', 'Diamond-shaped gray lesions on leaves', 'Apply tricyclazole fungicide', 'Avoid excessive nitrogen, use resistant varieties', 'High'),
('Cotton', 'Leaf Curl Virus', 'Upward curling of leaves, thickened veins', 'Remove and destroy infected plants', 'Control whitefly population, use virus-resistant varieties', 'High'),
('Maize', 'Gray Leaf Spot', 'Rectangular gray-brown lesions parallel to leaf veins', 'Apply strobilurin fungicides', 'Crop rotation, remove crop debris', 'Medium'),
('Potato', 'Late Blight', 'Dark green to brown water-soaked lesions on leaves', 'Spray metalaxyl + mancozeb', 'Use certified seed, proper spacing', 'High'),
('Chili', 'Leaf Curl', 'Curling and puckering of leaves, stunted growth', 'Apply imidacloprid for whitefly control', 'Use virus-free seedlings, yellow sticky traps', 'Medium'),
('Grapes', 'Downy Mildew', 'Yellow spots on upper surface, white fungal growth below', 'Apply bordeaux mixture or metalaxyl', 'Prune for air circulation, avoid wet foliage', 'High');

-- Fertilizer Guide
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
('Grapes', 'Sandy Loam', 'Calcium Nitrate', 'Micronutrient', '10 kg per acre', 'Berry Development', 'Prevents fruit cracking.');

-- Alerts
INSERT INTO alerts (title, message, type, scheduled_at) VALUES
('Spray Reminder', 'Time to spray for Early Blight\nTomorrow, 7:00 AM', 'spray', DATE_ADD(NOW(), INTERVAL 1 DAY)),
('Irrigation Reminder', 'Irrigate your field\nToday, 6:00 PM', 'reminder', NOW()),
('Fertilizer Reminder', 'Apply NPK 19:19:19\n25 May 2025', 'fertilizer', NOW()),
('Weather Alert', 'Rain expected in 2 days\n22 May 2025', 'weather', DATE_ADD(NOW(), INTERVAL 2 DAY)),
('Pest Alert', 'Aphids activity high\n23 May 2025', 'disease', NOW()),
('Disease Alert: Tomato Blight Detected', 'High humidity conditions favor Early Blight development. Check your tomato crops.', 'disease', NOW()),
('Weather Alert: Heavy Rain Expected', 'Heavy rainfall predicted in next 48 hours. Ensure proper drainage in fields.', 'weather', NOW());

-- Expert Questions seed data
INSERT INTO expert_questions (user_id, question, answer, answered_by, answered_at) VALUES
(1, 'How to control Tomato early blight?', 'Apply copper-based fungicide every 7-10 days. Remove infected leaves and improve air circulation.', 'Dr. Patil', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(1, 'Which fertilizer is best for chili?', 'NPK 19:19:19 during vegetative stage, switch to 0:52:34 during flowering for better yield.', 'Dr. Patil', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(1, 'Leaves turning yellow in cotton?', 'Could be nitrogen deficiency or magnesium deficiency. Get soil test done and apply urea at 25kg/acre.', 'Dr. Patil', DATE_SUB(NOW(), INTERVAL 2 DAY));
