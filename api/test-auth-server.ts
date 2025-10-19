/**
 * Test Auth Server
 * Minimal API server for testing authentication only
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes
app.use('/v1/auth', authRoutes);

// Root
app.get('/', (_req, res) => {
  res.json({
    name: 'Miyabi Auth Test API',
    version: '1.0.0',
    endpoints: {
      auth: '/v1/auth',
      health: '/health'
    }
  });
});

app.listen(PORT, () => {
  console.log(`✅ Auth Test API running on http://localhost:${PORT}`);
  console.log(`📋 Endpoints:`);
  console.log(`   - POST http://localhost:${PORT}/v1/auth/login`);
  console.log(`   - POST http://localhost:${PORT}/v1/auth/refresh`);
  console.log(`   - POST http://localhost:${PORT}/v1/auth/logout`);
  console.log(`   - GET  http://localhost:${PORT}/v1/auth/me`);
  console.log(`\n🧪 Test users:`);
  console.log(`   - admin / admin123`);
  console.log(`   - testuser / test123`);
  console.log(`   - customer / customer123`);
});

export default app;
