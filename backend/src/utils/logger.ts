/**
 * Azure-compatible logger utility
 * Writes to stderr for reliable capture in Azure App Service logs
 * Uses JSON format for structured logging
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  [key: string]: unknown;
}

function writeLog(level: LogLevel, event: string, data: Record<string, unknown> = {}): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  };

  const output = JSON.stringify(entry);

  // Use console.log for all environments - most reliable for Azure Log Stream UI
  console.log(output);

  // Also write ERROR level to stderr so Azure can highlight them
  if (level === 'ERROR') {
    process.stderr.write(output + '\n');
  }
}

export const logger = {
  debug: (event: string, data?: Record<string, unknown>) => writeLog('DEBUG', event, data),
  info: (event: string, data?: Record<string, unknown>) => writeLog('INFO', event, data),
  warn: (event: string, data?: Record<string, unknown>) => writeLog('WARN', event, data),
  error: (event: string, data?: Record<string, unknown>) => writeLog('ERROR', event, data),
};

export default logger;
