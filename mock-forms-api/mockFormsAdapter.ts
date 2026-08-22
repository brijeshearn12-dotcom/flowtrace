/**
 * mock-forms-api/mockFormsAdapter.ts
 *
 * Deterministic local mock implementation of IFormsAdapter.
 *
 * This satisfies the integration boundary defined in executor/formsAdapter.ts
 * so FlowTrace can execute seeded workflows completely offline.
 *
 * Architecture:
 *   FlowTrace Executor
 *           |
 *           v
 *   Forms API Adapter (IFormsAdapter)
 *           |
 *           v
 *   MockFormsAdapter  ← this file
 *
 * The executor never imports this file directly.
 * It receives an IFormsAdapter and calls methods on it.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * OPERATIONS IMPLEMENTED
 * ──────────────────────────────────────────────────────────────────────────
 * Both seeded workflows (OrderPlaced, AssetRequestApproval) use only the
 * `function` method with three action names:
 *   - FraudService.check
 *   - Slack.post
 *   - EmailService.send
 *
 * formCreate / formUpdate / formDelete / operation are implemented as
 * pass-through stubs so the mock fully satisfies IFormsAdapter and can
 * replace a real client without requiring changes to the executor.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * FAILURE TOGGLE
 * ──────────────────────────────────────────────────────────────────────────
 * MockFormsAdapter accepts a FailureConfig at construction time.
 * Set failOn to a function name (e.g. "FraudService.check") to make that
 * specific function call return a normalized AdapterError.
 * All other calls succeed normally.
 *
 * Example:
 *   const adapter = new MockFormsAdapter({ failOn: 'FraudService.check' });
 *
 * When failOn is undefined or empty, all calls succeed deterministically.
 */

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
// Failure configuration
// ---------------------------------------------------------------------------

/**
 * Injected at construction time to control failure mode.
 * failOn: the name of the function/operation that should fail.
 *         Leave undefined (or empty string) for all-success mode.
 */
export interface FailureConfig {
  failOn?: string;
}

// ---------------------------------------------------------------------------
// Deterministic response definitions for each known function
// ---------------------------------------------------------------------------

/**
 * All mock responses are hardcoded constants so the same input always
 * produces the same output. No random IDs, no Date.now(), no Math.random().
 */
const FUNCTION_RESPONSES: Record<string, Record<string, unknown>> = {
  'FraudService.check': {
    score: 0.05,
    approved: true,
    riskLevel: 'low',
  },
  'Slack.post': {
    ok: true,
    channel: 'mock-channel',
    ts: '1000000000.000000',
  },
  'EmailService.send': {
    accepted: true,
    messageId: 'mock-msg-001',
  },
};

/** Fallback response for any function name not in the table above. */
const DEFAULT_FUNCTION_RESPONSE: Record<string, unknown> = {
  ok: true,
};

// ---------------------------------------------------------------------------
// MockFormsAdapter
// ---------------------------------------------------------------------------

export class MockFormsAdapter implements IFormsAdapter {
  private readonly failOn: string;

  constructor(config: FailureConfig = {}) {
    this.failOn = config.failOn ?? '';
  }

  // ──────────────────────────────────────────────
  // function — dispatches to known mock handlers
  // ──────────────────────────────────────────────

  async function(input: FunctionInput): Promise<AdapterResult> {
    // Failure mode: if this function name matches the configured failOn target
    if (this.failOn && input.name === this.failOn) {
      return normalizeError(
        'MOCK_FAILURE',
        `Mock forced failure for function: ${input.name}`,
        { name: input.name, inputs: input.inputs }
      );
    }

    const responseData = FUNCTION_RESPONSES[input.name] ?? DEFAULT_FUNCTION_RESPONSE;
    return normalizeSuccess({ ...responseData });
  }

  // ──────────────────────────────────────────────
  // operation — pass-through stub
  // (no seeded workflow uses this; implemented to satisfy IFormsAdapter)
  // ──────────────────────────────────────────────

  async operation(input: OperationInput): Promise<AdapterResult> {
    if (this.failOn && input.name === this.failOn) {
      return normalizeError(
        'MOCK_FAILURE',
        `Mock forced failure for operation: ${input.name}`,
        { name: input.name, inputs: input.inputs }
      );
    }

    return normalizeSuccess({ ok: true, operation: input.name });
  }

  // ──────────────────────────────────────────────
  // formCreate — pass-through stub
  // ──────────────────────────────────────────────

  async formCreate(input: FormCreateInput): Promise<AdapterResult> {
    if (this.failOn && input.formId === this.failOn) {
      return normalizeError(
        'MOCK_FAILURE',
        `Mock forced failure for formCreate: ${input.formId}`,
        { formId: input.formId }
      );
    }

    return normalizeSuccess({
      id: `mock-rec-${input.formId}`,
      formId: input.formId,
      created: true,
    });
  }

  // ──────────────────────────────────────────────
  // formUpdate — pass-through stub
  // ──────────────────────────────────────────────

  async formUpdate(input: FormUpdateInput): Promise<AdapterResult> {
    if (this.failOn && input.formId === this.failOn) {
      return normalizeError(
        'MOCK_FAILURE',
        `Mock forced failure for formUpdate: ${input.formId}`,
        { formId: input.formId, recordId: input.recordId }
      );
    }

    return normalizeSuccess({
      id: input.recordId,
      formId: input.formId,
      updated: true,
    });
  }

  // ──────────────────────────────────────────────
  // formDelete — pass-through stub
  // ──────────────────────────────────────────────

  async formDelete(input: FormDeleteInput): Promise<AdapterResult> {
    if (this.failOn && input.formId === this.failOn) {
      return normalizeError(
        'MOCK_FAILURE',
        `Mock forced failure for formDelete: ${input.formId}`,
        { formId: input.formId, recordId: input.recordId }
      );
    }

    return normalizeSuccess({
      id: input.recordId,
      formId: input.formId,
      deleted: true,
    });
  }
}
