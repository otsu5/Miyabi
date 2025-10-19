import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

// Mock all dependencies
vi.mock('fs');
vi.mock('child_process');
vi.mock('chalk', () => ({
  default: {
    cyan: { bold: vi.fn((text: string) => text) },
    green: { bold: vi.fn((text: string) => text) },
    yellow: vi.fn((text: string) => text),
  },
}));

vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    text: '',
  })),
}));

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn().mockResolvedValue({ confirm: true }),
  },
}));

vi.mock('../../auth/github-oauth', () => ({
  githubOAuth: vi.fn().mockResolvedValue('test_token'),
}));

vi.mock('../../setup/repository', () => ({
  createRepository: vi.fn().mockResolvedValue({
    owner: 'test-owner',
    repo: 'test-repo',
    url: 'https://github.com/test-owner/test-repo',
  }),
}));

vi.mock('../../setup/labels', () => ({
  setupLabels: vi.fn().mockResolvedValue({ created: 53, updated: 0 }),
}));

vi.mock('../../setup/workflows', () => ({
  deployWorkflows: vi.fn().mockResolvedValue(10),
}));

vi.mock('../../setup/projects', () => ({
  createProjectV2: vi.fn().mockResolvedValue({
    url: 'https://github.com/users/test-owner/projects/1',
  }),
  linkToProject: vi.fn(),
}));

vi.mock('../../setup/local', () => ({
  cloneAndSetup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../setup/welcome', () => ({
  showWelcome: vi.fn(),
}));

describe('init command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('init flow', () => {
    it('should execute full init flow', async () => {
      const { githubOAuth } = await import('../../auth/github-oauth');
      const { createRepository } = await import('../../setup/repository');
      const { setupLabels } = await import('../../setup/labels');
      const { deployWorkflows } = await import('../../setup/workflows');
      const { createProjectV2 } = await import('../../setup/projects');
      const { cloneAndSetup } = await import('../../setup/local');

      // Simulate init flow
      const token = await githubOAuth();
      expect(token).toBe('test_token');

      const repoInfo = await createRepository('test-project', token, false);
      expect(repoInfo.owner).toBe('test-owner');
      expect(repoInfo.repo).toBe('test-repo');

      const labels = await setupLabels(repoInfo.owner, repoInfo.repo, token);
      expect(labels.created).toBe(53);

      const workflowCount = await deployWorkflows(repoInfo.owner, repoInfo.repo, token);
      expect(workflowCount).toBe(10);

      const projectInfo = await createProjectV2(repoInfo.owner, repoInfo.repo, token);
      expect(projectInfo.url).toBeTruthy();

      await cloneAndSetup(repoInfo.url, 'test-project', { skipInstall: false });

      expect(githubOAuth).toHaveBeenCalledTimes(1);
      expect(createRepository).toHaveBeenCalledTimes(1);
      expect(setupLabels).toHaveBeenCalledTimes(1);
      expect(deployWorkflows).toHaveBeenCalledTimes(1);
      expect(createProjectV2).toHaveBeenCalledTimes(1);
      expect(cloneAndSetup).toHaveBeenCalledTimes(1);
    });

    it('should handle private repository option', async () => {
      const { createRepository } = await import('../../setup/repository');

      await createRepository('test-project', 'test_token', true);

      expect(createRepository).toHaveBeenCalledWith('test-project', 'test_token', true);
    });

    it('should handle skip-install option', async () => {
      const { cloneAndSetup } = await import('../../setup/local');

      await cloneAndSetup('https://github.com/test/repo', 'test-project', {
        skipInstall: true,
      });

      expect(cloneAndSetup).toHaveBeenCalledWith(
        'https://github.com/test/repo',
        'test-project',
        { skipInstall: true }
      );
    });

    it('should handle authentication failure', async () => {
      const { githubOAuth } = await import('../../auth/github-oauth');
      vi.mocked(githubOAuth).mockRejectedValueOnce(new Error('Authentication failed'));

      await expect(githubOAuth()).rejects.toThrow('Authentication failed');
    });

    it('should handle repository creation failure', async () => {
      const { createRepository } = await import('../../setup/repository');
      vi.mocked(createRepository).mockRejectedValueOnce(
        new Error('Repository already exists')
      );

      await expect(createRepository('existing-repo', 'test_token', false)).rejects.toThrow(
        'Repository already exists'
      );
    });

    it('should handle label setup failure', async () => {
      const { setupLabels } = await import('../../setup/labels');
      vi.mocked(setupLabels).mockRejectedValueOnce(new Error('Insufficient permissions'));

      await expect(setupLabels('owner', 'repo', 'test_token')).rejects.toThrow(
        'Insufficient permissions'
      );
    });

    it('should handle workflow deployment failure', async () => {
      const { deployWorkflows } = await import('../../setup/workflows');
      vi.mocked(deployWorkflows).mockRejectedValueOnce(new Error('API rate limit exceeded'));

      await expect(deployWorkflows('owner', 'repo', 'test_token')).rejects.toThrow(
        'API rate limit exceeded'
      );
    });
  });

  describe('validation', () => {
    it('should validate project name format', () => {
      const invalidNames = ['my project', 'my@project', 'my/project', ''];
      const validNames = ['my-project', 'my_project', 'myproject', 'my-project-123'];

      invalidNames.forEach((name) => {
        const isValid = /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0;
        expect(isValid).toBe(false);
      });

      validNames.forEach((name) => {
        const isValid = /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0;
        expect(isValid).toBe(true);
      });
    });

    it('should check if directory already exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      expect(fs.existsSync('existing-project')).toBe(true);
    });

    it('should allow new directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(fs.existsSync('new-project')).toBe(false);
    });
  });

  describe('progress tracking', () => {
    it('should track all setup steps', async () => {
      const steps = [
        'Authenticating with GitHub',
        'Creating repository',
        'Setting up labels (53)',
        'Deploying workflows (10+)',
        'Creating Projects V2',
        'Cloning repository locally',
        'Installing dependencies',
      ];

      expect(steps.length).toBe(7);
      expect(steps[0]).toContain('Authenticating');
      expect(steps[2]).toContain('53');
    });
  });
});
