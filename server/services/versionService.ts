import {
  WorkflowRepository,
  VersionRepository,
  WorkflowDocument,
  WorkflowVersionDocument
} from '../../persistence';
import { Trigger, Node, Edge, Workflow } from '../../shared/ir';
import { validateWorkflow, ValidationError as SharedValidationError } from '../../shared/validator';
import { WorkflowPatchInput } from '../../shared/schemas';

export class StaleVersionError extends Error {
  constructor(message: string = 'Workflow version is locked (published status) or edit is stale') {
    super(message);
    this.name = 'StaleVersionError';
  }
}

export class ValidationError extends Error {
  errors: SharedValidationError[];
  constructor(errors: SharedValidationError[], message: string = 'Workflow validation failed') {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

// Simple JSON Patch helper following RFC 6902 pointer logic for workflow editing
export function applyPatch<T>(obj: T, patches: WorkflowPatchInput): T {
  const cloned = JSON.parse(JSON.stringify(obj));

  for (const patch of patches) {
    const { op, path, value } = patch;
    const parts = path.split('/').filter(p => p !== '');
    
    if (parts.length === 0) {
      if (op === 'replace') {
        return value;
      }
      throw new Error(`Invalid patch path: ${path}`);
    }

    let current = cloned;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        if (op === 'add') {
          current[part] = {};
        } else {
          throw new Error(`Path not found: ${path}`);
        }
      }
      current = current[part];
    }

    const lastPart = parts[parts.length - 1];

    if (op === 'add') {
      if (Array.isArray(current)) {
        if (lastPart === '-') {
          current.push(value);
        } else {
          const idx = parseInt(lastPart, 10);
          if (isNaN(idx)) {
            throw new Error(`Invalid array index: ${lastPart}`);
          }
          current.splice(idx, 0, value);
        }
      } else {
        current[lastPart] = value;
      }
    } else if (op === 'replace') {
      if (Array.isArray(current)) {
        const idx = parseInt(lastPart, 10);
        if (isNaN(idx)) {
          throw new Error(`Invalid array index: ${lastPart}`);
        }
        current[idx] = value;
      } else {
        current[lastPart] = value;
      }
    } else if (op === 'remove') {
      if (Array.isArray(current)) {
        const idx = parseInt(lastPart, 10);
        if (isNaN(idx)) {
          throw new Error(`Invalid array index: ${lastPart}`);
        }
        current.splice(idx, 1);
      } else {
        delete current[lastPart];
      }
    }
  }

  return cloned;
}

export class VersionService {
  /**
   * Initializes a new workflow with a starting draft version (Version 1).
   */
  static async createWorkflow(
    id: string,
    name: string,
    trigger: Trigger,
    nodes: Node[],
    edges: Edge[],
    metadata?: { source?: 'manual' | 'agent'; summary?: string }
  ): Promise<{ workflow: WorkflowDocument; version: WorkflowVersionDocument }> {
    const existing = await WorkflowRepository.get(id);
    if (existing) {
      throw new Error(`Workflow with ID ${id} already exists`);
    }

    // Validate draft structure before creating
    const tempWorkflowObj: Workflow = {
      id,
      version: 1,
      status: 'draft',
      trigger,
      nodes,
      edges,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const validation = validateWorkflow(tempWorkflowObj);
    if (!validation.success) {
      throw new ValidationError(validation.errors);
    }

    const workflow = await WorkflowRepository.create({
      id,
      name,
      status: 'draft',
      latestVersion: 1,
      publishedVersionId: null,
    });

    const version = await VersionRepository.create({
      workflowId: id,
      version: 1,
      trigger,
      nodes,
      edges,
      source: metadata?.source || 'agent', // By default, version 1 parsed from NLP is agent-detected
      summary: metadata?.summary || 'Initial requirement detection',
    });

    return { workflow, version };
  }

  /**
   * Creates a new draft version of a workflow by applying a patch to the specified baseVersion.
   */
  static async createDraft(
    workflowId: string,
    baseVersion: number,
    patch: WorkflowPatchInput,
    metadata?: { source?: 'manual' | 'agent'; summary?: string }
  ): Promise<{ workflow: WorkflowDocument; version: WorkflowVersionDocument }> {
    const workflow = await WorkflowRepository.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow with ID ${workflowId} not found`);
    }

    // Stale check
    if (baseVersion !== workflow.latestVersion) {
      throw new StaleVersionError('Workflow version is locked (published status) or edit is stale');
    }

    const baseVersionDoc = await VersionRepository.getByVersion(workflowId, baseVersion);
    if (!baseVersionDoc) {
      throw new Error(`Workflow version ${baseVersion} for workflow ${workflowId} not found`);
    }

    // Apply JSON Patch to the base version's properties
    const patchedBase = applyPatch(
      {
        trigger: baseVersionDoc.trigger,
        nodes: baseVersionDoc.nodes,
        edges: baseVersionDoc.edges,
      },
      patch
    );

    // Validate the resulting workflow configuration
    const tempWorkflowObj: Workflow = {
      id: workflowId,
      version: baseVersion + 1,
      status: 'draft',
      trigger: patchedBase.trigger,
      nodes: patchedBase.nodes,
      edges: patchedBase.edges,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const validation = validateWorkflow(tempWorkflowObj);
    if (!validation.success) {
      throw new ValidationError(validation.errors);
    }

    // Create the immutable new version document
    const version = await VersionRepository.create({
      workflowId,
      version: baseVersion + 1,
      trigger: patchedBase.trigger,
      nodes: patchedBase.nodes,
      edges: patchedBase.edges,
      source: metadata?.source || 'manual',
      summary: metadata?.summary || 'Manual configuration edit',
    });

    // Update parent workflow pointers (status becomes draft, version increments)
    const updatedWorkflow = await WorkflowRepository.update(workflowId, {
      latestVersion: baseVersion + 1,
      status: 'draft',
    });

    if (!updatedWorkflow) {
      throw new Error(`Failed to update workflow ${workflowId}`);
    }

    return { workflow: updatedWorkflow, version };
  }

  /**
   * Publishes a version of a workflow. Sets it as the active version and sets status to published.
   */
  static async publishVersion(
    workflowId: string,
    versionNumber: number
  ): Promise<{ workflow: WorkflowDocument; version: WorkflowVersionDocument }> {
    const workflow = await WorkflowRepository.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow with ID ${workflowId} not found`);
    }

    const versionDoc = await VersionRepository.getByVersion(workflowId, versionNumber);
    if (!versionDoc) {
      throw new Error(`Workflow version ${versionNumber} for workflow ${workflowId} not found`);
    }

    // Stale check
    if (versionNumber !== workflow.latestVersion) {
      throw new StaleVersionError('Workflow version is locked (published status) or edit is stale');
    }

    // Locked check
    if (workflow.status === 'published') {
      throw new StaleVersionError('Workflow version is locked (published status) or edit is stale');
    }

    // Validate before publishing
    const tempWorkflowObj: Workflow = {
      id: workflowId,
      version: versionNumber,
      status: 'published',
      trigger: versionDoc.trigger,
      nodes: versionDoc.nodes,
      edges: versionDoc.edges,
      createdAt: versionDoc.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const validation = validateWorkflow(tempWorkflowObj);
    if (!validation.success) {
      throw new ValidationError(validation.errors);
    }

    // Update publishedVersionId pointer and status
    const updatedWorkflow = await WorkflowRepository.update(workflowId, {
      status: 'published',
      publishedVersionId: versionDoc.id,
    });

    if (!updatedWorkflow) {
      throw new Error(`Failed to update workflow ${workflowId}`);
    }

    return { workflow: updatedWorkflow, version: versionDoc };
  }

  /**
   * Archives a workflow.
   */
  static async archiveWorkflow(workflowId: string): Promise<WorkflowDocument> {
    const workflow = await WorkflowRepository.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow with ID ${workflowId} not found`);
    }

    const updatedWorkflow = await WorkflowRepository.update(workflowId, {
      status: 'archived',
    });

    if (!updatedWorkflow) {
      throw new Error(`Failed to archive workflow ${workflowId}`);
    }

    return updatedWorkflow;
  }
}
