import { Router, Request, Response } from 'express';
import { RunRepository, VersionRepository } from '../../persistence';

const router = Router();

// 1. GET Run Status: GET /api/runs/:runId
router.get('/:runId', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const run = await RunRepository.get(runId);
    
    if (!run) {
      return res.status(404).json({ error: `Run with ID "${runId}" not found` });
    }
    
    // Return standard RunDocument structure
    return res.json(run);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
});

// 2. GET Detailed Execution Logs: GET /api/runs/:runId/logs
router.get('/:runId/logs', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const run = await RunRepository.get(runId);
    
    if (!run) {
      return res.status(404).json({ error: `Run with ID "${runId}" not found` });
    }

    const version = await VersionRepository.get(run.workflowVersionId);
    
    // Construct rich, chronological logs on the fly
    const logs: Array<{
      timestamp: string;
      level: 'info' | 'warn' | 'error';
      message: string;
      stepId?: string;
      type: string;
      [key: string]: any;
    }> = [];

    // 1. Run start log
    logs.push({
      timestamp: run.startedAt,
      level: 'info',
      message: `Workflow run initialized with version ${run.version}`,
      type: 'run_start',
    });

    // 2. Loop through executed nodes in order of startedAt timestamp
    if (run.results) {
      const sortedResults = Object.entries(run.results).sort((a, b) => {
        return new Date(a[1].startedAt).getTime() - new Date(b[1].startedAt).getTime();
      });

      for (const [stepId, result] of sortedResults) {
        const node = version?.nodes.find(n => n.id === stepId);
        const nodeName = node?.name || stepId;

        // Step Start log
        logs.push({
          timestamp: result.startedAt,
          level: 'info',
          message: `Executing step "${nodeName}" (${stepId})`,
          stepId,
          type: 'step_start',
          action: node?.action,
          inputs: node?.inputs,
        });

        // Step Outcome log
        if (result.status === 'success') {
          logs.push({
            timestamp: result.completedAt,
            level: 'info',
            message: `Step "${nodeName}" succeeded`,
            stepId,
            type: 'step_success',
            output: result.output,
          });
        } else if (result.status === 'skipped') {
          logs.push({
            timestamp: result.completedAt,
            level: 'warn',
            message: `Step "${nodeName}" skipped: ${result.error || 'Precondition check failed'}`,
            stepId,
            type: 'step_skipped',
            error: result.error,
          });
        } else if (result.status === 'failed') {
          logs.push({
            timestamp: result.completedAt,
            level: 'error',
            message: `Step "${nodeName}" failed: ${result.error}`,
            stepId,
            type: 'step_failed',
            error: result.error,
            failurePolicy: node?.failurePolicy,
          });
        }
      }
    }

    // 3. Run complete log
    if (run.completedAt) {
      logs.push({
        timestamp: run.completedAt,
        level: run.status === 'success' ? 'info' : 'error',
        message: `Workflow run finished with status ${run.status}`,
        type: 'run_complete',
        status: run.status,
      });
    }

    // Sort all logs chronologically by timestamp
    logs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return res.json({
      runId: run.id,
      logs,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
});

export default router;
