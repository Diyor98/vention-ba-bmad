type LogLevel = 'info' | 'warn' | 'error';

function log(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  // Single-line JSON for log aggregators.
  // Bypasses console.log so the no-console ESLint rule can ban console.* everywhere else.
  process.stdout.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) =>
    log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    log('error', message, context),
};
