import { seedMetadata } from './metadata';
import { seedOrderPlaced } from './orderPlaced';
import { seedAssetRequestApproval } from './assetRequestApproval';
import { seedUserRegistration } from './userRegistration';
import { closeDB } from '../server/db';

async function run(): Promise<void> {
  console.log('=== STARTING SEED RUNNER ===');
  await seedMetadata();
  await seedOrderPlaced();
  await seedAssetRequestApproval();
  await seedUserRegistration();
  console.log('=== SEED RUNNER COMPLETE ===');
}

run()
  .then(async () => {
    await closeDB();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Seed runner failed:', err);
    await closeDB();
    process.exit(1);
  });
