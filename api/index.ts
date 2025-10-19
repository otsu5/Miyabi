/**
 * Miyabi Marketplace API
 * Main entry point for the marketplace backend
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import marketplaceRoutes from './routes/marketplace';
import licenseRoutes from './routes/licenses';
import usageRoutes from './routes/usage';
import authRoutes from './routes/auth';

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // CORS support
app.use(express.json()); // JSON body parser
app.use(express.urlencoded({ extended: true })); // URL-encoded body parser
app.use(morgan('combined')); // Request logging

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// API v1 routes
app.use('/v1/auth', authRoutes);
app.use('/v1/marketplace', marketplaceRoutes);
app.use('/v1/licenses', licenseRoutes);
app.use('/v1/usage', usageRoutes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'Miyabi Marketplace API',
    version: '1.0.0',
    documentation: 'https://github.com/ShunsukeHayashi/Miyabi/blob/main/docs/MARKETPLACE_API_REFERENCE.md',
    endpoints: {
      auth: '/v1/auth',
      marketplace: '/v1/marketplace',
      licenses: '/v1/licenses',
      usage: '/v1/usage'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: 'Endpoint not found',
    path: req.path
  });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);

  res.status(500).json({
    error: 'internal_error',
    message: 'An unexpected error occurred',
    ...(process.env.NODE_ENV === 'development' && {
      details: err.message,
      stack: err.stack
    })
  });
});

// Start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Miyabi Marketplace API running on port ${PORT}`);
    console.log(`📚 Documentation: https://github.com/ShunsukeHayashi/Miyabi/blob/main/docs/MARKETPLACE_API_REFERENCE.md`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

export default app;
