import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { apiRouter } from './routes/api';
import { handleMockMagentoGraphQL } from './services/mockMagento';
import { Database } from './storage/db';

dotenv.config();

// Habilitar certificados SSL locales/autofirmados (común en entornos .test, Valet, Docker, Warden)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mock Magento GraphQL Endpoint
app.post('/api/mock/graphql', handleMockMagentoGraphQL);

// Core API
app.use('/api', apiRouter);

// Serve Frontend Static in Production
const clientDistPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

async function startServer() {
  await Database.init();

  app.listen(PORT, () => {
    console.log(`🚀 Magento Flow Runner Backend listening at http://localhost:${PORT}`);
    console.log(`🔮 Mock Magento GraphQL available at http://localhost:${PORT}/api/mock/graphql`);
  });
}

startServer();
