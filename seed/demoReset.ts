/**
 * seed/demoReset.ts
 *
 * Demo Reset Script — restores FlowTrace to a known, deterministic demo state.
 *
 * What this does:
 *   1. Clears only the two demo workflow logical records and all their versions.
 *   2. Clears all runs and audit events associated with the demo workflows.
 *   3. Re-seeds project metadata (idempotent upsert — safe to run multiple times).
 *   4. Re-creates both demo workflows as Published Version 1.
 *
 * What this does NOT do:
 *   - It does NOT drop non-demo workflows (any other wf_* IDs are left alone).
 *   - It does NOT require interactive confirmation (use pnpm db:reset for that).
 *   - It does NOT change mock Forms API settings (those are stateless per-request).
 *
 * Usage:
 *   pnpm demo:reset              — reset demo data to known state
 *   pnpm demo:reset --verify     — reset then print a verification summary
 */

import { connectDB, closeDB, getDb } from '../server/db';
import { COLLECTIONS } from '../persistence/constants';
import { seedMetadata } from './metadata';
import { seedOrderPlaced } from './orderPlaced';
import { seedAssetRequestApproval } from './assetRequestApproval';
import { seedUserRegistration } from './userRegistration';

/** Canonical demo workflow IDs — the only logical records this script touches. */
const DEMO_WORKFLOW_IDS = ['wf_order_placed', 'wf_asset_request_approval', 'wf_user_registration'] as const;

async function clearDemoData(): Promise<void> {
  const db = getDb();

  // Clear runs produced by demo workflows
  const deletedRuns = await db.collection(COLLECTIONS.RUNS).deleteMany({
    workflowId: { $in: DEMO_WORKFLOW_IDS as unknown as string[] },
  });

  // Clear audit events produced by demo workflows
  const deletedAudit = await db.collection(COLLECTIONS.AUDIT_EVENTS).deleteMany({
    workflowId: { $in: DEMO_WORKFLOW_IDS as unknown as string[] },
  });

  console.log(`  ✓ Cleared ${deletedRuns.deletedCount} run(s) for demo workflows`);
  console.log(`  ✓ Cleared ${deletedAudit.deletedCount} audit event(s) for demo workflows`);
}

async function verifyDemoState(): Promise<void> {
  const db = getDb();

  const workflows = await db
    .collection(COLLECTIONS.WORKFLOWS)
    .find({ _id: { $in: [...DEMO_WORKFLOW_IDS] } } as Record<string, unknown>)
    .toArray();

  const versions = await db
    .collection(COLLECTIONS.VERSIONS)
    .find({ workflowId: { $in: [...DEMO_WORKFLOW_IDS] } })
    .toArray();

  const metadataCount = await db.collection(COLLECTIONS.METADATA).countDocuments();
  const runCount = await db
    .collection(COLLECTIONS.RUNS)
    .countDocuments({ workflowId: { $in: DEMO_WORKFLOW_IDS as unknown as string[] } });

  console.log('\n=== DEMO RESET VERIFICATION ===');
  console.log(`  Metadata keys:       ${metadataCount} (expected 4: forms, functions, buttons, operations)`);
  console.log(`  Demo workflows:      ${workflows.length} (expected 3)`);
  console.log(`  Demo versions:       ${versions.length} (expected 3 — one per workflow)`);
  console.log(`  Demo runs (cleared): ${runCount} (expected 0)`);

  for (const wf of workflows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = wf as any;
    console.log(`  Workflow: ${w._id}`);
    console.log(`    name:    ${w.name}`);
    console.log(`    status:  ${w.status} (expected: published)`);
    console.log(`    version: ${w.latestVersion ?? w.version} (expected: 1)`);
    console.log(`    publishedVersionId: ${w.publishedVersionId ?? '(none)'}`);
  }

  const issues: string[] = [];
  if (workflows.length !== 3) issues.push(`Expected 3 demo workflows, got ${workflows.length}`);
  if (versions.length !== 3) issues.push(`Expected 3 demo versions, got ${versions.length}`);
  if (metadataCount !== 4) issues.push(`Expected 4 metadata keys, got ${metadataCount}`);
  if (runCount !== 0) issues.push(`Expected 0 demo runs after reset, got ${runCount}`);
  for (const wf of workflows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = wf as any;
    if (w.status !== 'published') issues.push(`Workflow ${w._id} status is "${w.status}", expected "published"`);
    if ((w.latestVersion ?? w.version) !== 1) issues.push(`Workflow ${w._id} version is ${w.latestVersion ?? w.version}, expected 1`);
    if (!w.publishedVersionId) issues.push(`Workflow ${w._id} missing publishedVersionId`);
  }

  if (issues.length === 0) {
    console.log('\n✅ Demo state verified — all checks passed.');
  } else {
    console.error('\n❌ Demo verification FAILED:');
    for (const issue of issues) {
      console.error(`   - ${issue}`);
    }
    process.exit(1);
  }
}

async function demoReset(): Promise<void> {
  const shouldVerify = process.argv.includes('--verify');

  console.log('=== FLOWTRACE DEMO RESET ===');
  console.log(`Resetting: ${DEMO_WORKFLOW_IDS.join(', ')}`);
  console.log('This will NOT affect any non-demo workflows.\n');

  console.log('[1/4] Connecting to database...');
  await connectDB();

  console.log('[2/4] Clearing demo workflow runs and audit events...');
  await clearDemoData();

  console.log('[3/4] Re-seeding project metadata...');
  await seedMetadata();

  console.log('[4/4] Re-seeding demo workflows (create + publish v1)...');
  await seedOrderPlaced();
  await seedAssetRequestApproval();
  await seedUserRegistration();

  console.log('\n=== DEMO RESET COMPLETE ===');
  console.log('All three demo workflows are now Published Version 1.');
  console.log('Mock Forms API is stateless — no API state to reset.');
  console.log('To run the application:  pnpm dev');
  console.log('To run tests:            pnpm test');

  if (shouldVerify) {
    await verifyDemoState();
  }
}



demoReset()
  .then(async () => {
    await closeDB();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\nDemo reset failed:', err);
    try {
      await closeDB();
    } catch {
      // Ignore close errors on failure path
    }
    process.exit(1);
  });
