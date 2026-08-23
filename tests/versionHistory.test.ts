import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectDB, closeDB, getDb } from '../server/db';
import { COLLECTIONS, WorkflowRepository, VersionRepository } from '../persistence';
import { VersionService } from '../server/services/versionService';
import { Trigger, Node, Edge, Workflow } from '../shared/ir';
import express from 'express';
import { Server } from 'http';
import workflowsRouter from '../server/routes/workflows';

describe('Version History API and Safety Tests', () => {
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

  it('1, 2 & 3. should verify that creating and publishing multiple versions preserves source, status, summary, and creation time', async () => {
    if (!isDbAvailable) return;

    // 1. Create a workflow draft (version 1)
    await VersionService.createWorkflow(
      'wf_history_test',
      'History Test',
      trigger,
      initialNodes,
      initialEdges,
      { source: 'agent', summary: 'Initial requirement detection' }
    );

    // Publish Version 1
    await VersionService.publishVersion('wf_history_test', 1);

    // 2. Create a second version (draft version 2)
    const patch = [{ op: 'replace' as const, path: '/nodes/0/inputs/channel', value: '#billing' }];
    await VersionService.createDraft(
      'wf_history_test',
      1,
      patch,
      { source: 'manual', summary: 'Updated invoice slack channel' }
    );

    // Publish Version 2
    await VersionService.publishVersion('wf_history_test', 2);

    // Fetch Version History list
    const res = await fetch(`http://localhost:${port}/api/workflows/wf_history_test/history`);
    expect(res.status).toBe(200);

    const history = (await res.json()) as Array<{ version: number; source: string; summary: string; createdAt: string }>;
    expect(history.length).toBe(2);

    // Sort by version descending just in case (the API should already do this)
    history.sort((a, b) => b.version - a.version);

    // Verify Version 2 details
    expect(history[0].version).toBe(2);
    expect(history[0].source).toBe('manual');
    expect(history[0].summary).toBe('Updated invoice slack channel');
    expect(history[0].createdAt).toBeDefined();

    // Verify Version 1 details
    expect(history[1].version).toBe(1);
    expect(history[1].source).toBe('agent');
    expect(history[1].summary).toBe('Initial requirement detection');
    expect(history[1].createdAt).toBeDefined();
  });

  it('4. should inspect an older version without modifying or breaking immutability rules', async () => {
    if (!isDbAvailable) return;

    // Create and publish Version 1
    await VersionService.createWorkflow(
      'wf_history_test',
      'History Test',
      trigger,
      initialNodes,
      initialEdges,
      { source: 'agent', summary: 'Initial requirement detection' }
    );
    await VersionService.publishVersion('wf_history_test', 1);

    // Create and publish Version 2
    const patch = [{ op: 'replace' as const, path: '/nodes/0/inputs/channel', value: '#billing' }];
    await VersionService.createDraft(
      'wf_history_test',
      1,
      patch,
      { source: 'manual', summary: 'Updated invoice slack channel' }
    );
    await VersionService.publishVersion('wf_history_test', 2);

    // Fetch Version 1 details (read-only inspection)
    const res = await fetch(`http://localhost:${port}/api/workflows/wf_history_test?version=1`);
    expect(res.status).toBe(200);

    const v1Workflow = (await res.json()) as Workflow;
    expect(v1Workflow.version).toBe(1);
    expect((v1Workflow.nodes[0].inputs as Record<string, string>).channel).toBe('#ops');

    // Fetch Version 2 details
    const res2 = await fetch(`http://localhost:${port}/api/workflows/wf_history_test?version=2`);
    expect(res2.status).toBe(200);

    const v2Workflow = (await res2.json()) as Workflow;
    expect(v2Workflow.version).toBe(2);
    expect((v2Workflow.nodes[0].inputs as Record<string, string>).channel).toBe('#billing');

    // Verify database state pointers are correct (version 2 is current published, version 1 remains intact)
    const wf = await WorkflowRepository.get('wf_history_test');
    expect(wf!.latestVersion).toBe(2);
    expect(wf!.status).toBe('published');

    const v1Doc = await VersionRepository.getByVersion('wf_history_test', 1);
    expect(v1Doc!.nodes[0].inputs.channel).toBe('#ops'); // immutable
  });
});
