import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectDB, closeDB, getDb } from '../server/db';
import { COLLECTIONS, WorkflowRepository, VersionRepository } from '../persistence';
import { VersionService, StaleVersionError } from '../server/services/versionService';
import { Trigger, Node, Edge } from '../shared/ir';

describe('VersionService Lifecycle Tests', () => {
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

  const trigger: Trigger = { id: 'tr_1', type: 'manual' };
  const nodes: Node[] = [{ id: 'step_1', name: 'Step One', type: 'action', action: 'Mock.action', inputs: {} }];
  const edges: Edge[] = [];

  it('1. should verify draft creation works (initial workflow and updates)', async () => {
    // 1. Initial workflow creation
    const { workflow, version } = await VersionService.createWorkflow(
      'wf_test',
      'Test Workflow',
      trigger,
      nodes,
      edges
    );

    expect(workflow.id).toBe('wf_test');
    expect(workflow.status).toBe('draft');
    expect(workflow.latestVersion).toBe(1);
    expect(workflow.publishedVersionId).toBeNull();
    expect(version.version).toBe(1);
    expect(version.workflowId).toBe('wf_test');

    // 2. Draft update (apply patch)
    const patch = [{ op: 'replace' as const, path: '/nodes/0/name', value: 'Updated Step One' }];
    const result = await VersionService.createDraft('wf_test', 1, patch);

    expect(result.workflow.latestVersion).toBe(2);
    expect(result.workflow.status).toBe('draft');
    expect(result.version.version).toBe(2);
    expect(result.version.nodes[0].name).toBe('Updated Step One');
  });

  it('2. should verify draft does not modify the published version pointer', async () => {
    // Create and publish version 1
    const { version: v1 } = await VersionService.createWorkflow('wf_test', 'Test Workflow', trigger, nodes, edges);
    await VersionService.publishVersion('wf_test', 1);

    // Verify published state
    let workflow = await WorkflowRepository.get('wf_test');
    expect(workflow!.status).toBe('published');
    expect(workflow!.publishedVersionId).toBe(v1.id);
    expect(workflow!.latestVersion).toBe(1);

    // Create a draft edit (version 2)
    const patch = [{ op: 'replace' as const, path: '/nodes/0/name', value: 'Updated Node' }];
    await VersionService.createDraft('wf_test', 1, patch);

    // Verify latestVersion is incremented, status is back to draft, but publishedVersionId pointer is NOT changed
    workflow = await WorkflowRepository.get('wf_test');
    expect(workflow!.latestVersion).toBe(2);
    expect(workflow!.status).toBe('draft');
    expect(workflow!.publishedVersionId).toBe(v1.id); // preserved!
  });

  it('3. should verify publishing a valid version works', async () => {
    const { version: v1 } = await VersionService.createWorkflow('wf_test', 'Test Workflow', trigger, nodes, edges);
    const result = await VersionService.publishVersion('wf_test', 1);

    expect(result.workflow.status).toBe('published');
    expect(result.workflow.publishedVersionId).toBe(v1.id);

    const publishedVersion = await VersionRepository.get(v1.id);
    expect(publishedVersion).not.toBeNull();
  });

  it('4. should verify published versions remain immutable', async () => {
    const { version: v1 } = await VersionService.createWorkflow('wf_test', 'Test Workflow', trigger, nodes, edges);
    await VersionService.publishVersion('wf_test', 1);

    // Attempt to edit - should create a new version document (v2) and leave v1 completely intact
    const patch = [{ op: 'replace' as const, path: '/nodes/0/name', value: 'New Name' }];
    const { version: v2 } = await VersionService.createDraft('wf_test', 1, patch);

    expect(v2.version).toBe(2);

    // Verify v1 document is unmodified
    const retrievedV1 = await VersionRepository.get(v1.id);
    expect(retrievedV1!.nodes[0].name).toBe('Step One');
    expect(retrievedV1!.version).toBe(1);

    // Verify v2 document has the new name
    const retrievedV2 = await VersionRepository.get(v2.id);
    expect(retrievedV2!.nodes[0].name).toBe('New Name');
    expect(retrievedV2!.version).toBe(2);
  });

  it('5. should verify archiving works without deleting historical versions', async () => {
    const { version: v1 } = await VersionService.createWorkflow('wf_test', 'Test Workflow', trigger, nodes, edges);
    await VersionService.publishVersion('wf_test', 1);

    const archived = await VersionService.archiveWorkflow('wf_test');
    expect(archived.status).toBe('archived');

    // Historical versions should still exist
    const versionCount = await VersionRepository.list('wf_test');
    expect(versionCount.length).toBe(1);
    expect(versionCount[0].id).toBe(v1.id);
  });

  it('6. should reject updates with a stale baseVersion', async () => {
    await VersionService.createWorkflow('wf_test', 'Test Workflow', trigger, nodes, edges);

    // Make an edit, advancing latestVersion to 2
    const patch = [{ op: 'replace' as const, path: '/nodes/0/name', value: 'First Edit' }];
    await VersionService.createDraft('wf_test', 1, patch);

    // Attempt to edit again using baseVersion 1 (which is now outdated, latest is 2)
    const patchStale = [{ op: 'replace' as const, path: '/nodes/0/name', value: 'Stale Edit' }];
    await expect(
      VersionService.createDraft('wf_test', 1, patchStale)
    ).rejects.toThrow(StaleVersionError);
  });

  it('7. should verify a stale update does NOT modify published data or draft data', async () => {
    const { version: v1 } = await VersionService.createWorkflow('wf_test', 'Test Workflow', trigger, nodes, edges);
    await VersionService.publishVersion('wf_test', 1);

    // Create a valid draft edit (version 2)
    const patch1 = [{ op: 'replace' as const, path: '/nodes/0/name', value: 'Second version' }];
    await VersionService.createDraft('wf_test', 1, patch1);

    // Stale edit attempt (referencing baseVersion 1)
    const patch2 = [{ op: 'replace' as const, path: '/nodes/0/name', value: 'Stale overwrite attempt' }];
    try {
      await VersionService.createDraft('wf_test', 1, patch2);
    } catch (e) {
      expect(e).toBeInstanceOf(StaleVersionError);
    }

    // Verify parent workflow latestVersion is still 2 and status remains draft
    const workflow = await WorkflowRepository.get('wf_test');
    expect(workflow!.latestVersion).toBe(2);
    expect(workflow!.status).toBe('draft');
    expect(workflow!.publishedVersionId).toBe(v1.id);

    // Verify version 2 has "Second version" and not "Stale overwrite attempt"
    const v2 = await VersionRepository.getByVersion('wf_test', 2);
    expect(v2!.nodes[0].name).toBe('Second version');

    // Verify there is no version 3
    const v3 = await VersionRepository.getByVersion('wf_test', 3);
    expect(v3).toBeNull();
  });

  it('8. should verify version history remains intact after publishing multiple versions', async () => {
    // V1 Draft
    await VersionService.createWorkflow('wf_test', 'Test Workflow', trigger, nodes, edges);
    
    // V2 Draft
    const patch1 = [{ op: 'replace' as const, path: '/nodes/0/name', value: 'V2 Node' }];
    await VersionService.createDraft('wf_test', 1, patch1);

    // Publish V2
    await VersionService.publishVersion('wf_test', 2);

    // V3 Draft
    const patch2 = [{ op: 'replace' as const, path: '/nodes/0/name', value: 'V3 Node' }];
    await VersionService.createDraft('wf_test', 2, patch2);

    // List all versions
    const versions = await VersionRepository.list('wf_test');
    expect(versions.length).toBe(3);

    // Verify each version's details are distinct and unmodified
    const retrievedV1 = versions.find(v => v.version === 1);
    const retrievedV2 = versions.find(v => v.version === 2);
    const retrievedV3 = versions.find(v => v.version === 3);

    expect(retrievedV1!.nodes[0].name).toBe('Step One');
    expect(retrievedV2!.nodes[0].name).toBe('V2 Node');
    expect(retrievedV3!.nodes[0].name).toBe('V3 Node');
  });

  it('9. should verify workflow pointer changes only when appropriate', async () => {
    await VersionService.createWorkflow('wf_test', 'Test Workflow', trigger, nodes, edges);
    
    let workflow = await WorkflowRepository.get('wf_test');
    expect(workflow!.publishedVersionId).toBeNull();
    expect(workflow!.latestVersion).toBe(1);

    // Pointer does NOT change on draft creation
    const patch = [{ op: 'replace' as const, path: '/nodes/0/name', value: 'Draft V2' }];
    await VersionService.createDraft('wf_test', 1, patch);

    workflow = await WorkflowRepository.get('wf_test');
    expect(workflow!.publishedVersionId).toBeNull();
    expect(workflow!.latestVersion).toBe(2);

    // Pointer changes only on publish
    const v2 = await VersionRepository.getByVersion('wf_test', 2);
    await VersionService.publishVersion('wf_test', 2);

    workflow = await WorkflowRepository.get('wf_test');
    expect(workflow!.publishedVersionId).toBe(v2!.id);
    expect(workflow!.latestVersion).toBe(2);
  });
});
