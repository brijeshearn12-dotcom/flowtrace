/**
 * executor/formsAdapter.ts
 *
 * Integration boundary between the FlowTrace executor and an external
 * Forms / API environment.
 *
 * The executor depends ONLY on the IFormsAdapter interface.
 * Concrete implementations (real HTTP client, local mock) are injected
 * at runtime so tests can supply a lightweight fake.
 */

// ---------------------------------------------------------------------------
// Normalized result types
// ---------------------------------------------------------------------------

/**
 * A successful adapter call returns this structure.
 * `data` holds whatever the API returned, typed as `unknown` so callers
 * can narrow it themselves without leaking provider-specific shapes here.
 */
export interface AdapterSuccess {
  success: true;
  data: unknown;
}

/**
 * A failed adapter call returns this structure.
 * Keeps error information predictable across all methods.
 */
export interface AdapterError {
  success: false;
  /** Short machine-readable error identifier (e.g. "NOT_FOUND", "TIMEOUT"). */
  code: string;
  /** Human-readable description of what went wrong. */
  message: string;
  /** Optional extra context — raw response body, validation issues, etc. */
  details?: unknown;
}

/** Union of success and failure; every adapter method returns this. */
export type AdapterResult = AdapterSuccess | AdapterError;

// ---------------------------------------------------------------------------
// Per-method input types
// ---------------------------------------------------------------------------

/**
 * Inputs for creating a new form record via the Forms API.
 * `payload` is the form data; additional fields can be provided in `meta`.
 */
export interface FormCreateInput {
  formId: string;
  payload: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

/**
 * Inputs for updating an existing form record.
 */
export interface FormUpdateInput {
  formId: string;
  recordId: string;
  payload: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

/**
 * Inputs for deleting a form record.
 */
export interface FormDeleteInput {
  formId: string;
  recordId: string;
}

/**
 * Inputs for calling an arbitrary API function (e.g. "FraudService.check").
 * `name` is the function descriptor from the workflow node's `action` field.
 */
export interface FunctionInput {
  name: string;
  inputs: Record<string, unknown>;
}

/**
 * Inputs for invoking a named operation (e.g. a condition operator action
 * or a button-triggered operation from project metadata).
 */
export interface OperationInput {
  name: string;
  inputs: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/**
 * IFormsAdapter is the contract the executor uses.
 *
 * The executor never imports a concrete implementation directly; it receives
 * an IFormsAdapter at construction/call time so that tests, the local mock,
 * and the real HTTP client are all interchangeable.
 */
export interface IFormsAdapter {
  /** Create a new form record. */
  formCreate(input: FormCreateInput): Promise<AdapterResult>;

  /** Update an existing form record. */
  formUpdate(input: FormUpdateInput): Promise<AdapterResult>;

  /** Delete a form record. */
  formDelete(input: FormDeleteInput): Promise<AdapterResult>;

  /** Call a named API function (e.g. "FraudService.check"). */
  function(input: FunctionInput): Promise<AdapterResult>;

  /** Invoke a named operation (e.g. a metadata-driven operation). */
  operation(input: OperationInput): Promise<AdapterResult>;
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/**
 * Wraps a successful response payload in the standard AdapterSuccess shape.
 * Concrete adapters call this before returning so callers always receive a
 * consistent structure regardless of the underlying API format.
 */
export function normalizeSuccess(data: unknown): AdapterSuccess {
  return { success: true, data };
}

/**
 * Wraps an error in the standard AdapterError shape.
 * Concrete adapters (and tests) call this to produce predictable failures.
 */
export function normalizeError(
  code: string,
  message: string,
  details?: unknown
): AdapterError {
  return { success: false, code, message, ...(details !== undefined ? { details } : {}) };
}
