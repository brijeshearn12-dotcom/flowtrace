# API Contracts

This document details the HTTP endpoints, payload formats, and schemas for the FlowTrace Workflow Engine.

## UI Action to API Endpoint Mapping

| UI Action | Endpoint / Method | Local-only Details |
| :--- | :--- | :--- |
| Paste Plain-Text Requirement | `POST /api/detect` | N/A |
| Create Workflow | `POST /api/workflows` | N/A |
| Load Workflows List | `GET /api/workflows` | N/A |
| View Workflow DAG | `GET /api/workflows/:id` | Layout & Edge rendering computed locally |
| Edit Node / Connection (Manual Patch) | `PATCH /api/workflows/:id` | Validated locally prior to sending |
| Request Natural-Language Agent Patch | `POST /api/workflows/:id/agent-edit` | N/A |
| Publish Draft Version | `POST /api/workflows/:id/publish` | N/A |
| Execute Workflow (Run) | `POST /api/workflows/:id/run` | N/A |
| Inspect Run Status & Logs | `GET /api/runs/:runId` & `GET /api/runs/:runId/logs` | Status badges updated locally via polling |

---

## Endpoints

### 1. Requirement-to-IR Detection
Converts plain English workflow requirements into a structured workflow draft.

*   **Method**: `POST`
*   **Route**: `/api/detect`
*   **Request Body**:
    ```json
    {
      "requirement": "When an OrderPlaced trigger is fired, run FraudCheck. If FraudCheck is failed, abort. Otherwise send confirmation email."
    }
    ```
*   **Success Response** (200 OK):
    ```json
    {
      "success": true,
      "confidence": 0.95,
      "explanation": "Detected OrderPlaced trigger, FraudCheck step, and conditional branching to Cancel/Notify.",
      "workflow": {
        "id": "wf_order_placed",
        "version": 1,
        "status": "draft",
        "trigger": { "id": "tr_1", "type": "manual" },
        "nodes": [
          { "id": "step_fraud", "name": "Fraud Check", "type": "action", "action": "FraudService.check", "inputs": {} }
        ],
        "edges": [],
        "createdAt": "2026-08-20T11:00:00Z",
        "updatedAt": "2026-08-20T11:00:00Z"
      }
    }
    ```
*   **Error Response** (400 Bad Request):
    ```json
    {
      "error": "Requirement string is too short or empty"
    }
    ```

### 2. Get Workflows
Retrieves list of all configured workflows (latest versions).

*   **Method**: `GET`
*   **Route**: `/api/workflows`
*   **Success Response** (200 OK):
    ```json
    [
      {
        "id": "wf_order_placed",
        "version": 1,
        "status": "published",
        "createdAt": "2026-08-20T11:00:00Z",
        "updatedAt": "2026-08-20T11:00:00Z"
      }
    ]
    ```

### 3. Create Workflow
Saves a new detected/custom draft workflow to the database.

*   **Method**: `POST`
*   **Route**: `/api/workflows`
*   **Request Body**:
    ```json
    {
      "name": "Order Process",
      "requirement": "User requirement text..."
    }
    ```
*   **Success Response** (201 Created):
    ```json
    {
      "success": true,
      "workflow": {
        "id": "wf_order_process",
        "version": 1,
        "status": "draft",
        "trigger": { "id": "tr_1", "type": "manual" },
        "nodes": [],
        "edges": [],
        "createdAt": "2026-08-20T11:00:00Z",
        "updatedAt": "2026-08-20T11:00:00Z"
      }
    }
    ```

### 4. Patch Edit Workflow
Modifies workflow draft configurations using JSON patch actions.

*   **Method**: `PATCH`
*   **Route**: `/api/workflows/:id`
*   **Request Body**:
    ```json
    [
      { "op": "replace", "path": "/nodes/0/name", "value": "Updated Fraud Checker" }
    ]
    ```
*   **Success Response** (200 OK):
    ```json
    {
      "success": true,
      "workflow": {
        "id": "wf_order_process",
        "version": 1,
        "status": "draft",
        "nodes": [
          { "id": "step_fraud", "name": "Updated Fraud Checker", "type": "action", "action": "FraudService.check", "inputs": {} }
        ],
        "edges": [],
        "createdAt": "2026-08-20T11:00:00Z",
        "updatedAt": "2026-08-20T11:05:00Z"
      }
    }
    ```
*   **Error Response** (409 Conflict):
    ```json
    {
      "error": "Workflow version is locked (published status) or edit is stale"
    }
    ```

### 5. Validate Workflow
Runs semantic and syntactic validation checks against the current workflow draft.

*   **Method**: `POST`
*   **Route**: `/api/workflows/:id/validate`
*   **Success Response** (200 OK):
    ```json
    {
      "success": true
    }
    ```
*   **Error Response** (422 Unprocessable Entity):
    ```json
    {
      "success": false,
      "errors": [
        { "path": "nodes.1.failurePolicy.redirectTargetId", "message": "redirectTargetId must reference an existing node ID", "code": "custom" }
      ]
    }
    ```

### 6. Publish Workflow Version
Marks the current workflow draft as published and freezes its configuration (immutability rule).

*   **Method**: `POST`
*   **Route**: `/api/workflows/:id/publish`
*   **Success Response** (200 OK):
    ```json
    {
      "success": true,
      "workflow": {
        "id": "wf_order_process",
        "version": 1,
        "status": "published",
        "createdAt": "2026-08-20T11:00:00Z",
        "updatedAt": "2026-08-20T11:06:00Z"
      }
    }
    ```

### 7. Run Workflow
Triggers execution on the published workflow using the supplied input payload.

*   **Method**: `POST`
*   **Route**: `/api/workflows/:id/run`
*   **Request Body**:
    ```json
    {
      "payload": {
        "orderId": "ord_100",
        "amount": 250
      }
    }
    ```
*   **Success Response** (201 Created):
    ```json
    {
      "success": true,
      "run": {
        "id": "run_999",
        "workflowId": "wf_order_process",
        "version": 1,
        "status": "running",
        "triggerPayload": { "orderId": "ord_100", "amount": 250 },
        "results": {},
        "startedAt": "2026-08-20T11:10:00Z"
      }
    }
    ```

### 8. Get Run Status
Retrieves execution state, node progression status, and outputs for a specific run.

*   **Method**: `GET`
*   **Route**: `/api/runs/:runId`
*   **Success Response** (200 OK):
    ```json
    {
      "id": "run_999",
      "workflowId": "wf_order_process",
      "version": 1,
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

### 9. Get Run Logs
Retrieves detailed, chronologically ordered system and console logs for an execution run.

*   **Method**: `GET`
*   **Route**: `/api/runs/:runId/logs`
*   **Success Response** (200 OK):
    ```json
    {
      "runId": "run_999",
      "logs": [
        { "timestamp": "2026-08-20T11:10:00Z", "level": "info", "message": "Workflow started with version 1" },
        { "timestamp": "2026-08-20T11:10:01Z", "level": "info", "message": "Executing step: step_fraud", "stepId": "step_fraud" }
      ]
    }
    ```

### 10. Agent Patch Generation
Uses a natural language query/prompt to request editing proposal patches for a workflow.

*   **Method**: `POST`
*   **Route**: `/api/workflows/:id/agent-edit`
*   **Request Body**:
    ```json
    {
      "prompt": "Insert a slack notification step after fraud check"
    }
    ```
*   **Success Response** (200 OK):
    ```json
    {
      "success": true,
      "explanation": "Added slack notification step and linked its inputs to previous step output.",
      "patch": [
        { "op": "add", "path": "/nodes/1", "value": { "id": "step_slack", "name": "Slack Notification", "type": "action", "action": "Slack.post", "inputs": {} } }
      ]
    }
    ```
