const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');

// ─── SUBMIT QUESTION ─────────────────────────────────────────────────────────
// POST /api/expert (protected)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { question, language = 'en' } = req.body;
    const userId = req.user.userId;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Please enter your question' });
    }

    const [result] = await db.query(
      'INSERT INTO expert_questions (user_id, question) VALUES (?, ?)',
      [userId, question.trim()]
    );

    let answer = 'We could not fetch expert advice at this moment. Please try again later.';
    let answeredBy = 'System Error';

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        let langInstruction = 'English';
        if (language === 'mr') langInstruction = 'Marathi';
        if (language === 'hi') langInstruction = 'Hindi';

        const prompt = `
          You are an expert agricultural consultant named Dr. Patil.
          A farmer has asked you the following question: "${question.trim()}"
          Provide a concise, highly practical, and actionable answer (under 5 sentences).
          Your response MUST be entirely in ${langInstruction} language.
        `;

        const aiResult = await model.generateContent(prompt);
        answer = aiResult.response.text().trim();
        answeredBy = 'Dr. Patil (AI Expert)';
      } else {
        // Fallback if no API key
        answer = 'API key missing. Cannot provide AI advice.';
        answeredBy = 'System';
      }
    } catch (e) {
      console.error('Expert Gemini Error:', e);
    }

    await db.query(
      'UPDATE expert_questions SET answer = ?, answered_by = ?, answered_at = NOW() WHERE id = ?',
      [answer, answeredBy, result.insertId]
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
