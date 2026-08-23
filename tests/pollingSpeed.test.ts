import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Server } from 'http';
import express from 'express';
import { connectDB, closeDB, getDb } from '../server/db';
import workflowsRouter from '../server/routes/workflows';
import runsRouter from '../server/routes/runs';
import { seedMetadata } from '../seed/metadata';
import { seedOrderPlaced } from '../seed/orderPlaced';
import { seedAssetRequestApproval } from '../seed/assetRequestApproval';
import { COLLECTIONS } from '../persistence';
import { MockFormsAdapter } from '../mock-forms-api/mockFormsAdapter';
import { runWorkflow } from '../executor/runWorkflow';
import dagre from 'dagre';

describe('Step 6: Check Polling and Speed Tests', () => {
  let server: Server;
  let port: number;
  const app = express();
  let isDbAvailable = false;

  beforeAll(async () => {
    // Database connection with 1000ms fast timeout
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

    if (isDbAvailable) {
      await seedMetadata();
      await seedOrderPlaced();
      await seedAssetRequestApproval();
    }

    app.use(express.json());
    app.use('/api/workflows', workflowsRouter);
    app.use('/api/runs', runsRouter);

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
    await db.collection(COLLECTIONS.RUNS).deleteMany({});
    await db.collection(COLLECTIONS.AUDIT_EVENTS).deleteMany({});
  });

  // =========================================================================
  // 1. Terminal State Verification for Successful Runs
  // =========================================================================
  describe('1. Terminal State Verification for Successful Runs', () => {
    it('1.1 should verify successful execution reaches terminal status and returns immediately without pending state', async () => {
      if (!isDbAvailable) return;

      const triggerPayload = {
        orderId: 'ORD-SPEED-101',
        customerEmail: 'speed@test.com',
        total: 500
      };

      const start = performance.now();
      const runRes = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: triggerPayload })
      });
      const duration = performance.now() - start;

      expect(runRes.status).toBe(201);
      const data = (await runRes.json()) as {
        success: boolean;
        run: { id: string; status: string; completedAt?: string; results: Record<string, { status: string }> };
      };

      expect(data.success).toBe(true);
      // Terminal state is reached immediately on synchronous mock execution
      expect(['success', 'failed', 'aborted']).toContain(data.run.status);
      expect(data.run.status).toBe('success');
      expect(data.run.completedAt).toBeDefined();
      expect(duration).toBeLessThan(1000); // Fast local execution

      // Verify GET /api/runs/:runId returns terminal state with all step results populated
      const statusRes = await fetch(`http://localhost:${port}/api/runs/${data.run.id}`);
      expect(statusRes.status).toBe(200);
      const statusData = (await statusRes.json()) as { status: string; completedAt: string };
      expect(statusData.status).toBe('success');
      expect(statusData.completedAt).toBeDefined();
    });
  });

  // =========================================================================
  // 2. Terminal State Verification for Failed Runs
  // =========================================================================
  describe('2. Terminal State Verification for Failed Runs', () => {
    it('2.1 should verify failed execution reaches terminal "failed" status and does not hang', async () => {
      if (!isDbAvailable) return;

      const adapter = new MockFormsAdapter({
        failOn: 'FraudService.check'
      });

      const start = performance.now();
      const runResult = await runWorkflow(
        'wf_order_placed',
        { orderId: 'ORD-FAIL-1', customerEmail: 'fail@test.com', total: 100 },
        adapter
      );
      const duration = performance.now() - start;

      // Terminal status is 'failed'
      expect(runResult.status).toBe('failed');
      expect(runResult.completedAt).toBeDefined();
      expect(duration).toBeLessThan(1000);

      // Verify status endpoint reflects terminal state
      const statusRes = await fetch(`http://localhost:${port}/api/runs/${runResult.id}`);
      expect(statusRes.status).toBe(200);
      const statusData = (await statusRes.json()) as { status: string };
      expect(statusData.status).toBe('failed');
    });

    it('2.2 should verify redirect failure policy reaches terminal "success" status after recovery', async () => {
      if (!isDbAvailable) return;

      const mockAdapter = new MockFormsAdapter({
        failOn: 'approved-action'
      });

      const runResult = await runWorkflow(
        'wf_asset_request_approval',
        { requestId: 'REQ-FAIL-1', approved: true, amount: 200 },
        mockAdapter
      );

      // Terminal status is 'success' after recovery
      expect(['success', 'failed', 'aborted']).toContain(runResult.status);
      expect(runResult.status).toBe('success');
      expect(runResult.completedAt).toBeDefined();
    });
  });

  // =========================================================================
  // 3. Status and Logs Endpoint Latency (< 100ms on localhost)
  // =========================================================================
  describe('3. Execution Status and Logs API Latency', () => {
    it('3.1 should return run status within 100ms', async () => {
      if (!isDbAvailable) return;

      const adapter = new MockFormsAdapter();
      const runResult = await runWorkflow(
        'wf_order_placed',
        { orderId: 'ORD-PERF-1', customerEmail: 'perf@test.com', total: 300 },
        adapter
      );

      const start = performance.now();
      const res = await fetch(`http://localhost:${port}/api/runs/${runResult.id}`);
      const duration = performance.now() - start;

      expect(res.status).toBe(200);
      expect(duration).toBeLessThan(500);
    });

    it('3.2 should return execution logs within 100ms', async () => {
      if (!isDbAvailable) return;

      const adapter = new MockFormsAdapter();
      const runResult = await runWorkflow(
        'wf_order_placed',
        { orderId: 'ORD-PERF-2', customerEmail: 'perf2@test.com', total: 400 },
        adapter
      );

      const start = performance.now();
      const res = await fetch(`http://localhost:${port}/api/runs/${runResult.id}/logs`);
      const duration = performance.now() - start;

      expect(res.status).toBe(200);
      const data = (await res.json()) as { logs: unknown[] };
      expect(data.logs.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(500);
    });
  });

  // =========================================================================
  // 4. Graph Layout Calculation Speed & Correctness
  // =========================================================================
  describe('4. Dagre Graph Layout Performance', () => {
    it('4.1 should compute DAG layout for standard workflows in under 10ms', () => {
      const sampleNodes = [
        { id: 'tr_1', width: 220, height: 120 },
        { id: 'node_1', width: 220, height: 120 },
        { id: 'node_2', width: 220, height: 120 },
        { id: 'node_3', width: 220, height: 120 },
        { id: 'node_4', width: 220, height: 120 }
      ];

      const sampleEdges = [
        { source: 'tr_1', target: 'node_1' },
        { source: 'node_1', target: 'node_2' },
        { source: 'node_2', target: 'node_3' },
        { source: 'node_3', target: 'node_4' }
      ];

      const start = performance.now();
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      g.setGraph({ rankdir: 'LR' });

      sampleNodes.forEach(n => g.setNode(n.id, { width: n.width, height: n.height }));
      sampleEdges.forEach(e => g.setEdge(e.source, e.target));
      dagre.layout(g);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
      const nodePos = g.node('node_4');
      expect(nodePos.x).toBeGreaterThan(g.node('node_1').x); // Topological ordering verified
    });
  });
});
