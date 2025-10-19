/**
 * Parallel Agent Runner - Concurrent Agent Execution System
 *
 * Features:
 * - Concurrent agent execution
 * - Worker pool management
 * - Task distribution strategy
 * - Resource allocation
 * - Failure recovery and retry logic
 * - Auto-scaling based on load
 *
 * Phase I: Issue #5 - Scalability & Performance Optimization
 */

import { AgentConfig, Task, AgentResult, AgentType } from '@miyabi/coding-agents/types/index';
import { PerformanceOptimizer, createPerformanceOptimizer } from './performance-optimizer';
import { Octokit } from '@octokit/rest';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface WorkerConfig {
  id: string;
  agentType: AgentType;
  maxConcurrentTasks: number;
  skills: string[];
  priority: number;
  status: 'idle' | 'busy' | 'error' | 'offline';
  currentLoad: number;
}

export interface WorkerPoolConfig {
  minWorkers: number;
  maxWorkers: number;
  autoScale: boolean;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  workerTimeout: number;
  healthCheckInterval: number;
}

export interface TaskDistributionStrategy {
  type: 'round-robin' | 'least-loaded' | 'skill-based' | 'priority-based';
  rebalanceInterval?: number;
  affinityEnabled?: boolean;
}

export interface ExecutionResult {
  taskId: string;
  workerId: string;
  status: 'success' | 'failed' | 'timeout' | 'cancelled';
  result?: AgentResult;
  error?: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  retries: number;
}

export interface WorkerPoolStats {
  totalWorkers: number;
  activeWorkers: number;
  idleWorkers: number;
  errorWorkers: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  queuedTasks: number;
  avgTaskDuration: number;
  throughput: number;
}

export interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  maxRetryDelay: number;
}

// ============================================================================
// Parallel Agent Runner Class
// ============================================================================

export class ParallelAgentRunner {
  private workers: Map<string, WorkerConfig> = new Map();
  private taskQueue: Task[] = [];
  private runningTasks: Map<string, { task: Task; workerId: string; startTime: number }> = new Map();
  private results: Map<string, ExecutionResult> = new Map();
  private optimizer: PerformanceOptimizer;
  private workerTaskCount: Map<string, number> = new Map();
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(
    _config: AgentConfig,
    private poolConfig: WorkerPoolConfig,
    private distributionStrategy: TaskDistributionStrategy,
    private retryConfig: RetryConfig,
    octokit?: Octokit
  ) {
    this.optimizer = createPerformanceOptimizer({
      maxConcurrency: poolConfig.maxWorkers,
      metricsEnabled: true,
    }, octokit);

    this.initializeWorkerPool();
    this.startHealthCheck();
  }

  // ============================================================================
  // Worker Pool Management
  // ============================================================================

  /**
   * Initialize worker pool
   */
  private initializeWorkerPool(): void {
    console.log(`[ParallelAgentRunner] Initializing worker pool with ${this.poolConfig.minWorkers} workers...`);

    for (let i = 0; i < this.poolConfig.minWorkers; i++) {
      this.addWorker();
    }
  }

  /**
   * Add a worker to the pool
   */
  private addWorker(agentType?: AgentType): string {
    const workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const type = agentType || 'CodeGenAgent';

    const worker: WorkerConfig = {
      id: workerId,
      agentType: type,
      maxConcurrentTasks: 3,
      skills: this.getAgentSkills(type),
      priority: 1,
      status: 'idle',
      currentLoad: 0,
    };

    this.workers.set(workerId, worker);
    this.workerTaskCount.set(workerId, 0);

    console.log(`[ParallelAgentRunner] Worker ${workerId} (${type}) added to pool`);
    return workerId;
  }

  /**
   * Remove a worker from the pool
   */
  private removeWorker(workerId: string): void {
    const worker = this.workers.get(workerId);

    if (!worker) {
      return;
    }

    if (worker.status === 'busy') {
      console.warn(`[ParallelAgentRunner] Cannot remove busy worker ${workerId}`);
      return;
    }

    this.workers.delete(workerId);
    this.workerTaskCount.delete(workerId);
    this.optimizer.updateAgentLoad(workerId, -worker.currentLoad);

    console.log(`[ParallelAgentRunner] Worker ${workerId} removed from pool`);
  }

  /**
   * Get agent skills based on type
   */
  private getAgentSkills(agentType: AgentType): string[] {
    const skillMap: Record<AgentType, string[]> = {
      'CoordinatorAgent': ['coordination', 'planning', 'task-management'],
      'CodeGenAgent': ['coding', 'typescript', 'javascript', 'implementation'],
      'ReviewAgent': ['code-review', 'quality-assurance', 'testing'],
      'IssueAgent': ['issue-triage', 'analysis', 'documentation'],
      'PRAgent': ['pr-management', 'git', 'collaboration'],
      'DeploymentAgent': ['deployment', 'devops', 'monitoring'],
      'AutoFixAgent': ['debugging', 'fixing', 'testing'],
      'WaterSpiderAgent': ['context-switching', 'bridging', 'resource-management'],
    };

    return skillMap[agentType] || [];
  }

  /**
   * Auto-scale worker pool based on load
   */
  private autoScale(): void {
    if (!this.poolConfig.autoScale) {
      return;
    }

    const stats = this.getPoolStats();
    const loadRatio = stats.activeWorkers / stats.totalWorkers;

    // Scale up if load is high
    if (loadRatio >= this.poolConfig.scaleUpThreshold && stats.totalWorkers < this.poolConfig.maxWorkers) {
      const workersToAdd = Math.min(
        Math.ceil(stats.totalWorkers * 0.5),
        this.poolConfig.maxWorkers - stats.totalWorkers
      );

      console.log(`[ParallelAgentRunner] Scaling up: adding ${workersToAdd} workers (load: ${(loadRatio * 100).toFixed(1)}%)`);

      for (let i = 0; i < workersToAdd; i++) {
        this.addWorker();
      }
    }

    // Scale down if load is low
    if (loadRatio <= this.poolConfig.scaleDownThreshold && stats.totalWorkers > this.poolConfig.minWorkers) {
      const workersToRemove = Math.min(
        Math.ceil((stats.totalWorkers - stats.activeWorkers) * 0.5),
        stats.totalWorkers - this.poolConfig.minWorkers
      );

      console.log(`[ParallelAgentRunner] Scaling down: removing ${workersToRemove} workers (load: ${(loadRatio * 100).toFixed(1)}%)`);

      const idleWorkers = Array.from(this.workers.values())
        .filter(w => w.status === 'idle')
        .slice(0, workersToRemove);

      for (const worker of idleWorkers) {
        this.removeWorker(worker.id);
      }
    }
  }

  /**
   * Health check for workers
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      for (const [workerId, worker] of this.workers.entries()) {
        // Check for stuck tasks
        for (const [taskId, running] of this.runningTasks.entries()) {
          if (running.workerId === workerId) {
            const elapsed = Date.now() - running.startTime;

            if (elapsed > this.poolConfig.workerTimeout) {
              console.error(`[ParallelAgentRunner] Task ${taskId} on worker ${workerId} timed out`);
              this.handleTaskTimeout(taskId, workerId);
            }
          }
        }

        // Reset error workers after cooldown
        if (worker.status === 'error') {
          worker.status = 'idle';
          console.log(`[ParallelAgentRunner] Worker ${workerId} recovered from error state`);
        }
      }

      // Auto-scale check
      this.autoScale();
    }, this.poolConfig.healthCheckInterval);
  }

  /**
   * Stop health check
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }

  // ============================================================================
  // Task Distribution
  // ============================================================================

  /**
   * Add task to queue
   */
  addTask(task: Task): void {
    this.taskQueue.push(task);
    this.sortTaskQueue();
    this.optimizer.enqueue(task.id, task, task.priority);

    console.log(`[ParallelAgentRunner] Task ${task.id} added to queue (priority: ${task.priority})`);
    this.processTasks();
  }

  /**
   * Add multiple tasks to queue
   */
  addTasks(tasks: Task[]): void {
    for (const task of tasks) {
      this.taskQueue.push(task);
      this.optimizer.enqueue(task.id, task, task.priority);
    }

    this.sortTaskQueue();
    console.log(`[ParallelAgentRunner] ${tasks.length} tasks added to queue`);
    this.processTasks();
  }

  /**
   * Sort task queue by priority
   */
  private sortTaskQueue(): void {
    this.taskQueue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return (a.startTime || 0) - (b.startTime || 0);
    });
  }

  /**
   * Process tasks from queue
   */
  private async processTasks(): Promise<void> {
    while (this.taskQueue.length > 0) {
      const task = this.taskQueue[0];
      const worker = this.selectWorker(task);

      if (!worker) {
        // No available workers, wait
        break;
      }

      // Remove from queue and assign to worker
      this.taskQueue.shift();
      await this.executeTask(task, worker.id);
    }
  }

  /**
   * Select worker for task based on distribution strategy
   */
  private selectWorker(task: Task): WorkerConfig | null {
    const availableWorkers = Array.from(this.workers.values())
      .filter(w => w.status === 'idle' && w.currentLoad < w.maxConcurrentTasks);

    if (availableWorkers.length === 0) {
      return null;
    }

    switch (this.distributionStrategy.type) {
      case 'round-robin':
        return this.selectRoundRobin(availableWorkers);

      case 'least-loaded':
        return this.selectLeastLoaded(availableWorkers);

      case 'skill-based':
        return this.selectBySkills(availableWorkers, task);

      case 'priority-based':
        return this.selectByPriority(availableWorkers);

      default:
        return availableWorkers[0];
    }
  }

  /**
   * Round-robin worker selection
   */
  private selectRoundRobin(workers: WorkerConfig[]): WorkerConfig {
    return this.optimizer.selectAgent({
      strategy: 'round-robin',
      agents: workers.map(w => w.id),
    }) ? workers[0] : workers[0];
  }

  /**
   * Least-loaded worker selection
   */
  private selectLeastLoaded(workers: WorkerConfig[]): WorkerConfig {
    return workers.reduce((min, worker) =>
      worker.currentLoad < min.currentLoad ? worker : min
    );
  }

  /**
   * Skill-based worker selection
   */
  private selectBySkills(workers: WorkerConfig[], task: Task): WorkerConfig {
    const requiredSkills = this.getRequiredSkills(task);

    const matchingWorkers = workers.filter(w =>
      requiredSkills.every(skill => w.skills.includes(skill))
    );

    return matchingWorkers.length > 0
      ? this.selectLeastLoaded(matchingWorkers)
      : this.selectLeastLoaded(workers);
  }

  /**
   * Priority-based worker selection
   */
  private selectByPriority(workers: WorkerConfig[]): WorkerConfig {
    return workers.reduce((max, worker) =>
      worker.priority > max.priority ? worker : max
    );
  }

  /**
   * Get required skills for task
   */
  private getRequiredSkills(task: Task): string[] {
    const skillMap: Record<Task['type'], string[]> = {
      'feature': ['coding', 'implementation'],
      'bug': ['debugging', 'fixing'],
      'refactor': ['coding', 'refactoring'],
      'docs': ['documentation'],
      'test': ['testing', 'quality-assurance'],
      'deployment': ['deployment', 'devops'],
    };

    return skillMap[task.type] || [];
  }

  // ============================================================================
  // Task Execution
  // ============================================================================

  /**
   * Execute task on worker
   */
  private async executeTask(task: Task, workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);

    if (!worker) {
      console.error(`[ParallelAgentRunner] Worker ${workerId} not found`);
      return;
    }

    // Update worker status
    worker.status = 'busy';
    worker.currentLoad++;
    this.optimizer.updateAgentLoad(workerId, 1);

    // Track running task
    const startTime = Date.now();
    this.runningTasks.set(task.id, { task, workerId, startTime });

    console.log(`[ParallelAgentRunner] Executing task ${task.id} on worker ${workerId}`);

    try {
      // Execute with performance profiling
      const result = await this.optimizer.profile(
        `task-${task.type}`,
        () => this.executeAgentTask(task, worker)
      );

      const endTime = Date.now();

      // Record successful result
      this.results.set(task.id, {
        taskId: task.id,
        workerId,
        status: 'success',
        result,
        startTime,
        endTime,
        durationMs: endTime - startTime,
        retries: 0,
      });

      console.log(`[ParallelAgentRunner] Task ${task.id} completed successfully in ${endTime - startTime}ms`);
      this.optimizer.completeTask(task.id);
    } catch (error) {
      console.error(`[ParallelAgentRunner] Task ${task.id} failed:`, error);
      await this.handleTaskFailure(task, workerId, error as Error);
    } finally {
      // Update worker status
      worker.currentLoad--;
      worker.status = worker.currentLoad > 0 ? 'busy' : 'idle';
      this.optimizer.updateAgentLoad(workerId, -1);

      // Remove from running tasks
      this.runningTasks.delete(task.id);

      // Process next tasks
      this.processTasks();
    }
  }

  /**
   * Execute agent task (placeholder for actual agent execution)
   */
  private async executeAgentTask(task: Task, worker: WorkerConfig): Promise<AgentResult> {
    // TODO: Integrate with actual agent execution
    // For now, simulate execution

    await this.sleep(Math.random() * 1000 + 500);

    return {
      status: 'success',
      data: {
        taskId: task.id,
        agentType: worker.agentType,
      },
      metrics: {
        taskId: task.id,
        agentType: worker.agentType,
        durationMs: 0,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ============================================================================
  // Failure Recovery & Retry Logic
  // ============================================================================

  /**
   * Handle task failure with retry logic
   */
  private async handleTaskFailure(task: Task, workerId: string, error: Error): Promise<void> {
    const worker = this.workers.get(workerId);

    if (worker) {
      worker.status = 'error';
    }

    // Check if task should be retried
    const retries = this.getTaskRetries(task.id);

    if (retries < this.retryConfig.maxRetries) {
      const delay = this.calculateRetryDelay(retries);

      console.log(`[ParallelAgentRunner] Retrying task ${task.id} in ${delay}ms (attempt ${retries + 1}/${this.retryConfig.maxRetries})`);

      await this.sleep(delay);

      // Add back to queue with retry count
      task.metadata = task.metadata || {};
      task.metadata.retries = retries + 1;

      this.taskQueue.unshift(task);
      this.optimizer.failTask(task.id);

      this.processTasks();
    } else {
      console.error(`[ParallelAgentRunner] Task ${task.id} failed after ${this.retryConfig.maxRetries} retries`);

      const endTime = Date.now();
      const running = this.runningTasks.get(task.id);

      this.results.set(task.id, {
        taskId: task.id,
        workerId,
        status: 'failed',
        error: error.message,
        startTime: running?.startTime || Date.now(),
        endTime,
        durationMs: running ? endTime - running.startTime : 0,
        retries,
      });
    }
  }

  /**
   * Handle task timeout
   */
  private async handleTaskTimeout(taskId: string, workerId: string): Promise<void> {
    const running = this.runningTasks.get(taskId);

    if (!running) {
      return;
    }

    console.error(`[ParallelAgentRunner] Task ${taskId} timed out on worker ${workerId}`);

    const endTime = Date.now();

    this.results.set(taskId, {
      taskId,
      workerId,
      status: 'timeout',
      error: 'Task execution timeout',
      startTime: running.startTime,
      endTime,
      durationMs: endTime - running.startTime,
      retries: this.getTaskRetries(taskId),
    });

    // Remove from running tasks
    this.runningTasks.delete(taskId);

    // Reset worker
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.currentLoad--;
      worker.status = 'error';
      this.optimizer.updateAgentLoad(workerId, -1);
    }

    // Retry task
    await this.handleTaskFailure(running.task, workerId, new Error('Task timeout'));
  }

  /**
   * Get task retry count
   */
  private getTaskRetries(taskId: string): number {
    const result = this.results.get(taskId);
    if (result) {
      return result.retries;
    }

    // Check task metadata
    for (const task of this.taskQueue) {
      if (task.id === taskId && task.metadata?.retries) {
        return task.metadata.retries;
      }
    }

    return 0;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(retries: number): number {
    const delay = this.retryConfig.retryDelay * Math.pow(this.retryConfig.backoffMultiplier, retries);
    return Math.min(delay, this.retryConfig.maxRetryDelay);
  }

  // ============================================================================
  // Status & Statistics
  // ============================================================================

  /**
   * Get worker pool statistics
   */
  getPoolStats(): WorkerPoolStats {
    const workers = Array.from(this.workers.values());
    const results = Array.from(this.results.values());

    const completed = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'failed' || r.status === 'timeout');

    const avgDuration = completed.length > 0
      ? completed.reduce((sum, r) => sum + r.durationMs, 0) / completed.length
      : 0;

    return {
      totalWorkers: workers.length,
      activeWorkers: workers.filter(w => w.status === 'busy').length,
      idleWorkers: workers.filter(w => w.status === 'idle').length,
      errorWorkers: workers.filter(w => w.status === 'error').length,
      totalTasks: results.length + this.taskQueue.length + this.runningTasks.size,
      completedTasks: completed.length,
      failedTasks: failed.length,
      queuedTasks: this.taskQueue.length,
      avgTaskDuration: avgDuration,
      throughput: completed.length,
    };
  }

  /**
   * Get execution results
   */
  getResults(): ExecutionResult[] {
    return Array.from(this.results.values());
  }

  /**
   * Get result for specific task
   */
  getResult(taskId: string): ExecutionResult | undefined {
    return this.results.get(taskId);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return this.optimizer.getPerformanceSummary();
  }

  /**
   * Export runner state
   */
  exportState() {
    return {
      workers: Array.from(this.workers.values()),
      taskQueue: this.taskQueue,
      runningTasks: Array.from(this.runningTasks.values()),
      results: Array.from(this.results.values()),
      poolStats: this.getPoolStats(),
      performanceMetrics: this.getPerformanceMetrics(),
      optimizer: this.optimizer.exportState(),
    };
  }

  // ============================================================================
  // Control Methods
  // ============================================================================

  /**
   * Wait for all tasks to complete
   */
  async waitForCompletion(timeout?: number): Promise<boolean> {
    const startTime = Date.now();
    const maxTime = timeout || Infinity;

    while (this.taskQueue.length > 0 || this.runningTasks.size > 0) {
      if (Date.now() - startTime > maxTime) {
        return false;
      }

      await this.sleep(100);
    }

    return true;
  }

  /**
   * Shutdown runner
   */
  async shutdown(): Promise<void> {
    console.log('[ParallelAgentRunner] Shutting down...');

    this.stopHealthCheck();

    // Wait for running tasks to complete
    await this.waitForCompletion(30000);

    // Clear workers
    this.workers.clear();
    this.workerTaskCount.clear();

    console.log('[ParallelAgentRunner] Shutdown complete');
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a parallel agent runner instance
 */
export function createParallelAgentRunner(
  config: AgentConfig,
  poolConfig?: Partial<WorkerPoolConfig>,
  distributionStrategy?: Partial<TaskDistributionStrategy>,
  retryConfig?: Partial<RetryConfig>,
  octokit?: Octokit
): ParallelAgentRunner {
  const defaultPoolConfig: WorkerPoolConfig = {
    minWorkers: 2,
    maxWorkers: 10,
    autoScale: true,
    scaleUpThreshold: 0.8,
    scaleDownThreshold: 0.3,
    workerTimeout: 5 * 60 * 1000, // 5 minutes
    healthCheckInterval: 30 * 1000, // 30 seconds
  };

  const defaultDistributionStrategy: TaskDistributionStrategy = {
    type: 'least-loaded',
    rebalanceInterval: 60000,
    affinityEnabled: true,
  };

  const defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2,
    maxRetryDelay: 30000,
  };

  return new ParallelAgentRunner(
    config,
    { ...defaultPoolConfig, ...poolConfig },
    { ...defaultDistributionStrategy, ...distributionStrategy },
    { ...defaultRetryConfig, ...retryConfig },
    octokit
  );
}
