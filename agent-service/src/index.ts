/**
 * RunCoach Agent Service
 *
 * Standalone AI agent service using LangGraph-style workflows.
 */

import app, { agent } from './api/server';
import { config } from './config/env';
import { scheduleCheckpointCleanup } from './jobs/checkpointCleanup';
import { verifyStartup } from './utils/startupVerification';

const PORT = config.port;

async function start() {
  try {
    console.log('🚀 Starting RunCoach Agent Service...\n');

    // Run comprehensive startup verification
    // This will check database, create checkpoint tables if needed, and verify env vars
    await verifyStartup();

    // Initialize agent and checkpoint saver
    console.log('🤖 Initializing LangGraph agent...');
    await agent.initialize();

    // Schedule checkpoint cleanup job (runs daily at 2 AM)
    scheduleCheckpointCleanup(90); // Keep checkpoints for 90 days

    // Start Express server
    app.listen(PORT, () => {
      console.log('\n✅ RunCoach Agent Service Running');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`✓ Server: http://localhost:${PORT}`);
      console.log(`✓ Health: http://localhost:${PORT}/health`);
      console.log(`✓ Backend API: ${config.backendApiUrl}`);
      console.log(`✓ Environment: ${config.nodeEnv}`);
      console.log(`✓ Checkpoint: PostgreSQL (persistent)`);
      console.log(`✓ Default Model: ${config.defaultModel}`);
      console.log(`✓ Mini Model: ${config.miniModel}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('Ready to receive chat requests! 🎯\n');
    });
  } catch (error) {
    console.error('\n❌ Failed to start agent service:', error);
    process.exit(1);
  }
}

start();
