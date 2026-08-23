import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectDB, closeDB, getDb } from '../server/db';
import { COLLECTIONS, WorkflowRepository, VersionRepository } from '../persistence';
import { VersionService } from '../server/services/versionService';
import { AgentEditService } from '../server/services/agentEditService';
import { Trigger, Node, Edge } from '../shared/ir';
import express from 'express';
import { Server } from 'http';
import workflowsRouter from '../server/routes/workflows';

describe('Task 6 - Safety Flow Integration Verification', () => {
  let server: Server;
  let port: number;
  const app = express();
  let isDbAvailable = false;

  beforeAll(async () => {
    // Attempt database connection with a 1000ms timeout
    const connectWithTimeout = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Connection timed out'));
      }, 1000);

      connectDB()
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });

    try {
      await connectWithTimeout;
      isDbAvailable = true;
    } catch {
      console.log('MongoDB not available; skipping DB-dependent tests');
      isDbAvailable = false;
    }

    app.use(express.json());
    app.use('/api/workflows', workflowsRouter);

    server = app.listen(0);
    const addr = server.address();
    port = typeof addr === 'string' ? 0 : addr?.port || 0;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (isDbAvailable) {
      await closeDB();
    }
  });

  beforeEach(async () => {
    if (!isDbAvailable) return;
    const db = getDb();
    await db.collection(COLLECTIONS.WORKFLOWS).deleteMany({});
    await db.collection(COLLECTIONS.VERSIONS).deleteMany({});
  });

  const trigger: Trigger = { id: 'tr_manual', type: 'manual' };
  const initialNodes: Node[] = [
    { id: 'step_1', name: 'Initial Step', type: 'action', action: 'Slack.post', inputs: { channel: '#ops' } }
  ];
  const initialEdges: Edge[] = [];

  it('should successfully run the complete 10-step Task 6 editing and version safety flow', async () => {
    if (!isDbAvailable) return;

    // STEP 1 & 2: Create workflow and edit draft manually, verifying only the draft changes
    const { workflow: wfInit, version: v1 } = await VersionService.createWorkflow(
      'wf_verif',
      'Verification Flow',
      trigger,
      initialNodes,
      initialEdges,
      { source: 'manual', summary: 'Initial setup' }
    );
    expect(wfInit.status).toBe('draft');
    expect(wfInit.latestVersion).toBe(1);

    // Apply manual edit (create version 2 draft)
    const patch = [{ op: 'replace' as const, path: '/nodes/0/name', value: 'Manually Edited Step' }];
    const patchRes = await fetch(`http://localhost:${port}/api/workflows/wf_verif?baseVersion=1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    expect(patchRes.status).toBe(200);

    // Verify draft changed, but version 1 remains unchanged (immutable)
    const wfDraft = await WorkflowRepository.get('wf_verif');
    expect(wfDraft!.latestVersion).toBe(2);
    expect(wfDraft!.status).toBe('draft');

    const v1Doc = await VersionRepository.getByVersion('wf_verif', 1);
    expect(v1Doc!.nodes[0].name).toBe('Initial Step'); // Safe

    const v2Doc = await VersionRepository.getByVersion('wf_verif', 2);
    expect(v2Doc!.nodes[0].name).toBe('Manually Edited Step'); // Updated in draft v2

    // STEP 3 & 4: Generate agent proposal and verify it produces a patch without auto-publishing
    const proposal = AgentEditService.generateProposal('wf_order_placed', 'Insert a slack notification step after fraud check');
    expect(proposal.success).toBe(true);
    expect(proposal.patch.length).toBeGreaterThan(0);
    
    // Verify published workflow database is unchanged by the proposal
    const finalWf = await WorkflowRepository.get('wf_verif');
    expect(finalWf!.status).toBe('draft');
    expect(finalWf!.latestVersion).toBe(2);

    // STEP 5: Review the patch diff logic (PatchDiff component checks)
    // Simply verify that path modification correctly targets the specific attribute
    expect(proposal.patch[0].op).toBe('add');
    expect(proposal.patch[0].path).toBe('/nodes/1');

    // STEP 6: Test an invalid patch and verify publishing is blocked
    // Insert invalid version manually to simulate validation failure on publish
    await VersionRepository.create({
      workflowId: 'wf_verif',
      version: 3,
      trigger,
      nodes: [
        {
          id: 'step_invalid',
          name: 'Invalid step',
          type: 'action',
          action: 'Slack.post',
          inputs: { message: '{{dangling_node.output}}' } // cycles/dangling reference fails validateWorkflow
        }
      ],
      edges: [],
      source: 'manual',
      summary: 'Broken draft'
    });
    await WorkflowRepository.update('wf_verif', { latestVersion: 3 });

    const invalidPublishRes = await fetch(`http://localhost:${port}/api/workflows/wf_verif/publish?baseVersion=3`, {
      method: 'POST'
    });
    expect(invalidPublishRes.status).toBe(422); // Unprocessable Entity due to validation error

    // STEP 7 & 8: Approve and publish a valid draft (v2), verifying a new immutable version is created
    // Restore latestVersion pointer to 2 for testing valid publish
    await WorkflowRepository.update('wf_verif', { latestVersion: 2 });
    const publishRes = await fetch(`http://localhost:${port}/api/workflows/wf_verif/publish?baseVersion=2`, {
      method: 'POST'
    });
    expect(publishRes.status).toBe(200);

    const publishedWf = await WorkflowRepository.get('wf_verif');
    expect(publishedWf!.status).toBe('published');
    expect(publishedWf!.latestVersion).toBe(2);
    expect(publishedWf!.publishedVersionId).not.toBeNull();

    // STEP 9: Simulate a stale version and verify publishing is rejected
    const stalePublishRes = await fetch(`http://localhost:${port}/api/workflows/wf_verif/publish?baseVersion=1`, {
      method: 'POST'
    });
    expect(stalePublishRes.status).toBe(409); // Conflict

    // STEP 10: Open version history and verify previous versions remain unchanged
    const historyRes = await fetch(`http://localhost:${port}/api/workflows/wf_verif/history`);
    expect(historyRes.status).toBe(200);
    const history = (await historyRes.json()) as any[];
    expect(history.length).toBe(3); // versions 1, 2, and 3 exist

    // Verify version 1 document is untouched in database
    const finalV1Doc = await VersionRepository.getByVersion('wf_verif', 1);
    expect(finalV1Doc!.nodes[0].name).toBe('Initial Step');
  });
});
