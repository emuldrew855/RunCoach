/**
 * Environment Configuration for Agent Service
 */

import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3002'),
  nodeEnv: process.env.NODE_ENV || 'development',

  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  defaultModel: process.env.DEFAULT_MODEL || 'gpt-4o',
  miniModel: process.env.MINI_MODEL || 'gpt-4o-mini',

  // Backend API
  backendApiUrl: process.env.BACKEND_API_URL || 'http://localhost:3001',
  backendServiceToken: process.env.BACKEND_SERVICE_TOKEN || '',

  // Security
  serviceSecret: process.env.SERVICE_SECRET || '',

  // Token Limits
  dailyTokenLimit: parseInt(process.env.DAILY_TOKEN_LIMIT || '50000'),

  // Database (for checkpoint persistence)
  databaseUrl: process.env.DATABASE_URL || '',
};

// Validation
if (!config.openaiApiKey) {
  console.warn('⚠️ OPENAI_API_KEY not set');
}

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required for checkpoint persistence');
}

if (!config.serviceSecret && config.nodeEnv === 'production') {
  throw new Error('SERVICE_SECRET must be set in production');
}
