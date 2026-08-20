import express from 'express';
import mongoose from 'mongoose';
import { connectDB } from '../config/database.js';
import { BaseJobQueue } from '../domain/queue/baseQueue.js';
import alertRoutes from '../routes/alert.routes.js';
import adminRoutes from '../routes/admin.routes.js';

const app = express();
app.use(express.json());

await connectDB();

export const sharedQueue = new BaseJobQueue(3);
await sharedQueue.recoverStuckJobs();
sharedQueue.startProcessing();

app.use('/api/alerts', alertRoutes);
app.use('/api/admin', adminRoutes);

const PORT = Number(process.env['PORT'] ?? 3000);
const server = app.listen(PORT, () => console.log(`[SERVER] Running engine listening on port ${PORT}`));

async function handleGracefulShutdown(signal: string): Promise<void> {
  console.log(`\n[SIGNAL] Received ${signal}. Starting shutdown routing process...`);
  server.close(() => console.log('[SHUTDOWN] HTTP traffic channel blocked.'));
  try {
    await sharedQueue.shutdown();
    await mongoose.disconnect();
    console.log('[SHUTDOWN] Database safely offline. Terminating environment state.');
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Shutdown err: ${message}`);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void handleGracefulShutdown('SIGINT'));
