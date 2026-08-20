import mongoose from 'mongoose';

export async function connectDB(): Promise<void> {
  try {
    const mongoUri = process.env['MONGO_URI'] ?? 'mongodb://127.0.0.1:27017/reminders_app_db';
    await mongoose.connect(mongoUri);
    console.log('[DATABASE] MongoDB connection established successfully.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[DATABASE ERROR] Connection failure: ${message}`);
    process.exit(1);
  }
}
