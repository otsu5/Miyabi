/**
 * License API Routes
 * License verification and management
 */

import { Router } from 'express';
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth';
import { verifyLimiter, apiLimiter } from '../middleware/rate-limit';
import { LicenseManager } from '../services/license-manager';

const router = Router();
const licenseManager = new LicenseManager();

/**
 * POST /licenses/verify
 * Verify license key
 */
router.post('/verify', verifyLimiter, async (req, res) => {
  try {
    const { license_key } = req.body;

    if (!license_key) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'license_key is required'
      });
    }

    const license = await licenseManager.verifyLicense(license_key);

    if (!license) {
      return res.status(401).json({
        valid: false,
        error: 'invalid_license',
        message: 'License key is invalid or expired'
      });
    }

    return res.json({
      valid: true,
      plugin_id: license.plugin_id,
      tier: license.tier,
      expires_at: new Date(license.exp * 1000).toISOString(),
      features: license.features,
      limitations: license.limitations
    });
  } catch (error) {
    console.error('Error verifying license:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to verify license'
    });
  }
});

/**
 * POST /licenses/:licenseKey/revoke
 * Revoke license (admin only)
 */
router.post(
  '/:licenseKey/revoke',
  apiLimiter,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res) => {
    try {
      const { licenseKey } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'reason is required'
        });
      }

      await licenseManager.revokeLicense(licenseKey, reason);

      return res.json({
        success: true,
        license_key: licenseKey,
        revoked_at: new Date().toISOString(),
        reason
      });
    } catch (error) {
      console.error('Error revoking license:', error);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to revoke license'
      });
    }
  }
);

export default router;
