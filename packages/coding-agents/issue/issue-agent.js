/**
 * IssueAgent - GitHub Issue Analysis & Management Agent
 *
 * Responsibilities:
 * - Analyze GitHub Issues automatically
 * - Determine issue type (feature/bug/refactor/docs/test)
 * - Assess Severity (Sev.1-5)
 * - Assess Impact (Critical/High/Medium/Low)
 * - Apply Organizational (組織設計) theory label system (65 labels)
 * - Assign appropriate team members (via CODEOWNERS)
 * - Extract task dependencies
 *
 * Issue #41: Added retry logic with exponential backoff for all GitHub API calls
 */
import { BaseAgent } from '../base-agent';
import { withRetry } from '@miyabi/shared-utils/retry';
import { IssueAnalyzer } from '../utils/issue-analyzer';
import { GitRepository } from '../utils/git-repository';
import { getGitHubClient, withGitHubCache } from '@miyabi/shared-utils/api-client';
export class IssueAgent extends BaseAgent {
    octokit;
    owner = '';
    repo = '';
    constructor(config) {
        super('IssueAgent', config);
        if (!config.githubToken) {
            throw new Error('GITHUB_TOKEN is required for IssueAgent');
        }
        // Use singleton GitHub client with connection pooling
        this.octokit = getGitHubClient(config.githubToken);
        // Parse repo from git remote
        this.initializeRepository();
    }
    /**
     * Initialize repository information
     */
    async initializeRepository() {
        try {
            const repoInfo = await GitRepository.parse();
            this.owner = repoInfo.owner;
            this.repo = repoInfo.repo;
            this.log(`📦 Repository: ${this.owner}/${this.repo}`);
        }
        catch (error) {
            this.log(`⚠️  Failed to parse repository: ${error.message}`);
            // Use defaults if parsing fails
            this.owner = 'user';
            this.repo = 'repository';
        }
    }
    /**
     * Main execution: Analyze Issue and apply labels
     */
    async execute(task) {
        this.log('🔍 IssueAgent starting issue analysis');
        try {
            // Ensure repository is initialized
            if (!this.owner || !this.repo || this.owner === 'user') {
                await this.initializeRepository();
            }
            // 1. Fetch Issue from GitHub
            const issueNumber = task.metadata?.issueNumber;
            if (!issueNumber) {
                throw new Error('Issue number is required in task metadata');
            }
            const issue = await this.fetchIssue(issueNumber);
            // 2. Analyze Issue content
            const analysis = await this.analyzeIssue(issue);
            // 3-5. Apply labels, assign team members, and add comment (parallel for performance)
            await Promise.all([
                this.applyLabels(issueNumber, analysis.labels),
                this.assignTeamMembers(issueNumber, analysis.assignees),
                this.addAnalysisComment(issueNumber, analysis),
            ]);
            this.log(`✅ Issue analysis complete: ${analysis.labels.length} labels applied`);
            return {
                status: 'success',
                data: {
                    issue,
                    analysis,
                },
                metrics: {
                    taskId: task.id,
                    agentType: this.agentType,
                    durationMs: Date.now() - this.startTime,
                    timestamp: new Date().toISOString(),
                },
            };
        }
        catch (error) {
            this.log(`❌ Issue analysis failed: ${error.message}`);
            throw error;
        }
    }
    // ============================================================================
    // GitHub API Operations
    // ============================================================================
    /**
     * Fetch Issue from GitHub (with LRU cache + automatic retry)
     */
    async fetchIssue(issueNumber) {
        this.log(`📥 Fetching Issue #${issueNumber}`);
        try {
            // Use LRU cache to avoid repeated API calls for same issue
            const cacheKey = `issue:${this.owner}/${this.repo}/${issueNumber}`;
            const response = await withGitHubCache(cacheKey, async () => {
                return await withRetry(async () => {
                    return await this.octokit.issues.get({
                        owner: this.owner,
                        repo: this.repo,
                        issue_number: issueNumber,
                    });
                });
            });
            await this.logToolInvocation('github_api_get_issue', 'passed', `Fetched Issue #${issueNumber}`, this.safeTruncate(JSON.stringify(response.data), 500));
            return {
                number: response.data.number,
                title: response.data.title,
                body: response.data.body || '',
                state: response.data.state,
                labels: response.data.labels.map((l) => typeof l === 'string' ? l : l.name),
                assignee: response.data.assignee?.login,
                createdAt: response.data.created_at,
                updatedAt: response.data.updated_at,
                url: response.data.html_url,
            };
        }
        catch (error) {
            await this.logToolInvocation('github_api_get_issue', 'failed', `Failed to fetch Issue #${issueNumber}`, undefined, error.message);
            throw error;
        }
    }
    /**
     * Apply labels to Issue (with automatic retry on transient failures)
     */
    async applyLabels(issueNumber, labels) {
        this.log(`🏷️  Applying ${labels.length} labels to Issue #${issueNumber}`);
        try {
            await withRetry(async () => {
                await this.octokit.issues.addLabels({
                    owner: this.owner,
                    repo: this.repo,
                    issue_number: issueNumber,
                    labels,
                });
            });
            await this.logToolInvocation('github_api_add_labels', 'passed', `Applied labels: ${labels.join(', ')}`, labels.join(', '));
            // Record label changes to trace logger
            if (this.traceLogger) {
                try {
                    for (const label of labels) {
                        this.traceLogger.recordLabelChange('added', label, 'IssueAgent');
                    }
                    this.log(`📋 ${labels.length} label changes recorded to trace log`);
                }
                catch (error) {
                    // Trace logger not initialized - continue without logging
                    this.log(`⚠️  Failed to record label changes: ${error.message}`);
                }
            }
        }
        catch (error) {
            await this.logToolInvocation('github_api_add_labels', 'failed', 'Failed to apply labels', undefined, error.message);
            throw error;
        }
    }
    /**
     * Assign team members to Issue (with automatic retry on transient failures)
     */
    async assignTeamMembers(issueNumber, assignees) {
        if (assignees.length === 0)
            return;
        this.log(`👥 Assigning ${assignees.length} team members to Issue #${issueNumber}`);
        try {
            await withRetry(async () => {
                await this.octokit.issues.addAssignees({
                    owner: this.owner,
                    repo: this.repo,
                    issue_number: issueNumber,
                    assignees,
                });
            });
            await this.logToolInvocation('github_api_add_assignees', 'passed', `Assigned: ${assignees.join(', ')}`, assignees.join(', '));
        }
        catch (error) {
            await this.logToolInvocation('github_api_add_assignees', 'failed', 'Failed to assign team members', undefined, error.message);
            // Don't throw - assignment is optional
            this.log(`⚠️  Failed to assign: ${error.message}`);
        }
    }
    /**
     * Add analysis comment to Issue (with automatic retry on transient failures)
     */
    async addAnalysisComment(issueNumber, analysis) {
        this.log(`💬 Adding analysis comment to Issue #${issueNumber}`);
        const comment = this.formatAnalysisComment(analysis);
        try {
            await withRetry(async () => {
                await this.octokit.issues.createComment({
                    owner: this.owner,
                    repo: this.repo,
                    issue_number: issueNumber,
                    body: comment,
                });
            });
            await this.logToolInvocation('github_api_create_comment', 'passed', 'Added analysis comment', this.safeTruncate(comment, 200));
        }
        catch (error) {
            await this.logToolInvocation('github_api_create_comment', 'failed', 'Failed to add comment', undefined, error.message);
            // Don't throw - comment is optional
        }
    }
    // ============================================================================
    // Issue Analysis
    // ============================================================================
    /**
     * Analyze Issue and determine classification
     */
    async analyzeIssue(issue) {
        this.log('🧠 Analyzing Issue content');
        // Use IssueAnalyzer for consistent analysis
        const type = IssueAnalyzer.determineIssueType(issue);
        const severity = IssueAnalyzer.determineSeverityFromIssue(issue);
        const impact = IssueAnalyzer.determineImpactFromIssue(issue);
        const dependencies = IssueAnalyzer.extractDependenciesFromIssue(issue);
        const estimatedDuration = IssueAnalyzer.estimateDurationFromIssue(issue, type);
        const analysis = {
            type,
            severity,
            impact,
            responsibility: this.determineResponsibility(issue),
            agentType: this.determineAgent(type),
            labels: [],
            assignees: [],
            dependencies,
            estimatedDuration,
        };
        // Build Organizational label set
        analysis.labels = this.buildLabelSet(analysis);
        // Determine assignees from CODEOWNERS or responsibility
        analysis.assignees = await this.determineAssignees(analysis);
        return analysis;
    }
    /**
     * Determine responsibility assignment
     */
    determineResponsibility(issue) {
        const text = (issue.title + ' ' + issue.body).toLowerCase();
        // Security issues → CISO
        if (text.match(/\b(security|vulnerability|exploit|breach|cve)\b/)) {
            return 'CISO';
        }
        // Architecture/design → TechLead
        if (text.match(/\b(architecture|design|pattern|refactor)\b/)) {
            return 'TechLead';
        }
        // Business/product → PO
        if (text.match(/\b(business|product|feature|requirement)\b/)) {
            return 'PO';
        }
        // DevOps/deployment → DevOps
        if (text.match(/\b(deploy|ci|cd|infrastructure|pipeline)\b/)) {
            return 'DevOps';
        }
        return 'Developer'; // Default
    }
    /**
     * Determine appropriate Agent
     */
    determineAgent(type) {
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
    // Organizational Label System (組織設計原則65ラベル体系)
    // ============================================================================
    /**
     * Build complete label set based on Organizational theory
     */
    buildLabelSet(analysis) {
        const labels = [];
        // 1. Issue Type (業務カテゴリ)
        const typeLabels = {
            feature: '✨feature',
            bug: '🐛bug',
            refactor: '🔧refactor',
            docs: '📚documentation',
            test: '🧪test',
            deployment: '🚀deployment',
        };
        labels.push(typeLabels[analysis.type]);
        // 2. Severity (深刻度)
        labels.push(`${this.getSeverityEmoji(analysis.severity)}${analysis.severity}`);
        // 3. Impact (影響度)
        labels.push(`📊影響度-${analysis.impact}`);
        // 4. Responsibility (責任者)
        const responsibilityLabels = {
            Developer: '👤担当-開発者',
            TechLead: '👥担当-テックリード',
            PO: '👑担当-PO',
            CISO: '👑担当-PO', // Map to PO for now
            DevOps: '👤担当-開発者',
            AIAgent: '🤖担当-AI Agent',
        };
        labels.push(responsibilityLabels[analysis.responsibility]);
        // 5. Agent Type
        const agentLabels = {
            CoordinatorAgent: '🎯CoordinatorAgent',
            CodeGenAgent: '🤖CodeGenAgent',
            ReviewAgent: '🔍ReviewAgent',
            IssueAgent: '📋IssueAgent',
            PRAgent: '🔀PRAgent',
            DeploymentAgent: '🚀DeploymentAgent',
            AutoFixAgent: '🔧AutoFixAgent',
            WaterSpiderAgent: '🕷️WaterSpiderAgent',
        };
        labels.push(agentLabels[analysis.agentType]);
        // 6. Security flag if responsibility is CISO
        if (analysis.responsibility === 'CISO') {
            labels.push('🔒Security-審査必要');
        }
        return labels;
    }
    /**
     * Get emoji for Severity
     */
    getSeverityEmoji(severity) {
        const emojiMap = {
            'Sev.1-Critical': '🔥',
            'Sev.2-High': '⭐',
            'Sev.3-Medium': '➡️',
            'Sev.4-Low': '🟢',
            'Sev.5-Trivial': '⬇️',
        };
        return emojiMap[severity];
    }
    /**
     * Determine assignees from CODEOWNERS or responsibility
     */
    async determineAssignees(analysis) {
        const assignees = [];
        // Map responsibility to GitHub usernames (from config)
        const responsibilityMap = {
            Developer: undefined, // Let CODEOWNERS handle
            TechLead: this.config.techLeadGithubUsername,
            PO: this.config.poGithubUsername,
            CISO: this.config.cisoGithubUsername,
            DevOps: undefined,
            AIAgent: undefined,
        };
        const assignee = responsibilityMap[analysis.responsibility];
        if (assignee) {
            assignees.push(assignee);
        }
        return assignees;
    }
    // ============================================================================
    // Comment Formatting
    // ============================================================================
    /**
     * Format analysis comment for GitHub
     */
    formatAnalysisComment(analysis) {
        return `## 🤖 IssueAgent Analysis

**Issue Type**: ${analysis.type}
**Severity**: ${analysis.severity}
**Impact**: ${analysis.impact}
**Responsibility**: ${analysis.responsibility}
**Assigned Agent**: ${analysis.agentType}
**Estimated Duration**: ${analysis.estimatedDuration} minutes

### Applied Labels
${analysis.labels.map(l => `- \`${l}\``).join('\n')}

${analysis.dependencies.length > 0 ? `### Dependencies
${analysis.dependencies.map(d => `- #${d.replace('issue-', '')}`).join('\n')}` : ''}

---

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>`;
    }
}
//# sourceMappingURL=issue-agent.js.map