const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generatePrompts(keywords) {
  const systemPrompt = `You are a helpful assistant that generates realistic search queries and questions.
When given keywords, you return exactly 10 questions that real users would type into an AI chatbot
when researching those topics. Return ONLY a valid JSON object with a "questions" key containing an array of 10 strings.`;

  const userPrompt = `Generate 10 realistic user questions about: "${keywords}"
Focus on questions that involve comparing tools, asking for recommendations, or seeking best practices.
Return format: {"questions": ["question 1", "question 2", ..., "question 10"]}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 1400,
    response_format: { type: 'json_object' }
  });

  const raw = response.choices[0]?.message?.content || '{}';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Failed to parse prompt list from OpenAI response.');
  }

  const prompts = Array.isArray(parsed)
    ? parsed
    : parsed.questions || parsed.prompts || Object.values(parsed)[0];

  if (!Array.isArray(prompts) || prompts.length === 0) {
    throw new Error('OpenAI did not return a valid list of prompts.');
  }

  return prompts.map(String);
}

module.exports = { generatePrompts };
