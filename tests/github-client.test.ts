/**
 * GitHubClient Tests
 *
 * Tests for GitHub REST API integration with:
 * - Issue fetching
 * - Caching behavior
 * - Rate limit handling
 * - Owner/repo extraction
 * - Error handling
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Create mock functions
const mockIssuesGet = vi.fn();
const mockRateLimitGet = vi.fn();
const mockExecSync = vi.fn();

// Mock Octokit
vi.mock('@octokit/rest', () => {
  return {
    Octokit: vi.fn().mockImplementation(() => {
      return {
        rest: {
          issues: {
            get: mockIssuesGet,
          },
          rateLimit: {
            get: mockRateLimitGet,
          },
        },
      };
    }),
  };
});

// Mock child_process
vi.mock('child_process', () => {
  return {
    execSync: mockExecSync,
  };
});

// Import after mocks are set up
const { GitHubClient } = await import('@miyabi/coding-agents/utils/github-client');

describe('GitHubClient', () => {
  let githubClient: InstanceType<typeof GitHubClient>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create GitHubClient instance
    githubClient = new GitHubClient({
      token: 'test-token',
      cacheTTL: 1000, // 1 second for testing
      debug: false,
    });
  });

  afterEach(() => {
    githubClient.clearCache();
  });

  describe('fetchIssue', () => {
    it('should fetch issue from GitHub API', async () => {
      const mockIssueData = {
        number: 270,
        title: 'Test Issue',
        body: 'Test issue body',
        state: 'open',
        labels: [{ name: 'type:feature' }, { name: 'priority:P1-High' }],
        assignee: { login: 'testuser' },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
        html_url: 'https://github.com/test/repo/issues/270',
      };

      mockIssuesGet.mockResolvedValue({ data: mockIssueData });

      const issue = await githubClient.fetchIssue('test', 'repo', 270);

      expect(issue).toEqual({
        number: 270,
        title: 'Test Issue',
        body: 'Test issue body',
        state: 'open',
        labels: ['type:feature', 'priority:P1-High'],
        assignee: 'testuser',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
        url: 'https://github.com/test/repo/issues/270',
      });

      expect(mockIssuesGet).toHaveBeenCalledWith({
        owner: 'test',
        repo: 'repo',
        issue_number: 270,
      });
    });

    it('should handle missing issue body', async () => {
      const mockIssueData = {
        number: 271,
        title: 'Issue without body',
        body: null,
        state: 'open',
        labels: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        html_url: 'https://github.com/test/repo/issues/271',
      };

      mockIssuesGet.mockResolvedValue({ data: mockIssueData });

      const issue = await githubClient.fetchIssue('test', 'repo', 271);

      expect(issue?.body).toBe('');
    });

    it('should handle string labels', async () => {
      const mockIssueData = {
        number: 272,
        title: 'Test Issue',
        body: 'Test',
        state: 'open',
        labels: ['bug', 'urgent'],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        html_url: 'https://github.com/test/repo/issues/272',
      };

      mockIssuesGet.mockResolvedValue({ data: mockIssueData });

      const issue = await githubClient.fetchIssue('test', 'repo', 272);

      expect(issue?.labels).toEqual(['bug', 'urgent']);
    });

    it('should return null for 404 errors', async () => {
      mockIssuesGet.mockRejectedValue({
        status: 404,
        message: 'Not Found',
      });

      const issue = await githubClient.fetchIssue('test', 'repo', 999);

      expect(issue).toBeNull();
    });

    it('should throw error for rate limit exceeded', async () => {
      mockIssuesGet.mockRejectedValue({
        status: 403,
        response: {
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1704153600', // 2024-01-02 00:00:00 UTC
          },
        },
      });

      await expect(githubClient.fetchIssue('test', 'repo', 270)).rejects.toThrow(
        /GitHub API rate limit exceeded/
      );
    });

    it('should re-throw other errors', async () => {
      mockIssuesGet.mockRejectedValue(
        new Error('Network error')
      );

      await expect(githubClient.fetchIssue('test', 'repo', 270)).rejects.toThrow(
        'Network error'
      );
    });
  });

  describe('Caching', () => {
    it('should cache fetched issues', async () => {
      const mockIssueData = {
        number: 270,
        title: 'Cached Issue',
        body: 'Test',
        state: 'open',
        labels: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        html_url: 'https://github.com/test/repo/issues/270',
      };

      mockIssuesGet.mockResolvedValue({ data: mockIssueData });

      // First call - should fetch from API
      await githubClient.fetchIssue('test', 'repo', 270);

      // Second call - should use cache
      await githubClient.fetchIssue('test', 'repo', 270);

      // API should only be called once
      expect(mockIssuesGet).toHaveBeenCalledTimes(1);
    });

    it('should expire cache after TTL', async () => {
      const mockIssueData = {
        number: 270,
        title: 'Cached Issue',
        body: 'Test',
        state: 'open',
        labels: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        html_url: 'https://github.com/test/repo/issues/270',
      };

      mockIssuesGet.mockResolvedValue({ data: mockIssueData });

      // First call
      await githubClient.fetchIssue('test', 'repo', 270);

      // Wait for cache to expire (TTL = 1000ms)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Second call - should fetch from API again
      await githubClient.fetchIssue('test', 'repo', 270);

      // API should be called twice
      expect(mockIssuesGet).toHaveBeenCalledTimes(2);
    });

    it('should clear cache', async () => {
      const mockIssueData = {
        number: 270,
        title: 'Cached Issue',
        body: 'Test',
        state: 'open',
        labels: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        html_url: 'https://github.com/test/repo/issues/270',
      };

      mockIssuesGet.mockResolvedValue({ data: mockIssueData });

      // Fetch and cache
      await githubClient.fetchIssue('test', 'repo', 270);

      // Clear cache
      githubClient.clearCache();

      // Fetch again - should call API
      await githubClient.fetchIssue('test', 'repo', 270);

      expect(mockIssuesGet).toHaveBeenCalledTimes(2);
    });

    it('should provide cache statistics', async () => {
      const mockIssueData = {
        number: 270,
        title: 'Cached Issue',
        body: 'Test',
        state: 'open',
        labels: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        html_url: 'https://github.com/test/repo/issues/270',
      };

      mockIssuesGet.mockResolvedValue({ data: mockIssueData });

      await githubClient.fetchIssue('test', 'repo', 270);

      const stats = githubClient.getCacheStats();

      expect(stats.size).toBe(1);
      expect(stats.validEntries).toBe(1);
      expect(stats.expiredEntries).toBe(0);
    });

    it('should clean expired cache entries', async () => {
      const mockIssueData = {
        number: 270,
        title: 'Cached Issue',
        body: 'Test',
        state: 'open',
        labels: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        html_url: 'https://github.com/test/repo/issues/270',
      };

      mockIssuesGet.mockResolvedValue({ data: mockIssueData });

      await githubClient.fetchIssue('test', 'repo', 270);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Clean expired entries
      githubClient.cleanExpiredCache();

      const stats = githubClient.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('extractOwnerRepo', () => {
    it('should extract owner and repo from HTTPS URL', () => {
      mockExecSync.mockReturnValue('https://github.com/ShunsukeHayashi/Miyabi.git\n');

      const { owner, repo } = githubClient.extractOwnerRepo();

      expect(owner).toBe('ShunsukeHayashi');
      expect(repo).toBe('Miyabi');
    });

    it('should extract owner and repo from SSH URL', () => {
      mockExecSync.mockReturnValue('git@github.com:ShunsukeHayashi/Miyabi.git\n');

      const { owner, repo } = githubClient.extractOwnerRepo();

      expect(owner).toBe('ShunsukeHayashi');
      expect(repo).toBe('Miyabi');
    });

    it('should extract without .git extension', () => {
      mockExecSync.mockReturnValue('https://github.com/ShunsukeHayashi/Miyabi\n');

      const { owner, repo } = githubClient.extractOwnerRepo();

      expect(owner).toBe('ShunsukeHayashi');
      expect(repo).toBe('Miyabi');
    });

    it('should throw error for invalid URL', () => {
      mockExecSync.mockReturnValue('https://gitlab.com/user/repo.git\n');

      expect(() => githubClient.extractOwnerRepo()).toThrow(
        /Invalid GitHub remote URL/
      );
    });

    it('should throw error for git command failure', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command failed');
      });

      expect(() => githubClient.extractOwnerRepo()).toThrow(
        /Failed to extract owner\/repo/
      );
    });
  });

  describe('fetchIssues', () => {
    it('should fetch multiple issues in parallel', async () => {
      const mockIssueData1 = {
        number: 270,
        title: 'Issue 1',
        body: 'Test',
        state: 'open',
        labels: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        html_url: 'https://github.com/test/repo/issues/270',
      };

      const mockIssueData2 = {
        number: 271,
        title: 'Issue 2',
        body: 'Test',
        state: 'open',
        labels: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        html_url: 'https://github.com/test/repo/issues/271',
      };

      mockIssuesGet
        .mockResolvedValueOnce({ data: mockIssueData1 })
        .mockResolvedValueOnce({ data: mockIssueData2 });

      const issues = await githubClient.fetchIssues('test', 'repo', [270, 271]);

      expect(issues).toHaveLength(2);
      expect(issues[0]?.number).toBe(270);
      expect(issues[1]?.number).toBe(271);
    });

    it('should handle mixed success and failure', async () => {
      const mockIssueData = {
        number: 270,
        title: 'Issue 1',
        body: 'Test',
        state: 'open',
        labels: [],
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        html_url: 'https://github.com/test/repo/issues/270',
      };

      mockIssuesGet
        .mockResolvedValueOnce({ data: mockIssueData })
        .mockRejectedValueOnce({ status: 404 });

      const issues = await githubClient.fetchIssues('test', 'repo', [270, 999]);

      expect(issues).toHaveLength(2);
      expect(issues[0]?.number).toBe(270);
      expect(issues[1]).toBeNull();
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return rate limit status', async () => {
      mockRateLimitGet.mockResolvedValue({
        data: {
          resources: {
            core: {
              limit: 5000,
              remaining: 4999,
              reset: 1704153600,
              used: 1,
            },
          },
        },
      });

      const status = await githubClient.getRateLimitStatus();

      expect(status.limit).toBe(5000);
      expect(status.remaining).toBe(4999);
      expect(status.used).toBe(1);
      expect(status.reset).toBeInstanceOf(Date);
    });
  });
});
