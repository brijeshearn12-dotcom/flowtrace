import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'http';
import express from 'express';
import { connectDB, closeDB } from '../server/db';
import workflowsRouter from '../server/routes/workflows';
import runsRouter from '../server/routes/runs';
import { seedMetadata } from '../seed/metadata';
import { seedOrderPlaced } from '../seed/orderPlaced';
import { seedAssetRequestApproval } from '../seed/assetRequestApproval';

describe('Workflow Route API Integration Tests', () => {
  let server: Server;
  let port: number;
  const app = express();
  let isDbAvailable = false;

  beforeAll(async () => {
    // Attempt database connection with a 1000ms timeout to prevent test hook timeout
    const connectWithTimeout = new Promise<void>(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Connection timed out'));
      }, 1000);

      try {
        await connectDB();
        clearTimeout(timer);
        resolve();
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });

    try {
      await connectWithTimeout;
      isDbAvailable = true;
    } catch {
      console.log('MongoDB not available; skipping DB-dependent route tests');
      isDbAvailable = false;
    }

    if (isDbAvailable) {
      // Seed the database to ensure test fixtures are present
      await seedMetadata();
      await seedOrderPlaced();
      await seedAssetRequestApproval();
    }

    app.use(express.json());
    app.use('/api/workflows', workflowsRouter);
    app.use('/api/runs', runsRouter);
    
    server = app.listen(0); // Start on dynamic port
    const addr = server.address();
    port = typeof addr === 'string' ? 0 : addr?.port || 0;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (isDbAvailable) {
      await closeDB();
    }
  });

  it('1. should verify LIST workflows returns seeded workflows', async () => {
    if (!isDbAvailable) return;
    const res = await fetch(`http://localhost:${port}/api/workflows`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ id: string }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((w) => w.id === 'wf_order_placed')).toBe(true);
    expect(data.some((w) => w.id === 'wf_asset_request_approval')).toBe(true);
  });

  it('2. should verify GET /api/workflows/wf_order_placed returns correct structure', async () => {
    if (!isDbAvailable) return;
    const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; trigger: { id: string }; nodes: unknown[]; edges: unknown[] };
    expect(data.id).toBe('wf_order_placed');
    expect(data.trigger.id).toBe('tr_order_placed');
    expect(data.nodes.length).toBe(4);
    expect(data.edges.length).toBe(3);
  });

  it('3. should verify GET /api/workflows/wf_asset_request_approval returns correct structure', async () => {
    if (!isDbAvailable) return;
    const res = await fetch(`http://localhost:${port}/api/workflows/wf_asset_request_approval`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; trigger: { id: string }; nodes: unknown[]; edges: unknown[] };
    expect(data.id).toBe('wf_asset_request_approval');
    expect(data.trigger.id).toBe('tr_asset_request');
    expect(data.nodes.length).toBe(4);
    expect(data.edges.length).toBe(2);
  });

  it('4. should verify list of history versions returns versions sorted in descending order', async () => {
    if (!isDbAvailable) return;
    const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/history`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ version: number }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0].version).toBe(1);
  });

  it('5. should support workflow creation draft', async () => {
    if (!isDbAvailable) return;
    const res = await fetch(`http://localhost:${port}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'wf_route_test',
        name: 'Route Test Workflow'
      })
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { success: boolean; workflow: { id: string; status: string; version: number } };
    expect(data.success).toBe(true);
    expect(data.workflow.id).toBe('wf_route_test');
    expect(data.workflow.status).toBe('draft');
    expect(data.workflow.version).toBe(1);
  });

  it('6. should support edit and publication flow', async () => {
    if (!isDbAvailable) return;
    // 1. Get base version 1
    const getRes = await fetch(`http://localhost:${port}/api/workflows/wf_route_test`);
    expect(getRes.status).toBe(200);
    const getData = (await getRes.json()) as { version: number };
    const baseVersion = getData.version;

    // 2. Perform invalid patch edit
    const patchInvalidRes = await fetch(`http://localhost:${port}/api/workflows/wf_route_test?baseVersion=${baseVersion}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          op: 'add',
          path: '/nodes/0',
          value: {
            id: 'invalid-node',
            name: 'Invalid Step',
            type: 'action',
            action: 'Slack.post',
            inputs: { message: '{{non_existent.output}}' }
          }
        }
      ])
    });
    expect(patchInvalidRes.status).toBe(422);

    // 3. Perform valid patch edit
    const patchRes = await fetch(`http://localhost:${port}/api/workflows/wf_route_test?baseVersion=${baseVersion}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          op: 'add',
          path: '/nodes/0',
          value: {
            id: 'valid-node',
            name: 'Valid Step',
            type: 'action',
            action: 'Slack.post',
            inputs: { message: 'hello' }
          }
        }
      ])
    });
    expect(patchRes.status).toBe(200);

    // 3. Publish the valid draft
    const publishRes = await fetch(`http://localhost:${port}/api/workflows/wf_route_test/publish`, {
      method: 'POST'
    });
    expect(publishRes.status).toBe(200);
    const publishData = (await publishRes.json()) as { success: boolean; workflow: { status: string } };
    expect(publishData.success).toBe(true);
    expect(publishData.workflow.status).toBe('published');
  });

  it('7. should return proper 404 error for non-existent workflow IDs', async () => {
    if (!isDbAvailable) return;
    const res = await fetch(`http://localhost:${port}/api/workflows/non_existent`);
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('not found');
  });

  it('8. should execute a workflow, retrieve status, and check logs', async () => {
    if (!isDbAvailable) return;

    // 1. Start OrderPlaced run through the API
    const runRes = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: {
          orderId: 'ORD-ROUTE-TEST-100',
          customerEmail: 'route-test@example.com',
          total: 800
        }
      })
    });

    expect(runRes.status).toBe(201);
    const runData = (await runRes.json()) as {
      success: boolean;
      run: {
        id: string;
        workflowId: string;
        status: string;
        triggerPayload: Record<string, unknown>;
        results: Record<string, any>;
      };
    };

    expect(runData.success).toBe(true);
    expect(runData.run.id).toBeDefined();
    expect(runData.run.workflowId).toBe('wf_order_placed');
    expect(runData.run.status).toBe('success');
    expect(runData.run.triggerPayload.orderId).toBe('ORD-ROUTE-TEST-100');

    const runId = runData.run.id;

    // 2. Retrieve its status
    const statusRes = await fetch(`http://localhost:${port}/api/runs/${runId}`);
    expect(statusRes.status).toBe(200);
    const statusData = (await statusRes.json()) as {
      id: string;
      status: string;
      results: Record<string, any>;
    };
    expect(statusData.id).toBe(runId);
    expect(statusData.status).toBe('success');
    expect(statusData.results['order-created'].status).toBe('success');

    // 3. Retrieve its detailed logs
    const logsRes = await fetch(`http://localhost:${port}/api/runs/${runId}/logs`);
    expect(logsRes.status).toBe(200);
    const logsData = (await logsRes.json()) as {
      runId: string;
      logs: Array<{
        timestamp: string;
        level: string;
        message: string;
        type: string;
      }>;
    };

    expect(logsData.runId).toBe(runId);
    expect(Array.isArray(logsData.logs)).toBe(true);
    expect(logsData.logs.length).toBeGreaterThan(0);
    
    // Check key log entries
    const hasStartLog = logsData.logs.some(l => l.type === 'run_start');
    const hasStepLog = logsData.logs.some(l => l.type === 'step_start' && l.message.includes('order-created'));
    const hasCompleteLog = logsData.logs.some(l => l.type === 'run_complete' && l.message.includes('success'));

    expect(hasStartLog).toBe(true);
    expect(hasStepLog).toBe(true);
    expect(hasCompleteLog).toBe(true);
  });

  it('9. should return validation errors (422) if run payload is invalid', async () => {
    if (!isDbAvailable) return;

    const runRes = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: {
          orderId: 'ORD-ROUTE-TEST-100'
          // Missing customerEmail and total
        }
      })
    });

    expect(runRes.status).toBe(422);
    const errData = (await runRes.json()) as { error: string };
    expect(errData.error).toContain('Trigger payload validation failed');
  });
});
