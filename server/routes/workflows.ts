import { Router, Request, Response } from 'express';
import { WorkflowRepository, VersionRepository } from '../../persistence';
import { VersionService, StaleVersionError, ValidationError } from '../services/versionService';
import { AgentEditService } from '../services/agentEditService';
import { Workflow } from '../../shared/ir';

import { validateWorkflow } from '../../shared/validator';

const router = Router();

// 1. LIST workflows: GET /api/workflows
router.get('/', async (_req: Request, res: Response) => {
  try {
    const list = await WorkflowRepository.list();
    // Map to domain-friendly list and avoid exposing internal database details
    const response = list.map(wf => ({
      id: wf.id,
      name: wf.name,
      status: wf.status,
      latestVersion: wf.latestVersion,
      publishedVersionId: wf.publishedVersionId,
      createdAt: wf.createdAt,
      updatedAt: wf.updatedAt
    }));
    return res.json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
});

// 2. GET workflow: GET /api/workflows/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const wf = await WorkflowRepository.get(id);
    if (!wf) {
      return res.status(404).json({ error: `Workflow with ID "${id}" not found` });
    }

    // Determine version to fetch (query param version, or fallback to latestVersion)
    let versionNumber = wf.latestVersion;
    if (req.query.version) {
      const parsed = parseInt(String(req.query.version), 10);
      if (!isNaN(parsed)) {
        versionNumber = parsed;
      }
    }

    const versionDoc = await VersionRepository.getByVersion(id, versionNumber);
    if (!versionDoc) {
      return res.status(404).json({ error: `Workflow version ${versionNumber} not found` });
    }

    const response: Workflow = {
      id: wf.id,
      version: versionDoc.version,
      status: wf.status,
      trigger: versionDoc.trigger,
      nodes: versionDoc.nodes,
      edges: versionDoc.edges,
      createdAt: wf.createdAt,
      updatedAt: wf.updatedAt
    };
    return res.json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
});

// 3. VALIDATE workflow: POST /api/workflows/:id/validate
router.post('/:id/validate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const wf = await WorkflowRepository.get(id);
    if (!wf) {
      return res.status(404).json({ error: `Workflow with ID "${id}" not found` });
    }

    const versionDoc = await VersionRepository.getByVersion(id, wf.latestVersion);
    if (!versionDoc) {
      return res.status(404).json({ error: `Workflow version ${wf.latestVersion} not found` });
    }

    const workflowObj: Workflow = {
      id: wf.id,
      version: versionDoc.version,
      status: wf.status,
      trigger: versionDoc.trigger,
      nodes: versionDoc.nodes,
      edges: versionDoc.edges,
      createdAt: wf.createdAt,
      updatedAt: wf.updatedAt
    };

    const validationResult = validateWorkflow(workflowObj);
    if (!validationResult.success) {
      return res.status(422).json({
        success: false,
        errors: validationResult.errors
      });
    }

    return res.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
});

// 4. PUBLISH workflow: POST /api/workflows/:id/publish
router.post('/:id/publish', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const wf = await WorkflowRepository.get(id);
    if (!wf) {
      return res.status(404).json({ error: `Workflow with ID "${id}" not found` });
    }

    const baseVersionStr = req.query.baseVersion || req.headers['x-base-version'] || req.body.baseVersion;
    if (!baseVersionStr) {
      return res.status(400).json({ error: 'baseVersion parameter is required' });
    }
    const baseVersion = parseInt(String(baseVersionStr), 10);
    if (isNaN(baseVersion)) {
      return res.status(400).json({ error: 'Invalid baseVersion parameter' });
    }

    const { workflow, version } = await VersionService.publishVersion(id, baseVersion);
    return res.json({
      success: true,
      workflow: {
        id: workflow.id,
        version: version.version,
        status: workflow.status,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt
      }
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(422).json({
        success: false,
        errors: error.errors
      });
    }
    if (error instanceof StaleVersionError) {
      return res.status(409).json({ error: error.message });
    }
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
});

// 5. HISTORY workflow versions: GET /api/workflows/:id/history
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const wf = await WorkflowRepository.get(id);
    if (!wf) {
      return res.status(404).json({ error: `Workflow with ID "${id}" not found` });
    }

    const list = await VersionRepository.list(id);
    list.sort((a, b) => b.version - a.version);
    return res.json(list);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
});

// CREATE workflow: POST /api/workflows
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, id } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: 'id and name are required' });
    }

    const defaultTrigger = { id: 'tr_manual', type: 'manual' as const };
    const { workflow, version } = await VersionService.createWorkflow(id, name, defaultTrigger, [], []);
    return res.status(201).json({
      success: true,
      workflow: {
        id: workflow.id,
        version: version.version,
        status: workflow.status,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt
      }
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(422).json({ success: false, errors: error.errors });
    }
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
});

// PATCH edit workflow: PATCH /api/workflows/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const patch = req.body;

    const baseVersionStr = req.query.baseVersion || req.headers['x-base-version'];
    if (!baseVersionStr) {
      return res.status(400).json({ error: 'x-base-version header or baseVersion query parameter is required for concurrency control' });
    }
    const baseVersion = parseInt(String(baseVersionStr), 10);

    const { workflow, version } = await VersionService.createDraft(id, baseVersion, patch);
    return res.json({
      success: true,
      workflow: {
        id: workflow.id,
        version: version.version,
        status: workflow.status,
        createdAt: workflow.createdAt,
        updatedAt: workflow.updatedAt
      }
    });
  } catch (error) {
    if (error instanceof StaleVersionError) {
      return res.status(409).json({ error: error.message });
    }
    if (error instanceof ValidationError) {
      return res.status(422).json({ success: false, errors: error.errors });
    }
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
});

// 6. RUN workflow: POST /api/workflows/:id/run
router.post('/:id/run', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { payload } = req.body;

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Trigger payload object is required under "payload"' });
    }

    const { runWorkflow } = await import('../../executor/runWorkflow.js');
    const { MockFormsAdapter } = await import('../../mock-forms-api/mockFormsAdapter.js');

    const adapter = new MockFormsAdapter();
    const runResult = await runWorkflow(id, payload, adapter);

    return res.status(201).json({
      success: true,
      run: {
        id: runResult.id,
        workflowId: runResult.workflowId,
        version: runResult.version,
        status: runResult.status,
        triggerPayload: runResult.triggerPayload,
        results: runResult.results,
        startedAt: runResult.startedAt,
        completedAt: runResult.completedAt
      }
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(422).json({
        success: false,
        errors: error.errors
      });
    }
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('validation failed') || msg.includes('Validation failed')) {
      return res.status(422).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
});

// 7. AGENT edit: POST /api/workflows/:id/agent-edit
router.post('/:id/agent-edit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt string is required under "prompt"' });
    }

    const wf = await WorkflowRepository.get(id);
    if (!wf) {
      return res.status(404).json({ error: `Workflow with ID "${id}" not found` });
    }

    const proposal = AgentEditService.generateProposal(id, prompt);
    return res.json(proposal);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
});

export default router;

