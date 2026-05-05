import React, { useState } from 'react';
import './PromptCard.css';
import ResponsePanel from './ResponsePanel';

function PromptCard({ index, result }) {
  const [expanded, setExpanded] = useState(false);
  const { prompt, openai, gemini } = result;

  const openaiMentioned = openai.analysis.cloudfuzeMentioned;
  const geminiMentioned = gemini.analysis.cloudfuzeMentioned;
  const bothMentioned = openaiMentioned && geminiMentioned;
  const neitherMentioned = !openaiMentioned && !geminiMentioned;

  return (
    <div className={`prompt-card${bothMentioned ? ' prompt-card--both' : neitherMentioned ? ' prompt-card--none' : ''}`}>
      <button
        className="prompt-card-header"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <span className="prompt-card-number">#{index}</span>
        <span className="prompt-card-text">{prompt}</span>
        <div className="prompt-card-badges">
          <StatusBadge label="ChatGPT" mentioned={openaiMentioned} ranking={openai.analysis.cloudFuzeRanking} />
          <StatusBadge label="Gemini" mentioned={geminiMentioned} ranking={gemini.analysis.cloudFuzeRanking} />
        </div>
        <span className="prompt-card-chevron" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="prompt-card-body">
          <div className="response-grid">
            <ResponsePanel
              title="ChatGPT"
              accentColor="#10a37f"
              response={openai.response}
              analysis={openai.analysis}
              prompt={prompt}
            />
            <ResponsePanel
              title="Gemini"
              accentColor="#4285f4"
              response={gemini.response}
              analysis={gemini.analysis}
              prompt={prompt}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ label, mentioned, ranking }) {
  const cls = mentioned
    ? (ranking === 1 ? 'badge--first' : ranking <= 3 ? 'badge--top3' : 'badge--mentioned')
    : 'badge--absent';
  const text = mentioned
    ? (ranking === 1 ? `${label} #1` : ranking <= 3 ? `${label} top 3` : `${label} ✓`)
    : `${label} —`;
  return <span className={`status-badge ${cls}`}>{text}</span>;
}

export default PromptCard;
