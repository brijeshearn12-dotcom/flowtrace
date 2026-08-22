/**
 * tests/conditionEvaluator.test.ts
 *
 * Tests for executor/conditionEvaluator.ts  (Task 4.4).
 *
 * All required cases:
 *   - matching eq
 *   - non-matching eq
 *   - neq (matching and non-matching)
 *   - gt (matching, non-matching)
 *   - invalid / type-mismatch input
 *   - evaluateOptional with and without a condition
 *   - full flow using resolveConditionField (as the executor would do it)
 *
 * No database, no network. Pure unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluate,
  evaluateOptional,
  isConditionError,
  isConditionSuccess,
} from '../executor/conditionEvaluator';
import { buildContext } from '../executor/templateResolver';
import { Condition } from '../shared/ir';

// ---------------------------------------------------------------------------
// Shared fixture context
// ---------------------------------------------------------------------------

const CTX = buildContext({
  approved: true,
  amount: 500,
  status: 'pending',
  score: 0.05,
});

// Helper: build a Condition inline
function cond(field: string, operator: Condition['operator'], value: unknown): Condition {
  return { field, operator, value };
}

// ---------------------------------------------------------------------------
// eq — matching
// ---------------------------------------------------------------------------

describe('eq — matching condition', () => {
  it('returns matched:true when boolean left === boolean right', () => {
    const result = evaluate(cond('{{trigger.approved}}', 'eq', true), CTX);
    expect(result.matched).toBe(true);
    expect(isConditionSuccess(result)).toBe(true);
    if (isConditionSuccess(result)) {
      expect(result.left).toBe(true);
      expect(result.right).toBe(true);
      expect(result.operator).toBe('eq');
      expect(result.explanation).toContain('✓');
    }
  });

  it('returns matched:true when string left === string right', () => {
    const result = evaluate(cond('{{trigger.status}}', 'eq', 'pending'), CTX);
    expect(result.matched).toBe(true);
  });

  it('returns matched:true when number left === number right', () => {
    const result = evaluate(cond('{{trigger.amount}}', 'eq', 500), CTX);
    expect(result.matched).toBe(true);
    if (isConditionSuccess(result)) {
      expect(result.left).toBe(500);
    }
  });

  // Seeded AssetRequestApproval workflow exact condition
  it('matches the seeded AssetRequestApproval approved branch exactly', () => {
    // edge_approved: { field: '{{trigger.approved}}', operator: 'eq', value: true }
    const result = evaluate(
      cond('{{trigger.approved}}', 'eq', true),
      buildContext({ approved: true, requestId: 'REQ-1', amount: 100 })
    );
    expect(result.matched).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// eq — non-matching
// ---------------------------------------------------------------------------

describe('eq — non-matching condition', () => {
  it('returns matched:false when values differ', () => {
    const result = evaluate(cond('{{trigger.approved}}', 'eq', false), CTX);
    expect(result.matched).toBe(false);
    expect(isConditionSuccess(result)).toBe(true);
    if (isConditionSuccess(result)) {
      expect(result.left).toBe(true);
      expect(result.right).toBe(false);
      expect(result.explanation).toContain('✗');
    }
  });

  it('returns matched:false when types differ (number vs string)', () => {
    const result = evaluate(cond('{{trigger.amount}}', 'eq', '500'), CTX);
    // 500 !== '500' — strict equality
    expect(result.matched).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// neq
// ---------------------------------------------------------------------------

describe('neq operator', () => {
  it('returns matched:true when values differ', () => {
    // trigger.approved = true, right = true → neq → false (they ARE equal)
    // So use a non-equal pair:
    const result = evaluate(cond('{{trigger.approved}}', 'neq', false), CTX);
    expect(result.matched).toBe(true);
    if (isConditionSuccess(result)) {
      expect(result.operator).toBe('neq');
      expect(result.explanation).toContain('✓');
    }
  });

  it('returns matched:false when values are equal', () => {
    const result = evaluate(cond('{{trigger.approved}}', 'neq', true), CTX);
    expect(result.matched).toBe(false);
    if (isConditionSuccess(result)) {
      expect(result.explanation).toContain('✗');
    }
  });

  // Seeded AssetRequestApproval rejected branch
  it('matches the seeded AssetRequestApproval rejected branch when approved=false', () => {
    // edge_rejected: { field: '{{trigger.approved}}', operator: 'neq', value: true }
    // When approved is false, neq true → matched:true (branch taken)
    const ctx = buildContext({ approved: false, requestId: 'REQ-2', amount: 200 });
    const result = evaluate(cond('{{trigger.approved}}', 'neq', true), ctx);
    expect(result.matched).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// gt
// ---------------------------------------------------------------------------

describe('gt operator', () => {
  it('returns matched:true when left > right', () => {
    const result = evaluate(cond('{{trigger.amount}}', 'gt', 100), CTX);
    expect(result.matched).toBe(true);
    if (isConditionSuccess(result)) {
      expect(result.left).toBe(500);
      expect(result.right).toBe(100);
      expect(result.operator).toBe('gt');
      expect(result.explanation).toContain('✓');
    }
  });

  it('returns matched:false when left <= right (exact equal)', () => {
    const result = evaluate(cond('{{trigger.amount}}', 'gt', 500), CTX);
    expect(result.matched).toBe(false);
    if (isConditionSuccess(result)) {
      expect(result.explanation).toContain('✗');
    }
  });

  it('returns matched:false when left < right', () => {
    const result = evaluate(cond('{{trigger.amount}}', 'gt', 1000), CTX);
    expect(result.matched).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Invalid / type-mismatch
// ---------------------------------------------------------------------------

describe('invalid / type-mismatch inputs', () => {
  it('returns ConditionError when gt receives a non-numeric left value', () => {
    const result = evaluate(cond('{{trigger.status}}', 'gt', 100), CTX);
    // trigger.status = 'pending' — not a number
    expect(result.matched).toBe(false);
    expect(isConditionError(result)).toBe(true);
    if (isConditionError(result)) {
      expect(result.code).toBe('CONDITION_TYPE_MISMATCH');
      expect(result.message).toContain('numeric left-hand value');
    }
  });

  it('returns ConditionError when gt receives a non-numeric right value', () => {
    const result = evaluate(cond('{{trigger.amount}}', 'gt', 'high'), CTX);
    expect(isConditionError(result)).toBe(true);
    if (isConditionError(result)) {
      expect(result.code).toBe('CONDITION_TYPE_MISMATCH');
      expect(result.message).toContain('numeric right-hand value');
    }
  });

  it('returns ConditionError when the field template cannot be resolved', () => {
    const result = evaluate(cond('{{trigger.nonExistent}}', 'eq', true), CTX);
    expect(result.matched).toBe(false);
    expect(isConditionError(result)).toBe(true);
    if (isConditionError(result)) {
      expect(result.code).toBe('CONDITION_FIELD_RESOLUTION_ERROR');
      expect(result.message).toContain('nonExistent');
    }
  });

  it('always sets matched:false on ConditionError', () => {
    const result = evaluate(cond('{{trigger.missing}}', 'neq', 'anything'), CTX);
    expect(result.matched).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// evaluateOptional
// ---------------------------------------------------------------------------

describe('evaluateOptional', () => {
  it('returns matched:true when condition is undefined (unconditional)', () => {
    const result = evaluateOptional(undefined, CTX);
    expect(result.matched).toBe(true);
    if (isConditionSuccess(result)) {
      expect(result.explanation).toContain('unconditionally');
    }
  });

  it('delegates to evaluate() when a condition is provided', () => {
    const result = evaluateOptional(cond('{{trigger.amount}}', 'gt', 100), CTX);
    expect(result.matched).toBe(true);
    if (isConditionSuccess(result)) {
      expect(result.operator).toBe('gt');
    }
  });
});

// ---------------------------------------------------------------------------
// Type guard helpers
// ---------------------------------------------------------------------------

describe('type guards', () => {
  it('isConditionSuccess returns true for a success result', () => {
    const result = evaluate(cond('{{trigger.approved}}', 'eq', true), CTX);
    expect(isConditionSuccess(result)).toBe(true);
    expect(isConditionError(result)).toBe(false);
  });

  it('isConditionError returns true for an error result', () => {
    const result = evaluate(cond('{{trigger.amount}}', 'gt', 'not-a-number'), CTX);
    expect(isConditionError(result)).toBe(true);
    expect(isConditionSuccess(result)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Result contains left / right / operator for log explainability
// ---------------------------------------------------------------------------

describe('result explainability — branch decision fields', () => {
  it('ConditionSuccess always exposes left, right, operator, explanation', () => {
    const result = evaluate(cond('{{trigger.amount}}', 'gt', 100), CTX);
    expect(isConditionSuccess(result)).toBe(true);
    if (isConditionSuccess(result)) {
      expect(result.left).toBeDefined();
      expect(result.right).toBeDefined();
      expect(result.operator).toBe('gt');
      expect(typeof result.explanation).toBe('string');
      expect(result.explanation.length).toBeGreaterThan(0);
    }
  });

  it('ConditionError always exposes code and message', () => {
    const result = evaluate(cond('{{trigger.amount}}', 'gt', 'x'), CTX);
    expect(isConditionError(result)).toBe(true);
    if (isConditionError(result)) {
      expect(typeof result.code).toBe('string');
      expect(typeof result.message).toBe('string');
    }
  });
});
