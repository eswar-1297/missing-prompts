const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { fetchPageContent } = require('./pageContentService');

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const CLOUDFUZE_FALLBACK_URL = 'https://www.cloudfuze.com/';

async function analyzeGap({ prompt, competitorName, competitorUrl, cloudfuzeUrl }) {
  // Use Gemini Google Search grounding to research both sites live.
  // Two parallel calls — one focused on competitor, one on CloudFuze — for maximum depth.
  const resolvedCfUrl = cloudfuzeUrl || CLOUDFUZE_FALLBACK_URL;

  const [compResearch, cfResearch] = await Promise.allSettled([
    searchPageContent(prompt, competitorName, competitorUrl),
    searchPageContent(prompt, 'CloudFuze', resolvedCfUrl)
  ]);

  const compText = compResearch.status === 'fulfilled'
    ? compResearch.value
    : await fetchPageContentFallback(competitorUrl);

  const cfText = cfResearch.status === 'fulfilled'
    ? cfResearch.value
    : await fetchPageContentFallback(resolvedCfUrl);

  return await structureAnalysis(prompt, competitorName, compText, cfText);
}

// Uses Gemini's Google Search grounding to find what a site actually says about a topic.
// This reads Google's indexed/rendered content — works even on JS-heavy SPAs.
async function searchPageContent(prompt, siteName, siteUrl) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ googleSearch: {} }]
  });

  const siteDomain = new URL(siteUrl).hostname.replace('www.', '');

  const searchPrompt = `Search site:${siteDomain} for content about: "${prompt}"

Find the most relevant page from ${siteName} (${siteDomain}) that covers this topic and extract:
1. The exact URL of the page you found
2. Every H1, H2, H3 heading on the page — list them all
3. Key features, capabilities, and claims stated on the page
4. Specific use-cases, migration types, supported platforms, or workflows described
5. Any statistics, numbers, certifications, or concrete data points mentioned
6. Exact keyword phrases used repeatedly

Quote exact text from the page. Be thorough. Do not summarize vaguely.`;

  const result = await model.generateContent(searchPrompt);
  const text = result.response?.text();
  if (!text) throw new Error(`Empty Gemini response for ${siteName}`);
  return text;
}

// Fallback: plain HTTP fetch if Gemini search fails for a site.
async function fetchPageContentFallback(url) {
  try {
    const { text } = await fetchPageContent(url);
    return `[Fetched via HTTP — may be incomplete]\n${text}`;
  } catch (err) {
    return `[Could not fetch ${url}: ${err.message}]`;
  }
}

// GPT-4o turns the grounded research into structured JSON.
// Strictly instructed to only use content present in the research.
async function structureAnalysis(prompt, competitorName, compResearch, cfResearch) {
  const userMessage = `A user searched: "${prompt}"
AI assistants cited/mentioned ${competitorName} for this query but NOT CloudFuze.

Below is live web research for both sites gathered via Google Search. Base your analysis ONLY on this content — do not add anything not found here.

=== ${competitorName} RESEARCH ===
${compResearch}

=== CloudFuze RESEARCH ===
${cfResearch}

Produce a precise gap analysis using only the research above. Every item must reference something explicitly found in the research. If a topic appears in ${competitorName}'s research but not in CloudFuze's, call it out by name.

Return this exact JSON (3-5 items per array):
{
  "summary": "2-3 sentences citing specific content differences found in the research — name actual headings or features",
  "directComparisons": [
    {
      "topic": "exact heading or topic from ${competitorName} research",
      "competitorCoverage": "what ${competitorName} says — quote or close paraphrase from the research",
      "cloudfuzeCoverage": "what CloudFuze says about this from the research, or 'Not found in CloudFuze content'",
      "gap": "the specific thing CloudFuze needs to add or improve, based on the research"
    }
  ],
  "missingTopics": ["exact topic or heading from ${competitorName} research not found in CloudFuze research"],
  "keywordGaps": ["exact keyword phrase from ${competitorName} research absent from CloudFuze — wrap phrase in quotes"],
  "recommendations": ["specific action item — name the exact page section, heading, or content to create based on what ${competitorName} has"]
}`;

  const response = await openaiClient.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert SEO and content strategist. You analyze real web research and produce structured gap analysis.
STRICT RULE: Only reference content explicitly found in the provided research. If something is not in the research, do not include it. Return only valid JSON.`
      },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.1,
    max_tokens: 2500,
    response_format: { type: 'json_object' }
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty gap analysis response from OpenAI');

  return JSON.parse(raw);
}

module.exports = { analyzeGap };
