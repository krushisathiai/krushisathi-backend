const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

// ─── CHECK STATUS ─────────────────────────────────────────────────────────────
// GET /api/urea/status
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [rows] = await db.query(
      'SELECT id, full_name, mobile_number, location, quantity, note, status, created_at FROM urea_requests WHERE user_id = ?',
      [userId]
    );

    if (rows.length > 0) {
      return res.json({
        success: true,
        requested: true,
        data: rows[0]
      });
    }

    return res.json({
      success: true,
      requested: false
    });
  } catch (err) {
    console.error('Check urea status error:', err);
    res.status(500).json({ success: false, message: 'Server error check. Please try again.' });
  }
});

// ─── SUBMIT REQUEST ───────────────────────────────────────────────────────────
// POST /api/urea/request
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { full_name, mobile_number, location, quantity, note } = req.body;

    // Validate inputs
    if (!full_name || !mobile_number || !location || !quantity) {
      return res.status(400).json({ success: false, message: 'Name, mobile number, location, and quantity are required.' });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1 || qty > 3) {
      return res.status(400).json({ success: false, message: 'You can request between 1 and 3 bags only.' });
    }

    // Check if request already exists
    const [existing] = await db.query(
      'SELECT id FROM urea_requests WHERE user_id = ?',
      [userId]
    );

    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'You have already submitted a Urea request.' });
    }

    // Insert request
    await db.query(
      'INSERT INTO urea_requests (user_id, full_name, mobile_number, location, quantity, note) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, full_name, mobile_number, location, qty, note || null]
    );

    res.status(201).json({
      success: true,
      message: 'Urea request submitted successfully!'
    });
  } catch (err) {
    console.error('Submit urea request error:', err);
    res.status(500).json({ success: false, message: 'Server error submit. Please try again.' });
  }
});

module.exports = router;
