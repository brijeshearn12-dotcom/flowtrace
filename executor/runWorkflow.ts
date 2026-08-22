import {
  WorkflowRepository,
  VersionRepository,
  RunRepository,
  AuditEventRepository,
  RunDocument
} from '../persistence';
import { StepResult, RunStatus } from '../shared/ir';
import { validateWorkflow } from '../shared/validator';
import { ValidationError } from '../server/services/versionService';
import { IFormsAdapter } from './formsAdapter';
import { buildContext, addStepResult, resolveInputs } from './templateResolver';
import { evaluateOptional } from './conditionEvaluator';

interface TriggerSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, { type?: string; title?: string }>;
}

/**
 * Validates the trigger payload against the JSON Schema defined in the trigger.
 * Throws an error if required properties are missing or types mismatch.
 */
export function validateTriggerPayload(schema: unknown, payload: Record<string, unknown>): void {
  if (!schema) return;
  
  const typedSchema = schema as TriggerSchema;
  if (typedSchema.type === 'object') {
    const required = typedSchema.required || [];
    for (const key of required) {
      if (payload[key] === undefined || payload[key] === null) {
        throw new Error(`Trigger payload validation failed: missing required property "${key}"`);
      }
    }
    
    const properties = typedSchema.properties || {};
    for (const [key, prop] of Object.entries(properties)) {
      const val = payload[key];
      if (val !== undefined && val !== null) {
        if (prop.type === 'string' && typeof val !== 'string') {
          throw new Error(`Trigger payload validation failed: property "${key}" must be a string`);
        }
        if (prop.type === 'number' && typeof val !== 'number') {
          throw new Error(`Trigger payload validation failed: property "${key}" must be a number`);
        }
        if (prop.type === 'boolean' && typeof val !== 'boolean') {
          throw new Error(`Trigger payload validation failed: property "${key}" must be a boolean`);
        }
      }
    }
  }
}

/**
 * Runs a published workflow sequentially.
 *
 * 1. Loads the published version of the workflow.
 * 2. Validates the workflow schema and invariants.
 * 3. Validates the trigger payload.
 * 4. Creates a Run record in the database.
 * 5. Executes eligible nodes in topological order using the supplied formsAdapter.
 * 6. Evaluates pre-conditions and edge conditions.
 * 7. Resolves template variables on inputs dynamically before executing each node.
 * 8. Persists intermediate run states after each step completes.
 * 9. Sets run status to success or failed and records audit events.
 *
 * @param workflowId - The ID of the workflow to run.
 * @param triggerPayload - Payload initiating the manual trigger.
 * @param adapter - Injected forms adapter (mock or real).
 */
export async function runWorkflow(
  workflowId: string,
  triggerPayload: Record<string, unknown>,
  adapter: IFormsAdapter
): Promise<RunDocument> {
  // 1. Load the published workflow
  const workflowDoc = await WorkflowRepository.get(workflowId);
  if (!workflowDoc) {
    throw new Error(`Workflow with ID "${workflowId}" not found`);
  }
  
  if (!workflowDoc.publishedVersionId) {
    throw new Error(`Workflow with ID "${workflowId}" has no published version`);
  }
  
  const versionDoc = await VersionRepository.get(workflowDoc.publishedVersionId);
  if (!versionDoc) {
    throw new Error(`Workflow version with ID "${workflowDoc.publishedVersionId}" not found`);
  }

  // 2. Validate workflow graph invariants
  const validation = validateWorkflow({
    id: versionDoc.workflowId,
    version: versionDoc.version,
    status: workflowDoc.status,
    trigger: versionDoc.trigger,
    nodes: versionDoc.nodes,
    edges: versionDoc.edges,
    createdAt: versionDoc.createdAt,
    updatedAt: workflowDoc.updatedAt,
  });
  
  if (!validation.success) {
    throw new ValidationError(validation.errors);
  }

  // 3. Validate trigger payload
  validateTriggerPayload(versionDoc.trigger.schema, triggerPayload);

  // 4. Create run in DB
  const runDoc = await RunRepository.create({
    workflowId: versionDoc.workflowId,
    workflowVersionId: versionDoc.id,
    version: versionDoc.version,
    status: 'running',
    triggerPayload,
  });

  // Create audit event for execution start
  await AuditEventRepository.create({
    actor: 'user',
    action: 'execute',
    entityType: 'run',
    entityId: runDoc.id,
    payload: {
      workflowId: versionDoc.workflowId,
      version: versionDoc.version,
      status: 'running',
    },
  });

  // Initialize execution context and execution tracking structures
  let execCtx = buildContext(triggerPayload);
  const results: Record<string, StepResult> = {};
  
  const nodes = versionDoc.nodes;
  const edges = versionDoc.edges;
  
  // Maps node ID -> adjacency list (outgoing node IDs)
  const adjList = new Map<string, string[]>();
  // Maps node ID -> in-degree (number of incoming edges)
  const inDegree = new Map<string, number>();
  
  for (const node of nodes) {
    adjList.set(node.id, []);
    inDegree.set(node.id, 0);
  }
  
  for (const edge of edges) {
    const source = edge.source;
    const target = edge.target;
    if (adjList.has(source) && adjList.has(target)) {
      adjList.get(source)!.push(target);
      inDegree.set(target, inDegree.get(target)! + 1);
    }
  }

  // Find redirect targets to exclude them from the initial root queue
  const redirectTargets = new Set<string>();
  for (const n of nodes) {
    if (n.failurePolicy?.action === 'redirect' && n.failurePolicy.redirectTargetId) {
      redirectTargets.add(n.failurePolicy.redirectTargetId);
    }
  }

  // Find root nodes (in-degree === 0)
  const queue: string[] = [];
  const resolvedParentsCount = new Map<string, number>();
  const activeIncomingPaths = new Map<string, boolean>();

  for (const node of nodes) {
    resolvedParentsCount.set(node.id, 0);
    activeIncomingPaths.set(node.id, false);
    
    if (inDegree.get(node.id) === 0 && !redirectTargets.has(node.id)) {
      queue.push(node.id);
      activeIncomingPaths.set(node.id, true); // Root nodes are always reachable
    }
  }

  let runStatus: RunStatus = 'success';

  // Execution Loop
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = nodes.find(n => n.id === nodeId)!;
    
    const hasActivePath = activeIncomingPaths.get(nodeId) || false;
    
    if (!hasActivePath) {
      // Step skipped because no incoming paths were active
      const nowStr = new Date().toISOString();
      const stepRes: StepResult = {
        stepId: nodeId,
        status: 'skipped',
        startedAt: nowStr,
        completedAt: nowStr,
        error: 'Step skipped: no active incoming edge path'
      };
      results[nodeId] = stepRes;
      
      // Update run progress in DB
      await RunRepository.update(runDoc.id, { results });
      
      // Process children
      const children = adjList.get(nodeId) || [];
      for (const childId of children) {
        resolvedParentsCount.set(childId, resolvedParentsCount.get(childId)! + 1);
        // Children do not get activated because this node was skipped
        
        if (resolvedParentsCount.get(childId) === inDegree.get(childId)) {
          queue.push(childId);
        }
      }
      continue;
    }

    // Evaluate Pre-condition
    const condResult = evaluateOptional(node.condition, execCtx);
    
    if (!condResult.matched) {
      const nowStr = new Date().toISOString();
      const stepRes: StepResult = {
        stepId: nodeId,
        status: 'skipped',
        startedAt: nowStr,
        completedAt: nowStr,
        error: 'explanation' in condResult ? condResult.explanation : 'Condition failed'
      };
      results[nodeId] = stepRes;
      
      // Update run progress in DB
      await RunRepository.update(runDoc.id, { results });
      
      // Process children
      const children = adjList.get(nodeId) || [];
      for (const childId of children) {
        resolvedParentsCount.set(childId, resolvedParentsCount.get(childId)! + 1);
        
        if (resolvedParentsCount.get(childId) === inDegree.get(childId)) {
          queue.push(childId);
        }
      }
      continue;
    }

    // Resolve dynamic inputs
    let resolvedInputs: Record<string, unknown>;
    try {
      resolvedInputs = resolveInputs(node.inputs, execCtx);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const nowStr = new Date().toISOString();
      const stepRes: StepResult = {
        stepId: nodeId,
        status: 'failed',
        error: `Input resolution failed: ${errMsg}`,
        startedAt: nowStr,
        completedAt: nowStr,
      };
      results[nodeId] = stepRes;
      runStatus = 'failed';
      await RunRepository.update(runDoc.id, { results, status: runStatus, completedAt: nowStr });
      break; // Abort execution
    }

    // Execute via Forms API adapter
    const startedAt = new Date().toISOString();
    const adapterResult = await adapter.function({
      name: node.action,
      inputs: resolvedInputs,
    });
    const completedAt = new Date().toISOString();

    if (adapterResult.success) {
      const stepRes: StepResult = {
        stepId: nodeId,
        status: 'success',
        output: adapterResult.data,
        startedAt,
        completedAt,
      };
      results[nodeId] = stepRes;
      
      // Update execution context with new step results
      execCtx = addStepResult(execCtx, stepRes);
      
      // Persist step result
      await RunRepository.update(runDoc.id, { results });
      
      // Process outgoing edges
      const children = adjList.get(nodeId) || [];
      for (const childId of children) {
        resolvedParentsCount.set(childId, resolvedParentsCount.get(childId)! + 1);
        
        // Find edge configuration
        const edge = edges.find(e => e.source === nodeId && e.target === childId)!;
        const edgeCondResult = evaluateOptional(edge.condition, execCtx);
        
        if (edgeCondResult.matched) {
          activeIncomingPaths.set(childId, true);
        }
        
        if (resolvedParentsCount.get(childId) === inDegree.get(childId)) {
          queue.push(childId);
        }
      }
    } else {
      // Step failed
      const policy = node.failurePolicy?.action || 'abort';

      if (policy === 'skip') {
        const stepRes: StepResult = {
          stepId: nodeId,
          status: 'skipped',
          error: `Step failed (skipped policy): ${adapterResult.message}`,
          startedAt,
          completedAt,
        };
        results[nodeId] = stepRes;

        // Persist step result
        await RunRepository.update(runDoc.id, { results });

        // Process outgoing edges to continue execution (same as success path but without adding to execCtx)
        const children = adjList.get(nodeId) || [];
        for (const childId of children) {
          resolvedParentsCount.set(childId, resolvedParentsCount.get(childId)! + 1);

          // Find edge configuration
          const edge = edges.find(e => e.source === nodeId && e.target === childId)!;
          const edgeCondResult = evaluateOptional(edge.condition, execCtx);

          if (edgeCondResult.matched) {
            activeIncomingPaths.set(childId, true);
          }

          if (resolvedParentsCount.get(childId) === inDegree.get(childId)) {
            queue.push(childId);
          }
        }
      } else if (policy === 'redirect') {
        const stepRes: StepResult = {
          stepId: nodeId,
          status: 'failed',
          error: `Step failed (redirected policy): ${adapterResult.message}`,
          startedAt,
          completedAt,
        };
        results[nodeId] = stepRes;

        const redirectTargetId = node.failurePolicy?.redirectTargetId;
        if (!redirectTargetId || !nodes.some(n => n.id === redirectTargetId)) {
          // Fallback to abort if target is invalid
          runStatus = 'failed';
          await RunRepository.update(runDoc.id, {
            results,
            status: runStatus,
            completedAt,
          });
          break;
        }

        // Clear current execution queue and insert the redirect target
        queue.length = 0;
        activeIncomingPaths.set(redirectTargetId, true);
        queue.push(redirectTargetId);

        // Persist step result and continue execution loop
        await RunRepository.update(runDoc.id, { results });
      } else {
        // default: abort
        const stepRes: StepResult = {
          stepId: nodeId,
          status: 'failed',
          error: `Step failed (abort policy): ${adapterResult.message}`,
          startedAt,
          completedAt,
        };
        results[nodeId] = stepRes;
        runStatus = 'failed';

        await RunRepository.update(runDoc.id, {
          results,
          status: runStatus,
          completedAt,
        });
        break; // Abort execution loop
      }
    }
  }

  // Update final status
  const finalCompletedAt = new Date().toISOString();
  const finalRunDoc = await RunRepository.update(runDoc.id, {
    status: runStatus,
    completedAt: finalCompletedAt,
  });

  // Create audit event for execution end
  await AuditEventRepository.create({
    actor: 'user',
    action: 'execute',
    entityType: 'run',
    entityId: runDoc.id,
    payload: {
      workflowId: versionDoc.workflowId,
      version: versionDoc.version,
      status: runStatus,
    },
  });

  if (!finalRunDoc) {
    throw new Error(`Failed to update final status for run ${runDoc.id}`);
  }

  return finalRunDoc;
}
