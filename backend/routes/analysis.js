const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { generatePrompts } = require('../services/promptGenerator');
const { queryOpenAI } = require('../services/openaiService');
const { queryGemini } = require('../services/geminiService');
const { analyzeResponse } = require('../services/analyzer');

// Process an array with at most `limit` concurrent async operations.
async function mapConcurrent(arr, fn, limit = 3) {
  const results = new Array(arr.length);
  const queue = arr.map((item, i) => ({ item, i }));
  async function worker() {
    while (queue.length > 0) {
      const { item, i } = queue.shift();
      results[i] = await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, arr.length) }, worker));
  return results;
}

const analyzeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Analysis rate limit reached. Please wait a minute.' }
});

router.post('/analyze', analyzeLimiter, async (req, res, next) => {
  try {
    const { keywords } = req.body;

    if (!keywords || typeof keywords !== 'string') {
      return res.status(400).json({ error: '"keywords" must be a non-empty string.' });
    }
    const trimmed = keywords.trim();
    if (trimmed.length < 2 || trimmed.length > 300) {
      return res.status(400).json({ error: '"keywords" must be between 2 and 300 characters.' });
    }

    const prompts = await generatePrompts(trimmed);

    const results = await mapConcurrent(
      prompts,
      async (prompt) => {
        const [openaiRaw, geminiRaw] = await Promise.allSettled([
          queryOpenAI(prompt),
          queryGemini(prompt)
        ]);

        const openaiText = openaiRaw.status === 'fulfilled'
          ? openaiRaw.value.text
          : `[OpenAI Error: ${openaiRaw.reason?.message || 'Unknown error'}]`;
        const openaiCitations = openaiRaw.status === 'fulfilled'
          ? openaiRaw.value.citations
          : [];

        const geminiText = geminiRaw.status === 'fulfilled'
          ? geminiRaw.value.text
          : `[Gemini Error: ${geminiRaw.reason?.message || 'Unknown error'}]`;
        const geminiCitations = geminiRaw.status === 'fulfilled'
          ? geminiRaw.value.citations
          : [];

        return {
          prompt,
          openai: {
            response: openaiText,
            citations: openaiCitations,
            analysis: analyzeResponse(openaiText, openaiCitations)
          },
          gemini: {
            response: geminiText,
            citations: geminiCitations,
            analysis: analyzeResponse(geminiText, geminiCitations)
          }
        };
      },
      3  // max 3 concurrent Gemini calls
    );

    res.json({ keywords: trimmed, results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
