const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 3000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function is429(err) {
  return (
    err?.status === 429 ||
    err?.message?.includes('429') ||
    err?.message?.includes('Resource exhausted') ||
    err?.message?.includes('RESOURCE_EXHAUSTED')
  );
}

async function queryGemini(prompt) {
  let lastErr;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 3s, 6s, 12s, 24s
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));
    }

    try {
      return await callGemini(prompt);
    } catch (err) {
      lastErr = err;
      if (!is429(err) || attempt === MAX_RETRIES) throw err;
      console.warn(`[Gemini] 429 on attempt ${attempt + 1}, retrying after backoff...`);
    }
  }

  throw lastErr;
}

async function callGemini(prompt) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [{ googleSearch: {} }]
  });

  const result = await model.generateContent(prompt);
  const text = result.response?.text();
  if (!text) throw new Error('Empty response from Gemini');

  const citations = [];
  const chunks = result.response?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  for (const chunk of chunks) {
    if (chunk.web?.uri) {
      citations.push({ url: chunk.web.uri, title: chunk.web.title || chunk.web.uri });
    }
  }

  return { text, citations };
}

module.exports = { queryGemini };
