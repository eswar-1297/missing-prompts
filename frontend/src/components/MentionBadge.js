import React from 'react';
import './MentionBadge.css';

function MentionBadge({ mentioned, position }) {
  if (!mentioned) {
    return (
      <span className="mention-badge mention-badge--absent">
        CloudFuze not mentioned
      </span>
    );
  }
  const isFirst = position === 'First mention';
  const isTop3 = position && position.startsWith('Top 3');
  return (
    <span className={`mention-badge ${isFirst ? 'mention-badge--first' : isTop3 ? 'mention-badge--top3' : 'mention-badge--mentioned'}`}>
      CloudFuze: {position}
    </span>
  );
}

export default MentionBadge;
