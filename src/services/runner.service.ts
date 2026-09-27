import { execa } from 'execa';
import { env } from '../config/env.js';
import { aiSettingsService } from './ai-settings.service.js';
import type { ExecutionResult, SendableChannel } from '../types/index.js';

export interface ExecuteOptions {
  channel: SendableChannel;
  prompt: string;
  targetWorkspace: string;
  commandPrefixBin?: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
  typingIntervalMs?: number;
  onProgress?: (progress: { elapsedSeconds: number; latestAction?: string }) => void;
}

export interface ActiveTask {
  channelId: string;
  subprocess: ReturnType<typeof execa>;
  startTime: number;
  cancelled: boolean;
  latestAction: string;
}

export class RunnerService {
  private activeTasks = new Map<string, ActiveTask>();

  /**
   * Checks if an execution task is currently active for the given channel.
   */
  public isTaskRunning(channelId: string): boolean {
    return this.activeTasks.has(channelId);
  }

  /**
   * Cancels a running task for a specific channel.
   */
  public cancelTask(channelId: string): boolean {
    const task = this.activeTasks.get(channelId);
    if (!task) {
      return false;
    }

    task.cancelled = true;
    console.log(`🛑 [RunnerService] Cancelling active task for channel [${channelId}]...`);

    try {
      task.subprocess.kill('SIGTERM');
      // Send SIGKILL after 1500ms if process has not terminated
      setTimeout(() => {
        if (!task.subprocess.killed) {
          task.subprocess.kill('SIGKILL');
        }
      }, 1500);
      return true;
    } catch (err) {
      console.error(`⚠️ [RunnerService] Error killing task for channel [${channelId}]:`, err);
      return false;
    }
  }

  /**
   * Executes a command string in the specified workspace directory with continuous
   * Discord typing feedback, live progress inspection, cancelability, and robust timeout and buffer controls.
   */
  public async runTask(options: ExecuteOptions): Promise<ExecutionResult> {
    const {
      channel,
      prompt,
      targetWorkspace,
      commandPrefixBin = env.commandPrefixBin,
      timeoutMs = env.executionTimeoutMs,
      maxBufferBytes = env.maxBufferBytes,
      typingIntervalMs = env.typingIntervalMs,
      onProgress,
    } = options;

    const channelId = channel.id;
    const startTime = Date.now();

    // Build optimized CLI arguments (handles agy model, effort, and auto-approved permissions)
    const { binary, fullArgs } = aiSettingsService.buildCliArgs(commandPrefixBin, prompt);

    if (!binary) {
      return {
        stdout: '',
        stderr: 'Invalid command prefix: binary is empty.',
        exitCode: 1,
        failed: true,
        timedOut: false,
        durationMs: 0,
        command: commandPrefixBin,
        error: new Error('Empty command prefix binary'),
      };
    }

    const displayCommand = `${binary} ${fullArgs.slice(0, -1).join(' ')}`.trim();
    let latestAction = '🧠 Inicializando raciocínio...';

    // Start immediate typing indicator and schedule continuous heartbeat
    channel.sendTyping().catch(() => {});
    const typingTimer = setInterval(() => {
      channel.sendTyping().catch(() => {});
    }, typingIntervalMs);

    let progressTimer: NodeJS.Timeout | null = null;
    if (onProgress) {
      progressTimer = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        onProgress({ elapsedSeconds, latestAction });
      }, 2500);
    }

    let activeTask: ActiveTask | null = null;

    try {
      const subprocess = execa(binary, fullArgs, {
        cwd: targetWorkspace,
        timeout: timeoutMs,
        maxBuffer: maxBufferBytes,
        reject: false, // Capture output even on non-zero exit codes without throwing
        all: true,     // Interleave stdout and stderr chronologically
      });

      activeTask = {
        channelId,
        subprocess,
        startTime,
        cancelled: false,
        latestAction,
      };
      this.activeTasks.set(channelId, activeTask);

      // Listen to output stream for dynamic status indicators
      subprocess.all?.on('data', (chunk: Buffer | string) => {
        const text = chunk.toString();
        const lines = text
          .split('\n')
          .map((l) => l.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim())
          .filter(Boolean);

        for (const line of lines) {
          if (
            line.includes('tool') ||
            line.includes('Tool') ||
            line.includes('Reading') ||
            line.includes('Writing') ||
            line.includes('Executing') ||
            line.includes('Running') ||
            line.includes('Searching') ||
            line.includes('Analyzing') ||
            line.includes('Analysing') ||
            line.includes('Thinking')
          ) {
            latestAction = line.slice(0, 100);
            if (activeTask) activeTask.latestAction = latestAction;
          }
        }
      });

      const result = await subprocess;
      const durationMs = Date.now() - startTime;

      if (activeTask.cancelled) {
        return {
          stdout: '',
          stderr: 'Execução cancelada pelo usuário.',
          exitCode: null,
          failed: true,
          timedOut: false,
          cancelled: true,
          durationMs,
          command: displayCommand,
        };
      }

      const stdout = result.stdout ?? '';
      const stderr = result.stderr ?? '';
      const combinedOutput = result.all || (stdout ? `${stdout}\n${stderr}` : stderr);

      return {
        stdout: combinedOutput,
        stderr,
        exitCode: result.exitCode ?? (result.timedOut ? null : 0),
        failed: result.failed || (result.exitCode !== null && result.exitCode !== 0),
        timedOut: Boolean(result.timedOut),
        cancelled: false,
        durationMs,
        command: displayCommand,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const wasCancelled = activeTask?.cancelled ?? false;
      const errorMessage = wasCancelled
        ? 'Execução cancelada pelo usuário.'
        : err instanceof Error
          ? err.message
          : String(err);

      return {
        stdout: '',
        stderr: errorMessage,
        exitCode: null,
        failed: true,
        timedOut: false,
        cancelled: wasCancelled,
        durationMs,
        command: displayCommand,
        error: err instanceof Error ? err : new Error(errorMessage),
      };
    } finally {
      clearInterval(typingTimer);
      if (progressTimer) clearInterval(progressTimer);
      this.activeTasks.delete(channelId);
    }
  }

  /**
   * Formats execution metadata into a concise, high-visibility Discord header.
   */
  public formatHeader(result: ExecutionResult, targetWorkspace: string): string {
    const durationSeconds = (result.durationMs / 1000).toFixed(1);

    if (result.cancelled) {
      return `🛑 **[Singularity] Execução Cancelada** (${durationSeconds}s)\n` +
        `• **Workspace:** \`${targetWorkspace}\``;
    }

    if (result.timedOut) {
      return `⏱️ **[Singularity] Execution Timed Out** after ${durationSeconds}s\n` +
        `• **Workspace:** \`${targetWorkspace}\`\n` +
        `• **Command:** \`${result.command}\``;
    }

    if (result.failed) {
      const codeLabel = result.exitCode !== null ? `Exit Code ${result.exitCode}` : 'Process Terminated/Error';
      return `❌ **[Singularity] Execution Failed** (${codeLabel} in ${durationSeconds}s)\n` +
        `• **Workspace:** \`${targetWorkspace}\`\n` +
        `• **Command:** \`${result.command}\``;
    }

    return `✅ **[Singularity] Execution Succeeded** (${durationSeconds}s)\n` +
      `• **Workspace:** \`${targetWorkspace}\``;
  }
}

export const runnerService = new RunnerService();
