/**
 * Plans.md Generator - Feler's 7-hour Session Pattern from OpenAI Dev Day
 *
 * Generates living documentation that maintains trajectory during long sessions.
 * Based on Feler's experience: 15M tokens, 7 hours, perfectly on track.
 *
 * Key Principles:
 * - Living document that evolves with execution
 * - DAG visualization for dependency understanding
 * - Progress tracking in real-time
 * - Decision log for context preservation
 * - Estimated vs actual time tracking
 */
export class PlansGenerator {
    /**
     * Generate initial Plans.md from TaskDecomposition
     */
    static generateInitialPlan(decomposition) {
        const { originalIssue, tasks, dag, estimatedTotalDuration, recommendations } = decomposition;
        const sections = [
            this.generateHeader(originalIssue),
            this.generateOverview(originalIssue, tasks, estimatedTotalDuration),
            this.generateDAGVisualization(dag, tasks),
            this.generateTaskList(tasks, dag),
            this.generateProgressSection(tasks),
            this.generateDecisions([]),
            this.generateRecommendations(recommendations),
            this.generateFooter(),
        ];
        return sections.join('\n\n');
    }
    /**
     * Update Plans.md with execution progress
     */
    static updateWithProgress(existingPlans, report) {
        // Extract existing sections
        const sections = existingPlans.split('\n## ');
        // Update Progress section
        const progressSection = this.generateProgressSectionFromReport(report);
        // Replace Progress section
        const updated = sections.map((section) => {
            if (section.startsWith('Progress')) {
                return progressSection;
            }
            return section.startsWith('# ') ? section : '## ' + section;
        });
        return updated.join('\n');
    }
    // ============================================================================
    // Section Generators
    // ============================================================================
    static generateHeader(issue) {
        return `# Execution Plan: Issue #${issue.number}

**Title**: ${issue.title}
**Status**: ${issue.state}
**Created**: ${new Date(issue.createdAt).toLocaleDateString()}
**Updated**: ${new Date().toISOString()}

---`;
    }
    static generateOverview(issue, tasks, estimatedDuration) {
        const taskTypes = this.groupTasksByType(tasks);
        const criticalTasks = tasks.filter((t) => t.severity?.includes('Critical'));
        return `## Overview

### Issue Description

${issue.body.split('\n').slice(0, 5).join('\n')}

${issue.body.length > 500 ? '...' : ''}

### Execution Summary

- **Total Tasks**: ${tasks.length}
- **Estimated Duration**: ${Math.round(estimatedDuration)} minutes (~${Math.round(estimatedDuration / 60)} hours)
- **Critical Tasks**: ${criticalTasks.length}
- **Task Types**:
${Object.entries(taskTypes)
            .map(([type, count]) => `  - ${type}: ${count}`)
            .join('\n')}

### Execution Strategy

This plan follows the **DAG-based parallel execution** strategy:
1. Tasks are organized into dependency levels
2. Independent tasks within a level execute in parallel
3. Progress is tracked in real-time
4. Decisions and blockers are logged immediately

**Reference**: OpenAI Dev Day - Feler's 7-hour session pattern`;
    }
    static generateDAGVisualization(dag, tasks) {
        const mermaidGraph = this.generateMermaidDAG(dag, tasks);
        return `## DAG Visualization

### Dependency Graph

\`\`\`mermaid
${mermaidGraph}
\`\`\`

### Execution Levels

${dag.levels
            .map((level, idx) => `**Level ${idx + 1}** (${level.length} tasks, can run in parallel):
${level.map((taskId) => `- \`${taskId}\``).join('\n')}`)
            .join('\n\n')}`;
    }
    static generateMermaidDAG(dag, tasks) {
        const lines = ['graph TD'];
        // Add nodes with styling based on status/type
        for (const task of tasks) {
            const label = `${task.id}<br/>${task.title.substring(0, 30)}...`;
            const style = this.getMermaidNodeStyle(task);
            lines.push(`    ${task.id}["${label}"]${style}`);
        }
        // Add edges
        for (const edge of dag.edges) {
            lines.push(`    ${edge.from} --> ${edge.to}`);
        }
        // Add styling
        lines.push('');
        lines.push('    classDef completed fill:#10b981,stroke:#059669,color:#fff');
        lines.push('    classDef running fill:#3b82f6,stroke:#2563eb,color:#fff');
        lines.push('    classDef failed fill:#ef4444,stroke:#dc2626,color:#fff');
        lines.push('    classDef pending fill:#6b7280,stroke:#4b5563,color:#fff');
        return lines.join('\n');
    }
    static getMermaidNodeStyle(task) {
        switch (task.status) {
            case 'completed':
                return ':::completed';
            case 'running':
                return ':::running';
            case 'failed':
                return ':::failed';
            default:
                return ':::pending';
        }
    }
    static generateTaskList(tasks, dag) {
        return `## Task Breakdown

### Tasks by Level

${dag.levels
            .map((level, idx) => `#### Level ${idx + 1}

${level
            .map((taskId) => {
            const task = tasks.find((t) => t.id === taskId);
            if (!task)
                return '';
            return this.formatTask(task, dag);
        })
            .join('\n\n')}`)
            .join('\n\n')}`;
    }
    static formatTask(task, dag) {
        const deps = dag.edges
            .filter((e) => e.to === task.id)
            .map((e) => e.from);
        const status = this.getStatusEmoji(task.status || 'idle');
        return `**${task.id}**: ${task.title}
- ${status} Status: \`${task.status || 'idle'}\`
- 🎯 Agent: \`${task.assignedAgent}\`
- ⏱️  Est. Duration: ${task.estimatedDuration || 'N/A'} min
- 🔗 Dependencies: ${deps.length > 0 ? deps.join(', ') : 'None'}
${task.severity ? `- 🚨 Severity: ${task.severity}` : ''}`;
    }
    static getStatusEmoji(status) {
        const emojiMap = {
            idle: '⏸️',
            running: '▶️',
            completed: '✅',
            failed: '❌',
            escalated: '🚨',
        };
        return emojiMap[status] || '❓';
    }
    static generateProgressSection(tasks) {
        const completed = tasks.filter((t) => t.status === 'completed').length;
        const running = tasks.filter((t) => t.status === 'running').length;
        const failed = tasks.filter((t) => t.status === 'failed').length;
        const pending = tasks.length - completed - running - failed;
        const percentage = Math.round((completed / tasks.length) * 100);
        return `## Progress

### Current Status

\`\`\`
████████${percentage >= 50 ? '████████' : '░░░░░░░░'}░░░░░░░░  ${percentage}%
\`\`\`

| Metric | Count | Percentage |
|--------|-------|------------|
| ✅ Completed | ${completed} | ${Math.round((completed / tasks.length) * 100)}% |
| ▶️  Running | ${running} | ${Math.round((running / tasks.length) * 100)}% |
| ⏸️  Pending | ${pending} | ${Math.round((pending / tasks.length) * 100)}% |
| ❌ Failed | ${failed} | ${Math.round((failed / tasks.length) * 100)}% |
| **Total** | **${tasks.length}** | **100%** |

### Timeline

- **Started**: ${new Date().toISOString()}
- **Last Updated**: ${new Date().toISOString()}
- **Estimated Completion**: TBD

### Active Tasks

${running > 0 ? tasks.filter((t) => t.status === 'running').map((t) => `- ${t.id}: ${t.title}`).join('\n') : '_No tasks currently running_'}`;
    }
    static generateProgressSectionFromReport(report) {
        const { summary, tasks } = report;
        const percentage = Math.round(summary.successRate);
        return `## Progress

### Current Status

\`\`\`
████████${percentage >= 50 ? '████████' : '░░░░░░░░'}░░░░░░░░  ${percentage}%
\`\`\`

| Metric | Count | Percentage |
|--------|-------|------------|
| ✅ Completed | ${summary.completed} | ${Math.round((summary.completed / summary.total) * 100)}% |
| ❌ Failed | ${summary.failed} | ${Math.round((summary.failed / summary.total) * 100)}% |
| 🚨 Escalated | ${summary.escalated} | ${Math.round((summary.escalated / summary.total) * 100)}% |
| **Total** | **${summary.total}** | **100%** |

### Timeline

- **Started**: ${new Date(report.startTime).toISOString()}
- **Completed**: ${new Date(report.endTime).toISOString()}
- **Duration**: ${Math.round(report.totalDurationMs / 1000 / 60)} minutes

### Completed Tasks

${tasks.filter((t) => t.status === 'completed').map((t) => `- ✅ ${t.taskId} (${t.durationMs}ms)`).join('\n')}

### Failed Tasks

${tasks.filter((t) => t.status === 'failed').length > 0 ? tasks.filter((t) => t.status === 'failed').map((t) => `- ❌ ${t.taskId}: ${t.error || 'Unknown error'}`).join('\n') : '_No failed tasks_'}`;
    }
    static generateDecisions(decisions) {
        return `## Decisions Log

### Key Decisions

${decisions.length > 0 ? decisions.map((d, idx) => `${idx + 1}. ${d}`).join('\n') : '_No decisions logged yet_'}

---

**How to use this section**:
- Log important architectural decisions
- Document trade-offs and reasoning
- Record blockers and resolutions
- Note deviations from original plan`;
    }
    static generateRecommendations(recommendations) {
        if (recommendations.length === 0) {
            return `## Recommendations

_No recommendations at this time_`;
        }
        return `## Recommendations

${recommendations.map((r, idx) => `${idx + 1}. ${r}`).join('\n')}`;
    }
    static generateFooter() {
        return `---

**Generated by**: CoordinatorAgent + PlansGenerator
**Pattern**: Feler's 7-hour Session (OpenAI Dev Day)
**Purpose**: Maintain trajectory during long autonomous sessions

🤖 This document updates automatically as tasks execute`;
    }
    // ============================================================================
    // Helper Methods
    // ============================================================================
    static groupTasksByType(tasks) {
        const groups = {};
        for (const task of tasks) {
            groups[task.type] = (groups[task.type] || 0) + 1;
        }
        return groups;
    }
}
//# sourceMappingURL=plans-generator.js.map