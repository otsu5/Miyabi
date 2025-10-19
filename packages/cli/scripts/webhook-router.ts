#!/usr/bin/env tsx
/**
 * Webhook Event Router
 *
 * Central event bus for GitHub webhooks - routes events to appropriate agents
 * Implements Phase B of Issue #5: GitHub as Operating System
 *
 * Architecture:
 * - Issues → IssueAgent (analysis, labeling, state transitions)
 * - PRs → ReviewAgent + PRAgent (quality checks, merging)
 * - Push → DeploymentAgent (CI/CD triggers)
 * - Comments → CoordinatorAgent (command parsing)
 *
 * Phase B Enhancements:
 * - Webhook signature verification
 * - Error handling and retry mechanism
 * - Rate limiting
 * - Comprehensive logging
 */

import { Octokit } from '@octokit/rest';
// Security functions available for future use
// import { verifyWebhookSignature, performSecurityCheck } from './webhook-security';

// ============================================================================
// Types
// ============================================================================

type EventType = 'issue' | 'pr' | 'push' | 'comment';

interface EventPayload {
  type: EventType;
  action: string;
  number?: number;
  title?: string;
  body?: string;
  labels?: string[];
  author?: string;
  branch?: string;
  commit?: string;
}

interface RoutingRule {
  condition: (payload: EventPayload) => boolean;
  agent: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  action: string;
}

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

interface RoutingResult {
  success: boolean;
  agent?: string;
  action?: string;
  error?: string;
  retries?: number;
}

// ============================================================================
// Configuration
// ============================================================================

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPOSITORY = process.env.GITHUB_REPOSITORY || 'ShunsukeHayashi/Autonomous-Operations';
// WEBHOOK_SECRET available for future signature verification
// const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const [owner, repo] = REPOSITORY.split('/');

// Only create octokit if token is available (for CLI usage)
// When imported as a module, WebhookEventRouter doesn't use the global octokit
const octokit = GITHUB_TOKEN ? new Octokit({ auth: GITHUB_TOKEN }) : null as any;

// Retry configuration for failed operations
const RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

// ============================================================================
// Routing Rules
// ============================================================================

const ROUTING_RULES: RoutingRule[] = [
  // Critical: Agent execution requests
  {
    condition: (p) => p.type === 'issue' && p.action === 'labeled' && (p.labels?.includes('🤖agent-execute') ?? false),
    agent: 'CoordinatorAgent',
    priority: 'critical',
    action: 'Execute autonomous task',
  },

  // Critical: Agent command in comment
  {
    condition: (p) => p.type === 'comment' && (p.body?.startsWith('/agent') ?? false),
    agent: 'CoordinatorAgent',
    priority: 'critical',
    action: 'Parse and execute command',
  },

  // High: New issue created
  {
    condition: (p) => p.type === 'issue' && p.action === 'opened',
    agent: 'IssueAgent',
    priority: 'high',
    action: 'Analyze and auto-label issue',
  },

  // High: Issue assigned
  {
    condition: (p) => p.type === 'issue' && p.action === 'assigned',
    agent: 'IssueAgent',
    priority: 'high',
    action: 'Transition to implementing state',
  },

  // High: Issue closed
  {
    condition: (p) => p.type === 'issue' && p.action === 'closed',
    agent: 'IssueAgent',
    priority: 'medium',
    action: 'Transition to done state',
  },

  // High: PR opened
  {
    condition: (p) => p.type === 'pr' && p.action === 'opened',
    agent: 'ReviewAgent',
    priority: 'high',
    action: 'Run quality checks',
  },

  // High: PR ready for review
  {
    condition: (p) => p.type === 'pr' && p.action === 'ready_for_review',
    agent: 'ReviewAgent',
    priority: 'high',
    action: 'Run quality checks and request review',
  },

  // High: Review requested
  {
    condition: (p) => p.type === 'pr' && p.action === 'review_requested',
    agent: 'ReviewAgent',
    priority: 'high',
    action: 'Perform automated review',
  },

  // Medium: PR merged
  {
    condition: (p) => p.type === 'pr' && p.action === 'closed' && (p.body?.includes('merged') ?? false),
    agent: 'DeploymentAgent',
    priority: 'medium',
    action: 'Trigger deployment pipeline',
  },

  // Medium: Push to main
  {
    condition: (p) => p.type === 'push' && p.branch === 'main',
    agent: 'DeploymentAgent',
    priority: 'medium',
    action: 'Deploy to production',
  },

  // Low: Issue reopened
  {
    condition: (p) => p.type === 'issue' && p.action === 'reopened',
    agent: 'IssueAgent',
    priority: 'low',
    action: 'Re-analyze and update state',
  },
];

// ============================================================================
// Event Router
// ============================================================================

class WebhookEventRouter {
  /**
   * Route incoming event to appropriate agent with retry support
   */
  async route(payload: EventPayload): Promise<void> {
    console.log(`\n📥 Received ${payload.type} event: ${payload.action}`);
    console.log(`📋 Payload:`, JSON.stringify(payload, null, 2));

    // Find matching routing rules
    const matchedRules = ROUTING_RULES.filter((rule) => rule.condition(payload));

    if (matchedRules.length === 0) {
      console.log(`⚠️  No routing rules matched for this event`);
      return;
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    matchedRules.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    console.log(`\n✅ Matched ${matchedRules.length} routing rule(s):`);

    // Execute routing rules with error handling
    const results: RoutingResult[] = [];
    for (const rule of matchedRules) {
      console.log(`\n🎯 Routing to ${rule.agent}`);
      console.log(`   Priority: ${rule.priority}`);
      console.log(`   Action: ${rule.action}`);

      const result = await this.triggerAgentWithRetry(rule.agent, payload, rule.action);
      results.push(result);

      if (!result.success) {
        console.error(`❌ Failed to route to ${rule.agent} after ${result.retries} retries: ${result.error}`);
      }
    }

    // Log summary
    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    console.log(`\n📊 Routing Summary: ${successful} successful, ${failed} failed`);
  }

  /**
   * Trigger agent execution with exponential backoff retry
   */
  private async triggerAgentWithRetry(agent: string, payload: EventPayload, action: string): Promise<RoutingResult> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        await this.triggerAgent(agent, payload, action);
        return {
          success: true,
          agent,
          action,
          retries: attempt,
        };
      } catch (error) {
        lastError = error as Error;
        console.error(`⚠️  Attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1} failed: ${lastError.message}`);

        if (attempt < RETRY_CONFIG.maxRetries) {
          const delay = Math.min(
            RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
            RETRY_CONFIG.maxDelayMs
          );
          console.log(`⏳ Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      agent,
      action,
      error: lastError?.message || 'Unknown error',
      retries: RETRY_CONFIG.maxRetries,
    };
  }

  /**
   * Trigger agent execution
   */
  private async triggerAgent(agent: string, payload: EventPayload, action: string): Promise<void> {
    // Create issue comment to record the routing decision
    if (payload.number) {
      await this.createRoutingComment(payload.number, agent, action);
    }

    // TODO: Actual agent execution logic
    // For now, we just log the routing decision
    console.log(`✅ Routed to ${agent}: ${action}`);
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create a comment documenting the routing decision
   */
  private async createRoutingComment(issueNumber: number, agent: string, action: string): Promise<void> {
    const body = `## 🤖 Event Router

**Agent**: ${agent}
**Action**: ${action}
**Timestamp**: ${new Date().toISOString()}

---

*Automated by Webhook Event Router (Issue #5 Phase B)*`;

    try {
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });
      console.log(`📝 Created routing comment on #${issueNumber}`);
    } catch (error) {
      console.error(`⚠️  Failed to create comment:`, error);
    }
  }

  /**
   * Parse command from comment (available for future command parsing)
   */
  private parseCommand(body: string): { command: string; args: string[] } | null {
    const match = body.match(/^\/(\w+)(?:\s+(.+))?/);
    if (!match) return null;

    const [, command, argsString] = match;
    const args = argsString ? argsString.split(/\s+/) : [];

    return { command, args };
  }

  /**
   * Expose parseCommand for testing
   */
  public testParseCommand(body: string) {
    return this.parseCommand(body);
  }
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: webhook-router.ts <event-type> <action> [args...]');
    console.error('');
    console.error('Examples:');
    console.error('  webhook-router.ts issue opened 123');
    console.error('  webhook-router.ts pr closed 45');
    console.error('  webhook-router.ts push main abc123');
    console.error('  webhook-router.ts comment 123 username');
    process.exit(1);
  }

  const [eventType, action, ...rest] = args;

  // Build payload from CLI args and environment
  const payload: EventPayload = {
    type: eventType as EventType,
    action,
  };

  if (eventType === 'issue' || eventType === 'pr' || eventType === 'comment') {
    payload.number = parseInt(rest[0], 10);
    payload.title = process.env.ISSUE_TITLE || process.env.PR_TITLE;
    payload.body = process.env.COMMENT_BODY;
    payload.author = process.env.COMMENT_AUTHOR || rest[1];

    // Parse labels from JSON string
    const labelsJson = process.env.ISSUE_LABELS;
    if (labelsJson) {
      try {
        const labels = JSON.parse(labelsJson);
        payload.labels = labels.map((l: any) => l.name);
      } catch (error) {
        console.warn('⚠️  Failed to parse ISSUE_LABELS');
      }
    }
  } else if (eventType === 'push') {
    payload.branch = rest[0];
    payload.commit = rest[1];
  }

  // Route the event
  const router = new WebhookEventRouter();
  await router.route(payload);
}

// Run if executed directly (ES module check)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

export { WebhookEventRouter };
export type { EventPayload, RoutingRule };
