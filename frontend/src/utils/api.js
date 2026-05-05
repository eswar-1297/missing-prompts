const BASE = process.env.REACT_APP_API_BASE_URL || '';

export async function runGapAnalysis({ prompt, competitorName, competitorUrl, cloudfuzeUrl }) {
  const res = await fetch(`${BASE}/api/gap-analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, competitorName, competitorUrl, cloudfuzeUrl })
  });

  const payload = await res.json().catch(() => {
    throw new Error(`Server returned ${res.status} with non-JSON body.`);
  });

  if (!res.ok) {
    throw new Error(payload?.error || `Request failed with status ${res.status}`);
  }

  return payload;
}

export async function runAnalysis(keywords) {
  const res = await fetch(`${BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords })
  });

  const payload = await res.json().catch(() => {
    throw new Error(`Server returned ${res.status} with non-JSON body.`);
  });

  if (!res.ok) {
    throw new Error(payload?.error || `Request failed with status ${res.status}`);
  }

  return payload;
}
