/**
 * CoordinatorAgent - The Orchestrator of Autonomous Operations
 *
 * Responsibilities:
 * - Task decomposition (Issue → Tasks)
 * - DAG construction (dependency graph)
 * - Topological sorting
 * - Agent assignment
 * - Parallel execution control
 * - Progress monitoring
 *
 * This is the MOST IMPORTANT agent in the hierarchy.
 */
import { BaseAgent } from '../base-agent';
import { IssueAnalyzer } from '../utils/issue-analyzer';
import { DAGManager } from '../utils/dag-manager';
import { PlansGenerator } from '../utils/plans-generator';
import { IssueTraceLogger } from '../logging/issue-trace-logger';
import { WorktreeManager } from '../worktree/worktree-manager';
import { GitHubClient } from '../utils/github-client';
import * as path from 'path';
export class CoordinatorAgent extends BaseAgent {
    worktreeManager;
    githubClient;
    constructor(config) {
        super('CoordinatorAgent', config);
        // Initialize GitHubClient if GITHUB_TOKEN is available
        const githubToken = process.env.GITHUB_TOKEN || config.githubToken;
        if (githubToken) {
            this.githubClient = new GitHubClient({
                token: githubToken,
                cacheTTL: 5 * 60 * 1000, // 5 minutes
                debug: false,
            });
            this.log('🐙 GitHubClient initialized');
        }
        else {
            this.log('⚠️  GITHUB_TOKEN not found, GitHub API features disabled');
        }
        // Initialize WorktreeManager if worktree mode is enabled
        if (config.useWorktree && config.worktreeBasePath) {
            this.worktreeManager = new WorktreeManager({
                basePath: config.worktreeBasePath,
                repoRoot: process.cwd(),
                mainBranch: 'main',
                branchPrefix: 'issue-',
                autoCleanup: true,
                maxIdleTime: 3600000, // 1 hour
                enableLogging: true,
            });
            this.log('🌳 WorktreeManager initialized for parallel execution');
        }
    }
    /**
     * Main execution: Coordinate full task lifecycle
     */
    async execute(task) {
        this.log('🎯 CoordinatorAgent starting orchestration');
        try {
            // 1. If task has issue reference, decompose it
            const issue = await this.fetchIssue(task);
            if (!issue) {
                return {
                    status: 'failed',
                    error: 'No Issue found for coordination',
                };
            }
            // Initialize Issue Trace Logger for this Issue
            const issueLogger = new IssueTraceLogger(issue.number, issue.title, issue.url, this.config.deviceIdentifier || 'unknown');
            issueLogger.startTrace();
            // Set logger for this agent and future specialist agents
            this.setTraceLogger(issueLogger);
            // Record state transition: pending → analyzing
            this.recordStateTransition('pending', 'analyzing', 'Starting Issue decomposition');
            // 2. Decompose Issue into Tasks
            const decomposition = await this.decomposeIssue(issue);
            // Update task statistics
            issueLogger.updateTaskStats(decomposition.tasks.length, 0, 0);
            // 3. Build DAG and check for cycles
            const dag = decomposition.dag;
            if (decomposition.hasCycles) {
                await this.escalate(`Circular dependency detected in Issue #${issue.number}`, 'TechLead', 'Sev.2-High', { cycle: decomposition.tasks.map((t) => t.id) });
            }
            // Record state transition: analyzing → implementing
            this.recordStateTransition('analyzing', 'implementing', 'Starting task execution');
            // 4. Create execution plan
            const plan = await this.createExecutionPlan(decomposition.tasks, dag);
            // 4.5. Generate Plans.md (Feler's pattern from OpenAI Dev Day)
            await this.generatePlansFile(decomposition, plan);
            // 5. Execute tasks in parallel (respecting dependencies)
            // Use Task Tool executor if enabled in config
            const report = this.config.useTaskTool
                ? await this.executeWithTaskTool(decomposition.tasks, dag, issueLogger)
                : await this.executeParallel(plan, issueLogger);
            // Record state transition: implementing → done
            this.recordStateTransition('implementing', 'done', 'All tasks completed');
            // End trace
            issueLogger.endTrace('done', 'Issue orchestration completed successfully');
            this.log(`✅ Orchestration complete: ${report.summary.successRate}% success rate`);
            return {
                status: 'success',
                data: report,
                metrics: {
                    taskId: task.id,
                    agentType: this.agentType,
                    durationMs: report.totalDurationMs,
                    timestamp: new Date().toISOString(),
                },
            };
        }
        catch (error) {
            this.log(`❌ Orchestration failed: ${error.message}`);
            // Record failure in trace
            if (this.traceLogger) {
                this.recordStateTransition('implementing', 'failed', error.message);
                this.traceLogger.endTrace('failed', error.message);
            }
            throw error;
        }
    }
    // ============================================================================
    // Task Decomposition
    // ============================================================================
    /**
     * Decompose GitHub Issue into executable Tasks
     */
    async decomposeIssue(issue) {
        this.log(`🔍 Decomposing Issue #${issue.number}: ${issue.title}`);
        // Extract task information from Issue body
        const tasks = await this.extractTasks(issue);
        // Build dependency graph using DAGManager
        const dag = DAGManager.buildDAG(tasks);
        // Check for circular dependencies using DAGManager
        const hasCycles = DAGManager.detectCycles(dag);
        // Estimate total duration
        const estimatedTotalDuration = tasks.reduce((sum, task) => sum + (task.estimatedDuration ?? 0), 0);
        // Generate recommendations using DAGManager
        const recommendations = DAGManager.generateRecommendations(tasks, dag);
        return {
            originalIssue: issue,
            tasks,
            dag,
            estimatedTotalDuration,
            hasCycles,
            recommendations,
        };
    }
    /**
     * Extract tasks from Issue body
     * Supports formats:
     * - [ ] Task description
     * - 1. Task description
     * - ## Task Title
     */
    async extractTasks(issue) {
        const tasks = [];
        const lines = issue.body.split('\n');
        let taskCounter = 0;
        for (const line of lines) {
            // Match checkbox tasks: - [ ] or - [x]
            const checkboxMatch = line.match(/^-\s*\[[ x]\]\s+(.+)$/i);
            if (checkboxMatch) {
                tasks.push(this.createTask(issue, checkboxMatch[1], taskCounter++));
                continue;
            }
            // Match numbered tasks: 1. Task or 1) Task
            const numberedMatch = line.match(/^\d+[\.)]\s+(.+)$/);
            if (numberedMatch) {
                tasks.push(this.createTask(issue, numberedMatch[1], taskCounter++));
                continue;
            }
            // Match heading tasks: ## Task Title
            const headingMatch = line.match(/^##\s+(.+)$/);
            if (headingMatch) {
                tasks.push(this.createTask(issue, headingMatch[1], taskCounter++));
                continue;
            }
        }
        // If no tasks found, create a single task from the issue
        if (tasks.length === 0) {
            tasks.push(this.createTask(issue, issue.title, 0));
        }
        this.log(`   Found ${tasks.length} tasks`);
        return tasks;
    }
    /**
     * Create Task from Issue information
     */
    createTask(issue, title, index) {
        // Detect dependencies in title (e.g., "Task A (depends: #270)")
        const dependencyMatch = title.match(/#(\d+)/g);
        const dependencies = dependencyMatch
            ? dependencyMatch.map((d) => d.replace('#', 'issue-'))
            : [];
        // Use IssueAnalyzer for consistent analysis
        const type = IssueAnalyzer.determineType(issue.labels, title, issue.body);
        const severity = IssueAnalyzer.determineSeverity(issue.labels, title, issue.body);
        const impact = IssueAnalyzer.determineImpact(issue.labels, title, issue.body);
        const estimatedDuration = IssueAnalyzer.estimateDuration(title, issue.body, type);
        // Assign agent based on task type
        const assignedAgent = this.assignAgent(type);
        return {
            id: `task-${issue.number}-${index}`,
            title: title.trim(),
            description: `Task from Issue #${issue.number}`,
            type,
            priority: index,
            severity,
            impact,
            assignedAgent,
            dependencies,
            estimatedDuration,
            status: 'idle',
            metadata: {
                issueNumber: issue.number,
                issueUrl: issue.url,
            },
        };
    }
    /**
     * Assign Agent based on task type
     */
    assignAgent(type) {
        const agentMap = {
            feature: 'CodeGenAgent',
            bug: 'CodeGenAgent',
            refactor: 'CodeGenAgent',
            docs: 'CodeGenAgent',
            test: 'CodeGenAgent',
            deployment: 'DeploymentAgent',
        };
        return agentMap[type];
    }
    // ============================================================================
    // DAG Construction (Delegated to DAGManager)
    // ============================================================================
    // Note: All DAG operations now handled by DAGManager utility class
    // - DAGManager.buildDAG(tasks)
    // - DAGManager.detectCycles(dag)
    // - DAGManager.generateRecommendations(tasks, dag)
    // - DAGManager.calculateCriticalPath(tasks, dag)
    // ============================================================================
    // Execution Planning & Control
    // ============================================================================
    /**
     * Create execution plan
     */
    async createExecutionPlan(tasks, dag) {
        const sessionId = `session-${Date.now()}`;
        const deviceIdentifier = this.config.deviceIdentifier || 'unknown';
        const concurrency = Math.min(tasks.length, 5); // Max 5 parallel
        const estimatedDuration = tasks.reduce((sum, task) => sum + (task.estimatedDuration ?? 0), 0);
        return {
            sessionId,
            deviceIdentifier,
            concurrency,
            tasks,
            dag,
            estimatedDuration,
            startTime: Date.now(),
        };
    }
    /**
     * Execute tasks in parallel (respecting DAG levels)
     */
    async executeParallel(plan, issueLogger) {
        this.log(`⚡ Starting parallel execution (concurrency: ${plan.concurrency})`);
        const results = [];
        const startTime = Date.now();
        // Execute level by level
        for (let levelIdx = 0; levelIdx < plan.dag.levels.length; levelIdx++) {
            const level = plan.dag.levels[levelIdx];
            this.log(`📍 Executing level ${levelIdx + 1}/${plan.dag.levels.length} (${level.length} tasks)`);
            // Execute tasks in this level in parallel
            const levelResults = await this.executeLevelParallel(level, plan.tasks, plan.concurrency, issueLogger);
            results.push(...levelResults);
            // Update task statistics in trace
            const completed = results.filter((r) => r.status === 'completed').length;
            const failed = results.filter((r) => r.status === 'failed').length;
            issueLogger.updateTaskStats(plan.tasks.length, completed, failed);
            // Update progress
            this.logProgress(results, plan.tasks.length);
        }
        const endTime = Date.now();
        // Generate report
        const report = {
            sessionId: plan.sessionId,
            deviceIdentifier: plan.deviceIdentifier,
            startTime,
            endTime,
            totalDurationMs: endTime - startTime,
            summary: {
                total: plan.tasks.length,
                completed: results.filter((r) => r.status === 'completed').length,
                failed: results.filter((r) => r.status === 'failed').length,
                escalated: results.filter((r) => r.status === 'escalated').length,
                successRate: (results.filter((r) => r.status === 'completed').length / plan.tasks.length) * 100,
            },
            tasks: results,
            metrics: [],
            escalations: [],
        };
        // Save report
        await this.saveExecutionReport(report);
        return report;
    }
    /**
     * Execute all tasks in a level in parallel (OPTIMIZED: Real agent execution)
     *
     * Performance: Now calls actual specialist agents instead of simulation
     */
    async executeLevelParallel(taskIds, allTasks, _concurrency, issueLogger) {
        const tasks = taskIds
            .map((id) => allTasks.find((t) => t.id === id))
            .filter((t) => t !== undefined);
        // Fetch Issue for worktree creation (if enabled)
        let issue = null;
        if (this.worktreeManager && tasks.length > 0 && tasks[0].metadata?.issueNumber) {
            issue = await this.fetchIssueForWorktree(tasks[0].metadata.issueNumber);
        }
        // Execute real agents in parallel
        const results = await Promise.all(tasks.map(async (task) => {
            const startTime = Date.now();
            const agentType = task.assignedAgent || 'CodeGenAgent'; // Default to CodeGenAgent if not assigned
            this.log(`   🏃 Executing: ${task.id} (${agentType})`);
            // Create worktree if worktree mode is enabled
            if (this.worktreeManager && issue) {
                try {
                    // Create execution context
                    const executionContext = {
                        task,
                        issue,
                        config: this.config,
                        promptPath: this.getAgentPromptPath(agentType),
                    };
                    // Create worktree with agent assignment
                    const worktreeInfo = await this.worktreeManager.createWorktree(issue, {
                        agentType,
                        executionContext,
                    });
                    this.log(`   🌳 Created worktree for task ${task.id}: ${worktreeInfo.path}`);
                    // Write execution context files to worktree
                    await this.worktreeManager.writeExecutionContext(issue.number);
                    this.log(`   📄 Wrote execution context to worktree`);
                    // Update agent status to executing
                    this.worktreeManager.updateAgentStatus(issue.number, 'executing');
                }
                catch (error) {
                    this.log(`   ⚠️  Failed to create worktree: ${error.message}`);
                    // Continue without worktree
                }
            }
            try {
                // Instantiate and execute the appropriate specialist agent
                const agent = await this.createSpecialistAgent(agentType);
                // Pass Issue Trace Logger to specialist agent
                agent.setTraceLogger(issueLogger);
                const result = await agent.execute(task);
                const durationMs = Date.now() - startTime;
                // Update task completed count
                if (result.status === 'success') {
                    issueLogger.incrementCompletedTasks();
                    // Update worktree agent status to completed
                    if (this.worktreeManager && issue) {
                        this.worktreeManager.updateAgentStatus(issue.number, 'completed');
                    }
                }
                else {
                    issueLogger.incrementFailedTasks();
                    // Update worktree agent status to failed
                    if (this.worktreeManager && issue) {
                        this.worktreeManager.updateAgentStatus(issue.number, 'failed');
                    }
                }
                return {
                    taskId: task.id,
                    status: result.status === 'success' ? 'completed' : 'failed',
                    agentType,
                    durationMs,
                    result,
                };
            }
            catch (error) {
                const durationMs = Date.now() - startTime;
                this.log(`   ❌ Task ${task.id} failed: ${error.message}`);
                // Update failed task count
                issueLogger.incrementFailedTasks();
                // Update worktree agent status to failed
                if (this.worktreeManager && issue) {
                    this.worktreeManager.updateAgentStatus(issue.number, 'failed');
                }
                return {
                    taskId: task.id,
                    status: 'failed',
                    agentType,
                    durationMs,
                    result: {
                        status: 'failed',
                        error: error.message,
                    },
                };
            }
        }));
        return results;
    }
    /**
     * Execute tasks using Task Tool parallel executor (NEW)
     *
     * Uses Claude Code Task tool for true parallel execution across
     * multiple isolated Git worktrees.
     *
     * Benefits:
     * - True parallel execution (not limited by single process)
     * - Isolated worktrees prevent conflicts
     * - Leverages Claude Code's Task tool
     * - Better scalability for large task sets
     */
    async executeWithTaskTool(tasks, dag, _issueLogger) {
        this.log('🚀 Starting Task Tool parallel execution');
        this.log(`   Using Task Tool executor for ${tasks.length} tasks`);
        // Dynamically import TaskToolExecutor to avoid package boundary issues
        // @ts-ignore - Dynamic import across package boundary, works at runtime
        const { TaskToolExecutor } = await import('../../scripts/operations/task-tool-executor');
        // Create Task Tool executor
        const executor = new TaskToolExecutor({
            worktreeBasePath: this.config.worktreeBasePath || '.worktrees',
            maxConcurrentGroups: 5,
            sessionTimeoutMs: 3600000, // 1 hour
            enableProgressReporting: true,
            progressReportIntervalMs: 30000, // 30 seconds
        });
        // Execute tasks in parallel
        const report = await executor.execute(tasks, dag);
        this.log(`✅ Task Tool execution completed`);
        this.log(`   Success rate: ${report.summary.successRate.toFixed(1)}%`);
        // Save report
        await this.saveExecutionReport(report);
        return report;
    }
    /**
     * Create a specialist agent instance based on agent type
     */
    async createSpecialistAgent(agentType) {
        // Dynamically import agents to avoid circular dependencies
        switch (agentType) {
            case 'CodeGenAgent': {
                const { CodeGenAgent } = await import('../codegen/codegen-agent.js');
                return new CodeGenAgent(this.config);
            }
            case 'DeploymentAgent': {
                const { DeploymentAgent } = await import('../deployment/deployment-agent.js');
                return new DeploymentAgent(this.config);
            }
            case 'ReviewAgent': {
                const { ReviewAgent } = await import('../review/review-agent.js');
                return new ReviewAgent(this.config);
            }
            case 'IssueAgent': {
                const { IssueAgent } = await import('../issue/issue-agent.js');
                return new IssueAgent(this.config);
            }
            case 'PRAgent': {
                const { PRAgent } = await import('../pr/pr-agent.js');
                return new PRAgent(this.config);
            }
            default: {
                // Default to CodeGenAgent for unknown types
                const { CodeGenAgent } = await import('../codegen/codegen-agent.js');
                return new CodeGenAgent(this.config);
            }
        }
    }
    /**
     * Log execution progress
     */
    logProgress(results, total) {
        const completed = results.filter((r) => r.status === 'completed').length;
        const failed = results.filter((r) => r.status === 'failed').length;
        const running = 0; // Not tracked yet
        const waiting = total - results.length;
        this.log(`📊 Progress: Completed ${completed}/${total} | Running ${running} | Waiting ${waiting} | Failed ${failed}`);
    }
    /**
     * Save execution report to file
     */
    async saveExecutionReport(report) {
        const reportsDir = this.config.reportDirectory;
        await this.ensureDirectory(reportsDir);
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const reportFile = `${reportsDir}/execution-report-${timestamp}.json`;
        await this.appendToFile(reportFile, JSON.stringify(report, null, 2));
        this.log(`📄 Execution report saved: ${reportFile}`);
        // Update Plans.md with final results (if in worktree mode)
        if (this.config.useWorktree) {
            await this.updatePlansWithReport(report);
        }
    }
    /**
     * Generate Plans.md file (Feler's 7-hour session pattern from OpenAI Dev Day)
     *
     * Creates a living document that maintains trajectory during long sessions.
     * Placed in worktree root or reports directory.
     */
    async generatePlansFile(decomposition, plan) {
        this.log('📋 Generating Plans.md (Feler\'s pattern)');
        // Generate markdown content
        const plansContent = PlansGenerator.generateInitialPlan(decomposition);
        // Determine output path
        let plansPath;
        if (this.config.useWorktree && this.config.worktreeBasePath) {
            // Save in worktree root
            const issueNumber = decomposition.originalIssue.number;
            const worktreePath = path.join(this.config.worktreeBasePath, `issue-${issueNumber}`);
            await this.ensureDirectory(worktreePath);
            plansPath = path.join(worktreePath, 'plans.md');
        }
        else {
            // Save in reports directory
            const reportsDir = this.config.reportDirectory;
            await this.ensureDirectory(reportsDir);
            plansPath = path.join(reportsDir, `plans-session-${plan.sessionId}.md`);
        }
        // Write file
        await this.appendToFile(plansPath, plansContent);
        this.log(`📋 Plans.md generated: ${plansPath}`);
        this.log(`   Pattern: Feler's 7-hour session (OpenAI Dev Day)`);
        this.log(`   Purpose: Maintain trajectory during autonomous execution`);
    }
    /**
     * Update Plans.md with execution report
     */
    async updatePlansWithReport(report) {
        this.log('📋 Updating Plans.md with execution results');
        // Find Plans.md file
        const reportsDir = this.config.reportDirectory;
        const plansPath = path.join(reportsDir, `plans-session-${report.sessionId}.md`);
        try {
            // Read existing content
            const existingContent = await this.readFile(plansPath);
            // Update with report data
            const updatedContent = PlansGenerator.updateWithProgress(existingContent, report);
            // Write back
            await this.appendToFile(plansPath, updatedContent);
            this.log(`📋 Plans.md updated with execution results`);
        }
        catch (error) {
            this.log(`⚠️  Could not update Plans.md: ${error.message}`);
        }
    }
    // ============================================================================
    // Helper Methods
    // ============================================================================
    /**
     * Fetch Issue from GitHub (or local metadata)
     */
    async fetchIssue(task) {
        // Check if task has issue metadata
        if (task.metadata?.issueNumber) {
            // TODO: Fetch from GitHub API
            // For now, return mock issue
            return {
                number: task.metadata.issueNumber,
                title: task.title,
                body: task.description,
                state: 'open',
                labels: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                url: task.metadata.issueUrl || '',
            };
        }
        return null;
    }
    /**
     * Fetch Issue by issue number for worktree creation
     */
    async fetchIssueForWorktree(issueNumber) {
        // If GitHubClient is available, fetch from GitHub API
        if (this.githubClient) {
            try {
                const { owner, repo } = this.githubClient.extractOwnerRepo();
                this.log(`🔍 Fetching Issue #${issueNumber} from ${owner}/${repo}`);
                const issue = await this.githubClient.fetchIssue(owner, repo, issueNumber);
                if (issue) {
                    this.log(`✅ Issue #${issueNumber} fetched from GitHub API`);
                }
                else {
                    this.log(`⚠️  Issue #${issueNumber} not found on GitHub`);
                }
                return issue;
            }
            catch (error) {
                this.log(`❌ Failed to fetch Issue #${issueNumber}: ${error.message}`);
                this.log(`⚠️  Falling back to mock issue data`);
                // Fall through to mock data
            }
        }
        // Fallback: return mock issue if GitHubClient is unavailable or fetch failed
        this.log(`⚠️  Using mock issue data for Issue #${issueNumber}`);
        return {
            number: issueNumber,
            title: `Issue #${issueNumber}`,
            body: 'Issue body placeholder (GitHub API unavailable)',
            state: 'open',
            labels: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            url: `https://github.com/owner/repo/issues/${issueNumber}`,
        };
    }
    /**
     * Get agent-specific prompt path for Claude Code execution
     *
     * Maps agent types to their corresponding prompt files in .claude/agents/prompts/
     */
    getAgentPromptPath(agentType) {
        const promptMap = {
            CoordinatorAgent: '.claude/agents/prompts/coding/coordinator-agent-prompt.md',
            CodeGenAgent: '.claude/agents/prompts/coding/codegen-agent-prompt.md',
            ReviewAgent: '.claude/agents/prompts/coding/review-agent-prompt.md',
            IssueAgent: '.claude/agents/prompts/coding/issue-agent-prompt.md',
            PRAgent: '.claude/agents/prompts/coding/pr-agent-prompt.md',
            DeploymentAgent: '.claude/agents/prompts/coding/deployment-agent-prompt.md',
            AutoFixAgent: '.claude/agents/prompts/coding/autofix-agent-prompt.md',
            WaterSpiderAgent: '.claude/prompts/worktree-agent-execution.md', // Generic prompt
        };
        return promptMap[agentType] || '.claude/prompts/worktree-agent-execution.md';
    }
}
//# sourceMappingURL=coordinator-agent.js.map