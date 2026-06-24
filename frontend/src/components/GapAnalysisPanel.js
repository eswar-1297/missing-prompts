import React from 'react';
import './GapAnalysisPanel.css';

function GapAnalysisPanel({ competitorName, analysis }) {
  const { summary, directComparisons, missingTopics, keywordGaps, recommendations } = analysis;

  return (
    <div className="gap-panel">
      <div className="gap-panel-title">Gap Analysis: CloudFuze vs {competitorName}</div>

      {summary && <p className="gap-summary">{summary}</p>}

      {directComparisons && directComparisons.length > 0 && (
        <div className="gap-comparisons">
          <div className="gap-comparisons-title">Direct Page Comparison</div>
          {directComparisons.map((row, i) => (
            <div key={i} className="gap-comparison-row">
              <div className="gap-comparison-topic">{row.topic}</div>
              <div className="gap-comparison-cols">
                <div className="gap-comparison-cell gap-comparison-cell--comp">
                  <div className="gap-cell-label">{competitorName}</div>
                  <div className="gap-cell-body">{row.competitorCoverage}</div>
                  {row.competitorEvidence && (
                    <blockquote className="gap-evidence">
                      {row.competitorEvidence}
                      {row.competitorSource && (
                        <SourceLink url={row.competitorSource} />
                      )}
                    </blockquote>
                  )}
                </div>
                <div className="gap-comparison-cell gap-comparison-cell--cf">
                  <div className="gap-cell-label">CloudFuze</div>
                  <div className="gap-cell-body">{row.cloudfuzeCoverage}</div>
                </div>
              </div>
              {row.gap && (
                <div className="gap-comparison-action">
                  <span className="gap-action-label">Action: </span>{row.gap}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="gap-sections">
        <GapSection
          title="Missing Topics"
          items={missingTopics}
          variant="gap"
        />
        <GapSection
          title="Missing Keywords"
          items={keywordGaps}
          variant="keyword"
        />
        <RecommendationsSection recommendations={recommendations} />
      </div>
    </div>
  );
}

function RecommendationsSection({ recommendations }) {
  if (!recommendations || recommendations.length === 0) return null;
  return (
    <div className="gap-section gap-section--recommendation gap-section--full">
      <div className="gap-section-title">Recommendations</div>
      <div className="gap-rec-list">
        {recommendations.map((rec, i) => {
          // Backward compatibility: a recommendation may be a plain string.
          if (typeof rec === 'string') {
            return <div key={i} className="gap-rec-item">{rec}</div>;
          }
          return (
            <div key={i} className="gap-rec-item">
              <div className="gap-rec-head">
                {rec.priority && (
                  <span className={`gap-rec-priority gap-rec-priority--${String(rec.priority).toLowerCase()}`}>
                    {rec.priority}
                  </span>
                )}
                <span className="gap-rec-action">{rec.action}</span>
              </div>
              {rec.rationale && <div className="gap-rec-rationale">{rec.rationale}</div>}
              {rec.proof && (
                <blockquote className="gap-evidence">
                  {rec.proof}
                  {rec.source && <SourceLink url={rec.source} />}
                </blockquote>
              )}
              {rec.targetPage && (
                <div className="gap-rec-target">
                  <span className="gap-rec-target-label">Target page: </span>
                  {rec.targetPage}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SourceLink({ url }) {
  const isLink = typeof url === 'string' && /^https?:\/\//i.test(url);
  if (!isLink) {
    return <span className="gap-source gap-source--plain">{url}</span>;
  }
  let label = url;
  try {
    const u = new URL(url);
    // Gemini grounding returns opaque redirect URLs — show a friendly label instead.
    if (/vertexaisearch|grounding-api-redirect/i.test(u.hostname + u.pathname)) {
      label = 'View source ↗';
    } else {
      label = u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname);
    }
  } catch { /* keep full url */ }
  return (
    <a className="gap-source" href={url} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

function GapSection({ title, items, variant }) {
  if (!items || items.length === 0) return null;
  return (
    <div className={`gap-section gap-section--${variant}`}>
      <div className="gap-section-title">{title}</div>
      <ul className="gap-list">
        {items.map((item, i) => (
          <li key={i} className="gap-list-item">{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default GapAnalysisPanel;
