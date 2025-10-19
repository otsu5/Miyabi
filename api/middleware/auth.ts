/**
 * Authentication Middleware
 * JWT-based authentication for API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthUser } from '../lib/types';

const JWT_SECRET = process.env.JWT_SECRET!;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

/**
 * Require authentication for protected routes
 */
export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Authentication required. Include Bearer token in Authorization header.'
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role || 'user'
    };

    next();
  } catch (error) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'Invalid or expired token'
    });
  }
}

/**
 * Require admin role
 */
export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({
      error: 'forbidden',
      message: 'Admin access required'
    });
    return;
  }

  next();
}

/**
 * Optional authentication (doesn't fail if no token)
 */
export function optionalAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role || 'user'
    };
  } catch (error) {
    // Invalid token, but don't fail - just continue without user
  }

  next();
}

/**
 * Generate JWT token (30 minutes expiry)
 */
export function generateToken(user: {
  id: string;
  email: string;
  role?: string;
}): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role || 'user'
    },
    JWT_SECRET,
    {
      expiresIn: '30m' // 30 minutes
    }
  );
}

/**
 * Generate refresh token (longer expiration)
 */
export function generateRefreshToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}
