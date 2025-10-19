/**
 * Usage Tracking API Routes
 * Usage metrics and quota management
 */

import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { usageLimiter, apiLimiter } from '../middleware/rate-limit';
import { UsageTracker } from '../services/usage-tracker';
import { LicenseManager } from '../services/license-manager';

const router = Router();
const usageTracker = new UsageTracker();
const licenseManager = new LicenseManager();

/**
 * GET /usage/stats
 * Get usage statistics
 */
router.get(
  '/stats',
  apiLimiter,
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const { plugin_id, period } = req.query;

      if (!plugin_id) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'plugin_id query parameter is required'
        });
      }

      const targetPeriod = (period as string) || new Date().toISOString().slice(0, 7);

      // Get usage stats
      const usage = await usageTracker.getMonthlyUsage(
        userId,
        plugin_id as string,
        targetPeriod
      );

      // Get projections
      const projections = await usageTracker.getUsageProjections(
        userId,
        plugin_id as string
      );

      // Get user's license to check quota
      const { data: subscription } = await require('@supabase/supabase-js')
        .createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!)
        .from('subscriptions')
        .select('license_key')
        .eq('user_id', userId)
        .eq('plugin_id', plugin_id)
        .eq('status', 'active')
        .single();

      if (!subscription) {
        return res.status(404).json({
          error: 'not_found',
          message: 'No active subscription found for this plugin'
        });
      }

      const license = await licenseManager.verifyLicense(subscription.license_key);

      if (!license) {
        return res.status(401).json({
          error: 'invalid_license',
          message: 'License is invalid or expired'
        });
      }

      const { monthly_issues, claude_api_tokens } = license.limitations;

      return res.json({
        plugin_id,
        period: targetPeriod,
        usage: {
          issues_processed: usage.issues,
          tokens_consumed: usage.tokens,
          agents_executed: usage.agent_executions,
          commands_used: {} // TODO: Add command tracking
        },
        quota: {
          issues_limit: monthly_issues,
          issues_remaining: monthly_issues === -1 ? -1 : monthly_issues - usage.issues,
          tokens_limit: claude_api_tokens,
          tokens_remaining: claude_api_tokens === -1 ? -1 : claude_api_tokens - usage.tokens
        },
        projections
      });
    } catch (error) {
      console.error('Error fetching usage stats:', error);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch usage statistics'
      });
    }
  }
);

/**
 * POST /usage/track
 * Track usage event
 */
router.post(
  '/track',
  usageLimiter,
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const { plugin_id, event_type, event_data } = req.body;

      if (!plugin_id || !event_type) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'plugin_id and event_type are required'
        });
      }

      // Track different event types
      switch (event_type) {
        case 'issue_processed':
          await usageTracker.trackIssueProcessed(
            userId,
            plugin_id,
            event_data.issue_number,
            {
              repository: event_data.repository,
              agentsUsed: event_data.agents_used || [],
              tokensConsumed: event_data.tokens_consumed || 0,
              durationMs: event_data.duration_ms || 0
            }
          );
          break;

        case 'agent_executed':
          await usageTracker.trackAgentExecuted(
            userId,
            plugin_id,
            event_data.agent_name,
            {
              issueNumber: event_data.issue_number,
              tokensConsumed: event_data.tokens_consumed || 0,
              durationMs: event_data.duration_ms || 0
            }
          );
          break;

        case 'command_used':
          await usageTracker.trackCommandUsed(
            userId,
            plugin_id,
            event_data.command,
            {
              args: event_data.args,
              tokensConsumed: event_data.tokens_consumed,
              durationMs: event_data.duration_ms || 0
            }
          );
          break;

        default:
          return res.status(400).json({
            error: 'bad_request',
            message: `Unknown event_type: ${event_type}`
          });
      }

      return res.json({
        success: true,
        event_id: `evt_${Date.now()}`,
        tracked_at: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error tracking usage:', error);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to track usage'
      });
    }
  }
);

/**
 * GET /usage/report
 * Generate usage report for a month
 */
router.get(
  '/report',
  apiLimiter,
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const { plugin_id, month } = req.query;

      if (!plugin_id) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'plugin_id query parameter is required'
        });
      }

      const targetMonth = (month as string) || new Date().toISOString().slice(0, 7);

      const report = await usageTracker.generateUsageReport(
        userId,
        plugin_id as string,
        targetMonth
      );

      return res.json({
        plugin_id,
        month: targetMonth,
        report
      });
    } catch (error) {
      console.error('Error generating usage report:', error);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to generate usage report'
      });
    }
  }
);

export default router;
