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
        let scriptInstruction = 'strictly in English';

        if (language === 'mr') {
          langInstruction = 'Marathi (मराठी)';
          scriptInstruction = 'strictly in Marathi using Devanagari script (मराठी देवनागरी लिपि). All explanations, steps, and advice MUST be written in clear Marathi.';
        } else if (language === 'hi') {
          langInstruction = 'Hindi (हिंदी)';
          scriptInstruction = 'strictly in Hindi using Devanagari script (हिंदी देवनागरी लिपि). All explanations, steps, and advice MUST be written in clear Hindi.';
        } else {
          langInstruction = 'English';
          scriptInstruction = 'strictly in clear, farmer-friendly English.';
        }

        const prompt = `
          You are Dr. Patil, a senior agricultural scientist and expert plant pathologist.
          Answer the user's agricultural question ${scriptInstruction}.

          CRITICAL RESPONSE RULES:
          1. HEADING: Start with a bold heading in ${langInstruction} (e.g., **कृषी सल्लागार मार्गदर्शन (Dr. Patil)** or **कृषि विशेषज्ञ सलाह (Dr. Patil)** or **Agricultural Specialist Advice (Dr. Patil)**).
          2. DIAGNOSIS: Explain the problem/cause in 1-2 clear lines.
          3. TREATMENT & DOSAGE: Provide specific, actionable remedies with exact chemical/product names and exact dosages (e.g. 2 ml per liter water or 50 kg per acre).
          4. FORMATTING: Use clean bullet points (•) and bold product/chemical names using **Product Name**.
          5. SCRIPT & LANGUAGE: Write strictly in ${langInstruction}. Do NOT output in English if Marathi or Hindi was selected!

          Farmer Question: "${question}"
        `;

        const modelsToTry = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-pro", "gemini-flash-latest"];
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
                 `• **शिफारस डोस:** २ मि.ली. प्रति लिटर पाण्यात **Mancozeb 75% WP** किंवा **Imidacloprid 17.8% SL** मिसळून सकाळी फवारणी करा.\n` +
                 `• **खत व्यवस्थापन:** पिकाच्या चांगल्या वाढीसाठी **NPK 19:19:19** विद्राव्य खत १ किलो प्रति एकर वापरा.\n` +
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

    let insertId;
    try {
      const [result] = await db.query(
        'INSERT INTO expert_questions (user_id, question, language) VALUES (?, ?, ?)',
        [userId, question.trim(), language]
      );
      insertId = result.insertId;
    } catch (dbErr) {
      const [result] = await db.query(
        'INSERT INTO expert_questions (user_id, question) VALUES (?, ?)',
        [userId, question.trim()]
      );
      insertId = result.insertId;
    }

    await db.query(
      'UPDATE expert_questions SET answer = ?, answered_by = ?, answered_at = NOW() WHERE id = ?',
      [answer, answeredBy, insertId]
    );

    res.status(201).json({
      success: true,
      message: language === 'mr' 
        ? 'तुमचा प्रश्न सबमिट झाला आहे! डॉ. पाटलांचे उत्तर खाली पहा.' 
        : (language === 'hi' ? 'आपका प्रश्न सबमिट हो गया है! डॉ. पाटिल का उत्तर नीचे देखें।' : 'Question submitted successfully! Check answer below.'),
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
