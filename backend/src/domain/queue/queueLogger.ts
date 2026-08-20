import fs from 'fs/promises';
import path from 'path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const logFilePath = path.join(process.cwd(), 'logs', 'system-queue.log');

// Fire-and-forget directory creation at module load, same as the original.
void fs.mkdir(path.dirname(logFilePath), { recursive: true }).catch(console.error);

export async function logToFile(level: LogLevel, context: string, message: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level.toUpperCase()}] [${context.toUpperCase()}] ${message}\n`;
  try {
    await fs.appendFile(logFilePath, logLine, 'utf8');
  } catch (err) {
    const message2 = err instanceof Error ? err.message : String(err);
    console.error(`CRITICAL: Failed writing logs to file: ${message2}`);
  }
}
