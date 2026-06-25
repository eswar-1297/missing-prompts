const https = require('https');
const http = require('http');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { fetchPageContent } = require('./pageContentService');
const { withGeminiRetry } = require('./geminiService');

// .trim() guards against a trailing newline/space from a dashboard paste breaking the key.
const openaiClient = new OpenAI({ apiKey: (process.env.OPENAI_API_KEY || '').trim() });
const genAI = new GoogleGenerativeAI((process.env.GEMINI_API_KEY || '').trim());

const CLOUDFUZE_FALLBACK_URL = 'https://www.cloudfuze.com/';

// Agent guard rails — bound cost/latency while leaving room to dig.
const MAX_ITERATIONS = 10;       // assistant turns (each may issue several tool calls)
const MAX_TOOL_CALLS = 14;       // hard cap on total tool executions
const MAX_TOOL_RESULT_CHARS = 6000; // trim each tool result to keep the context lean

// ---------------------------------------------------------------------------
// Public entry point — unchanged signature so the route/frontend stay the same.
// Runs an autonomous agent: GPT-4o is given research tools + a goal and decides
// for itself which to call, how deep to dig, and when it has enough proof to
// finish (by calling the terminal submit_analysis tool).
// ---------------------------------------------------------------------------
async function analyzeGap({ prompt, competitorName, competitorUrl, cloudfuzeUrl }) {
  const resolvedCfUrl = cloudfuzeUrl || CLOUDFUZE_FALLBACK_URL;
  const competitorDomain = safeDomain(competitorUrl);
  const cloudfuzeDomain = safeDomain(resolvedCfUrl);

  return await runGapAgent({
    prompt,
    competitorName,
    competitorDomain,
    competitorUrl,
    cloudfuzeDomain,
    cloudfuzeUrl: resolvedCfUrl
  });
}

// ---------------------------------------------------------------------------
// The agent loop
// ---------------------------------------------------------------------------
async function runGapAgent(ctx) {
  const { prompt, competitorName, competitorDomain, cloudfuzeDomain } = ctx;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildGoal(ctx) }
  ];

  let toolCallsUsed = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // On the last allowed turn, force the agent to submit so we always return something.
    const forceSubmit = iteration === MAX_ITERATIONS - 1 || toolCallsUsed >= MAX_TOOL_CALLS;

    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o',
      messages,
      tools: TOOLS,
      tool_choice: forceSubmit
        ? { type: 'function', function: { name: 'submit_analysis' } }
        : 'auto',
      temperature: 0.1,
      max_tokens: 3500
    });

    const msg = response.choices[0].message;
    messages.push(msg);

    const toolCalls = msg.tool_calls || [];
    if (toolCalls.length === 0) {
      // Model replied with prose instead of a tool call — nudge it to act/submit.
      messages.push({
        role: 'user',
        content: 'Continue using the tools to gather proof, or call submit_analysis with your final JSON now.'
      });
      continue;
    }

    for (const call of toolCalls) {
      if (call.function.name === 'submit_analysis') {
        const parsed = parseArgs(call.function.arguments);
        if (parsed) {
          console.log(`[gap-agent] ${competitorName}: submitted after ${toolCallsUsed} research tool calls`);
          return parsed;
        }
        // Malformed submission — tell the agent to fix it and keep going.
        messages.push(toolResult(call.id, 'submit_analysis arguments were not valid JSON. Re-submit valid JSON matching the schema.'));
        continue;
      }

      toolCallsUsed++;
      const result = await executeTool(call.function.name, parseArgs(call.function.arguments) || {}, ctx);
      messages.push(toolResult(call.id, truncate(result)));
      console.log(`[gap-agent] ${competitorName}: tool ${call.function.name} (#${toolCallsUsed})`);
    }
  }

  throw new Error(`Gap agent did not produce a result for ${competitorName}`);
}

function buildGoal(ctx) {
  const { prompt, competitorName, competitorDomain, competitorUrl, cloudfuzeDomain, cloudfuzeUrl } = ctx;
  return `A user asked an AI assistant: "${prompt}"
The assistant cited/mentioned ${competitorName} for this query but did NOT mention CloudFuze.

Your goal: produce an evidence-backed content gap analysis explaining what ${competitorName} covers (with PROOF) that CloudFuze is missing, plus concrete recommendations for CloudFuze.

Targets:
- Competitor: ${competitorName} — domain ${competitorDomain} (start URL: ${competitorUrl})
- CloudFuze — domain ${cloudfuzeDomain} (start URL: ${cloudfuzeUrl})

Use the tools to research BOTH. Gather enough that every gap and recommendation is backed by a verbatim quote and a real source URL. If a site has no relevant page or is unreachable, use search_web to find what it offers. When (and only when) you have solid proof, call submit_analysis.`;
}

// ---------------------------------------------------------------------------
// Tool definitions exposed to the model
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_site',
      description: "Google-search a SINGLE website domain for a query and return its indexed page content plus the real source URLs. Best for pulling verbatim quotes from a company's own site (e.g. the competitor's or CloudFuze's). May return 'NO RELEVANT PAGE FOUND' if the site has nothing on the topic.",
      parameters: {
        type: 'object',
        properties: {
          domain: { type: 'string', description: 'Bare domain to restrict the search to, e.g. "migrationwiz.com".' },
          query: { type: 'string', description: 'What to look for on that site.' }
        },
        required: ['domain', 'query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Broad Google search across the whole web (not restricted to one site). Use when a site has no relevant page, appears down/defunct, or you need third-party info (reviews, docs, news) describing a product. Returns content plus real source URLs.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The web search query.' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_page',
      description: 'Fetch a specific public URL and return its readable text and headings. Use to read a specific page you found via search in more detail.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full http(s) URL of a public page to read.' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'submit_analysis',
      description: 'Submit the FINAL gap analysis. Call this only once you have proof (a verbatim quote + a real source URL) for each gap and recommendation.',
      parameters: SUBMIT_SCHEMA()
    }
  }
];

// JSON schema for the final structured output (matches what the frontend renders).
function SUBMIT_SCHEMA() {
  return {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: '2-3 sentences naming specific content differences — actual headings, features, or quoted claims.'
      },
      directComparisons: {
        type: 'array',
        description: '3-5 head-to-head topic comparisons.',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string' },
            competitorCoverage: { type: 'string', description: 'What the competitor says about this topic.' },
            competitorEvidence: { type: 'string', description: 'A VERBATIM quote from the research proving it, in quotation marks. Never paraphrase here.' },
            competitorSource: { type: 'string', description: 'The real source URL the quote came from.' },
            cloudfuzeCoverage: { type: 'string', description: "What CloudFuze says, or 'Not found in CloudFuze content'." },
            gap: { type: 'string', description: 'The specific, concrete thing CloudFuze should add or change.' }
          },
          required: ['topic', 'competitorCoverage', 'competitorEvidence', 'competitorSource', 'cloudfuzeCoverage', 'gap']
        }
      },
      missingTopics: {
        type: 'array',
        description: 'Exact topics/headings the competitor covers that CloudFuze does not.',
        items: { type: 'string' }
      },
      keywordGaps: {
        type: 'array',
        description: 'Exact keyword phrases (in quotes) the competitor uses that CloudFuze is missing.',
        items: { type: 'string' }
      },
      recommendations: {
        type: 'array',
        description: '3-5 concrete, specific actions. No generic advice like "highlight X" or "provide more detail".',
        items: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Exact CloudFuze page/section to create or edit, the heading text, and the specific feature/claim/stat to include.' },
            rationale: { type: 'string', description: 'Why this closes the gap, tied to what the competitor does.' },
            proof: { type: 'string', description: 'A VERBATIM quote from the research proving the competitor covers this, in quotation marks.' },
            source: { type: 'string', description: 'The real source URL the proof came from.' },
            targetPage: { type: 'string', description: 'Suggested CloudFuze URL/path to create or update.' },
            priority: { type: 'string', enum: ['High', 'Medium', 'Low'] }
          },
          required: ['action', 'rationale', 'proof', 'source', 'targetPage', 'priority']
        }
      }
    },
    required: ['summary', 'directComparisons', 'missingTopics', 'keywordGaps', 'recommendations']
  };
}

const SYSTEM_PROMPT = `You are an autonomous competitive-research agent for CloudFuze, an expert SEO and content strategist.

You are given research TOOLS and a goal. Decide yourself which tools to call, in what order, and how many times. Typical strategy:
1. search_site on the competitor's domain for the user's topic.
2. If that is thin, blocked, or empty, search_web for the competitor + topic (third-party sources are fine).
3. search_site on cloudfuze.com for the same topic to see what CloudFuze already covers.
4. Optionally fetch_page on a specific promising URL to get more detail.
5. If proof for a claim is weak, search again with a more specific query before concluding.

PROOF IS THE WHOLE POINT. When you submit_analysis:
- Every competitorEvidence and every recommendation "proof" MUST be a verbatim quote from the research you gathered, in quotation marks. Never paraphrase those fields.
- Every source MUST be a real URL that appeared in your tool results. Never invent a URL.
- Recommendations must be concrete and specific (exact page, heading, claim/stat). BANNED: "highlight X", "provide more detail", "improve content", "add resources", "match the competitor".
- Do not claim a gap for something CloudFuze already covers.
- Base everything ONLY on what your tools returned. If you could not retrieve the competitor's content, say so honestly in the summary and return what you can.

Be efficient — gather enough proof, then submit. Do not call tools endlessly.`;

// ---------------------------------------------------------------------------
// Tool executors
// ---------------------------------------------------------------------------
async function executeTool(name, args, ctx) {
  try {
    if (name === 'search_site') return await toolSearchSite(args);
    if (name === 'search_web') return await toolSearchWeb(args);
    if (name === 'fetch_page') return await toolFetchPage(args);
    return `Unknown tool: ${name}`;
  } catch (err) {
    return `Tool ${name} failed: ${err.message}`;
  }
}

async function toolSearchSite({ domain, query }) {
  if (!domain || !query) return 'search_site requires both "domain" and "query".';
  const d = String(domain).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  const searchPrompt = `Search site:${d} for content about: "${query}"

Find the most relevant page(s) and extract evidence. For each page output:
PAGE URL: <exact full URL>
HEADINGS: <every H1/H2/H3, separated by " | ">
VERBATIM QUOTES:
- "<exact sentence copied word-for-word — features, capabilities, supported platforms, claims, stats>"
KEYWORD PHRASES: <exact phrases, comma-separated>

Rules: copy quotes WORD-FOR-WORD; pair every quote with its PAGE URL; do not invent. If no relevant page exists on ${d}, reply exactly "NO RELEVANT PAGE FOUND on ${d}".`;

  const res = await runGroundedSearch(searchPrompt, d).catch(err => ({ error: err.message }));
  if (res.error) return `search_site error for ${d}: ${res.error}`;
  return formatResearch(res);
}

async function toolSearchWeb({ query }) {
  if (!query) return 'search_web requires "query".';
  const searchPrompt = `Using Google Search, research: "${query}".

Report concrete features, capabilities, supported platforms, claims, statistics, and limitations. For every fact include the source URL. Quote key sentences verbatim where possible. If a product appears discontinued or unavailable, say so and report what it was known for. Do not invent facts or URLs.`;

  const res = await runGroundedSearch(searchPrompt, query).catch(err => ({ error: err.message }));
  if (res.error) return `search_web error: ${res.error}`;
  return formatResearch(res);
}

async function toolFetchPage({ url }) {
  if (!url) return 'fetch_page requires "url".';
  if (!isSafePublicUrl(url)) return `fetch_page refused: "${url}" is not an allowed public http(s) URL.`;
  const { url: finalUrl, text } = await fetchPageContent(url);
  if (!text || !text.trim()) return `No readable content at ${finalUrl}.`;
  return `PAGE URL: ${finalUrl}\n${text}`;
}

// ---------------------------------------------------------------------------
// Gemini grounded-search primitive (shared by search_site / search_web)
// ---------------------------------------------------------------------------
async function runGroundedSearch(searchPrompt, label) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [{ googleSearch: {} }]
  });

  // Retry transient failures (429, transient 400 API_KEY_INVALID under load, 5xx, network).
  const result = await withGeminiRetry(() => model.generateContent(searchPrompt), `gap:${label}`);
  const candidate = result.response?.candidates?.[0];
  const finishReason = candidate?.finishReason;

  // RECITATION / SAFETY / etc. — no usable text. Surface as error so the agent can adapt.
  if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
    throw new Error(`Gemini blocked (${finishReason}) for ${label}`);
  }

  let text;
  try {
    text = result.response.text();
  } catch (err) {
    throw new Error(`Gemini returned no text for ${label}: ${err.message}`);
  }
  if (!text || !text.trim()) throw new Error(`Empty Gemini response for ${label}`);

  const chunks = candidate?.groundingMetadata?.groundingChunks || [];
  return { text, chunks };
}

// Append the real source URLs from Gemini's grounding metadata. Gemini returns each
// source as an ephemeral "vertexaisearch" redirect URL that expires (and then falls back
// to the site homepage). Resolve them now, while fresh, to the real publisher page URL so
// the cited source links straight to the exact page — permanently.
async function formatResearch(res) {
  const chunks = (res.chunks || []).filter(c => c.web?.uri);
  const resolvedUrls = await Promise.all(
    chunks.map(c => resolveGroundingUrl(c.web.uri))
  );

  const sources = chunks.map((c, i) => {
    const title = c.web.title || resolvedUrls[i];
    return `- ${title} :: ${resolvedUrls[i]}`;
  });

  const sourceBlock = sources.length > 0
    ? `\n\n=== SOURCES (real URLs — use these as the "source" for any quote) ===\n${sources.join('\n')}`
    : '';
  return res.text + sourceBlock;
}

// Follow a Gemini grounding redirect to the real publisher URL. Only follows hops while
// still on Google's redirect host, so we stop at the publisher's actual page URL (and
// don't chase the publisher's own redirects, e.g. a missing page bouncing to its homepage).
function resolveGroundingUrl(url, hops = 0) {
  return new Promise((resolve) => {
    if (hops > 4) return resolve(url);

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return resolve(url);
    }

    // Once we've left Google's redirect host, this is the real publisher URL — keep it.
    const isGroundingRedirect = /vertexaisearch|grounding-api-redirect/i.test(parsed.hostname + parsed.pathname);
    if (!isGroundingRedirect) return resolve(url);

    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      url,
      { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 },
      (res) => {
        const { statusCode } = res;
        const location = res.headers.location;
        res.destroy(); // we only need the headers, not the body
        if (statusCode >= 300 && statusCode < 400 && location) {
          const next = new URL(location, url).href;
          resolveGroundingUrl(next, hops + 1).then(resolve);
        } else {
          resolve(url);
        }
      }
    );
    req.on('timeout', () => { req.destroy(); resolve(url); });
    req.on('error', () => resolve(url));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function safeDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Basic SSRF guard: only public http(s) URLs, no localhost / private / link-local hosts.
function isSafePublicUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0') return false;
  if (host === '::1' || host === '[::1]') return false;
  // IPv4 private / loopback / link-local ranges
  if (/^127\./.test(host)) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return false;
  return true;
}

function parseArgs(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

function toolResult(toolCallId, content) {
  return { role: 'tool', tool_call_id: toolCallId, content };
}

function truncate(text) {
  const s = String(text);
  return s.length > MAX_TOOL_RESULT_CHARS
    ? s.slice(0, MAX_TOOL_RESULT_CHARS) + '\n…[truncated]'
    : s;
}

module.exports = { analyzeGap };
