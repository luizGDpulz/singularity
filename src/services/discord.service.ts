import {
  AttachmentBuilder,
  type Message,
  type ThreadChannel,
} from 'discord.js';
import { env } from '../config/env.js';
import { workspaceService } from './workspace.service.js';
import type {
  ContextResolution,
  ConversationMessage,
  SendableChannel,
} from '../types/index.js';

export class DiscordService {
  /**
   * Maximum characters per Discord message chunk.
   * Keeps buffer below Discord's 2000-character hard limit to accommodate markdown code blocks.
   */
  public static readonly MAX_CHUNK_LENGTH = 1900;

  /**
   * Threshold in characters beyond which output is attached as a file rather than split.
   */
  public static readonly ATTACHMENT_THRESHOLD = 6000;

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
   * Sends terminal output to the target Discord channel.
   * - If <= 1900 chars: sends as a single ```bash code block.
   * - If 1901..6000 chars: splits cleanly into <= 1900 chunks wrapped in ```bash code blocks.
   * - If > 6000 chars: sends summary preview and attaches full logs as a .txt snippet.
   */
  public async sendExecutionOutput(
    channel: SendableChannel,
    output: string,
    metadataHeader?: string
  ): Promise<void> {
    const trimmedOutput = output.trim();
    const headerPrefix = metadataHeader ? `${metadataHeader}\n` : '';

    if (!trimmedOutput) {
      await channel.send(`${headerPrefix}\`\`\`bash\n[Process completed with empty output]\n\`\`\``);
      return;
    }

    // Strategy 1: Total output exceeds 6000 characters -> Attach as .txt snippet
    if (trimmedOutput.length > DiscordService.ATTACHMENT_THRESHOLD) {
      const buffer = Buffer.from(trimmedOutput, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, {
        name: `execution-output-${Date.now()}.txt`,
        description: 'Complete terminal execution log from Singularity',
      });

      // Provide a clean tail preview for immediate mobile readability
      const tailPreview = this.getTailPreview(trimmedOutput, 800);
      const messageContent = [
        headerPrefix ? headerPrefix.trim() : '',
        `📄 **Terminal output exceeded 6,000 chars (${trimmedOutput.length.toLocaleString()} characters).**`,
        'Full output attached below as `.txt` log file.',
        '**Log Preview (Tail):**',
        '```bash',
        tailPreview,
        '```',
      ]
        .filter(Boolean)
        .join('\n');

      await channel.send({
        content: messageContent,
        files: [attachment],
      });
      return;
    }

    // Strategy 2: Output <= 1900 chars (taking header into account)
    const combinedInitial = `${headerPrefix}\`\`\`bash\n${trimmedOutput}\n\`\`\``;
    if (combinedInitial.length <= 1980) {
      await channel.send(combinedInitial);
      return;
    }

    // Strategy 3: Output between 1901 and 6000 chars -> Split into multiple bash chunks
    if (headerPrefix) {
      await channel.send(headerPrefix.trim());
    }

    const chunks = this.splitIntoChunks(trimmedOutput, DiscordService.MAX_CHUNK_LENGTH);
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;
      const progressLabel = chunks.length > 1 ? `/* [Chunk ${i + 1}/${chunks.length}] */\n` : '';
      await channel.send(`\`\`\`bash\n${progressLabel}${chunk}\n\`\`\``);
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
}

export const discordService = new DiscordService();
