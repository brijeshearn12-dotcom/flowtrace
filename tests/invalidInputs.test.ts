import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Server } from 'http';
import express from 'express';
import { connectDB, closeDB, getDb } from '../server/db';
import workflowsRouter from '../server/routes/workflows';
import runsRouter from '../server/routes/runs';
import detectRouter from '../server/routes/detect';
import { seedOrderPlaced } from '../seed/orderPlaced';
import { COLLECTIONS, WorkflowRepository, VersionRepository, RunRepository } from '../persistence';
import { validateWorkflow } from '../shared/validator';
import { Workflow, Trigger, Node, Edge } from '../shared/ir';
import { detectWorkflow, DetectionResult } from '../detector';
import { resolveString, buildContext, TemplateResolutionError } from '../executor/templateResolver';
import { evaluate, ConditionError } from '../executor/conditionEvaluator';
import { MockFormsAdapter } from '../mock-forms-api/mockFormsAdapter';
import { runWorkflow } from '../executor/runWorkflow';
import { ValidateWorkflowResponse, AgentEditResponse } from '../shared/api';

describe('Step 4: Test Invalid Inputs - Non-Destructive Safety Suite', () => {
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

    app.use(express.json());
    app.use('/api/workflows', workflowsRouter);
    app.use('/api/runs', runsRouter);
    app.use('/api/detect', detectRouter);

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
    await db.collection(COLLECTIONS.RUNS).deleteMany({});
    await db.collection(COLLECTIONS.AUDIT_EVENTS).deleteMany({});
  });

  // Base workflow factory helper
  const createBaseWorkflow = (id = 'wf_test_base'): Workflow => ({
    id,
    version: 1,
    status: 'draft',
    trigger: {
      id: 'tr_manual',
      type: 'manual',
      schema: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
          amount: { type: 'number' }
        },
        required: ['orderId', 'amount']
      }
    },
    nodes: [
      {
        id: 'step_1',
        name: 'Step One',
        type: 'action',
        action: 'FraudService.check',
        inputs: { orderId: '{{trigger.orderId}}' }
      },
      {
        id: 'step_2',
        name: 'Step Two',
        type: 'action',
        action: 'Slack.post',
        inputs: { message: 'Processed {{step_1.score}}' }
      }
    ],
    edges: [
      { id: 'edge_1_2', source: 'step_1', target: 'step_2' }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // =========================================================================
  // 1. Missing Required Fields
  // =========================================================================
  describe('Case 1: Missing Required Fields', () => {
    it('1.1 should fail validation when workflow is missing id or name or trigger', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const brokenWf = createBaseWorkflow() as any;
      delete brokenWf.id;

      const result = validateWorkflow(brokenWf);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.path.includes('id'))).toBe(true);
    });

    it('1.2 should fail validation when a node is missing required fields (id, name, type, action)', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const brokenWf = createBaseWorkflow() as any;
      brokenWf.nodes[0] = {
        name: 'Missing ID and Action',
        inputs: {}
      };

      const result = validateWorkflow(brokenWf);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('1.3 should reject workflow creation with 400 Bad Request if id or name is missing', async () => {
      const resMissingName = await fetch(`http://localhost:${port}/api/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'wf_no_name' })
      });
      expect(resMissingName.status).toBe(400);
      const data1 = (await resMissingName.json()) as { error: string };
      expect(data1.error).toContain('id and name are required');

      const resMissingId = await fetch(`http://localhost:${port}/api/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'No ID Workflow' })
      });
      expect(resMissingId.status).toBe(400);
      const data2 = (await resMissingId.json()) as { error: string };
      expect(data2.error).toContain('id and name are required');
    });

    it('1.4 should reject workflow publish with 400 Bad Request if baseVersion is omitted', async () => {
      if (!isDbAvailable) return;
      await seedOrderPlaced();

      const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/publish`, {
        method: 'POST'
      });
      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('baseVersion parameter is required');
    });

    it('1.5 should reject execution when trigger payload is missing required fields and NOT execute or create run records', async () => {
      if (!isDbAvailable) return;
      await seedOrderPlaced();

      // Trigger payload missing 'customerEmail' and 'total'
      const invalidPayload = { orderId: 'ORD-MISSING-FIELDS' };

      const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: invalidPayload })
      });

      expect(res.status).toBe(422);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('payload validation failed');

      // Verify ZERO runs created in database
      const runs = await RunRepository.list('wf_order_placed');
      expect(runs.length).toBe(0);

      // Verify published workflow remains unchanged and published
      const wf = await WorkflowRepository.get('wf_order_placed');
      expect(wf!.status).toBe('published');
      expect(wf!.latestVersion).toBe(1);
    });
  });

  // =========================================================================
  // 2. Empty Requirement Text
  // =========================================================================
  describe('Case 2: Empty Requirement Text', () => {
    it('2.1 should throw clear error on empty or whitespace requirement text at unit level', () => {
      expect(() => detectWorkflow('')).toThrow('Requirement string is too short or empty');
      expect(() => detectWorkflow('   ')).toThrow('Requirement string is too short or empty');
      expect(() => detectWorkflow('hello')).toThrow('Requirement string is too short or empty');
    });

    it('2.2 should return 400 Bad Request on empty or missing requirement in POST /api/detect', async () => {
      // Empty string
      const resEmpty = await fetch(`http://localhost:${port}/api/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirement: '' })
      });
      expect(resEmpty.status).toBe(400);
      const dataEmpty = (await resEmpty.json()) as { error: string };
      expect(dataEmpty.error).toContain('too short or empty');

      // Whitespace only
      const resWhitespace = await fetch(`http://localhost:${port}/api/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirement: '     ' })
      });
      expect(resWhitespace.status).toBe(400);
      const dataWs = (await resWhitespace.json()) as { error: string };
      expect(dataWs.error).toContain('too short or empty');

      // Missing requirement key
      const resMissing = await fetch(`http://localhost:${port}/api/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(resMissing.status).toBe(400);
      const dataMissing = (await resMissing.json()) as { error: string };
      expect(dataMissing.error).toContain('too short or empty');
    });

    it('2.3 should ensure empty requirement requests do NOT mutate any existing workflows', async () => {
      if (!isDbAvailable) return;
      await seedOrderPlaced();

      await fetch(`http://localhost:${port}/api/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirement: '' })
      });

      const orderPlaced = await WorkflowRepository.get('wf_order_placed');
      expect(orderPlaced).not.toBeNull();
      expect(orderPlaced!.status).toBe('published');
      expect(orderPlaced!.latestVersion).toBe(1);
    });
  });

  // =========================================================================
  // 3. Unknown Operation
  // =========================================================================
  describe('Case 3: Unknown Operation', () => {
    it('3.1 should return success: false with clear warning when requirement contains unmapped operations', () => {
      const unknownReq = 'Build an autonomous spacecraft flight controller for Mars trajectory insertion';
      const result: DetectionResult = detectWorkflow(unknownReq);

      expect(result.success).toBe(false);
      expect(result.confidence).toBe(0);
      expect(result.workflow.nodes.length).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('did not match any allowlisted workflow pattern');
    });

    it('3.2 should return clear warning and empty patch for unknown agent proposal prompts', async () => {
      if (!isDbAvailable) return;
      await seedOrderPlaced();

      const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/agent-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Synthesize quantum teleportation protocol'
        })
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as AgentEditResponse;
      expect(data.success).toBe(false);
      expect(data.warning).toBeDefined();
      expect(data.warning).toContain('quantum teleportation protocol');
      expect(data.patch).toEqual([]);

      // Verify published workflow is unmodified
      const wf = await WorkflowRepository.get('wf_order_placed');
      expect(wf!.status).toBe('published');
      expect(wf!.latestVersion).toBe(1);
    });

    it('3.3 should reject workflow validation if a node has an invalid type or empty action', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wfInvalidType = createBaseWorkflow() as any;
      wfInvalidType.nodes[0].type = 'unsupported_custom_type';
      const resultType = validateWorkflow(wfInvalidType);
      expect(resultType.success).toBe(false);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wfEmptyAction = createBaseWorkflow() as any;
      wfEmptyAction.nodes[0].action = '';
      const resultAction = validateWorkflow(wfEmptyAction);
      expect(resultAction.success).toBe(false);
    });

    it('3.4 should safely handle unknown adapter functions with fallback without crashing executor', async () => {
      const adapter = new MockFormsAdapter();
      const res = await adapter.function({ name: 'UnknownCustom.service', inputs: {} });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toEqual({ ok: true });
      }
    });
  });

  // =========================================================================
  // 4. Invalid Template / Reference Path
  // =========================================================================
  describe('Case 4: Invalid Template/Reference Path', () => {
    it('4.1 should reject workflow validation for non-existent step references', () => {
      const wf = createBaseWorkflow();
      wf.nodes[0].inputs = {
        badRef: '{{non_existent_step.outputKey}}'
      };

      const result = validateWorkflow(wf);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_step_reference')).toBe(true);
    });

    it('4.2 should reject workflow validation for forward/non-ancestor references', () => {
      const wf = createBaseWorkflow();
      // step_1 is parent of step_2, so step_1 referencing step_2 is invalid forward reference
      wf.nodes[0].inputs = {
        forwardRef: '{{step_2.result}}'
      };

      const result = validateWorkflow(wf);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.code === 'non_ancestor_reference')).toBe(true);
    });

    it('4.3 should reject workflow validation for non-existent redirectTargetId', () => {
      const wf = createBaseWorkflow();
      wf.nodes[0].failurePolicy = {
        action: 'redirect',
        redirectTargetId: 'missing_recovery_node'
      };

      const result = validateWorkflow(wf);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.code === 'invalid_redirect_target')).toBe(true);
    });

    it('4.4 should throw TemplateResolutionError when resolving missing trigger or step path at runtime', () => {
      const ctx = buildContext({ existingField: '123' });

      expect(() => resolveString('{{trigger.nonExistentField}}', ctx)).toThrow(TemplateResolutionError);
      try {
        resolveString('{{trigger.nonExistentField}}', ctx);
      } catch (err) {
        const trErr = err as TemplateResolutionError;
        expect(trErr.code).toBe('TEMPLATE_REFERENCE_NOT_FOUND');
        expect(trErr.reference).toBe('{{trigger.nonExistentField}}');
      }

      expect(() => resolveString('{{step_missing.value}}', ctx)).toThrow(TemplateResolutionError);
    });

    it('4.5 should return ConditionError with clear error code on missing condition field or type mismatch', () => {
      const ctx = buildContext({ count: 'not_a_number' });

      // Condition on missing field path
      const missingFieldCond = {
        field: '{{trigger.missingField}}',
        operator: 'eq' as const,
        value: 10
      };
      const resMissing = evaluate(missingFieldCond, ctx);
      expect(resMissing.matched).toBe(false);
      expect((resMissing as ConditionError).code).toBe('CONDITION_FIELD_RESOLUTION_ERROR');

      // Numeric operator 'gt' with string operand
      const typeMismatchCond = {
        field: '{{trigger.count}}',
        operator: 'gt' as const,
        value: 5
      };
      const resMismatch = evaluate(typeMismatchCond, ctx);
      expect(resMismatch.matched).toBe(false);
      expect((resMismatch as ConditionError).code).toBe('CONDITION_TYPE_MISMATCH');
    });

    it('4.6 should block publishing a draft with invalid references via POST /api/workflows/:id/publish with 422', async () => {
      if (!isDbAvailable) return;

      // Seed valid base workflow
      await WorkflowRepository.create({
        id: 'wf_ref_test',
        name: 'Reference Test Workflow',
        status: 'draft',
        latestVersion: 1
      });

      // Insert invalid version 1 directly
      await VersionRepository.create({
        workflowId: 'wf_ref_test',
        version: 1,
        trigger: { id: 'tr_manual', type: 'manual' },
        nodes: [
          {
            id: 'broken_node',
            name: 'Broken Node',
            type: 'action',
            action: 'Slack.post',
            inputs: { text: '{{missing_step.data}}' }
          }
        ],
        edges: []
      });

      const res = await fetch(`http://localhost:${port}/api/workflows/wf_ref_test/publish?baseVersion=1`, {
        method: 'POST'
      });

      expect(res.status).toBe(422);
      const data = (await res.json()) as ValidateWorkflowResponse;
      expect(data.success).toBe(false);
      expect(data.errors).toBeDefined();
      expect(data.errors![0].message).toContain('refers to a non-existent step');

      // Verify status is still draft in database and publishedVersionId is null
      const wf = await WorkflowRepository.get('wf_ref_test');
      expect(wf!.status).toBe('draft');
      expect(wf!.publishedVersionId).toBeNull();
    });
  });

  // =========================================================================
  // 5. Cyclic Workflow
  // =========================================================================
  describe('Case 5: Cyclic Workflow', () => {
    it('5.1 should detect simple cycle A -> B -> A and return cycle_detected error code', () => {
      const wf = createBaseWorkflow();
      // Add back-edge B -> A
      wf.edges.push({
        id: 'edge_2_1',
        source: 'step_2',
        target: 'step_1'
      });

      const result = validateWorkflow(wf);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.code === 'cycle_detected')).toBe(true);
      expect(result.errors[0].message).toContain('Cycle detected');
    });

    it('5.2 should detect self-loop A -> A and return self_loop error code', () => {
      const wf = createBaseWorkflow();
      wf.edges.push({
        id: 'edge_self',
        source: 'step_1',
        target: 'step_1'
      });

      const result = validateWorkflow(wf);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.code === 'self_loop')).toBe(true);
    });

    it('5.3 should detect multi-node cycle A -> B -> C -> A', () => {
      const wf = createBaseWorkflow();
      wf.nodes.push({
        id: 'step_3',
        name: 'Step Three',
        type: 'action',
        action: 'EmailService.send',
        inputs: {}
      });
      wf.edges.push({ id: 'edge_2_3', source: 'step_2', target: 'step_3' });
      wf.edges.push({ id: 'edge_3_1', source: 'step_3', target: 'step_1' }); // forms cycle

      const result = validateWorkflow(wf);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.code === 'cycle_detected')).toBe(true);
    });

    it('5.4 should block publishing a cyclic draft with 422 and leave workflow in draft status', async () => {
      if (!isDbAvailable) return;

      await WorkflowRepository.create({
        id: 'wf_cyclic_test',
        name: 'Cyclic Workflow',
        status: 'draft',
        latestVersion: 1
      });

      // Insert cyclic draft version
      await VersionRepository.create({
        workflowId: 'wf_cyclic_test',
        version: 1,
        trigger: { id: 'tr_manual', type: 'manual' },
        nodes: [
          { id: 'node_x', name: 'Node X', type: 'action', action: 'Slack.post', inputs: {} },
          { id: 'node_y', name: 'Node Y', type: 'action', action: 'Slack.post', inputs: {} }
        ],
        edges: [
          { id: 'edge_xy', source: 'node_x', target: 'node_y' },
          { id: 'edge_yx', source: 'node_y', target: 'node_x' }
        ]
      });

      const res = await fetch(`http://localhost:${port}/api/workflows/wf_cyclic_test/publish?baseVersion=1`, {
        method: 'POST'
      });

      expect(res.status).toBe(422);
      const data = (await res.json()) as ValidateWorkflowResponse;
      expect(data.success).toBe(false);
      expect(data.errors?.some(e => e.code === 'cycle_detected')).toBe(true);

      // Verify status is draft and no version published
      const wf = await WorkflowRepository.get('wf_cyclic_test');
      expect(wf!.status).toBe('draft');
      expect(wf!.publishedVersionId).toBeNull();
    });

    it('5.5 should reject execution attempt on unpublished or cyclic workflow', async () => {
      if (!isDbAvailable) return;

      await WorkflowRepository.create({
        id: 'wf_cyclic_exec_test',
        name: 'Cyclic Execution Test',
        status: 'draft',
        latestVersion: 1
      });

      const adapter = new MockFormsAdapter();
      await expect(runWorkflow('wf_cyclic_exec_test', {}, adapter))
        .rejects.toThrow('has no published version');
    });
  });

  // =========================================================================
  // 6. Stale Published Version
  // =========================================================================
  describe('Case 6: Stale Published Version Protection', () => {
    it('6.1 should reject PATCH edit with 409 Conflict when baseVersion is stale', async () => {
      if (!isDbAvailable) return;

      // 1. Create workflow
      const trigger: Trigger = { id: 'tr_stale', type: 'manual' };
      const nodes: Node[] = [{ id: 's1', name: 'S1', type: 'action', action: 'Slack.post', inputs: {} }];
      const edges: Edge[] = [];

      const v1Doc = await VersionRepository.create({
        workflowId: 'wf_stale_test',
        version: 1,
        trigger,
        nodes,
        edges
      });

      await WorkflowRepository.create({
        id: 'wf_stale_test',
        name: 'Stale Test',
        status: 'published',
        latestVersion: 1,
        publishedVersionId: v1Doc.id
      });

      // 2. Perform edit to version 2
      const patchRes1 = await fetch(`http://localhost:${port}/api/workflows/wf_stale_test?baseVersion=1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { op: 'replace', path: '/nodes/0/name', value: 'Updated V2 Name' }
        ])
      });
      expect(patchRes1.status).toBe(200);

      // Workflow is now at latestVersion = 2 (draft)
      const wfAfterPatch = await WorkflowRepository.get('wf_stale_test');
      expect(wfAfterPatch!.latestVersion).toBe(2);

      // 3. Attempt another patch using stale baseVersion = 1 -> should fail with 409 Conflict
      const stalePatchRes = await fetch(`http://localhost:${port}/api/workflows/wf_stale_test?baseVersion=1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { op: 'replace', path: '/nodes/0/name', value: 'Conflicting Edit' }
        ])
      });
      expect(stalePatchRes.status).toBe(409);
      const staleData = (await stalePatchRes.json()) as { error: string };
      expect(staleData.error).toContain('stale');

      // 4. Verify version 2 draft content was NOT overwritten
      const v2Doc = await VersionRepository.getByVersion('wf_stale_test', 2);
      expect(v2Doc!.nodes[0].name).toBe('Updated V2 Name');
    });

    it('6.2 should reject publish with 409 Conflict when baseVersion does not match latest draft', async () => {
      if (!isDbAvailable) return;

      const trigger: Trigger = { id: 'tr_stale_pub', type: 'manual' };
      const nodes: Node[] = [{ id: 's1', name: 'S1', type: 'action', action: 'Slack.post', inputs: {} }];
      const edges: Edge[] = [];

      const v1Doc = await VersionRepository.create({
        workflowId: 'wf_stale_pub_test',
        version: 1,
        trigger,
        nodes,
        edges
      });

      await VersionRepository.create({
        workflowId: 'wf_stale_pub_test',
        version: 2,
        trigger,
        nodes: [{ id: 's1', name: 'S1 Draft V2', type: 'action', action: 'Slack.post', inputs: {} }],
        edges
      });

      await WorkflowRepository.create({
        id: 'wf_stale_pub_test',
        name: 'Stale Publish Test',
        status: 'draft',
        latestVersion: 2,
        publishedVersionId: v1Doc.id
      });

      // Workflow 'wf_stale_pub_test' is at latestVersion = 2. Try publishing with stale baseVersion = 1
      const stalePublishRes = await fetch(`http://localhost:${port}/api/workflows/wf_stale_pub_test/publish?baseVersion=1`, {
        method: 'POST'
      });
      expect(stalePublishRes.status).toBe(409);
      const stalePubData = (await stalePublishRes.json()) as { error: string };
      expect(stalePubData.error).toContain('stale');

      // Verify the workflow is still draft and publishedVersionId still points to version 1
      const wf = await WorkflowRepository.get('wf_stale_pub_test');
      expect(wf!.status).toBe('draft');
      const publishedDoc = await VersionRepository.get(wf!.publishedVersionId!);
      expect(publishedDoc!.version).toBe(1);
      expect(publishedDoc!.nodes[0].name).toBe('S1'); // Original published version 1 is immutable
    });

    it('6.3 should reject publishing an already published workflow with 409 Conflict', async () => {
      if (!isDbAvailable) return;
      await seedOrderPlaced(); // version 1 is published

      // Try publishing version 1 again
      const res = await fetch(`http://localhost:${port}/api/workflows/wf_order_placed/publish?baseVersion=1`, {
        method: 'POST'
      });

      expect(res.status).toBe(409);
      const data = (await res.json()) as { error: string };
      expect(data.error).toContain('locked');
    });
  });
});
