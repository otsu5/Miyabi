/**
 * RichLogger — Beautiful CLI Output System
 *
 * Addresses Issue #4 - Rich CLI Output Styling
 *
 * Provides a unified API for rich terminal output with:
 * - Colors (chalk)
 * - Boxes (boxen)
 * - Tables (cli-table3)
 * - Spinners (ora)
 * - Gradients (gradient-string)
 * - ASCII Art (figlet)
 */
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import gradient from 'gradient-string';
import figlet from 'figlet';
import logSymbols from 'log-symbols';
import { theme, agentColors } from './theme';
export class RichLogger {
    indentLevel = 0;
    /**
     * Output raw text (no styling)
     */
    raw(text) {
        console.log(text);
    }
    /**
     * Main header (large, gradient)
     */
    header(text, useGradient = true) {
        console.log('');
        if (useGradient) {
            const gradientText = gradient(...theme.colors.gradient)(text);
            console.log(chalk.bold(gradientText));
        }
        else {
            console.log(chalk.hex(theme.colors.primary).bold(text));
        }
        console.log(theme.dividers.heavy);
        console.log('');
    }
    /**
     * Sub-header (medium, colored)
     */
    subheader(text) {
        console.log('');
        console.log(chalk.hex(theme.colors.primary).bold(text));
        console.log(theme.dividers.light);
    }
    /**
     * Section header (small, with emoji)
     */
    section(emoji, text) {
        console.log('');
        console.log(`${emoji} ${chalk.hex(theme.colors.primary).bold(text)}`);
    }
    /**
     * Success message
     */
    success(message, options = {}) {
        const symbol = logSymbols.success;
        const styled = chalk.hex(theme.colors.success)(message);
        this.log(`${symbol} ${styled}`, options);
    }
    /**
     * Error message
     */
    error(message, error, options = {}) {
        const symbol = logSymbols.error;
        const styled = chalk.hex(theme.colors.error)(message);
        this.log(`${symbol} ${styled}`, options);
        if (error) {
            const indent = '  ';
            console.log(chalk.hex(theme.colors.muted)(`${indent}${error.message}`));
            if (error.stack) {
                const stackLines = error.stack.split('\n').slice(1, 4); // First 3 lines
                stackLines.forEach((line) => {
                    console.log(chalk.hex(theme.colors.muted)(`${indent}${line.trim()}`));
                });
            }
        }
    }
    /**
     * Warning message
     */
    warning(message, options = {}) {
        const symbol = logSymbols.warning;
        const styled = chalk.hex(theme.colors.warning)(message);
        this.log(`${symbol} ${styled}`, options);
    }
    /**
     * Warning message (alias for warning())
     */
    warn(message, options = {}) {
        this.warning(message, options);
    }
    /**
     * Info message
     */
    info(message, options = {}) {
        const symbol = logSymbols.info;
        const styled = chalk.hex(theme.colors.info)(message);
        this.log(`${symbol} ${styled}`, options);
    }
    /**
     * Agent-specific message
     */
    agent(agentName, message, options = {}) {
        const color = agentColors[agentName] || theme.colors.agent;
        const emoji = theme.symbols.robot;
        const agentLabel = chalk.hex(color).bold(agentName);
        const styled = chalk.white(message);
        this.log(`${emoji} ${agentLabel}: ${styled}`, options);
    }
    /**
     * Human/Guardian message
     */
    human(message, options = {}) {
        const emoji = theme.symbols.human;
        const styled = chalk.hex(theme.colors.human)(message);
        this.log(`${emoji} ${styled}`, options);
    }
    /**
     * Dimmed/muted message
     */
    muted(message, options = {}) {
        const styled = chalk.hex(theme.colors.muted)(message);
        this.log(styled, options);
    }
    /**
     * Generic log with indentation support
     */
    log(message, options = {}) {
        const indent = theme.spacing.indent.repeat(options.indent || this.indentLevel);
        const prefix = options.prefix ? `${options.prefix} ` : '';
        console.log(`${indent}${prefix}${message}`);
        if (options.newline) {
            console.log('');
        }
    }
    /**
     * Bullet list item
     */
    bullet(message, level = 0) {
        const indent = theme.spacing.indent.repeat(level);
        const bullet = theme.symbols.bullet;
        console.log(`${indent}${bullet} ${message}`);
    }
    /**
     * Create a box around content
     */
    box(content, options = {}) {
        const boxedContent = boxen(content, {
            padding: options.padding ?? 1,
            margin: options.margin ?? 0,
            borderStyle: options.borderStyle ?? 'round',
            borderColor: options.borderColor ?? theme.colors.primary,
            align: options.align ?? 'left',
            title: options.title,
            titleAlignment: 'center',
        });
        console.log(boxedContent);
    }
    /**
     * Start a spinner
     */
    startSpinner(text, spinnerType = 'dots') {
        return ora({
            text: chalk.hex(theme.colors.info)(text),
            spinner: spinnerType,
            color: 'cyan',
        }).start();
    }
    /**
     * Stop a spinner with success
     */
    stopSpinnerSuccess(spinner, text) {
        spinner.succeed(text ? chalk.hex(theme.colors.success)(text) : undefined);
    }
    /**
     * Stop a spinner with failure
     */
    stopSpinnerFail(spinner, text) {
        spinner.fail(text ? chalk.hex(theme.colors.error)(text) : undefined);
    }
    /**
     * Stop a spinner with warning
     */
    stopSpinnerWarn(spinner, text) {
        spinner.warn(text ? chalk.hex(theme.colors.warning)(text) : undefined);
    }
    /**
     * Stop a spinner with info
     */
    stopSpinnerInfo(spinner, text) {
        spinner.info(text ? chalk.hex(theme.colors.info)(text) : undefined);
    }
    /**
     * ASCII art banner
     */
    banner(text, font = 'Standard') {
        return new Promise((resolve, reject) => {
            figlet.text(text, {
                font: font,
                horizontalLayout: 'default',
                verticalLayout: 'default',
            }, (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }
                const gradientText = gradient(...theme.colors.gradient)(data || '');
                console.log(gradientText);
                resolve();
            });
        });
    }
    /**
     * Gradient text
     */
    gradient(text) {
        const gradientText = gradient(...theme.colors.gradient)(text);
        console.log(gradientText);
    }
    /**
     * Divider line
     */
    divider(type = 'light') {
        const dividerMap = {
            light: theme.dividers.light,
            heavy: theme.dividers.heavy,
            double: theme.dividers.double,
        };
        console.log(chalk.hex(theme.colors.muted)(dividerMap[type]));
    }
    /**
     * Empty line
     */
    newline(count = 1) {
        for (let i = 0; i < count; i++) {
            console.log('');
        }
    }
    /**
     * Increase indent level
     */
    indent() {
        this.indentLevel++;
    }
    /**
     * Decrease indent level
     */
    outdent() {
        if (this.indentLevel > 0) {
            this.indentLevel--;
        }
    }
    /**
     * Reset indent level
     */
    resetIndent() {
        this.indentLevel = 0;
    }
    /**
     * Progress bar (simple text-based)
     */
    progressBar(current, total, width = 30) {
        const percentage = Math.round((current / total) * 100);
        const filled = Math.round((current / total) * width);
        const empty = width - filled;
        const bar = theme.progressBar.complete.repeat(filled) +
            theme.progressBar.incomplete.repeat(empty);
        return `${chalk.hex(theme.colors.primary)(bar)} ${percentage}%`;
    }
    /**
     * Key-value pair
     */
    keyValue(key, value, color = theme.colors.info) {
        const keyStyled = chalk.hex(theme.colors.muted)(`${key}:`);
        const valueStyled = chalk.hex(color)(value);
        console.log(`${keyStyled} ${valueStyled}`);
    }
    /**
     * Status indicator
     */
    status(label, status) {
        const symbolMap = {
            success: logSymbols.success,
            error: logSymbols.error,
            warning: logSymbols.warning,
            info: logSymbols.info,
            pending: '⏳',
        };
        const colorMap = {
            success: theme.colors.success,
            error: theme.colors.error,
            warning: theme.colors.warning,
            info: theme.colors.info,
            pending: theme.colors.muted,
        };
        const symbol = symbolMap[status];
        const color = colorMap[status];
        const styled = chalk.hex(color)(`${symbol} ${label}`);
        console.log(styled);
    }
    /**
     * Clear console
     */
    clear() {
        console.clear();
    }
}
// Export singleton instance
export const logger = new RichLogger();
//# sourceMappingURL=logger.js.map