require('dotenv').config({ path: './.env' });
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `
        You are an expert agricultural botanist and plant pathologist. 
        Analyze this image of a plant/crop. 
        If it is NOT a plant or crop (e.g. a person, car, dog, object, keyboard, etc.), respond EXACTLY with ONLY:
        {"error": "Not a plant"}

        If it IS a plant, identify the crop name (e.g., Apple, Tomato, Wheat).
        Then detect any diseases or confirm if it is healthy.
        IMPORTANT: Your response must be in English language (except for keys).
        Return ONLY a JSON object (without markdown code blocks) with the following exact keys:
        {
          "crop_name": "Name of the crop in English",
          "disease_name": "Name of the disease (or 'Healthy Plant') in English",
          "severity": "Low Risk, Medium Risk, or High Risk (Translate to English if not English)",
          "confidence": 95.5,
          "description": "Detailed explanation of what you see and what the issue is in English.",
          "treatment": "Actionable treatment advice or 'None needed' in English.",
          "fertilizer": "Fertilizer recommendations in English."
        }
      `;

    // Without image, I will ask it to assume the image is a water bottle
    const aiResult = await model.generateContent([prompt, "Assume the image is a picture of a plastic water bottle."]);
    
    let text = aiResult.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    console.log("RAW TEXT:\n", text);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        text = jsonMatch[0];
    }
    const jsonResponse = JSON.parse(text);
    console.log("JSON PARSED:\n", jsonResponse);
  } catch (e) {
    console.error("CAUGHT ERROR:", e.message);
  }
}

testGemini();
