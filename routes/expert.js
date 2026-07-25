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

    let answer = '';
    let answeredBy = 'Dr. Patil (Agri Specialist)';

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);

        let langInstruction = 'English';
        if (language === 'mr') langInstruction = 'Marathi';
        if (language === 'hi') langInstruction = 'Hindi';

        const prompt = `
          You are Dr. Patil, a senior agricultural scientist and farming consultant. 
          Respond strictly in ${langInstruction}. 
          Answer the user's agricultural question with highly practical, step-by-step advice.
          IMPORTANT FORMATTING RULES:
          1. If suggesting treatments, MUST include specific product/chemical names (pesticides, fungicides, fertilizers).
          2. MUST include exact dosage (e.g. 2 ml per liter of water, 50 kg per acre).
          3. Use clear bullet points and bold product names using **Product Name**.
          
          User Question: ${question}
        `;

        const modelsToTry = ["gemini-1.5-flash", "gemini-2.0-flash-exp", "gemini-1.5-pro", "gemini-flash-latest"];
        let lastErr = null;

        for (const modelName of modelsToTry) {
          try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const aiResult = await model.generateContent(prompt);
            answer = aiResult.response.text().trim();
            if (answer && answer.length > 20) {
              break;
            }
          } catch (modelErr) {
            console.warn(`Model ${modelName} expert query failed:`, modelErr.message);
            lastErr = modelErr;
          }
        }
      }
    } catch (e) {
      console.error('Expert Gemini Error:', e);
    }

    // Localized fallback response if AI service is temporarily unavailable
    if (!answer || answer.trim().length === 0) {
      if (language === 'mr') {
        answer = `**कृषी सल्लागार मार्गदर्शन (Dr. Patil):**\n` +
                 `• **पिकाची तपासणी:** आपल्या पिकावर दिसणारी लक्षणे तपासून योग्य **बुरशीनाशक (Fungicide)** किंवा **कीटकनाशक (Insecticide)** ची फवारणी करा.\n` +
                 `• **शिफारस डोस:** २ मि.ली. प्रति लिटर पाण्यात **Mancozeb 75% WP** किंवा **Imidacloprid 17.8% SL** मिसळून सकाळी सलग फवारणी करा.\n` +
                 `• **खत व्यवस्थापन:** नत्र आणि स्फुरदच्या योग्य प्रमाणासाठी **NPK 19:19:19** विद्राव्य खत १ किलो प्रति एकर वापरा.\n` +
                 `• **विशेष टीप:** अधिक माहितीसाठी जवळच्या कृषी सेवा केंद्राशी थेट संपर्क साधा.`;
      } else if (language === 'hi') {
        answer = `**कृषि विशेषज्ञ सलाह (Dr. Patil):**\n` +
                 `• **फसल निरीक्षण:** फसल के लक्षणों की जांच करें और उचित **कवकनाशी (Fungicide)** या **कीटनाशक (Insecticide)** का छिड़काव करें।\n` +
                 `• **अनुशंसित खुराक:** २ मिली प्रति लीटर पानी में **Mancozeb 75% WP** या **Imidacloprid 17.8% SL** मिलाकर सुबह छिड़काव करें।\n` +
                 `• **उर्वरक प्रबंधन:** **NPK 19:19:19** घुलनशील खाद १ किलोग्राम प्रति एकड़ उपयोग करें।\n` +
                 `• **विशेष सलाह:** अधिक सहायता के लिए अपने निकटतम कृषि केंद्र से संपर्क करें।`;
      } else {
        answer = `**Agricultural Specialist Advice (Dr. Patil):**\n` +
                 `• **Inspection:** Inspect affected leaves and apply protective **Fungicide** or **Insecticide** spray.\n` +
                 `• **Recommended Dosage:** Mix 2 ml per liter of water using **Mancozeb 75% WP** or **Imidacloprid 17.8% SL** for early morning foliar spray.\n` +
                 `• **Nutrition:** Apply water-soluble **NPK 19:19:19** at 1 kg per acre for rapid vegetative recovery.\n` +
                 `• **Expert Support:** Visit your nearest Krushi Sathi Partner Shop for authentic products.`;
      }
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
