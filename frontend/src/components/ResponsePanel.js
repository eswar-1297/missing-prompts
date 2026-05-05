import React, { useState } from 'react';
import './ResponsePanel.css';
import MentionBadge from './MentionBadge';
import GapAnalysisPanel from './GapAnalysisPanel';
import { runGapAnalysis } from '../utils/api';

const COMPETITORS = ['ShareGate','BitTitan','Mover','AvePoint','MultCloud','Cloudsfer','SkySync','MigrationWiz'];

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

function ResponsePanel({ title, accentColor, response, citations = [], analysis, prompt }) {
  const [showFull, setShowFull] = useState(false);
  const [showCitations, setShowCitations] = useState(true);
  const [gapState, setGapState] = useState({});

  const {
    isError,
    cloudfuzeMentioned,
    cloudfuzePosition,
    competitorsMentioned,
    allToolsMentioned,
    cloudfuzeCitations = [],
    competitorCitations = {},
    otherCitations = [],
    totalCitations = 0
  } = analysis;

  const highlighted = highlightText(response, allToolsMentioned);
  const previewLength = 350;
  const isLong = response.length > previewLength;

  const hasAnyCitations = totalCitations > 0;
  const competitorCitationEntries = Object.entries(competitorCitations);

  // Build analyze targets from both text mentions and citation-only competitors.
  const competitorNamesFromCitations = Object.keys(competitorCitations).filter(
    name => competitorCitations[name]?.length > 0
  );
  const allCompetitorNames = [...new Set([...competitorsMentioned, ...competitorNamesFromCitations])];

  const competitorsToAnalyze = allCompetitorNames
    .filter(name => COMPETITOR_DOMAINS[name])
    .map(name => ({
      name,
      url: competitorCitations[name]?.[0]?.url || `https://www.${COMPETITOR_DOMAINS[name]}`
    }));

  const cloudfuzeAbsent = !cloudfuzeMentioned && cloudfuzeCitations.length === 0;
  const showGapSection = !isError && cloudfuzeAbsent && competitorsToAnalyze.length > 0;

  async function handleAnalyzeGap(competitorName, competitorUrl) {
    setGapState(prev => ({ ...prev, [competitorName]: { loading: true, error: null, data: null } }));
    try {
      const cloudfuzeUrl = cloudfuzeCitations[0]?.url || null;
      const data = await runGapAnalysis({ prompt, competitorName, competitorUrl, cloudfuzeUrl });
      setGapState(prev => ({ ...prev, [competitorName]: { loading: false, error: null, data } }));
    } catch (err) {
      setGapState(prev => ({ ...prev, [competitorName]: { loading: false, error: err.message, data: null } }));
    }
  }

  return (
    <div className="response-panel" style={{ '--panel-accent': accentColor }}>
      <div className="response-panel-title">{title}</div>

      {!isError && (
        <div className="analysis-bar">
          <MentionBadge mentioned={cloudfuzeMentioned} position={cloudfuzePosition} />
          {competitorsMentioned.length > 0 && (
            <div className="competitor-chips">
              {competitorsMentioned.map(c => (
                <span key={c} className="competitor-chip">{c}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {!isError && allToolsMentioned.length > 0 && (
        <div className="tool-order">
          <span className="tool-order-label">Mention order: </span>
          {allToolsMentioned.map((t, i) => (
            <span
              key={i}
              className={`tool-chip${t === 'CloudFuze' ? ' tool-chip--cf' : ' tool-chip--comp'}`}
            >
              {i + 1}. {t}
            </span>
          ))}
        </div>
      )}

      <div className="response-text-wrap">
        <div
          className="response-text"
          dangerouslySetInnerHTML={{
            __html: isLong && !showFull
              ? highlighted.slice(0, previewLength) + '...'
              : highlighted
          }}
        />
        {isLong && (
          <button className="show-more-btn" onClick={() => setShowFull(v => !v)}>
            {showFull ? 'Show less' : 'Show full response'}
          </button>
        )}
      </div>

      {!isError && hasAnyCitations && (
        <div className="citations-section">
          <button
            className="citations-toggle"
            onClick={() => setShowCitations(v => !v)}
          >
            Citations ({totalCitations}) {showCitations ? '▲' : '▼'}
          </button>

          {showCitations && (
            <div className="citations-body">

              {cloudfuzeCitations.length > 0 && (
                <div className="citation-group citation-group--cf">
                  <div className="citation-group-label">CloudFuze Pages Cited</div>
                  <ul className="citation-list">
                    {cloudfuzeCitations.map((c, i) => (
                      <CitationItem key={i} citation={c} type="cf" />
                    ))}
                  </ul>
                </div>
              )}

              {competitorCitationEntries.length > 0 && (
                <div className="citation-group citation-group--comp">
                  <div className="citation-group-label">Competitor Pages Cited</div>
                  {competitorCitationEntries.map(([name, cits]) => (
                    <div key={name} className="citation-subgroup">
                      <span className="citation-subgroup-name">{name}</span>
                      <ul className="citation-list">
                        {cits.map((c, i) => (
                          <CitationItem key={i} citation={c} type="comp" />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {otherCitations.length > 0 && (
                <div className="citation-group citation-group--other">
                  <div className="citation-group-label">Other Sources</div>
                  <ul className="citation-list">
                    {otherCitations.map((c, i) => (
                      <CitationItem key={i} citation={c} type="other" />
                    ))}
                  </ul>
                </div>
              )}

            </div>
          )}
        </div>
      )}

      {!isError && !hasAnyCitations && (
        <div className="no-citations">No citations returned by {title}.</div>
      )}

      {showGapSection && (
        <div className="gap-triggers">
          <div className="gap-triggers-label">CloudFuze not mentioned or cited — analyze content gaps:</div>
          <div className="gap-trigger-buttons">
            {competitorsToAnalyze.map(({ name, url }) => {
              const state = gapState[name];
              return (
                <GapTrigger
                  key={name}
                  competitorName={name}
                  competitorUrl={url}
                  state={state}
                  onAnalyze={handleAnalyzeGap}
                />
              );
            })}
          </div>

          {competitorsToAnalyze.map(({ name }) => {
            const state = gapState[name];
            if (!state?.data) return null;
            return (
              <GapAnalysisPanel
                key={name}
                competitorName={name}
                analysis={state.data}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function GapTrigger({ competitorName, competitorUrl, state, onAnalyze }) {
  const loading = state?.loading;
  const hasData = !!state?.data;
  const error = state?.error;

  return (
    <div className="gap-trigger-item">
      <button
        className={`gap-trigger-btn${hasData ? ' gap-trigger-btn--done' : ''}`}
        onClick={() => !loading && !hasData && onAnalyze(competitorName, competitorUrl)}
        disabled={loading || hasData}
        title={competitorUrl}
      >
        {loading
          ? `Analyzing vs ${competitorName}...`
          : hasData
          ? `Analyzed vs ${competitorName}`
          : `Analyze gap vs ${competitorName}`}
      </button>
      {error && <span className="gap-trigger-error">{error}</span>}
    </div>
  );
}

function CitationItem({ citation, type }) {
  const domain = getDomain(citation.url);
  return (
    <li className={`citation-item citation-item--${type}`}>
      <a
        href={citation.url}
        target="_blank"
        rel="noopener noreferrer"
        className="citation-link"
        title={citation.url}
      >
        {domain && <span className="citation-domain">{domain}</span>}
        <span className="citation-title">{citation.title || citation.url}</span>
      </a>
    </li>
  );
}

function getDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    // Gemini 2.0 wraps real URLs in Google redirect — don't show that as the domain
    if (hostname.includes('vertexaisearch') || hostname.includes('googleapis.com')) return null;
    return hostname;
  } catch {
    return url;
  }
}

function highlightText(text, toolsMentioned) {
  const ALL_TOOLS = ['CloudFuze', ...COMPETITORS];
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  ALL_TOOLS.forEach(tool => {
    if (tool !== 'CloudFuze' && !toolsMentioned.includes(tool)) return;
    const cls = tool === 'CloudFuze' ? 'hl-cf' : 'hl-comp';
    const regex = new RegExp(`(${tool})`, 'gi');
    escaped = escaped.replace(regex, `<mark class="${cls}">$1</mark>`);
  });

  return escaped;
}

export default ResponsePanel;
