# MongoDB Data Model

This document defines the database schemas, collection structures, indexing strategies, and validation rules for the FlowTrace Workflow Engine.

---

## Rules and Guidelines

1.  **IDs**: Every document uses MongoDB standard `_id` (`ObjectId`). References to other collections are stored as string IDs or `ObjectId`s as specified.
2.  **Timestamps**: All timestamps must be stored as UTC ISODate strings or Date objects.
3.  **Workflow Version Immutability**:
    *   Once a workflow version is published, its corresponding document in the `workflowVersions` collection is frozen and **immutable**.
    *   Any updates to a workflow result in a new draft, or a new version creation. Published versions can never be modified.
4.  **Run-to-Version References**: A workflow run (`runs`) stores a direct reference (`workflowVersionId`) pointing to the specific, immutable `workflowVersions` document executed.
5.  **Log Ordering**: Log documents (`logs`) are ordered by `timestamp` and a sequential `sequenceNumber` to guarantee exact chronological order during concurrent executions.
6.  **Audit Event Immutability**: All records in `auditEvents` are insert-only. Updates and deletes on this collection are prohibited.

---

## Collections

### 1. `projectMetadata`
Stores configuration schemas, functions, triggers, and operations for validation and UI rendering.

*   **Purpose**: Central registry of available step integrations, function signatures, and input shapes.
*   **Required Fields**: `key` (string), `value` (object), `updatedAt` (ISODate).
*   **Relationships**: None.
*   **Indexes**:
    *   `{ key: 1 }` (Unique)
*   **Query Patterns**: Fetch schemas/definitions by key.
*   **Example Document**:
    ```json
    {
      "_id": "60c72b2f9b1d8b2bad8f4101",
      "key": "forms_api_schema",
      "value": {
        "actions": {
          "FormsAPI.submit": {
            "inputs": {
              "formId": "string",
              "payload": "object"
            }
          }
        }
      },
      "updatedAt": "2026-08-20T11:00:00Z"
    }
    ```

### 2. `workflows`
Represents the logical workflow entity. Tracks the current status and points to active versions.

*   **Purpose**: Manages lifecycle status and coordinates version pointers.
*   **Required Fields**: `name` (string), `status` (string: `'draft' | 'published' | 'archived'`), `latestVersion` (int), `publishedVersionId` (string ID/null), `createdAt` (ISODate), `updatedAt` (ISODate).
*   **Relationships**: `publishedVersionId` references `workflowVersions._id`.
*   **Indexes**:
    *   `{ status: 1 }`
*   **Query Patterns**: List active workflows; get specific workflow status.
*   **Example Document**:
    ```json
    {
      "_id": "wf_order_placed",
      "name": "Order Placement Process",
      "status": "published",
      "latestVersion": 2,
      "publishedVersionId": "60c72b2f9b1d8b2bad8f4202",
      "createdAt": "2026-08-20T11:00:00Z",
      "updatedAt": "2026-08-20T11:05:00Z"
    }
    ```

### 3. `workflowVersions`
Immutable snapshots of workflow configurations (IR).

*   **Purpose**: Ensures auditability and deterministic execution for runs.
*   **Required Fields**: `workflowId` (string), `version` (int), `trigger` (object), `nodes` (array), `edges` (array), `createdAt` (ISODate).
*   **Relationships**: `workflowId` references `workflows._id`.
*   **Indexes**:
    *   `{ workflowId: 1, version: 1 }` (Unique)
*   **Query Patterns**: Fetch specific version of a workflow; find all versions for a workflow.
*   **Example Document**:
    ```json
    {
      "_id": "60c72b2f9b1d8b2bad8f4202",
      "workflowId": "wf_order_placed",
      "version": 2,
      "trigger": { "id": "tr_1", "type": "manual" },
      "nodes": [
        { "id": "step_fraud", "name": "Fraud Check", "type": "action", "action": "FraudService.check", "inputs": {} }
      ],
      "edges": [],
      "createdAt": "2026-08-20T11:05:00Z"
    }
    ```

### 4. `runs`
Tracks instances of workflow executions.

*   **Purpose**: Execution history, step statuses, outputs, and inputs.
*   **Required Fields**: `workflowId` (string), `workflowVersionId` (string), `status` (string: `'running' | 'success' | 'failed' | 'aborted'`), `triggerPayload` (object), `results` (object: mapping of `stepId` to `StepResult`), `startedAt` (ISODate).
*   **Relationships**: `workflowVersionId` references `workflowVersions._id`.
*   **Indexes**:
    *   `{ workflowId: 1, startedAt: -1 }`
    *   `{ status: 1 }`
*   **Query Patterns**: Fetch execution history by workflow; get run details by ID.
*   **Example Document**:
    ```json
    {
      "_id": "run_999",
      "workflowId": "wf_order_placed",
      "workflowVersionId": "60c72b2f9b1d8b2bad8f4202",
      "status": "success",
      "triggerPayload": { "orderId": "ord_100", "amount": 250 },
      "results": {
        "step_fraud": {
          "stepId": "step_fraud",
          "status": "success",
          "output": { "score": 0.05 },
          "startedAt": "2026-08-20T11:10:01Z",
          "completedAt": "2026-08-20T11:10:02Z"
        }
      },
      "startedAt": "2026-08-20T11:10:00Z",
      "completedAt": "2026-08-20T11:10:03Z"
    }
    ```

### 5. `logs`
System logs generated during step execution.

*   **Purpose**: Diagnostic logs, inputs/outputs trace, and routing updates.
*   **Required Fields**: `runId` (string), `timestamp` (ISODate), `sequenceNumber` (int), `level` (string: `'info' | 'warn' | 'error'`), `message` (string).
*   **Relationships**: `runId` references `runs._id`.
*   **Indexes**:
    *   `{ runId: 1, sequenceNumber: 1 }` (Unique)
*   **Query Patterns**: Stream/retrieve logs for a run in strict chronological order.
*   **Example Document**:
    ```json
    {
      "_id": "60c72b2f9b1d8b2bad8f4501",
      "runId": "run_999",
      "timestamp": "2026-08-20T11:10:01Z",
      "sequenceNumber": 1,
      "level": "info",
      "message": "Executing step: step_fraud",
      "stepId": "step_fraud"
    }
    ```

### 6. `auditEvents`
System change log capturing edits, state transitions, and approvals.

*   **Purpose**: Operational audit trail for tracking user/agent activity.
*   **Required Fields**: `actor` (string: `'user' | 'agent'`), `action` (string: `'create' | 'edit' | 'publish' | 'execute'`), `entityType` (string: `'workflow' | 'run'`), `entityId` (string), `payload` (object: contains diffs, statuses, or prompt details), `timestamp` (ISODate).
*   **Relationships**: `entityId` matches target `workflows._id` or `runs._id`.
*   **Indexes**:
    *   `{ entityType: 1, entityId: 1, timestamp: -1 }`
*   **Query Patterns**: List edits and version transformations for a workflow.
*   **Example Document**:
    ```json
    {
      "_id": "60c72b2f9b1d8b2bad8f4601",
      "actor": "agent",
      "action": "edit",
      "entityType": "workflow",
      "entityId": "wf_order_placed",
      "payload": {
        "prompt": "change fraud threshold to 0.9",
        "patch": [{ "op": "replace", "path": "/nodes/0/inputs/threshold", "value": 0.9 }]
      },
      "timestamp": "2026-08-20T11:05:00Z"
    }
    ```
