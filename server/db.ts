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

const globalRef = globalThis as unknown as {
  __mongoClient?: MongoClient | null;
  __mongoDb?: Db | null;
};

// Retrieve from global cache if available
let client: MongoClient | null = globalRef.__mongoClient || null;
let db: Db | null = globalRef.__mongoDb || null;

/**
 * Initializes and connects to the MongoDB client and database.
 * Reuses the existing connection if already established.
 */
export async function connectDB(): Promise<{ client: MongoClient; db: Db }> {
  // Read again from global cache to ensure other modules' connections are detected
  client = globalRef.__mongoClient || null;
  db = globalRef.__mongoDb || null;

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
    const newClient = new MongoClient(uri);
    await newClient.connect();
    const newDb = newClient.db(dbName);
    
    // Save to global variables and global cache
    client = newClient;
    db = newDb;
    globalRef.__mongoClient = newClient;
    globalRef.__mongoDb = newDb;

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
    globalRef.__mongoClient = null;
    globalRef.__mongoDb = null;
    throw new Error(`Failed to connect to MongoDB: ${safeErrorMessage}`);
  }
}

/**
 * Returns the active Db instance. Throws if not initialized.
 */
export function getDb(): Db {
  const activeDb = db || globalRef.__mongoDb;
  if (!activeDb) {
    throw new Error('Database not initialized. Call connectDB first.');
  }
  return activeDb;
}

/**
 * Returns the active MongoClient instance. Throws if not initialized.
 */
export function getClient(): MongoClient {
  const activeClient = client || globalRef.__mongoClient;
  if (!activeClient) {
    throw new Error('Database client not initialized. Call connectDB first.');
  }
  return activeClient;
}

/**
 * Closes the active MongoDB connection.
 */
export async function closeDB(): Promise<void> {
  const activeClient = client || globalRef.__mongoClient;
  if (activeClient) {
    await activeClient.close();
    client = null;
    db = null;
    globalRef.__mongoClient = null;
    globalRef.__mongoDb = null;
    console.log('MongoDB connection closed');
  }
}
