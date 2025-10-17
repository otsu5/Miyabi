/**
 * DAGManager - Directed Acyclic Graph Manager
 *
 * Responsibilities:
 * - Build dependency graph from tasks
 * - Detect circular dependencies (cycles)
 * - Topological sorting for execution order
 * - Generate execution recommendations
 *
 * Uses standard graph algorithms:
 * - Kahn's Algorithm for topological sorting
 * - DFS for cycle detection
 */
/**
 * DAG Manager - Centralized graph operations
 */
export class DAGManager {
    /**
     * Build Directed Acyclic Graph from tasks
     *
     * Creates a dependency graph showing relationships between tasks.
     * Each edge represents a "must complete before" relationship.
     *
     * @param tasks - Array of tasks with dependencies
     * @returns DAG with nodes, edges, and topologically sorted levels
     */
    static buildDAG(tasks) {
        const nodes = tasks;
        const edges = [];
        // Build edges from task dependencies
        for (const task of tasks) {
            for (const depId of task.dependencies) {
                // Find the dependency task by ID or issue number
                const depTask = tasks.find((t) => t.id === depId ||
                    t.metadata?.issueNumber === parseInt(depId.replace('issue-', '')));
                if (depTask) {
                    // Edge points from dependency to dependent task
                    edges.push({ from: depTask.id, to: task.id });
                }
            }
        }
        // Perform topological sort to get execution levels
        const levels = this.topologicalSort(nodes, edges);
        return { nodes, edges, levels };
    }
    /**
     * Topological sort using Kahn's Algorithm
     *
     * Groups tasks into levels where:
     * - Level 0: Tasks with no dependencies (can start immediately)
     * - Level N: Tasks that depend only on tasks in levels 0 to N-1
     *
     * This enables maximum parallelism within each level.
     *
     * @param tasks - Array of tasks
     * @param edges - Dependency edges
     * @returns Array of levels, each containing task IDs that can execute in parallel
     */
    static topologicalSort(tasks, edges) {
        // Initialize in-degree count and adjacency list
        const inDegree = new Map();
        const adjList = new Map();
        for (const task of tasks) {
            inDegree.set(task.id, 0);
            adjList.set(task.id, []);
        }
        // Build adjacency list and calculate in-degrees
        for (const edge of edges) {
            adjList.get(edge.from).push(edge.to);
            inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
        }
        // Kahn's algorithm: process nodes level by level
        const levels = [];
        let currentLevel = tasks
            .filter((t) => inDegree.get(t.id) === 0)
            .map((t) => t.id);
        while (currentLevel.length > 0) {
            levels.push([...currentLevel]);
            const nextLevel = [];
            // Process all nodes in current level
            for (const taskId of currentLevel) {
                const neighbors = adjList.get(taskId) || [];
                for (const neighbor of neighbors) {
                    // Decrease in-degree for each neighbor
                    const newInDegree = (inDegree.get(neighbor) || 0) - 1;
                    inDegree.set(neighbor, newInDegree);
                    // If in-degree becomes 0, add to next level
                    if (newInDegree === 0) {
                        nextLevel.push(neighbor);
                    }
                }
            }
            currentLevel = nextLevel;
        }
        return levels;
    }
    /**
     * Detect circular dependencies using DFS
     *
     * A cycle exists if we encounter a node that's already in the current
     * recursion stack during depth-first traversal.
     *
     * @param dag - The DAG to check
     * @returns true if cycles detected, false otherwise
     */
    static detectCycles(dag) {
        const visited = new Set();
        const recursionStack = new Set();
        // Build adjacency list
        const adjList = new Map();
        for (const node of dag.nodes) {
            adjList.set(node.id, []);
        }
        for (const edge of dag.edges) {
            adjList.get(edge.from).push(edge.to);
        }
        // DFS helper function
        const hasCycle = (nodeId) => {
            visited.add(nodeId);
            recursionStack.add(nodeId);
            const neighbors = adjList.get(nodeId) || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    // Recursively check neighbor
                    if (hasCycle(neighbor))
                        return true;
                }
                else if (recursionStack.has(neighbor)) {
                    // Back edge detected = cycle!
                    return true;
                }
            }
            // Remove from recursion stack before returning
            recursionStack.delete(nodeId);
            return false;
        };
        // Check all nodes (handles disconnected components)
        for (const node of dag.nodes) {
            if (!visited.has(node.id)) {
                if (hasCycle(node.id)) {
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * Find the cycle path (for debugging)
     *
     * If a cycle exists, return the path of task IDs forming the cycle.
     *
     * @param dag - The DAG to analyze
     * @returns Array of task IDs forming a cycle, or empty array if no cycle
     */
    static findCyclePath(dag) {
        const visited = new Set();
        const recursionStack = new Set();
        const adjList = new Map();
        for (const node of dag.nodes) {
            adjList.set(node.id, []);
        }
        for (const edge of dag.edges) {
            adjList.get(edge.from).push(edge.to);
        }
        const findCycle = (nodeId, currentPath) => {
            visited.add(nodeId);
            recursionStack.add(nodeId);
            currentPath.push(nodeId);
            const neighbors = adjList.get(nodeId) || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    const cyclePath = findCycle(neighbor, [...currentPath]);
                    if (cyclePath.length > 0)
                        return cyclePath;
                }
                else if (recursionStack.has(neighbor)) {
                    // Found cycle! Return path from neighbor to current node
                    const cycleStart = currentPath.indexOf(neighbor);
                    return currentPath.slice(cycleStart).concat(neighbor);
                }
            }
            recursionStack.delete(nodeId);
            return [];
        };
        for (const node of dag.nodes) {
            if (!visited.has(node.id)) {
                const cyclePath = findCycle(node.id, []);
                if (cyclePath.length > 0)
                    return cyclePath;
            }
        }
        return [];
    }
    /**
     * Generate execution recommendations based on DAG analysis
     *
     * Analyzes the graph structure to provide optimization suggestions.
     *
     * @param tasks - Array of tasks
     * @param dag - The dependency graph
     * @returns Array of recommendation strings
     */
    static generateRecommendations(tasks, dag) {
        const recommendations = [];
        // 1. Check for high parallelism opportunities
        const maxLevelSize = Math.max(...dag.levels.map((l) => l.length));
        if (maxLevelSize > 3) {
            recommendations.push(`High parallelism opportunity: Level with ${maxLevelSize} independent tasks`);
        }
        // 2. Check for critical tasks
        const criticalTasks = tasks.filter((t) => t.severity === 'Sev.1-Critical' || t.impact === 'Critical');
        if (criticalTasks.length > 0) {
            recommendations.push(`${criticalTasks.length} critical tasks require immediate attention`);
        }
        // 3. Check for long duration tasks
        const longTasks = tasks.filter((t) => (t.estimatedDuration ?? 0) > 60);
        if (longTasks.length > 0) {
            recommendations.push(`${longTasks.length} tasks estimated >1 hour - consider breaking down`);
        }
        // 4. Check for dependency bottlenecks
        const taskDependencyCounts = new Map();
        for (const edge of dag.edges) {
            taskDependencyCounts.set(edge.to, (taskDependencyCounts.get(edge.to) || 0) + 1);
        }
        const bottlenecks = Array.from(taskDependencyCounts.entries())
            .filter(([_, count]) => count > 3)
            .map(([taskId]) => taskId);
        if (bottlenecks.length > 0) {
            recommendations.push(`${bottlenecks.length} tasks have >3 dependencies - potential bottlenecks`);
        }
        // 5. Check graph depth (long critical path)
        if (dag.levels.length > 5) {
            recommendations.push(`Deep dependency chain (${dag.levels.length} levels) - consider parallelization`);
        }
        return recommendations;
    }
    /**
     * Calculate critical path (longest path through DAG)
     *
     * The critical path represents the minimum time needed to complete
     * all tasks, even with unlimited parallelism.
     *
     * @param tasks - Array of tasks
     * @param dag - The dependency graph
     * @returns Duration in minutes of the critical path
     */
    static calculateCriticalPath(tasks, dag) {
        const taskMap = new Map(tasks.map((t) => [t.id, t]));
        const earliestStart = new Map();
        // Initialize all tasks with 0 start time
        for (const task of tasks) {
            earliestStart.set(task.id, 0);
        }
        // Process levels in order (topological order guaranteed)
        for (const level of dag.levels) {
            for (const taskId of level) {
                // Find maximum completion time of all dependencies
                let maxPredecessorEnd = 0;
                for (const edge of dag.edges) {
                    if (edge.to === taskId) {
                        const predTask = taskMap.get(edge.from);
                        const predStart = earliestStart.get(edge.from) || 0;
                        const predEnd = predStart + (predTask.estimatedDuration ?? 0);
                        maxPredecessorEnd = Math.max(maxPredecessorEnd, predEnd);
                    }
                }
                earliestStart.set(taskId, maxPredecessorEnd);
            }
        }
        // Critical path length is the maximum completion time
        let criticalPathLength = 0;
        for (const task of tasks) {
            const start = earliestStart.get(task.id) || 0;
            const end = start + (task.estimatedDuration ?? 0);
            criticalPathLength = Math.max(criticalPathLength, end);
        }
        return criticalPathLength;
    }
    /**
     * Get execution statistics
     *
     * @param tasks - Array of tasks
     * @param dag - The dependency graph
     * @returns Statistics object
     */
    static getStatistics(tasks, dag) {
        return {
            totalTasks: tasks.length,
            totalEdges: dag.edges.length,
            levels: dag.levels.length,
            maxParallelism: Math.max(...dag.levels.map((l) => l.length)),
            averageTasksPerLevel: tasks.length / dag.levels.length,
            criticalPathDuration: this.calculateCriticalPath(tasks, dag),
            hasCycles: this.detectCycles(dag),
        };
    }
}
//# sourceMappingURL=dag-manager.js.map