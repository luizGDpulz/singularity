import type { Message, MessageCreateOptions, MessagePayload } from 'discord.js';

/**
 * Represents any channel capable of sending messages and typing status.
 */
export type SendableChannel = {
  id: string;
  name?: string;
  parentId?: string | null;
  send: (options: string | MessagePayload | MessageCreateOptions) => Promise<Message>;
  sendTyping: () => Promise<void>;
};

/**
 * Workspace mapping interface: maps Discord Channel/Thread/Parent IDs to directory paths.
 */
export type WorkspaceMappings = Record<string, string>;

/**
 * Validated environment configuration for Singularity Bridge.
 */
export interface EnvConfig {
  discordToken: string;
  allowedUserId: string;
  allowedCategoryId?: string;
  autoWorkspacesRoot: string;
  workspaceMappings: WorkspaceMappings;
  commandPrefixBin: string;
  executionTimeoutMs: number;
  maxBufferBytes: number;
  typingIntervalMs: number;
}

/**
 * Result details from a CLI subprocess run.
 */
export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  failed: boolean;
  timedOut: boolean;
  durationMs: number;
  command: string;
  error?: Error | unknown;
}

/**
 * Represents a normalized message in thread conversational history.
 */
export interface ConversationMessage {
  id: string;
  authorId: string;
  role: 'user' | 'singularity';
  content: string;
  createdAt: Date;
}

/**
 * Mode of the workspace:
 * - 'mapped': Explicitly bound to an existing project path on disk.
 * - 'auto-sandbox': Created automatically by the bot under ./workspaces/<channel-name>/.
 */
export type WorkspaceMode = 'mapped' | 'auto-sandbox';

export interface WorkspaceResolution {
  path: string;
  mode: WorkspaceMode;
  isAutoSandbox: boolean;
}

/**
 * Resolved channel and workspace context for a received Discord message.
 */
export interface ContextResolution {
  channelId: string;
  channelName: string;
  isThread: boolean;
  threadId?: string;
  parentId?: string;
  categoryId?: string;
  targetWorkspace: string;
  isAutoSandbox: boolean;
  history: ConversationMessage[];
  aggregatedPrompt: string;
}
