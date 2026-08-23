export type ConditionOperator = 'eq' | 'neq' | 'gt';

export interface Condition {
  field: string;      // e.g. "{{trigger.amount}}" or "{{step_1.approved}}"
  operator: ConditionOperator;
  value: unknown;     // value to compare against
}

export type FailureAction = 'abort' | 'skip' | 'redirect';

export interface FailurePolicy {
  action: FailureAction;
  redirectTargetId?: string; // target node ID if action is 'redirect'
}

export interface Trigger {
  id: string;
  type: 'manual';
  schema?: unknown; // JSON schema or description of payload requirements
}

export interface Node {
  id: string;
  name: string;
  type: 'action' | 'form';
  action: string;             // API function, e.g. "FormsAPI.submit"
  inputs: Record<string, unknown>; // input payload, can contain template references like "{{trigger.x}}"
  condition?: Condition;      // optional pre-condition for executing this node
  failurePolicy?: FailurePolicy;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  condition?: Condition;      // optional condition for traversing this edge
}

export type WorkflowStatus = 'draft' | 'published' | 'archived';

export interface Workflow {
  id: string;                 // logical workflow ID
  version: number;
  status: WorkflowStatus;
  trigger: Trigger;
  nodes: Node[];
  edges: Edge[];
  publishedVersionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StepStatus = 'success' | 'skipped' | 'failed';

export interface StepResult {
  stepId: string;
  status: StepStatus;
  output?: unknown;
  error?: string;
  startedAt: string;
  completedAt: string;
}

export type RunStatus = 'running' | 'success' | 'failed' | 'aborted';

export interface Run {
  id: string;
  workflowId: string;
  version: number;
  status: RunStatus;
  triggerPayload: Record<string, unknown>;
  results: Record<string, StepResult>; // stepId -> StepResult mapping
  startedAt: string;
  completedAt?: string;
}
