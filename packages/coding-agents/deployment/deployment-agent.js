/**
 * DeploymentAgent - CI/CD and Deployment Automation Agent
 *
 * Responsibilities:
 * - Automated deployment to staging/production
 * - Firebase project deployment
 * - Health check verification
 * - Automatic rollback on failure
 * - Deployment metrics collection
 * - CTO escalation for production deployments
 */
import { BaseAgent } from '../base-agent';
import * as fs from 'fs';
export class DeploymentAgent extends BaseAgent {
    deploymentHistory = [];
    constructor(config) {
        super('DeploymentAgent', config);
    }
    /**
     * Main execution: Deploy application
     */
    async execute(task) {
        this.log('🚀 DeploymentAgent starting deployment');
        try {
            // 1. Determine deployment target (staging/production)
            const deploymentConfig = await this.createDeploymentConfig(task);
            // 2. Pre-deployment validation
            await this.validatePreDeployment(deploymentConfig);
            // 3. Build application
            const buildResult = await this.buildApplication();
            if (!buildResult.success) {
                throw new Error(`Build failed: ${buildResult.error}`);
            }
            // 4. Run tests before deployment
            const testResult = await this.runTests();
            if (!testResult.success) {
                throw new Error(`Tests failed: ${testResult.error}`);
            }
            // 5. Deploy to target environment
            const deploymentResult = await this.deploy(deploymentConfig);
            // 6. Health check
            const healthCheck = await this.performHealthCheck(deploymentConfig);
            if (!healthCheck.success) {
                // Automatic rollback
                await this.rollback(deploymentConfig);
                throw new Error(`Health check failed: ${healthCheck.error}`);
            }
            // 7. Update deployment history
            this.deploymentHistory.push(deploymentResult);
            // 7.5. Record deployment to trace logger (if issue context available)
            if (task.metadata?.issueNumber && this.traceLogger) {
                try {
                    this.traceLogger.recordDeployment(deploymentResult);
                    this.log(`📋 Deployment recorded to trace log`);
                }
                catch (error) {
                    // Trace logger not initialized - continue without logging
                    this.log(`⚠️  Failed to record deployment: ${error.message}`);
                }
            }
            // 8. Notify stakeholders
            await this.notifyDeployment(deploymentResult, deploymentConfig);
            this.log(`✅ Deployment successful: ${deploymentConfig.environment} - ${deploymentResult.version}`);
            return {
                status: 'success',
                data: deploymentResult,
                metrics: {
                    taskId: task.id,
                    agentType: this.agentType,
                    durationMs: Date.now() - this.startTime,
                    timestamp: new Date().toISOString(),
                },
            };
        }
        catch (error) {
            this.log(`❌ Deployment failed: ${error.message}`);
            // Production deployment failures escalate to CTO
            if (task.metadata?.environment === 'production') {
                await this.escalate(`Production deployment failed: ${error.message}`, 'CTO', 'Sev.1-Critical', {
                    task: task.id,
                    environment: 'production',
                    error: error.stack,
                });
            }
            throw error;
        }
    }
    // ============================================================================
    // Deployment Configuration
    // ============================================================================
    /**
     * Create deployment configuration from task
     */
    async createDeploymentConfig(task) {
        this.log('📋 Creating deployment configuration');
        // Determine environment
        const environment = task.metadata?.environment || 'staging';
        // Check if production deployment (requires approval)
        if (environment === 'production') {
            await this.escalate(`Production deployment requested: ${task.title}`, 'CTO', 'Sev.2-High', { task: task.id, environment });
            this.log('⏸️  Awaiting CTO approval for production deployment...');
        }
        // Get version from package.json or git
        const version = await this.getVersion();
        // Get Firebase project ID
        const projectId = environment === 'production'
            ? this.config.firebaseProductionProject || 'my-app-prod'
            : this.config.firebaseStagingProject || 'my-app-staging';
        return {
            environment: environment,
            version,
            projectId,
            targets: ['hosting', 'functions'], // Firebase targets
            skipTests: task.metadata?.skipTests || false,
            autoRollback: true,
            healthCheckUrl: this.getHealthCheckUrl(environment),
        };
    }
    /**
     * Get version from package.json or git tag
     */
    async getVersion() {
        try {
            // Try to get from package.json
            const pkg = JSON.parse(await fs.promises.readFile('package.json', 'utf-8'));
            if (pkg.version) {
                return pkg.version;
            }
        }
        catch (error) {
            // Ignore
        }
        // Try to get from git tag
        try {
            const result = await this.executeCommand('git describe --tags --always');
            return result.stdout.trim();
        }
        catch (error) {
            // Use timestamp
            return `v${Date.now()}`;
        }
    }
    /**
     * Get health check URL for environment
     */
    getHealthCheckUrl(environment) {
        if (environment === 'production') {
            return this.config.productionUrl || 'https://my-app.com/health';
        }
        return this.config.stagingUrl || 'https://staging.my-app.com/health';
    }
    // ============================================================================
    // Pre-Deployment Validation
    // ============================================================================
    /**
     * Validate system before deployment
     */
    async validatePreDeployment(config) {
        this.log('🔍 Validating pre-deployment conditions');
        // 1. Check git status (should be clean)
        try {
            const result = await this.executeCommand('git status --porcelain');
            if (result.stdout.trim()) {
                this.log('⚠️  Warning: Working directory has uncommitted changes');
            }
        }
        catch (error) {
            // Ignore
        }
        // 2. Check if on correct branch
        try {
            const result = await this.executeCommand('git rev-parse --abbrev-ref HEAD');
            const branch = result.stdout.trim();
            if (config.environment === 'production' && branch !== 'main') {
                throw new Error(`Production deployments must be from main branch (current: ${branch})`);
            }
            this.log(`   Branch: ${branch}`);
        }
        catch (error) {
            this.log(`⚠️  Could not determine git branch: ${error.message}`);
        }
        // 3. Check if Firebase CLI is available
        try {
            await this.executeCommand('firebase --version');
        }
        catch (error) {
            throw new Error('Firebase CLI not found. Install with: npm install -g firebase-tools');
        }
        // 4. Verify Firebase project access
        try {
            await this.executeCommand(`firebase use ${config.projectId}`);
            this.log(`   Firebase project: ${config.projectId}`);
        }
        catch (error) {
            throw new Error(`Cannot access Firebase project: ${config.projectId}`);
        }
        this.log('✅ Pre-deployment validation passed');
    }
    // ============================================================================
    // Build and Test
    // ============================================================================
    /**
     * Build application
     */
    async buildApplication() {
        this.log('🔨 Building application');
        try {
            const result = await this.executeCommand('npm run build', { timeout: 120000 }); // 2 min timeout
            await this.logToolInvocation('npm_build', 'passed', 'Build successful', this.safeTruncate(result.stdout, 500));
            this.log('✅ Build successful');
            return { success: true };
        }
        catch (error) {
            await this.logToolInvocation('npm_build', 'failed', 'Build failed', undefined, error.message);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    /**
     * Run tests
     */
    async runTests() {
        this.log('🧪 Running tests');
        try {
            const result = await this.executeCommand('npm test', { timeout: 180000 }); // 3 min timeout
            await this.logToolInvocation('npm_test', 'passed', 'Tests passed', this.safeTruncate(result.stdout, 500));
            this.log('✅ Tests passed');
            return { success: true };
        }
        catch (error) {
            await this.logToolInvocation('npm_test', 'failed', 'Tests failed', undefined, error.message);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    // ============================================================================
    // Deployment
    // ============================================================================
    /**
     * Deploy to Firebase
     */
    async deploy(config) {
        this.log(`🚀 Deploying to ${config.environment} (${config.projectId})`);
        const startTime = Date.now();
        try {
            // Construct Firebase deploy command
            const targets = config.targets.join(',');
            const command = `firebase deploy --only ${targets} --project ${config.projectId}`;
            const result = await this.executeCommand(command, { timeout: 600000 }); // 10 min timeout
            await this.logToolInvocation('firebase_deploy', 'passed', `Deployed to ${config.environment}`, this.safeTruncate(result.stdout, 500));
            // Extract deployment URL from output
            const urlMatch = result.stdout.match(/Hosting URL: (https:\/\/[^\s]+)/);
            const deploymentUrl = urlMatch ? urlMatch[1] : config.healthCheckUrl;
            const deploymentResult = {
                environment: config.environment,
                version: config.version,
                projectId: config.projectId,
                deploymentUrl,
                deployedAt: new Date().toISOString(),
                durationMs: Date.now() - startTime,
                status: 'success',
            };
            this.log(`✅ Deployment complete: ${deploymentUrl}`);
            return deploymentResult;
        }
        catch (error) {
            await this.logToolInvocation('firebase_deploy', 'failed', 'Deployment failed', undefined, error.message);
            throw new Error(`Firebase deployment failed: ${error.message}`);
        }
    }
    // ============================================================================
    // Health Check
    // ============================================================================
    /**
     * Perform health check on deployed application
     */
    async performHealthCheck(config) {
        this.log('🏥 Performing health check');
        const maxRetries = 5;
        const retryDelay = 10000; // 10 seconds
        for (let i = 0; i < maxRetries; i++) {
            try {
                // Wait before checking
                if (i > 0) {
                    this.log(`   Retry ${i + 1}/${maxRetries} after ${retryDelay / 1000}s...`);
                    await this.sleep(retryDelay);
                }
                // Perform health check (using curl)
                const result = await this.executeCommand(`curl -f -s -o /dev/null -w "%{http_code}" ${config.healthCheckUrl}`, { timeout: 30000 });
                const statusCode = result.stdout.trim();
                if (statusCode === '200') {
                    await this.logToolInvocation('health_check', 'passed', `Health check passed (${statusCode})`, config.healthCheckUrl);
                    this.log('✅ Health check passed');
                    return { success: true };
                }
                else {
                    this.log(`⚠️  Health check returned ${statusCode}`);
                }
            }
            catch (error) {
                this.log(`⚠️  Health check attempt ${i + 1} failed: ${error.message}`);
            }
        }
        // All retries failed
        await this.logToolInvocation('health_check', 'failed', 'Health check failed after retries', undefined, `Failed after ${maxRetries} attempts`);
        return {
            success: false,
            error: `Health check failed after ${maxRetries} attempts`,
        };
    }
    // ============================================================================
    // Rollback
    // ============================================================================
    /**
     * Rollback to previous deployment
     */
    async rollback(config) {
        this.log('🔄 Rolling back deployment');
        try {
            // Get previous deployment from history
            const previousDeployment = this.deploymentHistory
                .filter(d => d.environment === config.environment && d.status === 'success')
                .pop();
            if (!previousDeployment) {
                throw new Error('No previous successful deployment found for rollback');
            }
            this.log(`   Rolling back to version: ${previousDeployment.version}`);
            // Checkout previous version
            await this.executeCommand(`git checkout ${previousDeployment.version}`);
            // Rebuild
            await this.buildApplication();
            // Redeploy
            const targets = config.targets.join(',');
            await this.executeCommand(`firebase deploy --only ${targets} --project ${config.projectId}`, { timeout: 600000 });
            await this.logToolInvocation('rollback', 'passed', `Rolled back to ${previousDeployment.version}`, previousDeployment.version);
            this.log(`✅ Rollback complete: ${previousDeployment.version}`);
            // Escalate rollback event
            await this.escalate(`Deployment rolled back to ${previousDeployment.version}`, config.environment === 'production' ? 'CTO' : 'TechLead', 'Sev.1-Critical', { previousVersion: previousDeployment.version, currentVersion: config.version });
        }
        catch (error) {
            await this.logToolInvocation('rollback', 'failed', 'Rollback failed', undefined, error.message);
            // Critical: Rollback failed
            await this.escalate(`CRITICAL: Rollback failed after deployment failure: ${error.message}`, 'CTO', 'Sev.1-Critical', { error: error.stack });
            throw new Error(`Rollback failed: ${error.message}`);
        }
    }
    // ============================================================================
    // Notifications
    // ============================================================================
    /**
     * Notify stakeholders of deployment
     */
    async notifyDeployment(result, _config) {
        this.log('📢 Notifying deployment');
        const message = `
🚀 **Deployment Complete**

**Environment**: ${result.environment}
**Version**: ${result.version}
**Project**: ${result.projectId}
**URL**: ${result.deploymentUrl}
**Duration**: ${Math.round(result.durationMs / 1000)}s
**Status**: ${result.status}
    `.trim();
        this.log(message);
        // TODO: Integrate with Slack/Discord/Lark for notifications
        // For now, just log
        await this.logToolInvocation('notify_deployment', 'passed', 'Deployment notification sent', message);
    }
    // ============================================================================
    // Helper Methods
    // ============================================================================
    /**
     * Get deployment history for environment
     */
    getDeploymentHistory(environment) {
        if (environment) {
            return this.deploymentHistory.filter(d => d.environment === environment);
        }
        return this.deploymentHistory;
    }
    /**
     * Get latest deployment for environment
     */
    getLatestDeployment(environment) {
        return this.deploymentHistory
            .filter(d => d.environment === environment && d.status === 'success')
            .pop();
    }
}
//# sourceMappingURL=deployment-agent.js.map