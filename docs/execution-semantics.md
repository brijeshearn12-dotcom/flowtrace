# Execution Semantics & Graph Invariants

This document outlines the validation rules and invariants required for a workflow graph to be declared valid and executable.

## Invariant Categories

### 1. Node & Edge Identifiers
*   **Unique Node IDs**: Every node must have a unique identifier in the `nodes` array. Duplicate node IDs are rejected.
*   **Unique Edge IDs**: Every edge must have a unique identifier. Duplicate edge IDs are rejected.

### 2. Edge Topology
*   **Existing References**: An edge's `source` and `target` properties must match the ID of nodes existing within the workflow graph.
*   **No Self-Loops**: An edge cannot connect a node to itself (`source === target`).
*   **Directed Acyclic Graph (DAG) Constraint**: The graph must be acyclic. Cycles of any length (e.g., A -> B -> A or A -> B -> C -> A) are forbidden.

### 3. Step References & Context Resolution
*   **Trigger References**: Input templates matching `{{trigger.x}}` are evaluated at runtime using the initial trigger payload. They are syntactically valid from any step.
*   **Prior-Step / Ancestor References**: References to other steps via `{{stepId.x}}` must satisfy:
    1.  **Existence**: The referenced `stepId` must correspond to a node present in the workflow.
    2.  **Topological Dependency**: The referenced node must be an ancestor of the referencing node in the DAG. You cannot refer to parallel branches or descendant nodes.

### 4. Failure Policies & Redirect Targets
*   **Redirect Target Existence**: If a step defines a failure policy with the `'redirect'` action, the `redirectTargetId` must exist as a valid node ID in the workflow.

---

## Validation Boundary

| State | Actionability | Criteria |
| :--- | :--- | :--- |
| **Valid Graph** | Allowed to Execute | Passes Zod schemas, contains no cycles, all edges connect valid nodes, all variable references point to ancestors. |
| **Invalid Graph** | Rejected (Throws / 422) | Violates any schema constraint or topological invariant. Execution runs cannot be started. |
