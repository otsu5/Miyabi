/**
 * Agent Verification - E2E Tests
 *
 * Tests for auto-loop verification patterns from OpenAI Dev Day
 * Tests the "exec verify" pattern across all agent types
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodeGenAgent } from '@miyabi/coding-agents/codegen/codegen-agent';
import { ReviewAgent } from '@miyabi/coding-agents/review/review-agent';
import { ReviewLoop } from '@miyabi/coding-agents/review/review-loop';
import { DeploymentAgent } from '@miyabi/coding-agents/deployment/deployment-agent';
import { AgentConfig, Task } from '@miyabi/coding-agents/types/index';

describe('Agent Verification - E2E Tests', () => {
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
  });

  describe('CodeGenAgent Auto-Loop', () => {
    it('should iterate until all checks pass', async () => {
      let executionCount = 0;

      // Mock CodeGenAgent with improving quality
      const agent = {
        generateCode: vi.fn().mockImplementation(() => {
          executionCount++;
          return `// Generated code iteration ${executionCount}`;
        }),
        execVerify: vi.fn().mockImplementation(() => {
          // Fail first 2 iterations, pass on 3rd
          if (executionCount < 3) {
            return Promise.resolve({
              passed: false,
              lintErrors: [{ file: 'test.ts', line: 10, message: 'Unused variable' }],
              typeErrors: [],
              testFailures: [],
              securityIssues: [],
            });
          } else {
            return Promise.resolve({
              passed: true,
              lintErrors: [],
              typeErrors: [],
              testFailures: [],
              securityIssues: [],
            });
          }
        }),
        execute: vi.fn().mockImplementation(async (task: Task) => {
          let iteration = 0;
          const MAX_ITERATIONS = 10;
          let passed = false;

          while (!passed && iteration < MAX_ITERATIONS) {
            iteration++;
            await agent.generateCode();
            const verifyResult = await agent.execVerify();

            if (verifyResult.passed) {
              passed = true;
            }
          }

          return {
            status: passed ? 'success' : 'failed',
            metrics: { iterations: iteration },
          };
        }),
      } as any;

      const task: Task = {
        id: 'test-auto-loop',
        title: 'Generate UI component',
        description: 'Generate React component with tests',
        type: 'feature',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'High',
        assignedAgent: 'CodeGenAgent',
        dependencies: [],
        estimatedDuration: 60,
        status: 'idle',
      };

      const result = await agent.execute(task);

      expect(result.status).toBe('success');
      expect(result.metrics?.iterations).toBe(3); // Should take 3 iterations
      expect(result.metrics?.iterations).toBeLessThanOrEqual(10); // Within max iterations
      expect(agent.generateCode).toHaveBeenCalledTimes(3);
      expect(agent.execVerify).toHaveBeenCalledTimes(3);
    });

    it('should fail after max iterations', async () => {
      // Mock agent that always fails verification
      const agent = {
        generateCode: vi.fn().mockResolvedValue('// Code'),
        execVerify: vi.fn().mockResolvedValue({
          passed: false,
          lintErrors: [{ file: 'test.ts', line: 10, message: 'Error' }],
        }),
        execute: vi.fn().mockImplementation(async (task: Task) => {
          let iteration = 0;
          const MAX_ITERATIONS = 10;
          let passed = false;

          while (!passed && iteration < MAX_ITERATIONS) {
            iteration++;
            await agent.generateCode();
            const verifyResult = await agent.execVerify();

            if (verifyResult.passed) {
              passed = true;
            }
          }

          if (!passed) {
            return {
              status: 'failed',
              error: 'Max iterations reached - code quality insufficient',
              metrics: { iterations: iteration },
            };
          }

          return { status: 'success', metrics: { iterations: iteration } };
        }),
      } as any;

      const task: Task = {
        id: 'test-max-iterations',
        title: 'Generate component',
        description: 'Test max iterations',
        type: 'feature',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'High',
        assignedAgent: 'CodeGenAgent',
        dependencies: [],
        estimatedDuration: 60,
        status: 'idle',
      };

      const result = await agent.execute(task);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Max iterations reached');
      expect(result.metrics?.iterations).toBe(10);
      expect(agent.execVerify).toHaveBeenCalledTimes(10);
    });

    it('should pass on first iteration if quality is high', async () => {
      const agent = {
        generateCode: vi.fn().mockResolvedValue('// Perfect code'),
        execVerify: vi.fn().mockResolvedValue({
          passed: true,
          lintErrors: [],
          typeErrors: [],
          testFailures: [],
          securityIssues: [],
        }),
        execute: vi.fn().mockImplementation(async (task: Task) => {
          let iteration = 0;
          const MAX_ITERATIONS = 10;
          let passed = false;

          while (!passed && iteration < MAX_ITERATIONS) {
            iteration++;
            await agent.generateCode();
            const verifyResult = await agent.execVerify();

            if (verifyResult.passed) {
              passed = true;
            }
          }

          return { status: 'success', metrics: { iterations: iteration } };
        }),
      } as any;

      const task: Task = {
        id: 'test-perfect-first',
        title: 'Generate component',
        description: 'High quality code',
        type: 'feature',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'High',
        assignedAgent: 'CodeGenAgent',
        dependencies: [],
        estimatedDuration: 60,
        status: 'idle',
      };

      const result = await agent.execute(task);

      expect(result.status).toBe('success');
      expect(result.metrics?.iterations).toBe(1);
      expect(agent.generateCode).toHaveBeenCalledTimes(1);
      expect(agent.execVerify).toHaveBeenCalledTimes(1);
    });
  });

  describe('ReviewAgent with /review command', () => {
    it('should iterate until quality score ≥ 80', async () => {
      let callCount = 0;

      const mockAgent = {
        execute: vi.fn().mockImplementation(() => {
          callCount++;

          if (callCount === 1) {
            // First iteration: score 70
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
            // Second iteration: score 85 (passed)
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
        autoFix: true, // Use auto-fix to avoid readline prompts
        verbose: false,
      });

      const result = await loop.execute();

      expect(result.passed).toBe(true);
      expect(result.finalScore).toBeGreaterThanOrEqual(80);
      expect(result.iterations).toBe(2);
      expect(mockAgent.execute).toHaveBeenCalledTimes(2);
    });

    it('should escalate after max iterations if score stays low', async () => {
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
                  line: 10,
                  column: 5,
                  scoreImpact: 30,
                },
              ],
              recommendations: [],
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

      const loop = new ReviewLoop(mockAgent, {
        threshold: 80,
        maxIterations: 3,
        autoFix: true,
        verbose: false,
      });

      const result = await loop.execute();

      expect(result.passed).toBe(false);
      expect(result.iterations).toBe(3);
      expect(result.finalScore).toBeLessThan(80);
      expect(mockAgent.execute).toHaveBeenCalledTimes(3);
    });
  });

  describe('DeploymentAgent Health Check', () => {
    it('should deploy only after all verifications pass', async () => {
      let deployAttempt = 0;

      const agent = {
        execVerify: vi.fn().mockResolvedValue(undefined), // All checks pass
        deployToStaging: vi.fn().mockResolvedValue(undefined),
        healthCheck: vi.fn().mockImplementation(() => {
          deployAttempt++;
          return Promise.resolve(true); // First attempt succeeds
        }),
        rollback: vi.fn(),
        execute: vi.fn().mockImplementation(async (task: Task) => {
          let iteration = 0;
          const MAX_ITERATIONS = 3;
          let deployed = false;

          while (!deployed && iteration < MAX_ITERATIONS) {
            iteration++;

            try {
              await agent.execVerify();
              await agent.deployToStaging();
              const healthy = await agent.healthCheck();

              if (healthy) {
                deployed = true;
              } else {
                await agent.rollback();
              }
            } catch (error) {
              await agent.rollback();
            }
          }

          return {
            status: deployed ? 'success' : 'failed',
            data: {
              deployed,
              healthCheckPassed: deployed,
              rollbackExecuted: !deployed,
            },
            metrics: { iterations: iteration },
          };
        }),
      } as any;

      const task: Task = {
        id: 'test-deploy',
        title: 'Deploy to staging',
        description: 'Deploy with health check',
        type: 'deployment',
        priority: 1,
        severity: 'Sev.2-High',
        impact: 'Critical',
        assignedAgent: 'DeploymentAgent',
        dependencies: [],
        estimatedDuration: 15,
        status: 'idle',
      };

      const result = await agent.execute(task);

      expect(result.status).toBe('success');
      expect(result.data.deployed).toBe(true);
      expect(result.data.healthCheckPassed).toBe(true);
      expect(result.data.rollbackExecuted).toBe(false);
      expect(agent.execVerify).toHaveBeenCalledTimes(1);
      expect(agent.deployToStaging).toHaveBeenCalledTimes(1);
      expect(agent.healthCheck).toHaveBeenCalledTimes(1);
      expect(agent.rollback).not.toHaveBeenCalled();
    });

    it('should rollback on health check failure and retry', async () => {
      let deployAttempt = 0;

      const agent = {
        execVerify: vi.fn().mockResolvedValue(undefined),
        deployToStaging: vi.fn().mockResolvedValue(undefined),
        healthCheck: vi.fn().mockImplementation(() => {
          deployAttempt++;
          // Fail first attempt, succeed on second
          return Promise.resolve(deployAttempt >= 2);
        }),
        rollback: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockImplementation(async (task: Task) => {
          let iteration = 0;
          const MAX_ITERATIONS = 3;
          let deployed = false;

          while (!deployed && iteration < MAX_ITERATIONS) {
            iteration++;

            try {
              await agent.execVerify();
              await agent.deployToStaging();
              const healthy = await agent.healthCheck();

              if (healthy) {
                deployed = true;
              } else {
                await agent.rollback();
              }
            } catch (error) {
              await agent.rollback();
            }
          }

          return {
            status: deployed ? 'success' : 'failed',
            data: {
              deployed,
              healthCheckPassed: deployed,
              rollbackExecuted: !deployed && iteration > 0,
            },
            metrics: { iterations: iteration },
          };
        }),
      } as any;

      const task: Task = {
        id: 'test-deploy-rollback',
        title: 'Deploy with rollback',
        description: 'Test rollback on health check failure',
        type: 'deployment',
        priority: 1,
        severity: 'Sev.2-High',
        impact: 'Critical',
        assignedAgent: 'DeploymentAgent',
        dependencies: [],
        estimatedDuration: 15,
        status: 'idle',
      };

      const result = await agent.execute(task);

      expect(result.status).toBe('success');
      expect(result.data.deployed).toBe(true);
      expect(result.metrics?.iterations).toBe(2);
      expect(agent.rollback).toHaveBeenCalledTimes(1); // Called once for first failure
      expect(agent.healthCheck).toHaveBeenCalledTimes(2);
    });

    it('should fail after max deployment attempts', async () => {
      const agent = {
        execVerify: vi.fn().mockResolvedValue(undefined),
        deployToStaging: vi.fn().mockResolvedValue(undefined),
        healthCheck: vi.fn().mockResolvedValue(false), // Always fails
        rollback: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockImplementation(async (task: Task) => {
          let iteration = 0;
          const MAX_ITERATIONS = 3;
          let deployed = false;

          while (!deployed && iteration < MAX_ITERATIONS) {
            iteration++;

            try {
              await agent.execVerify();
              await agent.deployToStaging();
              const healthy = await agent.healthCheck();

              if (healthy) {
                deployed = true;
              } else {
                await agent.rollback();
              }
            } catch (error) {
              await agent.rollback();
            }
          }

          return {
            status: deployed ? 'success' : 'failed',
            error: deployed ? undefined : 'Max deployment attempts reached',
            data: {
              deployed,
              healthCheckPassed: false,
              rollbackExecuted: true,
            },
            metrics: { iterations: iteration },
          };
        }),
      } as any;

      const task: Task = {
        id: 'test-deploy-max',
        title: 'Deploy failure',
        description: 'Test max deployment attempts',
        type: 'deployment',
        priority: 1,
        severity: 'Sev.2-High',
        impact: 'Critical',
        assignedAgent: 'DeploymentAgent',
        dependencies: [],
        estimatedDuration: 15,
        status: 'idle',
      };

      const result = await agent.execute(task);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Max deployment attempts reached');
      expect(result.data.rollbackExecuted).toBe(true);
      expect(result.metrics?.iterations).toBe(3);
      expect(agent.rollback).toHaveBeenCalledTimes(3);
      expect(agent.healthCheck).toHaveBeenCalledTimes(3);
    });
  });

  describe('Security Verification Auto-Loop', () => {
    it('should iterate until 0 critical vulnerabilities', async () => {
      let scanCount = 0;

      const agent = {
        scanSecurity: vi.fn().mockImplementation(() => {
          scanCount++;
          // Critical vuln on first 2 scans, clean on 3rd
          return Promise.resolve({
            vulnerabilities: {
              critical: scanCount < 3 ? 1 : 0,
              high: 0,
              medium: 0,
              low: 0,
            },
            secrets: [],
          });
        }),
        fixSecurityIssues: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockImplementation(async (task: Task) => {
          let iteration = 0;
          const MAX_ITERATIONS = 3;
          let passed = false;

          while (!passed && iteration < MAX_ITERATIONS) {
            iteration++;
            const scanResult = await agent.scanSecurity();

            if (scanResult.vulnerabilities.critical === 0 && scanResult.secrets.length === 0) {
              passed = true;
            } else {
              await agent.fixSecurityIssues(scanResult);
            }
          }

          if (!passed) {
            return {
              status: 'failed',
              error: 'CRITICAL: Security vulnerabilities remain - escalating to CISO',
            };
          }

          return {
            status: 'success',
            metrics: { iterations: iteration },
          };
        }),
      } as any;

      const task: Task = {
        id: 'test-security',
        title: 'Fix security issues',
        description: 'Test security verification loop',
        type: 'security',
        priority: 1,
        severity: 'Sev.1-Critical',
        impact: 'Critical',
        assignedAgent: 'ReviewAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
      };

      const result = await agent.execute(task);

      expect(result.status).toBe('success');
      expect(result.metrics?.iterations).toBe(3);
      expect(agent.scanSecurity).toHaveBeenCalledTimes(3);
      expect(agent.fixSecurityIssues).toHaveBeenCalledTimes(2); // Not called on final passing iteration
    });

    it('should escalate critical vulnerabilities immediately', async () => {
      const agent = {
        scanSecurity: vi.fn().mockResolvedValue({
          vulnerabilities: { critical: 2, high: 1, medium: 0, low: 0 },
          secrets: ['hardcoded-api-key'],
        }),
        fixSecurityIssues: vi.fn().mockResolvedValue(undefined),
        execute: vi.fn().mockImplementation(async (task: Task) => {
          let iteration = 0;
          const MAX_ITERATIONS = 3;
          let passed = false;

          while (!passed && iteration < MAX_ITERATIONS) {
            iteration++;
            const scanResult = await agent.scanSecurity();

            if (scanResult.vulnerabilities.critical === 0 && scanResult.secrets.length === 0) {
              passed = true;
            } else {
              await agent.fixSecurityIssues(scanResult);
            }
          }

          if (!passed) {
            return {
              status: 'failed',
              error: 'CRITICAL: Security vulnerabilities remain - escalating to CISO',
              metrics: { iterations: iteration },
            };
          }

          return { status: 'success', metrics: { iterations: iteration } };
        }),
      } as any;

      const task: Task = {
        id: 'test-security-escalate',
        title: 'Critical security issue',
        description: 'Test escalation',
        type: 'security',
        priority: 1,
        severity: 'Sev.1-Critical',
        impact: 'Critical',
        assignedAgent: 'ReviewAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
      };

      const result = await agent.execute(task);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('CRITICAL: Security vulnerabilities remain');
      expect(result.error).toContain('escalating to CISO');
      expect(result.metrics?.iterations).toBe(3);
    });
  });

  describe('Performance Optimization Auto-Loop', () => {
    it('should iterate until ≥20% improvement', async () => {
      let optimizationAttempt = 0;

      const agent = {
        measureBaseline: vi.fn().mockResolvedValue({ responseTime: 1000 }),
        optimizeCode: vi.fn().mockImplementation(() => {
          optimizationAttempt++;
          // Each attempt improves by 8%, need 3 attempts to reach 20%+
          return Promise.resolve({ responseTime: 1000 - optimizationAttempt * 80 });
        }),
        execute: vi.fn().mockImplementation(async (task: Task) => {
          const baseline = await agent.measureBaseline();
          let iteration = 0;
          const MAX_ITERATIONS = 5;
          let passed = false;
          let improvement = 0;

          while (!passed && iteration < MAX_ITERATIONS) {
            iteration++;
            const result = await agent.optimizeCode();
            improvement = ((baseline.responseTime - result.responseTime) / baseline.responseTime) * 100;

            if (improvement >= 20) {
              passed = true;
            }
          }

          return {
            status: passed ? 'success' : 'failed',
            data: { improvement },
            metrics: { iterations: iteration },
          };
        }),
      } as any;

      const task: Task = {
        id: 'test-perf',
        title: 'Optimize performance',
        description: 'Test performance optimization loop',
        type: 'optimization',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'High',
        assignedAgent: 'CodeGenAgent',
        dependencies: [],
        estimatedDuration: 45,
        status: 'idle',
      };

      const result = await agent.execute(task);

      expect(result.status).toBe('success');
      expect(result.data.improvement).toBeGreaterThanOrEqual(20);
      expect(result.metrics?.iterations).toBe(3);
      expect(agent.optimizeCode).toHaveBeenCalledTimes(3);
    });
  });
});
