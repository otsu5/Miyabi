/**
 * Entity Relation Mapping System
 *
 * LLM-optimized entity relationship notation for workflow automation.
 * Ported from workflow-automation/core/entity_mapping.py
 *
 * Uses N1/N2/N3 hierarchical notation with $H (high) and $L (low) relationship markers.
 * This notation is designed to be easily parseable by LLMs and human-readable.
 *
 * @example
 * ```
 * N1:Issue $H→ N2:CoordinatorAgent $H→ N3:TaskDecomposition
 * N1:Keyword $L→ N2:SerpQuery $H→ N3:TopResults
 * ```
 */
/**
 * Entity Level - Hierarchical abstraction layers
 *
 * N1 (Primary): Root entities that initiate workflows
 * N2 (Processing): Intermediate processing entities
 * N3 (Output): Final output or result entities
 */
export var EntityLevel;
(function (EntityLevel) {
    /**
     * N1: Primary/Root entities
     * Examples: Issue, UserRequest, Keyword, RawData
     * Characteristics: User-facing, entry points, high-level concepts
     */
    EntityLevel["N1_PRIMARY"] = "N1";
    /**
     * N2: Secondary/Processing entities
     * Examples: Agent, Task, Query, Processor
     * Characteristics: Transform or process data, business logic layer
     */
    EntityLevel["N2_PROCESSING"] = "N2";
    /**
     * N3: Tertiary/Output entities
     * Examples: PR, QualityReport, Results, DeployedArtifact
     * Characteristics: Final outputs, deliverables, results
     */
    EntityLevel["N3_OUTPUT"] = "N3";
})(EntityLevel || (EntityLevel = {}));
/**
 * Relation Type - Dependency strength markers
 *
 * $H (High): Critical dependency - workflow cannot proceed without this
 * $L (Low): Optional dependency - enhances output but not required
 */
export var RelationStrength;
(function (RelationStrength) {
    /**
     * $H: High priority / Critical dependency
     * - Must be satisfied for workflow to succeed
     * - Failure blocks downstream execution
     * - Used for essential data flow
     */
    RelationStrength["HIGH"] = "$H";
    /**
     * $L: Low priority / Optional dependency
     * - Nice to have, but workflow can proceed without it
     * - Failure does not block downstream execution
     * - Used for enhancement or optimization
     */
    RelationStrength["LOW"] = "$L";
})(RelationStrength || (RelationStrength = {}));
/**
 * Entity Relation Map - Manages a collection of entities and their relationships
 *
 * This class provides methods to build and query entity-relation workflows.
 * It supports the N1:Entity $H→ N2:Entity notation format.
 *
 * @example
 * ```typescript
 * const map = new EntityRelationMap();
 *
 * // Add entities
 * const issue = map.addEntity('Issue', EntityLevel.N1_PRIMARY);
 * const coordinator = map.addEntity('CoordinatorAgent', EntityLevel.N2_PROCESSING);
 * const tasks = map.addEntity('TaskDecomposition', EntityLevel.N3_OUTPUT);
 *
 * // Add relations
 * map.addRelation(issue, coordinator, RelationStrength.HIGH);
 * map.addRelation(coordinator, tasks, RelationStrength.HIGH);
 *
 * // Generate notation
 * console.log(map.toNotation());
 * // Output: N1:Issue $H→ N2:CoordinatorAgent
 * //         N2:CoordinatorAgent $H→ N3:TaskDecomposition
 * ```
 */
export class EntityRelationMap {
    entities = new Map();
    relations = [];
    /**
     * Add an entity to the map
     *
     * @param name - Entity name
     * @param level - Entity level (N1/N2/N3)
     * @param metadata - Optional metadata
     * @returns The created entity
     */
    addEntity(name, level, metadata) {
        const key = `${level}:${name}`;
        if (this.entities.has(key)) {
            return this.entities.get(key);
        }
        const entity = { name, level, metadata };
        this.entities.set(key, entity);
        return entity;
    }
    /**
     * Add a relation between two entities
     *
     * @param source - Source entity
     * @param target - Target entity
     * @param strength - Relationship strength ($H or $L)
     * @param metadata - Optional metadata
     * @returns The created relation
     */
    addRelation(source, target, strength, metadata) {
        const relation = {
            source,
            target,
            strength,
            direction: '→',
            metadata
        };
        this.relations.push(relation);
        return relation;
    }
    /**
     * Get entity by name and level
     *
     * @param name - Entity name
     * @param level - Entity level
     * @returns Entity if found, undefined otherwise
     */
    getEntity(name, level) {
        return this.entities.get(`${level}:${name}`);
    }
    /**
     * Get all entities
     *
     * @returns Array of all entities
     */
    getAllEntities() {
        return Array.from(this.entities.values());
    }
    /**
     * Get all relations
     *
     * @returns Array of all relations
     */
    getAllRelations() {
        return this.relations;
    }
    /**
     * Get relations by source entity
     *
     * @param entity - Source entity
     * @returns Array of relations starting from this entity
     */
    getRelationsBySource(entity) {
        return this.relations.filter(r => r.source.name === entity.name && r.source.level === entity.level);
    }
    /**
     * Get relations by target entity
     *
     * @param entity - Target entity
     * @returns Array of relations ending at this entity
     */
    getRelationsByTarget(entity) {
        return this.relations.filter(r => r.target.name === entity.name && r.target.level === entity.level);
    }
    /**
     * Convert the map to N1:Entity $H→ N2:Entity notation
     *
     * @returns String representation in N1/N2/N3 notation
     */
    toNotation() {
        return this.relations.map(r => `${r.source.level}:${r.source.name} ${r.strength}${r.direction} ${r.target.level}:${r.target.name}`).join('\n');
    }
    /**
     * Parse notation string and build entity-relation map
     *
     * @param notation - Notation string (one relation per line)
     * @returns Parsed EntityRelationMap
     *
     * @example
     * ```typescript
     * const notation = `
     * N1:Issue $H→ N2:CoordinatorAgent
     * N2:CoordinatorAgent $H→ N3:TaskDecomposition
     * `;
     * const map = EntityRelationMap.fromNotation(notation);
     * ```
     */
    static fromNotation(notation) {
        const map = new EntityRelationMap();
        const lines = notation.trim().split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            // Parse: N1:EntityName $H→ N2:TargetName
            const match = trimmed.match(/^(N[123]):(\w+)\s+(\$[HL])→\s+(N[123]):(\w+)$/);
            if (!match) {
                console.warn(`Failed to parse notation: ${trimmed}`);
                continue;
            }
            const [, sourceLevel, sourceName, strength, targetLevel, targetName] = match;
            const source = map.addEntity(sourceName, sourceLevel);
            const target = map.addEntity(targetName, targetLevel);
            map.addRelation(source, target, strength);
        }
        return map;
    }
    /**
     * Export to JSON
     *
     * @returns JSON representation of the map
     */
    toJSON() {
        return {
            entities: Array.from(this.entities.values()),
            relations: this.relations.map(r => ({
                source: `${r.source.level}:${r.source.name}`,
                target: `${r.target.level}:${r.target.name}`,
                strength: r.strength
            }))
        };
    }
    /**
     * Import from JSON
     *
     * @param json - JSON representation
     * @returns Imported EntityRelationMap
     */
    static fromJSON(json) {
        const map = new EntityRelationMap();
        // Add entities
        for (const entity of json.entities) {
            map.addEntity(entity.name, entity.level, entity.metadata);
        }
        // Add relations
        for (const rel of json.relations) {
            const [sourceLevel, sourceName] = rel.source.split(':');
            const [targetLevel, targetName] = rel.target.split(':');
            const source = map.getEntity(sourceName, sourceLevel);
            const target = map.getEntity(targetName, targetLevel);
            if (source && target) {
                map.addRelation(source, target, rel.strength);
            }
        }
        return map;
    }
    /**
     * Clear all entities and relations
     */
    clear() {
        this.entities.clear();
        this.relations = [];
    }
    /**
     * Get statistics about the map
     *
     * @returns Statistics object
     */
    getStats() {
        const byLevel = {
            N1: 0,
            N2: 0,
            N3: 0
        };
        const byStrength = {
            '$H': 0,
            '$L': 0
        };
        const entities = Array.from(this.entities.values());
        for (const entity of entities) {
            byLevel[entity.level]++;
        }
        for (const relation of this.relations) {
            byStrength[relation.strength]++;
        }
        return {
            entityCount: this.entities.size,
            relationCount: this.relations.length,
            byLevel,
            byStrength
        };
    }
}
/**
 * Workflow Template - Predefined entity-relation patterns
 *
 * Common workflow patterns that can be reused across projects.
 */
export class WorkflowTemplate {
    /**
     * Issue Processing Workflow
     *
     * Standard workflow for processing GitHub Issues:
     * N1:Issue → N2:IssueAgent → N3:LabeledIssue
     * N1:Issue → N2:CoordinatorAgent → N3:TaskDecomposition
     */
    static issueProcessing() {
        const map = new EntityRelationMap();
        const issue = map.addEntity('Issue', EntityLevel.N1_PRIMARY);
        const issueAgent = map.addEntity('IssueAgent', EntityLevel.N2_PROCESSING);
        const coordinator = map.addEntity('CoordinatorAgent', EntityLevel.N2_PROCESSING);
        const labeled = map.addEntity('LabeledIssue', EntityLevel.N3_OUTPUT);
        const tasks = map.addEntity('TaskDecomposition', EntityLevel.N3_OUTPUT);
        map.addRelation(issue, issueAgent, RelationStrength.HIGH);
        map.addRelation(issueAgent, labeled, RelationStrength.HIGH);
        map.addRelation(issue, coordinator, RelationStrength.HIGH);
        map.addRelation(coordinator, tasks, RelationStrength.HIGH);
        return map;
    }
    /**
     * Code Generation Workflow
     *
     * Standard workflow for code generation:
     * N1:Task → N2:CodeGenAgent → N3:GeneratedCode
     * N2:CodeGenAgent → N2:ReviewAgent → N3:QualityReport
     */
    static codeGeneration() {
        const map = new EntityRelationMap();
        const task = map.addEntity('Task', EntityLevel.N1_PRIMARY);
        const codegen = map.addEntity('CodeGenAgent', EntityLevel.N2_PROCESSING);
        const review = map.addEntity('ReviewAgent', EntityLevel.N2_PROCESSING);
        const code = map.addEntity('GeneratedCode', EntityLevel.N3_OUTPUT);
        const report = map.addEntity('QualityReport', EntityLevel.N3_OUTPUT);
        map.addRelation(task, codegen, RelationStrength.HIGH);
        map.addRelation(codegen, code, RelationStrength.HIGH);
        map.addRelation(codegen, review, RelationStrength.HIGH);
        map.addRelation(review, report, RelationStrength.HIGH);
        return map;
    }
    /**
     * Deployment Workflow
     *
     * Standard workflow for deployment:
     * N1:PR → N2:DeploymentAgent → N3:DeployedArtifact
     * N2:DeploymentAgent → N2:HealthCheck → N3:HealthReport (optional)
     */
    static deployment() {
        const map = new EntityRelationMap();
        const pr = map.addEntity('PR', EntityLevel.N1_PRIMARY);
        const deploy = map.addEntity('DeploymentAgent', EntityLevel.N2_PROCESSING);
        const health = map.addEntity('HealthCheck', EntityLevel.N2_PROCESSING);
        const artifact = map.addEntity('DeployedArtifact', EntityLevel.N3_OUTPUT);
        const healthReport = map.addEntity('HealthReport', EntityLevel.N3_OUTPUT);
        map.addRelation(pr, deploy, RelationStrength.HIGH);
        map.addRelation(deploy, artifact, RelationStrength.HIGH);
        map.addRelation(deploy, health, RelationStrength.LOW); // Optional health check
        map.addRelation(health, healthReport, RelationStrength.LOW);
        return map;
    }
}
//# sourceMappingURL=entity-relation-mapping.js.map