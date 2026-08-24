import path from 'path';
import express from 'express';
import { connectDB } from './db';
import workflowsRouter from './routes/workflows';
import runsRouter from './routes/runs';
import detectRouter from './routes/detect';

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

// Serve static client assets
const clientPath = path.join(__dirname, '../../client');
app.use(express.static(clientPath));

// Production-safe CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
  if (origin === allowedOrigin || !origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-base-version, x-change-summary, x-source');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use('/api/workflows', workflowsRouter);
app.use('/api/runs', runsRouter);
app.use('/api/detect', detectRouter);

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

app.get('/api/health', async (_req, res) => {
  try {
    const { db } = await connectDB();
    await db.command({ ping: 1 });
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ status: 'error', database: 'disconnected', error: message });
  }
});

// SPA fallback routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/health') {
    return next();
  }
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Initialize database connection on startup
connectDB().catch((err) => {
  console.error('Failed to initialize MongoDB connection on startup:', err.message);
});

app.listen(port, () => {
  console.log(`FlowTrace API Server listening on port ${port}`);
});

