import express from 'express';

const app = express();
const port = process.env.PORT || 3002;

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'mock-forms-api' });
});

app.listen(port, () => {
  console.log(`Mock Forms API Server listening on port ${port}`);
});
