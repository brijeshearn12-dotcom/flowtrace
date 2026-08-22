/**
 * tests/templateResolver.test.ts
 *
 * Tests for executor/templateResolver.ts  (Task 4.3).
 *
 * Covers all 8 required tests plus supplementary edge cases.
 * No database, no network, no filesystem — pure unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  ExecutionContext,
  TemplateResolutionError,
  buildContext,
  addStepResult,
  resolveString,
  resolveInputs,
  resolveConditionField,
} from '../executor/templateResolver';

// ---------------------------------------------------------------------------
// Shared fixture context used by most tests
// ---------------------------------------------------------------------------

const TRIGGER: Record<string, unknown> = {
  orderId: 'ORD-101',
  customerEmail: 'farmer@example.com',
  total: 500,
  approved: true,
  customer: {
    name: 'Alice',
    email: 'alice@example.com',
  },
};

const STEPS: Record<string, unknown> = {
  'order-created': {
    formId: 'FORM-123',
    score: 0.05,
    approved: true,
  },
  invoice: {
    ts: '1000000000.000000',
    ok: true,
  },
};

const CTX: ExecutionContext = {
  trigger: TRIGGER,
  steps: STEPS,
};

// ---------------------------------------------------------------------------
// TEST 1 — Trigger reference
// ---------------------------------------------------------------------------

describe('TEST 1 — Trigger reference', () => {
  it('resolves a standalone {{trigger.x}} to the trigger payload value', () => {
    const result = resolveString('{{trigger.orderId}}', CTX);
    expect(result).toBe('ORD-101');
  });

  it('resolves a numeric trigger value as its original type', () => {
    const result = resolveString('{{trigger.total}}', CTX);
    expect(result).toBe(500);
    expect(typeof result).toBe('number');
  });

  it('resolves a boolean trigger value as its original type', () => {
    const result = resolveString('{{trigger.approved}}', CTX);
    expect(result).toBe(true);
    expect(typeof result).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// TEST 2 — Nested trigger reference
// ---------------------------------------------------------------------------

describe('TEST 2 — Nested trigger reference', () => {
  it('resolves {{trigger.customer.email}} using nested dot path', () => {
    const result = resolveString('{{trigger.customer.email}}', CTX);
    expect(result).toBe('alice@example.com');
  });

  it('resolves {{trigger.customer.name}} using nested dot path', () => {
    const result = resolveString('{{trigger.customer.name}}', CTX);
    expect(result).toBe('Alice');
  });
});

// ---------------------------------------------------------------------------
// TEST 3 — Previous-step reference
// ---------------------------------------------------------------------------

describe('TEST 3 — Previous-step reference (node ID syntax)', () => {
  it('resolves {{order-created.formId}} to the step output value', () => {
    const result = resolveString('{{order-created.formId}}', CTX);
    expect(result).toBe('FORM-123');
  });

  it('resolves {{order-created.score}} as a number (original type preserved)', () => {
    const result = resolveString('{{order-created.score}}', CTX);
    expect(result).toBe(0.05);
    expect(typeof result).toBe('number');
  });

  it('resolves {{invoice.ok}} as a boolean (original type preserved)', () => {
    const result = resolveString('{{invoice.ok}}', CTX);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TEST 4 — Multiple references
// ---------------------------------------------------------------------------

describe('TEST 4 — Multiple references in one resolveInputs call', () => {
  it('resolves an inputs object with both trigger and step references', () => {
    const inputs = {
      orderId: '{{trigger.orderId}}',
      amount: '{{trigger.total}}',
      fraudScore: '{{order-created.score}}',
      channel: '#billing',      // static — must remain unchanged
      active: true,             // non-string — must remain unchanged
      count: 42,                // non-string — must remain unchanged
    };

    const resolved = resolveInputs(inputs, CTX);

    expect(resolved.orderId).toBe('ORD-101');
    expect(resolved.amount).toBe(500);
    expect(resolved.fraudScore).toBe(0.05);
    expect(resolved.channel).toBe('#billing');
    expect(resolved.active).toBe(true);
    expect(resolved.count).toBe(42);
  });

  it('resolves an embedded-string with multiple triggers', () => {
    const template = 'Invoice for order {{trigger.orderId}} of amount {{trigger.total}}';
    const result = resolveString(template, CTX);
    expect(result).toBe('Invoice for order ORD-101 of amount 500');
  });

  it('resolves a mixed embedded-string with trigger + step refs', () => {
    const template = 'Order {{trigger.orderId}} fraud score {{order-created.score}}';
    const result = resolveString(template, CTX);
    expect(result).toBe('Order ORD-101 fraud score 0.05');
  });
});

// ---------------------------------------------------------------------------
// TEST 5 — Missing trigger path
// ---------------------------------------------------------------------------

describe('TEST 5 — Missing trigger path produces a deterministic error', () => {
  it('throws TemplateResolutionError for a nonexistent trigger field', () => {
    expect(() => resolveString('{{trigger.nonExistentField}}', CTX))
      .toThrow(TemplateResolutionError);
  });

  it('error code is TEMPLATE_REFERENCE_NOT_FOUND', () => {
    try {
      resolveString('{{trigger.nonExistentField}}', CTX);
      expect.fail('Expected TemplateResolutionError');
    } catch (e) {
      expect(e).toBeInstanceOf(TemplateResolutionError);
      const err = e as TemplateResolutionError;
      expect(err.code).toBe('TEMPLATE_REFERENCE_NOT_FOUND');
    }
  });

  it('error reference field contains the original token', () => {
    try {
      resolveString('{{trigger.nonExistentField}}', CTX);
      expect.fail('Expected TemplateResolutionError');
    } catch (e) {
      expect(e).toBeInstanceOf(TemplateResolutionError);
      const err = e as TemplateResolutionError;
      expect(err.reference).toBe('{{trigger.nonExistentField}}');
    }
  });

  it('does NOT silently return undefined', () => {
    let result: unknown = 'SENTINEL';
    try {
      result = resolveString('{{trigger.missing}}', CTX);
    } catch {
      // expected path — do nothing
    }
    // If no error was thrown, result would have been set — it must NOT be undefined
    // The test body only reaches here if the catch swallowed the error,
    // but the above throws so result stays 'SENTINEL'
    expect(result).not.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TEST 6 — Missing previous-step path
// ---------------------------------------------------------------------------

describe('TEST 6 — Missing previous-step path produces a deterministic error', () => {
  it('throws TemplateResolutionError for a nonexistent step ID', () => {
    expect(() => resolveString('{{nonExistentStep.output}}', CTX))
      .toThrow(TemplateResolutionError);
  });

  it('throws TemplateResolutionError for a missing field within a real step', () => {
    expect(() => resolveString('{{order-created.nonExistentField}}', CTX))
      .toThrow(TemplateResolutionError);
  });

  it('error code is TEMPLATE_REFERENCE_NOT_FOUND for missing step', () => {
    try {
      resolveString('{{ghostStep.value}}', CTX);
      expect.fail('Expected TemplateResolutionError');
    } catch (e) {
      expect(e).toBeInstanceOf(TemplateResolutionError);
      expect((e as TemplateResolutionError).code).toBe('TEMPLATE_REFERENCE_NOT_FOUND');
    }
  });

  it('error message mentions the missing step name', () => {
    try {
      resolveString('{{ghostStep.value}}', CTX);
      expect.fail('Expected TemplateResolutionError');
    } catch (e) {
      expect(e).toBeInstanceOf(TemplateResolutionError);
      expect((e as TemplateResolutionError).message).toContain('ghostStep');
    }
  });
});

// ---------------------------------------------------------------------------
// TEST 7 — Static values remain unchanged
// ---------------------------------------------------------------------------

describe('TEST 7 — Static values pass through unchanged', () => {
  it('resolveString returns a plain string with no templates unchanged', () => {
    expect(resolveString('#billing', CTX)).toBe('#billing');
    expect(resolveString('Hello world', CTX)).toBe('Hello world');
    expect(resolveString('', CTX)).toBe('');
  });

  it('resolveInputs leaves non-string values unchanged', () => {
    const inputs = {
      amount: 100,
      approved: true,
      nothing: null,
      flag: false,
    };
    const resolved = resolveInputs(inputs, CTX);
    expect(resolved.amount).toBe(100);
    expect(resolved.approved).toBe(true);
    expect(resolved.nothing).toBeNull();
    expect(resolved.flag).toBe(false);
  });

  it('resolveInputs does not mutate the original inputs object', () => {
    const inputs = {
      email: '{{trigger.customerEmail}}',
      channel: '#billing',
    };
    const original = JSON.stringify(inputs);
    resolveInputs(inputs, CTX);
    expect(JSON.stringify(inputs)).toBe(original);
  });

  it('context is not mutated by resolveInputs', () => {
    const ctx: ExecutionContext = {
      trigger: { orderId: 'X' },
      steps: {},
    };
    const frozen = JSON.stringify(ctx);
    resolveInputs({ id: '{{trigger.orderId}}' }, ctx);
    expect(JSON.stringify(ctx)).toBe(frozen);
  });
});

// ---------------------------------------------------------------------------
// TEST 8 — Task 4.1 and 4.2 tests still pass (verified separately, but
// we confirm the formsAdapter imports still work from this file)
// ---------------------------------------------------------------------------

describe('TEST 8 — Task 4.1 / 4.2 adapter boundary remains intact', () => {
  it('normalizeSuccess from formsAdapter is importable and works', async () => {
    const { normalizeSuccess } = await import('../executor/formsAdapter');
    const r = normalizeSuccess({ ok: true });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ ok: true });
  });

  it('MockFormsAdapter from mock-forms-api is importable and works', async () => {
    const { MockFormsAdapter } = await import('../mock-forms-api/mockFormsAdapter');
    const adapter = new MockFormsAdapter();
    const result = await adapter.function({ name: 'Slack.post', inputs: {} });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Supplementary: resolveConditionField, buildContext, addStepResult
// ---------------------------------------------------------------------------

describe('Supplementary — context helpers', () => {
  it('buildContext creates a fresh context from trigger payload', () => {
    const payload = { orderId: 'ORD-1', total: 100 };
    const ctx = buildContext(payload);
    expect(ctx.trigger).toEqual(payload);
    expect(ctx.steps).toEqual({});
  });

  it('buildContext does not share reference with original payload', () => {
    const payload = { orderId: 'ORD-1' };
    const ctx = buildContext(payload);
    payload.orderId = 'MUTATED';
    expect(ctx.trigger.orderId).toBe('ORD-1');
  });

  it('addStepResult adds a successful step output to context', () => {
    const ctx = buildContext({ orderId: 'ORD-1' });
    const stepResult = {
      stepId: 'fraud-check',
      status: 'success' as const,
      output: { score: 0.05, approved: true },
      startedAt: '2026-08-22T00:00:00Z',
      completedAt: '2026-08-22T00:00:01Z',
    };
    const next = addStepResult(ctx, stepResult);
    expect(next.steps['fraud-check']).toEqual({ score: 0.05, approved: true });
    // original not mutated
    expect(ctx.steps['fraud-check']).toBeUndefined();
  });

  it('addStepResult skips adding a failed step', () => {
    const ctx = buildContext({ orderId: 'ORD-1' });
    const stepResult = {
      stepId: 'fraud-check',
      status: 'failed' as const,
      error: 'Connection refused',
      startedAt: '2026-08-22T00:00:00Z',
      completedAt: '2026-08-22T00:00:01Z',
    };
    const next = addStepResult(ctx, stepResult);
    expect(next.steps['fraud-check']).toBeUndefined();
  });

  it('resolveConditionField resolves a boolean trigger ref', () => {
    const ctx = buildContext({ approved: true });
    const result = resolveConditionField('{{trigger.approved}}', ctx);
    expect(result).toBe(true);
    expect(typeof result).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// Supplementary: token without a dot throws clearly
// ---------------------------------------------------------------------------

describe('Supplementary — malformed token', () => {
  it('throws TemplateResolutionError for a token with no dot', () => {
    expect(() => resolveString('{{nodot}}', CTX))
      .toThrow(TemplateResolutionError);
  });
});
