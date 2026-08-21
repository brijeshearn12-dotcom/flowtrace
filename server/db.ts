import { MongoClient, Db } from 'mongodb';
import { join } from 'path';

// Natively load .env variables if supported (Node 20.6.0+)
try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(join(process.cwd(), '.env'));
  }
} catch (error) {
  // Ignored if .env file is missing or already loaded via CLI
}

let client: MongoClient | null = null;
let db: Db | null = null;


/**
 * Initializes and connects to the MongoDB client and database.
 * Reuses the existing connection if already established.
 */
export async function connectDB(): Promise<{ client: MongoClient; db: Db }> {
  if (client && db) {
    return { client, db };
  }

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;

  if (!uri) {
    throw new Error('Database initialization failed: MONGODB_URI environment variable is missing');
  }
  if (!dbName) {
    throw new Error('Database initialization failed: MONGODB_DB environment variable is missing');
  }

  try {
    // Create a new MongoClient.
    // Ensure we do not print the URI or credentials in any console output.
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    console.log('Successfully connected to MongoDB');
    return { client, db };
  } catch (error) {
    // Avoid exposing credentials or raw URI in logs.
    const cleanErrorMessage = error instanceof Error ? error.message : String(error);
    // Remove any potential MongoDB URI details from error message if present.
    const safeErrorMessage = cleanErrorMessage.replace(/mongodb\+srv:\/\/.*@/g, 'mongodb+srv://<credentials>@');
    console.error('Failed to connect to MongoDB:', safeErrorMessage);
    client = null;
    db = null;
    throw new Error(`Failed to connect to MongoDB: ${safeErrorMessage}`);
  }
}

/**
 * Returns the active Db instance. Throws if not initialized.
 */
export function getDb(): Db {
  if (!db) {
    throw new Error('Database not initialized. Call connectDB first.');
  }
  return db;
}

/**
 * Returns the active MongoClient instance. Throws if not initialized.
 */
export function getClient(): MongoClient {
  if (!client) {
    throw new Error('Database client not initialized. Call connectDB first.');
  }
  return client;
}

/**
 * Closes the active MongoDB connection.
 */
export async function closeDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('MongoDB connection closed');
  }
}
