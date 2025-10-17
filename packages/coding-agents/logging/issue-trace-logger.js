/**
 * Issue Trace Logger
 *
 * Complete lifecycle tracking for GitHub Issues.
 * Tracks state transitions, agent executions, label changes, quality reports,
 * PRs, deployments, escalations, and manual annotations.
 *
 * Usage:
 *   const logger = new IssueTraceLogger(issueNumber, issueTitle, issueUrl, deviceIdentifier);
 *   logger.startTrace();
 *   logger.recordStateTransition('pending', 'analyzing', 'CoordinatorAgent');
 *   logger.startAgentExecution('CoordinatorAgent', 'task-123');
 *   logger.endAgentExecution('CoordinatorAgent', 'success');
 *   logger.saveTrace();
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * IssueTraceLogger - Complete Issue lifecycle tracker
 */
export class IssueTraceLogger {
    trace;
    traceDir;
    traceFilePath;
    activeAgentExecutions;
    sessionId;
    constructor(issueNumber, issueTitle, issueUrl, deviceIdentifier, sessionId) {
        this.sessionId = sessionId || this.generateSessionId();
        this.activeAgentExecutions = new Map();
        // Initialize trace directory
        this.traceDir = path.resolve(__dirname, '../../.ai/trace-logs');
        this.traceFilePath = path.join(this.traceDir, `issue-${issueNumber}.json`);
        // Ensure trace directory exists
        if (!fs.existsSync(this.traceDir)) {
            fs.mkdirSync(this.traceDir, { recursive: true });
        }
        // Load existing trace or create new one
        if (fs.existsSync(this.traceFilePath)) {
            this.trace = this.loadTrace();
            this.trace.metadata.sessionIds.push(this.sessionId);
        }
        else {
            this.trace = this.createNewTrace(issueNumber, issueTitle, issueUrl, deviceIdentifier);
        }
    }
    // ============================================================================
    // Lifecycle Management
    // ============================================================================
    /**
     * Start tracking the Issue
     */
    startTrace() {
        if (this.trace.stateTransitions.length === 0) {
            // First transition - pending state
            this.recordStateTransition('pending', 'pending', 'System', 'Issue created');
        }
        this.saveTrace();
    }
    /**
     * End tracking - mark Issue as completed
     */
    endTrace(finalState = 'done', reason) {
        this.trace.closedAt = new Date().toISOString();
        this.trace.currentState = finalState;
        if (this.trace.stateTransitions.length > 0) {
            const lastTransition = this.trace.stateTransitions[this.trace.stateTransitions.length - 1];
            this.recordStateTransition(lastTransition.to, finalState, 'System', reason);
        }
        this.calculateTotalDuration();
        this.saveTrace();
    }
    /**
     * Get current trace
     */
    getTrace() {
        return { ...this.trace };
    }
    // ============================================================================
    // State Transition Tracking
    // ============================================================================
    /**
     * Record state transition
     */
    recordStateTransition(from, to, triggeredBy, reason) {
        const transition = {
            from,
            to,
            timestamp: new Date().toISOString(),
            triggeredBy,
            reason,
        };
        this.trace.stateTransitions.push(transition);
        this.trace.currentState = to;
        this.trace.metadata.lastUpdated = new Date().toISOString();
        this.saveTrace();
    }
    // ============================================================================
    // Agent Execution Tracking
    // ============================================================================
    /**
     * Start agent execution
     */
    startAgentExecution(agentType, taskId) {
        const execution = {
            agentType,
            taskId,
            startTime: new Date().toISOString(),
            status: 'running',
        };
        this.activeAgentExecutions.set(agentType, execution);
        this.trace.agentExecutions.push(execution);
        this.trace.metadata.lastUpdated = new Date().toISOString();
        this.saveTrace();
    }
    /**
     * End agent execution
     */
    endAgentExecution(agentType, status, result, error) {
        const execution = this.activeAgentExecutions.get(agentType);
        if (!execution) {
            throw new Error(`No active execution found for agent: ${agentType}`);
        }
        execution.endTime = new Date().toISOString();
        execution.status = status;
        execution.result = result;
        execution.error = error;
        // Calculate duration
        const startMs = new Date(execution.startTime).getTime();
        const endMs = new Date(execution.endTime).getTime();
        execution.durationMs = endMs - startMs;
        this.activeAgentExecutions.delete(agentType);
        this.trace.metadata.lastUpdated = new Date().toISOString();
        this.saveTrace();
    }
    // ============================================================================
    // Task Management
    // ============================================================================
    /**
     * Update task statistics
     */
    updateTaskStats(total, completed, failed) {
        this.trace.totalTasks = total;
        this.trace.completedTasks = completed;
        this.trace.failedTasks = failed;
        this.trace.metadata.lastUpdated = new Date().toISOString();
        this.saveTrace();
    }
    /**
     * Increment completed tasks
     */
    incrementCompletedTasks() {
        this.trace.completedTasks++;
        this.trace.metadata.lastUpdated = new Date().toISOString();
        this.saveTrace();
    }
    /**
     * Increment failed tasks
     */
    incrementFailedTasks() {
        this.trace.failedTasks++;
        this.trace.metadata.lastUpdated = new Date().toISOString();
        this.saveTrace();
    }
    // ============================================================================
    // Label Tracking
    // ============================================================================
    /**
     * Record label change
     */
    recordLabelChange(action, label, performedBy) {
        const change = {
            timestamp: new Date().toISOString(),
            action,
            label,
            performedBy,
        };
        this.trace.labelChanges.push(change);
        // Update current labels
        if (action === 'added' && !this.trace.currentLabels.includes(label)) {
            this.trace.currentLabels.push(label);
        }
        else if (action === 'removed') {
            this.trace.currentLabels = this.trace.currentLabels.filter(l => l !== label);
        }
        this.trace.metadata.lastUpdated = new Date().toISOString();
        this.saveTrace();
    }
    // ============================================================================
    // Quality Tracking
    // ============================================================================
    /**
     * Record quality report
     */
    recordQualityReport(report) {
        this.trace.qualityReports.push(report);
        // Update final quality score (latest report)
        this.trace.finalQualityScore = report.score;
        this.trace.metadata.lastUpdated = new Date().toISOString();
        this.saveTrace();
    }
    // ============================================================================
    // PR Tracking
    // ============================================================================
    /**
     * Record pull request
     */
    recordPullRequest(pr) {
        this.trace.pullRequests.push(pr);
        this.trace.metadata.lastUpdated = new Date().toISOString();
        this.saveTrace();
    }
    // ============================================================================
    // Deployment Tracking
    // ============================================================================
    /**
     * Record deployment
     */
    recordDeployment(deployment) {
        this.trace.deployments.push(deployment);
        this.trace.metadata.lastUpdated = new Date().toISOString();
        this.saveTrace();
    }
    // ============================================================================
    // Escalation Tracking
    // ============================================================================
    /**
     * Record escalation
     */
    recordEscalation(escalation) {
        this.trace.escalations.push(escalation);
        this.trace.metadata.lastUpdated = new Date().toISOString();
        this.saveTrace();
    }
    // ============================================================================
    // Notes & Annotations
    // ============================================================================
    /**
     * Add note
     */
    addNote(author, content, tags) {
        const note = {
            timestamp: new Date().toISOString(),
            author,
            content,
            tags,
        };
        this.trace.notes.push(note);
        this.trace.metadata.lastUpdated = new Date().toISOString();
        this.saveTrace();
    }
    // ============================================================================
    // Persistence
    // ============================================================================
    /**
     * Save trace to disk
     */
    saveTrace() {
        try {
            const json = JSON.stringify(this.trace, null, 2);
            fs.writeFileSync(this.traceFilePath, json, 'utf-8');
        }
        catch (error) {
            console.error(`Failed to save trace log: ${error}`);
            throw error;
        }
    }
    /**
     * Load trace from disk
     */
    loadTrace() {
        try {
            const json = fs.readFileSync(this.traceFilePath, 'utf-8');
            return JSON.parse(json);
        }
        catch (error) {
            throw new Error(`Failed to load trace log: ${error}`);
        }
    }
    // ============================================================================
    // Utility Methods
    // ============================================================================
    /**
     * Create new trace
     */
    createNewTrace(issueNumber, issueTitle, issueUrl, deviceIdentifier) {
        return {
            issueNumber,
            issueTitle,
            issueUrl,
            createdAt: new Date().toISOString(),
            currentState: 'pending',
            stateTransitions: [],
            agentExecutions: [],
            totalTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            labelChanges: [],
            currentLabels: [],
            qualityReports: [],
            pullRequests: [],
            deployments: [],
            escalations: [],
            notes: [],
            metadata: {
                deviceIdentifier,
                sessionIds: [this.sessionId],
                lastUpdated: new Date().toISOString(),
            },
        };
    }
    /**
     * Generate session ID
     */
    generateSessionId() {
        return `session-${new Date().toISOString()}`;
    }
    /**
     * Calculate total duration
     */
    calculateTotalDuration() {
        if (!this.trace.closedAt) {
            return;
        }
        const startMs = new Date(this.trace.createdAt).getTime();
        const endMs = new Date(this.trace.closedAt).getTime();
        this.trace.metadata.totalDurationMs = endMs - startMs;
    }
    // ============================================================================
    // Static Methods
    // ============================================================================
    /**
     * Load existing trace log
     */
    static load(issueNumber) {
        const traceDir = path.resolve(__dirname, '../../.ai/trace-logs');
        const traceFilePath = path.join(traceDir, `issue-${issueNumber}.json`);
        if (!fs.existsSync(traceFilePath)) {
            return null;
        }
        try {
            const json = fs.readFileSync(traceFilePath, 'utf-8');
            const trace = JSON.parse(json);
            // Create logger instance from existing trace
            const logger = new IssueTraceLogger(trace.issueNumber, trace.issueTitle, trace.issueUrl, trace.metadata.deviceIdentifier);
            return logger;
        }
        catch (error) {
            console.error(`Failed to load trace log for issue ${issueNumber}: ${error}`);
            return null;
        }
    }
    /**
     * Get all trace logs
     */
    static getAllTraces() {
        const traceDir = path.resolve(__dirname, '../../.ai/trace-logs');
        if (!fs.existsSync(traceDir)) {
            return [];
        }
        const files = fs.readdirSync(traceDir);
        const traces = [];
        for (const file of files) {
            if (file.startsWith('issue-') && file.endsWith('.json')) {
                try {
                    const filePath = path.join(traceDir, file);
                    const json = fs.readFileSync(filePath, 'utf-8');
                    const trace = JSON.parse(json);
                    traces.push(trace);
                }
                catch (error) {
                    console.error(`Failed to load trace log ${file}: ${error}`);
                }
            }
        }
        return traces;
    }
    /**
     * Delete trace log
     */
    static deleteTrace(issueNumber) {
        const traceDir = path.resolve(__dirname, '../../.ai/trace-logs');
        const traceFilePath = path.join(traceDir, `issue-${issueNumber}.json`);
        if (!fs.existsSync(traceFilePath)) {
            return false;
        }
        try {
            fs.unlinkSync(traceFilePath);
            return true;
        }
        catch (error) {
            console.error(`Failed to delete trace log for issue ${issueNumber}: ${error}`);
            return false;
        }
    }
}
//# sourceMappingURL=issue-trace-logger.js.map