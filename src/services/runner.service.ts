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
}

export class RunnerService {
  /**
   * Executes a command string in the specified workspace directory with continuous
   * Discord typing feedback and robust timeout and buffer controls.
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
    } = options;

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

    // Start immediate typing indicator and schedule continuous heartbeat
    channel.sendTyping().catch(() => {});
    const typingTimer = setInterval(() => {
      channel.sendTyping().catch(() => {
        // Silently discard transient Discord rate limits or permission drops for typing status
      });
    }, typingIntervalMs);

    try {
      const subprocess = execa(binary, fullArgs, {
        cwd: targetWorkspace,
        timeout: timeoutMs,
        maxBuffer: maxBufferBytes,
        reject: false, // Capture output even on non-zero exit codes without throwing
        all: true,     // Interleave stdout and stderr chronologically
      });

      const result = await subprocess;
      const durationMs = Date.now() - startTime;

      const stdout = result.stdout ?? '';
      const stderr = result.stderr ?? '';
      const combinedOutput = result.all || (stdout ? `${stdout}\n${stderr}` : stderr);

      return {
        stdout: combinedOutput,
        stderr,
        exitCode: result.exitCode ?? (result.timedOut ? null : 0),
        failed: result.failed || (result.exitCode !== null && result.exitCode !== 0),
        timedOut: Boolean(result.timedOut),
        durationMs,
        command: displayCommand,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      return {
        stdout: '',
        stderr: errorMessage,
        exitCode: null,
        failed: true,
        timedOut: false,
        durationMs,
        command: displayCommand,
        error: err instanceof Error ? err : new Error(errorMessage),
      };
    } finally {
      // Ensure the typing heartbeat is unconditionally stopped
      clearInterval(typingTimer);
    }
  }

  /**
   * Formats execution metadata into a concise, high-visibility Discord header.
   */
  public formatHeader(result: ExecutionResult, targetWorkspace: string): string {
    const durationSeconds = (result.durationMs / 1000).toFixed(1);

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
