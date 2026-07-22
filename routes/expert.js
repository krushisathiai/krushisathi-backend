const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

// ─── SUBMIT QUESTION ─────────────────────────────────────────────────────────
// POST /api/expert (protected)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { question } = req.body;
    const userId = req.user.userId;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Please enter your question' });
    }

    const [result] = await db.query(
      'INSERT INTO expert_questions (user_id, question) VALUES (?, ?)',
      [userId, question.trim()]
    );

    // Auto-generate a mock answer (replace with real expert system in production)
    const mockAnswers = [
      'Apply neem oil spray early morning for best results. Repeat every 7 days.',
      'Use balanced NPK fertilizer (19:19:19) at 1kg per acre during vegetative stage.',
      'Ensure proper drainage and avoid overwatering. Fungal infections thrive in wet conditions.',
      'Contact your local Krishi Vigyan Kendra for soil testing and personalized advice.',
      'Rotate crops every season to prevent soil-borne diseases and maintain soil health.',
    ];
    const answer = mockAnswers[Math.floor(Math.random() * mockAnswers.length)];

    await db.query(
      'UPDATE expert_questions SET answer = ?, answered_by = ?, answered_at = NOW() WHERE id = ?',
      [answer, 'Dr. Patil', result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Question submitted successfully! Expert will respond shortly.',
    });
  } catch (err) {
    console.error('Expert question error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to submit question' });
  }
});

// ─── GET RECENT ANSWERS ──────────────────────────────────────────────────────
// GET /api/expert
router.get('/', async (req, res) => {
  try {
    const [questions] = await db.query(
      'SELECT * FROM expert_questions WHERE answer IS NOT NULL ORDER BY answered_at DESC LIMIT 20'
    );
    res.json({ success: true, questions });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load expert answers' });
  }
});

// ─── GET USER'S QUESTIONS ────────────────────────────────────────────────────
// GET /api/expert/my (protected)
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const [questions] = await db.query(
      'SELECT * FROM expert_questions WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.userId]
    );
    res.json({ success: true, questions });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
