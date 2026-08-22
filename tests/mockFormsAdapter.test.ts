/**
 * tests/mockFormsAdapter.test.ts
 *
 * Tests for the local mock Forms API adapter (Task 4.2).
 *
 * Verifies:
 *   TEST 1 — Same input → same output (determinism)
 *   TEST 2 — Normal operation succeeds when failure mode is disabled
 *   TEST 3 — Configured operation fails when failure mode is enabled
 *   TEST 4 — Failure result uses the normalized adapter error format
 *   TEST 5 — Mock connects through the IFormsAdapter interface (injection)
 *   TEST 6 — Existing Task 4.1 adapter interface tests still pass
 *             (confirmed by also running the full adapter describe block here)
 *
 * No database, no network. Pure in-process tests.
 */

import { describe, it, expect } from 'vitest';
import { MockFormsAdapter } from '../mock-forms-api/mockFormsAdapter';
import {
  IFormsAdapter,
  normalizeSuccess,
  normalizeError,
} from '../executor/formsAdapter';

// ---------------------------------------------------------------------------
// Helper: call through the interface type only (simulates executor usage)
// ---------------------------------------------------------------------------

async function runFunction(
  adapter: IFormsAdapter,
  name: string,
  inputs: Record<string, unknown>
) {
  return adapter.function({ name, inputs });
}

// ---------------------------------------------------------------------------
// TEST SUITE
// ---------------------------------------------------------------------------

describe('MockFormsAdapter — local mock Forms API', () => {

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1 — Same input produces the same output (determinism)
  // ──────────────────────────────────────────────────────────────────────────
  it('1. should return identical output for identical input (determinism)', async () => {
    const adapter = new MockFormsAdapter();

    const input = { orderId: 'ord-abc', amount: 250 };

    const result1 = await adapter.function({ name: 'FraudService.check', inputs: input });
    const result2 = await adapter.function({ name: 'FraudService.check', inputs: input });

    expect(result1).toEqual(result2);
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2 — Normal operations succeed when failure mode is disabled
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Normal success mode (no failOn configured)', () => {
    it('FraudService.check succeeds with expected shape', async () => {
      const adapter = new MockFormsAdapter();
      const result = await adapter.function({
        name: 'FraudService.check',
        inputs: { orderId: 'ord-1', amount: 100 },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as Record<string, unknown>;
        expect(typeof data.score).toBe('number');
        expect(data.approved).toBe(true);
      }
    });

    it('Slack.post succeeds with expected shape', async () => {
      const adapter = new MockFormsAdapter();
      const result = await adapter.function({
        name: 'Slack.post',
        inputs: { channel: '#billing', message: 'Invoice for ord-1' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as Record<string, unknown>;
        expect(data.ok).toBe(true);
      }
    });

    it('EmailService.send succeeds with expected shape', async () => {
      const adapter = new MockFormsAdapter();
      const result = await adapter.function({
        name: 'EmailService.send',
        inputs: { recipient: 'user@example.com', subject: 'Confirmed', body: 'Thank you!' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as Record<string, unknown>;
        expect(data.accepted).toBe(true);
      }
    });

    it('unknown function name falls through to default success', async () => {
      const adapter = new MockFormsAdapter();
      const result = await adapter.function({
        name: 'SomeOther.action',
        inputs: {},
      });
      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as Record<string, unknown>;
        expect(data.ok).toBe(true);
      }
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3 — Configured operation fails when failure mode is enabled
  // ──────────────────────────────────────────────────────────────────────────
  it('3. should fail the configured operation when failOn is set', async () => {
    const adapter = new MockFormsAdapter({ failOn: 'FraudService.check' });

    const result = await adapter.function({
      name: 'FraudService.check',
      inputs: { orderId: 'ord-1', amount: 100 },
    });

    expect(result.success).toBe(false);
  });

  it('3b. other operations still succeed when failOn targets a different function', async () => {
    const adapter = new MockFormsAdapter({ failOn: 'FraudService.check' });

    const slackResult = await adapter.function({
      name: 'Slack.post',
      inputs: { channel: '#billing', message: 'test' },
    });
    expect(slackResult.success).toBe(true);

    const emailResult = await adapter.function({
      name: 'EmailService.send',
      inputs: { recipient: 'a@b.com', subject: 'x', body: 'y' },
    });
    expect(emailResult.success).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4 — Failure result uses the normalized AdapterError format
  // ──────────────────────────────────────────────────────────────────────────
  it('4. should return a normalized AdapterError when failure mode is active', async () => {
    const adapter = new MockFormsAdapter({ failOn: 'Slack.post' });

    const result = await adapter.function({
      name: 'Slack.post',
      inputs: { channel: '#billing', message: 'Invoice for ord-1' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      // Must have the required AdapterError fields
      expect(typeof result.code).toBe('string');
      expect(result.code.length).toBeGreaterThan(0);
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
      // code must be the mock failure sentinel
      expect(result.code).toBe('MOCK_FAILURE');
      // message must mention the function name
      expect(result.message).toContain('Slack.post');
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5 — Mock can be connected through the IFormsAdapter interface
  // ──────────────────────────────────────────────────────────────────────────
  it('5. should satisfy IFormsAdapter and be usable through the interface only', async () => {
    // Typed as IFormsAdapter — the executor only ever sees this type
    const adapter: IFormsAdapter = new MockFormsAdapter();

    const result = await runFunction(adapter, 'FraudService.check', {
      orderId: 'ord-42',
      amount: 500,
    });

    expect(result.success).toBe(true);
  });

  it('5b. all five interface methods are present and callable', async () => {
    const adapter: IFormsAdapter = new MockFormsAdapter();

    expect(typeof adapter.function).toBe('function');
    expect(typeof adapter.operation).toBe('function');
    expect(typeof adapter.formCreate).toBe('function');
    expect(typeof adapter.formUpdate).toBe('function');
    expect(typeof adapter.formDelete).toBe('function');

    // Verify each method actually returns an AdapterResult
    const fnResult = await adapter.function({ name: 'Slack.post', inputs: {} });
    expect(typeof fnResult.success).toBe('boolean');

    const opResult = await adapter.operation({ name: 'eq', inputs: { left: 1, right: 1 } });
    expect(typeof opResult.success).toBe('boolean');

    const createResult = await adapter.formCreate({ formId: 'order_form', payload: {} });
    expect(typeof createResult.success).toBe('boolean');

    const updateResult = await adapter.formUpdate({ formId: 'order_form', recordId: 'rec-1', payload: {} });
    expect(typeof updateResult.success).toBe('boolean');

    const deleteResult = await adapter.formDelete({ formId: 'order_form', recordId: 'rec-1' });
    expect(typeof deleteResult.success).toBe('boolean');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6 — Verify normalizeSuccess / normalizeError still behave correctly
  // (confirms Task 4.1 adapter boundary is intact)
  // ──────────────────────────────────────────────────────────────────────────
  describe('6. Task 4.1 adapter boundary remains intact', () => {
    it('normalizeSuccess wraps data correctly', () => {
      const result = normalizeSuccess({ score: 0.05 });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ score: 0.05 });
    });

    it('normalizeError wraps error correctly with all fields', () => {
      const result = normalizeError('NOT_FOUND', 'Not found', { id: 'x' });
      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
      expect(result.message).toBe('Not found');
      expect(result.details).toEqual({ id: 'x' });
    });

    it('normalizeError without details leaves details undefined', () => {
      const result = normalizeError('TIMEOUT', 'Timed out');
      expect(result.success).toBe(false);
      expect(result.details).toBeUndefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Additional: stub methods (formCreate/Update/Delete/operation) succeed
  // when no failure is configured
  // ──────────────────────────────────────────────────────────────────────────
  describe('Stub method default behavior', () => {
    it('formCreate stub returns success with expected fields', async () => {
      const adapter = new MockFormsAdapter();
      const result = await adapter.formCreate({ formId: 'f1', payload: { x: 1 } });
      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as Record<string, unknown>;
        expect(data.formId).toBe('f1');
        expect(data.created).toBe(true);
      }
    });

    it('formUpdate stub returns success with expected fields', async () => {
      const adapter = new MockFormsAdapter();
      const result = await adapter.formUpdate({ formId: 'f1', recordId: 'r1', payload: {} });
      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as Record<string, unknown>;
        expect(data.updated).toBe(true);
      }
    });

    it('formDelete stub returns success with expected fields', async () => {
      const adapter = new MockFormsAdapter();
      const result = await adapter.formDelete({ formId: 'f1', recordId: 'r1' });
      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data as Record<string, unknown>;
        expect(data.deleted).toBe(true);
      }
    });

    it('operation stub returns success', async () => {
      const adapter = new MockFormsAdapter();
      const result = await adapter.operation({ name: 'eq', inputs: { left: 1, right: 1 } });
      expect(result.success).toBe(true);
    });
  });
});
