import express from 'express';

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'flowtrace-server' });
});

app.listen(port, () => {
  console.log(`FlowTrace API Server listening on port ${port}`);
});
