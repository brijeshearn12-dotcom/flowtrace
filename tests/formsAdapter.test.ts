/**
 * tests/formsAdapter.test.ts
 *
 * Unit tests for the Forms API adapter integration boundary (Task 4.1).
 *
 * These tests do NOT hit any network or database; they validate:
 *   - A fake adapter can be injected
 *   - formCreate / formUpdate / formDelete return normalized success results
 *   - function / operation calls are representable through the adapter
 *   - Failed calls produce the normalized error structure
 */

import { describe, it, expect } from 'vitest';
import {
  IFormsAdapter,
  AdapterResult,
  FormCreateInput,
  FormUpdateInput,
  FormDeleteInput,
  FunctionInput,
  OperationInput,
  normalizeSuccess,
  normalizeError,
} from '../executor/formsAdapter';

// ---------------------------------------------------------------------------
// Fake (in-memory) adapter implementation
// ---------------------------------------------------------------------------

/**
 * FakeFormsAdapter is a pure in-memory implementation of IFormsAdapter.
 * It demonstrates that the executor interface can be satisfied without any
 * real HTTP calls. Tests configure it via `setNextResult`.
 */
class FakeFormsAdapter implements IFormsAdapter {
  private nextResult: AdapterResult = normalizeSuccess({ ok: true });

  /** Pre-configure the result the next call will return. */
  setNextResult(result: AdapterResult): void {
    this.nextResult = result;
  }

  async formCreate(_input: FormCreateInput): Promise<AdapterResult> {
    return this.nextResult;
  }

  async formUpdate(_input: FormUpdateInput): Promise<AdapterResult> {
    return this.nextResult;
  }

  async formDelete(_input: FormDeleteInput): Promise<AdapterResult> {
    return this.nextResult;
  }

  async function(_input: FunctionInput): Promise<AdapterResult> {
    return this.nextResult;
  }

  async operation(_input: OperationInput): Promise<AdapterResult> {
    return this.nextResult;
  }
}

// ---------------------------------------------------------------------------
// Helper: use the adapter through the interface type only
// This simulates the executor depending on IFormsAdapter, not a concrete class.
// ---------------------------------------------------------------------------
async function callFormCreate(
  adapter: IFormsAdapter,
  input: FormCreateInput
): Promise<AdapterResult> {
  return adapter.formCreate(input);
}

async function callFormUpdate(
  adapter: IFormsAdapter,
  input: FormUpdateInput
): Promise<AdapterResult> {
  return adapter.formUpdate(input);
}

async function callFormDelete(
  adapter: IFormsAdapter,
  input: FormDeleteInput
): Promise<AdapterResult> {
  return adapter.formDelete(input);
}

async function callFunction(
  adapter: IFormsAdapter,
  input: FunctionInput
): Promise<AdapterResult> {
  return adapter.function(input);
}

async function callOperation(
  adapter: IFormsAdapter,
  input: OperationInput
): Promise<AdapterResult> {
  return adapter.operation(input);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FormsAdapter — integration boundary', () => {
  // TEST 1: A fake adapter can be injected
  it('1. should accept a fake adapter via the IFormsAdapter interface', () => {
    const fake: IFormsAdapter = new FakeFormsAdapter();
    // Satisfying the TS interface at compile-time is sufficient; runtime check:
    expect(typeof fake.formCreate).toBe('function');
    expect(typeof fake.formUpdate).toBe('function');
    expect(typeof fake.formDelete).toBe('function');
    expect(typeof fake.function).toBe('function');
    expect(typeof fake.operation).toBe('function');
  });

  // TEST 2: formCreate returns a normalized success result
  it('2. should return normalized success result for formCreate', async () => {
    const fake = new FakeFormsAdapter();
    fake.setNextResult(normalizeSuccess({ id: 'rec_001', formId: 'order_form' }));

    const result = await callFormCreate(fake, {
      formId: 'order_form',
      payload: { orderId: 'ord_1', amount: 250 },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ id: 'rec_001', formId: 'order_form' });
    }
  });

  // TEST 3: formUpdate returns a normalized success result
  it('3. should return normalized success result for formUpdate', async () => {
    const fake = new FakeFormsAdapter();
    fake.setNextResult(normalizeSuccess({ id: 'rec_001', updated: true }));

    const result = await callFormUpdate(fake, {
      formId: 'order_form',
      recordId: 'rec_001',
      payload: { amount: 500 },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).updated).toBe(true);
    }
  });

  // TEST 4: formDelete returns a normalized success result
  it('4. should return normalized success result for formDelete', async () => {
    const fake = new FakeFormsAdapter();
    fake.setNextResult(normalizeSuccess({ deleted: true }));

    const result = await callFormDelete(fake, {
      formId: 'order_form',
      recordId: 'rec_001',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).deleted).toBe(true);
    }
  });

  // TEST 5: function call can be represented through the adapter
  it('5. should return normalized success result for a function call', async () => {
    const fake = new FakeFormsAdapter();
    fake.setNextResult(normalizeSuccess({ score: 0.05, approved: true }));

    const result = await callFunction(fake, {
      name: 'FraudService.check',
      inputs: { orderId: 'ord_1', amount: 250 },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data as Record<string, unknown>;
      expect(data.approved).toBe(true);
      expect(typeof data.score).toBe('number');
    }
  });

  // TEST 6: operation call can be represented through the adapter
  it('6. should return normalized success result for an operation call', async () => {
    const fake = new FakeFormsAdapter();
    fake.setNextResult(normalizeSuccess({ result: true }));

    const result = await callOperation(fake, {
      name: 'eq',
      inputs: { left: 'approved', right: 'approved' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).result).toBe(true);
    }
  });

  // TEST 7: A failed adapter call produces the normalized error structure
  it('7. should return a normalized error structure when the adapter call fails', async () => {
    const fake = new FakeFormsAdapter();
    fake.setNextResult(
      normalizeError('NOT_FOUND', 'Form record not found', { recordId: 'rec_missing' })
    );

    // Test via formCreate to confirm any method propagates the error correctly
    const result = await callFormCreate(fake, {
      formId: 'order_form',
      payload: { orderId: 'ord_x' },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND');
      expect(result.message).toBe('Form record not found');
      expect(result.details).toEqual({ recordId: 'rec_missing' });
    }
  });

  // Supplementary: verify normalizeError without details is still valid
  it('8. should produce a valid error structure without optional details', () => {
    const err = normalizeError('TIMEOUT', 'Request timed out');
    expect(err.success).toBe(false);
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toBe('Request timed out');
    expect(err.details).toBeUndefined();
  });
});
