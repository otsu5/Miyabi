/**
 * GitHubClient - GitHub REST API Integration
 *
 * Features:
 * - Issue fetching with Octokit
 * - 5-minute TTL caching
 * - Rate limit handling
 * - Owner/repo auto-detection
 */
import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
export class GitHubClient {
    octokit;
    cache = new Map();
    cacheTTL;
    debug;
    constructor(options) {
        this.octokit = new Octokit({ auth: options.token });
        this.cacheTTL = options.cacheTTL ?? 5 * 60 * 1000; // Default: 5 minutes
        this.debug = options.debug ?? false;
    }
    /**
     * Fetch an issue from GitHub
     * @param owner Repository owner
     * @param repo Repository name
     * @param issueNumber Issue number
     * @returns Issue object or null if not found
     */
    async fetchIssue(owner, repo, issueNumber) {
        // Check cache first
        const cached = this.cache.get(issueNumber);
        if (cached && cached.expiresAt > Date.now()) {
            if (this.debug) {
                console.log(`[GitHubClient] Cache hit for issue #${issueNumber}`);
            }
            return cached.issue;
        }
        if (this.debug) {
            console.log(`[GitHubClient] Fetching issue #${issueNumber} from GitHub API`);
        }
        try {
            const { data } = await this.octokit.rest.issues.get({
                owner,
                repo,
                issue_number: issueNumber,
            });
            const issue = {
                number: data.number,
                title: data.title,
                body: data.body || '',
                state: data.state,
                labels: data.labels.map((l) => typeof l === 'string' ? l : l.name || ''),
                assignee: data.assignee?.login,
                createdAt: data.created_at,
                updatedAt: data.updated_at,
                url: data.html_url,
            };
            // Cache with expiration time
            this.cache.set(issueNumber, {
                issue,
                expiresAt: Date.now() + this.cacheTTL,
            });
            if (this.debug) {
                console.log(`[GitHubClient] Cached issue #${issueNumber} for ${this.cacheTTL}ms`);
            }
            return issue;
        }
        catch (error) {
            if (error.status === 404) {
                console.error(`[GitHubClient] Issue #${issueNumber} not found in ${owner}/${repo}`);
                return null;
            }
            if (error.status === 403 && error.response?.headers['x-ratelimit-remaining'] === '0') {
                const resetTime = new Date(parseInt(error.response.headers['x-ratelimit-reset']) * 1000);
                throw new Error(`GitHub API rate limit exceeded. Resets at ${resetTime.toISOString()}`);
            }
            // Re-throw other errors
            throw error;
        }
    }
    /**
     * Extract owner and repo from git remote URL
     * @returns Object with owner and repo
     * @throws Error if remote URL is not a valid GitHub URL
     */
    extractOwnerRepo() {
        try {
            const remoteUrl = execSync('git config --get remote.origin.url', {
                encoding: 'utf-8',
            }).trim();
            // Match both HTTPS and SSH formats
            // HTTPS: https://github.com/owner/repo.git
            // SSH: git@github.com:owner/repo.git
            const match = remoteUrl.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
            if (!match) {
                throw new Error(`Invalid GitHub remote URL: ${remoteUrl}`);
            }
            return { owner: match[1], repo: match[2] };
        }
        catch (error) {
            if (error.message.includes('Invalid GitHub remote URL')) {
                throw error;
            }
            throw new Error(`Failed to extract owner/repo from git remote: ${error.message}`);
        }
    }
    /**
     * Fetch multiple issues in parallel
     * @param owner Repository owner
     * @param repo Repository name
     * @param issueNumbers Array of issue numbers
     * @returns Array of Issue objects (nulls for not found issues)
     */
    async fetchIssues(owner, repo, issueNumbers) {
        return Promise.all(issueNumbers.map((issueNumber) => this.fetchIssue(owner, repo, issueNumber)));
    }
    /**
     * Clear the cache
     */
    clearCache() {
        this.cache.clear();
        if (this.debug) {
            console.log('[GitHubClient] Cache cleared');
        }
    }
    /**
     * Get cache statistics
     */
    getCacheStats() {
        const now = Date.now();
        let validEntries = 0;
        let expiredEntries = 0;
        for (const [, value] of this.cache) {
            if (value.expiresAt > now) {
                validEntries++;
            }
            else {
                expiredEntries++;
            }
        }
        return {
            size: this.cache.size,
            validEntries,
            expiredEntries,
        };
    }
    /**
     * Clean up expired cache entries
     */
    cleanExpiredCache() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, value] of this.cache) {
            if (value.expiresAt <= now) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        if (this.debug && cleaned > 0) {
            console.log(`[GitHubClient] Cleaned ${cleaned} expired cache entries`);
        }
    }
    /**
     * Check GitHub API rate limit status
     */
    async getRateLimitStatus() {
        const { data } = await this.octokit.rest.rateLimit.get();
        const core = data.resources.core;
        return {
            limit: core.limit,
            remaining: core.remaining,
            reset: new Date(core.reset * 1000),
            used: core.used,
        };
    }
}
//# sourceMappingURL=github-client.js.map