/**
 * Agentic OS Theme — Color Scheme & Visual Constants
 *
 * Addresses Issue #4 - Rich CLI Output Styling
 *
 * Inspired by:
 * - Vercel CLI (clean, modern)
 * - Vite CLI (fast feedback)
 * - Remix CLI (colorful)
 */
export const theme = {
    /**
     * Color Palette (Hex colors for chalk)
     * Carefully chosen for readability in both light and dark terminals
     */
    colors: {
        // Primary (Brand)
        primary: '#00D9FF', // Cyan - Headers, titles, brand elements
        primaryDim: '#0099CC', // Dimmed cyan for secondary text
        // Status Colors
        success: '#00FF88', // Green - Success states, completions
        warning: '#FFB800', // Orange - Warnings, cautions
        error: '#FF4444', // Red - Errors, failures
        info: '#8B88FF', // Purple - Info messages, hints
        // Agent-specific
        agent: '#FF79C6', // Pink - Agent names, AI actions
        human: '#F1FA8C', // Yellow - Human actions, Guardian
        // UI Elements
        muted: '#6B7280', // Gray - Secondary text, comments
        border: '#3F3F46', // Dark gray - Borders, dividers
        background: '#1E1E1E', // Dark - Background (if needed)
        white: '#FFFFFF', // White - High contrast text
        // Special
        gradient: ['#00D9FF', '#8B88FF', '#FF79C6'], // Cyan → Purple → Pink
    },
    /**
     * Symbols & Icons
     * Using Unicode characters for maximum compatibility
     */
    symbols: {
        // Status
        success: '✔',
        error: '✖',
        warning: '⚠',
        info: 'ℹ',
        question: '?',
        // Navigation
        arrow: '→',
        arrowRight: '→',
        arrowLeft: '←',
        arrowUp: '↑',
        arrowDown: '↓',
        // Bullets & Lists
        bullet: '•',
        circle: '○',
        circleFilled: '●',
        square: '□',
        squareFilled: '■',
        // Progress
        tick: '✓',
        cross: '✗',
        ellipsis: '…',
        pointerSmall: '›',
        // Special
        star: '★',
        heart: '♥',
        lightning: '⚡',
        fire: '🔥',
        rocket: '🚀',
        robot: '🤖',
        human: '👤',
        // Spinners (used by ora)
        spinner: {
            dots: 'dots',
            line: 'line',
            arc: 'arc',
            arrow: 'arrow3',
        },
    },
    /**
     * Box Drawing Characters
     * Unicode box-drawing characters for borders
     */
    borders: {
        // Single line: ┌─┐│└─┘
        single: {
            topLeft: '┌',
            topRight: '┐',
            bottomLeft: '└',
            bottomRight: '┘',
            horizontal: '─',
            vertical: '│',
            cross: '┼',
        },
        // Double line: ╔═╗║╚═╝
        double: {
            topLeft: '╔',
            topRight: '╗',
            bottomLeft: '╚',
            bottomRight: '╝',
            horizontal: '═',
            vertical: '║',
            cross: '╬',
        },
        // Round: ╭─╮│╰─╯
        round: {
            topLeft: '╭',
            topRight: '╮',
            bottomLeft: '╰',
            bottomRight: '╯',
            horizontal: '─',
            vertical: '│',
            cross: '┼',
        },
        // Bold: ┏━┓┃┗━┛
        bold: {
            topLeft: '┏',
            topRight: '┓',
            bottomLeft: '┗',
            bottomRight: '┛',
            horizontal: '━',
            vertical: '┃',
            cross: '╋',
        },
        // Heavy double dash: ╒═╕│╘═╛
        heavyDash: {
            topLeft: '╒',
            topRight: '╕',
            bottomLeft: '╘',
            bottomRight: '╛',
            horizontal: '═',
            vertical: '│',
            cross: '┼',
        },
    },
    /**
     * Boxen Styles (for boxen library)
     */
    boxStyles: {
        round: 'round',
        single: 'single',
        double: 'double',
        bold: 'bold',
        singleDouble: 'singleDouble',
        doubleSingle: 'doubleSingle',
        classic: 'classic',
    },
    /**
     * Spacing & Layout
     */
    spacing: {
        padding: {
            small: 1,
            medium: 2,
            large: 3,
        },
        margin: {
            small: 1,
            medium: 2,
            large: 3,
        },
        indent: '  ', // 2 spaces
        doubleIndent: '    ', // 4 spaces
    },
    /**
     * Typography
     */
    typography: {
        // Emphasis
        bold: true,
        dim: true,
        italic: false, // Not widely supported in terminals
        underline: true,
        strikethrough: false,
        // Headers
        h1: { bold: true, color: 'primary' },
        h2: { bold: true, color: 'primaryDim' },
        h3: { bold: false, color: 'primary' },
    },
    /**
     * Progress Bar Characters
     */
    progressBar: {
        complete: '█',
        incomplete: '░',
        head: '▓',
        // Alternative style
        alt: {
            complete: '■',
            incomplete: '□',
            head: '▣',
        },
    },
    /**
     * Dividers
     */
    dividers: {
        light: '─'.repeat(60),
        heavy: '━'.repeat(60),
        double: '═'.repeat(60),
        dashed: '╌'.repeat(60),
        dotted: '┄'.repeat(60),
    },
};
/**
 * Agent-specific color assignments
 */
export const agentColors = {
    CoordinatorAgent: theme.colors.agent,
    CodeGenAgent: theme.colors.primary,
    ReviewAgent: theme.colors.info,
    IssueAgent: theme.colors.success,
    PRAgent: theme.colors.primaryDim,
    DeploymentAgent: theme.colors.warning,
    SCRIPT: theme.colors.info,
    REGISTRATION: theme.colors.primaryDim,
    Unknown: theme.colors.muted,
};
/**
 * Severity level colors
 */
export const severityColors = {
    'Sev.1-Critical': theme.colors.error,
    'Sev.2-High': theme.colors.warning,
    'Sev.3-Medium': theme.colors.info,
    'Sev.4-Low': theme.colors.muted,
};
/**
 * Phase colors
 */
export const phaseColors = {
    'Phase 1': '#FF6B6B',
    'Phase 2': '#FFA500',
    'Phase 3': '#FFD700',
    'Phase 4': '#00FF88',
    'Phase 5': '#00D9FF',
    'Phase 6': '#8B88FF',
    'Phase 7': '#FF79C6',
    'Phase 8': '#F1FA8C',
    'Phase 9': '#BD93F9',
    'Phase 10': '#50FA7B',
};
//# sourceMappingURL=theme.js.map