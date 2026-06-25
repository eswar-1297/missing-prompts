const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 3000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Transient failures worth retrying. Beyond plain rate-limits (429), Gemini's grounded
// search endpoint intermittently returns a 400 API_KEY_INVALID under burst load even when
// the key is valid — retrying clears it. Also covers 5xx server errors and network blips.
// A genuinely invalid key still fails every attempt, so it surfaces after the retries.
function isTransientError(err) {
  const msg = err?.message || '';
  const status = err?.status;
  return (
    status === 429 || /\b429\b|RESOURCE_EXHAUSTED|Resource exhausted/i.test(msg) ||
    /API_KEY_INVALID|API key not valid/i.test(msg) ||
    (typeof status === 'number' && status >= 500) ||
    /\b5\d\d\b|INTERNAL|UNAVAILABLE|overloaded|deadline/i.test(msg) ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|fetch failed/i.test(msg)
  );
}

// Runs an async Gemini call with exponential backoff (3s, 6s, 12s, 24s) on transient errors.
// Shared by the main analysis and the gap-analysis agent's grounded searches.
async function withGeminiRetry(fn, label = 'Gemini') {
  let lastErr;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));
    }

    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const giveUp = !isTransientError(err) || attempt === MAX_RETRIES;
      if (giveUp) {
        // Log the FULL error (status + message) so deployment issues are diagnosable.
        console.error(`[${label}] giving up after ${attempt + 1} attempt(s). status=${err?.status ?? 'n/a'} message=${err?.message || err}`);
        throw err;
      }
      console.warn(`[${label}] transient error on attempt ${attempt + 1}: status=${err?.status ?? 'n/a'} ${(err?.message || '').slice(0, 200)} — retrying after backoff...`);
    }
  }

  throw lastErr;
}

async function queryGemini(prompt) {
  return withGeminiRetry(() => callGemini(prompt), 'Gemini');
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

module.exports = { queryGemini, withGeminiRetry, isTransientError };
