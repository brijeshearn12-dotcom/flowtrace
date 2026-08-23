import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AgentEditService } from '../server/services/agentEditService';
import { connectDB, closeDB, getDb } from '../server/db';
import { COLLECTIONS, WorkflowRepository, VersionRepository } from '../persistence';
import { VersionService } from '../server/services/versionService';
import { Trigger, Node, Edge } from '../shared/ir';
import express from 'express';
import { Server } from 'http';
import workflowsRouter from '../server/routes/workflows';

describe('Fallback and Stale-Version Protection Tests', () => {
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

  it('1. should verify deterministic agent proposals work without an API key (supported instructions)', () => {
    // Test supported prompt for order placed
    const result1 = AgentEditService.generateProposal('wf_order_placed', 'Insert a slack notification step after fraud check');
    expect(result1.success).toBe(true);
    expect(result1.explanation).toContain('slack notification');
    expect(result1.patch.length).toBeGreaterThan(0);
    expect(result1.warning).toBeUndefined();

    // Test supported prompt for asset request approval
    const result2 = AgentEditService.generateProposal('wf_asset_request_approval', 'Change approval channel to #general');
    expect(result2.success).toBe(true);
    expect(result2.explanation).toContain('Slack channel');
    expect(result2.patch.length).toBe(1);
    expect(result2.patch[0]).toEqual({
      op: 'replace',
      path: '/nodes/0/inputs/channel',
      value: '#general'
    });
  });

  it('2. should return warning and empty patch for unknown instructions', () => {
    const result = AgentEditService.generateProposal('wf_order_placed', 'do something completely random');
    expect(result.success).toBe(false);
    expect(result.explanation).toContain('Warning: Unknown instruction');
    expect(result.patch).toEqual([]);
    expect(result.warning).toContain('Supported instructions include');
  });

  it('3. should verify concurrency protection blocks stale base version edits on PATCH /api/workflows/:id', async () => {
    if (!isDbAvailable) return;

    // Create workflow (version 1)
    await VersionService.createWorkflow('wf_conflict_test', 'Conflict Test', trigger, initialNodes, initialEdges);

    // Save a valid edit to move workflow to version 2
    const patch = [{ op: 'replace' as const, path: '/nodes/0/name', value: 'Updated Step Name' }];
    const saveRes1 = await fetch(`http://localhost:${port}/api/workflows/wf_conflict_test?baseVersion=1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    expect(saveRes1.status).toBe(200);

    // Try saving another edit with stale baseVersion = 1 (current latest is now 2)
    const stalePatch = [{ op: 'replace' as const, path: '/nodes/0/inputs/channel', value: '#stale' }];
    const saveRes2 = await fetch(`http://localhost:${port}/api/workflows/wf_conflict_test?baseVersion=1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stalePatch)
    });

    // Should return 409 Conflict or 500 containing stale error
    expect(saveRes2.status).toBeGreaterThanOrEqual(400);

    // Verify database state: latest version remains 2, and version 2 inputs remain unchanged by the stale request
    const wf = await WorkflowRepository.get('wf_conflict_test');
    expect(wf!.latestVersion).toBe(2);

    const v2Doc = await VersionRepository.getByVersion('wf_conflict_test', 2);
    expect(v2Doc!.nodes[0].inputs.channel).toBe('#ops'); // Not overwritten by #stale
  });

  it('4. should verify concurrency protection blocks stale publish requests, preserving current published version', async () => {
    if (!isDbAvailable) return;

    // Create workflow (version 1)
    await VersionService.createWorkflow('wf_conflict_test', 'Conflict Test', trigger, initialNodes, initialEdges);

    // Publish Version 1
    const publishRes1 = await fetch(`http://localhost:${port}/api/workflows/wf_conflict_test/publish?baseVersion=1`, {
      method: 'POST'
    });
    expect(publishRes1.status).toBe(200);

    // Create a new draft (version 2)
    const patch = [{ op: 'replace' as const, path: '/nodes/0/name', value: 'Draft Edits' }];
    await VersionService.createDraft('wf_conflict_test', 1, patch);

    // Try to publish with stale baseVersion = 1 (current latest version is 2)
    const stalePublishRes = await fetch(`http://localhost:${port}/api/workflows/wf_conflict_test/publish?baseVersion=1`, {
      method: 'POST'
    });

    // Should return 409 Conflict
    expect(stalePublishRes.status).toBe(409);

    // Verify currently published version in workflow doc is still version 1
    const wf = await WorkflowRepository.get('wf_conflict_test');
    expect(wf!.status).toBe('draft'); // Stale publish failed, so parent remains in draft state base on v2
    
    // The previous published version 1 remains unchanged in database
    const publishedVer = await VersionRepository.getByVersion('wf_conflict_test', 1);
    expect(publishedVer!.nodes[0].name).toBe('Initial Step'); // Safe
  });
});
