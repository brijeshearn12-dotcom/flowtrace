import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { connectDB, getDb, getClient, closeDB } from '../server/db';
import { MongoClient, Db } from 'mongodb';

describe('MongoDB Atlas Database Connection Tests', () => {
  beforeAll(async () => {
    // Ensure we start with a clean state.
    await closeDB();
  });

  afterAll(async () => {
    // Clean up connection after tests.
    await closeDB();
  });

  it('1. should connect to MongoDB Atlas and verify connectivity with a ping', async () => {
    const { client, db } = await connectDB();
    expect(client).toBeInstanceOf(MongoClient);
    expect(db).toBeInstanceOf(Db);

    const pingResult = await db.command({ ping: 1 });
    expect(pingResult).toHaveProperty('ok', 1);
  });

  it('2. should reuse the existing connection on subsequent calls', async () => {
    const conn1 = await connectDB();
    const conn2 = await connectDB();

    expect(conn1.client).toBe(conn2.client);
    expect(conn1.db).toBe(conn2.db);

    expect(getClient()).toBe(conn1.client);
    expect(getDb()).toBe(conn1.db);
  });

  it('3. should throw error and handle missing MONGODB_URI environment variable', async () => {
    // Save original MONGODB_URI
    const originalUri = process.env.MONGODB_URI;
    
    // Temporarily close connection and delete env variable
    await closeDB();
    delete process.env.MONGODB_URI;

    try {
      await expect(connectDB()).rejects.toThrow('MONGODB_URI environment variable is missing');
    } finally {
      // Restore original environment variable
      process.env.MONGODB_URI = originalUri;
    }
  });

  it('4. should throw error and handle missing MONGODB_DB environment variable', async () => {
    // Save original MONGODB_DB
    const originalDb = process.env.MONGODB_DB;

    // Temporarily close connection and delete env variable
    await closeDB();
    delete process.env.MONGODB_DB;

    try {
      await expect(connectDB()).rejects.toThrow('MONGODB_DB environment variable is missing');
    } finally {
      // Restore original environment variable
      process.env.MONGODB_DB = originalDb;
    }
  });

  it('5. should not expose raw credentials or uri details in connection errors', async () => {
    // Temporarily close connection and set invalid URI
    await closeDB();
    const originalUri = process.env.MONGODB_URI;
    process.env.MONGODB_URI = 'mongodb+srv://secret_user:secret_pass@invalid-cluster.mongodb.net/?appName=Cluster0';

    try {
      await expect(connectDB()).rejects.toThrow();
      try {
        await connectDB();
      } catch (err: unknown) {
        expect((err as Error).message).not.toContain('secret_pass');
        expect((err as Error).message).not.toContain('secret_user');
      }
    } finally {
      // Restore original environment variable
      process.env.MONGODB_URI = originalUri;
      await closeDB();
    }
  });
});
