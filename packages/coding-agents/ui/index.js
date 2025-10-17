/**
 * Agentic OS UI System — Unified Exports
 *
 * Addresses Issue #4 - Rich CLI Output Styling
 *
 * Usage:
 * ```typescript
 * import { logger, theme } from '@miyabi/coding-agents/ui/index';
 *
 * logger.header('Agentic OS');
 * logger.agent('CoordinatorAgent', 'Starting execution...');
 * logger.success('Task completed!');
 * ```
 */
// Core exports
export { RichLogger, logger } from './logger';
export { theme, agentColors, severityColors, phaseColors } from './theme';
// Phase 2: Formatters
export * from './table';
export * from './box';
export * from './progress';
export * from './tree';
//# sourceMappingURL=index.js.map