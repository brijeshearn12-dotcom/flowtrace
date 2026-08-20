import { Workflow } from './ir';
import { WorkflowSchema } from './schemas';

export interface ValidationError {
  path: string;
  message: string;
  code?: string;
}

export interface ValidationResult {
  success: boolean;
  errors: ValidationError[];
}

/**
 * Validates a workflow against schema constraints and graph invariants.
 */
export function validateWorkflow(workflow: Workflow): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. Zod Schema validation
  const schemaResult = WorkflowSchema.safeParse(workflow);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      errors.push({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code
      });
    }
    return { success: false, errors };
  }

  const nodes = workflow.nodes;
  const edges = workflow.edges;

  // 2. Duplicate Node IDs
  const nodeIds = new Set<string>();
  for (let i = 0; i < nodes.length; i++) {
    const id = nodes[i].id;
    if (nodeIds.has(id)) {
      errors.push({
        path: `nodes.${i}.id`,
        message: `Duplicate node ID detected: "${id}"`,
        code: 'duplicate_node_id'
      });
    }
    nodeIds.add(id);
  }

  // 3. Duplicate Edge IDs
  const edgeIds = new Set<string>();
  for (let i = 0; i < edges.length; i++) {
    const id = edges[i].id;
    if (edgeIds.has(id)) {
      errors.push({
        path: `edges.${i}.id`,
        message: `Duplicate edge ID detected: "${id}"`,
        code: 'duplicate_edge_id'
      });
    }
    edgeIds.add(id);
  }

  // 4. Edge connection reference checks and self-loops
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!nodeIds.has(edge.source)) {
      errors.push({
        path: `edges.${i}.source`,
        message: `Edge source references non-existent node: "${edge.source}"`,
        code: 'missing_node_reference'
      });
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({
        path: `edges.${i}.target`,
        message: `Edge target references non-existent node: "${edge.target}"`,
        code: 'missing_node_reference'
      });
    }
    if (edge.source === edge.target) {
      errors.push({
        path: `edges.${i}`,
        message: `Self-loop detected on node: "${edge.source}"`,
        code: 'self_loop'
      });
    }
  }

  // If there are dangling node/edge reference errors, stop cycle/ancestor checks to prevent infinite loops or crashes
  if (errors.some(e => e.code === 'missing_node_reference')) {
    return { success: false, errors };
  }

  // 5. Cycle Detection (DAG verification)
  // Build adjacency list
  const adj = new Map<string, string[]>();
  for (const nodeId of nodeIds) {
    adj.set(nodeId, []);
  }
  for (const edge of edges) {
    adj.get(edge.source)!.push(edge.target);
  }

  const visited = new Map<string, 'unvisited' | 'visiting' | 'visited'>();
  for (const nodeId of nodeIds) {
    visited.set(nodeId, 'unvisited');
  }

  let hasCycle = false;
  const cycleNodes: string[] = [];

  function dfs(u: string): boolean {
    visited.set(u, 'visiting');
    cycleNodes.push(u);

    for (const v of adj.get(u) || []) {
      if (visited.get(v) === 'visiting') {
        hasCycle = true;
        return true;
      }
      if (visited.get(v) === 'unvisited') {
        if (dfs(v)) return true;
      }
    }

    visited.set(u, 'visited');
    cycleNodes.pop();
    return false;
  }

  for (const nodeId of nodeIds) {
    if (visited.get(nodeId) === 'unvisited') {
      if (dfs(nodeId)) break;
    }
  }

  if (hasCycle) {
    errors.push({
      path: 'edges',
      message: `Cycle detected in graph. Workflow must be a Directed Acyclic Graph (DAG).`,
      code: 'cycle_detected'
    });
  }

  // 6. Redirect Target Checks in Failure Policies
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.failurePolicy?.action === 'redirect') {
      const target = node.failurePolicy.redirectTargetId;
      if (!target || !nodeIds.has(target)) {
        errors.push({
          path: `nodes.${i}.failurePolicy.redirectTargetId`,
          message: `Redirect target ID "${target}" does not exist in nodes`,
          code: 'invalid_redirect_target'
        });
      }
    }
  }

  // 7. Topological Ancestor & Trigger reference syntax validation
  const refRegex = /\{\{([^}]+)\}\}/g;

  // Build reachability map: reach[u][v] = true if there is a path from u to v
  const reach = new Map<string, Set<string>>();
  for (const nodeId of nodeIds) {
    reach.set(nodeId, new Set<string>());
  }

  // Warshall's algorithm or simple DFS to find ancestors for reachability
  function getAncestors(targetNode: string): Set<string> {
    const ancestors = new Set<string>();
    const queue = [targetNode];
    const seen = new Set<string>([targetNode]);

    // Go backwards along edges to find all nodes that can reach targetNode
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const edge of edges) {
        if (edge.target === curr && !seen.has(edge.source)) {
          seen.add(edge.source);
          ancestors.add(edge.source);
          queue.push(edge.source);
        }
      }
    }
    return ancestors;
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const ancestors = getAncestors(node.id);

    // Helper to validate a reference string
    const validateRefs = (val: string, path: string) => {
      let match;
      while ((match = refRegex.exec(val)) !== null) {
        const parts = match[1].trim().split('.');
        const sourceNamespace = parts[0];

        if (sourceNamespace === 'trigger') {
          // Trigger references are always allowed
          continue;
        }

        // Must refer to another node
        if (!nodeIds.has(sourceNamespace)) {
          errors.push({
            path,
            message: `Reference "${match[0]}" refers to a non-existent step: "${sourceNamespace}"`,
            code: 'invalid_step_reference'
          });
        } else if (!ancestors.has(sourceNamespace)) {
          errors.push({
            path,
            message: `Reference "${match[0]}" in node "${node.id}" references step "${sourceNamespace}" which is not an ancestor.`,
            code: 'non_ancestor_reference'
          });
        }
      }
    };

    // Check inputs
    for (const [key, value] of Object.entries(node.inputs)) {
      if (typeof value === 'string') {
        validateRefs(value, `nodes.${i}.inputs.${key}`);
      }
    }

    // Check condition fields
    if (node.condition?.field) {
      validateRefs(node.condition.field, `nodes.${i}.condition.field`);
    }
  }

  return {
    success: errors.length === 0,
    errors
  };
}
