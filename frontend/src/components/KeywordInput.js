import React, { useState } from 'react';
import './KeywordInput.css';

function KeywordInput({ onSubmit, isLoading }) {
  const [value, setValue] = useState('');
  const [validationError, setValidationError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setValidationError('Please enter at least 2 characters.');
      return;
    }
    if (trimmed.length > 300) {
      setValidationError('Keywords must be under 300 characters.');
      return;
    }
    setValidationError('');
    onSubmit(trimmed);
  };

  return (
    <section className="keyword-input-section">
      <form className="keyword-form" onSubmit={handleSubmit} noValidate>
        <label className="keyword-label" htmlFor="keywords">
          Enter keywords to analyze
        </label>
        <p className="keyword-hint">
          e.g. "cloud migration", "Google Workspace migration tool", "file transfer to SharePoint"
        </p>
        <div className="keyword-row">
          <input
            id="keywords"
            type="text"
            className={`keyword-field${validationError ? ' keyword-field--error' : ''}`}
            value={value}
            onChange={e => { setValue(e.target.value); setValidationError(''); }}
            placeholder="cloud storage migration tools..."
            disabled={isLoading}
            maxLength={300}
            aria-describedby={validationError ? 'kw-error' : undefined}
          />
          <button
            type="submit"
            className="keyword-btn"
            disabled={isLoading || value.trim().length < 2}
          >
            {isLoading ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
        {validationError && (
          <p id="kw-error" className="keyword-error" role="alert">{validationError}</p>
        )}
      </form>
    </section>
  );
}

export default KeywordInput;
