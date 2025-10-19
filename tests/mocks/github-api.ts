/**
 * GitHub API Mocks
 * Provides mock implementations for GitHub API clients used in tests
 */

import { vi } from 'vitest';
import * as fixtures from '../fixtures/github-responses';

/**
 * Mock Octokit client
 * Simulates GitHub REST API responses
 */
export const createMockOctokit = () => ({
  rest: {
    repos: {
      get: vi.fn().mockResolvedValue({
        data: fixtures.mockRepository,
        status: 200,
      }),
      create: vi.fn().mockResolvedValue({
        data: fixtures.mockRepository,
        status: 201,
      }),
    },
    issues: {
      get: vi.fn().mockResolvedValue({
        data: fixtures.mockIssue,
        status: 200,
      }),
      create: vi.fn().mockResolvedValue({
        data: fixtures.mockIssue,
        status: 201,
      }),
      update: vi.fn().mockResolvedValue({
        data: fixtures.mockIssue,
        status: 200,
      }),
      listLabelsOnIssue: vi.fn().mockResolvedValue({
        data: fixtures.mockIssue.labels,
        status: 200,
      }),
    },
    pulls: {
      get: vi.fn().mockResolvedValue({
        data: fixtures.mockPullRequest,
        status: 200,
      }),
      create: vi.fn().mockResolvedValue({
        data: fixtures.mockPullRequest,
        status: 201,
      }),
    },
    actions: {
      listWorkflowRunsForRepo: vi.fn().mockResolvedValue({
        data: {
          total_count: 1,
          workflow_runs: [fixtures.mockWorkflowRun],
        },
        status: 200,
      }),
    },
  },
  graphql: vi.fn().mockImplementation((query: string) => {
    // Mock GraphQL responses based on query
    if (query.includes('projectV2')) {
      return Promise.resolve({
        repository: {
          projectV2: {
            id: fixtures.mockProjectInfo.projectId,
            title: fixtures.mockProjectInfo.title,
            number: fixtures.mockProjectInfo.number,
            fields: {
              nodes: fixtures.mockProjectInfo.fields,
            },
          },
        },
      });
    }
    if (query.includes('discussions')) {
      return Promise.resolve({
        repository: {
          discussions: {
            nodes: [fixtures.mockDiscussion],
          },
        },
      });
    }
    return Promise.resolve({});
  }),
});

/**
 * Mock functions for GitHub OS Integration scripts
 */
export const mockGitHubScripts = {
  getProjectInfo: vi.fn().mockResolvedValue(fixtures.mockProjectInfo),
  generateWeeklyReport: vi.fn().mockResolvedValue(fixtures.mockWeeklyReport),
  generateMetrics: vi.fn().mockResolvedValue(fixtures.mockMetrics),
};

/**
 * Mock WebhookEventRouter
 */
export class MockWebhookEventRouter {
  async route(_payload: any): Promise<void> {
    // Mock routing logic - just succeed
    return Promise.resolve();
  }
}

/**
 * Mock LabelStateMachine
 */
export class MockLabelStateMachine {
  constructor(
    _token: string,
    _owner: string,
    _repo: string,
  ) {}

  getValidTransitions(): string[] {
    return ['pending', 'analyzing', 'implementing', 'reviewing', 'done'];
  }

  async transition(_issueNumber: number, _newState: string): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Mock WorkflowOrchestrator
 */
export class MockWorkflowOrchestrator {
  constructor(
    _token: string,
    _owner: string,
    _repo: string,
  ) {}

  async createWorkflow(_issueNumber: number, _type: string): Promise<any> {
    return Promise.resolve(fixtures.mockWorkflow);
  }
}

/**
 * Mock KnowledgeBaseSync
 */
export class MockKnowledgeBaseSync {
  constructor(
    _token: string,
    _owner: string,
    _repo: string,
  ) {}

  async initialize(): Promise<void> {
    return Promise.resolve();
  }

  async syncEntry(_title: string, _content: string): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Mock CICDIntegration
 */
export class MockCICDIntegration {
  constructor(
    _token: string,
    _owner: string,
    _repo: string,
  ) {}

  async triggerWorkflow(_workflowId: string): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Mock SecurityManager
 */
export class MockSecurityManager {
  constructor(
    _token: string,
    _owner: string,
    _repo: string,
  ) {}

  async scanForSecrets(_path: string): Promise<any[]> {
    return Promise.resolve(fixtures.mockSecurityScan.findings);
  }
}

/**
 * Mock PerformanceOptimizer
 */
export class MockPerformanceOptimizer {
  private cache: Map<string, any> = new Map();

  constructor(private options?: { enableCache?: boolean }) {}

  setCache(key: string, value: any): void {
    if (this.options?.enableCache) {
      this.cache.set(key, value);
    }
  }

  getCache(key: string): any {
    return this.cache.get(key);
  }
}

/**
 * Mock ParallelAgentRunner
 */
export class MockParallelAgentRunner {
  constructor(_options?: { minWorkers?: number; maxWorkers?: number }) {}

  async run(tasks: any[]): Promise<any[]> {
    return Promise.resolve(tasks.map(() => ({ success: true })));
  }
}

/**
 * Mock DocGenerator
 */
export class MockDocGenerator {
  async extractJSDoc(_filePath: string): Promise<any[]> {
    return Promise.resolve([fixtures.mockJSDocComment]);
  }

  async generateDocs(_files: string[]): Promise<string> {
    return Promise.resolve('# Generated Documentation\n\nTest docs');
  }
}

/**
 * Mock TrainingMaterialGenerator
 */
export class MockTrainingMaterialGenerator {
  constructor(
    _token: string,
    _owner: string,
    _repo: string,
  ) {}

  async generateMaterial(topic: string): Promise<string> {
    return Promise.resolve(`# Training Material: ${topic}\n\nTest content`);
  }
}

/**
 * Setup function to enable mocking mode
 */
export function enableMockMode() {
  process.env.GITHUB_API_MOCK = 'true';
}

/**
 * Cleanup function to disable mocking mode
 */
export function disableMockMode() {
  delete process.env.GITHUB_API_MOCK;
}
