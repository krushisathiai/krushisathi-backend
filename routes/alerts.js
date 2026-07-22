const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

// ─── GET USER ALERTS ──────────────────────────────────────────────────────────
// GET /api/alerts  (protected)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [alerts] = await db.query(
      'SELECT * FROM alerts WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 20',
      [userId]
    );
    const [unread] = await db.query(
      'SELECT COUNT(*) as count FROM alerts WHERE (user_id = ? OR user_id IS NULL) AND is_read = FALSE',
      [userId]
    );

    res.json({ success: true, alerts, unread_count: unread[0].count });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── MARK ALERT AS READ ───────────────────────────────────────────────────────
// PUT /api/alerts/:id/read  (protected)
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    await db.query('UPDATE alerts SET is_read = TRUE WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Alert marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── MARK ALL AS READ ─────────────────────────────────────────────────────────
// PUT /api/alerts/read-all  (protected)
router.put('/read-all/mark', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    await db.query(
      'UPDATE alerts SET is_read = TRUE WHERE user_id = ? OR user_id IS NULL',
      [userId]
    );
    res.json({ success: true, message: 'All alerts marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
