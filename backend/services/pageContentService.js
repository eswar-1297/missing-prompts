const https = require('https');
const http = require('http');
const { URL } = require('url');

const MAX_CONTENT_CHARS = 8000;
const FETCH_TIMEOUT_MS = 12000;
const MAX_RAW_BYTES = 300000;
const MAX_REDIRECTS = 3;

function fetchPageContent(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return reject(new Error(`Invalid URL: ${url}`));
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return reject(new Error(`Unsupported protocol: ${parsed.protocol}`));
    }

    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CloudFuzeAnalyzer/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: FETCH_TIMEOUT_MS
    };

    const req = lib.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectCount >= MAX_REDIRECTS) {
          return reject(new Error(`Too many redirects for ${url}`));
        }
        const redirectUrl = new URL(res.headers.location, url).href;
        return fetchPageContent(redirectUrl, redirectCount + 1).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }

      let raw = '';
      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        raw += chunk;
        if (raw.length > MAX_RAW_BYTES) {
          req.destroy();
        }
      });

      res.on('end', () => {
        const text = extractStructuredText(raw);
        resolve({ url, text });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });

    req.on('error', reject);
    req.end();
  });
}

function extractStructuredText(html) {
  // Pull headings first — they reveal page structure and topics
  const headings = [];
  const headingRe = /<h([1-4])[^>]*>([\s\S]*?)<\/h[1-4]>/gi;
  let m;
  while ((m = headingRe.exec(html)) !== null) {
    const txt = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (txt.length > 2 && txt.length < 200) headings.push(`H${m[1]}: ${txt}`);
  }

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  const headingBlock = headings.length > 0
    ? `=== PAGE HEADINGS ===\n${headings.slice(0, 40).join('\n')}\n\n=== PAGE BODY ===\n`
    : '';

  return (headingBlock + body).slice(0, MAX_CONTENT_CHARS);
}

module.exports = { fetchPageContent };
