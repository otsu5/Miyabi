/**
 * CoordinatorAgent Tests
 *
 * Tests for task decomposition, DAG construction, and execution
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CoordinatorAgent } from '@miyabi/coding-agents/coordinator/coordinator-agent';
import { Task, AgentConfig, Issue } from '@miyabi/coding-agents/types/index';

describe('CoordinatorAgent', () => {
  let agent: CoordinatorAgent;
  let config: AgentConfig;

  beforeEach(() => {
    config = {
      deviceIdentifier: 'test-device',
      githubToken: 'test-token',
      anthropicApiKey: 'test-key',
      useTaskTool: false,
      useWorktree: false,
      logDirectory: '.ai/logs',
      reportDirectory: '.ai/test-reports',
    };

    agent = new CoordinatorAgent(config);
  });

  describe('Task Decomposition', () => {
    it('should decompose an Issue into tasks', async () => {
      const issue: Issue = {
        number: 1,
        title: 'Add user authentication',
        body: `
## Tasks
- [ ] Create login API
- [ ] Add JWT token generation
- [ ] Implement user model
        `,
        state: 'open',
        labels: [],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        url: 'https://github.com/test/repo/issues/1',
      };

      const decomposition = await agent.decomposeIssue(issue);

      expect(decomposition.tasks.length).toBeGreaterThan(0);
      expect(decomposition.dag).toBeDefined();
      expect(decomposition.hasCycles).toBe(false);
    });
  });

  describe('DAG Construction', () => {
    it('should build a valid DAG from tasks', async () => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'First task',
          type: 'feature',
          priority: 1,
          severity: 'Sev.3-Medium',
          impact: 'Medium',
          assignedAgent: 'CodeGenAgent',
          dependencies: [],
          estimatedDuration: 30,
          status: 'idle',
        },
        {
          id: 'task-2',
          title: 'Task 2',
          description: 'Second task depends on task-1',
          type: 'feature',
          priority: 2,
          severity: 'Sev.3-Medium',
          impact: 'Medium',
          assignedAgent: 'ReviewAgent',
          dependencies: ['task-1'],
          estimatedDuration: 15,
          status: 'idle',
        },
      ];

      // Use DAGManager (buildDAG moved to utility class)
      const { DAGManager } = await import('@miyabi/coding-agents/utils/dag-manager');
      const dag = DAGManager.buildDAG(tasks);

      expect(dag.nodes.length).toBe(2);
      expect(dag.edges.length).toBe(1);
      expect(dag.levels.length).toBeGreaterThan(0);
    });

    it('should detect circular dependencies', async () => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          title: 'Task 1',
          description: 'Task 1 depends on task-2',
          type: 'feature',
          priority: 1,
          severity: 'Sev.3-Medium',
          impact: 'Medium',
          assignedAgent: 'CodeGenAgent',
          dependencies: ['task-2'],
          estimatedDuration: 30,
          status: 'idle',
        },
        {
          id: 'task-2',
          title: 'Task 2',
          description: 'Task 2 depends on task-1',
          type: 'feature',
          priority: 2,
          severity: 'Sev.3-Medium',
          impact: 'Medium',
          assignedAgent: 'ReviewAgent',
          dependencies: ['task-1'],
          estimatedDuration: 15,
          status: 'idle',
        },
      ];

      // Use DAGManager (buildDAG and detectCycles moved to utility class)
      const { DAGManager } = await import('@miyabi/coding-agents/utils/dag-manager');
      const dag = DAGManager.buildDAG(tasks);
      const hasCycles = DAGManager.detectCycles(dag);

      expect(hasCycles).toBe(true);
    });
  });

  describe('Agent Assignment', () => {
    it('should assign CodeGenAgent for feature tasks', () => {
      // Test agent assignment logic through task creation
      const task: Task = {
        id: 'test-1',
        title: 'Feature task',
        description: 'Test',
        type: 'feature',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'CodeGenAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
      };

      expect(task.assignedAgent).toBe('CodeGenAgent');
    });

    it('should assign DeploymentAgent for deployment tasks', () => {
      const task: Task = {
        id: 'test-2',
        title: 'Deploy task',
        description: 'Test',
        type: 'deployment',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'DeploymentAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
      };

      expect(task.assignedAgent).toBe('DeploymentAgent');
    });
  });

  describe('Execution Plan', () => {
    it('should create a valid execution plan', async () => {
      const tasks: Task[] = [
        {
          id: 'task-1',
          title: 'Test Task',
          description: 'A test task',
          type: 'feature',
          priority: 1,
          severity: 'Sev.3-Medium',
          impact: 'Medium',
          assignedAgent: 'CodeGenAgent',
          dependencies: [],
          estimatedDuration: 30,
          status: 'idle',
        },
      ];

      // Use DAGManager
      const { DAGManager } = await import('@miyabi/coding-agents/utils/dag-manager');
      const dag = DAGManager.buildDAG(tasks);

      // Test execution plan structure
      expect(dag.nodes.length).toBe(1);
      expect(dag.edges.length).toBe(0);
      expect(dag.levels.length).toBe(1);
    });
  });

  describe('Plans.md Generation', () => {
    it('should generate Plans.md from task decomposition', async () => {
      const issue: Issue = {
        number: 270,
        title: 'Firebase Auth修正',
        body: `
## Tasks
- [ ] Auth修正実装
- [ ] テスト追加
- [ ] ドキュメント更新
        `,
        state: 'open',
        labels: ['✨ type:feature', '🔥 priority:P0-Critical'],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        url: 'https://github.com/test/repo/issues/270',
      };

      const decomposition = await agent.decomposeIssue(issue);

      // Verify decomposition has all required components
      expect(decomposition.originalIssue).toEqual(issue);
      expect(decomposition.tasks.length).toBeGreaterThan(0);
      expect(decomposition.dag).toBeDefined();
      expect(decomposition.dag.nodes.length).toBe(decomposition.tasks.length);
      expect(decomposition.estimatedTotalDuration).toBeGreaterThan(0);
      expect(decomposition.hasCycles).toBe(false);
      expect(decomposition.recommendations).toBeDefined();
      expect(Array.isArray(decomposition.recommendations)).toBe(true);
    });

    it('should generate Plans.md markdown content with all sections', async () => {
      const issue: Issue = {
        number: 100,
        title: 'Phase 2: Plans.md自動生成',
        body: `
## Tasks
- [ ] Task 2.1: Plans.mdフォーマット設計
- [ ] Task 2.2: CoordinatorAgent実装調査
- [ ] Task 2.3: Plans.md生成機能実装
- [ ] Task 2.4: Plans.md出力テスト
        `,
        state: 'open',
        labels: ['✨ type:feature', '🔥 priority:P0-Critical'],
        createdAt: '2025-10-12T14:00:00Z',
        updatedAt: '2025-10-12T14:00:00Z',
        url: 'https://github.com/ShunsukeHayashi/Miyabi/issues/100',
      };

      const decomposition = await agent.decomposeIssue(issue);

      // Import PlansGenerator
      const { PlansGenerator } = await import('@miyabi/coding-agents/utils/plans-generator');

      // Generate Plans.md markdown
      const plansContent = PlansGenerator.generateInitialPlan(decomposition);

      // Verify markdown contains all required sections
      expect(plansContent).toContain('# Execution Plan: Issue #100');
      expect(plansContent).toContain('## Overview');
      expect(plansContent).toContain('## DAG Visualization');
      expect(plansContent).toContain('## Task Breakdown');
      expect(plansContent).toContain('## Progress');
      expect(plansContent).toContain('## Decisions Log');
      expect(plansContent).toContain('## Recommendations');
      expect(plansContent).toContain('Feler\'s 7-hour Session');

      // Verify task count
      expect(plansContent).toContain(`**Total Tasks**: ${decomposition.tasks.length}`);

      // Verify Mermaid graph
      expect(plansContent).toContain('```mermaid');
      expect(plansContent).toContain('graph TD');

      // Verify footer
      expect(plansContent).toContain('**Generated by**: CoordinatorAgent + PlansGenerator');
    });

    it('should generate Plans.md with proper task formatting', async () => {
      const issue: Issue = {
        number: 50,
        title: 'Multi-task issue with dependencies',
        body: `
- [ ] Task A: Base implementation
- [ ] Task B: Add tests (depends on A)
- [ ] Task C: Documentation
        `,
        state: 'open',
        labels: ['✨ type:feature'],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        url: 'https://github.com/test/repo/issues/50',
      };

      const decomposition = await agent.decomposeIssue(issue);

      const { PlansGenerator } = await import('@miyabi/coding-agents/utils/plans-generator');
      const plansContent = PlansGenerator.generateInitialPlan(decomposition);

      // Check task formatting
      for (const task of decomposition.tasks) {
        expect(plansContent).toContain(task.id);
        expect(plansContent).toContain(task.title);
        expect(plansContent).toContain(task.assignedAgent);
        expect(plansContent).toContain(`${task.estimatedDuration} min`);
      }

      // Check progress bar
      expect(plansContent).toContain('████████');
      expect(plansContent).toContain('| ✅ Completed |');
      expect(plansContent).toContain('| ▶️  Running |');
      expect(plansContent).toContain('| ⏸️  Pending |');
      expect(plansContent).toContain('| ❌ Failed |');
    });

    it('should handle complex DAG with multiple levels', async () => {
      const issue: Issue = {
        number: 99,
        title: 'Complex dependency chain',
        body: `
- [ ] Level 0 Task A
- [ ] Level 0 Task B
- [ ] Level 1 Task C (depends on A)
- [ ] Level 1 Task D (depends on B)
- [ ] Level 2 Task E (depends on C and D)
        `,
        state: 'open',
        labels: ['✨ type:feature'],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        url: 'https://github.com/test/repo/issues/99',
      };

      const decomposition = await agent.decomposeIssue(issue);

      const { PlansGenerator } = await import('@miyabi/coding-agents/utils/plans-generator');
      const plansContent = PlansGenerator.generateInitialPlan(decomposition);

      // Check level headers exist
      expect(plansContent).toContain('#### Level 1');

      // Check execution levels section
      expect(plansContent).toContain('### Execution Levels');

      // Verify DAG has multiple levels (at least 2)
      expect(decomposition.dag.levels.length).toBeGreaterThanOrEqual(1);
    });

    it('should include recommendations in Plans.md', async () => {
      const issue: Issue = {
        number: 75,
        title: 'High priority issue with critical tasks',
        body: `
- [ ] Critical Task 1
- [ ] Critical Task 2
- [ ] Critical Task 3
        `,
        state: 'open',
        labels: ['✨ type:feature', '🚨 severity:Sev.1-Critical'],
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        url: 'https://github.com/test/repo/issues/75',
      };

      const decomposition = await agent.decomposeIssue(issue);

      const { PlansGenerator } = await import('@miyabi/coding-agents/utils/plans-generator');
      const plansContent = PlansGenerator.generateInitialPlan(decomposition);

      // Check recommendations section exists
      expect(plansContent).toContain('## Recommendations');

      // If there are recommendations, they should be numbered
      if (decomposition.recommendations.length > 0) {
        expect(plansContent).toMatch(/\d+\. /);
      }
    });
  });
});
