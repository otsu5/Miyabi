/**
 * ReviewAgent Test Coverage Integration Tests
 *
 * Tests for real test coverage checking functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReviewAgent } from '@miyabi/coding-agents/review/review-agent';
import { AgentConfig, Task } from '@miyabi/coding-agents/types/index';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module for testing
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
    },
  };
});

describe('ReviewAgent - Test Coverage Integration', () => {
  let agent: ReviewAgent;
  let config: AgentConfig;
  const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

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

    agent = new ReviewAgent(config);

    // Mock analysis methods to prevent actual scans
    // @ts-ignore - accessing private methods for testing
    vi.spyOn(agent as any, 'runESLint').mockResolvedValue([]);
    // @ts-ignore - accessing private methods for testing
    vi.spyOn(agent as any, 'runTypeScriptCheck').mockResolvedValue([]);
    // @ts-ignore - accessing private methods for testing
    vi.spyOn(agent as any, 'runSecurityScan').mockResolvedValue([]);

    // Reset mocks before each test
    vi.clearAllMocks();
  });

  describe('Test Coverage Reading', () => {
    it('should read actual coverage report when it exists', async () => {
      // Check if real coverage report exists
      if (!fs.existsSync(coveragePath)) {
        console.log('⚠️  Skipping test - coverage report not found. Run: npm run test -- --coverage');
        return;
      }

      const task: Task = {
        id: 'test-coverage-real',
        title: 'Test coverage reading',
        description: 'Read real coverage data',
        type: 'test',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'ReviewAgent',
        dependencies: [],
        estimatedDuration: 10,
        status: 'idle',
        metadata: {
          files: ['tests/review-agent-coverage.test.ts'],
        },
      };

      const result = await agent.execute(task);

      expect(result.status).toBe('success');
      expect(result.data.qualityReport).toBeDefined();
      expect(result.data.qualityReport.breakdown).toBeDefined();
      expect(result.data.qualityReport.breakdown!.testCoverageScore).toBeGreaterThanOrEqual(0);
      expect(result.data.qualityReport.breakdown!.testCoverageScore).toBeLessThanOrEqual(100);

      console.log(`✅ Coverage score: ${result.data.qualityReport.breakdown!.testCoverageScore}%`);
    });

    it('should return 0 coverage when report does not exist', async () => {
      // Mock fs.existsSync to return false
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const task: Task = {
        id: 'test-coverage-missing',
        title: 'Test coverage missing',
        description: 'Handle missing coverage report',
        type: 'test',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'ReviewAgent',
        dependencies: [],
        estimatedDuration: 10,
        status: 'idle',
        metadata: {
          files: ['tests/dummy.ts'],
        },
      };

      const result = await agent.execute(task);

      expect(result.status).toBe('success');
      expect(result.data.qualityReport.breakdown!.testCoverageScore).toBe(0);
    });

    it('should handle corrupted coverage report gracefully', async () => {
      // Mock fs.existsSync to return true
      vi.mocked(fs.existsSync).mockReturnValue(true);

      // Mock fs.promises.readFile to return invalid JSON
      vi.mocked(fs.promises.readFile).mockResolvedValue('invalid json' as any);

      const task: Task = {
        id: 'test-coverage-corrupted',
        title: 'Test coverage corrupted',
        description: 'Handle corrupted coverage report',
        type: 'test',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'ReviewAgent',
        dependencies: [],
        estimatedDuration: 10,
        status: 'idle',
        metadata: {
          files: ['tests/dummy.ts'],
        },
      };

      const result = await agent.execute(task);

      expect(result.status).toBe('success');
      expect(result.data.qualityReport.breakdown!.testCoverageScore).toBe(0);
    });

    it('should calculate weighted average coverage correctly', async () => {
      // Mock coverage data with known values
      const mockCoverage = {
        total: {
          statements: { pct: 90 },
          branches: { pct: 80 },
          functions: { pct: 85 },
          lines: { pct: 88 },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockCoverage) as any);

      const task: Task = {
        id: 'test-coverage-weighted',
        title: 'Test weighted coverage',
        description: 'Calculate weighted coverage',
        type: 'test',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'ReviewAgent',
        dependencies: [],
        estimatedDuration: 10,
        status: 'idle',
        metadata: {
          files: ['tests/dummy.ts'],
        },
      };

      const result = await agent.execute(task);

      // Expected: 90*0.4 + 88*0.3 + 80*0.2 + 85*0.1 = 36 + 26.4 + 16 + 8.5 = 86.9
      expect(result.data.qualityReport.breakdown!.testCoverageScore).toBeCloseTo(87, 0);
    });

    it('should calculate coverage below 80% correctly', async () => {
      // Test that weighted average formula works for low coverage
      const mockCoverage = {
        total: {
          statements: { pct: 75 },
          branches: { pct: 70 },
          functions: { pct: 72 },
          lines: { pct: 74 },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockCoverage) as any);

      const task: Task = {
        id: 'test-coverage-calculation',
        title: 'Test coverage calculation',
        description: 'Verify coverage calculation',
        type: 'test',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'ReviewAgent',
        dependencies: [],
        estimatedDuration: 10,
        status: 'idle',
        metadata: {
          files: ['tests/review-agent-coverage.test.ts'],
        },
      };

      const result = await agent.execute(task);

      // Expected: 75*0.4 + 74*0.3 + 70*0.2 + 72*0.1 = 30 + 22.2 + 14 + 7.2 = 73.4
      expect(result.data.qualityReport.breakdown!.testCoverageScore).toBeCloseTo(73, 0);
    });

    it('should calculate coverage above 80% correctly', async () => {
      // Test that weighted average formula works for high coverage
      const mockCoverage = {
        total: {
          statements: { pct: 90 },
          branches: { pct: 85 },
          functions: { pct: 88 },
          lines: { pct: 92 },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockCoverage) as any);

      const task: Task = {
        id: 'test-coverage-high-calc',
        title: 'Test high coverage calculation',
        description: 'Verify high coverage calculation',
        type: 'test',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'ReviewAgent',
        dependencies: [],
        estimatedDuration: 10,
        status: 'idle',
        metadata: {
          files: ['tests/review-agent-coverage.test.ts'],
        },
      };

      const result = await agent.execute(task);

      // Expected: 90*0.4 + 92*0.3 + 85*0.2 + 88*0.1 = 36 + 27.6 + 17 + 8.8 = 89.4
      expect(result.data.qualityReport.breakdown!.testCoverageScore).toBeCloseTo(89, 0);
    });
  });

  describe('Coverage Score Integration with Quality Report', () => {
    it('should include coverage score in quality breakdown', async () => {
      const mockCoverage = {
        total: {
          statements: { pct: 85 },
          branches: { pct: 80 },
          functions: { pct: 90 },
          lines: { pct: 88 },
        },
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockCoverage) as any);

      const task: Task = {
        id: 'test-integration',
        title: 'Integration test',
        description: 'Coverage in breakdown',
        type: 'test',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'ReviewAgent',
        dependencies: [],
        estimatedDuration: 10,
        status: 'idle',
        metadata: {
          files: ['tests/review-agent-coverage.test.ts'],
        },
      };

      const result = await agent.execute(task);

      expect(result.data.qualityReport.breakdown).toMatchObject({
        eslintScore: expect.any(Number),
        typeScriptScore: expect.any(Number),
        securityScore: expect.any(Number),
        testCoverageScore: expect.any(Number),
      });

      // Expected: 85*0.4 + 88*0.3 + 80*0.2 + 90*0.1 = 34 + 26.4 + 16 + 9 = 85.4
      expect(result.data.qualityReport.breakdown!.testCoverageScore).toBeCloseTo(85, 0);
    });
  });
});
