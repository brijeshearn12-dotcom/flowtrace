import { z } from 'zod';

// Condition schema
export const ConditionSchema = z.object({
  field: z.string().min(1, 'Field path is required'),
  operator: z.enum(['eq', 'neq', 'gt'] as const),
  value: z.any()
});

// Failure Policy schema
export const FailurePolicySchema = z.object({
  action: z.enum(['abort', 'skip', 'redirect'] as const),
  redirectTargetId: z.string().optional()
}).refine(data => {
  if (data.action === 'redirect') {
    return typeof data.redirectTargetId === 'string' && data.redirectTargetId.length > 0;
  }
  return true;
}, {
  message: "redirectTargetId is required when failure policy action is 'redirect'",
  path: ['redirectTargetId']
});

// Trigger schema
export const TriggerSchema = z.object({
  id: z.string().min(1, 'Trigger ID is required'),
  type: z.literal('manual'),
  schema: z.any().optional()
});

// Node schema
export const NodeSchema = z.object({
  id: z.string().min(1, 'Node ID is required'),
  name: z.string().min(1, 'Node name is required'),
  type: z.enum(['action', 'form'] as const),
  action: z.string().min(1, 'Action descriptor is required'),
  inputs: z.record(z.string(), z.any()),
  condition: ConditionSchema.optional(),
  failurePolicy: FailurePolicySchema.optional()
});

// Edge schema
export const EdgeSchema = z.object({
  id: z.string().min(1, 'Edge ID is required'),
  source: z.string().min(1, 'Source node ID is required'),
  target: z.string().min(1, 'Target node ID is required'),
  condition: ConditionSchema.optional()
});

// Workflow schema
export const WorkflowSchema = z.object({
  id: z.string().min(1, 'Workflow ID is required'),
  version: z.number().int().positive(),
  status: z.enum(['draft', 'published', 'archived'] as const),
  trigger: TriggerSchema,
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

// StepResult schema
export const StepResultSchema = z.object({
  stepId: z.string().min(1, 'Step ID is required'),
  status: z.enum(['success', 'skipped', 'failed'] as const),
  output: z.any().optional(),
  error: z.string().optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime()
});

// Run schema
export const RunSchema = z.object({
  id: z.string().min(1, 'Run ID is required'),
  workflowId: z.string().min(1, 'Workflow ID is required'),
  version: z.number().int().positive(),
  status: z.enum(['running', 'success', 'failed', 'aborted'] as const),
  triggerPayload: z.record(z.string(), z.any()),
  results: z.record(z.string(), StepResultSchema),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional()
});

// Patch Operation schema
export const PatchOpSchema = z.object({
  op: z.enum(['add', 'remove', 'replace'] as const),
  path: z.string().min(1, 'Path is required'),
  value: z.any().optional()
});

// List of patch operations for workflow updates
export const WorkflowPatchSchema = z.array(PatchOpSchema);

// Inferred Types
export type ConditionInput = z.infer<typeof ConditionSchema>;
export type FailurePolicyInput = z.infer<typeof FailurePolicySchema>;
export type TriggerInput = z.infer<typeof TriggerSchema>;
export type NodeInput = z.infer<typeof NodeSchema>;
export type EdgeInput = z.infer<typeof EdgeSchema>;
export type WorkflowInput = z.infer<typeof WorkflowSchema>;
export type StepResultInput = z.infer<typeof StepResultSchema>;
export type RunInput = z.infer<typeof RunSchema>;
export type PatchOpInput = z.infer<typeof PatchOpSchema>;
export type WorkflowPatchInput = z.infer<typeof WorkflowPatchSchema>;
