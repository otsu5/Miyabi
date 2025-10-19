/**
 * Agent Types and Interfaces
 *
 * Core type definitions for the Autonomous Operations Agent system
 */

// ============================================================================
// Base Types
// ============================================================================

export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'escalated';

export type EscalationTarget = 'TechLead' | 'PO' | 'CISO' | 'CTO' | 'DevOps';

export type AgentType =
  | 'CoordinatorAgent'
  | 'CodeGenAgent'
  | 'ReviewAgent'
  | 'IssueAgent'
  | 'PRAgent'
  | 'DeploymentAgent'
  | 'AutoFixAgent'
  | 'WaterSpiderAgent';

export type Severity =
  | 'Sev.1-Critical'
  | 'Sev.2-High'
  | 'Sev.3-Medium'
  | 'Sev.4-Low'
  | 'Sev.5-Trivial';

export type ImpactLevel = 'Critical' | 'High' | 'Medium' | 'Low';

// ============================================================================
// Task & Issue Types
// ============================================================================

export interface Task {
  id: string;
  title: string;
  description: string;
  // Extended task categories include security/optimization for specialized agents
  type: 'feature' | 'bug' | 'refactor' | 'docs' | 'test' | 'deployment' | 'security' | 'optimization';
  priority: number;
  severity?: Severity;
  impact?: ImpactLevel;
  assignedAgent?: AgentType;
  dependencies: string[]; // Task IDs
  estimatedDuration?: number; // minutes
  status?: AgentStatus;
  startTime?: number;
  endTime?: number;
  metadata?: Record<string, any>;
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface DAG {
  nodes: Task[];
  edges: Array<{ from: string; to: string }>;
  levels: string[][]; // Topologically sorted levels
}

// ============================================================================
// Task Grouping Types
// ============================================================================

export interface TaskGroup {
  groupId: string;
  tasks: Task[];
  agent: AgentType;
  priority: number;
  estimatedDurationMs: number;
  worktreePath: string;
  level: number; // DAG level for dependency ordering
}

export interface GroupingConfig {
  minGroupSize: number;  // Default: 3
  maxGroupSize: number;  // Default: 10
  maxConcurrentGroups: number;  // Default: 5
  priorityWeight: number;  // Default: 0.3
  durationWeight: number;  // Default: 0.4
  agentWeight: number;  // Default: 0.3
}

// ============================================================================
// Agent Result Types
// ============================================================================

export interface AgentResult {
  status: 'success' | 'failed' | 'escalated';
  data?: any;
  error?: string;
  metrics?: Partial<AgentMetrics>;
  escalation?: EscalationInfo;
}

export interface AgentMetrics {
  taskId: string;
  agentType: AgentType;
  durationMs: number;
  qualityScore?: number;
  linesChanged?: number;
  testsAdded?: number;
  coveragePercent?: number;
  errorsFound?: number;
  timestamp: string;
}

export interface EscalationInfo {
  reason: string;
  target: EscalationTarget;
  severity: Severity;
  context: Record<string, any>;
  timestamp: string;
}

// ============================================================================
// Quality Assessment Types
// ============================================================================

export interface QualityReport {
  score: number; // 0-100
  passed: boolean; // score >= 80
  issues: QualityIssue[];
  recommendations: string[];
  breakdown: {
    eslintScore: number;
    typeScriptScore: number;
    securityScore: number;
    testCoverageScore: number;
  };
}

export interface QualityIssue {
  type: 'eslint' | 'typescript' | 'security' | 'coverage';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  scoreImpact: number; // Points deducted
}

// ============================================================================
// Coordinator Types
// ============================================================================

export interface TaskDecomposition {
  originalIssue: Issue;
  tasks: Task[];
  dag: DAG;
  estimatedTotalDuration: number;
  hasCycles: boolean;
  recommendations: string[];
}

export interface ExecutionPlan {
  sessionId: string;
  deviceIdentifier: string;
  concurrency: number;
  tasks: Task[];
  dag: DAG;
  estimatedDuration: number;
  startTime: number;
}

export interface ExecutionReport {
  sessionId: string;
  deviceIdentifier: string;
  startTime: number;
  endTime: number;
  totalDurationMs: number;
  summary: {
    total: number;
    completed: number;
    failed: number;
    escalated: number;
    successRate: number;
  };
  tasks: TaskResult[];
  metrics: AgentMetrics[];
  escalations: EscalationInfo[];
}

export interface TaskResult {
  taskId: string;
  status: AgentStatus;
  agentType: AgentType;
  durationMs: number;
  result?: AgentResult;
  error?: string;
}

// ============================================================================
// Code Generation Types
// ============================================================================

export interface CodeSpec {
  feature: string;
  requirements: string[];
  context: {
    existingFiles: string[];
    architecture: string;
    dependencies: string[];
  };
  constraints: string[];
}

export interface GeneratedCode {
  files: Array<{
    path: string;
    content: string;
    type: 'new' | 'modified';
  }>;
  tests: Array<{
    path: string;
    content: string;
  }>;
  documentation: string;
  summary: string;
}

// ============================================================================
// Review Types
// ============================================================================

export interface ReviewRequest {
  files: string[];
  branch: string;
  context: string;
}

export interface ReviewResult {
  qualityReport: QualityReport;
  approved: boolean;
  escalationRequired: boolean;
  escalationTarget?: EscalationTarget;
  comments: ReviewComment[];
}

export interface ReviewComment {
  file: string;
  line: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  suggestion?: string;
}

// ============================================================================
// PR Types
// ============================================================================

export interface PRRequest {
  title: string;
  body: string;
  baseBranch: string;
  headBranch: string;
  draft: boolean;
  issueNumber?: number;
  labels?: string[];
  reviewers?: string[];
}

export interface PRResult {
  number: number;
  url: string;
  state: 'draft' | 'open' | 'merged' | 'closed';
  createdAt: string;
}

// ============================================================================
// Deployment Types
// ============================================================================

export interface DeploymentConfig {
  environment: 'staging' | 'production';
  version: string;
  projectId: string;
  targets: string[]; // Firebase targets: ['hosting', 'functions']
  skipTests?: boolean;
  autoRollback: boolean;
  healthCheckUrl: string;
}

export interface DeploymentResult {
  environment: 'staging' | 'production';
  version: string;
  projectId: string;
  deploymentUrl: string;
  deployedAt: string;
  durationMs: number;
  status: 'success' | 'failed' | 'rolled_back';
}

// ============================================================================
// Log-Driven Development (LDD) Types
// ============================================================================

export interface CodexPromptChain {
  intent: string;
  plan: string[];
  implementation: string[];
  verification: string[];
}

export interface ToolInvocation {
  command: string;
  workdir: string;
  timestamp: string;
  status: 'passed' | 'failed';
  notes: string;
  output?: string;
  error?: string;
}

export interface LDDLog {
  sessionId: string;
  date: string;
  deviceIdentifier: string;
  codexPromptChain: CodexPromptChain;
  toolInvocations: ToolInvocation[];
  memoryBankUpdates: string[];
  nextSteps: string;
}

// ============================================================================
// Parallel Execution Types
// ============================================================================

export interface WorkerPool {
  maxConcurrency: number;
  activeWorkers: number;
  queue: Task[];
  running: Map<string, Task>;
  completed: Map<string, TaskResult>;
  failed: Map<string, TaskResult>;
}

export interface ProgressStatus {
  total: number;
  completed: number;
  running: number;
  waiting: number;
  failed: number;
  percentage: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface AgentConfig {
  deviceIdentifier: string;
  githubToken: string;
  useTaskTool: boolean;
  useWorktree: boolean;
  worktreeBasePath?: string;
  logDirectory: string;
  reportDirectory: string;
  techLeadGithubUsername?: string;
  cisoGithubUsername?: string;
  poGithubUsername?: string;
  // Deployment config
  firebaseProductionProject?: string;
  firebaseStagingProject?: string;
  productionUrl?: string;
  stagingUrl?: string;
}

export interface ExecutionOptions {
  issues?: number[];
  todos?: string[];
  concurrency: number;
  dryRun?: boolean;
  ignoreDependencies?: boolean;
  timeout?: number; // minutes
}

// ============================================================================
// Error Types
// ============================================================================

export class AgentError extends Error {
  constructor(
    message: string,
    public agentType: AgentType,
    public taskId?: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class EscalationError extends Error {
  constructor(
    message: string,
    public target: EscalationTarget,
    public severity: Severity,
    public context: Record<string, any>
  ) {
    super(message);
    this.name = 'EscalationError';
  }
}

export class CircularDependencyError extends Error {
  constructor(
    message: string,
    public cycle: string[]
  ) {
    super(message);
    this.name = 'CircularDependencyError';
  }
}

// ============================================================================
// Discord Community Types (E13)
// ============================================================================

export interface DiscordCommunity {
  // Identification
  serverId: string;
  serverName: string;

  // Channels
  channels: DiscordChannel[];

  // Roles
  roles: DiscordRole[];

  // Members
  members: number;

  // Webhook integrations
  webhooks: WebhookConfig[];

  // Bot integrations
  botIntegrations: BotConfig[];

  // Metadata
  createdAt: string;
}

export interface DiscordChannel {
  id: string;
  name: string; // e.g., "#announcements"
  type: 'text' | 'voice' | 'forum';
  category: string; // e.g., "Information & Announcements"
  purpose: string;
}

export interface DiscordRole {
  id: string;
  name: string; // e.g., "🌱 Newcomer"
  level: number; // 1-5
  requirements: string;
}

export interface WebhookConfig {
  channelId: string;
  webhookUrl: string;
  triggerEvents: string[]; // e.g., ['issue.created', 'pr.merged']
}

export interface BotConfig {
  name: string; // e.g., "MEE6", "GitHub Bot", "Custom Miyabi Bot"
  enabled: boolean;
  commands: BotCommand[];
}

export interface BotCommand {
  name: string; // e.g., "/miyabi status"
  description: string;
  usage: string;
}

// ============================================================================
// Issue Trace Log Types (E14)
// ============================================================================

/**
 * Issue State - 8 types covering complete lifecycle
 */
export type IssueState =
  | 'pending'      // Issue created, awaiting triage
  | 'analyzing'    // CoordinatorAgent analyzing
  | 'implementing' // Specialist Agents working
  | 'reviewing'    // ReviewAgent checking quality
  | 'deploying'    // DeploymentAgent deploying
  | 'done'         // Completed successfully
  | 'blocked'      // Blocked - requires intervention
  | 'failed';      // Execution failed

/**
 * State Transition - tracks state changes
 */
export interface StateTransition {
  from: IssueState;
  to: IssueState;
  timestamp: string;
  triggeredBy: string; // Agent or user
  reason?: string;
}

/**
 * Agent Execution Record - tracks individual agent runs
 */
export interface AgentExecution {
  agentType: AgentType;
  taskId?: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  status: AgentStatus;
  result?: AgentResult;
  error?: string;
}

/**
 * Label Change Record - tracks label modifications
 */
export interface LabelChange {
  timestamp: string;
  action: 'added' | 'removed';
  label: string;
  performedBy: string; // Agent or user
}

/**
 * Trace Note - manual annotations
 */
export interface TraceNote {
  timestamp: string;
  author: string; // Agent or user
  content: string;
  tags?: string[];
}

/**
 * Issue Trace Log - complete lifecycle tracking
 */
export interface IssueTraceLog {
  // Identification
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;

  // Lifecycle tracking
  createdAt: string;
  closedAt?: string;
  currentState: IssueState;
  stateTransitions: StateTransition[];

  // Agent execution tracking
  agentExecutions: AgentExecution[];

  // Task decomposition
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;

  // Label tracking
  labelChanges: LabelChange[];
  currentLabels: string[];

  // Quality & metrics
  qualityReports: QualityReport[];
  finalQualityScore?: number;

  // Pull Request tracking
  pullRequests: PRResult[];

  // Deployment tracking
  deployments: DeploymentResult[];

  // Escalations
  escalations: EscalationInfo[];

  // Notes & annotations
  notes: TraceNote[];

  // Metadata
  metadata: {
    deviceIdentifier: string;
    sessionIds: string[];
    totalDurationMs?: number;
    lastUpdated: string;
  };
}

// ============================================================================
// Performance Metrics Types (E15)
// ============================================================================

export * from './performance-metrics';

// ============================================================================
// Feedback Loop System Types
// ============================================================================

export * from './feedback-loop-types';

// ============================================================================
// Re-exports from other modules
// ============================================================================

// Worktree types (conditional export - only if module exists)
export type { WorktreeInfo, WorktreeManagerConfig, WorktreeExecutionContext } from '../worktree/worktree-manager';

// Entity Relation Mapping types (N1/N2/N3 notation)
export {
  EntityLevel,
  RelationStrength,
  EntityRelationMap,
  WorkflowTemplate,
  type Entity,
  type Relation
} from './entity-relation-mapping';
