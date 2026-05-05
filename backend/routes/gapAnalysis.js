const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { analyzeGap } = require('../services/gapAnalyzerService');
const { COMPETITOR_DOMAINS } = require('../services/analyzer');

const CLOUDFUZE_DOMAIN = 'cloudfuze.com';

const gapLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Gap analysis rate limit reached. Please wait a minute.' }
});

function isAllowedUrl(url, allowedDomain) {
  try {
    const { hostname } = new URL(url);
    const normalized = hostname.replace(/^www\./, '');
    return normalized === allowedDomain || normalized.endsWith(`.${allowedDomain}`);
  } catch {
    return false;
  }
}

router.post('/gap-analysis', gapLimiter, async (req, res, next) => {
  try {
    const { prompt, competitorName, competitorUrl, cloudfuzeUrl } = req.body;

    if (!prompt || !competitorName || !competitorUrl) {
      return res.status(400).json({ error: '"prompt", "competitorName", and "competitorUrl" are required.' });
    }

    if (typeof prompt !== 'string' || prompt.trim().length < 5) {
      return res.status(400).json({ error: 'Invalid prompt.' });
    }

    const allowedDomain = COMPETITOR_DOMAINS[competitorName];
    if (!allowedDomain) {
      return res.status(400).json({ error: `Unknown competitor: ${competitorName}` });
    }

    if (!isAllowedUrl(competitorUrl, allowedDomain)) {
      return res.status(400).json({ error: `competitorUrl must be from ${allowedDomain}` });
    }

    if (cloudfuzeUrl && !isAllowedUrl(cloudfuzeUrl, CLOUDFUZE_DOMAIN)) {
      return res.status(400).json({ error: `cloudfuzeUrl must be from ${CLOUDFUZE_DOMAIN}` });
    }

    const result = await analyzeGap({
      prompt: prompt.trim(),
      competitorName,
      competitorUrl,
      cloudfuzeUrl: cloudfuzeUrl || null
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
