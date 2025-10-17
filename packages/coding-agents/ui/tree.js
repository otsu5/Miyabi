/**
 * agents/ui/tree.ts
 *
 * Tree structure formatter for displaying hierarchical data
 * Provides beautiful tree rendering with colors and icons
 */
import chalk from 'chalk';
import { theme } from './theme';
/**
 * Render a tree structure
 */
export function renderTree(nodes, options) {
    const { compact = false, showIcons = true, useColors = true } = options || {};
    const lines = [];
    nodes.forEach((node, index) => {
        const isLast = index === nodes.length - 1;
        renderNode(node, '', isLast, lines, { compact, showIcons, useColors });
    });
    return lines.join('\n');
}
/**
 * Recursively render a node and its children
 */
function renderNode(node, prefix, isLast, lines, options) {
    const { compact, showIcons, useColors } = options;
    // Choose tree characters
    const branch = isLast ? '└─ ' : '├─ ';
    const verticalLine = isLast ? '   ' : '│  ';
    // Build the line
    let line = prefix + branch;
    // Icon
    if (showIcons && node.icon) {
        line += node.icon + ' ';
    }
    else if (showIcons && node.status) {
        line += getStatusIcon(node.status) + ' ';
    }
    // Label
    const label = useColors && node.color
        ? chalk.hex(node.color)(node.label)
        : useColors && node.status
            ? colorizeByStatus(node.label, node.status)
            : node.label;
    line += label;
    // Meta
    if (node.meta) {
        line += ' ' + chalk.gray(node.meta);
    }
    lines.push(line);
    // Render children
    if (node.children && node.children.length > 0) {
        const childPrefix = prefix + verticalLine;
        node.children.forEach((child, index) => {
            if (!compact || index === 0) {
                // Add spacing in non-compact mode
            }
            const isChildLast = index === node.children.length - 1;
            renderNode(child, childPrefix, isChildLast, lines, options);
        });
    }
}
/**
 * Get status icon
 */
function getStatusIcon(status) {
    switch (status) {
        case 'success':
            return chalk.hex(theme.colors.success)('✓');
        case 'error':
            return chalk.hex(theme.colors.error)('✗');
        case 'warning':
            return chalk.hex(theme.colors.warning)('⚠');
        case 'info':
            return chalk.hex(theme.colors.info)('ℹ');
        default:
            return chalk.gray('•');
    }
}
/**
 * Colorize label by status
 */
function colorizeByStatus(label, status) {
    switch (status) {
        case 'success':
            return chalk.hex(theme.colors.success)(label);
        case 'error':
            return chalk.hex(theme.colors.error)(label);
        case 'warning':
            return chalk.hex(theme.colors.warning)(label);
        case 'info':
            return chalk.hex(theme.colors.info)(label);
        default:
            return label;
    }
}
export function renderFileTree(files) {
    const treeNodes = files.map(fileToTreeNode);
    return renderTree(treeNodes, { showIcons: true, useColors: true });
}
function fileToTreeNode(file) {
    const icon = file.type === 'directory' ? '📁' : '📄';
    let meta;
    if (file.type === 'file' && file.size !== undefined) {
        meta = formatFileSize(file.size);
    }
    return {
        label: file.name,
        icon,
        meta,
        color: file.type === 'directory' ? theme.colors.info : theme.colors.white,
        children: file.children?.map(fileToTreeNode),
    };
}
export function renderDependencyTree(deps) {
    const treeNodes = deps.map(depToTreeNode);
    return renderTree(treeNodes, { showIcons: false, compact: true });
}
function depToTreeNode(dep) {
    const label = dep.version ? `${dep.name}@${dep.version}` : dep.name;
    return {
        label,
        color: theme.colors.primary,
        children: dep.dependencies?.map(depToTreeNode),
    };
}
export function renderTaskTree(tasks) {
    const treeNodes = tasks.map(taskToTreeNode);
    return renderTree(treeNodes, { showIcons: true, useColors: true });
}
function taskToTreeNode(task) {
    const statusMap = {
        pending: 'info',
        running: 'info',
        success: 'success',
        error: 'error',
    };
    let meta = '';
    if (task.agent) {
        meta += `[${task.agent}]`;
    }
    if (task.duration !== undefined) {
        meta += ` ${formatDuration(task.duration)}`;
    }
    return {
        label: `#${task.id}: ${task.title}`,
        status: statusMap[task.status],
        meta: meta || undefined,
        children: task.dependencies?.map(taskToTreeNode),
    };
}
export function renderAgentExecutionTree(executions) {
    const treeNodes = executions.map(exec => {
        const totalDuration = exec.tasks.reduce((sum, t) => sum + t.duration, 0);
        return {
            label: exec.agent,
            icon: '🤖',
            color: theme.colors.agent,
            meta: `(${formatDuration(totalDuration)})`,
            children: exec.tasks.map(task => ({
                label: task.name,
                status: task.status,
                meta: formatDuration(task.duration),
                children: task.subtasks?.map(sub => ({
                    label: sub.name,
                    status: sub.status,
                    meta: formatDuration(sub.duration),
                })),
            })),
        };
    });
    return renderTree(treeNodes, { showIcons: true, useColors: true });
}
export function renderFlowTree(flow) {
    const treeNodes = flow.map(flowToTreeNode);
    return renderTree(treeNodes, { showIcons: true, useColors: true });
}
function flowToTreeNode(step) {
    const statusMap = {
        pending: 'info',
        running: 'info',
        success: 'success',
        error: 'error',
        skipped: undefined,
    };
    const children = [];
    if (step.parallel && step.parallel.length > 0) {
        children.push({
            label: chalk.gray('⇉ Parallel'),
            children: step.parallel.map(flowToTreeNode),
        });
    }
    if (step.sequential && step.sequential.length > 0) {
        children.push({
            label: chalk.gray('→ Sequential'),
            children: step.sequential.map(flowToTreeNode),
        });
    }
    return {
        label: step.name,
        status: statusMap[step.status],
        children: children.length > 0 ? children : undefined,
    };
}
/**
 * Helper: Format file size
 */
function formatFileSize(bytes) {
    if (bytes < 1024) {
        return `${bytes}B`;
    }
    else if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)}KB`;
    }
    else {
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    }
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
//# sourceMappingURL=tree.js.map