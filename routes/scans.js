const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer storage setup for scan images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/scans');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `scan-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    return cb(null, true);
  },
});

// Simulated AI disease detection (replace with real ML model call)
const simulateAIDetection = (imagePath) => {
  const diseases = [
    { disease_name: 'Early Blight', crop_name: 'Tomato', severity: 'Medium Risk', confidence: 87.5, description: 'Early blight is a common fungal disease of tomatoes caused by Alternaria solani.', treatment: 'Apply copper-based fungicide every 7-10 days. Remove infected leaves immediately.', fertilizer: 'Reduce nitrogen, increase potassium and phosphorus.' },
    { disease_name: 'Rust Disease', crop_name: 'Wheat', severity: 'High Risk', confidence: 92.3, description: 'Wheat rust is caused by Puccinia species and spreads rapidly in humid conditions.', treatment: 'Apply triazole fungicides immediately. Remove infected plants.', fertilizer: 'Apply balanced NPK fertilizer. Avoid excessive nitrogen.' },
    { disease_name: 'Healthy Plant', crop_name: 'General', severity: 'Low Risk', confidence: 95.0, description: 'No disease detected. Your crop appears healthy!', treatment: 'Continue regular care and monitoring.', fertilizer: 'Maintain current fertilization schedule.' },
    { disease_name: 'Leaf Curl Virus', crop_name: 'Cotton', severity: 'High Risk', confidence: 88.9, description: 'Cotton leaf curl disease is caused by a begomovirus transmitted by whiteflies.', treatment: 'Remove and destroy infected plants. Control whitefly population with insecticides.', fertilizer: 'Apply potassium-rich fertilizer to boost plant immunity.' },
  ];
  return diseases[Math.floor(Math.random() * diseases.length)];
};

// ─── CREATE SCAN ──────────────────────────────────────────────────────────────
// POST /api/scans  (protected)
router.post('/', authMiddleware, upload.single('crop_image'), async (req, res) => {
  try {
    const { crop_name } = req.body;
    const userId = req.user.userId;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Crop image is required' });
    }

    const imageUrl = `/uploads/scans/${req.file.filename}`;

    // Simulate AI detection
    const aiResult = simulateAIDetection(req.file.path);

    const [result] = await db.query(
      `INSERT INTO scans (user_id, crop_name, disease_name, disease_description, severity, image_url, treatment_advice, fertilizer_advice, confidence_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        crop_name || aiResult.crop_name,
        aiResult.disease_name,
        aiResult.description,
        aiResult.severity,
        imageUrl,
        aiResult.treatment,
        aiResult.fertilizer,
        aiResult.confidence,
      ]
    );

    const [scan] = await db.query('SELECT * FROM scans WHERE id = ?', [result.insertId]);

    res.status(201).json({
      success: true,
      message: 'Scan completed successfully',
      scan: scan[0],
    });
  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ success: false, message: err.message || 'Server error' });
  }
});

// ─── GET USER SCANS ───────────────────────────────────────────────────────────
// GET /api/scans  (protected)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const [scans] = await db.query(
      'SELECT * FROM scans WHERE user_id = ? ORDER BY scanned_at DESC LIMIT ? OFFSET ?',
      [userId, limit, offset]
    );

    const [total] = await db.query('SELECT COUNT(*) as count FROM scans WHERE user_id = ?', [userId]);

    res.json({
      success: true,
      scans,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(total[0].count / limit),
        total_scans: total[0].count,
        per_page: limit,
      },
    });
  } catch (err) {
    console.error('Get scans error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET SINGLE SCAN ─────────────────────────────────────────────────────────
// GET /api/scans/:id  (protected)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [scans] = await db.query(
      'SELECT * FROM scans WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );

    if (scans.length === 0) {
      return res.status(404).json({ success: false, message: 'Scan not found' });
    }

    res.json({ success: true, scan: scans[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── DELETE SCAN ─────────────────────────────────────────────────────────────
// DELETE /api/scans/:id  (protected)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const [scans] = await db.query(
      'SELECT * FROM scans WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );

    if (scans.length === 0) {
      return res.status(404).json({ success: false, message: 'Scan not found' });
    }

    // Delete image file
    const filePath = path.join(__dirname, '..', scans[0].image_url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await db.query('DELETE FROM scans WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: 'Scan deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
