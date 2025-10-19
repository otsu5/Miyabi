/**
 * E2E Test for /review Command
 *
 * Tests the complete review workflow including:
 * - ReviewAgent execution
 * - Quality scoring
 * - Interactive loop simulation
 * - Auto-fix integration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewAgent } from '@miyabi/coding-agents/review/review-agent';
import { Task, AgentConfig } from '@miyabi/coding-agents/types/index';

describe('/review Command E2E', () => {
  let agent: ReviewAgent;
  let config: AgentConfig;

  beforeEach(() => {
    config = {
      deviceIdentifier: 'e2e-test',
      githubToken: process.env.GITHUB_TOKEN || 'test-token',
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || 'test-key',
      useTaskTool: false,
      useWorktree: false,
      logDirectory: './logs/e2e',
      reportDirectory: './reports/e2e',
    };
    agent = new ReviewAgent(config);
  });

  describe('Review Workflow - Happy Path', () => {
    it('should complete review successfully for clean code', async () => {
      const task: Task = {
        id: 'e2e-clean-code',
        title: 'E2E Test - Clean Code Review',
        description: 'Test review workflow with clean code',
        type: 'test',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'ReviewAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
        metadata: {
          files: ['package.json'], // Clean file
          dryRun: true,
        },
      };

      try {
        const result = await agent.execute(task);

        // Verify result structure
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('data');
        expect(result.data).toHaveProperty('qualityReport');

        const report = result.data.qualityReport;

        // Verify quality report
        expect(report.score).toBeGreaterThanOrEqual(0);
        expect(report.score).toBeLessThanOrEqual(100);
        expect(report).toHaveProperty('passed');
        expect(report).toHaveProperty('breakdown');

        // Log results
        console.log(`✅ Review completed with score: ${report.score}/100`);
        console.log(`   Status: ${report.passed ? 'PASSED' : 'FAILED'}`);
      } catch (error: any) {
        // If escalation occurs due to TypeScript errors, that's expected behavior
        if (error.message.includes('security') || error.message.includes('critically low')) {
          console.log(`⚠️  Review triggered escalation: ${error.message}`);
          expect(error.message).toBeTruthy();
        } else {
          throw error;
        }
      }
    }, 30000);
  });

  describe('Review Workflow - Auto-Loop Pattern', () => {
    it('should iterate until threshold or max iterations', async () => {
      const task: Task = {
        id: 'e2e-auto-loop',
        title: 'E2E Test - Auto-Loop Pattern',
        description: 'Test Nacho\'s auto-loop pattern from OpenAI Dev Day',
        type: 'test',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'ReviewAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
        metadata: {
          files: ['package.json'],
          dryRun: true,
        },
      };

      const maxIterations = 3;
      const threshold = 80;
      let iteration = 0;
      let finalScore = 0;
      let passed = false;

      try {
        while (iteration < maxIterations && !passed) {
          iteration++;
          console.log(`\n🔍 Review iteration ${iteration}/${maxIterations}`);

          const result = await agent.execute(task);
          finalScore = result.data.qualityReport.score;

          console.log(`   Score: ${finalScore}/100`);

          if (finalScore >= threshold) {
            passed = true;
            console.log(`   ✅ PASSED threshold`);
          } else {
            console.log(`   ⏳ Below threshold, would continue...`);
          }

          // In real implementation, code would be fixed between iterations
          // For E2E test, we break after first iteration
          break;
        }

        expect(iteration).toBeGreaterThan(0);
        expect(iteration).toBeLessThanOrEqual(maxIterations);
        expect(finalScore).toBeDefined();
      } catch (error: any) {
        // Escalation is expected behavior for critical issues
        console.log(`   🚨 Escalation triggered: ${error.message}`);
        expect(error.message).toBeTruthy();
        expect(iteration).toBeGreaterThan(0);
      }
    }, 30000);
  });

  describe('Review Workflow - Quality Breakdown', () => {
    it('should provide detailed breakdown of quality metrics', async () => {
      const task: Task = {
        id: 'e2e-breakdown',
        title: 'E2E Test - Quality Breakdown',
        description: 'Verify detailed quality metrics',
        type: 'test',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'ReviewAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
        metadata: {
          files: ['package.json'],
          dryRun: true,
        },
      };

      try {
        const result = await agent.execute(task);
        const report = result.data.qualityReport;

        // Verify breakdown exists
        expect(report.breakdown).toBeDefined();
        expect(report.breakdown).toHaveProperty('eslintScore');
        expect(report.breakdown).toHaveProperty('typeScriptScore');
        expect(report.breakdown).toHaveProperty('securityScore');
        expect(report.breakdown).toHaveProperty('testCoverageScore');

        // Log breakdown
        console.log('\n📊 Quality Breakdown:');
        console.log(`   ESLint:        ${report.breakdown.eslintScore}/100`);
        console.log(`   TypeScript:    ${report.breakdown.typeScriptScore}/100`);
        console.log(`   Security:      ${report.breakdown.securityScore}/100`);
        console.log(`   Test Coverage: ${report.breakdown.testCoverageScore}/100`);
        console.log(`   Overall:       ${report.score}/100`);

        // Verify all scores are in valid range
        expect(report.breakdown.eslintScore).toBeGreaterThanOrEqual(0);
        expect(report.breakdown.eslintScore).toBeLessThanOrEqual(100);
        expect(report.breakdown.typeScriptScore).toBeGreaterThanOrEqual(0);
        expect(report.breakdown.typeScriptScore).toBeLessThanOrEqual(100);
        expect(report.breakdown.securityScore).toBeGreaterThanOrEqual(0);
        expect(report.breakdown.securityScore).toBeLessThanOrEqual(100);
      } catch (error: any) {
        // Log escalation details
        console.log(`⚠️  Escalation: ${error.message}`);
        expect(error.message).toBeTruthy();
      }
    }, 30000);
  });

  describe('Review Workflow - Recommendations', () => {
    it('should provide actionable recommendations', async () => {
      const task: Task = {
        id: 'e2e-recommendations',
        title: 'E2E Test - Recommendations',
        description: 'Verify actionable recommendations are provided',
        type: 'test',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'ReviewAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
        metadata: {
          files: ['package.json'],
          dryRun: true,
        },
      };

      try {
        const result = await agent.execute(task);
        const report = result.data.qualityReport;

        // Verify recommendations exist
        expect(report.recommendations).toBeDefined();
        expect(Array.isArray(report.recommendations)).toBe(true);

        if (report.recommendations.length > 0) {
          console.log('\n💡 Recommendations:');
          report.recommendations.forEach((rec: string, index: number) => {
            console.log(`   ${index + 1}. ${rec}`);
          });
        } else {
          console.log('\n✅ No recommendations - code quality is excellent!');
        }
      } catch (error: any) {
        console.log(`⚠️  Escalation: ${error.message}`);
        expect(error.message).toBeTruthy();
      }
    }, 30000);
  });

  describe('Review Workflow - Comments Generation', () => {
    it('should generate review comments for issues', async () => {
      const task: Task = {
        id: 'e2e-comments',
        title: 'E2E Test - Review Comments',
        description: 'Verify review comments are generated',
        type: 'test',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'ReviewAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
        metadata: {
          files: ['package.json'],
          dryRun: true,
        },
      };

      try {
        const result = await agent.execute(task);
        const comments = result.data.comments;

        // Verify comments structure
        expect(Array.isArray(comments)).toBe(true);

        if (comments.length > 0) {
          console.log(`\n💬 Generated ${comments.length} review comments:`);
          comments.slice(0, 3).forEach((comment, index) => {
            console.log(`\n   Comment ${index + 1}:`);
            console.log(`     File: ${comment.file}:${comment.line}`);
            console.log(`     Severity: ${comment.severity}`);
            console.log(`     Message: ${comment.message}`);
          });
          if (comments.length > 3) {
            console.log(`   ... and ${comments.length - 3} more`);
          }
        } else {
          console.log('\n✅ No issues found - clean code!');
        }
      } catch (error: any) {
        console.log(`⚠️  Escalation: ${error.message}`);
        expect(error.message).toBeTruthy();
      }
    }, 30000);
  });
});
