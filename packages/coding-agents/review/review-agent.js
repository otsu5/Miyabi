/**
 * ReviewAgent - Code Quality Assessment Agent
 *
 * Responsibilities:
 * - Static code analysis (ESLint, TypeScript)
 * - Security vulnerability scanning
 * - Quality scoring (0-100, passing threshold: 80)
 * - Review comments generation
 * - Escalation to CISO for critical security issues
 *
 * Scoring System:
 * - Base: 100 points
 * - ESLint error: -20 points each
 * - TypeScript error: -30 points each
 * - Critical security vulnerability: -40 points each
 * - Passing threshold: ≥80 points
 */
import { BaseAgent } from '../base-agent';
import { SecurityScannerRegistry } from './security-scanner';
import * as fs from 'fs';
import * as path from 'path';
export class ReviewAgent extends BaseAgent {
    constructor(config) {
        super('ReviewAgent', config);
    }
    /**
     * Main execution: Review code and assess quality (OPTIMIZED: Parallel Analysis)
     *
     * Performance: 3x faster with parallel execution
     * - Before: 10-20s (ESLint) + 10-20s (TS) + 10-20s (Security) = 30-60s
     * - After: max(10-20s, 10-20s, 10-20s) = 10-20s
     */
    async execute(task) {
        this.log('🔍 ReviewAgent starting code review (parallel analysis)');
        try {
            // 1. Create review request from task
            const reviewRequest = await this.createReviewRequest(task);
            // 2. Run all analyses in parallel (3x faster!)
            this.log('⚡ Running ESLint, TypeScript, and Security scans in parallel');
            const [eslintIssues, typeScriptIssues, securityIssues] = await Promise.all([
                this.runESLint(reviewRequest.files),
                this.runTypeScriptCheck(reviewRequest.files),
                this.runSecurityScan(reviewRequest.files),
            ]);
            // 3. Calculate quality score (includes actual test coverage)
            const qualityReport = await this.calculateQualityScore(eslintIssues, typeScriptIssues, securityIssues);
            // 3.5. Record quality report to trace logger (if issue context available)
            if (task.metadata?.issueNumber && this.traceLogger) {
                try {
                    this.traceLogger.recordQualityReport(qualityReport);
                    this.log(`📋 Quality report recorded to trace log`);
                }
                catch (error) {
                    // Trace logger not initialized - continue without logging
                    this.log(`⚠️  Failed to record quality report: ${error.message}`);
                }
            }
            // 4. Generate review comments
            const comments = this.generateReviewComments(eslintIssues, typeScriptIssues, securityIssues);
            // 5. Determine if escalation is needed
            const escalationInfo = await this.checkEscalation(qualityReport);
            const reviewResult = {
                qualityReport,
                approved: qualityReport.passed,
                escalationRequired: escalationInfo.required,
                escalationTarget: escalationInfo.required ? this.determineEscalationTarget('security') : undefined,
                comments,
            };
            // 6. Escalate if needed
            if (escalationInfo.required) {
                await this.escalate(escalationInfo.message, 'CISO', 'Sev.1-Critical', {
                    qualityScore: qualityReport.score,
                    criticalIssues: qualityReport.issues.filter(i => i.type === 'security' && i.severity === 'critical').length,
                    reason: escalationInfo.reason,
                });
            }
            this.log(`✅ Review complete: Score ${qualityReport.score}/100 (${qualityReport.passed ? 'PASSED' : 'FAILED'})`);
            return {
                status: escalationInfo.required ? 'escalated' : 'success',
                data: reviewResult,
                metrics: {
                    taskId: task.id,
                    agentType: this.agentType,
                    durationMs: Date.now() - this.startTime,
                    qualityScore: qualityReport.score,
                    errorsFound: qualityReport.issues.length,
                    timestamp: new Date().toISOString(),
                },
            };
        }
        catch (error) {
            this.log(`❌ Review failed: ${error.message}`);
            throw error;
        }
    }
    // ============================================================================
    // Review Request Creation
    // ============================================================================
    /**
     * Create review request from task
     */
    async createReviewRequest(task) {
        this.log('📋 Creating review request');
        // Get files to review from task metadata or scan changed files
        let files = [];
        if (task.metadata?.files) {
            files = task.metadata.files;
        }
        else {
            // Scan for recently modified files
            files = await this.getRecentlyModifiedFiles();
        }
        return {
            files,
            branch: task.metadata?.branch || 'main',
            context: task.description || '',
        };
    }
    /**
     * Get recently modified TypeScript files
     */
    async getRecentlyModifiedFiles() {
        const files = [];
        const scanDir = async (dir) => {
            try {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        await scanDir(fullPath);
                    }
                    else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
                        files.push(fullPath);
                    }
                }
            }
            catch (error) {
                // Ignore errors
            }
        };
        await scanDir(process.cwd());
        return files;
    }
    // ============================================================================
    // Static Analysis - ESLint
    // ============================================================================
    /**
     * Run ESLint on files
     */
    async runESLint(files) {
        this.log('🔧 Running ESLint analysis');
        const issues = [];
        try {
            const result = await this.executeCommand('npx eslint --format json ' + files.map(f => `"${f}"`).join(' '), { timeout: 60000 });
            await this.logToolInvocation('eslint', result.code === 0 ? 'passed' : 'failed', `ESLint completed with ${result.code === 0 ? 'no' : 'some'} issues`, result.stdout);
            // Parse ESLint JSON output
            if (result.stdout) {
                try {
                    const eslintResults = JSON.parse(result.stdout);
                    for (const fileResult of eslintResults) {
                        for (const message of fileResult.messages || []) {
                            issues.push({
                                type: 'eslint',
                                severity: message.severity === 2 ? 'high' : 'medium',
                                message: message.message,
                                file: fileResult.filePath,
                                line: message.line,
                                column: message.column,
                                scoreImpact: message.severity === 2 ? 20 : 10,
                            });
                        }
                    }
                }
                catch (parseError) {
                    this.log(`⚠️  Failed to parse ESLint output`);
                }
            }
        }
        catch (error) {
            this.log(`⚠️  ESLint execution failed: ${error.message}`);
            await this.logToolInvocation('eslint', 'failed', 'ESLint execution error', undefined, error.message);
        }
        this.log(`   Found ${issues.length} ESLint issues`);
        return issues;
    }
    // ============================================================================
    // Static Analysis - TypeScript
    // ============================================================================
    /**
     * Run TypeScript type checking
     */
    async runTypeScriptCheck(_files) {
        this.log('📘 Running TypeScript type checking');
        const issues = [];
        try {
            const result = await this.executeCommand('npx tsc --noEmit --pretty false', { timeout: 60000 });
            await this.logToolInvocation('typescript', result.code === 0 ? 'passed' : 'failed', `TypeScript check ${result.code === 0 ? 'passed' : 'found errors'}`, result.stdout + result.stderr);
            // Parse TypeScript errors
            const errorPattern = /(.+?)\((\d+),(\d+)\):\s*error\s+TS\d+:\s*(.+)/g;
            const output = result.stdout + result.stderr;
            let match;
            while ((match = errorPattern.exec(output)) !== null) {
                issues.push({
                    type: 'typescript',
                    severity: 'high',
                    message: match[4].trim(),
                    file: match[1].trim(),
                    line: parseInt(match[2]),
                    column: parseInt(match[3]),
                    scoreImpact: 30,
                });
            }
        }
        catch (error) {
            this.log(`⚠️  TypeScript check failed: ${error.message}`);
            await this.logToolInvocation('typescript', 'failed', 'TypeScript check execution error', undefined, error.message);
        }
        this.log(`   Found ${issues.length} TypeScript errors`);
        return issues;
    }
    // ============================================================================
    // Security Scanning
    // ============================================================================
    /**
     * Run security vulnerability scan (OPTIMIZED: Strategy Pattern + Parallel execution)
     *
     * Uses Strategy Pattern for extensibility:
     * - Easy to add new scanners via SecurityScannerRegistry
     * - Each scanner is independent and testable
     * - All scanners run in parallel for maximum performance
     */
    async runSecurityScan(files) {
        this.log('🔒 Running security scan (Strategy Pattern + parallel)');
        // Get all registered scanners from registry
        const scanners = SecurityScannerRegistry.getAll();
        this.log(`   Executing ${scanners.length} security scanners: ${scanners.map(s => s.name).join(', ')}`);
        // Run all scanners in parallel
        const scanResults = await Promise.all(scanners.map(scanner => scanner.scan(files)));
        // Flatten results
        const issues = scanResults.flat();
        this.log(`   Found ${issues.length} security issues (${issues.filter(i => i.severity === 'critical').length} critical)`);
        return issues;
    }
    // ============================================================================
    // Quality Scoring
    // ============================================================================
    /**
     * Calculate overall quality score
     */
    async calculateQualityScore(eslintIssues, typeScriptIssues, securityIssues) {
        this.log('📊 Calculating quality score');
        let score = 100;
        // Deduct points for each issue
        const allIssues = [...eslintIssues, ...typeScriptIssues, ...securityIssues];
        for (const issue of allIssues) {
            score -= issue.scoreImpact;
        }
        // Ensure score doesn't go below 0
        score = Math.max(0, score);
        // Calculate breakdown
        const eslintScore = 100 - eslintIssues.reduce((sum, i) => sum + i.scoreImpact, 0);
        const typeScriptScore = 100 - typeScriptIssues.reduce((sum, i) => sum + i.scoreImpact, 0);
        const securityScore = 100 - securityIssues.reduce((sum, i) => sum + i.scoreImpact, 0);
        // Get actual test coverage
        const testCoverageScore = await this.getTestCoverageScore();
        // Generate recommendations
        const recommendations = [];
        if (eslintScore < 80)
            recommendations.push('Fix ESLint errors to improve code quality');
        if (typeScriptScore < 80)
            recommendations.push('Fix TypeScript errors for type safety');
        if (securityScore < 80)
            recommendations.push('Address security vulnerabilities immediately');
        if (testCoverageScore < 80)
            recommendations.push('Increase test coverage to meet 80% threshold');
        if (score < 80)
            recommendations.push('Overall quality below threshold - review all issues');
        return {
            score: Math.round(score),
            passed: score >= 80,
            issues: allIssues,
            recommendations,
            breakdown: {
                eslintScore: Math.max(0, Math.round(eslintScore)),
                typeScriptScore: Math.max(0, Math.round(typeScriptScore)),
                securityScore: Math.max(0, Math.round(securityScore)),
                testCoverageScore: Math.max(0, Math.round(testCoverageScore)),
            },
        };
    }
    /**
     * Get test coverage score from coverage report
     */
    async getTestCoverageScore() {
        this.log('📊 Reading test coverage report');
        const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
        try {
            // Check if coverage report exists
            if (!fs.existsSync(coveragePath)) {
                this.log('⚠️  Coverage report not found - run tests with --coverage first');
                return 0;
            }
            // Read coverage report
            const coverageData = await fs.promises.readFile(coveragePath, 'utf-8');
            const coverage = JSON.parse(coverageData);
            // Get total coverage (aggregate all files)
            const total = coverage.total;
            if (!total) {
                this.log('⚠️  No coverage data found in report');
                return 0;
            }
            // Calculate average coverage across all metrics
            // Priority: statements > branches > functions > lines
            const statementsPct = total.statements?.pct || 0;
            const branchesPct = total.branches?.pct || 0;
            const functionsPct = total.functions?.pct || 0;
            const linesPct = total.lines?.pct || 0;
            // Weighted average: statements (40%), lines (30%), branches (20%), functions (10%)
            const weightedCoverage = statementsPct * 0.4 +
                linesPct * 0.3 +
                branchesPct * 0.2 +
                functionsPct * 0.1;
            this.log(`   Coverage: ${Math.round(weightedCoverage)}% (statements: ${statementsPct}%, lines: ${linesPct}%, branches: ${branchesPct}%, functions: ${functionsPct}%)`);
            return weightedCoverage;
        }
        catch (error) {
            this.log(`⚠️  Failed to read coverage report: ${error.message}`);
            return 0;
        }
    }
    // ============================================================================
    // Review Comments
    // ============================================================================
    /**
     * Generate review comments for GitHub PR
     */
    generateReviewComments(eslintIssues, typeScriptIssues, securityIssues) {
        const comments = [];
        const allIssues = [...eslintIssues, ...typeScriptIssues, ...securityIssues];
        for (const issue of allIssues) {
            if (issue.file && issue.line) {
                comments.push({
                    file: issue.file,
                    line: issue.line,
                    severity: issue.severity,
                    message: `**[${issue.type.toUpperCase()}]** ${issue.message}`,
                    suggestion: this.generateSuggestion(issue),
                });
            }
        }
        return comments;
    }
    /**
     * Generate fix suggestion for issue
     */
    generateSuggestion(issue) {
        if (issue.type === 'security' && issue.message.includes('hardcoded')) {
            return 'Move this secret to environment variables using process.env.SECRET_NAME';
        }
        if (issue.type === 'security' && issue.message.includes('eval')) {
            return 'Replace eval() with safer alternatives like JSON.parse() or Function constructor';
        }
        if (issue.type === 'typescript' && issue.message.includes('implicitly has')) {
            return 'Add explicit type annotation';
        }
        return undefined;
    }
    // ============================================================================
    // Escalation
    // ============================================================================
    /**
     * Check if escalation is required
     */
    async checkEscalation(qualityReport) {
        // Escalate if critical security issues found
        const criticalSecurityIssues = qualityReport.issues.filter(i => i.type === 'security' && i.severity === 'critical');
        if (criticalSecurityIssues.length > 0) {
            this.log(`🚨 ${criticalSecurityIssues.length} critical security issues require escalation`);
            return {
                required: true,
                message: `Critical security issues found: ${criticalSecurityIssues.length} critical vulnerabilities`,
                reason: 'critical-security-issues',
            };
        }
        // Escalate if quality score is very low (<50)
        if (qualityReport.score < 50) {
            this.log(`🚨 Quality score ${qualityReport.score} is critically low - escalation required`);
            return {
                required: true,
                message: `Quality score critically low: ${qualityReport.score}/100 (threshold: 50). Issues: ${qualityReport.issues.length} total`,
                reason: 'low-quality-score',
            };
        }
        return {
            required: false,
            message: '',
            reason: 'none',
        };
    }
}
//# sourceMappingURL=review-agent.js.map