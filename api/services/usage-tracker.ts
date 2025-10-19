/**
 * Usage Tracker Service
 * Handles usage tracking, quota enforcement, and analytics
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LicensePayload, QuotaCheckResult } from '../lib/types';

export class UsageTracker {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_KEY!
    );
  }

  /**
   * Track Issue processing event
   */
  async trackIssueProcessed(
    userId: string,
    pluginId: string,
    issueNumber: number,
    metadata: {
      repository: string;
      agentsUsed: string[];
      tokensConsumed: number;
      durationMs: number;
    }
  ): Promise<void> {
    // Insert usage event
    await this.supabase.from('usage_events').insert({
      user_id: userId,
      plugin_id: pluginId,
      event_type: 'issue_processed',
      event_data: {
        issue_number: issueNumber,
        ...metadata
      },
      created_at: new Date()
    });

    // Update monthly aggregates
    const period = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    await this.updateMonthlyUsage(userId, pluginId, period, 'issues', 1);
    await this.updateMonthlyUsage(userId, pluginId, period, 'tokens', metadata.tokensConsumed);
  }

  /**
   * Track agent execution
   */
  async trackAgentExecuted(
    userId: string,
    pluginId: string,
    agentName: string,
    metadata: {
      issueNumber?: number;
      tokensConsumed: number;
      durationMs: number;
    }
  ): Promise<void> {
    await this.supabase.from('usage_events').insert({
      user_id: userId,
      plugin_id: pluginId,
      event_type: 'agent_executed',
      event_data: {
        agent_name: agentName,
        ...metadata
      },
      created_at: new Date()
    });

    // Update agent execution count
    const period = new Date().toISOString().slice(0, 7);
    await this.supabase.rpc('increment_agent_execution', {
      p_user_id: userId,
      p_plugin_id: pluginId,
      p_period: period,
      p_agent_name: agentName
    });
  }

  /**
   * Track command usage
   */
  async trackCommandUsed(
    userId: string,
    pluginId: string,
    command: string,
    metadata: {
      args?: string[];
      tokensConsumed?: number;
      durationMs: number;
    }
  ): Promise<void> {
    await this.supabase.from('usage_events').insert({
      user_id: userId,
      plugin_id: pluginId,
      event_type: 'command_used',
      event_data: {
        command,
        ...metadata
      },
      created_at: new Date()
    });
  }

  /**
   * Check if user has quota remaining
   */
  async checkQuota(
    userId: string,
    pluginId: string,
    license: LicensePayload
  ): Promise<QuotaCheckResult> {
    const { monthly_issues, claude_api_tokens } = license.limitations;

    // Unlimited tier
    if (monthly_issues === -1) {
      return { allowed: true };
    }

    // Get current month's usage
    const usage = await this.getMonthlyUsage(userId, pluginId);

    // Check Issue quota
    if (usage.issues >= monthly_issues) {
      return {
        allowed: false,
        remaining: 0,
        message: `Monthly limit reached (${monthly_issues} Issues). Upgrade to Pro for unlimited Issues.`
      };
    }

    // Check token quota
    if (claude_api_tokens !== -1 && usage.tokens >= claude_api_tokens) {
      return {
        allowed: false,
        remaining: 0,
        message: `API token limit reached (${claude_api_tokens} tokens). Upgrade to Pro for 10x more tokens.`
      };
    }

    return {
      allowed: true,
      remaining: monthly_issues - usage.issues
    };
  }

  /**
   * Get monthly usage stats
   */
  async getMonthlyUsage(
    userId: string,
    pluginId: string,
    period?: string
  ): Promise<{
    issues: number;
    tokens: number;
    agent_executions: Record<string, number>;
  }> {
    const targetPeriod = period || new Date().toISOString().slice(0, 7);

    const { data } = await this.supabase
      .from('usage_aggregates')
      .select('*')
      .eq('user_id', userId)
      .eq('plugin_id', pluginId)
      .eq('period', targetPeriod)
      .single();

    return data || {
      issues: 0,
      tokens: 0,
      agent_executions: {}
    };
  }

  /**
   * Update monthly usage aggregates
   */
  private async updateMonthlyUsage(
    userId: string,
    pluginId: string,
    period: string,
    metric: 'issues' | 'tokens',
    increment: number
  ): Promise<void> {
    await this.supabase.rpc('increment_usage', {
      p_user_id: userId,
      p_plugin_id: pluginId,
      p_period: period,
      p_metric: metric,
      p_increment: increment
    });
  }

  /**
   * Generate usage report for a month
   */
  async generateUsageReport(
    userId: string,
    pluginId: string,
    month: string
  ) {
    const startDate = `${month}-01`;
    const endDate = new Date(month + '-01');
    endDate.setMonth(endDate.getMonth() + 1);

    const { data: events } = await this.supabase
      .from('usage_events')
      .select('*')
      .eq('user_id', userId)
      .eq('plugin_id', pluginId)
      .gte('created_at', startDate)
      .lt('created_at', endDate.toISOString().slice(0, 10));

    if (!events) {
      return {
        total_issues: 0,
        total_tokens: 0,
        agents_breakdown: {},
        commands_breakdown: {},
        daily_usage: {}
      };
    }

    const summary = {
      total_issues: events.filter(e => e.event_type === 'issue_processed').length,
      total_tokens: events.reduce(
        (sum, e) => sum + (e.event_data.tokensConsumed || 0),
        0
      ),
      agents_breakdown: this.aggregateAgents(events),
      commands_breakdown: this.aggregateCommands(events),
      daily_usage: this.aggregateDaily(events)
    };

    return summary;
  }

  /**
   * Get usage projections for current month
   */
  async getUsageProjections(
    userId: string,
    pluginId: string
  ): Promise<{
    estimated_monthly_issues: number;
    estimated_monthly_tokens: number;
  }> {
    const now = new Date();
    const period = now.toISOString().slice(0, 7);
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const usage = await this.getMonthlyUsage(userId, pluginId, period);

    // Linear projection based on current usage
    const projectionFactor = daysInMonth / dayOfMonth;

    return {
      estimated_monthly_issues: Math.round(usage.issues * projectionFactor),
      estimated_monthly_tokens: Math.round(usage.tokens * projectionFactor)
    };
  }

  /**
   * Aggregate agent usage
   */
  private aggregateAgents(events: any[]): Record<string, number> {
    const agentCounts: Record<string, number> = {};

    events.forEach(event => {
      if (event.event_type === 'agent_executed') {
        const agentName = event.event_data.agent_name;
        agentCounts[agentName] = (agentCounts[agentName] || 0) + 1;
      } else if (event.event_type === 'issue_processed') {
        event.event_data.agentsUsed?.forEach((agent: string) => {
          agentCounts[agent] = (agentCounts[agent] || 0) + 1;
        });
      }
    });

    return agentCounts;
  }

  /**
   * Aggregate command usage
   */
  private aggregateCommands(events: any[]): Record<string, number> {
    const commandCounts: Record<string, number> = {};

    events
      .filter(e => e.event_type === 'command_used')
      .forEach(event => {
        const command = event.event_data.command;
        commandCounts[command] = (commandCounts[command] || 0) + 1;
      });

    return commandCounts;
  }

  /**
   * Aggregate daily usage
   */
  private aggregateDaily(events: any[]): Record<string, number> {
    const dailyCounts: Record<string, number> = {};

    events.forEach(event => {
      const date = new Date(event.created_at).toISOString().slice(0, 10);
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    });

    return dailyCounts;
  }

  /**
   * Check if approaching quota limit
   */
  async checkQuotaWarning(
    userId: string,
    pluginId: string,
    license: LicensePayload
  ): Promise<{
    warning: boolean;
    message?: string;
    remaining?: number;
  }> {
    const { monthly_issues } = license.limitations;

    if (monthly_issues === -1) {
      return { warning: false };
    }

    const usage = await this.getMonthlyUsage(userId, pluginId);
    const remaining = monthly_issues - usage.issues;
    const percentUsed = (usage.issues / monthly_issues) * 100;

    // Warn at 80% usage
    if (percentUsed >= 80) {
      return {
        warning: true,
        message: `You've used ${usage.issues}/${monthly_issues} Issues this month (${Math.round(percentUsed)}%). Consider upgrading to Pro for unlimited Issues.`,
        remaining
      };
    }

    return { warning: false, remaining };
  }
}
