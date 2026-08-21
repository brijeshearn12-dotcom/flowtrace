import express from 'express';
import { connectDB } from './db';
import workflowsRouter from './routes/workflows';

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use('/api/workflows', workflowsRouter);

app.get('/health', async (_req, res) => {
  try {
    const { db } = await connectDB();
    await db.command({ ping: 1 });
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ status: 'error', database: 'disconnected', error: message });
  }
});

// Initialize database connection on startup
connectDB().catch((err) => {
  console.error('Failed to initialize MongoDB connection on startup:', err.message);
});

app.listen(port, () => {
  console.log(`FlowTrace API Server listening on port ${port}`);
});

