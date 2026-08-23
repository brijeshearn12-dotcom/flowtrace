import { connectDB, closeDB, getDb } from '../server/db';
import { COLLECTIONS } from '../persistence';
import readline from 'readline';

function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

async function reset(): Promise<void> {
  const hasForceFlag = process.argv.includes('--confirm') || process.argv.includes('--yes') || process.argv.includes('-y');

  if (!hasForceFlag) {
    const question = 'WARNING: This will drop/clear all FlowTrace collections (workflows, versions, runs, audits, metadata). Are you sure? (y/N): ';
    const confirmed = await askConfirmation(question);
    if (!confirmed) {
      console.log('Database reset aborted by user.');
      process.exit(0);
    }
  }

  console.log('Connecting to database...');
  await connectDB();
  const db = getDb();

  const collections = Object.values(COLLECTIONS);
  console.log(`Clearing collections: ${collections.join(', ')}...`);

  for (const colName of collections) {
    try {
      await db.collection(colName).deleteMany({});
      console.log(`  ✓ Cleared collection "${colName}"`);
    } catch (err) {
      console.warn(`  ✗ Failed to clear collection "${colName}":`, err);
    }
  }

  console.log('Database reset successfully.');
}

reset()
  .then(async () => {
    await closeDB();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Database reset failed:', err);
    try {
      await closeDB();
    } catch {
      // Ignore database close errors on failure path
    }
    process.exit(1);
  });
