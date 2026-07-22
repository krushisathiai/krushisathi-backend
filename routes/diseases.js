const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

// ─── GET ALL DISEASES ─────────────────────────────────────────────────────────
// GET /api/diseases
router.get('/', async (req, res) => {
  try {
    const { crop, severity, search } = req.query;
    let query = 'SELECT * FROM crop_diseases WHERE 1=1';
    const params = [];

    if (crop) {
      query += ' AND crop_name LIKE ?';
      params.push(`%${crop}%`);
    }
    if (severity) {
      query += ' AND severity_level = ?';
      params.push(severity);
    }
    if (search) {
      query += ' AND (crop_name LIKE ? OR disease_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY crop_name ASC';

    const [diseases] = await db.query(query, params);
    res.json({ success: true, diseases });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET SINGLE DISEASE ───────────────────────────────────────────────────────
// GET /api/diseases/:id
router.get('/:id', async (req, res) => {
  try {
    const [diseases] = await db.query('SELECT * FROM crop_diseases WHERE id = ?', [req.params.id]);
    if (diseases.length === 0) {
      return res.status(404).json({ success: false, message: 'Disease not found' });
    }
    res.json({ success: true, disease: diseases[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
