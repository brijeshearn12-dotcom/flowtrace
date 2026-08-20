import { describe, it, expect } from 'vitest';
import { validateWorkflow } from '../shared/validator';
import { Workflow } from '../shared/ir';

describe('Graph Invariant Validation Tests', () => {
  const getBaseWorkflow = (): Workflow => ({
    id: 'wf_test',
    version: 1,
    status: 'draft',
    trigger: { id: 'tr_1', type: 'manual' },
    nodes: [
      {
        id: 'node_a',
        name: 'Step A',
        type: 'action',
        action: 'Service.A',
        inputs: {}
      },
      {
        id: 'node_b',
        name: 'Step B',
        type: 'action',
        action: 'Service.B',
        inputs: { ref: '{{node_a.output}}' }
      }
    ],
    edges: [
      { id: 'edge_ab', source: 'node_a', target: 'node_b' }
    ],
    createdAt: '2026-08-20T11:00:00Z',
    updatedAt: '2026-08-20T11:00:00Z'
  });

  it('1. should approve a valid workflow structure', () => {
    const wf = getBaseWorkflow();
    const result = validateWorkflow(wf);
    expect(result.success).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('2. should reject duplicate Node IDs', () => {
    const wf = getBaseWorkflow();
    wf.nodes.push({
      id: 'node_a', // Duplicate
      name: 'Step A Duplicate',
      type: 'action',
      action: 'Service.A',
      inputs: {}
    });
    const result = validateWorkflow(wf);
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('duplicate_node_id');
  });

  it('3. should reject duplicate Edge IDs', () => {
    const wf = getBaseWorkflow();
    wf.edges.push({
      id: 'edge_ab', // Duplicate
      source: 'node_a',
      target: 'node_b'
    });
    const result = validateWorkflow(wf);
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('duplicate_edge_id');
  });

  it('4. should reject edges pointing to non-existent nodes', () => {
    const wf = getBaseWorkflow();
    wf.edges.push({
      id: 'edge_ac',
      source: 'node_a',
      target: 'node_non_existent' // Missing node
    });
    const result = validateWorkflow(wf);
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('missing_node_reference');
  });

  it('5. should reject self-loops', () => {
    const wf = getBaseWorkflow();
    wf.edges.push({
      id: 'edge_self',
      source: 'node_a',
      target: 'node_a' // Self-loop
    });
    const result = validateWorkflow(wf);
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('self_loop');
  });

  it('6. should reject cyclic graphs (simple cycle A -> B -> A)', () => {
    const wf = getBaseWorkflow();
    wf.edges.push({
      id: 'edge_ba',
      source: 'node_b',
      target: 'node_a' // Forms cycle
    });
    const result = validateWorkflow(wf);
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('cycle_detected');
  });

  it('7. should reject invalid redirect target IDs', () => {
    const wf = getBaseWorkflow();
    wf.nodes[0].failurePolicy = {
      action: 'redirect',
      redirectTargetId: 'node_non_existent' // Invalid target
    };
    const result = validateWorkflow(wf);
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('invalid_redirect_target');
  });

  it('8. should reject references to non-ancestor steps', () => {
    const wf = getBaseWorkflow();
    // Step A tries to reference step B, but B executes after A (not an ancestor)
    wf.nodes[0].inputs = {
      badRef: '{{node_b.output}}'
    };
    const result = validateWorkflow(wf);
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('non_ancestor_reference');
  });

  it('9. should reject step references to non-existent steps', () => {
    const wf = getBaseWorkflow();
    wf.nodes[0].inputs = {
      badRef: '{{node_missing.output}}'
    };
    const result = validateWorkflow(wf);
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('invalid_step_reference');
  });

  it('10. should allow trigger references from anywhere', () => {
    const wf = getBaseWorkflow();
    wf.nodes[0].inputs = {
      validTriggerRef: '{{trigger.payload.orderId}}'
    };
    const result = validateWorkflow(wf);
    expect(result.success).toBe(true);
  });
});
