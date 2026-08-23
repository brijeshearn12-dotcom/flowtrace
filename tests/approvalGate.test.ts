import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectDB, closeDB, getDb } from '../server/db';
import { COLLECTIONS, WorkflowRepository, VersionRepository } from '../persistence';
import { VersionService } from '../server/services/versionService';
import { Trigger, Node, Edge } from '../shared/ir';
import express from 'express';
import { Server } from 'http';
import workflowsRouter from '../server/routes/workflows';

describe('Approval Gate and Publish Safety Tests', () => {
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
  const validNodes: Node[] = [
    { id: 'step_1', name: 'Step One', type: 'action', action: 'Slack.post', inputs: { message: 'hello' } }
  ];
  const validEdges: Edge[] = [];

  it('1 & 2. should create a valid draft and publish it successfully, verifying a new version is created', async () => {
    if (!isDbAvailable) return;

    // 1. Create a starting workflow (status = draft, version = 1)
    await VersionService.createWorkflow('wf_gate_test', 'Gate Test', trigger, validNodes, validEdges);

    // 2. Publish version 1 successfully by supplying baseVersion
    const res = await fetch(`http://localhost:${port}/api/workflows/wf_gate_test/publish?baseVersion=1`, {
      method: 'POST'
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean; workflow: { status: string; version: number } };
    expect(data.success).toBe(true);
    expect(data.workflow.status).toBe('published');
    expect(data.workflow.version).toBe(1);

    // Verify in db
    const wf = await WorkflowRepository.get('wf_gate_test');
    expect(wf!.status).toBe('published');
    expect(wf!.latestVersion).toBe(1);
    expect(wf!.publishedVersionId).not.toBeNull();

    // Verify a new version document is in place
    const versionDoc = await VersionRepository.getByVersion('wf_gate_test', 1);
    expect(versionDoc).not.toBeNull();
  });

  it('3. should try publishing an invalid draft and verify it is blocked', async () => {
    if (!isDbAvailable) return;

    // Create starting workflow
    await VersionService.createWorkflow('wf_gate_test', 'Gate Test', trigger, validNodes, validEdges);

    // Create an invalid draft update (adds a step referencing a non-existent step, violating validator rules)
    const invalidPatch = [
      {
        op: 'add' as const,
        path: '/nodes/0',
        value: {
          id: 'invalid_node',
          name: 'Invalid Node',
          type: 'action' as const,
          action: 'Slack.post',
          inputs: {
            message: '{{non_existent.output}}' // invalid reference path
          }
        }
      }
    ];

    // Note: createDraft checks validator internally, so to simulate an invalid draft that bypassed checks
    // or is syntactically invalid at runtime, we can bypass the draft creation validation by inserting it
    // into db or simply check if validation rejects.
    // Wait, VersionService.publishVersion runs validator on publish. Let's create an invalid version directly in VersionRepository:
    await VersionRepository.create({
      workflowId: 'wf_gate_test',
      version: 2,
      trigger,
      nodes: [
        {
          id: 'step_invalid',
          name: 'Step Invalid',
          type: 'action',
          action: 'Slack.post',
          inputs: { message: '{{non_existent_node.result}}' }
        }
      ],
      edges: []
    });
    await WorkflowRepository.update('wf_gate_test', { latestVersion: 2 });

    // Now try to publish this invalid version 2
    const res = await fetch(`http://localhost:${port}/api/workflows/wf_gate_test/publish?baseVersion=2`, {
      method: 'POST'
    });

    // Verify blocked with 422 Unprocessable Entity
    expect(res.status).toBe(422);
    const data = (await res.json()) as { success: boolean; errors: unknown[] };
    expect(data.success).toBe(false);
    expect(data.errors.length).toBeGreaterThan(0);

    // Verify workflow status in db is still draft
    const wf = await WorkflowRepository.get('wf_gate_test');
    expect(wf!.status).toBe('draft');
  });

  it('4 & 5. should verify stale versions reject publishing and previous published version remains unchanged', async () => {
    if (!isDbAvailable) return;

    // Create and publish version 1
    const { version: v1 } = await VersionService.createWorkflow('wf_gate_test', 'Gate Test', trigger, validNodes, validEdges);
    await VersionService.publishVersion('wf_gate_test', 1);

    // Create a new draft (version 2)
    const patch = [{ op: 'replace' as const, path: '/nodes/0/name', value: 'Updated Name' }];
    await VersionService.createDraft('wf_gate_test', 1, patch);

    // Simulate publishing with stale baseVersion = 1 (current latest is 2)
    const resStale = await fetch(`http://localhost:${port}/api/workflows/wf_gate_test/publish?baseVersion=1`, {
      method: 'POST'
    });

    expect(resStale.status).toBe(409); // Conflict

    // Verify version 1 document is unchanged in database
    const v1Doc = await VersionRepository.get(v1.id);
    expect(v1Doc!.nodes[0].name).toBe('Step One');
    expect(v1Doc!.version).toBe(1);

    // Verify the workflow status is still draft because version 2 has not been successfully published
    const wf = await WorkflowRepository.get('wf_gate_test');
    expect(wf!.status).toBe('draft');
    expect(wf!.latestVersion).toBe(2);
  });
});
