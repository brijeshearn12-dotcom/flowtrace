import { describe, it, expect } from 'vitest';
import { 
  WorkflowSchema, 
  ConditionSchema, 
  FailurePolicySchema, 
  WorkflowPatchSchema 
} from '../shared/schemas';

describe('Zod Schema Verification Tests', () => {
  const validWorkflow = {
    id: 'wf_order',
    version: 1,
    status: 'published',
    trigger: {
      id: 'tr_1',
      type: 'manual'
    },
    nodes: [
      {
        id: 'node_1',
        name: 'Step 1',
        type: 'action',
        action: 'Notify',
        inputs: { message: 'hello' }
      }
    ],
    edges: [],
    createdAt: '2026-08-20T11:00:00Z',
    updatedAt: '2026-08-20T11:00:00Z'
  };

  it('1. should pass validation for a valid workflow structure', () => {
    const result = WorkflowSchema.safeParse(validWorkflow);
    expect(result.success).toBe(true);
  });

  it('2. should fail validation for an invalid workflow (missing required fields)', () => {
    const invalidWorkflow = { ...validWorkflow, id: '' }; // empty string violates constraint
    const result = WorkflowSchema.safeParse(invalidWorkflow);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('id');
    }
  });

  it('3. should fail validation for an invalid condition (operator mismatch)', () => {
    const invalidCondition = {
      field: '{{trigger.amount}}',
      operator: 'invalid_op', // invalid operator
      value: 100
    };
    const result = ConditionSchema.safeParse(invalidCondition);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('operator');
      expect(result.error.issues[0].code).toBe('invalid_enum_value');
    }
  });

  it('4. should fail validation for an invalid failure policy (missing redirectTargetId)', () => {
    const invalidPolicy = {
      action: 'redirect',
      // redirectTargetId is missing but required for redirect action
    };
    const result = FailurePolicySchema.safeParse(invalidPolicy);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('redirectTargetId');
    }
  });

  it('5. should fail validation for an invalid patch (missing path/op)', () => {
    const invalidPatch = [
      {
        op: 'invalid_op',
        path: ''
      }
    ];
    const result = WorkflowPatchSchema.safeParse(invalidPatch);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain(0);
    }
  });

  it('6. validation errors should expose the relevant path and issue code', () => {
    const invalidCondition = {
      field: '',
      operator: 'gt',
      value: 10
    };
    const result = ConditionSchema.safeParse(invalidCondition);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue.path).toContain('field');
      expect(issue.code).toBe('too_small'); // Zod min(1) constraint code
    }
  });
});
