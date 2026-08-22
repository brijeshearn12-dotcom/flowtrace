import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectDB, closeDB, getDb } from '../server/db';
import { COLLECTIONS, RunRepository, WorkflowRepository, VersionRepository, AuditEventRepository } from '../persistence';
import { runWorkflow } from '../executor/runWorkflow';
import { MockFormsAdapter } from '../mock-forms-api/mockFormsAdapter';
import { seedOrderPlaced } from '../seed/orderPlaced';
import { ValidationError } from '../server/services/versionService';
import { IFormsAdapter } from '../executor/formsAdapter';

describe('runWorkflow Sequential Executor Tests', () => {
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
      console.log('MongoDB not available; skipping DB-dependent tests');
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDbAvailable) {
      await closeDB();
    }
  });

  beforeEach(async () => {
    if (isDbAvailable) {
      try {
        const db = getDb();
        await db.collection(COLLECTIONS.WORKFLOWS).deleteMany({});
        await db.collection(COLLECTIONS.VERSIONS).deleteMany({});
        await db.collection(COLLECTIONS.RUNS).deleteMany({});
        await db.collection(COLLECTIONS.AUDIT_EVENTS).deleteMany({});
      } catch {
        // ignore
      }
    }
  });

  it('1. should execute the seeded OrderPlaced workflow successfully and persist results', async () => {
    if (!isDbAvailable) {
      console.log('Skipping test: Database not available');
      return;
    }

    // Seed OrderPlaced
    await seedOrderPlaced();

    const triggerPayload = {
      orderId: 'ORD-TEST-999',
      customerEmail: 'customer@example.com',
      total: 1500,
    };

    const adapter = new MockFormsAdapter();

    // Run workflow
    const runResult = await runWorkflow('wf_order_placed', triggerPayload, adapter);

    // Verify returning document
    expect(runResult).toBeDefined();
    expect(runResult.status).toBe('success');
    expect(runResult.workflowId).toBe('wf_order_placed');
    expect(runResult.version).toBe(1);
    expect(runResult.triggerPayload).toEqual(triggerPayload);
    expect(runResult.completedAt).toBeDefined();

    // Verify step result existence and status
    const results = runResult.results;
    expect(results['order-created']).toBeDefined();
    expect(results['order-created'].status).toBe('success');
    expect(results['order-created'].output).toEqual({
      score: 0.05,
      approved: true,
      riskLevel: 'low',
    });

    expect(results['invoice']).toBeDefined();
    expect(results['invoice'].status).toBe('success');
    expect(results['invoice'].output).toEqual({
      ok: true,
      channel: 'mock-channel',
      ts: '1000000000.000000',
    });

    expect(results['confirmation']).toBeDefined();
    expect(results['confirmation'].status).toBe('success');
    expect(results['confirmation'].output).toEqual({
      accepted: true,
      messageId: 'mock-msg-001',
    });

    expect(results['fulfillment']).toBeDefined();
    expect(results['fulfillment'].status).toBe('success');

    // Verify execution order via timestamps (order-created -> invoice -> confirmation -> fulfillment)
    const tCreated = new Date(results['order-created'].completedAt).getTime();
    const tInvoice = new Date(results['invoice'].startedAt).getTime();
    const tConfirmation = new Date(results['confirmation'].startedAt).getTime();
    const tFulfillment = new Date(results['fulfillment'].startedAt).getTime();

    expect(tCreated).toBeLessThanOrEqual(tInvoice);
    expect(tInvoice).toBeLessThanOrEqual(tConfirmation);
    expect(tConfirmation).toBeLessThanOrEqual(tFulfillment);

    // Verify the run was persisted and can be retrieved
    const dbRun = await RunRepository.get(runResult.id);
    expect(dbRun).not.toBeNull();
    expect(dbRun!.status).toBe('success');
    expect(dbRun!.results['order-created'].status).toBe('success');

    // Verify audit event creation
    const events = await AuditEventRepository.list('run', runResult.id);
    expect(events.length).toBeGreaterThanOrEqual(2); // Should have execute-start and execute-end events
    const startEvent = events.find(e => e.payload.status === 'running');
    const endEvent = events.find(e => e.payload.status === 'success');
    expect(startEvent).toBeDefined();
    expect(endEvent).toBeDefined();
  });

  it('2. should reject execution if trigger payload fails validation', async () => {
    if (!isDbAvailable) return;

    await seedOrderPlaced();

    const invalidPayload = {
      orderId: 'ORD-TEST-999',
      // Missing customerEmail and total
    };

    const adapter = new MockFormsAdapter();

    await expect(runWorkflow('wf_order_placed', invalidPayload, adapter))
      .rejects.toThrow('Trigger payload validation failed');

    // Ensure no Run record is created
    const runs = await RunRepository.list('wf_order_placed');
    expect(runs.length).toBe(0);
  });

  it('3. should reject execution if workflow has no published version', async () => {
    if (!isDbAvailable) return;

    // Create workflow but do not publish it
    await WorkflowRepository.create({
      id: 'wf_unpublished',
      name: 'Unpublished Workflow',
      status: 'draft',
      latestVersion: 1,
    });

    const adapter = new MockFormsAdapter();

    await expect(runWorkflow('wf_unpublished', {}, adapter))
      .rejects.toThrow('has no published version');
  });

  it('4. should fail run execution if a step fails', async () => {
    if (!isDbAvailable) return;

    await seedOrderPlaced();

    const triggerPayload = {
      orderId: 'ORD-FAIL',
      customerEmail: 'fail@example.com',
      total: 100,
    };

    // Configure mock adapter to fail on FraudService.check
    const adapter = new MockFormsAdapter({
      failOn: 'FraudService.check',
    });

    const runResult = await runWorkflow('wf_order_placed', triggerPayload, adapter);

    expect(runResult.status).toBe('failed');
    expect(runResult.results['order-created'].status).toBe('failed');
    expect(runResult.results['order-created'].error).toContain('Mock forced failure');

    // Ensure subsequent steps are not executed/skipped
    expect(runResult.results['invoice']).toBeUndefined();
    expect(runResult.results['confirmation']).toBeUndefined();
    expect(runResult.results['fulfillment']).toBeUndefined();

    // Verify DB run persistence
    const dbRun = await RunRepository.get(runResult.id);
    expect(dbRun!.status).toBe('failed');
  });

  it('5. should handle skip failure policy correctly, skipping the step but continuing execution', async () => {
    if (!isDbAvailable) return;

    // Create version document first
    const versionDoc = await VersionRepository.create({
      workflowId: 'wf_skip_test',
      version: 1,
      trigger: { id: 'tr_skip', type: 'manual' },
      nodes: [
        {
          id: 'step-fail',
          name: 'Failing Step with Skip Policy',
          type: 'action',
          action: 'Mock.failingAction',
          inputs: {},
          failurePolicy: { action: 'skip' }
        },
        {
          id: 'step-success',
          name: 'Subsequent Successful Step',
          type: 'action',
          action: 'Mock.successAction',
          inputs: {}
        }
      ],
      edges: [
        { id: 'edge-skip', source: 'step-fail', target: 'step-success' }
      ]
    });

    // Create workflow with generated version ID
    await WorkflowRepository.create({
      id: 'wf_skip_test',
      name: 'Skip Policy Test Workflow',
      status: 'published',
      latestVersion: 1,
      publishedVersionId: versionDoc.id,
    });

    const triggerPayload = {};
    const mockAdapter = new MockFormsAdapter({
      failOn: 'Mock.failingAction',
    });

    const runResult = await runWorkflow('wf_skip_test', triggerPayload, mockAdapter);

    // Skip failure policy should result in a successful run status overall
    expect(runResult.status).toBe('success');
    expect(runResult.results['step-fail']).toBeDefined();
    expect(runResult.results['step-fail'].status).toBe('skipped');
    expect(runResult.results['step-fail'].error).toContain('Step failed (skipped policy)');

    // Verify the subsequent node ran successfully
    expect(runResult.results['step-success']).toBeDefined();
    expect(runResult.results['step-success'].status).toBe('success');
  });

  it('6. should handle redirect failure policy correctly, jumping to the redirectTargetId node', async () => {
    if (!isDbAvailable) return;

    const { seedAssetRequestApproval } = await import('../seed/assetRequestApproval');
    await seedAssetRequestApproval();

    const triggerPayload = {
      requestId: 'REQ-redirect-777',
      approved: true,
      amount: 1200,
    };

    const mockAdapter = new MockFormsAdapter();
    const { normalizeError } = await import('../executor/formsAdapter');

    // Create a custom adapter implementing IFormsAdapter wrapping the mockAdapter
    const customAdapter: IFormsAdapter = {
      formCreate: (input: any) => mockAdapter.formCreate(input),
      formUpdate: (input: any) => mockAdapter.formUpdate(input),
      formDelete: (input: any) => mockAdapter.formDelete(input),
      operation: (input: any) => mockAdapter.operation(input),
      function: async (input: any) => {
        if (
          input.name === 'Slack.post' &&
          input.inputs.message &&
          String(input.inputs.message).includes('approved!')
        ) {
          return normalizeError('DISPATCH_ERROR', 'Failed to dispatch asset to warehouse');
        }
        return mockAdapter.function(input);
      }
    };

    const runResult = await runWorkflow('wf_asset_request_approval', triggerPayload, customAdapter);

    // Redirect policy should mark the final status of the run as success if the redirect target runs successfully
    expect(runResult.status).toBe('success');
    expect(runResult.results['approval'].status).toBe('success');
    expect(runResult.results['approved-action'].status).toBe('failed');
    expect(runResult.results['approved-action'].error).toContain('Step failed (redirected policy)');
    expect(runResult.results['failure-handler']).toBeDefined();
    expect(runResult.results['failure-handler'].status).toBe('success');
  });
});
