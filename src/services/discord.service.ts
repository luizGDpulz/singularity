import {
  AttachmentBuilder,
  type Message,
  type ThreadChannel,
} from 'discord.js';
import { env } from '../config/env.js';
import { markdownService } from './markdown.service.js';
import { workspaceService } from './workspace.service.js';
import type {
  ContextResolution,
  ConversationMessage,
  SendableChannel,
} from '../types/index.js';

export interface SendOutputOptions {
  header?: string;
  isError?: boolean;
  workspaceDir?: string;
  durationMs?: number;
  modelName?: string;
  effort?: string;
}

export class DiscordService {
  /**
   * Maximum characters per Discord message chunk.
   * Keeps buffer below Discord's 2000-character hard limit to accommodate markdown code blocks.
   */
  public static readonly MAX_CHUNK_LENGTH = 1900;

  /**
   * Threshold in characters beyond which output is attached as a file rather than split.
   * Set high (45,000 chars) to allow long responses to be delivered in native Discord chunks.
   */
  public static readonly ATTACHMENT_THRESHOLD = 45000;

  /**
   * Resolves the workspace context, thread relationship, and fetches recent thread history.
   * Enforces ALLOWED_CATEGORY_ID if specified and auto-sandboxes if unmapped.
   */
  public async resolveContext(
    message: Message,
    botUserId: string
  ): Promise<ContextResolution | null> {
    const channel = message.channel;
    const isThread = channel.isThread();
    let parentId: string | undefined;
    let categoryId: string | undefined;

    if (isThread) {
      const threadChannel = channel as ThreadChannel;
      parentId = threadChannel.parentId ?? undefined;
      categoryId = threadChannel.parent?.parentId ?? undefined;
    } else {
      parentId = 'parentId' in channel && channel.parentId ? channel.parentId : undefined;
      // In regular guild text channels, parentId is the Category Snowflake ID
      categoryId = parentId;
    }

    // 1. Strict Category Isolation Barrier
    if (env.allowedCategoryId) {
      const belongsToCategory =
        categoryId === env.allowedCategoryId || channel.id === env.allowedCategoryId;
      if (!belongsToCategory) {
        return null; // Message originated outside the allowed category; drop silently
      }
    }

    // 2. Resolve workspace path and sandbox mode
    const channelName = 'name' in channel && typeof channel.name === 'string' ? channel.name : channel.id;
    const workspaceResolution = workspaceService.resolveWorkspace({
      id: channel.id,
      name: channelName,
      parentId,
      isThread: () => isThread,
    });

    const targetWorkspace = workspaceResolution.path;

    // Fetch up to the last 8 messages strictly within this specific thread or channel
    const fetchedMessages = await channel.messages.fetch({ limit: 8 });

    // discord.js fetch returns newest first. Reverse to achieve chronological order.
    const chronologicalMessages = Array.from(fetchedMessages.values()).reverse();

    const history: ConversationMessage[] = [];
    const promptSegments: string[] = [];

    for (const msg of chronologicalMessages) {
      const isBot = msg.author.id === botUserId;
      const isAuthorizedUser = msg.author.id === env.allowedUserId;

      // Drop messages from other bots or unauthorized users that might be in the channel
      if (!isBot && !isAuthorizedUser) {
        continue;
      }

      const content = msg.content.trim();
      if (!content) {
        continue;
      }

      const role: 'user' | 'singularity' = isBot ? 'singularity' : 'user';
      history.push({
        id: msg.id,
        authorId: msg.author.id,
        role,
        content,
        createdAt: msg.createdAt,
      });

      const label = isBot ? '[Singularity]' : '[User]';
      promptSegments.push(`${label}: ${content}`);
    }

    // If history collected matches promptSegments, join them to supply full conversational context
    const aggregatedPrompt =
      promptSegments.length > 1
        ? `Conversational Context:\n${promptSegments.join('\n')}`
        : message.content.trim();

    return {
      channelId: channel.id,
      channelName,
      isThread,
      threadId: isThread ? channel.id : undefined,
      parentId,
      categoryId,
      targetWorkspace,
      isAutoSandbox: workspaceResolution.isAutoSandbox,
      history,
      aggregatedPrompt,
    };
  }

  /**
   * Splits long terminal output cleanly into chunks of <= 1900 characters without
   * slicing lines in half, falling back to substring slices if a single line exceeds the limit.
   */
  public splitIntoChunks(text: string, maxLength: number = DiscordService.MAX_CHUNK_LENGTH): string[] {
    if (!text || text.length === 0) {
      return [];
    }

    if (text.length <= maxLength) {
      return [text];
    }

    const lines = text.split('\n');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const line of lines) {
      // Case A: The single line itself is longer than maxLength
      if (line.length > maxLength) {
        // Flush any existing currentChunk first
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = '';
        }

        // Slice the oversized line into maxLength blocks
        for (let i = 0; i < line.length; i += maxLength) {
          chunks.push(line.slice(i, i + maxLength));
        }
        continue;
      }

      // Case B: Appending this line exceeds currentChunk limit
      const projectedLength = currentChunk.length === 0 ? line.length : currentChunk.length + 1 + line.length;
      if (projectedLength > maxLength) {
        chunks.push(currentChunk);
        currentChunk = line;
      } else {
        currentChunk = currentChunk.length === 0 ? line : `${currentChunk}\n${line}`;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Splits conversational markdown cleanly into chunks of <= maxLength characters,
   * respecting code block boundaries (```...```) so code blocks are never left unclosed.
   */
  public splitMarkdownChunks(text: string, maxLength: number = 1950): string[] {
    if (!text || text.length <= maxLength) {
      return text ? [text] : [];
    }

    const lines = text.split('\n');
    const chunks: string[] = [];
    let currentChunk = '';
    let inCodeBlock = false;
    let codeBlockLang = '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      const isFence = trimmedLine.startsWith('```');

      // Check if adding this line would exceed the chunk limit
      const lineLen = line.length + 1; // +1 for newline
      const neededClosingFenceLen = inCodeBlock ? 4 : 0; // '\n```'
      if (currentChunk.length + lineLen + neededClosingFenceLen > maxLength && currentChunk.length > 0) {
        if (inCodeBlock) {
          // Close fence in current chunk
          currentChunk += '\n```';
          chunks.push(currentChunk);
          // Re-open fence in next chunk
          currentChunk = `\`\`\`${codeBlockLang}\n${line}`;
        } else {
          chunks.push(currentChunk);
          currentChunk = line;
        }

        if (isFence) {
          if (inCodeBlock) {
            inCodeBlock = false;
            codeBlockLang = '';
          } else {
            inCodeBlock = true;
            codeBlockLang = trimmedLine.replace(/^```/, '').trim();
          }
        }
        continue;
      }

      // Track fence entry/exit
      if (isFence) {
        if (inCodeBlock) {
          inCodeBlock = false;
          codeBlockLang = '';
        } else {
          inCodeBlock = true;
          codeBlockLang = trimmedLine.replace(/^```/, '').trim();
        }
      }

      currentChunk = currentChunk.length === 0 ? line : `${currentChunk}\n${line}`;
    }

    if (currentChunk.length > 0) {
      if (inCodeBlock) {
        currentChunk += '\n```';
      }
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Sends execution output to the target Discord channel.
   * - On success (natural AI conversation): Delivers output as native Discord Markdown
   *   without outer ```bash code blocks, preserving formatting, headings, lists, and internal code blocks.
   * - On failure (system/command error): Formats as an error card wrapped in a code block.
   * - If > 6000 chars: sends summary preview and attaches full logs/response as a file.
   */
  public async sendExecutionOutput(
    channel: SendableChannel,
    output: string,
    options: SendOutputOptions | string = {}
  ): Promise<void> {
    const opts = typeof options === 'string' ? { header: options, isError: false } : options;
    const isError = Boolean(opts.isError);
    const headerPrefix = opts.header ? `${opts.header}\n` : '';

    // Strip ANSI color codes
    let cleanOutput = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();

    // Format rich conversational markdown specifically for Discord
    // (translates LaTeX KaTeX math to Unicode, normalizes H4-H6 headings, and maps file:// links)
    if (!isError && cleanOutput) {
      cleanOutput = markdownService.formatForDiscord(cleanOutput, opts.workspaceDir);
    }

    if (!cleanOutput) {
      if (isError) {
        await channel.send(`${headerPrefix}\`\`\`bash\n[Process completed with empty error output]\n\`\`\``);
      } else {
        await channel.send('*(Processo finalizado sem saída de texto.)*');
      }
      return;
    }

    // 1. Error output delivery (Terminal / bash block)
    if (isError) {
      if (cleanOutput.length > DiscordService.ATTACHMENT_THRESHOLD) {
        const buffer = Buffer.from(cleanOutput, 'utf-8');
        const attachment = new AttachmentBuilder(buffer, {
          name: `error-log-${Date.now()}.txt`,
          description: 'Terminal error log from Singularity',
        });
        const tailPreview = this.getTailPreview(cleanOutput, 800);
        await channel.send({
          content: `${headerPrefix}⚠️ **Log de erro extenso (${cleanOutput.length.toLocaleString()} caracteres):**\n\`\`\`bash\n${tailPreview}\n\`\`\``,
          files: [attachment],
        });
        return;
      }

      const combined = `${headerPrefix}\`\`\`bash\n${cleanOutput}\n\`\`\``;
      if (combined.length <= 1980) {
        await channel.send(combined);
        return;
      }

      if (headerPrefix) {
        await channel.send(headerPrefix.trim());
      }
      const chunks = this.splitIntoChunks(cleanOutput, DiscordService.MAX_CHUNK_LENGTH);
      for (const chunk of chunks) {
        await channel.send(`\`\`\`bash\n${chunk}\n\`\`\``);
      }
      return;
    }

    // 2. Normal Conversational Output (Native Rich Discord Markdown)
    // If output is massive (> 6000 chars), attach full markdown file and send preview
    if (cleanOutput.length > DiscordService.ATTACHMENT_THRESHOLD) {
      const buffer = Buffer.from(cleanOutput, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, {
        name: `resposta-singularity-${Date.now()}.md`,
        description: 'Complete AI response from Singularity',
      });

      const preview =
        cleanOutput.length > 1200
          ? `${cleanOutput.slice(0, 1150)}...\n\n*(Conteúdo completo no anexo .md)*`
          : cleanOutput;

      await channel.send({
        content: `📄 **Resposta extensa (${cleanOutput.length.toLocaleString()} caracteres):**\n\n${preview}`,
        files: [attachment],
      });
      return;
    }

    // Build optional execution metrics footer (e.g. ⚡ 14.2s • Gemini 2.5 Pro (HIGH) • /srv/src/secullum-vms)
    let outputWithFooter = cleanOutput;
    const metricsParts: string[] = [];
    if (opts.durationMs !== undefined && opts.durationMs > 0) {
      metricsParts.push(`⚡ **${(opts.durationMs / 1000).toFixed(1)}s**`);
    }
    if (opts.modelName) {
      metricsParts.push(`**${opts.modelName}**${opts.effort ? ` (\`${opts.effort.toUpperCase()}\`)` : ''}`);
    }
    if (opts.workspaceDir) {
      metricsParts.push(`\`${opts.workspaceDir}\``);
    }
    if (metricsParts.length > 0) {
      outputWithFooter = `${cleanOutput}\n\n───────────────────────────────────────\n${metricsParts.join(' • ')}`;
    }

    // Normal markdown delivery: split into clean markdown chunks (<= 1950 chars)
    const mdChunks = this.splitMarkdownChunks(outputWithFooter, 1950);
    for (const chunk of mdChunks) {
      await channel.send(chunk);
    }
  }

  /**
   * Extracts the last N characters of output cleanly on a line boundary for preview cards.
   */
  private getTailPreview(text: string, maxPreviewChars: number): string {
    if (text.length <= maxPreviewChars) {
      return text;
    }
    const slice = text.slice(-maxPreviewChars);
    const firstNewlineIndex = slice.indexOf('\n');
    return firstNewlineIndex !== -1 ? `... [truncated]\n${slice.slice(firstNewlineIndex + 1)}` : `... [truncated]\n${slice}`;
  }

  /**
   * Sanitizes markdown text specifically for Discord (links, math, headings).
   */
  public sanitizeFileLinks(markdown: string, workspaceDir?: string): string {
    return markdownService.formatForDiscord(markdown, workspaceDir);
  }
}

export const discordService = new DiscordService();
