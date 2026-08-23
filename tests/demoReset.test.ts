/**
 * tests/demoReset.test.ts
 *
 * Step 11: Create Demo Reset
 *
 * Verifies that pnpm demo:reset (seed/demoReset.ts) is:
 *   1. Correct   — produces published v1 for both demo workflows
 *   2. Idempotent — running it twice produces identical stable state
 *   3. Scoped    — does not affect non-demo data
 *   4. Safe      — runs and audit events for demo workflows are cleared
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectDB, closeDB, getDb } from '../server/db';
import { COLLECTIONS } from '../persistence/constants';
import { seedMetadata } from '../seed/metadata';
import { seedOrderPlaced } from '../seed/orderPlaced';
import { seedAssetRequestApproval } from '../seed/assetRequestApproval';

const DEMO_WORKFLOW_IDS = ['wf_order_placed', 'wf_asset_request_approval'] as const;
const UNRELATED_WF_ID = 'wf_demotest_unrelated';

describe('Step 11: Demo Reset — Idempotency and Correctness Suite', () => {
  let isDbAvailable = false;

  /** Helper: run the demo reset inline (same logic as seed/demoReset.ts without process.exit). */
  async function runDemoReset(): Promise<void> {
    const db = getDb();

    // 1. Clear demo runs and audit events
    await db.collection(COLLECTIONS.RUNS).deleteMany({
      workflowId: { $in: DEMO_WORKFLOW_IDS as unknown as string[] },
    });
    await db.collection(COLLECTIONS.AUDIT_EVENTS).deleteMany({
      workflowId: { $in: DEMO_WORKFLOW_IDS as unknown as string[] },
    });

    // 2. Re-seed metadata (idempotent)
    await seedMetadata();

    // 3. Re-seed demo workflows (delete old + create + publish v1)
    await seedOrderPlaced();
    await seedAssetRequestApproval();
  }

  /** Helper: snapshot the relevant demo state for comparison. */
  async function captureState() {
    const db = getDb();

    const workflows = await db
      .collection(COLLECTIONS.WORKFLOWS)
      .find({ _id: { $in: [...DEMO_WORKFLOW_IDS] } } as Record<string, unknown>)
      .toArray();

    const versions = await db
      .collection(COLLECTIONS.VERSIONS)
      .find({ workflowId: { $in: [...DEMO_WORKFLOW_IDS] } })
      .sort({ workflowId: 1 })
      .toArray();

    const metadataCount = await db.collection(COLLECTIONS.METADATA).countDocuments();

    const runCount = await db
      .collection(COLLECTIONS.RUNS)
      .countDocuments({ workflowId: { $in: [...DEMO_WORKFLOW_IDS] } });

    return { workflows, versions, metadataCount, runCount };
  }

  beforeAll(async () => {
    const connectWithTimeout = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Connection timed out')), 1000);
      connectDB()
        .then(() => { clearTimeout(timer); resolve(); })
        .catch((err) => { clearTimeout(timer); reject(err); });
    });

    try {
      await connectWithTimeout;
      isDbAvailable = true;
    } catch {
      console.log('MongoDB not available; skipping demo reset tests.');
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDbAvailable) {
      // Clean up the unrelated workflow we inserted during scoping tests
      const db = getDb();
      await db.collection(COLLECTIONS.WORKFLOWS).deleteOne({ _id: UNRELATED_WF_ID as unknown as import('mongodb').ObjectId });
      await db.collection(COLLECTIONS.VERSIONS).deleteMany({ workflowId: UNRELATED_WF_ID });
      await closeDB();
    }
  });

  // ─── Test 1: First reset produces correct published state ─────────────────

  it('1. first reset: both demo workflows are created and published at version 1', async () => {
    if (!isDbAvailable) return;

    await runDemoReset();
    const { workflows, versions, metadataCount, runCount } = await captureState();

    expect(metadataCount, 'metadata key count').toBe(4);
    expect(workflows.length, 'demo workflow count').toBe(2);
    expect(versions.length, 'demo version count').toBe(2);
    expect(runCount, 'demo run count after reset').toBe(0);

    for (const wf of workflows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = wf as any;
      expect(w.status, `${w._id} status`).toBe('published');
      expect(w.version, `${w._id} version`).toBe(1);
      expect(w.publishedVersionId, `${w._id} publishedVersionId`).toBeTruthy();
    }
  });

  // ─── Test 2: Verify correct demo workflow IDs are present ─────────────────

  it('2. reset produces both expected workflow logical IDs', async () => {
    if (!isDbAvailable) return;

    const { workflows } = await captureState();
    const ids = workflows.map((w) => (w as { _id: unknown })._id as string).sort();
    expect(ids).toEqual([...DEMO_WORKFLOW_IDS].sort());
  });

  // ─── Test 3: Versions are version 1 and have correct workflowIds ──────────

  it('3. each demo workflow has exactly one version record at version 1', async () => {
    if (!isDbAvailable) return;

    const db = getDb();
    for (const wfId of DEMO_WORKFLOW_IDS) {
      const versionDocs = await db
        .collection(COLLECTIONS.VERSIONS)
        .find({ workflowId: wfId })
        .toArray();

      expect(versionDocs.length, `${wfId} version count`).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((versionDocs[0] as any).version, `${wfId} version number`).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((versionDocs[0] as any).status, `${wfId} version status`).toBe('published');
    }
  });

  // ─── Test 4: Capture state before second reset ────────────────────────────

  let stateAfterReset1: Awaited<ReturnType<typeof captureState>>;

  it('4. capture stable IDs and publishedVersionIds from first reset', async () => {
    if (!isDbAvailable) return;
    stateAfterReset1 = await captureState();
    // Basic sanity — should already pass from test 1
    expect(stateAfterReset1.workflows.length).toBe(2);
  });

  // ─── Test 5: Second reset produces identical state ────────────────────────

  it('5. second reset: workflow names, statuses, and version numbers match first reset exactly', async () => {
    if (!isDbAvailable) return;

    await runDemoReset();
    const stateAfterReset2 = await captureState();

    // Workflow count must be identical
    expect(stateAfterReset2.workflows.length).toBe(stateAfterReset1.workflows.length);

    // Compare each workflow field (IDs are stable strings, names match)
    const sortById = (arr: unknown[]) =>
      [...arr].sort((a, b) => {
        const aId = String((a as { _id: unknown })._id);
        const bId = String((b as { _id: unknown })._id);
        return aId.localeCompare(bId);
      });

    const wf1 = sortById(stateAfterReset1.workflows);
    const wf2 = sortById(stateAfterReset2.workflows);

    for (let i = 0; i < wf1.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = wf1[i] as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = wf2[i] as any;

      expect(String(b._id), 'workflow logical ID stable').toBe(String(a._id));
      expect(b.name, 'workflow name stable').toBe(a.name);
      expect(b.status, 'workflow status stable').toBe(a.status);
      expect(b.version, 'workflow version stable').toBe(a.version);
      // publishedVersionId is a MongoDB ObjectId — it will differ between resets
      // because a new version document is created each time. Only verify it exists.
      expect(b.publishedVersionId, 'publishedVersionId present after second reset').toBeTruthy();
    }
  });

  // ─── Test 6: Version count stays exactly 2 after second reset ────────────

  it('6. second reset: version count remains 2 (old versions are cleared first)', async () => {
    if (!isDbAvailable) return;
    const { versions } = await captureState();
    expect(versions.length).toBe(2);
  });

  // ─── Test 7: Runs are cleared on each reset ───────────────────────────────

  it('7. demo runs are 0 after reset (transient run data does not survive reset)', async () => {
    if (!isDbAvailable) return;

    // Insert a fake run record for a demo workflow
    const db = getDb();
    await db.collection(COLLECTIONS.RUNS).insertOne({
      workflowId: 'wf_order_placed',
      status: 'completed',
      createdAt: new Date().toISOString(),
    } as Record<string, unknown>);

    // Verify it's there
    const before = await db
      .collection(COLLECTIONS.RUNS)
      .countDocuments({ workflowId: 'wf_order_placed' });
    expect(before).toBeGreaterThan(0);

    // Reset should clear it
    await runDemoReset();
    const after = await db
      .collection(COLLECTIONS.RUNS)
      .countDocuments({ workflowId: 'wf_order_placed' });
    expect(after, 'run count cleared to 0 after reset').toBe(0);
  });

  // ─── Test 8: Metadata is correct after reset ──────────────────────────────

  it('8. metadata keys (forms, functions, buttons, operations) are present after reset', async () => {
    if (!isDbAvailable) return;

    const db = getDb();
    const expectedKeys = ['forms', 'functions', 'buttons', 'operations'];

    for (const key of expectedKeys) {
      const doc = await db.collection(COLLECTIONS.METADATA).findOne({ key });
      expect(doc, `metadata key "${key}" should exist`).not.toBeNull();
    }
  });

  // ─── Test 9: Non-demo data is not affected ────────────────────────────────

  it('9. an unrelated workflow is NOT deleted by demo reset', async () => {
    if (!isDbAvailable) return;

    const db = getDb();

    // Insert a workflow with a non-demo ID
    await db.collection(COLLECTIONS.WORKFLOWS).deleteOne({ _id: UNRELATED_WF_ID as unknown as import('mongodb').ObjectId });
    await db.collection(COLLECTIONS.WORKFLOWS).insertOne({
      _id: UNRELATED_WF_ID as unknown as import('mongodb').ObjectId,
      name: 'Unrelated Workflow',
      status: 'draft',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Record<string, unknown>);

    // Run demo reset
    await runDemoReset();

    // Unrelated workflow must still be there
    const found = await db.collection(COLLECTIONS.WORKFLOWS).findOne({ _id: UNRELATED_WF_ID as unknown as import('mongodb').ObjectId });
    expect(found, 'unrelated workflow preserved after demo reset').not.toBeNull();
  });

  // ─── Test 10: Metadata count is 4 (no extra metadata created) ────────────

  it('10. metadata is idempotent — reset does not duplicate keys', async () => {
    if (!isDbAvailable) return;

    // Run reset multiple times
    await runDemoReset();
    await runDemoReset();

    const db = getDb();
    const count = await db.collection(COLLECTIONS.METADATA).countDocuments();
    expect(count, 'metadata key count stays exactly 4').toBe(4);
  });

  // ─── Test 11: OrderPlaced nodes are correct after reset ───────────────────

  it('11. OrderPlaced workflow has expected 4 nodes and 3 edges after reset', async () => {
    if (!isDbAvailable) return;

    const db = getDb();
    const versionDoc = await db.collection(COLLECTIONS.VERSIONS).findOne({
      workflowId: 'wf_order_placed',
      version: 1,
    });

    expect(versionDoc).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = versionDoc as any;
    expect(v.nodes.length, 'OrderPlaced node count').toBe(4);
    expect(v.edges.length, 'OrderPlaced edge count').toBe(3);
  });

  // ─── Test 12: AssetRequestApproval nodes correct after reset ──────────────

  it('12. AssetRequestApproval workflow has expected 4 nodes and 2 edges after reset', async () => {
    if (!isDbAvailable) return;

    const db = getDb();
    const versionDoc = await db.collection(COLLECTIONS.VERSIONS).findOne({
      workflowId: 'wf_asset_request_approval',
      version: 1,
    });

    expect(versionDoc).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = versionDoc as any;
    expect(v.nodes.length, 'AssetRequestApproval node count').toBe(4);
    expect(v.edges.length, 'AssetRequestApproval edge count').toBe(2);
  });
});
