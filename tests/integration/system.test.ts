/**
 * System Integration Tests
 *
 * Tests the complete Agentic OS workflow from Issue creation to completion
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { TaskOrchestrator } from '@miyabi/coding-agents/coordination/task-orchestrator';
import { WorkerRegistry } from '@miyabi/coding-agents/coordination/worker-registry';
import { LockManager } from '@miyabi/coding-agents/coordination/lock-manager';

describe('Agentic OS - System Integration', () => {
  let orchestrator: TaskOrchestrator;
  let workerRegistry: WorkerRegistry;
  let lockManager: LockManager;

  beforeAll(() => {
    orchestrator = new TaskOrchestrator();
    workerRegistry = new WorkerRegistry();
    lockManager = new LockManager('.task-locks-test');
  });

  afterAll(async () => {
    // Cleanup test locks
    await lockManager.cleanupExpiredLocks();
  });

  describe('Task Orchestration', () => {
    test('should create and enqueue tasks', () => {
      const task = {
        id: 'test-task-001',
        type: 'issue' as const,
        priority: 2 as const,
        dependencies: [],
        estimatedDuration: 10,
        requiredSkills: ['typescript'],
        status: 'pending' as const,
        metadata: {
          issueNumber: 123,
          branchName: 'fix/test-123',
          files: ['src/test.ts'],
          description: 'Test task',
        },
        createdAt: new Date(),
      };

      orchestrator.addTask(task);
      const retrieved = orchestrator.getTask('test-task-001');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-task-001');
      expect(retrieved?.status).toBe('pending');
    });

    test('should assign tasks to workers', async () => {
      const worker = workerRegistry.register({
        name: 'TestWorker',
        type: 'ai_agent',
        skills: ['typescript', 'testing'],
        maxConcurrentTasks: 2,
      });

      const availableTasks = orchestrator.getAvailableTasks(
        worker.id,
        worker.skills
      );

      expect(availableTasks.length).toBeGreaterThan(0);

      const task = availableTasks[0];
      const result = await orchestrator.claimTask(worker.id, task.id);

      expect(result.success).toBe(true);
      expect(result.task?.assignedTo).toBe(worker.id);
      expect(result.task?.status).toBe('claimed');
    });

    test('should detect file conflicts', async () => {
      // Create first task
      const task1 = {
        id: 'conflict-test-1',
        type: 'issue' as const,
        priority: 2 as const,
        dependencies: [],
        estimatedDuration: 10,
        requiredSkills: ['typescript'],
        status: 'pending' as const,
        metadata: {
          issueNumber: 456,
          files: ['src/shared.ts'],
          description: 'First task',
        },
        createdAt: new Date(),
      };

      orchestrator.addTask(task1);

      // Register worker and claim first task
      const worker1 = workerRegistry.register({
        name: 'Worker1',
        type: 'ai_agent',
        skills: ['typescript'],
      });

      await orchestrator.claimTask(worker1.id, 'conflict-test-1');

      // Try to claim second task with same file
      const task2 = {
        id: 'conflict-test-2',
        type: 'issue' as const,
        priority: 2 as const,
        dependencies: [],
        estimatedDuration: 10,
        requiredSkills: ['typescript'],
        status: 'pending' as const,
        metadata: {
          issueNumber: 457,
          files: ['src/shared.ts'], // Same file!
          description: 'Second task',
        },
        createdAt: new Date(),
      };

      orchestrator.addTask(task2);

      const worker2 = workerRegistry.register({
        name: 'Worker2',
        type: 'ai_agent',
        skills: ['typescript'],
      });

      const result = await orchestrator.claimTask(worker2.id, 'conflict-test-2');

      expect(result.success).toBe(false);
      expect(result.error).toContain('conflict');
    });
  });

  describe('Worker Registry', () => {
    test('should register workers', () => {
      const worker = workerRegistry.register({
        name: 'TestAgent',
        type: 'ai_agent',
        skills: ['typescript', 'react'],
        maxConcurrentTasks: 3,
      });

      expect(worker.id).toBeDefined();
      expect(worker.name).toBe('TestAgent');
      expect(worker.type).toBe('ai_agent');
      expect(worker.skills).toContain('typescript');
      expect(worker.status).toBe('idle');
    });

    test('should find best worker for task', () => {
      // Register multiple workers
      workerRegistry.register({
        name: 'SpecialistAgent',
        type: 'ai_agent',
        skills: ['typescript', 'testing', 'documentation'],
      });

      workerRegistry.register({
        name: 'GeneralistAgent',
        type: 'ai_agent',
        skills: ['typescript'],
      });

      // Find worker for testing task
      const bestWorker = workerRegistry.findBestWorker(['typescript', 'testing']);

      expect(bestWorker).toBeDefined();
      // Check that the best worker is the one with more matching skills (SpecialistAgent)
      expect(bestWorker?.name).toBe('SpecialistAgent');
      expect(bestWorker?.skills).toContain('testing');
    });

    test('should track worker load', () => {
      const worker = workerRegistry.register({
        name: 'BusyAgent',
        type: 'ai_agent',
        skills: ['typescript'],
        maxConcurrentTasks: 2,
      });

      workerRegistry.assignTask(worker.id, 'task-1');
      workerRegistry.assignTask(worker.id, 'task-2');

      const retrieved = workerRegistry.getWorker(worker.id);

      expect(retrieved?.currentTasks).toHaveLength(2);
      expect(retrieved?.status).toBe('working');

      // Try to assign beyond capacity
      const result = workerRegistry.assignTask(worker.id, 'task-3');

      expect(result).toBe(false);
    });
  });

  describe('Lock Manager', () => {
    test('should acquire and release locks', async () => {
      const files = ['src/example.ts', 'tests/example.test.ts'];

      const result = await lockManager.acquireLocks(
        'test-task-lock-1',
        'test-worker-1',
        files
      );

      expect(result.success).toBe(true);

      // Check conflicts
      const conflicts = lockManager.checkConflicts(files);
      expect(conflicts.length).toBe(2);

      // Release locks
      await lockManager.releaseLocks('test-task-lock-1');

      const conflictsAfter = lockManager.checkConflicts(files);
      expect(conflictsAfter.length).toBe(0);
    });

    test('should prevent concurrent access to same files', async () => {
      const files = ['src/critical.ts'];

      await lockManager.acquireLocks('task-a', 'worker-a', files);

      const result = await lockManager.acquireLocks('task-b', 'worker-b', files);

      expect(result.success).toBe(false);
      expect(result.conflictingLocks).toBeDefined();
      expect(result.conflictingLocks?.length).toBeGreaterThan(0);
    });

    test('should renew locks with heartbeat', async () => {
      const files = ['src/heartbeat-test.ts'];

      await lockManager.acquireLocks('heartbeat-task', 'heartbeat-worker', files);

      const renewed = await lockManager.renewLocks('heartbeat-task');

      expect(renewed).toBe(true);

      const locks = lockManager.getTaskLocks('heartbeat-task');
      expect(locks.length).toBe(1);

      await lockManager.releaseLocks('heartbeat-task');
    });
  });

  describe('End-to-End Workflow', () => {
    test('complete task lifecycle', async () => {
      // 1. Create task
      const task = {
        id: 'e2e-task-001',
        type: 'issue' as const,
        priority: 1 as const,
        dependencies: [],
        estimatedDuration: 15,
        requiredSkills: ['typescript'],
        status: 'pending' as const,
        metadata: {
          issueNumber: 999,
          files: ['src/e2e-test.ts'],
          description: 'E2E test task',
        },
        createdAt: new Date(),
      };

      orchestrator.addTask(task);

      // 2. Register worker
      const worker = workerRegistry.register({
        name: 'E2EWorker',
        type: 'ai_agent',
        skills: ['typescript'],
      });

      // 3. Claim task
      const claimResult = await orchestrator.claimTask(worker.id, task.id);
      expect(claimResult.success).toBe(true);

      // 4. Acquire locks
      const lockResult = await lockManager.acquireLocks(
        task.id,
        worker.id,
        task.metadata.files
      );
      expect(lockResult.success).toBe(true);

      // 5. Start task
      const startResult = await orchestrator.startTask(task.id);
      expect(startResult).toBe(true);

      // 6. Complete task
      await orchestrator.completeTask(task.id, true);

      // 7. Release locks
      await lockManager.releaseLocks(task.id);

      // 8. Verify final state
      const finalTask = orchestrator.getTask(task.id);
      expect(finalTask?.status).toBe('completed');

      const remainingLocks = lockManager.getTaskLocks(task.id);
      expect(remainingLocks.length).toBe(0);
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should provide task statistics', () => {
      const stats = orchestrator.getStatistics();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('claimed');
      expect(stats).toHaveProperty('inProgress');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
    });

    test('should provide worker statistics', () => {
      const stats = workerRegistry.getStatistics();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('idle');
      expect(stats).toHaveProperty('working');
      expect(stats).toHaveProperty('offline');
      expect(stats).toHaveProperty('humans');
      expect(stats).toHaveProperty('aiAgents');
    });

    test('should provide lock statistics', () => {
      const stats = lockManager.getStatistics();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('expired');
    });
  });
});
