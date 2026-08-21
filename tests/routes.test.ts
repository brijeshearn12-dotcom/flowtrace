import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'http';
import express from 'express';
import { connectDB, closeDB } from '../server/db';
import workflowsRouter from '../server/routes/workflows';
import { seedMetadata } from '../seed/metadata';
import { seedOrderPlaced } from '../seed/orderPlaced';
import { seedAssetRequestApproval } from '../seed/assetRequestApproval';

describe('Workflow Route API Integration Tests', () => {
  let server: Server;
  let port: number;
  const app = express();

  beforeAll(async () => {
    await connectDB();
    
    // Seed the database to ensure test fixtures are present
    await seedMetadata();
    await seedOrderPlaced();
    await seedAssetRequestApproval();

    app.use(express.json());
    app.use('/api/workflows', workflowsRouter);
    
    server = app.listen(0); // Start on dynamic port
    const addr = server.address();
    port = typeof addr === 'string' ? 0 : addr?.port || 0;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closeDB();
  });

  it('1. should verify LIST workflows returns seeded workflows', async () => {
    const res = await fetch(`http://localhost:${port}/api/workflows`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ id: string }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((w) => w.id === 'wf_order_placed')).toBe(true);
    expect(data.some((w) => w.id === 'wf_asset_request_approval')).toBe(true);
  });

  it('2. should verify GET /api/workflows/wf_order_placed returns correct structure', async () => {
    const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; trigger: { id: string }; nodes: unknown[]; edges: unknown[] };
    expect(data.id).toBe('wf_order_placed');
    expect(data.trigger.id).toBe('tr_order_placed');
    expect(data.nodes.length).toBe(4);
    expect(data.edges.length).toBe(3);
  });

  it('3. should verify GET /api/workflows/wf_asset_request_approval returns correct structure', async () => {
    const res = await fetch(`http://localhost:${port}/api/workflows/wf_asset_request_approval`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; trigger: { id: string }; nodes: unknown[]; edges: unknown[] };
    expect(data.id).toBe('wf_asset_request_approval');
    expect(data.trigger.id).toBe('tr_asset_request');
    expect(data.nodes.length).toBe(4);
    expect(data.edges.length).toBe(2);
  });

  it('4. should verify VALIDATE endpoint returns success for valid seeded workflow', async () => {
    const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/validate`, {
      method: 'POST'
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });

  it('5. should verify HISTORY endpoint returns list of versions', async () => {
    const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/history`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as Array<{ version: number }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0].version).toBe(1);
  });

  it('6. should verify workflow creation, invalid validation, and publishing workflow draft', async () => {
    // 1. Create a new draft
    const createRes = await fetch(`http://localhost:${port}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'wf_route_test', name: 'Route Test' })
    });
    expect(createRes.status).toBe(201);
    const createData = (await createRes.json()) as { success: boolean; workflow: { status: string; version: number } };
    expect(createData.success).toBe(true);
    expect(createData.workflow.status).toBe('draft');
    expect(createData.workflow.version).toBe(1);

    // 2. Patch it to have invalid references (referencing non-existent step)
    const patchRes = await fetch(`http://localhost:${port}/api/workflows/wf_route_test?baseVersion=1`, {
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
    // Validation should catch the invalid reference and reject the patch edit
    expect(patchRes.status).toBe(422);
    const patchData = (await patchRes.json()) as { success: boolean; errors: Array<{ code: string }> };
    expect(patchData.success).toBe(false);
    expect(patchData.errors.length).toBeGreaterThan(0);
    expect(patchData.errors[0].code).toBe('invalid_step_reference');

    // 3. Publish the valid draft (version 1)
    const publishRes = await fetch(`http://localhost:${port}/api/workflows/wf_route_test/publish`, {
      method: 'POST'
    });
    expect(publishRes.status).toBe(200);
    const publishData = (await publishRes.json()) as { success: boolean; workflow: { status: string } };
    expect(publishData.success).toBe(true);
    expect(publishData.workflow.status).toBe('published');
  });

  it('7. should return proper 404 error for non-existent workflow IDs', async () => {
    const res = await fetch(`http://localhost:${port}/api/workflows/non_existent`);
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('not found');
  });
});
