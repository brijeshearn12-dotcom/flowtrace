import { Router, Request, Response } from 'express';
import { detectWorkflow } from '../../detector';

const router = Router();

// POST /api/detect
router.post('/', async (req: Request, res: Response) => {
  try {
    const { requirement } = req.body;

    if (requirement === undefined || requirement === null) {
      return res.status(400).json({ error: 'Requirement string is too short or empty' });
    }

    try {
      const result = detectWorkflow(String(requirement));
      return res.json(result);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ error: errMsg });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: msg });
  }
});

export default router;
