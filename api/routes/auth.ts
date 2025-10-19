/**
 * Authentication Routes
 * Handles user login, token refresh, and logout
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { userService } from '../services/user-service';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { LoginCredentials, AuthResponse } from '../lib/types';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET!;
const ACCESS_TOKEN_EXPIRY = '30m'; // 30 minutes
const REFRESH_TOKEN_EXPIRY = '30d'; // 30 days

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

/**
 * POST /v1/auth/login
 * Login with username and password
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, password, rememberMe } = req.body as LoginCredentials;

    // Validate input
    if (!name || !password) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Name and password are required',
      });
      return;
    }

    // Verify credentials
    const user = await userService.verifyCredentials({ name, password, rememberMe });
    if (!user) {
      res.status(401).json({
        error: 'invalid_credentials',
        message: 'Invalid name or password',
      });
      return;
    }

    // Generate access token (30 minutes)
    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Generate refresh token only if "rememberMe" is true (30 days)
    let refreshToken: string | undefined;
    if (rememberMe) {
      refreshToken = jwt.sign(
        {
          sub: user.id,
          type: 'refresh',
        },
        JWT_SECRET,
        { expiresIn: REFRESH_TOKEN_EXPIRY }
      );
    }

    // Build response
    const response: AuthResponse = {
      accessToken,
      refreshToken,
      expiresIn: 30 * 60, // 30 minutes in seconds
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };

    res.json(response);
    return;
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'An error occurred during login',
    });
    return;
  }
});

/**
 * POST /v1/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: 'validation_error',
        message: 'Refresh token is required',
      });
      return;
    }

    // Verify refresh token
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET);
    } catch (error) {
      res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid or expired refresh token',
      });
      return;
    }

    // Verify token type
    if (decoded.type !== 'refresh') {
      res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid token type',
      });
      return;
    }

    // Get user
    const user = await userService.findById(decoded.sub);
    if (!user) {
      res.status(401).json({
        error: 'user_not_found',
        message: 'User not found',
      });
      return;
    }

    // Generate new access token
    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Build response
    const response: AuthResponse = {
      accessToken,
      refreshToken, // Return the same refresh token
      expiresIn: 30 * 60, // 30 minutes in seconds
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };

    res.json(response);
    return;
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'An error occurred during token refresh',
    });
    return;
  }
});

/**
 * POST /v1/auth/logout
 * Logout (client-side token removal)
 */
router.post('/logout', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
  // In a stateless JWT system, logout is primarily client-side
  // The client should remove the tokens from storage
  // In production, you might want to implement token blacklisting

  res.json({
    message: 'Logged out successfully',
  });
  return;
});

/**
 * GET /v1/auth/me
 * Get current user information
 */
router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Not authenticated',
      });
      return;
    }

    const user = await userService.findById(req.user.id);
    if (!user) {
      res.status(404).json({
        error: 'user_not_found',
        message: 'User not found',
      });
      return;
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
    return;
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'An error occurred while fetching user information',
    });
    return;
  }
});

export default router;
