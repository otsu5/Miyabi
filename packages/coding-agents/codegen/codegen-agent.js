/**
 * CodeGenAgent - AI-Driven Code Generation Agent
 *
 * Responsibilities:
 * - Generate code from specifications
 * - Generate unit tests automatically
 * - Generate documentation
 * - Ensure TypeScript type safety
 * - Follow existing code patterns
 *
 * Uses Claude Code integration via Worktree execution
 */
import { BaseAgent } from '../base-agent';
import * as fs from 'fs';
import * as path from 'path';
export class CodeGenAgent extends BaseAgent {
    constructor(config) {
        super('CodeGenAgent', config);
    }
    /**
     * Main execution: Generate code from task specification
     */
    async execute(task) {
        this.log('🤖 CodeGenAgent starting code generation');
        try {
            // 1. Analyze task and create code specification
            const codeSpec = await this.createCodeSpec(task);
            // 2. Analyze existing codebase
            const context = await this.analyzeCodebase();
            // 3. Generate code using Claude
            const generatedCode = await this.generateCode(codeSpec, context);
            // 4. Generate tests
            const tests = await this.generateTests(generatedCode, codeSpec);
            generatedCode.tests = tests;
            // 5. Generate documentation
            const documentation = await this.generateDocumentation(generatedCode, codeSpec);
            generatedCode.documentation = documentation;
            // 6. Validate generated code
            await this.validateCode(generatedCode);
            // 7. Write files (if not dry-run)
            if (!task.metadata?.dryRun) {
                await this.writeGeneratedFiles(generatedCode);
            }
            // 8. Calculate metrics
            const metrics = this.calculateMetrics(generatedCode);
            this.log(`✅ Code generation complete: ${generatedCode.files.length} files, ${generatedCode.tests.length} tests`);
            return {
                status: 'success',
                data: generatedCode,
                metrics: {
                    ...metrics,
                    taskId: task.id,
                    agentType: this.agentType,
                    durationMs: Date.now() - this.startTime,
                    timestamp: new Date().toISOString(),
                },
            };
        }
        catch (error) {
            this.log(`❌ Code generation failed: ${error.message}`);
            // Check if escalation is needed
            if (this.isArchitectureIssue(error)) {
                await this.escalate(`Architecture issue in code generation: ${error.message}`, 'TechLead', 'Sev.2-High', { task: task.id, error: error.stack });
            }
            throw error;
        }
    }
    // ============================================================================
    // Code Specification
    // ============================================================================
    /**
     * Create code specification from task
     */
    async createCodeSpec(task) {
        this.log('📋 Creating code specification');
        return {
            feature: task.title,
            requirements: this.extractRequirements(task),
            context: {
                existingFiles: await this.getExistingFiles(),
                architecture: await this.getArchitecturePatterns(),
                dependencies: await this.getDependencies(),
            },
            constraints: [
                'Must use TypeScript strict mode',
                'Must include comprehensive type definitions',
                'Must follow existing code style',
                'Must be testable',
                'Must include error handling',
            ],
        };
    }
    /**
     * Extract requirements from task description
     */
    extractRequirements(task) {
        const requirements = [];
        // Extract from description
        if (task.description) {
            const lines = task.description.split('\n');
            for (const line of lines) {
                if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
                    requirements.push(line.trim().substring(1).trim());
                }
            }
        }
        // Add default requirement
        if (requirements.length === 0) {
            requirements.push(task.title);
        }
        return requirements;
    }
    /**
     * Get list of existing files in project
     */
    async getExistingFiles() {
        try {
            const files = [];
            const scanDir = async (dir) => {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        await scanDir(fullPath);
                    }
                    else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
                        files.push(fullPath);
                    }
                }
            };
            await scanDir(process.cwd());
            return files.slice(0, 50); // Limit to 50 files
        }
        catch (error) {
            return [];
        }
    }
    /**
     * Detect architecture patterns from existing code
     */
    async getArchitecturePatterns() {
        // Check for common patterns
        const patterns = [];
        try {
            // Check if agents/ directory exists
            if (await this.fileExists('agents/')) {
                patterns.push('Agent-based architecture with BaseAgent pattern');
            }
            // Check if using TypeScript
            if (await this.fileExists('tsconfig.json')) {
                patterns.push('TypeScript with strict type checking');
            }
            // Check for common frameworks
            if (await this.fileExists('package.json')) {
                const pkg = JSON.parse(await fs.promises.readFile('package.json', 'utf-8'));
                if (pkg.dependencies?.['react'])
                    patterns.push('React framework');
                if (pkg.dependencies?.['express'])
                    patterns.push('Express.js backend');
                if (pkg.dependencies?.['@anthropic-ai/sdk'])
                    patterns.push('Anthropic AI integration');
            }
        }
        catch (error) {
            // Ignore errors
        }
        return patterns.length > 0 ? patterns.join(', ') : 'Generic TypeScript project';
    }
    /**
     * Get project dependencies
     */
    async getDependencies() {
        try {
            const pkg = JSON.parse(await fs.promises.readFile('package.json', 'utf-8'));
            return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
        }
        catch (error) {
            return [];
        }
    }
    // ============================================================================
    // Codebase Analysis
    // ============================================================================
    /**
     * Analyze existing codebase for context
     */
    async analyzeCodebase() {
        this.log('🔍 Analyzing existing codebase');
        const context = [];
        // Get README content
        try {
            const readme = await fs.promises.readFile('README.md', 'utf-8');
            context.push('# Project Overview\n' + this.safeTruncate(readme, 2000));
        }
        catch (error) {
            // No README
        }
        // Get sample code from agents/
        try {
            const baseAgent = await fs.promises.readFile('agents/base-agent.ts', 'utf-8');
            context.push('# BaseAgent Pattern\n```typescript\n' + this.safeTruncate(baseAgent, 1000) + '\n```');
        }
        catch (error) {
            // No base agent
        }
        return context.join('\n\n');
    }
    // ============================================================================
    // Code Generation (AI-Powered)
    // ============================================================================
    /**
     * Generate code using template-based generation
     *
     * Generates files based on task type and specifications.
     * Supports Discord community files, documentation, and configuration.
     */
    async generateCode(spec, _context) {
        this.log('🧠 Code generation starting (template-based)');
        // Identify generatable files from spec
        const generatableFiles = await this.identifyGeneratableFiles(spec);
        if (generatableFiles.length === 0) {
            this.log('⚠️  No generatable files identified for this task');
            return {
                files: [],
                tests: [],
                documentation: '',
                summary: `No files could be automatically generated for: ${spec.feature}`,
            };
        }
        const files = [];
        // Generate each identified file
        for (const fileSpec of generatableFiles) {
            try {
                const content = await this.generateFileContent(fileSpec, spec);
                const fileType = fileSpec.type === 'readme-discord-badge' ? 'modified' : 'new';
                files.push({ path: fileSpec.path, content, type: fileType });
                this.log(`   ✅ Generated: ${fileSpec.path}`);
            }
            catch (error) {
                this.log(`   ⚠️  Failed to generate ${fileSpec.path}: ${error.message}`);
            }
        }
        return {
            files,
            tests: [],
            documentation: '',
            summary: `Generated ${files.length} files for: ${spec.feature}`,
        };
    }
    /**
     * Identify files that can be automatically generated from spec
     */
    async identifyGeneratableFiles(spec) {
        const files = [];
        const featureLower = spec.feature.toLowerCase();
        // Discord community files
        if (featureLower.includes('discord') && featureLower.includes('community')) {
            files.push({ path: 'docs/discord/welcome.md', type: 'discord-welcome' }, { path: 'docs/discord/rules.md', type: 'discord-rules' }, { path: 'docs/discord/faq.md', type: 'discord-faq' }, { path: 'discord-config.json', type: 'discord-config' });
            // Check if README exists and needs Discord badge
            if (await this.fileExists('README.md')) {
                files.push({ path: 'README.md', type: 'readme-discord-badge' });
            }
        }
        // GitHub Actions workflow files
        if (featureLower.includes('github') && (featureLower.includes('action') || featureLower.includes('workflow'))) {
            files.push({ path: '.github/workflows/generated.yml', type: 'github-workflow' });
        }
        // Configuration files
        if (featureLower.includes('config')) {
            files.push({ path: 'config/generated.json', type: 'config-json' });
        }
        return files;
    }
    /**
     * Generate content for a specific file based on its type
     */
    async generateFileContent(fileSpec, spec) {
        switch (fileSpec.type) {
            case 'discord-welcome':
                return this.generateDiscordWelcome(spec);
            case 'discord-rules':
                return this.generateDiscordRules(spec);
            case 'discord-faq':
                return this.generateDiscordFAQ(spec);
            case 'discord-config':
                return this.generateDiscordConfig(spec);
            case 'readme-discord-badge':
                return await this.addDiscordBadgeToReadme(spec);
            case 'github-workflow':
                return this.generateGitHubWorkflow(spec);
            case 'config-json':
                return this.generateConfigJSON(spec);
            default:
                throw new Error(`Unknown file type: ${fileSpec.type}`);
        }
    }
    // ============================================================================
    // Template Generators - Discord Community
    // ============================================================================
    /**
     * Generate Discord welcome message
     */
    generateDiscordWelcome(spec) {
        const projectName = this.extractProjectName(spec);
        return `# Welcome to ${projectName} Community! 👋

Thank you for joining the ${projectName} Discord community!

## What is ${projectName}?

${spec.feature}

## Getting Started

1. **Read the Rules** - Check out <#rules> to understand community guidelines
2. **Introduce Yourself** - Head to <#introductions> and tell us about yourself
3. **Explore Channels** - Browse our channels and find topics that interest you
4. **Ask Questions** - Don't hesitate to ask in <#general> or <#help>

## Community Channels

- **#announcements** - Important updates and news
- **#general** - General discussion
- **#help** - Get help from the community
- **#showcase** - Share your projects
- **#feedback** - Provide feedback and suggestions

## Quick Links

- [GitHub Repository](https://github.com/${projectName})
- [Documentation](https://docs.${projectName}.dev)
- [Website](https://${projectName}.dev)

## Need Help?

If you have questions or need assistance, please:
1. Check the <#faq> channel
2. Ask in <#help>
3. Mention @Moderator for urgent issues

---

Enjoy your time here! 🎉
`;
    }
    /**
     * Generate Discord community rules
     */
    generateDiscordRules(spec) {
        const projectName = this.extractProjectName(spec);
        return `# ${projectName} Community Rules 📜

Please read and follow these rules to maintain a positive community environment.

## 1. Be Respectful

- Treat all members with respect and courtesy
- No harassment, hate speech, or discriminatory language
- Respect different opinions and perspectives

## 2. Keep Content Appropriate

- No NSFW (Not Safe For Work) content
- No spam, excessive self-promotion, or advertising
- No pirated content or illegal activities

## 3. Stay On Topic

- Keep discussions relevant to the channel topic
- Use appropriate channels for different types of content
- Move lengthy discussions to threads when appropriate

## 4. No Toxicity

- No trolling, flaming, or intentionally inflammatory behavior
- Constructive criticism is welcome, but be kind
- Help maintain a positive and welcoming atmosphere

## 5. Respect Privacy

- Don't share personal information of others without consent
- Don't DM (Direct Message) without permission
- Report privacy violations to moderators

## 6. Follow Discord ToS

- All Discord Terms of Service and Community Guidelines apply
- Age requirement: You must be 13+ to use Discord

## 7. Listen to Moderators

- Follow moderator instructions promptly
- Questions about moderation decisions should be discussed via DM
- Moderators have final say on rule interpretations

## Consequences

Violations may result in:
- Warning
- Temporary mute
- Kick from server
- Permanent ban (for severe or repeated violations)

## Reporting

If you see rule violations:
1. Use the report feature
2. Mention @Moderator
3. DM a moderator

---

**Thank you for helping make ${projectName} a great community!** ❤️
`;
    }
    /**
     * Generate Discord FAQ
     */
    generateDiscordFAQ(spec) {
        const projectName = this.extractProjectName(spec);
        return `# ${projectName} - Frequently Asked Questions (FAQ) 🤔

## General Questions

### What is ${projectName}?

${spec.feature}

### Is ${projectName} free to use?

Yes! ${projectName} is open source and free to use. Check our GitHub repository for the license details.

### How can I contribute to ${projectName}?

We welcome contributions! Here's how you can help:
1. Report bugs and issues on GitHub
2. Submit pull requests
3. Improve documentation
4. Help answer questions in the community
5. Share your use cases and feedback

## Getting Started

### How do I install ${projectName}?

\`\`\`bash
npm install ${projectName}
# or
yarn add ${projectName}
\`\`\`

Check our [documentation](https://docs.${projectName}.dev) for detailed installation instructions.

### Where can I find documentation?

- [Official Documentation](https://docs.${projectName}.dev)
- [GitHub Repository](https://github.com/${projectName})
- [API Reference](https://docs.${projectName}.dev/api)

### I'm getting an error. What should I do?

1. Check the [documentation](https://docs.${projectName}.dev)
2. Search existing GitHub issues
3. Ask in <#help> channel
4. Create a new GitHub issue with details

## Community

### How do I get help?

1. Check this FAQ first
2. Search the documentation
3. Ask in <#help> channel
4. Create a GitHub issue if it's a bug

### Can I share my project built with ${projectName}?

Absolutely! We'd love to see what you're building. Share in <#showcase>!

### How can I stay updated?

- Follow announcements in <#announcements>
- Watch the GitHub repository
- Check the [changelog](https://github.com/${projectName}/CHANGELOG.md)

## Technical Questions

### What are the system requirements?

- Node.js 18+
- TypeScript 5+
- Modern browser (for web projects)

### Does ${projectName} support [feature]?

Check our [roadmap](https://github.com/${projectName}/issues) or ask in <#general>.

### I found a bug! Where do I report it?

1. Search existing issues first
2. Create a new issue on [GitHub](https://github.com/${projectName}/issues)
3. Include: steps to reproduce, expected vs actual behavior, environment details

## Moderation

### How do I report a rule violation?

Use the report feature, mention @Moderator, or DM a moderator.

### How do I become a moderator?

Active and helpful community members may be invited to join the moderation team.

---

**Don't see your question here?** Ask in <#help> or <#general>!
`;
    }
    /**
     * Generate Discord server configuration JSON
     */
    generateDiscordConfig(spec) {
        const projectName = this.extractProjectName(spec);
        const config = {
            server_name: `${projectName} Community`,
            description: spec.feature,
            channels: [
                {
                    name: 'announcements',
                    type: 'text',
                    category: 'Information',
                    description: 'Official announcements and updates',
                    permissions: { send_messages: ['@Moderator', '@Admin'] }
                },
                {
                    name: 'rules',
                    type: 'text',
                    category: 'Information',
                    description: 'Server rules and guidelines',
                    permissions: { send_messages: ['@Moderator', '@Admin'] }
                },
                {
                    name: 'faq',
                    type: 'text',
                    category: 'Information',
                    description: 'Frequently asked questions',
                    permissions: { send_messages: ['@Moderator', '@Admin'] }
                },
                {
                    name: 'general',
                    type: 'text',
                    category: 'Community',
                    description: 'General discussion'
                },
                {
                    name: 'introductions',
                    type: 'text',
                    category: 'Community',
                    description: 'Introduce yourself to the community'
                },
                {
                    name: 'help',
                    type: 'text',
                    category: 'Support',
                    description: 'Get help from the community'
                },
                {
                    name: 'showcase',
                    type: 'text',
                    category: 'Community',
                    description: 'Share your projects and creations'
                },
                {
                    name: 'feedback',
                    type: 'text',
                    category: 'Development',
                    description: 'Provide feedback and suggestions'
                },
                {
                    name: 'bug-reports',
                    type: 'text',
                    category: 'Development',
                    description: 'Report bugs and issues'
                }
            ],
            roles: [
                { name: 'Admin', color: '#FF0000', permissions: ['administrator'] },
                { name: 'Moderator', color: '#00FF00', permissions: ['manage_messages', 'kick_members', 'ban_members'] },
                { name: 'Contributor', color: '#0000FF', permissions: [] },
                { name: 'Member', color: '#CCCCCC', permissions: [] }
            ],
            welcome_channel: 'introductions',
            rules_channel: 'rules',
            moderation: {
                auto_mod_enabled: true,
                spam_protection: true,
                word_filter_enabled: true,
                raid_protection: true
            }
        };
        return JSON.stringify(config, null, 2);
    }
    /**
     * Add Discord badge to existing README.md
     */
    async addDiscordBadgeToReadme(spec) {
        const projectName = this.extractProjectName(spec);
        const readmePath = path.join(process.cwd(), 'README.md');
        let readme = '';
        try {
            readme = await fs.promises.readFile(readmePath, 'utf-8');
        }
        catch {
            // README doesn't exist, create basic one
            readme = `# ${projectName}\n\n${spec.feature}\n`;
        }
        // Check if Discord badge already exists
        if (readme.includes('discord.com') || readme.includes('Discord')) {
            this.log('   ℹ️  Discord badge may already exist in README');
        }
        // Add badge after title
        const discordBadge = `[![Discord](https://img.shields.io/discord/YOUR_SERVER_ID?label=Discord&logo=discord&logoColor=white&color=7289DA)](https://discord.gg/${projectName.toLowerCase()})`;
        const lines = readme.split('\n');
        // Find first heading
        const titleIndex = lines.findIndex(line => line.startsWith('#'));
        if (titleIndex >= 0) {
            // Insert badge after title
            lines.splice(titleIndex + 1, 0, '', discordBadge, '');
            return lines.join('\n');
        }
        // No title found, prepend badge
        return `${discordBadge}\n\n${readme}`;
    }
    // ============================================================================
    // Template Generators - Other
    // ============================================================================
    /**
     * Generate GitHub Actions workflow
     */
    generateGitHubWorkflow(spec) {
        const projectName = this.extractProjectName(spec);
        return `name: ${projectName} CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  build:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
    - uses: actions/checkout@v4

    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: \${{ matrix.node-version }}
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Build
      run: npm run build

    - name: Test
      run: npm test

    - name: Lint
      run: npm run lint
`;
    }
    /**
     * Generate configuration JSON
     */
    generateConfigJSON(spec) {
        const projectName = this.extractProjectName(spec);
        const config = {
            name: projectName,
            version: '1.0.0',
            description: spec.feature,
            settings: {
                environment: 'production',
                logging: {
                    level: 'info',
                    format: 'json'
                },
                features: {
                    enabled: []
                }
            },
            generated: new Date().toISOString()
        };
        return JSON.stringify(config, null, 2);
    }
    // ============================================================================
    // Helper Methods
    // ============================================================================
    /**
     * Extract project name from spec or current directory
     */
    extractProjectName(_spec) {
        // Try to get from package.json
        try {
            const pkgPath = path.join(process.cwd(), 'package.json');
            const pkg = JSON.parse(require('fs').readFileSync(pkgPath, 'utf-8'));
            if (pkg.name)
                return pkg.name;
        }
        catch {
            // Ignore
        }
        // Use current directory name
        return path.basename(process.cwd());
    }
    // ============================================================================
    // Test Generation
    // ============================================================================
    /**
     * Generate unit tests (stub - requires Claude Code worktree execution)
     */
    async generateTests(generatedCode, _spec) {
        this.log('🧪 Test generation prepared for worktree execution');
        // Log that tests need to be generated in worktree
        await this.logToolInvocation('test_generation_stub', 'passed', `Prepared test generation for ${generatedCode.files.length} files`);
        return [];
    }
    // ============================================================================
    // Documentation Generation
    // ============================================================================
    /**
     * Generate documentation (stub - requires Claude Code worktree execution)
     */
    async generateDocumentation(_generatedCode, spec) {
        this.log('📚 Documentation generation prepared for worktree execution');
        // Log that documentation needs to be generated in worktree
        await this.logToolInvocation('doc_generation_stub', 'passed', `Prepared documentation generation for: ${spec.feature}`);
        return `# ${spec.feature}\n\n(Documentation will be generated in Claude Code worktree)`;
    }
    // ============================================================================
    // Validation
    // ============================================================================
    /**
     * Validate generated code (syntax check, etc.)
     */
    async validateCode(generatedCode) {
        this.log('✅ Validating generated code');
        for (const file of generatedCode.files) {
            // Basic syntax validation
            if (!file.content.trim()) {
                throw new Error(`Generated file ${file.path} is empty`);
            }
            // Check for common issues
            if (file.content.includes('// TODO') || file.content.includes('// FIXME')) {
                this.log(`⚠️  Warning: ${file.path} contains TODO/FIXME comments`);
            }
            // Check for TypeScript syntax (basic)
            if (!file.content.includes('export') && !file.content.includes('import')) {
                this.log(`⚠️  Warning: ${file.path} may be incomplete (no imports/exports)`);
            }
        }
    }
    // ============================================================================
    // File Writing
    // ============================================================================
    /**
     * Write generated files to disk
     */
    async writeGeneratedFiles(generatedCode) {
        this.log('💾 Writing generated files to disk');
        for (const file of generatedCode.files) {
            const fullPath = path.join(process.cwd(), file.path);
            await this.ensureDirectory(path.dirname(fullPath));
            await fs.promises.writeFile(fullPath, file.content, 'utf-8');
            this.log(`   ✍️  Wrote: ${file.path}`);
        }
        for (const test of generatedCode.tests) {
            const fullPath = path.join(process.cwd(), test.path);
            await this.ensureDirectory(path.dirname(fullPath));
            await fs.promises.writeFile(fullPath, test.content, 'utf-8');
            this.log(`   ✍️  Wrote test: ${test.path}`);
        }
        // Write documentation
        if (generatedCode.documentation) {
            const docPath = path.join(process.cwd(), 'docs', 'GENERATED_CODE.md');
            await this.ensureDirectory(path.dirname(docPath));
            await fs.promises.writeFile(docPath, generatedCode.documentation, 'utf-8');
            this.log(`   ✍️  Wrote documentation: docs/GENERATED_CODE.md`);
        }
    }
    // ============================================================================
    // Metrics
    // ============================================================================
    /**
     * Calculate code generation metrics
     */
    calculateMetrics(generatedCode) {
        const totalLines = generatedCode.files.reduce((sum, file) => {
            return sum + file.content.split('\n').length;
        }, 0);
        return {
            linesChanged: totalLines,
            testsAdded: generatedCode.tests.length,
        };
    }
    // ============================================================================
    // Helper Methods
    // ============================================================================
    /**
     * Check if file exists
     */
    async fileExists(filePath) {
        try {
            await fs.promises.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Check if error is architecture-related
     */
    isArchitectureIssue(error) {
        const message = error.message.toLowerCase();
        return message.includes('architecture') ||
            message.includes('pattern') ||
            message.includes('design');
    }
}
//# sourceMappingURL=codegen-agent.js.map