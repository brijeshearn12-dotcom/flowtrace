import { Workflow, Run } from './ir';
import { WorkflowPatchInput } from './schemas';

// POST /api/detect
export interface DetectRequest {
  requirement: string;
}

export interface DetectResponse {
  success: boolean;
  workflow: Workflow; // Proposed initial draft workflow
  confidence: number;
  explanation?: string;
}

// POST /api/workflows
export interface CreateWorkflowRequest {
  name: string;
  requirement: string;
}

export interface CreateWorkflowResponse {
  success: boolean;
  workflow: Workflow;
}

// GET /api/workflows
export type GetWorkflowsResponse = Workflow[];

// GET /api/workflows/:id
export type GetWorkflowResponse = Workflow;

// PATCH /api/workflows/:id
export type UpdateWorkflowRequest = WorkflowPatchInput;

export interface UpdateWorkflowResponse {
  success: boolean;
  workflow: Workflow;
}

// POST /api/workflows/:id/validate
export interface ValidateWorkflowResponse {
  success: boolean;
  errors?: Array<{
    path: string;
    message: string;
    code?: string;
  }>;
}

// POST /api/workflows/:id/publish
export interface PublishWorkflowResponse {
  success: boolean;
  workflow: Workflow;
}

// POST /api/workflows/:id/run
export interface RunWorkflowRequest {
  payload: Record<string, unknown>;
}

export interface RunWorkflowResponse {
  success: boolean;
  run: Run;
}

// GET /api/runs/:runId
export type GetRunResponse = Run;

// GET /api/runs/:runId/logs
export interface GetRunLogsResponse {
  runId: string;
  logs: Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    stepId?: string;
  }>;
}

// POST /api/workflows/:id/agent-edit
export interface AgentEditRequest {
  prompt: string;
}

export interface AgentEditResponse {
  success: boolean;
  explanation: string;
  patch: WorkflowPatchInput;
  warning?: string;
}

