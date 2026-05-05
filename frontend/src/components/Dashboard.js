import React, { useMemo } from 'react';
import './Dashboard.css';
import PromptCard from './PromptCard';

function Dashboard({ data }) {
  const { keywords, results } = data;

  const summary = useMemo(() => {
    let openaiMentions = 0, geminiMentions = 0;
    let openaiTop3 = 0, geminiTop3 = 0;
    let openaiCFCited = 0, geminiCFCited = 0;
    const openaiCompetitorCounts = {};
    const geminiCompetitorCounts = {};
    const openaiCompetitorCitedCounts = {};
    const geminiCompetitorCitedCounts = {};

    results.forEach(({ openai, gemini }) => {
      if (openai.analysis.cloudfuzeMentioned) openaiMentions++;
      if (gemini.analysis.cloudfuzeMentioned) geminiMentions++;
      if (openai.analysis.cloudFuzeRanking && openai.analysis.cloudFuzeRanking <= 3) openaiTop3++;
      if (gemini.analysis.cloudFuzeRanking && gemini.analysis.cloudFuzeRanking <= 3) geminiTop3++;
      if ((openai.analysis.cloudfuzeCitations || []).length > 0) openaiCFCited++;
      if ((gemini.analysis.cloudfuzeCitations || []).length > 0) geminiCFCited++;

      openai.analysis.competitorsMentioned.forEach(c => {
        openaiCompetitorCounts[c] = (openaiCompetitorCounts[c] || 0) + 1;
      });
      gemini.analysis.competitorsMentioned.forEach(c => {
        geminiCompetitorCounts[c] = (geminiCompetitorCounts[c] || 0) + 1;
      });

      Object.keys(openai.analysis.competitorCitations || {}).forEach(c => {
        openaiCompetitorCitedCounts[c] = (openaiCompetitorCitedCounts[c] || 0) + 1;
      });
      Object.keys(gemini.analysis.competitorCitations || {}).forEach(c => {
        geminiCompetitorCitedCounts[c] = (geminiCompetitorCitedCounts[c] || 0) + 1;
      });
    });

    return {
      total: results.length,
      openaiMentions, geminiMentions,
      openaiTop3, geminiTop3,
      openaiCFCited, geminiCFCited,
      topOpenaiCompetitors: Object.entries(openaiCompetitorCounts).sort((a,b)=>b[1]-a[1]).slice(0,3),
      topGeminiCompetitors: Object.entries(geminiCompetitorCounts).sort((a,b)=>b[1]-a[1]).slice(0,3),
      topOpenaiCompetitorCited: Object.entries(openaiCompetitorCitedCounts).sort((a,b)=>b[1]-a[1]).slice(0,3),
      topGeminiCompetitorCited: Object.entries(geminiCompetitorCitedCounts).sort((a,b)=>b[1]-a[1]).slice(0,3),
    };
  }, [results]);

  return (
    <div className="dashboard">
      <div className="dashboard-kw-banner">
        Results for: <strong>"{keywords}"</strong>
        <span className="dashboard-kw-count"> — {summary.total} prompts analyzed</span>
      </div>

      {/* Mention summary */}
      <h2 className="dashboard-section-title">Mention Summary</h2>
      <div className="summary-grid">
        <SummaryCard label="ChatGPT mentions CloudFuze" value={`${summary.openaiMentions} / ${summary.total}`} highlight={summary.openaiMentions > 0} />
        <SummaryCard label="ChatGPT ranks CloudFuze top 3" value={`${summary.openaiTop3} / ${summary.total}`} highlight={summary.openaiTop3 > 0} />
        <SummaryCard label="Gemini mentions CloudFuze" value={`${summary.geminiMentions} / ${summary.total}`} highlight={summary.geminiMentions > 0} />
        <SummaryCard label="Gemini ranks CloudFuze top 3" value={`${summary.geminiTop3} / ${summary.total}`} highlight={summary.geminiTop3 > 0} />
      </div>

      {/* Citation summary */}
      <h2 className="dashboard-section-title">Citation Summary</h2>
      <div className="summary-grid">
        <SummaryCard label="ChatGPT cited CloudFuze pages" value={`${summary.openaiCFCited} / ${summary.total}`} highlight={summary.openaiCFCited > 0} color="cf" />
        <SummaryCard label="Gemini cited CloudFuze pages" value={`${summary.geminiCFCited} / ${summary.total}`} highlight={summary.geminiCFCited > 0} color="cf" />
      </div>

      {/* Competitor breakdown */}
      <div className="competitor-summary-row">
        <CompetitorSummary title="ChatGPT — Top Competitor Mentions" items={summary.topOpenaiCompetitors} />
        <CompetitorSummary title="Gemini — Top Competitor Mentions" items={summary.topGeminiCompetitors} />
        <CompetitorSummary title="ChatGPT — Top Competitor Citations" items={summary.topOpenaiCompetitorCited} variant="cited" />
        <CompetitorSummary title="Gemini — Top Competitor Citations" items={summary.topGeminiCompetitorCited} variant="cited" />
      </div>

      <h2 className="dashboard-section-title">Prompt-by-Prompt Breakdown</h2>
      <div className="prompt-list">
        {results.map((result, i) => (
          <PromptCard key={i} index={i + 1} result={result} />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, highlight, color }) {
  const cls = `summary-card${highlight ? (color === 'cf' ? ' summary-card--cf' : ' summary-card--highlight') : ''}`;
  return (
    <div className={cls}>
      <span className="summary-card-value">{value}</span>
      <span className="summary-card-label">{label}</span>
    </div>
  );
}

function CompetitorSummary({ title, items, variant }) {
  return (
    <div className="competitor-summary">
      <h3 className="competitor-summary-title">{title}</h3>
      {items.length === 0 ? (
        <p className="competitor-none">None.</p>
      ) : (
        <ul className="competitor-list">
          {items.map(([name, count]) => (
            <li key={name} className="competitor-item">
              <span className="competitor-name">{name}</span>
              <span className={`competitor-count${variant === 'cited' ? ' competitor-count--cited' : ''}`}>{count}x</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Dashboard;
