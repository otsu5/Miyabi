/**
 * WorktreeManager - Git Worktree Lifecycle Management
 *
 * Automates worktree creation, monitoring, and cleanup for parallel issue execution.
 * Integrates with CoordinatorAgent and WaterSpiderAgent.
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
/**
 * WorktreeManager - Manages Git Worktrees for parallel execution
 */
export class WorktreeManager {
    config;
    activeWorktrees;
    constructor(config) {
        this.config = {
            mainBranch: 'main',
            branchPrefix: 'issue-',
            autoCleanup: true,
            maxIdleTime: 3600000, // 1 hour default
            enableLogging: true,
            ...config,
        };
        this.activeWorktrees = new Map();
        // Create base directory if not exists
        if (!fs.existsSync(this.config.basePath)) {
            fs.mkdirSync(this.config.basePath, { recursive: true });
            this.log(`📁 Created worktree base directory: ${this.config.basePath}`);
        }
        // Discover existing worktrees
        this.discoverWorktrees();
    }
    /**
     * Create a new worktree for an issue
     *
     * @param issue - GitHub Issue to create worktree for
     * @param options - Optional configuration including agent assignment
     * @returns WorktreeInfo with all metadata
     */
    async createWorktree(issue, options) {
        const issueNumber = issue.number;
        // Check if worktree already exists
        if (this.activeWorktrees.has(issueNumber)) {
            const existing = this.activeWorktrees.get(issueNumber);
            this.log(`⚠️  Worktree already exists for issue #${issueNumber}: ${existing.path}`);
            return existing;
        }
        const branchName = `${this.config.branchPrefix}${issueNumber}`;
        const worktreePath = path.join(this.config.basePath, `issue-${issueNumber}`);
        try {
            // Check if branch exists remotely
            const remoteBranchExists = this.checkRemoteBranch(branchName);
            if (remoteBranchExists) {
                // Branch exists, checkout from remote
                this.log(`🔄 Checking out existing branch: ${branchName}`);
                execSync(`git worktree add ${worktreePath} ${branchName}`, {
                    cwd: this.config.repoRoot,
                    stdio: 'inherit',
                });
            }
            else {
                // Create new branch
                this.log(`🌿 Creating new branch: ${branchName}`);
                execSync(`git worktree add -b ${branchName} ${worktreePath} ${this.config.mainBranch}`, {
                    cwd: this.config.repoRoot,
                    stdio: 'inherit',
                });
            }
            const worktreeInfo = {
                issueNumber,
                path: worktreePath,
                branch: branchName,
                status: 'active',
                createdAt: new Date().toISOString(),
                lastActivityAt: new Date().toISOString(),
                sessionId: `worktree-${issueNumber}-${Date.now()}`,
                // Agent assignment
                agentType: options?.agentType,
                agentStatus: options?.agentType ? 'idle' : undefined,
                // Execution context
                executionContext: options?.executionContext,
            };
            this.activeWorktrees.set(issueNumber, worktreeInfo);
            // Log agent assignment if provided
            if (options?.agentType) {
                this.log(`🤖 Assigned ${options.agentType} to worktree for issue #${issueNumber}`);
            }
            this.log(`✅ Created worktree for issue #${issueNumber}: ${worktreePath}`);
            return worktreeInfo;
        }
        catch (error) {
            this.log(`❌ Failed to create worktree for issue #${issueNumber}: ${error.message}`);
            throw new Error(`Failed to create worktree: ${error.message}`);
        }
    }
    /**
     * Remove a worktree
     */
    async removeWorktree(issueNumber) {
        const worktreeInfo = this.activeWorktrees.get(issueNumber);
        if (!worktreeInfo) {
            this.log(`⚠️  No worktree found for issue #${issueNumber}`);
            return;
        }
        try {
            // Check if worktree has uncommitted changes
            const hasChanges = this.hasUncommittedChanges(worktreeInfo.path);
            if (hasChanges) {
                this.log(`⚠️  Worktree has uncommitted changes: ${worktreeInfo.path}`);
                // Commit or stash changes before removal
                this.commitChanges(worktreeInfo.path, `chore: auto-commit before worktree cleanup for issue #${issueNumber}`);
            }
            // Remove worktree
            execSync(`git worktree remove ${worktreeInfo.path} --force`, {
                cwd: this.config.repoRoot,
                stdio: 'inherit',
            });
            this.activeWorktrees.delete(issueNumber);
            this.log(`✅ Removed worktree for issue #${issueNumber}`);
        }
        catch (error) {
            this.log(`❌ Failed to remove worktree for issue #${issueNumber}: ${error.message}`);
            throw new Error(`Failed to remove worktree: ${error.message}`);
        }
    }
    /**
     * Cleanup all worktrees
     */
    async cleanupAll() {
        this.log('🧹 Cleaning up all worktrees...');
        const issues = Array.from(this.activeWorktrees.keys());
        for (const issueNumber of issues) {
            try {
                await this.removeWorktree(issueNumber);
            }
            catch (error) {
                this.log(`⚠️  Failed to cleanup worktree for issue #${issueNumber}: ${error.message}`);
            }
        }
        // Prune stale worktrees
        try {
            execSync('git worktree prune', {
                cwd: this.config.repoRoot,
                stdio: 'inherit',
            });
            this.log('✅ Pruned stale worktrees');
        }
        catch (error) {
            this.log(`⚠️  Failed to prune worktrees: ${error.message}`);
        }
    }
    /**
     * Discover existing worktrees
     */
    discoverWorktrees() {
        try {
            const output = execSync('git worktree list --porcelain', {
                cwd: this.config.repoRoot,
                encoding: 'utf-8',
            });
            const lines = output.split('\n');
            let currentWorktree = {};
            for (const line of lines) {
                if (line.startsWith('worktree ')) {
                    const worktreePath = line.replace('worktree ', '');
                    // Check if this is an issue worktree
                    const match = worktreePath.match(/issue-(\d+)/);
                    if (match) {
                        currentWorktree.path = worktreePath;
                        currentWorktree.issueNumber = parseInt(match[1], 10);
                    }
                }
                else if (line.startsWith('branch ')) {
                    currentWorktree.branch = line.replace('branch ', '').replace('refs/heads/', '');
                }
                else if (line === '') {
                    // End of worktree entry
                    if (currentWorktree.issueNumber && currentWorktree.path && currentWorktree.branch) {
                        const worktreeInfo = {
                            issueNumber: currentWorktree.issueNumber,
                            path: currentWorktree.path,
                            branch: currentWorktree.branch,
                            status: 'active',
                            createdAt: new Date().toISOString(),
                            lastActivityAt: new Date().toISOString(),
                            sessionId: `discovered-${currentWorktree.issueNumber}-${Date.now()}`,
                        };
                        this.activeWorktrees.set(currentWorktree.issueNumber, worktreeInfo);
                        this.log(`🔍 Discovered worktree: ${currentWorktree.path}`);
                    }
                    currentWorktree = {};
                }
            }
            this.log(`📊 Discovered ${this.activeWorktrees.size} existing worktrees`);
        }
        catch (error) {
            this.log(`⚠️  Failed to discover worktrees: ${error.message}`);
        }
    }
    /**
     * Check if a remote branch exists
     */
    checkRemoteBranch(branchName) {
        try {
            execSync(`git ls-remote --heads origin ${branchName}`, {
                cwd: this.config.repoRoot,
                encoding: 'utf-8',
            });
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Check if worktree has uncommitted changes
     */
    hasUncommittedChanges(worktreePath) {
        try {
            const output = execSync('git status --porcelain', {
                cwd: worktreePath,
                encoding: 'utf-8',
            });
            return output.trim().length > 0;
        }
        catch {
            return false;
        }
    }
    /**
     * Commit changes in worktree
     */
    commitChanges(worktreePath, message) {
        try {
            execSync('git add .', { cwd: worktreePath, stdio: 'ignore' });
            execSync(`git commit -m "${message}"`, { cwd: worktreePath, stdio: 'ignore' });
            this.log(`✅ Committed changes in worktree: ${worktreePath}`);
        }
        catch (error) {
            this.log(`⚠️  Failed to commit changes: ${error.message}`);
        }
    }
    /**
     * Get worktree info by issue number
     */
    getWorktree(issueNumber) {
        return this.activeWorktrees.get(issueNumber);
    }
    /**
     * Get all active worktrees
     */
    getAllWorktrees() {
        return Array.from(this.activeWorktrees.values());
    }
    /**
     * Update worktree status
     */
    updateWorktreeStatus(issueNumber, status) {
        const worktree = this.activeWorktrees.get(issueNumber);
        if (worktree) {
            worktree.status = status;
            worktree.lastActivityAt = new Date().toISOString();
            this.activeWorktrees.set(issueNumber, worktree);
            this.log(`📊 Updated worktree status for issue #${issueNumber}: ${status}`);
        }
    }
    /**
     * Update agent execution status
     *
     * @param issueNumber - Issue number
     * @param agentStatus - New agent status
     */
    updateAgentStatus(issueNumber, agentStatus) {
        const worktree = this.activeWorktrees.get(issueNumber);
        if (worktree) {
            worktree.agentStatus = agentStatus;
            worktree.lastActivityAt = new Date().toISOString();
            this.activeWorktrees.set(issueNumber, worktree);
            this.log(`🤖 Updated agent status for issue #${issueNumber}: ${agentStatus}`);
        }
    }
    /**
     * Set execution context for a worktree
     *
     * @param issueNumber - Issue number
     * @param context - Execution context
     */
    setExecutionContext(issueNumber, context) {
        const worktree = this.activeWorktrees.get(issueNumber);
        if (worktree) {
            worktree.executionContext = context;
            worktree.lastActivityAt = new Date().toISOString();
            this.activeWorktrees.set(issueNumber, worktree);
            this.log(`📋 Set execution context for issue #${issueNumber}`);
        }
    }
    /**
     * Get all worktrees assigned to a specific agent type
     *
     * @param agentType - Agent type to filter by
     * @returns Array of worktrees assigned to this agent
     */
    getWorktreesByAgent(agentType) {
        return this.getAllWorktrees().filter((w) => w.agentType === agentType);
    }
    /**
     * Get all worktrees with a specific agent status
     *
     * @param agentStatus - Agent status to filter by
     * @returns Array of worktrees with this agent status
     */
    getWorktreesByAgentStatus(agentStatus) {
        return this.getAllWorktrees().filter((w) => w.agentStatus === agentStatus);
    }
    /**
     * Get worktree statistics including agent information
     */
    getAgentStatistics() {
        const worktrees = this.getAllWorktrees();
        const byAgent = {};
        const byAgentStatus = {};
        let totalWithAgent = 0;
        let totalWithoutAgent = 0;
        for (const worktree of worktrees) {
            if (worktree.agentType) {
                byAgent[worktree.agentType] = (byAgent[worktree.agentType] || 0) + 1;
                totalWithAgent++;
            }
            else {
                totalWithoutAgent++;
            }
            if (worktree.agentStatus) {
                byAgentStatus[worktree.agentStatus] =
                    (byAgentStatus[worktree.agentStatus] || 0) + 1;
            }
        }
        return {
            byAgent,
            byAgentStatus,
            totalWithAgent,
            totalWithoutAgent,
        };
    }
    /**
     * Check for idle worktrees and cleanup if needed
     */
    async cleanupIdleWorktrees() {
        const now = Date.now();
        const maxIdleTime = this.config.maxIdleTime;
        for (const [issueNumber, worktree] of this.activeWorktrees.entries()) {
            const lastActivity = new Date(worktree.lastActivityAt).getTime();
            const idleTime = now - lastActivity;
            if (idleTime > maxIdleTime && worktree.status === 'idle') {
                this.log(`⏱️  Worktree idle for ${Math.round(idleTime / 1000)}s, cleaning up: issue #${issueNumber}`);
                try {
                    await this.removeWorktree(issueNumber);
                }
                catch (error) {
                    this.log(`⚠️  Failed to cleanup idle worktree: ${error.message}`);
                }
            }
        }
    }
    /**
     * Push worktree branch to remote
     */
    async pushWorktree(issueNumber) {
        const worktree = this.activeWorktrees.get(issueNumber);
        if (!worktree) {
            throw new Error(`No worktree found for issue #${issueNumber}`);
        }
        try {
            execSync(`git push -u origin ${worktree.branch}`, {
                cwd: worktree.path,
                stdio: 'inherit',
            });
            this.log(`✅ Pushed worktree branch to remote: ${worktree.branch}`);
        }
        catch (error) {
            this.log(`❌ Failed to push worktree: ${error.message}`);
            throw new Error(`Failed to push worktree: ${error.message}`);
        }
    }
    /**
     * Merge worktree back to main branch
     */
    async mergeWorktree(issueNumber) {
        const worktree = this.activeWorktrees.get(issueNumber);
        if (!worktree) {
            throw new Error(`No worktree found for issue #${issueNumber}`);
        }
        try {
            // Switch to main branch
            execSync(`git checkout ${this.config.mainBranch}`, {
                cwd: this.config.repoRoot,
                stdio: 'inherit',
            });
            // Merge worktree branch
            execSync(`git merge ${worktree.branch}`, {
                cwd: this.config.repoRoot,
                stdio: 'inherit',
            });
            this.log(`✅ Merged worktree branch to ${this.config.mainBranch}: ${worktree.branch}`);
            // Cleanup worktree
            if (this.config.autoCleanup) {
                await this.removeWorktree(issueNumber);
            }
        }
        catch (error) {
            this.log(`❌ Failed to merge worktree: ${error.message}`);
            throw new Error(`Failed to merge worktree: ${error.message}`);
        }
    }
    /**
     * Get worktree statistics
     */
    getStatistics() {
        const worktrees = this.getAllWorktrees();
        return {
            total: worktrees.length,
            active: worktrees.filter((w) => w.status === 'active').length,
            idle: worktrees.filter((w) => w.status === 'idle').length,
            completed: worktrees.filter((w) => w.status === 'completed').length,
            failed: worktrees.filter((w) => w.status === 'failed').length,
            cleanup: worktrees.filter((w) => w.status === 'cleanup').length,
        };
    }
    /**
     * Write execution context files to worktree
     *
     * Creates:
     * - .agent-context.json: Machine-readable context
     * - EXECUTION_CONTEXT.md: Human-readable context
     *
     * @param issueNumber - Issue number
     */
    async writeExecutionContext(issueNumber) {
        const worktree = this.activeWorktrees.get(issueNumber);
        if (!worktree || !worktree.executionContext) {
            this.log(`⚠️  No execution context found for issue #${issueNumber}`);
            return;
        }
        const { executionContext } = worktree;
        try {
            // Write JSON context file
            const jsonPath = path.join(worktree.path, '.agent-context.json');
            const jsonContent = JSON.stringify({
                agentType: worktree.agentType,
                agentStatus: worktree.agentStatus,
                task: executionContext.task,
                issue: executionContext.issue,
                config: {
                    deviceIdentifier: executionContext.config.deviceIdentifier,
                    useWorktree: executionContext.config.useWorktree,
                    worktreeBasePath: executionContext.config.worktreeBasePath,
                    logDirectory: executionContext.config.logDirectory,
                    reportDirectory: executionContext.config.reportDirectory,
                },
                promptPath: executionContext.promptPath,
                metadata: executionContext.metadata,
                worktreeInfo: {
                    path: worktree.path,
                    branch: worktree.branch,
                    sessionId: worktree.sessionId,
                    createdAt: worktree.createdAt,
                },
            }, null, 2);
            fs.writeFileSync(jsonPath, jsonContent, 'utf-8');
            this.log(`📄 Wrote .agent-context.json to ${jsonPath}`);
            // Write Markdown context file
            const mdPath = path.join(worktree.path, 'EXECUTION_CONTEXT.md');
            const mdContent = this.generateContextMarkdown(worktree, executionContext);
            fs.writeFileSync(mdPath, mdContent, 'utf-8');
            this.log(`📄 Wrote EXECUTION_CONTEXT.md to ${mdPath}`);
        }
        catch (error) {
            this.log(`❌ Failed to write execution context: ${error.message}`);
            throw new Error(`Failed to write execution context: ${error.message}`);
        }
    }
    /**
     * Generate human-readable Markdown context
     */
    generateContextMarkdown(worktree, context) {
        return `# Agent Execution Context

## Issue Information

- **Number**: #${context.issue.number}
- **Title**: ${context.issue.title}
- **URL**: ${context.issue.url}
- **State**: ${context.issue.state}
- **Labels**: ${context.issue.labels.join(', ') || 'None'}

## Task Information

- **ID**: ${context.task.id}
- **Title**: ${context.task.title}
- **Type**: ${context.task.type}
- **Priority**: ${context.task.priority}
- **Assigned Agent**: ${context.task.assignedAgent || 'Not assigned'}
- **Status**: ${context.task.status || 'Unknown'}
- **Estimated Duration**: ${context.task.estimatedDuration || 'N/A'} minutes
- **Dependencies**: ${context.task.dependencies.length > 0 ? context.task.dependencies.join(', ') : 'None'}

## Agent Information

- **Agent Type**: ${worktree.agentType || 'Not assigned'}
- **Agent Status**: ${worktree.agentStatus || 'Unknown'}
- **Prompt Path**: ${context.promptPath || 'N/A'}

## Worktree Information

- **Path**: ${worktree.path}
- **Branch**: ${worktree.branch}
- **Session ID**: ${worktree.sessionId}
- **Created At**: ${worktree.createdAt}
- **Last Activity**: ${worktree.lastActivityAt}

## Configuration

- **Device Identifier**: ${context.config.deviceIdentifier || 'Unknown'}
- **Use Worktree**: ${context.config.useWorktree ? 'Yes' : 'No'}
- **Log Directory**: ${context.config.logDirectory || 'N/A'}
- **Report Directory**: ${context.config.reportDirectory || 'N/A'}

## Task Description

${context.task.description}

## Issue Body

${context.issue.body}

---

*This file was generated automatically by WorktreeManager*
*Generated at: ${new Date().toISOString()}*
`;
    }
    /**
     * Log message
     */
    log(message) {
        if (this.config.enableLogging) {
            console.log(`[WorktreeManager] ${message}`);
        }
    }
}
//# sourceMappingURL=worktree-manager.js.map