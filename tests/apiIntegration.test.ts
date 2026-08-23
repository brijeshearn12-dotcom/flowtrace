import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Server } from 'http';
import express from 'express';
import { connectDB, closeDB } from '../server/db';
import workflowsRouter from '../server/routes/workflows';
import runsRouter from '../server/routes/runs';
import detectRouter from '../server/routes/detect';
import { seedMetadata } from '../seed/metadata';
import { seedOrderPlaced } from '../seed/orderPlaced';
import { seedAssetRequestApproval } from '../seed/assetRequestApproval';
import { Workflow } from '../shared/ir';
import { WorkflowRepository, VersionRepository } from '../persistence';
import {
  DetectResponse,
  ValidateWorkflowResponse,
  AgentEditResponse,
} from '../shared/api';

// Inline types for responses not fully typed in shared/api.ts
interface ErrorResponse { error: string }
interface WorkflowStatusResponse { success: boolean; workflow: { id?: string; version?: number; status: string } }
interface RunResponse {
  success: boolean;
  run: { id: string; workflowId: string; status: string; results?: Record<string, { status: string }> };
}
interface RunStatusResponse { id: string; status: string; results: Record<string, { status: string }> }

describe('FlowTrace P0 API Integration Tests', () => {
  let server: Server;
  let port: number;
  const app = express();
  let isDbAvailable = false;

  beforeAll(async () => {
    // Attempt database connection with a 1000ms timeout to prevent test hook timeout
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
      console.log('MongoDB not available; skipping DB-dependent integration tests');
      isDbAvailable = false;
    }

    if (isDbAvailable) {
      // Seed the database to ensure test fixtures are present
      await seedMetadata();
      await seedOrderPlaced();
      await seedAssetRequestApproval();

      // Clean up test-specific workflows from prior runs
      const { getDb } = await import('../server/db');
      const { COLLECTIONS } = await import('../persistence');
      const db = getDb();
      const wfIds = ['wf_val_test', 'wf_pub_test'];
      await db.collection(COLLECTIONS.WORKFLOWS).deleteMany({ _id: { $in: wfIds } } as Record<string, unknown>);
      await db.collection(COLLECTIONS.VERSIONS).deleteMany({ workflowId: { $in: wfIds } });
    }

    app.use(express.json());
    app.use('/api/workflows', workflowsRouter);
    app.use('/api/runs', runsRouter);
    app.use('/api/detect', detectRouter);
    
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

  describe('1. POST /api/detect', () => {
    it('should successfully detect workflow structure from valid requirement text', async () => {
      const res = await fetch(`http://localhost:${port}/api/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirement: 'When an order is placed, run FraudService.check. Then create a billing invoice and send a customer confirmation email. Finally, alert warehouse for fulfillment.'
        })
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as DetectResponse;
      expect(data.success).toBe(true);
      expect(data.confidence).toBe(0.95);
      expect(data.explanation).toContain('OrderPlaced trigger');
      expect(data.workflow).toBeDefined();
      expect(data.workflow.id).toBe('wf_order_placed');
      expect(Array.isArray(data.workflow.nodes)).toBe(true);
      expect(Array.isArray(data.workflow.edges)).toBe(true);
    });

    it('should return 400 Bad Request for short requirement text', async () => {
      const res = await fetch(`http://localhost:${port}/api/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirement: 'too short'
        })
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain('too short or empty');
    });

    it('should return 400 Bad Request for missing requirement field', async () => {
      const res = await fetch(`http://localhost:${port}/api/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain('too short or empty');
    });
  });

  describe('2. Workflow LIST/GET', () => {
    it('should list all workflows and verify seeded ones are present', async () => {
      if (!isDbAvailable) return;
      const res = await fetch(`http://localhost:${port}/api/workflows`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as Array<{ id: string; status: string; latestVersion: number }>;
      expect(Array.isArray(data)).toBe(true);
      
      const orderPlaced = data.find(w => w.id === 'wf_order_placed');
      const assetRequest = data.find(w => w.id === 'wf_asset_request_approval');
      
      expect(orderPlaced).toBeDefined();
      expect(orderPlaced?.status).toBe('published');
      expect(assetRequest).toBeDefined();
      expect(assetRequest?.status).toBe('published');
    });

    it('should retrieve wf_order_placed details and match structure', async () => {
      if (!isDbAvailable) return;
      const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as Workflow;
      expect(data.id).toBe('wf_order_placed');
      expect(data.status).toBe('published');
      expect(data.trigger.id).toBe('tr_order_placed');
      expect(Array.isArray(data.nodes)).toBe(true);
      expect(data.nodes.length).toBe(4);
      expect(Array.isArray(data.edges)).toBe(true);
      expect(data.edges.length).toBe(3);
    });

    it('should return 404 for non-existent workflow ID', async () => {
      if (!isDbAvailable) return;
      const res = await fetch(`http://localhost:${port}/api/workflows/non_existent_id`);
      expect(res.status).toBe(404);
      const data = (await res.json()) as ErrorResponse;
      expect(data.error).toContain('not found');
    });
  });

  describe('3. Workflow Validation', () => {
    it('should return success true for valid seeded workflow', async () => {
      if (!isDbAvailable) return;
      const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/validate`, {
        method: 'POST'
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as ValidateWorkflowResponse;
      expect(data.success).toBe(true);
    });

    it('should verify PATCH returns 422 for saving invalid changes', async () => {
      if (!isDbAvailable) return;

      // 1. Create a draft workflow
      const createRes = await fetch(`http://localhost:${port}/api/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'wf_val_test',
          name: 'Validation Test Workflow'
        })
      });
      expect(createRes.status).toBe(201);

      // 2. Perform a patch edit to insert a node with a dangling reference -> should fail validation at PATCH level
      const patchRes = await fetch(`http://localhost:${port}/api/workflows/wf_val_test?baseVersion=1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          {
            op: 'add',
            path: '/nodes/0',
            value: {
              id: 'step_invalid',
              name: 'Invalid Step',
              type: 'action',
              action: 'Slack.post',
              inputs: { message: '{{non_existent.output}}' }
            }
          }
        ])
      });
      expect(patchRes.status).toBe(422);
      const data = (await patchRes.json()) as ValidateWorkflowResponse;
      expect(data.success).toBe(false);
      expect(Array.isArray(data.errors)).toBe(true);
      expect(data.errors?.[0].message).toContain('refers to a non-existent step');
    });

    it('should block validation and return 422 for invalid workflow draft in DB', async () => {
      if (!isDbAvailable) return;

      // Manually write an invalid draft to DB to simulate validation on /validate endpoint
      await VersionRepository.create({
        workflowId: 'wf_val_test',
        version: 2,
        trigger: { id: 'tr_manual', type: 'manual' },
        nodes: [
          {
            id: 'step_invalid',
            name: 'Invalid step',
            type: 'action',
            action: 'Slack.post',
            inputs: { message: '{{non_existent.output}}' }
          }
        ],
        edges: [],
        source: 'manual',
        summary: 'Direct database write of broken draft'
      });
      await WorkflowRepository.update('wf_val_test', { latestVersion: 2 });

      // Post to validate
      const valRes = await fetch(`http://localhost:${port}/api/workflows/wf_val_test/validate`, {
        method: 'POST'
      });
      expect(valRes.status).toBe(422);
      const data = (await valRes.json()) as ValidateWorkflowResponse;
      expect(data.success).toBe(false);
      expect(Array.isArray(data.errors)).toBe(true);
      expect(data.errors?.length).toBeGreaterThan(0);
      expect(data.errors?.[0].message).toContain('refers to a non-existent step');
    });
  });

  describe('4. Workflow Publish & Stale-Version Protection', () => {
    it('should publish a valid draft, promotion to published status', async () => {
      if (!isDbAvailable) return;

      // 1. Create draft
      const createRes = await fetch(`http://localhost:${port}/api/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'wf_pub_test',
          name: 'Publish Test Workflow'
        })
      });
      expect(createRes.status).toBe(201);

      // 2. Edit draft with a valid node (moves latestVersion to 2)
      const patchRes = await fetch(`http://localhost:${port}/api/workflows/wf_pub_test?baseVersion=1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          {
            op: 'add',
            path: '/nodes/0',
            value: {
              id: 'step_slack',
              name: 'Slack Alert',
              type: 'action',
              action: 'Slack.post',
              inputs: { channel: '#ops', message: 'Hello' }
            }
          }
        ])
      });
      expect(patchRes.status).toBe(200);

      // 3. Try to publish with stale baseVersion = 1 (latest is 2) -> should block with 409
      const stalePublishRes = await fetch(`http://localhost:${port}/api/workflows/wf_pub_test/publish?baseVersion=1`, {
        method: 'POST'
      });
      expect(stalePublishRes.status).toBe(409);
      const staleData = (await stalePublishRes.json()) as ErrorResponse;
      expect(staleData.error).toContain('stale');

      // 4. Publish with correct baseVersion = 2 -> should succeed (200)
      const publishRes = await fetch(`http://localhost:${port}/api/workflows/wf_pub_test/publish?baseVersion=2`, {
        method: 'POST'
      });
      expect(publishRes.status).toBe(200);
      const publishData = (await publishRes.json()) as WorkflowStatusResponse;
      expect(publishData.success).toBe(true);
      expect(publishData.workflow.status).toBe('published');
    });
  });

  describe('5. Run Workflow, Status, and Logs', () => {
    let activeRunId: string;

    it('should trigger run on published workflow and return run status running/success', async () => {
      if (!isDbAvailable) return;

      const runRes = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: {
            orderId: 'ORD-INTEG-999',
            customerEmail: 'customer@test.com',
            total: 350
          }
        })
      });
      expect(runRes.status).toBe(201);
      const runData = (await runRes.json()) as RunResponse;
      expect(runData.success).toBe(true);
      expect(runData.run.id).toBeDefined();
      expect(runData.run.workflowId).toBe('wf_order_placed');
      expect(runData.run.status).toBe('success'); // execution is synchronous mock

      activeRunId = runData.run.id;
    });

    it('should return 422 for run request with invalid payload', async () => {
      if (!isDbAvailable) return;

      const runRes = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: {
            orderId: 'ORD-INTEG-FAIL'
            // Missing total and customerEmail fields
          }
        })
      });
      expect(runRes.status).toBe(422);
      const errData = (await runRes.json()) as ErrorResponse;
      expect(errData.error).toContain('payload validation failed');
    });

    it('should retrieve status details for the active run', async () => {
      if (!isDbAvailable) return;
      expect(activeRunId).toBeDefined();

      const statusRes = await fetch(`http://localhost:${port}/api/runs/${activeRunId}`);
      expect(statusRes.status).toBe(200);
      const statusData = (await statusRes.json()) as RunStatusResponse;
      expect(statusData.id).toBe(activeRunId);
      expect(statusData.status).toBe('success');
      expect(statusData.results).toBeDefined();
      expect(statusData.results['order-created'].status).toBe('success');
    });

    it('should retrieve execution logs for the active run in order', async () => {
      if (!isDbAvailable) return;
      expect(activeRunId).toBeDefined();

      const logsRes = await fetch(`http://localhost:${port}/api/runs/${activeRunId}/logs`);
      expect(logsRes.status).toBe(200);
      const logsData = (await logsRes.json()) as {
        runId: string;
        logs: Array<{ timestamp: string; level: string; message: string; type: string; stepId?: string }>;
      };
      expect(logsData.runId).toBe(activeRunId);
      expect(Array.isArray(logsData.logs)).toBe(true);
      expect(logsData.logs.length).toBeGreaterThan(0);

      // Verify chronological sequence and log type fields
      const hasStart = logsData.logs.some(l => l.type === 'run_start');
      const hasStep = logsData.logs.some(l => l.type === 'step_start' && l.stepId === 'order-created');
      const hasComplete = logsData.logs.some(l => l.type === 'run_complete');
      expect(hasStart).toBe(true);
      expect(hasStep).toBe(true);
      expect(hasComplete).toBe(true);
    });
  });

  describe('6. Agent Proposal Edit', () => {
    it('should return a patch proposal for supported natural language instructions', async () => {
      if (!isDbAvailable) return;

      const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/agent-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Insert a slack notification step after fraud check'
        })
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as AgentEditResponse;
      expect(data.success).toBe(true);
      expect(data.explanation).toContain('slack notification');
      expect(Array.isArray(data.patch)).toBe(true);
      expect(data.patch.length).toBeGreaterThan(0);
    });

    it('should return success false and a warning for unsupported natural language instructions', async () => {
      if (!isDbAvailable) return;

      const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/agent-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Please build a rocket ship'
        })
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as AgentEditResponse;
      expect(data.success).toBe(false);
      expect(data.explanation).toContain('Warning: Unknown instruction');
      expect(data.warning).toBeDefined();
      expect(data.warning).toContain('rocket ship');
      expect(data.patch).toEqual([]);
    });
  });
});
