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

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Helper to convert local file to generative part
function fileToGenerativePart(filePath, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
      mimeType
    },
  };
}

// ─── CREATE SCAN ──────────────────────────────────────────────────────────────
// POST /api/scans  (protected)
router.post('/', authMiddleware, upload.single('crop_image'), async (req, res) => {
  try {
    const { crop_name, language = 'en' } = req.body;
    const userId = req.user.userId;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Crop image is required' });
    }

    const imageUrl = `/uploads/scans/${req.file.filename}`;
    let aiResult;

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing.");
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      let langInstruction = 'English';
      if (language === 'mr') langInstruction = 'Marathi';
      if (language === 'hi') langInstruction = 'Hindi';

      const prompt = `
        You are an expert agricultural botanist and plant pathologist. 
        Analyze this image of a plant/crop. 
        If it is NOT a plant or crop (e.g. a person, car, dog, object, keyboard, etc.), respond EXACTLY with ONLY:
        {"error": "Not a plant"}

        If it IS a plant, identify the crop name (e.g., Apple, Tomato, Wheat).
        Then detect any diseases or confirm if it is healthy.
        IMPORTANT: Your response must be in ${langInstruction} language (except for keys).
        Return ONLY a JSON object (without markdown code blocks) with the following exact keys:
        {
          "crop_name": "Name of the crop in ${langInstruction}",
          "disease_name": "Name of the disease (or 'Healthy Plant') in ${langInstruction}",
          "severity": "Low Risk, Medium Risk, or High Risk (Translate to ${langInstruction} if not English)",
          "confidence": 95.5,
          "description": "Detailed explanation of what you see and what the issue is in ${langInstruction}.",
          "treatment": "Actionable treatment advice or 'None needed' in ${langInstruction}.",
          "fertilizer": "Fertilizer recommendations in ${langInstruction}."
        }
      `;

      const imagePart = fileToGenerativePart(req.file.path, req.file.mimetype);
      const result = await model.generateContent([prompt, imagePart]);
      let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      // Extract just the JSON block in case Gemini adds conversational text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        text = jsonMatch[0];
      }
      const jsonResponse = JSON.parse(text);

      if (jsonResponse.error) {
        return res.status(400).json({ success: false, message: 'Uploaded image does not appear to be a crop or plant. Please upload a clear photo of the crop leaf.' });
      }

      aiResult = jsonResponse;
    } catch (e) {
      console.error("Gemini AI Error (falling back to mock):", e);
      // Fallback mock if API key is missing or quota exceeded
      aiResult = { 
        crop_name: 'Unknown Crop', 
        disease_name: 'Unknown Issue (AI Error)', 
        severity: 'Medium Risk', 
        confidence: 50.0, 
        description: 'We could not process this image through AI at the moment. ' + (e.message || ''), 
        treatment: 'Please consult a local expert.', 
        fertilizer: 'Maintain standard fertilization.' 
      };
    }

    const [result] = await db.query(
      `INSERT INTO scans (user_id, crop_name, disease_name, disease_description, severity, image_url, treatment_advice, fertilizer_advice, confidence_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        aiResult.crop_name,
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
