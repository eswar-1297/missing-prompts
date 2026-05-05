import React, { useState } from 'react';
import './App.css';
import KeywordInput from './components/KeywordInput';
import Dashboard from './components/Dashboard';
import { runAnalysis } from './utils/api';

function App() {
  const [status, setStatus] = useState('idle');
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (keywords) => {
    setStatus('loading');
    setData(null);
    setErrorMsg('');

    try {
      const result = await runAnalysis(keywords);
      setData(result);
      setStatus('success');
    } catch (err) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
      setStatus('error');
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <h1 className="app-title">CloudFuze AI Visibility Monitor</h1>
          <p className="app-subtitle">
            See how ChatGPT and Gemini respond to queries about your market — and where CloudFuze ranks.
          </p>
        </div>
      </header>

      <main className="app-main">
        <KeywordInput onSubmit={handleSubmit} isLoading={status === 'loading'} />

        {status === 'loading' && (
          <div className="loading-container">
            <div className="spinner" />
            <p className="loading-text">
              Generating prompts and querying AI models... this may take 15-30 seconds.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="error-banner" role="alert">
            <strong>Error:</strong> {errorMsg}
          </div>
        )}

        {status === 'success' && data && (
          <Dashboard data={data} />
        )}
      </main>

      <footer className="app-footer">
        <p>CloudFuze AI Visibility Monitor &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

export default App;
