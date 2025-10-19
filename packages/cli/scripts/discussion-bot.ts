#!/usr/bin/env tsx
/**
 * GitHub Discussions Bot
 *
 * Automated bot for managing GitHub Discussions as a message queue
 * Implements Phase C of Issue #5: Message Queue (Discussions)
 *
 * Features:
 * - Welcome messages for new discussions
 * - FAQ auto-responses
 * - Category suggestions
 * - Idea → Issue conversion
 * - Rich CLI output
 *
 * Categories:
 * - Q&A: Questions and answers
 * - Ideas: Feature proposals
 * - Show & Tell: Showcase achievements
 * - Announcements: Official announcements
 * - General: General discussions
 */

import Anthropic from '@anthropic-ai/sdk';
import { Octokit } from '@octokit/rest';
import chalk from 'chalk';
import ora from 'ora';

// ============================================================================
// Types
// ============================================================================

type DiscussionCategory = 'Q&A' | 'Ideas' | 'Show & Tell' | 'Announcements' | 'General';

interface Discussion {
  id: string;
  number: number;
  title: string;
  body: string;
  category: string;
  author: string;
  url: string;
  createdAt: string;
}

interface DiscussionAnalysis {
  category: DiscussionCategory;
  shouldConvertToIssue: boolean;
  isQuestion: boolean;
  suggestedFAQ?: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  reasoning: string;
}

interface BotConfig {
  enableWelcomeMessage: boolean;
  enableFAQ: boolean;
  enableCategorySuggestion: boolean;
  enableIdeaConversion: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const REPOSITORY = process.env.GITHUB_REPOSITORY || 'ShunsukeHayashi/Autonomous-Operations';
const [owner, repo] = REPOSITORY.split('/');

if (!GITHUB_TOKEN) {
  console.error(chalk.red('❌ GITHUB_TOKEN environment variable is required'));
  process.exit(1);
}

if (!ANTHROPIC_API_KEY) {
  console.error(chalk.red('❌ ANTHROPIC_API_KEY environment variable is required'));
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// FAQ Database
const FAQ_DATABASE = [
  {
    question: 'How do I set up the project?',
    answer: 'Run `npm install` to install dependencies, then `npm run setup:token` to configure your GitHub token.',
    keywords: ['setup', 'install', 'getting started', 'initialize'],
  },
  {
    question: 'How do I run the agents?',
    answer: 'Use `npm run agents:parallel:exec -- --issue <number>` to execute agents on a specific issue.',
    keywords: ['agent', 'run', 'execute', 'start'],
  },
  {
    question: 'What agents are available?',
    answer: 'Available agents: CoordinatorAgent, CodeGenAgent, ReviewAgent, IssueAgent, PRAgent, DeploymentAgent.',
    keywords: ['agent', 'list', 'available', 'types'],
  },
  {
    question: 'How do I create a new agent?',
    answer: 'Extend the BaseAgent class and implement the `execute()` method. See `docs/AGENTS.md` for details.',
    keywords: ['create', 'new agent', 'extend', 'implement'],
  },
  {
    question: 'Where are the logs?',
    answer: 'Agent logs are stored in `.agentic/logs/` directory. Use `npm run agents:status` to view recent activity.',
    keywords: ['logs', 'logging', 'history', 'activity'],
  },
];

// Default bot configuration
const DEFAULT_CONFIG: BotConfig = {
  enableWelcomeMessage: true,
  enableFAQ: true,
  enableCategorySuggestion: true,
  enableIdeaConversion: true,
};

// ============================================================================
// Discussion Bot
// ============================================================================

class DiscussionBot {
  private config: BotConfig;

  constructor(config: BotConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  /**
   * Process a new discussion
   */
  async processDiscussion(discussion: Discussion): Promise<void> {
    console.log(chalk.bold('\n📬 Processing Discussion\n'));
    console.log(chalk.cyan(`  Title: ${discussion.title}`));
    console.log(chalk.gray(`  Author: @${discussion.author}`));
    console.log(chalk.gray(`  Category: ${discussion.category}`));
    console.log(chalk.gray(`  URL: ${discussion.url}\n`));

    // Analyze discussion with AI
    const spinner = ora('Analyzing discussion with Claude AI...').start();
    const analysis = await this.analyzeDiscussion(discussion);
    spinner.succeed('Analysis complete');

    console.log(chalk.bold('\n🧠 AI Analysis:\n'));
    console.log(chalk.cyan(`  Suggested Category: ${analysis.category}`));
    console.log(chalk.cyan(`  Convert to Issue: ${analysis.shouldConvertToIssue ? 'Yes' : 'No'}`));
    console.log(chalk.cyan(`  Is Question: ${analysis.isQuestion ? 'Yes' : 'No'}`));
    console.log(chalk.cyan(`  Sentiment: ${analysis.sentiment}`));
    console.log(chalk.gray(`  Reasoning: ${analysis.reasoning}\n`));

    // Execute bot actions
    const actions: Promise<void>[] = [];

    if (this.config.enableWelcomeMessage) {
      actions.push(this.sendWelcomeMessage(discussion));
    }

    if (this.config.enableFAQ && analysis.isQuestion && analysis.suggestedFAQ) {
      actions.push(this.sendFAQResponse(discussion, analysis.suggestedFAQ));
    }

    if (this.config.enableCategorySuggestion && discussion.category !== analysis.category) {
      actions.push(this.suggestCategory(discussion, analysis.category));
    }

    if (this.config.enableIdeaConversion && analysis.shouldConvertToIssue && discussion.category === 'Ideas') {
      actions.push(this.convertToIssue(discussion));
    }

    await Promise.all(actions);

    console.log(chalk.green('\n✅ Discussion processing complete\n'));
  }

  /**
   * Analyze discussion with Claude AI
   */
  private async analyzeDiscussion(discussion: Discussion): Promise<DiscussionAnalysis> {
    const prompt = `You are a GitHub Discussions moderator. Analyze this discussion and provide insights.

**Title:** ${discussion.title}

**Body:**
${discussion.body}

**Current Category:** ${discussion.category}

Analyze and respond in JSON format:
{
  "category": "Q&A" | "Ideas" | "Show & Tell" | "Announcements" | "General",
  "shouldConvertToIssue": boolean,
  "isQuestion": boolean,
  "suggestedFAQ": "FAQ answer if applicable" | null,
  "sentiment": "positive" | "neutral" | "negative",
  "reasoning": "Brief explanation"
}

Guidelines:
- Q&A: Questions requiring answers
- Ideas: Feature proposals that might become Issues
- Show & Tell: Showcasing work or achievements
- Announcements: Official project updates
- General: General discussions

Set shouldConvertToIssue to true if:
- It's a concrete feature proposal with clear requirements
- It's actionable and can be implemented
- It fits the project scope

Set isQuestion to true if:
- The discussion is asking for help or information
- It contains question marks or help-seeking language

For suggestedFAQ, check if the question matches any of these FAQ topics:
- Setup and installation
- Running agents
- Available agents
- Creating new agents
- Logs and debugging`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Extract JSON from response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from Claude response');
    }

    const analysis: DiscussionAnalysis = JSON.parse(jsonMatch[0]);
    return analysis;
  }

  /**
   * Send welcome message to new discussion
   */
  private async sendWelcomeMessage(discussion: Discussion): Promise<void> {
    const welcomeMessage = `## 👋 Welcome to Autonomous Operations Discussions!

Thank you for starting a discussion, @${discussion.author}!

### 📚 Quick Tips

- **Q&A**: Ask questions and get help from the community
- **Ideas**: Propose new features (might be converted to Issues)
- **Show & Tell**: Share your achievements and use cases
- **Announcements**: Stay updated with project news
- **General**: Discuss anything related to the project

### 🤖 AI Assistant

I'm an AI bot that can help you:
- Answer common questions (FAQ)
- Suggest appropriate categories
- Convert feature ideas into GitHub Issues
- Provide relevant documentation links

### 🔗 Useful Links

- [Documentation](https://github.com/${owner}/${repo}/tree/main/docs)
- [Contributing Guide](https://github.com/${owner}/${repo}/blob/main/CONTRIBUTING.md)
- [Issue Tracker](https://github.com/${owner}/${repo}/issues)

---
🤖 Automated by Discussion Bot (Issue #5 Phase C)`;

    await this.createComment(discussion.number, welcomeMessage);
    console.log(chalk.green('  ✓ Sent welcome message'));
  }

  /**
   * Send FAQ response
   */
  private async sendFAQResponse(discussion: Discussion, faqAnswer: string): Promise<void> {
    const faqMessage = `## 💡 FAQ Answer

${faqAnswer}

### 📖 More Resources

If this doesn't answer your question, please provide more details and the community will help!

You can also check:
- [Documentation](https://github.com/${owner}/${repo}/tree/main/docs)
- [Existing Issues](https://github.com/${owner}/${repo}/issues)
- [Other Discussions](https://github.com/${owner}/${repo}/discussions)

---
🤖 Automated FAQ response by Discussion Bot`;

    await this.createComment(discussion.number, faqMessage);
    console.log(chalk.green('  ✓ Sent FAQ response'));
  }

  /**
   * Suggest category change
   */
  private async suggestCategory(discussion: Discussion, suggestedCategory: DiscussionCategory): Promise<void> {
    const categoryMessage = `## 🏷️ Category Suggestion

Based on the content of your discussion, I suggest moving this to the **${suggestedCategory}** category.

### Why ${suggestedCategory}?

This category is better suited for this type of discussion and will help you reach the right audience.

### How to Change Category

1. Click "Edit" on your discussion
2. Select "${suggestedCategory}" from the category dropdown
3. Save changes

---
🤖 Automated suggestion by Discussion Bot`;

    await this.createComment(discussion.number, categoryMessage);
    console.log(chalk.green(`  ✓ Suggested category: ${suggestedCategory}`));
  }

  /**
   * Convert Idea discussion to GitHub Issue
   */
  private async convertToIssue(discussion: Discussion): Promise<void> {
    const issueBody = `## Original Discussion

**Discussion:** #${discussion.number} - ${discussion.title}
**Author:** @${discussion.author}
**URL:** ${discussion.url}

---

${discussion.body}

---

## Implementation Notes

This Issue was automatically created from a Discussion in the Ideas category.

### Next Steps

1. Review and refine the requirements
2. Add appropriate labels
3. Assign to relevant agent
4. Break down into subtasks if needed

### Links

- Original Discussion: ${discussion.url}

---
🤖 Automated conversion by Discussion Bot (Issue #5 Phase C)`;

    // Create GitHub Issue
    const { data: issue } = await octokit.issues.create({
      owner,
      repo,
      title: `[Idea] ${discussion.title}`,
      body: issueBody,
      labels: ['✨ type:feature', '🎯 phase:planning', '📊 priority:P3-Low', '💻 agent:codegen'],
    });

    console.log(chalk.green(`  ✓ Created Issue #${issue.number}`));

    // Add comment to original discussion
    const discussionComment = `## ✅ Converted to Issue

This idea has been converted to Issue #${issue.number} for tracking and implementation.

**Issue URL:** ${issue.html_url}

The development team will review this and prioritize accordingly. You can track progress on the Issue.

Thank you for your contribution! 🎉

---
🤖 Automated by Discussion Bot`;

    await this.createComment(discussion.number, discussionComment);
    console.log(chalk.green('  ✓ Added conversion comment to discussion'));
  }

  /**
   * Create comment on discussion
   */
  private async createComment(discussionNumber: number, body: string): Promise<void> {
    // Note: GitHub Discussions API requires GraphQL
    // For now, we'll use a placeholder implementation
    // In production, implement with GraphQL API

    console.log(chalk.yellow('  ⚠️  Comment creation requires GraphQL API (not implemented in this demo)'));
    console.log(chalk.gray(`     Discussion #${discussionNumber}`));
    console.log(chalk.gray(`     Body preview: ${body.substring(0, 50)}...`));
  }

  /**
   * Search FAQ database for matching answer
   */
  searchFAQ(query: string): string | null {
    const lowerQuery = query.toLowerCase();

    for (const faq of FAQ_DATABASE) {
      for (const keyword of faq.keywords) {
        if (lowerQuery.includes(keyword.toLowerCase())) {
          return `**Q: ${faq.question}**\n\nA: ${faq.answer}`;
        }
      }
    }

    return null;
  }
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  console.log(chalk.bold.cyan('\n🤖 Discussion Bot\n'));

  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.error(chalk.red('Usage: discussion-bot.ts <command> [options]'));
    console.error('');
    console.error('Commands:');
    console.error('  process <discussion-number>  Process a discussion');
    console.error('  faq <query>                  Search FAQ database');
    console.error('  test                         Run test scenario');
    console.error('');
    console.error('Examples:');
    console.error('  discussion-bot.ts process 1');
    console.error('  discussion-bot.ts faq "how to setup"');
    console.error('  discussion-bot.ts test');
    process.exit(1);
  }

  const bot = new DiscussionBot();

  switch (command) {
    case 'process': {
      const discussionNumber = parseInt(args[1], 10);
      if (isNaN(discussionNumber)) {
        console.error(chalk.red('❌ Invalid discussion number'));
        process.exit(1);
      }

      // In production, fetch real discussion from GitHub GraphQL API
      // For demo, use mock data
      const mockDiscussion: Discussion = {
        id: 'D_kwDOExample',
        number: discussionNumber,
        title: 'How do I implement a custom agent?',
        body: 'I want to create a custom agent for my workflow. What is the best way to extend BaseAgent?',
        category: 'General',
        author: 'developer123',
        url: `https://github.com/${owner}/${repo}/discussions/${discussionNumber}`,
        createdAt: new Date().toISOString(),
      };

      await bot.processDiscussion(mockDiscussion);
      break;
    }

    case 'faq': {
      const query = args.slice(1).join(' ');
      if (!query) {
        console.error(chalk.red('❌ Please provide a search query'));
        process.exit(1);
      }

      const answer = bot.searchFAQ(query);
      if (answer) {
        console.log(chalk.green('\n💡 FAQ Match Found:\n'));
        console.log(answer);
      } else {
        console.log(chalk.yellow('\n⚠️  No matching FAQ found'));
        console.log(chalk.gray('Try rephrasing your query or browse all FAQs'));
      }
      break;
    }

    case 'test': {
      console.log(chalk.cyan('Running test scenario...\n'));

      const testDiscussion: Discussion = {
        id: 'D_kwDOTest',
        number: 999,
        title: 'Add support for custom webhook handlers',
        body: 'It would be great to have a way to register custom webhook handlers for specific events. This would allow extending the system without modifying core code.',
        category: 'Ideas',
        author: 'contributor',
        url: `https://github.com/${owner}/${repo}/discussions/999`,
        createdAt: new Date().toISOString(),
      };

      await bot.processDiscussion(testDiscussion);
      break;
    }

    default:
      console.error(chalk.red(`❌ Unknown command: ${command}`));
      process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(chalk.red('\n❌ Fatal error:'), error.message);
    process.exit(1);
  });
}

export { DiscussionBot, FAQ_DATABASE };
export type { Discussion, DiscussionAnalysis, BotConfig };
