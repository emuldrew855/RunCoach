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

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Telemetry tracking (must be before routes)
app.use(telemetryMiddleware);
app.use(sessionTrackingMiddleware);

// Health check endpoint (unversioned - standard practice)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

// API routes (v1)
app.use('/api/v1', routes);

// Error handler (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    // Test database connection
    console.log('Testing database connection...');
    const isConnected = await testConnection();

    if (!isConnected) {
      throw new Error('Failed to connect to database');
    }

    // Run migrations
    console.log('Running database migrations...');
    await runMigrations();

    // Start listening
    app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ API v1 available at http://localhost:${PORT}/api/v1`);
      console.log(`✓ Frontend URL: ${process.env.FRONTEND_URL}`);

      // Start scheduled jobs
      startWeeklyAnalysisJob();
      startRunnerTendencyJob();  // Phase 2: Bi-weekly tendency analysis
      startCoachingResponseJob(); // Phase 2: Daily coaching effectiveness follow-up
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
