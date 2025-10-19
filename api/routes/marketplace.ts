/**
 * Marketplace API Routes
 * Plugin listing, installation, purchase, and subscription management
 */

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth';
import { apiLimiter, purchaseLimiter } from '../middleware/rate-limit';
import { LicenseManager } from '../services/license-manager';

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);
const licenseManager = new LicenseManager();

/**
 * GET /marketplace/plugins
 * List all available plugins
 */
router.get(
  '/plugins',
  apiLimiter,
  optionalAuth,
  async (req: AuthRequest, res) => {
    try {
      const {
        category,
        tier,
        search,
        page = 1,
        limit = 20,
        sort = 'downloads',
        verified
      } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = Math.min(parseInt(limit as string), 100);
      const offset = (pageNum - 1) * limitNum;

      // Build query
      let query = supabase
        .from('plugins')
        .select('*', { count: 'exact' });

      // Apply filters
      if (category) {
        query = query.contains('categories', [category]);
      }
      if (tier) {
        query = query.eq('tier', tier);
      }
      if (search) {
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
      }
      if (verified === 'true') {
        query = query.eq('verified', true);
      }

      // Apply sorting
      const sortField = sort === 'rating' ? 'rating' : 'downloads';
      query = query.order(sortField, { ascending: false });

      // Apply pagination
      query = query.range(offset, offset + limitNum - 1);

      const { data: plugins, error, count } = await query;

      if (error) {
        throw error;
      }

      return res.json({
        plugins: plugins || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limitNum)
        }
      });
    } catch (error) {
      console.error('Error listing plugins:', error);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to list plugins'
      });
    }
  }
);

/**
 * GET /marketplace/plugins/:pluginId
 * Get plugin details
 */
router.get(
  '/plugins/:pluginId',
  apiLimiter,
  optionalAuth,
  async (req: AuthRequest, res) => {
    try {
      const { pluginId } = req.params;

      const { data: plugin, error } = await supabase
        .from('plugins')
        .select('*')
        .eq('id', pluginId)
        .single();

      if (error || !plugin) {
        return res.status(404).json({
          error: 'not_found',
          message: 'Plugin not found'
        });
      }

      // Get reviews count
      const { count: reviewCount } = await supabase
        .from('plugin_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('plugin_id', pluginId);

      return res.json({
        ...plugin,
        reviewCount: reviewCount || 0
      });
    } catch (error) {
      console.error('Error fetching plugin:', error);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch plugin'
      });
    }
  }
);

/**
 * POST /marketplace/plugins/:pluginId/install
 * Install free plugin
 */
router.post(
  '/plugins/:pluginId/install',
  apiLimiter,
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const { pluginId } = req.params;
      const userId = req.user!.id;

      // Get plugin details
      const { data: plugin, error: pluginError } = await supabase
        .from('plugins')
        .select('*')
        .eq('id', pluginId)
        .single();

      if (pluginError || !plugin) {
        return res.status(404).json({
          error: 'not_found',
          message: 'Plugin not found'
        });
      }

      // Check if free tier
      if (plugin.tier !== 'free') {
        return res.status(400).json({
          error: 'bad_request',
          message: 'This plugin requires purchase. Use /purchase endpoint instead.'
        });
      }

      // Check if already installed
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('plugin_id', pluginId)
        .single();

      if (existing) {
        return res.status(409).json({
          error: 'conflict',
          message: 'Plugin already installed'
        });
      }

      // Generate free license
      const licenseKey = await licenseManager.generateLicense(
        userId,
        pluginId,
        'free'
      );

      // Create subscription record
      const now = new Date();
      const oneYearLater = new Date();
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

      await supabase.from('subscriptions').insert({
        user_id: userId,
        plugin_id: pluginId,
        tier: 'free',
        license_key: licenseKey,
        status: 'active',
        current_period_start: now,
        current_period_end: oneYearLater,
        cancel_at_period_end: false
      });

      // Increment download count
      await supabase.rpc('increment_downloads', {
        p_plugin_id: pluginId
      });

      return res.json({
        success: true,
        plugin_id: pluginId,
        tier: 'free',
        license_key: licenseKey,
        message: 'Plugin installed successfully'
      });
    } catch (error) {
      console.error('Error installing plugin:', error);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to install plugin'
      });
    }
  }
);

/**
 * POST /marketplace/plugins/:pluginId/purchase
 * Purchase paid plugin (requires Stripe integration)
 */
router.post(
  '/plugins/:pluginId/purchase',
  purchaseLimiter,
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const { pluginId } = req.params;
      // payment_method_id / billing_cycle will be used once Stripe integration is implemented
      const userId = req.user!.id;

      // Get plugin details
      const { data: plugin } = await supabase
        .from('plugins')
        .select('*')
        .eq('id', pluginId)
        .single();

      if (!plugin) {
        return res.status(404).json({
          error: 'not_found',
          message: 'Plugin not found'
        });
      }

      if (plugin.tier === 'free') {
        return res.status(400).json({
          error: 'bad_request',
          message: 'Free plugins should use /install endpoint'
        });
      }

      // Check if already subscribed
      const { data: existing } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('plugin_id', pluginId)
        .eq('status', 'active')
        .single();

      if (existing) {
        return res.status(409).json({
          error: 'conflict',
          message: 'Already subscribed to this plugin'
        });
      }

      // TODO: Implement Stripe subscription creation
      // This is a placeholder - full Stripe integration needed

      return res.json({
        success: true,
        message: 'Stripe integration required - see MARKETPLACE_IMPLEMENTATION_GUIDE.md',
        plugin_id: pluginId,
        tier: plugin.tier,
        price: plugin.price
      });
    } catch (error) {
      console.error('Error purchasing plugin:', error);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to purchase plugin'
      });
    }
  }
);

/**
 * POST /marketplace/plugins/:pluginId/trial
 * Start free trial (Pro tier)
 */
router.post(
  '/plugins/:pluginId/trial',
  apiLimiter,
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const { pluginId } = req.params;
      const userId = req.user!.id;

      // Get plugin details
      const { data: plugin } = await supabase
        .from('plugins')
        .select('*')
        .eq('id', pluginId)
        .single();

      if (!plugin) {
        return res.status(404).json({
          error: 'not_found',
          message: 'Plugin not found'
        });
      }

      if (!plugin.trial_period) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'This plugin does not support trials'
        });
      }

      // Check trial eligibility
      const trialStatus = await licenseManager.getTrialStatus(userId, pluginId);

      if (!trialStatus.eligible) {
        return res.status(409).json({
          error: 'conflict',
          message: 'Trial already used for this plugin',
          details: trialStatus
        });
      }

      // Generate trial license
      const licenseKey = await licenseManager.generateTrialLicense(userId, pluginId);

      // Create subscription record
      const now = new Date();
      const trialEnds = new Date();
      trialEnds.setDate(trialEnds.getDate() + plugin.trial_period);

      await supabase.from('subscriptions').insert({
        user_id: userId,
        plugin_id: pluginId,
        tier: plugin.tier,
        license_key: licenseKey,
        status: 'trial',
        current_period_start: now,
        current_period_end: trialEnds,
        trial_ends_at: trialEnds,
        cancel_at_period_end: false
      });

      return res.json({
        success: true,
        plugin_id: pluginId,
        tier: plugin.tier,
        license_key: licenseKey,
        status: 'trial',
        trial_started_at: now,
        trial_ends_at: trialEnds,
        trial_days_remaining: plugin.trial_period,
        message: `${plugin.trial_period}-day free trial started. No credit card required.`
      });
    } catch (error: any) {
      console.error('Error starting trial:', error);
      return res.status(400).json({
        error: 'bad_request',
        message: error.message || 'Failed to start trial'
      });
    }
  }
);

/**
 * GET /marketplace/subscriptions
 * Get user's subscriptions
 */
router.get(
  '/subscriptions',
  apiLimiter,
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;

      const { data: subscriptions, error } = await supabase
        .from('subscriptions')
        .select(`
          *,
          plugins:plugin_id (
            id,
            name,
            display_name,
            tier,
            price
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return res.json({
        subscriptions: subscriptions || []
      });
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to fetch subscriptions'
      });
    }
  }
);

/**
 * DELETE /marketplace/subscriptions/:subscriptionId
 * Cancel subscription
 */
router.delete(
  '/subscriptions/:subscriptionId',
  apiLimiter,
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const { subscriptionId } = req.params;
      const { immediately = false } = req.query;
      const userId = req.user!.id;

      // Get subscription
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .eq('user_id', userId)
        .single();

      if (!subscription) {
        return res.status(404).json({
          error: 'not_found',
          message: 'Subscription not found'
        });
      }

      if (immediately === 'true') {
        // Cancel immediately
        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            cancel_at_period_end: true,
            updated_at: new Date()
          })
          .eq('id', subscriptionId);

        return res.json({
          success: true,
          subscription_id: subscriptionId,
          status: 'canceled',
          canceled_at: new Date(),
          message: 'Subscription canceled immediately'
        });
      } else {
        // Cancel at period end
        await supabase
          .from('subscriptions')
          .update({
            cancel_at_period_end: true,
            updated_at: new Date()
          })
          .eq('id', subscriptionId);

        return res.json({
          success: true,
          subscription_id: subscriptionId,
          status: 'active',
          cancel_at_period_end: true,
          ends_at: subscription.current_period_end,
          message: 'Subscription will be canceled at the end of the billing period'
        });
      }
    } catch (error) {
      console.error('Error canceling subscription:', error);
      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to cancel subscription'
      });
    }
  }
);

export default router;
