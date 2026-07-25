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

// ─── CALCULATE CUSTOM FERTILIZER SCHEDULE (AI / CUSTOM CROP & AGE) ────────────
// POST /api/fertilizers/calculate
router.post('/calculate', async (req, res) => {
  try {
    const { crop_name, crop_days, soil_type = 'Black Soil', language = 'mr' } = req.body;

    if (!crop_name || crop_name.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Please enter or select crop name' });
    }

    const days = parseInt(crop_days) || 30;
    let adviceText = '';
    const apiKey = process.env.GEMINI_API_KEY;

    let langInstruction = 'Marathi (मराठी)';
    let scriptInstruction = 'strictly in Marathi using Devanagari script (मराठी देवनागरी लिपी)';
    if (language === 'hi') {
      langInstruction = 'Hindi (हिंदी)';
      scriptInstruction = 'strictly in Hindi using Devanagari script (हिंदी देवनागरी लिपि)';
    } else if (language === 'en') {
      langInstruction = 'English';
      scriptInstruction = 'strictly in clear, farmer-friendly English';
    }

    if (apiKey) {
      try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);

        const prompt = `
          You are an expert Indian agronomist and soil scientist at Krushi Sathi.
          A farmer has planted ${crop_name} which is currently ${days} days old in ${soil_type}.

          Provide a highly practical, stage-specific fertilizer application plan ${scriptInstruction}.

          CRITICAL RESPONSE RULES:
          1. **Crop Growth Stage**: State the stage for a ${days}-day-old ${crop_name} crop (e.g., Early Vegetative, Tillering, Flowering, Fruiting).
          2. **Recommended Fertilizers & NPK**: Name specific fertilizers (e.g., **Urea**, **DAP**, **NPK 19:19:19**, **Single Super Phosphate**, **Micronutrient Mix**).
          3. **Exact Dosage**: Specify exact dosage per acre (e.g., 50 kg/acre or 2 g/liter water).
          4. **Application Method**: Drip fertigation, soil broadcasting, or foliar spray.
          5. **Farmer Tips**: 2 practical irrigation or soil management tips.

          Format with clear bullet points (•) and bold product names using **Product Name**.
        `;

        const modelsToTry = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-pro"];
        for (const modelName of modelsToTry) {
          try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const aiResult = await model.generateContent(prompt);
            adviceText = aiResult.response.text().trim();
            if (adviceText && adviceText.length > 30) break;
          } catch (e) {
            console.warn(`Fertilizer AI model ${modelName} failed:`, e.message);
          }
        }
      } catch (e) {
        console.error('Fertilizer AI error:', e);
      }
    }

    // Localized fallback response if AI service is offline
    if (!adviceText || adviceText.length === 0) {
      if (language === 'mr') {
        adviceText = `**${crop_name} खत नियोजन (${days} दिवस पूर्ण):**\n` +
                     `• **पिकाची अवस्था:** शाकीय वाढीचा काळ (${days} दिवस).\n` +
                     `• **मुख्य खत डोस:** **NPK 19:19:19** विद्राव्य खत २ किलो प्रति एकर ठिबकद्वारे किंवा पाण्यात मिसळून द्या.\n` +
                     `• **सूक्ष्म अन्नद्रव्ये:** **Zinc Sulphate (झिंक सल्फेट)** ५०० ग्रॅम प्रति एकर फवारणी करा.\n` +
                     `• **सेंद्रिय पूरक खत:** **गांडूळ खत किंवा सेंद्रिय खत** ५० किलो प्रति एकर झाडाच्या मुळाशी द्या.\n` +
                     `• **महत्त्वाची टीप:** खत दिल्यानंतर पिकाला पुरेसे पाणी द्या आणि जमीन ओलसर ठेवा.`;
      } else if (language === 'hi') {
        adviceText = `**${crop_name} उर्वरक गाइड (${days} दिन):**\n` +
                     `• **फसल अवस्था:** वानस्पतिक वृद्धि अवस्था (${days} दिन)।\n` +
                     `• **मुख्य उर्वरक:** **NPK 19:19:19** २ किलो प्रति एकड़ ड्रिप या स्प्रे द्वारा दें।\n` +
                     `• **सूक्ष्म पोषक तत्व:** **Zinc Sulphate** ५०० ग्राम प्रति एकड़ छिड़काव करें।\n` +
                     `• **जैविक खाद:** **वर्मीकंपोस्ट** ५० किलो प्रति एकड़ जड़ों के पास दें।\n` +
                     `• **महत्वपूर्ण सलाह:** खाद देने के बाद हल्की सिंचाई अवश्य करें।`;
      } else {
        adviceText = `**${crop_name} Fertilizer Schedule (${days} Days Sown):**\n` +
                     `• **Crop Stage:** Vegetative Growth Stage (${days} Days Sown).\n` +
                     `• **Primary Nutrient:** Apply **NPK 19:19:19** at 2 kg per acre via drip or foliar spray.\n` +
                     `• **Micronutrients:** Spray **Zinc Sulphate** at 500g per acre.\n` +
                     `• **Organic Supplement:** Apply **Vermicompost** at 50 kg per acre near root zone.\n` +
                     `• **Key Tip:** Maintain good soil moisture during fertilizer application.`;
      }
    }

    res.json({
      success: true,
      crop_name,
      crop_days: days,
      soil_type,
      language,
      advice: adviceText,
    });
  } catch (err) {
    console.error('Fertilizer calculate error:', err);
    res.status(500).json({ success: false, message: 'Failed to calculate fertilizer guide' });
  }
});

module.exports = router;
