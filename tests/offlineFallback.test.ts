import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Server } from 'http';
import express from 'express';
import { connectDB, closeDB, getDb } from '../server/db';
import workflowsRouter from '../server/routes/workflows';
import runsRouter from '../server/routes/runs';
import detectRouter from '../server/routes/detect';
import { seedMetadata } from '../seed/metadata';
import { seedOrderPlaced } from '../seed/orderPlaced';
import { seedAssetRequestApproval } from '../seed/assetRequestApproval';
import { COLLECTIONS, RunRepository } from '../persistence';
import { detectWorkflow, DetectionResult } from '../detector';
import { AgentEditService } from '../server/services/agentEditService';
import { MockFormsAdapter } from '../mock-forms-api/mockFormsAdapter';
import { runWorkflow } from '../executor/runWorkflow';
import {
  IFormsAdapter,
  FormCreateInput,
  FormUpdateInput,
  FormDeleteInput,
  OperationInput,
  FunctionInput,
  normalizeError
} from '../executor/formsAdapter';
import { DetectResponse, AgentEditResponse } from '../shared/api';

describe('Step 5: Test Offline Fallback & Deterministic Engine Suite', () => {
  let server: Server;
  let port: number;
  const app = express();
  let isDbAvailable = false;

  // Save original env
  const origEnv = { ...process.env };

  beforeAll(async () => {
    // Explicitly disable any external LLM / AI environment variables and strip all AI API keys
    process.env.LLM_ENABLED = 'false';
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.LLM_API_KEY;

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
    app.use('/api/detect', detectRouter);

    server = app.listen(0);
    const addr = server.address();
    port = typeof addr === 'string' ? 0 : addr?.port || 0;
  });

  afterAll(async () => {
    process.env = origEnv;
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
  // 1. Environment & API Key Independence
  // =========================================================================
  describe('1. Zero External API Keys Requirement', () => {
    it('1.1 should confirm all external AI API keys are unset or disabled', () => {
      expect(process.env.OPENAI_API_KEY).toBeUndefined();
      expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(process.env.GEMINI_API_KEY).toBeUndefined();
      expect(process.env.LLM_ENABLED).toBe('false');
    });

    it('1.2 should verify mock forms adapter operates in-process with zero network dependency', async () => {
      const adapter = new MockFormsAdapter();
      const checkRes = await adapter.function({
        name: 'FraudService.check',
        inputs: { orderId: 'ORD-OFFLINE-001', amount: 100 }
      });

      expect(checkRes.success).toBe(true);
      if (checkRes.success) {
        expect(checkRes.data).toEqual({ score: 0.05, approved: true, riskLevel: 'low' });
      }

      const slackRes = await adapter.function({
        name: 'Slack.post',
        inputs: { channel: '#ops', message: 'Hello' }
      });
      expect(slackRes.success).toBe(true);
      if (slackRes.success) {
        expect(slackRes.data).toHaveProperty('ok', true);
      }
    });
  });

  // =========================================================================
  // 2. Deterministic Requirement Detection (Offline)
  // =========================================================================
  describe('2. Deterministic Offline Requirement Detection', () => {
    it('2.1 should detect OrderPlaced workflow offline with high confidence and zero LLM calls', async () => {
      const requirement = 'When an order is placed, run FraudService.check. Then create a billing invoice and send a customer confirmation email. Finally, alert warehouse for fulfillment.';
      const res: DetectionResult = detectWorkflow(requirement);

      expect(res.success).toBe(true);
      expect(res.confidence).toBe(0.95);
      expect(res.workflow.id).toBe('wf_order_placed');
      expect(res.workflow.nodes.length).toBe(4);
      expect(res.workflow.edges.length).toBe(3);
      expect(res.warnings.length).toBe(0);
      expect(res.explanation).toContain('OrderPlaced trigger');
    });

    it('2.2 should detect AssetRequestApproval workflow offline with high confidence and zero LLM calls', async () => {
      const requirement = 'Set up an asset request approval flow. Send notification to approvals channel. If approved, post to warehouse. If rejected, send an rejection notification. If dispatch fails, redirect to critical failure-handler.';
      const res: DetectionResult = detectWorkflow(requirement);

      expect(res.success).toBe(true);
      expect(res.confidence).toBe(0.95);
      expect(res.workflow.id).toBe('wf_asset_request_approval');
      expect(res.workflow.nodes.length).toBe(4);
      expect(res.workflow.edges.length).toBe(2);
      expect(res.warnings.length).toBe(0);
      expect(res.explanation).toContain('AssetRequest trigger');
    });

    it('2.3 should test POST /api/detect endpoint offline over HTTP', async () => {
      const res = await fetch(`http://localhost:${port}/api/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirement: 'Order placed, run FraudCheck and notify Slack channel #warehouse'
        })
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as DetectResponse;
      expect(data.success).toBe(true);
      expect(data.confidence).toBe(0.95);
      expect(data.workflow.id).toBe('wf_order_placed');
    });
  });

  // =========================================================================
  // 3. Offline Execution of Seeded Workflows
  // =========================================================================
  describe('3. Offline Execution of Seeded Workflows', () => {
    it('3.1 should execute OrderPlaced workflow end-to-end offline and verify context propagation', async () => {
      if (!isDbAvailable) return;

      const triggerPayload = {
        orderId: 'ORD-OFFLINE-999',
        customerEmail: 'offline-customer@test.com',
        total: 750
      };

      const adapter = new MockFormsAdapter();
      const runResult = await runWorkflow('wf_order_placed', triggerPayload, adapter);

      expect(runResult.status).toBe('success');
      expect(runResult.workflowId).toBe('wf_order_placed');
      expect(runResult.version).toBe(1);

      // Verify all 4 steps succeeded
      expect(runResult.results['order-created']?.status).toBe('success');
      expect(runResult.results['invoice']?.status).toBe('success');
      expect(runResult.results['confirmation']?.status).toBe('success');
      expect(runResult.results['fulfillment']?.status).toBe('success');

      // Verify run persistence in DB
      const dbRun = await RunRepository.get(runResult.id);
      expect(dbRun).not.toBeNull();
      expect(dbRun!.status).toBe('success');
    });

    it('3.2 should execute AssetRequestApproval APPROVED branch offline (true branch)', async () => {
      if (!isDbAvailable) return;

      const triggerPayload = {
        requestId: 'REQ-OFFLINE-APP-1',
        approved: true,
        amount: 2500
      };

      const adapter = new MockFormsAdapter();
      const runResult = await runWorkflow('wf_asset_request_approval', triggerPayload, adapter);

      expect(runResult.status).toBe('success');
      expect(runResult.results['approval']?.status).toBe('success');
      expect(runResult.results['approved-action']?.status).toBe('success');
      // Rejected branch should be marked skipped
      expect(runResult.results['rejected-action']?.status).toBe('skipped');
    });

    it('3.3 should execute AssetRequestApproval REJECTED branch offline (false branch)', async () => {
      if (!isDbAvailable) return;

      const triggerPayload = {
        requestId: 'REQ-OFFLINE-REJ-2',
        approved: false,
        amount: 2500
      };

      const adapter = new MockFormsAdapter();
      const runResult = await runWorkflow('wf_asset_request_approval', triggerPayload, adapter);

      expect(runResult.status).toBe('success');
      expect(runResult.results['approval']?.status).toBe('success');
      expect(runResult.results['rejected-action']?.status).toBe('success');
      // Approved branch should be marked skipped
      expect(runResult.results['approved-action']?.status).toBe('skipped');
    });
  });

  // =========================================================================
  // 4. Offline Failure Handling & Redirect Recovery
  // =========================================================================
  describe('4. Offline Failure Handling and Redirect Recovery', () => {
    it('4.1 should simulate step failure offline and verify redirect policy recovery', async () => {
      if (!isDbAvailable) return;

      const triggerPayload = {
        requestId: 'REQ-OFFLINE-FAIL-3',
        approved: true,
        amount: 5000
      };

      const mockAdapter = new MockFormsAdapter();
      // Inject failure on approved-action
      const customAdapter: IFormsAdapter = {
        formCreate: (input: FormCreateInput) => mockAdapter.formCreate(input),
        formUpdate: (input: FormUpdateInput) => mockAdapter.formUpdate(input),
        formDelete: (input: FormDeleteInput) => mockAdapter.formDelete(input),
        operation: (input: OperationInput) => mockAdapter.operation(input),
        function: async (input: FunctionInput) => {
          if (
            input.name === 'Slack.post' &&
            input.inputs.message &&
            String(input.inputs.message).includes('approved!')
          ) {
            return normalizeError('OFFLINE_MOCK_ERROR', 'Simulated offline dispatch error');
          }
          return mockAdapter.function(input);
        }
      };

      const runResult = await runWorkflow('wf_asset_request_approval', triggerPayload, customAdapter);

      expect(runResult.status).toBe('success'); // overall success because redirect target recovered
      expect(runResult.results['approval']?.status).toBe('success');
      expect(runResult.results['approved-action']?.status).toBe('failed');
      expect(runResult.results['approved-action']?.error).toContain('Step failed (redirected policy)');
      expect(runResult.results['failure-handler']?.status).toBe('success');
    });
  });

  // =========================================================================
  // 5. Offline Execution Logs & Auditing
  // =========================================================================
  describe('5. Offline Execution Logs and Audit Trail', () => {
    it('5.1 should fetch structured execution logs offline via GET /api/runs/:runId/logs', async () => {
      if (!isDbAvailable) return;

      // Trigger run via API
      const runRes = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: {
            orderId: 'ORD-LOG-001',
            customerEmail: 'audit@example.com',
            total: 120
          }
        })
      });
      expect(runRes.status).toBe(201);
      const runData = (await runRes.json()) as { run: { id: string } };
      const runId = runData.run.id;

      // Fetch logs
      const logsRes = await fetch(`http://localhost:${port}/api/runs/${runId}/logs`);
      expect(logsRes.status).toBe(200);
      const logsData = (await logsRes.json()) as {
        runId: string;
        logs: Array<{ timestamp: string; level: string; message: string; type: string; stepId?: string }>;
      };

      expect(logsData.runId).toBe(runId);
      expect(Array.isArray(logsData.logs)).toBe(true);
      expect(logsData.logs.length).toBeGreaterThan(0);

      // Verify sequence of lifecycle log events
      const eventTypes = logsData.logs.map(l => l.type);
      expect(eventTypes).toContain('run_start');
      expect(eventTypes).toContain('step_start');
      expect(eventTypes).toContain('step_success');
      expect(eventTypes).toContain('run_complete');
    });
  });

  // =========================================================================
  // 6. Offline Deterministic Agent Proposals
  // =========================================================================
  describe('6. Offline Deterministic Agent Edit Proposals', () => {
    it('6.1 should generate structured patch proposals offline for supported prompts', () => {
      const proposal = AgentEditService.generateProposal(
        'wf_order_placed',
        'Insert a slack notification step after fraud check'
      );

      expect(proposal.success).toBe(true);
      expect(proposal.patch.length).toBeGreaterThan(0);
      expect(proposal.explanation).toContain('slack notification');
    });

    it('6.2 should return clear warning without crashing on unmapped prompts', async () => {
      if (!isDbAvailable) return;

      const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/agent-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Write a sonnet about quantum gravity'
        })
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as AgentEditResponse;
      expect(data.success).toBe(false);
      expect(data.warning).toBeDefined();
      expect(data.patch).toEqual([]);
    });
  });
});
