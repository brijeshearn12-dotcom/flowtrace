import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectDB, closeDB, getDb } from '../server/db';
import {
  COLLECTIONS,
  MetadataRepository,
  WorkflowRepository,
  VersionRepository,
  RunRepository,
  AuditEventRepository
} from '../persistence';

describe('Typed Repositories Persistence Tests', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await closeDB();
  });

  beforeEach(async () => {
    const db = getDb();
    await db.collection(COLLECTIONS.METADATA).deleteMany({});
    await db.collection(COLLECTIONS.WORKFLOWS).deleteMany({});
    await db.collection(COLLECTIONS.VERSIONS).deleteMany({});
    await db.collection(COLLECTIONS.RUNS).deleteMany({});
    await db.collection(COLLECTIONS.AUDIT_EVENTS).deleteMany({});
  });

  it('1. should create, retrieve and update metadata', async () => {
    const key = 'forms_api_schema';
    const value = { actions: { 'FormsAPI.submit': { inputs: { formId: 'string' } } } };

    const created = await MetadataRepository.create(key, value);
    expect(created.key).toBe(key);
    expect(created.value).toEqual(value);
    expect(created.updatedAt).toBeDefined();

    const retrieved = await MetadataRepository.get(key);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.value).toEqual(value);

    const newValue = { actions: { 'FormsAPI.submit': { inputs: { formId: 'string', payload: 'object' } } } };
    const updated = await MetadataRepository.update(key, newValue);
    expect(updated).not.toBeNull();
    expect(updated!.value).toEqual(newValue);

    const afterUpdate = await MetadataRepository.get(key);
    expect(afterUpdate!.value).toEqual(newValue);
  });

  it('2. should verify workflow creation and retrieval', async () => {
    const workflowId = 'wf_order_placed';
    const name = 'Order Placement Process';

    const created = await WorkflowRepository.create({
      id: workflowId,
      name,
      status: 'draft',
      latestVersion: 1,
      publishedVersionId: null
    });

    expect(created.id).toBe(workflowId);
    expect(created.name).toBe(name);
    expect(created.status).toBe('draft');
    expect(created.latestVersion).toBe(1);
    expect(created.publishedVersionId).toBeNull();
    expect(created.createdAt).toBeDefined();
    expect(created.updatedAt).toBeDefined();

    const retrieved = await WorkflowRepository.get(workflowId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.name).toBe(name);
  });

  it('3. should verify workflow listing and updates', async () => {
    await WorkflowRepository.create({ id: 'wf_1', name: 'Workflow 1' });
    await WorkflowRepository.create({ id: 'wf_2', name: 'Workflow 2' });

    const list = await WorkflowRepository.list();
    expect(list.length).toBe(2);
    expect(list.some(w => w.id === 'wf_1')).toBe(true);
    expect(list.some(w => w.id === 'wf_2')).toBe(true);

    const updated = await WorkflowRepository.update('wf_1', { status: 'published', latestVersion: 2 });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('published');
    expect(updated!.latestVersion).toBe(2);

    const retrieved = await WorkflowRepository.get('wf_1');
    expect(retrieved!.status).toBe('published');
  });

  it('4. should insert and retrieve workflow versions', async () => {
    const trigger = { id: 'tr_1', type: 'manual' as const };
    const nodes = [{ id: 'step_fraud', name: 'Fraud Check', type: 'action' as const, action: 'FraudService.check', inputs: {} }];
    const edges: import('../shared/ir').Edge[] = [];

    const versionDoc = await VersionRepository.create({
      workflowId: 'wf_order_placed',
      version: 1,
      trigger,
      nodes,
      edges
    });

    expect(versionDoc.id).toBeDefined();
    expect(versionDoc.workflowId).toBe('wf_order_placed');
    expect(versionDoc.version).toBe(1);
    expect(versionDoc.trigger).toEqual(trigger);
    expect(versionDoc.nodes).toEqual(nodes);
    expect(versionDoc.createdAt).toBeDefined();

    const byId = await VersionRepository.get(versionDoc.id);
    expect(byId).not.toBeNull();
    expect(byId!.version).toBe(1);

    const byVersion = await VersionRepository.getByVersion('wf_order_placed', 1);
    expect(byVersion).not.toBeNull();
    expect(byVersion!.id).toBe(versionDoc.id);

    const list = await VersionRepository.list('wf_order_placed');
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(versionDoc.id);

    // Test publish version update pointer helper
    await WorkflowRepository.create({ id: 'wf_order_placed', name: 'Order Placed' });
    await VersionRepository.publish('wf_order_placed', versionDoc.id);

    const workflow = await WorkflowRepository.get('wf_order_placed');
    expect(workflow!.status).toBe('published');
    expect(workflow!.publishedVersionId).toBe(versionDoc.id);
  });

  it('5. should insert, retrieve, list and update workflow runs', async () => {
    const runId = 'run_999';
    const triggerPayload = { orderId: 'ord_100', amount: 250 };
    const results = {
      step_fraud: {
        stepId: 'step_fraud',
        status: 'success' as const,
        output: { score: 0.05 },
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      }
    };

    const created = await RunRepository.create({
      id: runId,
      workflowId: 'wf_order_placed',
      workflowVersionId: '60c72b2f9b1d8b2bad8f4202',
      version: 2,
      status: 'running',
      triggerPayload,
      results
    });

    expect(created.id).toBe(runId);
    expect(created.workflowId).toBe('wf_order_placed');
    expect(created.workflowVersionId).toBe('60c72b2f9b1d8b2bad8f4202');
    expect(created.version).toBe(2);
    expect(created.status).toBe('running');
    expect(created.triggerPayload).toEqual(triggerPayload);
    expect(created.results).toEqual(results);
    expect(created.startedAt).toBeDefined();

    const retrieved = await RunRepository.get(runId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(runId);

    const list = await RunRepository.list('wf_order_placed');
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(runId);

    // Update status and completedAt
    const completedAt = new Date().toISOString();
    const updated = await RunRepository.update(runId, {
      status: 'success',
      completedAt
    });

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('success');
    expect(updated!.completedAt).toBe(completedAt);

    const retrievedUpdated = await RunRepository.get(runId);
    expect(retrievedUpdated!.status).toBe('success');
  });

  it('6. should insert and list audit events', async () => {
    const payload = {
      prompt: 'change fraud threshold to 0.9',
      patch: [{ op: 'replace', path: '/nodes/0/inputs/threshold', value: 0.9 }]
    };

    const created = await AuditEventRepository.create({
      actor: 'agent',
      action: 'edit',
      entityType: 'workflow',
      entityId: 'wf_order_placed',
      payload
    });

    expect(created.id).toBeDefined();
    expect(created.actor).toBe('agent');
    expect(created.action).toBe('edit');
    expect(created.entityType).toBe('workflow');
    expect(created.entityId).toBe('wf_order_placed');
    expect(created.payload).toEqual(payload);
    expect(created.timestamp).toBeDefined();

    const retrieved = await AuditEventRepository.get(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(created.id);

    const list = await AuditEventRepository.list('workflow', 'wf_order_placed');
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(created.id);
  });

  it('7. should behave cleanly on missing records', async () => {
    expect(await MetadataRepository.get('non_existent')).toBeNull();
    expect(await WorkflowRepository.get('non_existent')).toBeNull();
    expect(await VersionRepository.get('60c72b2f9b1d8b2bad8f4202')).toBeNull();
    expect(await VersionRepository.getByVersion('non_existent', 99)).toBeNull();
    expect(await RunRepository.get('non_existent')).toBeNull();
    expect(await AuditEventRepository.get('60c72b2f9b1d8b2bad8f4202')).toBeNull();

    // Updates of non-existent should return null
    expect(await WorkflowRepository.update('non_existent', { name: 'New' })).toBeNull();
    expect(await RunRepository.update('non_existent', { status: 'success' })).toBeNull();
  });
});
