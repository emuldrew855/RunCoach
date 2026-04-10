// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { telemetryMiddleware, sessionTrackingMiddleware } from './middleware/telemetry';
import { testConnection, runMigrations } from './config/database';
import { startWeeklyAnalysisJob } from './agent/jobs/weekly-analysis.job';
import { startRunnerTendencyJob } from './jobs/runner-tendency.job';
import { startCoachingResponseJob } from './jobs/coaching-response.job';
import logger from './utils/logger';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(compression());
// Use morgan with stderr stream for Azure App Service compatibility
app.use(morgan('combined', {
  stream: {
    write: (message: string) => {
      process.stderr.write(`[HTTP] ${message}`);
    }
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Telemetry tracking (must be before routes)
app.use(telemetryMiddleware);
app.use(sessionTrackingMiddleware);

// Health check endpoint (unversioned - standard practice)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint to verify OAuth configuration (helps troubleshoot Strava redirect issues)
app.get('/debug/oauth-config', (_req, res) => {
  const redirectUri = process.env.STRAVA_REDIRECT_URI || '';
  const clientId = process.env.STRAVA_CLIENT_ID || '';

  // Build the exact URL that will be sent to Strava
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=read,activity:read_all,profile:read_all`;

  res.json({
    timestamp: new Date().toISOString(),
    config: {
      STRAVA_CLIENT_ID: clientId,
      STRAVA_REDIRECT_URI: redirectUri,
      STRAVA_REDIRECT_URI_LENGTH: redirectUri.length,
      STRAVA_REDIRECT_URI_ENCODED: encodeURIComponent(redirectUri),
      FRONTEND_URL: process.env.FRONTEND_URL || '[NOT SET]',
    },
    generatedAuthUrl: authUrl,
    checks: {
      hasHttps: redirectUri.startsWith('https://'),
      hasTrailingWhitespace: redirectUri !== redirectUri.trim(),
      hasLeadingWhitespace: redirectUri !== redirectUri.trimStart(),
    }
  });
});

// Backward compatibility redirect for Strava OAuth callback
// This allows the old /api/auth/callback URL to work while Strava app settings are updated
app.get('/api/auth/callback', (req, res) => {
  const queryString = new URLSearchParams(req.query as any).toString();
  res.redirect(301, `/api/v1/auth/callback?${queryString}`);
});

app.get('/api/auth/strava', (_req, res) => {
  res.redirect(301, '/api/v1/auth/strava');
});

app.get('/api/auth/strava/callback', (req, res) => {
  const queryString = new URLSearchParams(req.query as any).toString();
  res.redirect(301, `/api/v1/auth/callback?${queryString}`);
});

// API routes (v1)
app.use('/api/v1', routes);

// Error handler (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Test database connection
    logger.info('DATABASE_CONNECTION_TEST');
    const isConnected = await testConnection();

    if (!isConnected) {
      throw new Error('Failed to connect to database');
    }
    logger.info('DATABASE_CONNECTION_SUCCESS');

    // Run migrations
    logger.info('DATABASE_MIGRATIONS_START');
    await runMigrations();
    logger.info('DATABASE_MIGRATIONS_COMPLETE');

    // Start listening
    app.listen(PORT, () => {
      logger.info('SERVER_STARTUP', {
        port: PORT,
        nodeEnv: process.env.NODE_ENV || 'development',
        frontendUrl: process.env.FRONTEND_URL,
        stravaClientId: process.env.STRAVA_CLIENT_ID,
        stravaRedirectUri: process.env.STRAVA_REDIRECT_URI,
        databaseUrl: process.env.DATABASE_URL ? '[SET]' : '[MISSING]',
        openaiApiKey: process.env.OPENAI_API_KEY ? '[SET]' : '[MISSING]',
        jwtSecret: process.env.JWT_SECRET ? '[SET]' : '[MISSING]',
      });

      // Start scheduled jobs
      startWeeklyAnalysisJob();
      startRunnerTendencyJob();
      startCoachingResponseJob();
    });
  } catch (error) {
    logger.error('SERVER_STARTUP_FAILED', { error: String(error) });
    process.exit(1);
  }
}

startServer();

export default app;
