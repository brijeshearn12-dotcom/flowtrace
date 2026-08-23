import { Trigger, Node, Edge, StepResult } from '../shared/ir';

export interface ProjectMetadata {
  key: string;
  value: Record<string, unknown>;
  updatedAt: string;
}

export interface WorkflowDocument {
  id: string; // Maps to MongoDB _id
  name: string;
  status: 'draft' | 'published' | 'archived';
  latestVersion: number;
  publishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowVersionDocument {
  id: string; // Maps to MongoDB _id (ObjectId hex string)
  workflowId: string;
  version: number;
  trigger: Trigger;
  nodes: Node[];
  edges: Edge[];
  createdAt: string;
  source?: 'manual' | 'agent';
  summary?: string;
}

export interface RunDocument {
  id: string; // Maps to MongoDB _id
  workflowId: string;
  workflowVersionId: string;
  version: number;
  status: 'running' | 'success' | 'failed' | 'aborted';
  triggerPayload: Record<string, unknown>;
  results: Record<string, StepResult>;
  startedAt: string;
  completedAt?: string;
}

export interface AuditEventDocument {
  id: string; // Maps to MongoDB _id (ObjectId hex string)
  actor: 'user' | 'agent';
  action: 'create' | 'edit' | 'publish' | 'execute';
  entityType: 'workflow' | 'run';
  entityId: string;
  payload: Record<string, unknown>;
  timestamp: string;
}
