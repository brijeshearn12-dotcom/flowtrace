/**
 * executor/conditionEvaluator.ts
 *
 * Evaluates FlowTrace IR conditions at runtime.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT A CONDITION LOOKS LIKE  (from shared/ir.ts)
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   interface Condition {
 *     field:    string;   // template string, e.g. "{{trigger.approved}}"
 *     operator: 'eq' | 'neq' | 'gt';
 *     value:    unknown;  // static right-hand side value
 *   }
 *
 * The `field` template is resolved immediately before evaluation using the
 * templateResolver so the executor always passes a runtime value, not the
 * raw template string, into evaluate().
 *
 * ──────────────────────────────────────────────────────────────────────────
 * RESULT SHAPE
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Every evaluate() call returns a ConditionResult — success or error — so
 * the executor and UI always have enough information to explain why a branch
 * was or was not taken.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SAFETY
 * ──────────────────────────────────────────────────────────────────────────
 *
 * - No eval(), no new Function().
 * - Comparisons are pure TypeScript value comparisons.
 * - `gt` is only valid between two numbers; other type combos return an
 *   error result rather than throwing.
 */

import { Condition, ConditionOperator } from '../shared/ir';
import { ExecutionContext, resolveConditionField } from './templateResolver';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/**
 * Returned when the condition was evaluated successfully (whether it matched
 * or not).  Contains enough detail for logs and UI to explain the decision.
 */
export interface ConditionSuccess {
  /** Whether the condition matched (true = branch is taken). */
  matched: boolean;
  /** The resolved runtime value from the left-hand side (field). */
  left: unknown;
  /** The static expected value from the right-hand side. */
  right: unknown;
  /** The operator that was applied. */
  operator: ConditionOperator;
  /** Human-readable explanation of why the condition matched or did not. */
  explanation: string;
}

/**
 * Returned when the condition could not be evaluated due to an invalid
 * input (e.g. wrong types for `gt`, unresolvable template, unknown operator).
 */
export interface ConditionError {
  matched: false;
  /** Machine-readable error code. */
  code: string;
  /** Human-readable description of the problem. */
  message: string;
  /** The operator that was attempted. */
  operator: ConditionOperator | string;
  /** The left-hand (resolved) value, if resolution succeeded. */
  left?: unknown;
  /** The right-hand value from the condition definition. */
  right?: unknown;
}

/** Union returned by evaluate(). */
export type ConditionResult = ConditionSuccess | ConditionError;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isConditionError(r: ConditionResult): r is ConditionError {
  return 'code' in r;
}

export function isConditionSuccess(r: ConditionResult): r is ConditionSuccess {
  return !('code' in r);
}

// ---------------------------------------------------------------------------
// Core evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate a Condition against the current ExecutionContext.
 *
 * Steps:
 *  1. Resolve `condition.field` via the template resolver.
 *  2. Apply the operator to (resolved left, condition.value right).
 *  3. Return a ConditionResult with full details.
 *
 * Never throws — resolution errors and type errors are wrapped into a
 * ConditionError so the executor can handle them without try/catch.
 *
 * @param condition  — the Condition from the IR node or edge
 * @param ctx        — the current ExecutionContext (trigger + step outputs)
 */
export function evaluate(
  condition: Condition,
  ctx: ExecutionContext
): ConditionResult {
  // ── Step 1: resolve the field template ──────────────────────────────────
  let left: unknown;
  try {
    left = resolveConditionField(condition.field, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      matched: false,
      code: 'CONDITION_FIELD_RESOLUTION_ERROR',
      message: `Could not resolve condition field "${condition.field}": ${msg}`,
      operator: condition.operator,
      right: condition.value,
    };
  }

  const right = condition.value;
  const op = condition.operator;

  // ── Step 2: apply operator ───────────────────────────────────────────────
  switch (op) {
    case 'eq': {
      // Strict equality — works for strings, numbers, booleans, null
      const matched = left === right;
      return {
        matched,
        left,
        right,
        operator: op,
        explanation: matched
          ? `eq: ${JSON.stringify(left)} === ${JSON.stringify(right)} ✓`
          : `eq: ${JSON.stringify(left)} !== ${JSON.stringify(right)} ✗`,
      };
    }

    case 'neq': {
      const matched = left !== right;
      return {
        matched,
        left,
        right,
        operator: op,
        explanation: matched
          ? `neq: ${JSON.stringify(left)} !== ${JSON.stringify(right)} ✓`
          : `neq: ${JSON.stringify(left)} === ${JSON.stringify(right)} ✗`,
      };
    }

    case 'gt': {
      // gt is only valid between two numbers
      if (typeof left !== 'number') {
        return {
          matched: false,
          code: 'CONDITION_TYPE_MISMATCH',
          message: `gt requires a numeric left-hand value; got ${typeof left} (${JSON.stringify(left)}).`,
          operator: op,
          left,
          right,
        };
      }
      if (typeof right !== 'number') {
        return {
          matched: false,
          code: 'CONDITION_TYPE_MISMATCH',
          message: `gt requires a numeric right-hand value; got ${typeof right} (${JSON.stringify(right)}).`,
          operator: op,
          left,
          right,
        };
      }
      const matched = left > right;
      return {
        matched,
        left,
        right,
        operator: op,
        explanation: matched
          ? `gt: ${left} > ${right} ✓`
          : `gt: ${left} <= ${right} ✗`,
      };
    }

    default: {
      // Exhaustiveness guard — TypeScript will flag missing cases at compile time
      const _exhaustive: never = op;
      return {
        matched: false,
        code: 'CONDITION_UNKNOWN_OPERATOR',
        message: `Unknown condition operator: "${_exhaustive}".`,
        operator: op as string,
        left,
        right,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Edge / node condition helpers
// ---------------------------------------------------------------------------

/**
 * Evaluate an optional condition.
 *
 * - If condition is undefined (unconditional edge/node), returns
 *   { matched: true } — no condition means always proceed.
 * - Otherwise delegates to evaluate().
 *
 * This is the primary entry point used by the sequential executor.
 */
export function evaluateOptional(
  condition: Condition | undefined,
  ctx: ExecutionContext
): ConditionResult {
  if (condition === undefined) {
    return {
      matched: true,
      left: undefined,
      right: undefined,
      operator: 'eq',
      explanation: 'No condition defined — step proceeds unconditionally.',
    };
  }
  return evaluate(condition, ctx);
}
