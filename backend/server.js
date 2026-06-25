require('dotenv').config();
const path = require('path');
const fs = require('fs');
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
// Log key shape (not the secret) so deployment logs reveal a malformed value at a glance.
// A Gemini key should be length=39, prefix=AIza, hasWhitespace=false.
for (const k of ['GEMINI_API_KEY', 'OPENAI_API_KEY']) {
  const v = process.env[k] || '';
  if (v) {
    console.log(`[CONFIG] ${k}: length=${v.length}, prefix=${v.slice(0, 4)}, hasWhitespace=${/\s/.test(v)}`);
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);
// CSP disabled because this server also serves the bundled React app (CRA inlines a small
// runtime script that a default CSP would block). Safe for this internal tool.
app.use(helmet({ contentSecurityPolicy: false }));

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

// Serve the bundled React production build (single-service deploy). When the build exists,
// static assets are served and any non-API GET falls back to index.html for the SPA. Guarded
// by existsSync so local dev (where the frontend runs separately on :3001) is unaffected.
const buildDir = path.join(__dirname, '..', 'frontend', 'build');
if (fs.existsSync(buildDir)) {
  app.use(express.static(buildDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/health') return next();
    res.sendFile(path.join(buildDir, 'index.html'));
  });
}

app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
