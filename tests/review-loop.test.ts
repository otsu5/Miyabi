/**
 * ReviewLoop E2E Tests
 *
 * Tests for interactive review loop functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReviewLoop } from '@miyabi/coding-agents/review/review-loop';
import { AgentConfig } from '@miyabi/coding-agents/types/index';

describe('ReviewLoop - E2E Tests', () => {
  let config: AgentConfig;

  beforeEach(() => {
    config = {
      deviceIdentifier: 'test-device',
      githubToken: 'test-token',
      anthropicApiKey: 'test-key',
      logDirectory: '.ai/logs',
      reportDirectory: '.ai/test-reports',
    };
  });

  describe('Scenario 1: First iteration passes', () => {
    it('should pass review on first iteration if quality is high', async () => {
      // Mock ReviewAgent with high-quality report
      const mockAgent = {
        execute: vi.fn().mockResolvedValue({
          status: 'success',
          data: {
            qualityReport: {
              score: 95,
              passed: true,
              issues: [],
              recommendations: [],
              breakdown: {
                eslintScore: 100,
                typeScriptScore: 100,
                securityScore: 100,
                testCoverageScore: 85,
              },
            },
          },
        }),
      } as any;

      const loop = new ReviewLoop(mockAgent, {
        threshold: 80,
        maxIterations: 10,
        autoFix: false,
        verbose: false,
      });

      const result = await loop.execute();

      expect(result.passed).toBe(true);
      expect(result.iterations).toBe(1);
      expect(result.finalScore).toBe(95);
      expect(mockAgent.execute).toHaveBeenCalledTimes(1);
    });

    it('should display success message for perfect score', async () => {
      const mockAgent = {
        execute: vi.fn().mockResolvedValue({
          status: 'success',
          data: {
            qualityReport: {
              score: 100,
              passed: true,
              issues: [],
              recommendations: ['Consider adding more test cases'],
              breakdown: {
                eslintScore: 100,
                typeScriptScore: 100,
                securityScore: 100,
                testCoverageScore: 100,
              },
            },
          },
        }),
      } as any;

      const loop = new ReviewLoop(mockAgent, {
        threshold: 80,
        maxIterations: 10,
        verbose: false,
      });

      const result = await loop.execute();

      expect(result.passed).toBe(true);
      expect(result.finalScore).toBe(100);
      expect(result.finalReport.breakdown?.eslintScore).toBe(100);
      expect(result.finalReport.breakdown?.typeScriptScore).toBe(100);
      expect(result.finalReport.breakdown?.securityScore).toBe(100);
    });
  });

  describe('Scenario 2: Multiple iterations with auto-fix', () => {
    it('should iterate until passing threshold with auto-fix enabled', async () => {
      let callCount = 0;

      // Mock improving quality over iterations
      const mockAgent = {
        execute: vi.fn().mockImplementation(() => {
          callCount++;

          if (callCount === 1) {
            // Iteration 1: Failed (score 70) - ESLint issues
            return Promise.resolve({
              status: 'success',
              data: {
                qualityReport: {
                  score: 70,
                  passed: false,
                  issues: [
                    {
                      type: 'eslint',
                      severity: 'medium',
                      message: 'Unused variable "foo"',
                      file: 'test.ts',
                      line: 10,
                      column: 5,
                      scoreImpact: 10,
                    },
                  ],
                  recommendations: ['Fix unused variables'],
                  breakdown: {
                    eslintScore: 90,
                    typeScriptScore: 100,
                    securityScore: 100,
                    testCoverageScore: 85,
                  },
                },
              },
            });
          } else {
            // Iteration 2: Passed (score 85) - After auto-fix
            return Promise.resolve({
              status: 'success',
              data: {
                qualityReport: {
                  score: 85,
                  passed: true,
                  issues: [],
                  recommendations: [],
                  breakdown: {
                    eslintScore: 100,
                    typeScriptScore: 100,
                    securityScore: 100,
                    testCoverageScore: 85,
                  },
                },
              },
            });
          }
        }),
      } as any;

      // Use auto-fix mode to avoid readline prompts
      const loop = new ReviewLoop(mockAgent, {
        threshold: 80,
        maxIterations: 10,
        autoFix: true, // Enable auto-fix to skip prompts
        verbose: false,
      });

      const result = await loop.execute();

      expect(result.passed).toBe(true);
      expect(result.iterations).toBe(2);
      expect(result.finalScore).toBe(85);
      expect(mockAgent.execute).toHaveBeenCalledTimes(2);
    });
  });

  describe('Scenario 3: Maximum iterations reached', () => {
    it('should escalate after max iterations with auto-fix', async () => {
      // Mock failing quality that never improves (TypeScript errors can't be auto-fixed)
      const mockAgent = {
        execute: vi.fn().mockResolvedValue({
          status: 'success',
          data: {
            qualityReport: {
              score: 50,
              passed: false,
              issues: [
                {
                  type: 'typescript',
                  severity: 'high',
                  message: 'Type error',
                  file: 'test.ts',
                  line: 15,
                  column: 8,
                  scoreImpact: 30,
                },
                {
                  type: 'security',
                  severity: 'critical',
                  message: 'SQL injection vulnerability',
                  file: 'db.ts',
                  line: 50,
                  column: 10,
                  scoreImpact: 40,
                },
              ],
              recommendations: [
                'Fix TypeScript errors',
                'Address critical security vulnerabilities',
              ],
              breakdown: {
                eslintScore: 100,
                typeScriptScore: 70,
                securityScore: 60,
                testCoverageScore: 85,
              },
            },
          },
        }),
      } as any;

      // Use auto-fix to avoid prompts (but issues won't be fixed since they're not ESLint)
      const loop = new ReviewLoop(mockAgent, {
        threshold: 80,
        maxIterations: 3, // Limit to 3 iterations for faster test
        autoFix: true,
        verbose: false,
      });

      const result = await loop.execute();

      expect(result.passed).toBe(false);
      expect(result.iterations).toBe(3);
      expect(result.finalScore).toBe(50);
      expect(mockAgent.execute).toHaveBeenCalledTimes(3);
    });

    it('should display escalation summary when max iterations reached', async () => {
      const mockAgent = {
        execute: vi.fn().mockResolvedValue({
          status: 'success',
          data: {
            qualityReport: {
              score: 55,
              passed: false,
              issues: [
                { type: 'security', severity: 'critical', message: 'Vuln 1', file: 'a.ts', line: 1, column: 1, scoreImpact: 40 },
                { type: 'typescript', severity: 'high', message: 'Error 1', file: 'b.ts', line: 1, column: 1, scoreImpact: 30 },
                { type: 'eslint', severity: 'medium', message: 'Warning 1', file: 'c.ts', line: 1, column: 1, scoreImpact: 10 },
              ],
              recommendations: ['Fix issues'],
              breakdown: {
                eslintScore: 90,
                typeScriptScore: 70,
                securityScore: 60,
                testCoverageScore: 85,
              },
            },
          },
        }),
      } as any;

      // Use auto-fix to avoid prompts
      const loop = new ReviewLoop(mockAgent, {
        threshold: 80,
        maxIterations: 2,
        autoFix: true,
        verbose: false,
      });

      const result = await loop.execute();

      expect(result.passed).toBe(false);
      expect(result.iterations).toBe(2);
      expect(result.finalReport.issues.length).toBe(3);
    });
  });

  describe('Scenario 4: Auto-fix functionality', () => {
    it('should apply auto-fixes for ESLint issues only', async () => {
      const issues: QualityIssue[] = [
        {
          type: 'eslint',
          severity: 'medium',
          message: 'Unused variable "oldState"',
          file: 'test.ts',
          line: 10,
          column: 5,
          scoreImpact: 10,
        },
        {
          type: 'security',
          severity: 'critical',
          message: 'Hardcoded API key',
          file: 'auth.ts',
          line: 20,
          column: 10,
          scoreImpact: 40,
        },
        {
          type: 'typescript',
          severity: 'high',
          message: 'Type "string" is not assignable to type "number"',
          file: 'utils.ts',
          line: 30,
          column: 15,
          scoreImpact: 30,
        },
      ];

      const mockAgent = {
        execute: vi.fn().mockResolvedValue({
          status: 'success',
          data: {
            qualityReport: {
              score: 60,
              passed: false,
              issues,
              recommendations: [],
              breakdown: {
                eslintScore: 90,
                typeScriptScore: 70,
                securityScore: 60,
                testCoverageScore: 85,
              },
            },
          },
        }),
      } as any;

      const loop = new ReviewLoop(mockAgent, {
        threshold: 80,
        maxIterations: 10,
        autoFix: false,
        verbose: false,
      });

      // Test auto-fix logic without actual execution
      // (attemptAutoFix will categorize issues correctly)
      const autoFixResult = await loop.attemptAutoFix({
        score: 60,
        passed: false,
        issues,
        recommendations: [],
        breakdown: {
          eslintScore: 90,
          typeScriptScore: 70,
          securityScore: 60,
          testCoverageScore: 85,
        },
      });

      // Should only fix ESLint issue (1 out of 3)
      expect(autoFixResult.fixed).toBeLessThanOrEqual(1);
      expect(autoFixResult.manual).toBeGreaterThanOrEqual(2);
      expect(autoFixResult.manualIssues.length).toBeGreaterThanOrEqual(2);
    });

    it('should auto-fix when --auto-fix flag is enabled', async () => {
      let callCount = 0;

      const mockAgent = {
        execute: vi.fn().mockImplementation(() => {
          callCount++;

          if (callCount === 1) {
            // First iteration: Failed with ESLint issues
            return Promise.resolve({
              status: 'success',
              data: {
                qualityReport: {
                  score: 70,
                  passed: false,
                  issues: [
                    {
                      type: 'eslint',
                      severity: 'medium',
                      message: 'Unused variable',
                      file: 'test.ts',
                      line: 10,
                      column: 5,
                      scoreImpact: 10,
                    },
                  ],
                  recommendations: [],
                  breakdown: {
                    eslintScore: 90,
                    typeScriptScore: 100,
                    securityScore: 100,
                    testCoverageScore: 85,
                  },
                },
              },
            });
          } else {
            // Second iteration: Passed after auto-fix
            return Promise.resolve({
              status: 'success',
              data: {
                qualityReport: {
                  score: 85,
                  passed: true,
                  issues: [],
                  recommendations: [],
                  breakdown: {
                    eslintScore: 100,
                    typeScriptScore: 100,
                    securityScore: 100,
                    testCoverageScore: 85,
                  },
                },
              },
            });
          }
        }),
      } as any;

      const loop = new ReviewLoop(mockAgent, {
        threshold: 80,
        maxIterations: 10,
        autoFix: true, // Enable auto-fix
        verbose: false,
      });

      const result = await loop.execute();

      expect(result.passed).toBe(true);
      expect(result.iterations).toBe(2);
      expect(result.finalScore).toBe(85);
    });
  });

  describe('Scenario 5: Low score with manual fixes needed', () => {
    it('should handle low scores that need manual TypeScript fixes', async () => {
      const mockAgent = {
        execute: vi.fn().mockResolvedValue({
          status: 'success',
          data: {
            qualityReport: {
              score: 60,
              passed: false,
              issues: [
                {
                  type: 'typescript',
                  severity: 'high',
                  message: 'Type error',
                  file: 'test.ts',
                  line: 10,
                  column: 5,
                  scoreImpact: 30,
                },
              ],
              recommendations: ['Fix TypeScript errors'],
              breakdown: {
                eslintScore: 100,
                typeScriptScore: 70,
                securityScore: 100,
                testCoverageScore: 85,
              },
            },
          },
        }),
      } as any;

      // Use auto-fix with maxIterations=1 to avoid prompts
      const loop = new ReviewLoop(mockAgent, {
        threshold: 80,
        maxIterations: 1, // Only 1 iteration
        autoFix: true,
        verbose: false,
      });

      const result = await loop.execute();

      expect(result.passed).toBe(false);
      expect(result.iterations).toBe(1);
      expect(result.finalScore).toBe(60);
      expect(mockAgent.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('Scenario 6: Review execution failure', () => {
    it('should handle ReviewAgent execution failure gracefully', async () => {
      const mockAgent = {
        execute: vi.fn().mockResolvedValue({
          status: 'failed',
          error: 'ESLint execution failed',
        }),
      } as any;

      const loop = new ReviewLoop(mockAgent, {
        threshold: 80,
        maxIterations: 10,
        verbose: false,
      });

      const result = await loop.execute();

      expect(result.passed).toBe(false);
      expect(result.iterations).toBe(1);
      expect(mockAgent.execute).toHaveBeenCalledTimes(1);
    });
  });
});
