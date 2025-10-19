#!/usr/bin/env tsx
/**
 * CI/CD Integration - Continuous Integration and Deployment Management
 *
 * Features:
 * - GitHub Actions workflow management
 * - Automated deployment triggers
 * - Build status monitoring
 * - Deployment rollback capabilities
 * - Integration with Firebase/Cloud platforms
 *
 * Phase F: Issue #5 - CI/CD Pipeline Integration
 */

import { Octokit } from '@octokit/rest';

export interface CICDConfig {
  owner: string;
  repo: string;
  githubToken: string;
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface DeploymentStatus {
  environment: string;
  state: 'success' | 'failure' | 'pending' | 'in_progress';
  target_url?: string;
  description?: string;
}

/**
 * CI/CD Integration Manager
 */
export class CICDIntegration {
  private octokit: Octokit;
  private config: CICDConfig;

  constructor(token: string, owner: string, repo: string) {
    this.config = {
      githubToken: token,
      owner,
      repo,
    };
    this.octokit = new Octokit({ auth: token });
  }

  // ============================================================================
  // Workflow Management
  // ============================================================================

  /**
   * List all workflow runs
   */
  async listWorkflowRuns(limit: number = 10): Promise<WorkflowRun[]> {
    try {
      const { data } = await this.octokit.rest.actions.listWorkflowRunsForRepo({
        owner: this.config.owner,
        repo: this.config.repo,
        per_page: limit,
      });

      return data.workflow_runs.map((run) => ({
        id: run.id,
        name: run.name || 'Unknown',
        status: run.status || 'unknown',
        conclusion: run.conclusion,
        html_url: run.html_url,
        created_at: run.created_at,
        updated_at: run.updated_at,
      }));
    } catch (error) {
      console.error('[CICDIntegration] Failed to list workflow runs:', error);
      return [];
    }
  }

  /**
   * Trigger a workflow dispatch event
   */
  async triggerWorkflow(workflowId: string, ref: string = 'main', inputs?: Record<string, any>): Promise<boolean> {
    try {
      await this.octokit.rest.actions.createWorkflowDispatch({
        owner: this.config.owner,
        repo: this.config.repo,
        workflow_id: workflowId,
        ref,
        inputs,
      });

      console.log(`[CICDIntegration] Triggered workflow: ${workflowId}`);
      return true;
    } catch (error) {
      console.error(`[CICDIntegration] Failed to trigger workflow ${workflowId}:`, error);
      return false;
    }
  }

  /**
   * Get workflow run status
   */
  async getWorkflowRunStatus(runId: number): Promise<WorkflowRun | null> {
    try {
      const { data } = await this.octokit.rest.actions.getWorkflowRun({
        owner: this.config.owner,
        repo: this.config.repo,
        run_id: runId,
      });

      return {
        id: data.id,
        name: data.name || 'Unknown',
        status: data.status || 'unknown',
        conclusion: data.conclusion,
        html_url: data.html_url,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (error) {
      console.error(`[CICDIntegration] Failed to get workflow run ${runId}:`, error);
      return null;
    }
  }

  /**
   * Cancel a workflow run
   */
  async cancelWorkflowRun(runId: number): Promise<boolean> {
    try {
      await this.octokit.rest.actions.cancelWorkflowRun({
        owner: this.config.owner,
        repo: this.config.repo,
        run_id: runId,
      });

      console.log(`[CICDIntegration] Cancelled workflow run: ${runId}`);
      return true;
    } catch (error) {
      console.error(`[CICDIntegration] Failed to cancel workflow run ${runId}:`, error);
      return false;
    }
  }

  // ============================================================================
  // Deployment Management
  // ============================================================================

  /**
   * Create a deployment
   */
  async createDeployment(
    ref: string,
    environment: string,
    description?: string
  ): Promise<number | null> {
    try {
      const { data } = await this.octokit.rest.repos.createDeployment({
        owner: this.config.owner,
        repo: this.config.repo,
        ref,
        environment,
        description,
        auto_merge: false,
        required_contexts: [],
      });

      if ('id' in data && typeof data.id === 'number') {
        console.log(`[CICDIntegration] Created deployment: ${data.id}`);
        return data.id;
      }

      console.error('[CICDIntegration] Unexpected response creating deployment:', data);
      return null;
    } catch (error) {
      console.error('[CICDIntegration] Failed to create deployment:', error);
      return null;
    }
  }

  /**
   * Update deployment status
   */
  async updateDeploymentStatus(
    deploymentId: number,
    state: 'success' | 'failure' | 'pending' | 'in_progress',
    targetUrl?: string,
    description?: string
  ): Promise<boolean> {
    try {
      await this.octokit.rest.repos.createDeploymentStatus({
        owner: this.config.owner,
        repo: this.config.repo,
        deployment_id: deploymentId,
        state,
        target_url: targetUrl,
        description,
      });

      console.log(`[CICDIntegration] Updated deployment ${deploymentId} status: ${state}`);
      return true;
    } catch (error) {
      console.error(`[CICDIntegration] Failed to update deployment status:`, error);
      return false;
    }
  }

  /**
   * List deployments
   */
  async listDeployments(environment?: string, limit: number = 10): Promise<any[]> {
    try {
      const { data } = await this.octokit.rest.repos.listDeployments({
        owner: this.config.owner,
        repo: this.config.repo,
        environment,
        per_page: limit,
      });

      return data;
    } catch (error) {
      console.error('[CICDIntegration] Failed to list deployments:', error);
      return [];
    }
  }

  // ============================================================================
  // Build Status
  // ============================================================================

  /**
   * Get commit status
   */
  async getCommitStatus(ref: string): Promise<any> {
    try {
      const { data } = await this.octokit.rest.repos.getCombinedStatusForRef({
        owner: this.config.owner,
        repo: this.config.repo,
        ref,
      });

      return {
        state: data.state,
        total_count: data.total_count,
        statuses: data.statuses,
      };
    } catch (error) {
      console.error(`[CICDIntegration] Failed to get commit status for ${ref}:`, error);
      return null;
    }
  }

  /**
   * Create a commit status
   */
  async createCommitStatus(
    sha: string,
    state: 'success' | 'failure' | 'pending' | 'error',
    context: string,
    description?: string,
    targetUrl?: string
  ): Promise<boolean> {
    try {
      await this.octokit.rest.repos.createCommitStatus({
        owner: this.config.owner,
        repo: this.config.repo,
        sha,
        state,
        context,
        description,
        target_url: targetUrl,
      });

      console.log(`[CICDIntegration] Created commit status: ${context} - ${state}`);
      return true;
    } catch (error) {
      console.error('[CICDIntegration] Failed to create commit status:', error);
      return false;
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Wait for workflow run to complete
   */
  async waitForWorkflowCompletion(runId: number, timeoutMs: number = 300000): Promise<WorkflowRun | null> {
    const startTime = Date.now();
    const pollIntervalMs = 5000; // 5 seconds

    while (Date.now() - startTime < timeoutMs) {
      const run = await this.getWorkflowRunStatus(runId);

      if (!run) {
        return null;
      }

      if (run.status === 'completed') {
        return run;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    console.error(`[CICDIntegration] Workflow run ${runId} timed out`);
    return null;
  }

  /**
   * Get latest successful deployment
   */
  async getLatestSuccessfulDeployment(environment: string): Promise<any | null> {
    try {
      const deployments = await this.listDeployments(environment, 50);

      for (const deployment of deployments) {
        const { data: statuses } = await this.octokit.rest.repos.listDeploymentStatuses({
          owner: this.config.owner,
          repo: this.config.repo,
          deployment_id: deployment.id,
        });

        const successStatus = statuses.find((s) => s.state === 'success');
        if (successStatus) {
          return deployment;
        }
      }

      return null;
    } catch (error) {
      console.error('[CICDIntegration] Failed to get latest successful deployment:', error);
      return null;
    }
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  const token = process.env.GITHUB_TOKEN || '';
  const owner = process.env.GITHUB_OWNER || 'ShunsukeHayashi';
  const repo = process.env.GITHUB_REPO || 'Autonomous-Operations';

  if (!token) {
    console.error('❌ GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  const cicd = new CICDIntegration(token, owner, repo);

  switch (command) {
    case 'status':
      const runs = await cicd.listWorkflowRuns(10);
      console.log('Recent workflow runs:');
      runs.forEach((run) => {
        console.log(`  - ${run.name}: ${run.status} (${run.conclusion || 'pending'})`);
      });
      break;

    case 'trigger':
      const workflowId = args[1];
      if (!workflowId) {
        console.error('❌ Workflow ID required');
        process.exit(1);
      }
      await cicd.triggerWorkflow(workflowId);
      break;

    case 'deployments':
      const deployments = await cicd.listDeployments(args[1], 10);
      console.log('Recent deployments:');
      deployments.forEach((d) => {
        console.log(`  - ${d.environment}: ${d.ref} (${d.created_at})`);
      });
      break;

    default:
      console.log(`
Usage: tsx scripts/cicd-integration.ts [command]

Commands:
  status              Show recent workflow runs
  trigger <id>        Trigger a workflow
  deployments [env]   List deployments

Environment Variables:
  GITHUB_TOKEN        GitHub Personal Access Token (required)
  GITHUB_OWNER        GitHub repository owner (default: ShunsukeHayashi)
  GITHUB_REPO         GitHub repository name (default: Autonomous-Operations)
`);
      break;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}
