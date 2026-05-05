const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Queries ChatGPT (gpt-4o-mini) via chat completions.
 * Returns { text, citations: [] }
 */
async function queryOpenAI(prompt) {
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    max_tokens: 1000
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error('Empty response from OpenAI');

  return { text, citations: [] };
}

module.exports = { queryOpenAI };
