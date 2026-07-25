const express = require('express');
const router = express.Router();
const db = require('../db');

// ─── GET FERTILIZER RECOMMENDATIONS ──────────────────────────────────────────
// GET /api/fertilizers?crop=Tomato&soil_type=Black Soil
router.get('/', async (req, res) => {
  try {
    const { crop, soil_type } = req.query;
    let query = 'SELECT * FROM fertilizer_guide WHERE 1=1';
    const params = [];

    if (crop) {
      query += ' AND crop_name LIKE ?';
      params.push(`%${crop}%`);
    }
    if (soil_type) {
      query += ' AND soil_type LIKE ?';
      params.push(`%${soil_type}%`);
    }

    query += ' ORDER BY crop_name ASC';

    const [fertilizers] = await db.query(query, params);
    res.json({ success: true, fertilizers });
  } catch (err) {
    console.error('Fertilizer error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch fertilizer data' });
  }
});

// ─── GET FERTILIZER BY ID ────────────────────────────────────────────────────
// GET /api/fertilizers/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM fertilizer_guide WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Fertilizer guide not found' });
    }
    res.json({ success: true, fertilizer: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET CROP NAMES (for dropdown) ───────────────────────────────────────────
// GET /api/fertilizers/meta/crops
router.get('/meta/crops', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT DISTINCT crop_name FROM fertilizer_guide ORDER BY crop_name ASC');
    res.json({ success: true, crops: rows.map(r => r.crop_name) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET SOIL TYPES (for dropdown) ───────────────────────────────────────────
// GET /api/fertilizers/meta/soils
router.get('/meta/soils', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT DISTINCT soil_type FROM fertilizer_guide WHERE soil_type IS NOT NULL AND soil_type != "" ORDER BY soil_type ASC');
    res.json({ success: true, soils: rows.map(r => r.soil_type) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
