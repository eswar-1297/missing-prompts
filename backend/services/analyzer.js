const COMPETITORS = [
  'ShareGate',
  'BitTitan',
  'Mover',
  'AvePoint',
  'MultCloud',
  'Cloudsfer',
  'SkySync',
  'MigrationWiz'
];

const COMPETITOR_DOMAINS = {
  ShareGate: 'sharegate.com',
  BitTitan: 'bittitan.com',
  Mover: 'mover.io',
  AvePoint: 'avepoint.com',
  MultCloud: 'multcloud.com',
  Cloudsfer: 'cloudsfer.com',
  SkySync: 'skysync.com',
  MigrationWiz: 'migrationwiz.com'
};

const CLOUDFUZE = 'CloudFuze';
const CLOUDFUZE_DOMAIN = 'cloudfuze.com';

/**
 * Analyzes a response text + citations array and returns structured results.
 * @param {string} text
 * @param {Array<{url: string, title: string}>} citations
 */
function analyzeResponse(text, citations = []) {
  if (!text || (text.startsWith('[') && text.includes('Error'))) {
    return {
      isError: true,
      cloudfuzeMentioned: false,
      cloudfuzePosition: null,
      cloudfuzeFirstMentionIndex: null,
      competitorsMentioned: [],
      allToolsMentioned: [],
      cloudFuzeRanking: null,
      cloudfuzeCitations: [],
      competitorCitations: {},
      otherCitations: [],
      totalCitations: 0
    };
  }

  const lowerText = text.toLowerCase();

  // --- Mention analysis ---
  const cloudfuzeMatches = [...text.matchAll(/cloudfuze/gi)];
  const cloudfuzeMentioned = cloudfuzeMatches.length > 0;
  const cloudfuzeFirstMentionIndex = cloudfuzeMentioned ? cloudfuzeMatches[0].index : null;

  const competitorsMentioned = COMPETITORS.filter(c =>
    lowerText.includes(c.toLowerCase())
  );

  const allTools = [CLOUDFUZE, ...COMPETITORS];
  const toolsWithIndex = allTools
    .map(tool => {
      const idx = lowerText.indexOf(tool.toLowerCase());
      return idx === -1 ? null : { tool, idx };
    })
    .filter(Boolean)
    .sort((a, b) => a.idx - b.idx);

  const allToolsMentioned = toolsWithIndex.map(t => t.tool);
  const cloudFuzeRanking = cloudfuzeMentioned
    ? allToolsMentioned.indexOf(CLOUDFUZE) + 1
    : null;

  let cloudfuzePosition = null;
  if (cloudfuzeMentioned) {
    if (cloudFuzeRanking === 1) cloudfuzePosition = 'First mention';
    else if (cloudFuzeRanking <= 3) cloudfuzePosition = `Top 3 (position ${cloudFuzeRanking})`;
    else cloudfuzePosition = `Position ${cloudFuzeRanking}`;
  }

  // --- Citation analysis ---
  const cloudfuzeCitations = [];
  const competitorCitations = {};
  const otherCitations = [];

  for (const citation of citations) {
    const urlLower = (citation.url || '').toLowerCase();
    // Gemini 2.0 wraps real URLs in vertexaisearch redirect URLs.
    // Fall back to matching on the page title when the URL doesn't contain the domain.
    const titleLower = (citation.title || '').toLowerCase();

    const matchesDomain = (domain) => urlLower.includes(domain);
    const matchesTitle = (brand) => {
      const b = brand.toLowerCase();
      return new RegExp(`\\b${b}\\b`).test(titleLower);
    };

    if (matchesDomain(CLOUDFUZE_DOMAIN) || matchesTitle('cloudfuze')) {
      cloudfuzeCitations.push(citation);
      continue;
    }
    let matched = false;
    for (const [name, domain] of Object.entries(COMPETITOR_DOMAINS)) {
      if (matchesDomain(domain) || matchesTitle(name)) {
        if (!competitorCitations[name]) competitorCitations[name] = [];
        competitorCitations[name].push(citation);
        matched = true;
        break;
      }
    }
    if (!matched) otherCitations.push(citation);
  }

  return {
    isError: false,
    cloudfuzeMentioned,
    cloudfuzePosition,
    cloudfuzeFirstMentionIndex,
    competitorsMentioned,
    allToolsMentioned,
    cloudFuzeRanking,
    cloudfuzeCitations,
    competitorCitations,
    otherCitations,
    totalCitations: citations.length
  };
}

module.exports = { analyzeResponse, COMPETITORS, COMPETITOR_DOMAINS };
