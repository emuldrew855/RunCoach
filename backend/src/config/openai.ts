import OpenAI from 'openai';

export const openaiConfig = {
  apiKey: process.env.OPENAI_API_KEY!,
  model: process.env.OPENAI_MODEL || 'gpt-4o',
  maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1000'),
};

export const openai = new OpenAI({
  apiKey: openaiConfig.apiKey,
});
