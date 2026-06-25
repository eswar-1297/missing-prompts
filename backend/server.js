require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const analysisRouter = require('./routes/analysis');
const gapAnalysisRouter = require('./routes/gapAnalysis');

// Fail loudly at boot if API keys are missing. The .env file is gitignored, so a fresh
// deployment that doesn't set these in its environment will otherwise only surface as
// confusing "API key not valid" errors at request time.
const missingKeys = ['GEMINI_API_KEY', 'OPENAI_API_KEY'].filter(k => !process.env[k]);
if (missingKeys.length > 0) {
  console.error(`[CONFIG] Missing required env var(s): ${missingKeys.join(', ')}. ` +
    `Set them in this environment (e.g. host config / .env) — they are NOT in the repo.`);
}

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);
app.use(helmet());

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait before trying again.' }
});
app.use('/api', limiter);

app.use('/api', analysisRouter);
app.use('/api', gapAnalysisRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
