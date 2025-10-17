/**
 * Agent Types and Interfaces
 *
 * Core type definitions for the Autonomous Operations Agent system
 */
// ============================================================================
// Error Types
// ============================================================================
export class AgentError extends Error {
    agentType;
    taskId;
    cause;
    constructor(message, agentType, taskId, cause) {
        super(message);
        this.agentType = agentType;
        this.taskId = taskId;
        this.cause = cause;
        this.name = 'AgentError';
    }
}
export class EscalationError extends Error {
    target;
    severity;
    context;
    constructor(message, target, severity, context) {
        super(message);
        this.target = target;
        this.severity = severity;
        this.context = context;
        this.name = 'EscalationError';
    }
}
export class CircularDependencyError extends Error {
    cycle;
    constructor(message, cycle) {
        super(message);
        this.cycle = cycle;
        this.name = 'CircularDependencyError';
    }
}
// ============================================================================
// Performance Metrics Types (E15)
// ============================================================================
export * from './performance-metrics';
// ============================================================================
// Feedback Loop System Types
// ============================================================================
export * from './feedback-loop-types';
// Entity Relation Mapping types (N1/N2/N3 notation)
export { EntityLevel, RelationStrength, EntityRelationMap, WorkflowTemplate } from './entity-relation-mapping';
//# sourceMappingURL=index.js.map