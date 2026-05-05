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
        <GapSection
          title="Recommendations"
          items={recommendations}
          variant="recommendation"
        />
      </div>
    </div>
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
