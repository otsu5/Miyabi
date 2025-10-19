/**
 * CodeGenAgent - Template-Based File Generation Tests
 *
 * Tests the new template-based generation functionality for Discord community files.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CodeGenAgent } from '@miyabi/coding-agents/codegen/codegen-agent';
import { Task, AgentConfig } from '@miyabi/coding-agents/types/index';

describe('CodeGenAgent - Template Generation', () => {
  let agent: CodeGenAgent;
  let config: AgentConfig;

  beforeEach(() => {
    config = {
      deviceIdentifier: 'test-device',
      githubToken: 'test-token',
      anthropicApiKey: 'test-key',
      useTaskTool: false,
      useWorktree: false,
      logDirectory: './logs/test',
      reportDirectory: './reports/test',
    };
    agent = new CodeGenAgent(config);
  });

  describe('Discord Community File Generation', () => {
    it('should identify Discord community files when task includes "discord" and "community"', async () => {
      const task: Task = {
        id: 'test-discord-task',
        title: 'Setup Discord Community Server',
        description: 'Create Discord community infrastructure',
        type: 'docs',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'CodeGenAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
        metadata: { dryRun: true },
      };

      const result = await agent.execute(task);

      expect(result.status).toBe('success');
      expect(result.data).toBeDefined();
      expect(result.data.files).toBeDefined();
      expect(result.data.files.length).toBeGreaterThan(0);

      // Should generate Discord-related files
      const fileNames = result.data.files.map((f: any) => f.path);
      expect(fileNames).toContain('docs/discord/welcome.md');
      expect(fileNames).toContain('docs/discord/rules.md');
      expect(fileNames).toContain('docs/discord/faq.md');
      expect(fileNames).toContain('discord-config.json');
    });

    it('should NOT generate files for non-Discord tasks', async () => {
      const task: Task = {
        id: 'test-non-discord-task',
        title: 'Implement Authentication',
        description: 'Add user authentication',
        type: 'feature',
        priority: 1,
        severity: 'Sev.2-High',
        impact: 'High',
        assignedAgent: 'CodeGenAgent',
        dependencies: [],
        estimatedDuration: 120,
        status: 'idle',
        metadata: { dryRun: true },
      };

      const result = await agent.execute(task);

      expect(result.status).toBe('success');
      expect(result.data.files.length).toBe(0);
      expect(result.data.summary).toContain('No files could be automatically generated');
    });

    it('should generate Discord welcome file with correct structure', async () => {
      const task: Task = {
        id: 'test-welcome',
        title: 'Discord Community Setup',
        description: 'Setup community server',
        type: 'docs',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'CodeGenAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
        metadata: { dryRun: true },
      };

      const result = await agent.execute(task);

      const welcomeFile = result.data.files.find((f: any) => f.path === 'docs/discord/welcome.md');
      expect(welcomeFile).toBeDefined();
      expect(welcomeFile.content).toContain('Welcome to');
      expect(welcomeFile.content).toContain('Getting Started');
      expect(welcomeFile.content).toContain('Community Channels');
      expect(welcomeFile.type).toBe('new');
    });

    it('should generate Discord rules file with all rule sections', async () => {
      const task: Task = {
        id: 'test-rules',
        title: 'Discord Community Rules',
        description: 'Setup rules',
        type: 'docs',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'CodeGenAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
        metadata: { dryRun: true },
      };

      const result = await agent.execute(task);

      const rulesFile = result.data.files.find((f: any) => f.path === 'docs/discord/rules.md');
      expect(rulesFile).toBeDefined();
      expect(rulesFile.content).toContain('Community Rules');
      expect(rulesFile.content).toContain('Be Respectful');
      expect(rulesFile.content).toContain('Keep Content Appropriate');
      expect(rulesFile.content).toContain('Consequences');
      expect(rulesFile.type).toBe('new');
    });

    it('should generate Discord FAQ with common questions', async () => {
      const task: Task = {
        id: 'test-faq',
        title: 'Discord Community FAQ',
        description: 'Setup FAQ',
        type: 'docs',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'CodeGenAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
        metadata: { dryRun: true },
      };

      const result = await agent.execute(task);

      const faqFile = result.data.files.find((f: any) => f.path === 'docs/discord/faq.md');
      expect(faqFile).toBeDefined();
      expect(faqFile.content).toContain('Frequently Asked Questions');
      expect(faqFile.content).toContain('General Questions');
      expect(faqFile.content).toContain('Getting Started');
      expect(faqFile.content).toContain('Technical Questions');
      expect(faqFile.type).toBe('new');
    });

    it('should generate valid Discord config JSON', async () => {
      const task: Task = {
        id: 'test-config',
        title: 'Discord Community Configuration',
        description: 'Setup config',
        type: 'docs',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'CodeGenAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
        metadata: { dryRun: true },
      };

      const result = await agent.execute(task);

      const configFile = result.data.files.find((f: any) => f.path === 'discord-config.json');
      expect(configFile).toBeDefined();

      // Should be valid JSON
      expect(() => JSON.parse(configFile.content)).not.toThrow();

      const config = JSON.parse(configFile.content);
      expect(config.server_name).toBeDefined();
      expect(config.channels).toBeDefined();
      expect(config.channels.length).toBeGreaterThan(0);
      expect(config.roles).toBeDefined();
      expect(config.moderation).toBeDefined();
      expect(configFile.type).toBe('new');
    });
  });

  describe('File Type Detection', () => {
    it('should mark new files with type: "new"', async () => {
      const task: Task = {
        id: 'test-new-files',
        title: 'Discord Community Setup',
        description: 'Setup community',
        type: 'docs',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'CodeGenAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
        metadata: { dryRun: true },
      };

      const result = await agent.execute(task);

      const newFiles = result.data.files.filter((f: any) => f.type === 'new');
      expect(newFiles.length).toBeGreaterThan(0);
    });
  });

  describe('Validation', () => {
    it('should validate that generated files are not empty', async () => {
      const task: Task = {
        id: 'test-validation',
        title: 'Discord Community Files',
        description: 'Generate files',
        type: 'docs',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'CodeGenAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
        metadata: { dryRun: true },
      };

      const result = await agent.execute(task);

      // All generated files should have content
      for (const file of result.data.files) {
        expect(file.content.trim()).not.toBe('');
        expect(file.content.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Metrics', () => {
    it('should calculate metrics for generated code', async () => {
      const task: Task = {
        id: 'test-metrics',
        title: 'Discord Community Documentation',
        description: 'Generate docs',
        type: 'docs',
        priority: 1,
        severity: 'Sev.3-Medium',
        impact: 'Medium',
        assignedAgent: 'CodeGenAgent',
        dependencies: [],
        estimatedDuration: 30,
        status: 'idle',
        metadata: { dryRun: true },
      };

      const result = await agent.execute(task);

      expect(result.metrics).toBeDefined();
      expect(result.metrics?.linesChanged).toBeGreaterThan(0);
      expect(result.metrics?.durationMs).toBeGreaterThan(0);
      expect(result.metrics?.taskId).toBe(task.id);
      expect(result.metrics?.agentType).toBe('CodeGenAgent');
    });
  });
});
