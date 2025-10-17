/**
 * agents/ui/box.ts
 *
 * Box formatter for displaying content in bordered boxes
 * Provides various box styles and layouts
 */
import boxen from 'boxen';
import chalk from 'chalk';
import { theme } from './theme';
/**
 * Create a bordered box with content
 */
export function createBox(content, options) {
    const { title, titleAlignment = 'center', padding = 1, margin = 0, borderStyle = 'round', borderColor = theme.colors.primary, backgroundColor, dimBorder = false, float = 'left', width, } = options || {};
    return boxen(content, {
        title,
        titleAlignment,
        padding,
        margin,
        borderStyle,
        borderColor,
        backgroundColor,
        dimBorder,
        float,
        width,
    });
}
/**
 * Create a success box
 */
export function successBox(content, title = '✅ Success') {
    return createBox(chalk.hex(theme.colors.success)(content), {
        title,
        borderStyle: 'double',
        borderColor: theme.colors.success,
        padding: 1,
    });
}
/**
 * Create an error box
 */
export function errorBox(content, title = '❌ Error') {
    return createBox(chalk.hex(theme.colors.error)(content), {
        title,
        borderStyle: 'double',
        borderColor: theme.colors.error,
        padding: 1,
    });
}
/**
 * Create a warning box
 */
export function warningBox(content, title = '⚠️ Warning') {
    return createBox(chalk.hex(theme.colors.warning)(content), {
        title,
        borderStyle: 'round',
        borderColor: theme.colors.warning,
        padding: 1,
    });
}
/**
 * Create an info box
 */
export function infoBox(content, title = 'ℹ️ Info') {
    return createBox(chalk.hex(theme.colors.info)(content), {
        title,
        borderStyle: 'round',
        borderColor: theme.colors.info,
        padding: 1,
    });
}
/**
 * Create an agent box
 */
export function agentBox(agentName, content, options) {
    const { status } = options || {};
    let title = `🤖 ${agentName}`;
    let borderColor = theme.colors.agent;
    if (status === 'running') {
        title += ' — Running...';
        borderColor = theme.colors.info;
    }
    else if (status === 'success') {
        title += ' — ✓ Complete';
        borderColor = theme.colors.success;
    }
    else if (status === 'error') {
        title += ' — ✗ Failed';
        borderColor = theme.colors.error;
    }
    return createBox(content, {
        title,
        borderStyle: 'bold',
        borderColor,
        padding: 1,
        margin: { top: 1, bottom: 1 },
    });
}
/**
 * Create a code box
 */
export function codeBox(code, language) {
    const title = language ? `📝 ${language}` : '📝 Code';
    return createBox(chalk.gray(code), {
        title,
        borderStyle: 'classic',
        borderColor: theme.colors.muted,
        padding: 1,
    });
}
/**
 * Create a command box
 */
export function commandBox(command, description) {
    let content = chalk.cyan.bold(command);
    if (description) {
        content += '\n\n' + chalk.gray(description);
    }
    return createBox(content, {
        title: '$ Command',
        borderStyle: 'round',
        borderColor: theme.colors.primary,
        padding: 1,
    });
}
export function resultSummaryBox(summary) {
    const { success, warning, error, total, duration } = summary;
    const lines = [];
    // Stats
    lines.push(chalk.hex(theme.colors.success).bold(`✓ Success: ${success}/${total}`));
    if (warning > 0) {
        lines.push(chalk.hex(theme.colors.warning).bold(`⚠ Warning: ${warning}/${total}`));
    }
    if (error > 0) {
        lines.push(chalk.hex(theme.colors.error).bold(`✗ Error: ${error}/${total}`));
    }
    // Duration
    if (duration !== undefined) {
        lines.push('');
        lines.push(chalk.gray(`Duration: ${formatDuration(duration)}`));
    }
    // Success rate
    const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : '0.0';
    lines.push('');
    lines.push(chalk.bold(`Success Rate: ${successRate}%`));
    const borderColor = error > 0 ? theme.colors.error :
        warning > 0 ? theme.colors.warning :
            theme.colors.success;
    return createBox(lines.join('\n'), {
        title: '📊 Execution Summary',
        borderStyle: 'double',
        borderColor,
        padding: 1,
        width: 50,
    });
}
export function multiSectionBox(sections, options) {
    const { title, borderColor = theme.colors.primary } = options || {};
    const lines = [];
    sections.forEach((section, index) => {
        if (index > 0) {
            lines.push('');
            lines.push(chalk.hex(borderColor)('─'.repeat(50)));
            lines.push('');
        }
        const sectionTitle = section.color
            ? chalk.hex(section.color).bold(section.title)
            : chalk.bold(section.title);
        lines.push(sectionTitle);
        lines.push('');
        lines.push(section.content);
    });
    return createBox(lines.join('\n'), {
        title,
        borderStyle: 'round',
        borderColor,
        padding: 1,
    });
}
export function taskExecutionBox(task) {
    const { issueNumber, title, agent, status, duration, error } = task;
    const lines = [];
    // Header
    lines.push(chalk.bold(`Issue #${issueNumber}: ${title}`));
    lines.push(chalk.gray(`Agent: ${agent}`));
    lines.push('');
    // Status
    const statusText = status === 'pending' ? chalk.gray('⏳ Pending') :
        status === 'running' ? chalk.hex(theme.colors.info)('◉ Running...') :
            status === 'success' ? chalk.hex(theme.colors.success)('✓ Success') :
                chalk.hex(theme.colors.error)('✗ Failed');
    lines.push(`Status: ${statusText}`);
    // Duration
    if (duration !== undefined) {
        lines.push(`Duration: ${chalk.cyan(formatDuration(duration))}`);
    }
    // Error
    if (error) {
        lines.push('');
        lines.push(chalk.hex(theme.colors.error)('Error:'));
        lines.push(chalk.gray(error));
    }
    const borderColor = status === 'success' ? theme.colors.success :
        status === 'error' ? theme.colors.error :
            status === 'running' ? theme.colors.info :
                theme.colors.muted;
    return createBox(lines.join('\n'), {
        title: `🎯 Task Execution`,
        borderStyle: 'round',
        borderColor,
        padding: 1,
    });
}
/**
 * Helper: Format duration
 */
function formatDuration(ms) {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}
//# sourceMappingURL=box.js.map