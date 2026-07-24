require('dotenv').config({ path: './.env' });
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

async function testGemini() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    // Dummy 1x1 png image
    const dummyImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
    
    const prompt = `Analyze this image.`;

    const imagePart = {
      inlineData: {
        data: dummyImageBase64,
        mimeType: "image/png"
      }
    };

    const aiResult = await model.generateContent([prompt, imagePart]);
    console.log("Success:\n", aiResult.response.text());
  } catch (e) {
    console.error("CAUGHT ERROR:", e.message);
  }
}

testGemini();
