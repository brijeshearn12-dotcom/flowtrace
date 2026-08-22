/**
 * executor/templateResolver.ts
 *
 * Resolves FlowTrace template references in workflow node inputs and
 * condition field strings immediately before an executor step fires.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * TEMPLATE SYNTAX  (matches the existing FlowTrace IR convention)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Trigger reference  — namespace "trigger":
 *   {{trigger.orderId}}
 *   {{trigger.customer.email}}
 *
 * Previous-step reference  — namespace is the step's node ID:
 *   {{order-created.approved}}
 *   {{fraud-check.score}}
 *
 * References may appear:
 *   • As the entire value of an input field  → the resolved value replaces
 *     the field value and preserves its original type (number, boolean, …)
 *   • Embedded inside a larger string        → the resolved value is
 *     stringified and substituted in place
 *
 * ──────────────────────────────────────────────────────────────────────────
 * RUNTIME CONTEXT
 * ──────────────────────────────────────────────────────────────────────────
 *
 * {
 *   trigger : Record<string, unknown>     — original trigger payload
 *   steps   : Record<string, unknown>     — stepId → step output data
 * }
 *
 * "steps" uses the same node IDs that the IR uses, e.g. "order-created".
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SAFETY
 * ──────────────────────────────────────────────────────────────────────────
 *
 * • No eval(), no new Function(), no dynamic code execution.
 * • Path resolution is a pure property-walk over a plain JS object.
 * • Templates cannot access environment variables, process internals,
 *   server state, or any object not explicitly provided in the context.
 * • The original context and inputs are never mutated.
 */

import { StepResult } from '../shared/ir';

// ---------------------------------------------------------------------------
// Runtime context
// ---------------------------------------------------------------------------

/**
 * ExecutionContext holds all runtime data available during a workflow run.
 * It is built incrementally by the executor as steps complete.
 *
 * `steps` maps node IDs to the output data produced by that step.
 * Only completed (success) steps appear here before the next step runs.
 */
export interface ExecutionContext {
  /** The original trigger payload supplied when the run was started. */
  trigger: Record<string, unknown>;
  /**
   * Accumulated step outputs.  Key = node ID (e.g. "order-created").
   * Value = the `output` field from the step's StepResult.
   */
  steps: Record<string, unknown>;
}

/**
 * Build a fresh ExecutionContext from a trigger payload.
 * Call this once at the start of a run; the executor adds to `steps` after
 * each step completes.
 */
export function buildContext(
  triggerPayload: Record<string, unknown>
): ExecutionContext {
  return {
    trigger: { ...triggerPayload },
    steps: {},
  };
}

/**
 * Record a completed step's output into the context.
 * Returns a new context object — the original is not mutated.
 */
export function addStepResult(
  ctx: ExecutionContext,
  result: StepResult
): ExecutionContext {
  if (result.status !== 'success' || result.output === undefined) {
    return ctx;
  }
  return {
    trigger: ctx.trigger,
    steps: {
      ...ctx.steps,
      [result.stepId]: result.output,
    },
  };
}

// ---------------------------------------------------------------------------
// Resolver error
// ---------------------------------------------------------------------------

/**
 * Thrown when a template references a path that does not exist in the
 * runtime context.  Using a typed error class keeps it distinguishable from
 * generic runtime exceptions.
 */
export class TemplateResolutionError extends Error {
  /** The raw template string that could not be resolved, e.g. "{{trigger.orderId}}" */
  readonly reference: string;
  /** Machine-readable code for upstream error handling. */
  readonly code = 'TEMPLATE_REFERENCE_NOT_FOUND' as const;

  constructor(reference: string, message: string) {
    super(message);
    this.name = 'TemplateResolutionError';
    this.reference = reference;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * The same regex the validator uses to detect template references.
 * Matches  {{ anything }}  — note: NOT global here; we create a fresh
 * instance per call to avoid shared lastIndex state.
 */
const TEMPLATE_TOKEN = /\{\{([^}]+)\}\}/g;

/**
 * Walk a dot-separated path through a plain object.
 * Returns the value at the path, or `undefined` if any segment is missing.
 * Never executes code; never accesses prototype chain properties that are
 * not own enumerable properties.
 *
 * @param obj   — root object to walk
 * @param path  — dot-separated path, e.g. "customer.email"
 */
function walkPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object' || Array.isArray(current)) return undefined;
    // Only access own enumerable properties — never prototype chain
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Resolve a single `{{...}}` token against the execution context.
 *
 * Syntax:
 *   {{trigger.<path>}}   — looks up ctx.trigger.<path>
 *   {{<nodeId>.<path>}}  — looks up ctx.steps[nodeId].<path>
 *
 * Throws TemplateResolutionError if the value is not found.
 */
function resolveToken(token: string, ctx: ExecutionContext): unknown {
  // token is the content between {{ and }}, possibly with leading/trailing space
  const trimmed = token.trim();
  const dotIndex = trimmed.indexOf('.');
  if (dotIndex === -1) {
    throw new TemplateResolutionError(
      `{{${trimmed}}}`,
      `Template reference "{{${trimmed}}}" has no path (expected "{{trigger.field}}" or "{{nodeId.field}}").`
    );
  }

  const namespace = trimmed.slice(0, dotIndex);
  const fieldPath = trimmed.slice(dotIndex + 1);

  if (namespace === 'trigger') {
    const value = walkPath(ctx.trigger, fieldPath);
    if (value === undefined) {
      throw new TemplateResolutionError(
        `{{${trimmed}}}`,
        `Template reference "{{${trimmed}}}" could not be resolved: path "${fieldPath}" not found in trigger payload.`
      );
    }
    return value;
  }

  // Step reference: namespace is a node ID
  if (!Object.prototype.hasOwnProperty.call(ctx.steps, namespace)) {
    throw new TemplateResolutionError(
      `{{${trimmed}}}`,
      `Template reference "{{${trimmed}}}" could not be resolved: step "${namespace}" has not produced output (it may not have run yet or may have failed).`
    );
  }

  const stepOutput = ctx.steps[namespace];
  const value = walkPath(stepOutput, fieldPath);
  if (value === undefined) {
    throw new TemplateResolutionError(
      `{{${trimmed}}}`,
      `Template reference "{{${trimmed}}}" could not be resolved: path "${fieldPath}" not found in output of step "${namespace}".`
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve all template references in a single string value.
 *
 * Two modes:
 *
 * A) The entire string IS a single template (e.g. `"{{trigger.orderId}}"`)
 *    → returns the resolved value with its original type preserved
 *      (number, boolean, object, etc.)
 *
 * B) The string contains one or more templates embedded among literal text
 *    (e.g. `"Order {{trigger.orderId}} confirmed"`)
 *    → each resolved value is stringified and substituted; the result is
 *      always a string.
 *
 * @throws TemplateResolutionError if any referenced path is missing.
 */
export function resolveString(value: string, ctx: ExecutionContext): unknown {
  // Collect all matches first to decide which mode to use
  const regex = new RegExp(TEMPLATE_TOKEN.source, 'g');
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    matches.push(match);
  }

  // No template tokens — return as-is
  if (matches.length === 0) return value;

  // Mode A: entire string is exactly one token
  if (matches.length === 1 && matches[0][0] === value.trim() && value.trim() === value) {
    return resolveToken(matches[0][1], ctx);
  }

  // Mode B: embedded templates — replace each occurrence with its stringified value
  let result = value;
  // Process from right to left so indices stay valid after replacements
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const resolved = resolveToken(m[1], ctx);
    const stringified = resolved === null ? 'null'
      : resolved === undefined ? ''
      : String(resolved);
    result = result.slice(0, m.index) + stringified + result.slice(m.index + m[0].length);
  }
  return result;
}

/**
 * Resolve all template references inside a node's `inputs` record.
 *
 * - String values are processed by resolveString().
 * - Non-string values (numbers, booleans, objects, null) are passed through
 *   unchanged.
 * - Returns a new object — the original `inputs` is never mutated.
 *
 * @throws TemplateResolutionError if any referenced path is missing.
 */
export function resolveInputs(
  inputs: Record<string, unknown>,
  ctx: ExecutionContext
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (typeof value === 'string') {
      resolved[key] = resolveString(value, ctx);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Resolve a template string that appears in a condition's `field` property.
 *
 * Condition fields like `"{{trigger.approved}}"` must resolve to their
 * actual runtime value (not always a string) before comparison operators
 * are applied.
 *
 * @throws TemplateResolutionError if the referenced path is missing.
 */
export function resolveConditionField(
  field: string,
  ctx: ExecutionContext
): unknown {
  return resolveString(field, ctx);
}
