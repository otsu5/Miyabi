#!/usr/bin/env tsx
/**
 * Real-time Metrics Generator for Phase G
 *
 * Integrates Projects V2 data with live KPI dashboard
 * Generates JSON data for GitHub Pages dashboard
 */

import { getProjectItems } from './projects-graphql';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Types
// ============================================================================

interface AgentMetrics {
  name: string;
  totalIssues: number;
  completedIssues: number;
  avgDuration: number;
  avgCost: number;
  successRate: number;
  activeIssues: number;
}

interface StateMetrics {
  state: string;
  count: number;
  percentage: number;
  avgTimeInState: number;
}

interface PriorityMetrics {
  priority: string;
  count: number;
  completed: number;
  completionRate: number;
}

interface DashboardData {
  timestamp: string;
  summary: {
    totalIssues: number;
    completedIssues: number;
    inProgressIssues: number;
    completionRate: number;
    avgDuration: number;
    totalCost: number;
    avgQualityScore: number;
  };
  agents: AgentMetrics[];
  states: StateMetrics[];
  priorities: PriorityMetrics[];
  recentActivity: Array<{
    number: number;
    title: string;
    state: string;
    agent: string;
    duration: number | null;
    timestamp: string;
  }>;
  trends: {
    dailyCompletions: Array<{ date: string; count: number }>;
    weeklyVelocity: number;
    burndownRate: number;
  };
}

// ============================================================================
// Configuration
// ============================================================================

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'ShunsukeHayashi';
const PROJECT_NUMBER = parseInt(process.env.PROJECT_NUMBER || '1');

// ============================================================================
// Metrics Calculation
// ============================================================================

async function generateMetrics(): Promise<DashboardData> {
  console.log('📊 Fetching project data...');

  const items = await getProjectItems(GITHUB_OWNER, PROJECT_NUMBER, GITHUB_TOKEN!);

  console.log(`✅ Fetched ${items.length} items`);

  // Summary metrics
  const completedItems = items.filter(
    (item) => item.content.state === 'CLOSED' || item.content.state === 'MERGED'
  );
  const inProgressItems = items.filter((item) => item.content.state === 'OPEN');

  // Agent metrics
  const agentMap = new Map<string, any[]>();
  items.forEach((item) => {
    const agentField = item.fieldValues.nodes.find((fv) => fv.field?.name === 'Agent');
    const agent = (agentField as any)?.name || 'Unassigned';

    if (!agentMap.has(agent)) {
      agentMap.set(agent, []);
    }
    agentMap.get(agent)!.push(item);
  });

  const agents: AgentMetrics[] = Array.from(agentMap.entries()).map(([name, agentItems]) => {
    const completed = agentItems.filter(
      (item) => item.content.state === 'CLOSED' || item.content.state === 'MERGED'
    );
    const durations = agentItems
      .map((item) => {
        const durationField = item.fieldValues.nodes.find((fv: any) => fv.field?.name === 'Duration');
        return (durationField as any)?.number || null;
      })
      .filter((d) => d !== null);

    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return {
      name,
      totalIssues: agentItems.length,
      completedIssues: completed.length,
      avgDuration,
      avgCost: avgDuration * 0.015, // Estimate: $0.015/min
      successRate: agentItems.length > 0 ? (completed.length / agentItems.length) * 100 : 0,
      activeIssues: agentItems.length - completed.length,
    };
  });

  // State metrics
  const stateMap = new Map<string, any[]>();
  items.forEach((item) => {
    const stateField = item.fieldValues.nodes.find((fv) => fv.field?.name === 'State');
    const state = (stateField as any)?.name || item.content.state;

    if (!stateMap.has(state)) {
      stateMap.set(state, []);
    }
    stateMap.get(state)!.push(item);
  });

  const states: StateMetrics[] = Array.from(stateMap.entries()).map(([state, stateItems]) => ({
    state,
    count: stateItems.length,
    percentage: (stateItems.length / items.length) * 100,
    avgTimeInState: 0, // TODO: Calculate from state transition history
  }));

  // Priority metrics
  const priorityMap = new Map<string, any[]>();
  items.forEach((item) => {
    const priorityField = item.fieldValues.nodes.find((fv) => fv.field?.name === 'Priority');
    const priority = (priorityField as any)?.name || 'P2-Medium';

    if (!priorityMap.has(priority)) {
      priorityMap.set(priority, []);
    }
    priorityMap.get(priority)!.push(item);
  });

  const priorities: PriorityMetrics[] = Array.from(priorityMap.entries()).map(
    ([priority, priorityItems]) => {
      const completed = priorityItems.filter(
        (item) => item.content.state === 'CLOSED' || item.content.state === 'MERGED'
      );
      return {
        priority,
        count: priorityItems.length,
        completed: completed.length,
        completionRate: priorityItems.length > 0
          ? (completed.length / priorityItems.length) * 100
          : 0,
      };
    }
  );

  // Recent activity (last 10 completed items)
  const recentActivity = completedItems
    .slice(-10)
    .reverse()
    .map((item) => {
      const agentField = item.fieldValues.nodes.find((fv) => fv.field?.name === 'Agent');
      const stateField = item.fieldValues.nodes.find((fv) => fv.field?.name === 'State');
      const durationField = item.fieldValues.nodes.find((fv) => fv.field?.name === 'Duration');

      return {
        number: item.content.number,
        title: item.content.title,
        state: (stateField as any)?.name || item.content.state,
        agent: (agentField as any)?.name || 'Unknown',
        duration: (durationField as any)?.number || null,
        timestamp: new Date().toISOString(), // TODO: Get actual completion time
      };
    });

  // Trends (simplified for now)
  const trends = {
    dailyCompletions: [
      { date: new Date().toISOString().split('T')[0], count: completedItems.length },
    ],
    weeklyVelocity: completedItems.length / 7, // Rough estimate
    burndownRate: completedItems.length / items.length,
  };

  // Calculate average duration and cost
  const allDurations = items
    .map((item) => {
      const durationField = item.fieldValues.nodes.find((fv) => fv.field?.name === 'Duration');
      return (durationField as any)?.number || null;
    })
    .filter((d) => d !== null);

  const avgDuration = allDurations.length > 0
    ? allDurations.reduce((a, b) => a + b, 0) / allDurations.length
    : 0;

  const totalCost = avgDuration * items.length * 0.015;

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalIssues: items.length,
      completedIssues: completedItems.length,
      inProgressIssues: inProgressItems.length,
      completionRate: items.length > 0 ? (completedItems.length / items.length) * 100 : 0,
      avgDuration,
      totalCost,
      avgQualityScore: 92.5, // TODO: Calculate from actual quality scores
    },
    agents: agents.sort((a, b) => b.totalIssues - a.totalIssues),
    states: states.sort((a, b) => b.count - a.count),
    priorities: priorities.sort((a, b) => {
      const order = { 'P0-Critical': 0, 'P1-High': 1, 'P2-Medium': 2, 'P3-Low': 3 };
      return (order[a.priority as keyof typeof order] || 4) - (order[b.priority as keyof typeof order] || 4);
    }),
    recentActivity,
    trends,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  if (!GITHUB_TOKEN) {
    console.error('❌ GITHUB_TOKEN is required');
    process.exit(1);
  }

  const outputPath = path.join(__dirname, '../docs/metrics.json');

  console.log('🚀 Generating real-time metrics...\n');

  const data = await generateMetrics();

  // Write to file
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

  console.log(`\n✅ Metrics generated: ${outputPath}`);
  console.log('\n📊 Summary:');
  console.log(`   Total Issues: ${data.summary.totalIssues}`);
  console.log(`   Completed: ${data.summary.completedIssues} (${data.summary.completionRate.toFixed(1)}%)`);
  console.log(`   In Progress: ${data.summary.inProgressIssues}`);
  console.log(`   Avg Duration: ${data.summary.avgDuration.toFixed(1)} min`);
  console.log(`   Total Cost: $${data.summary.totalCost.toFixed(2)}`);
  console.log(`\n🤖 Top Agents:`);
  data.agents.slice(0, 3).forEach((agent) => {
    console.log(`   ${agent.name}: ${agent.completedIssues}/${agent.totalIssues} (${agent.successRate.toFixed(1)}%)`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
}

export { generateMetrics };
export type { DashboardData };
