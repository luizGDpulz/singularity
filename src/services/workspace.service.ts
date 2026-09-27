import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import type { WorkspaceResolution } from '../types/index.js';

export interface ChannelLike {
  id: string;
  name?: string;
  parentId?: string | null;
  isThread?: () => boolean;
}

export class WorkspaceService {
  private readonly dataDir: string;
  private readonly mappingsFile: string;
  private manualMappings: Record<string, string> = {};

  constructor() {
    this.dataDir = path.resolve(process.cwd(), 'data');
    this.mappingsFile = path.join(this.dataDir, 'workspaces.json');

    this.ensureDirectories();
    this.loadMappings();
  }

  /**
   * Ensures data/ and workspaces/ directories exist.
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(env.autoWorkspacesRoot)) {
      fs.mkdirSync(env.autoWorkspacesRoot, { recursive: true });
    }
  }

  /**
   * Loads initial mappings from .env and dynamic persistent overrides from data/workspaces.json.
   */
  private loadMappings(): void {
    // 1. Seed from .env
    this.manualMappings = { ...env.workspaceMappings };

    // 2. Load dynamic mappings from data/workspaces.json
    if (fs.existsSync(this.mappingsFile)) {
      try {
        const raw = fs.readFileSync(this.mappingsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
          this.manualMappings = { ...this.manualMappings, ...parsed };
        }
      } catch (err) {
        console.error('⚠️ [WorkspaceService] Failed to load data/workspaces.json:', err);
      }
    }
  }

  /**
   * Persists dynamic mappings to data/workspaces.json.
   */
  private persistMappings(): void {
    try {
      this.ensureDirectories();
      fs.writeFileSync(
        this.mappingsFile,
        JSON.stringify(this.manualMappings, null, 2),
        'utf-8'
      );
    } catch (err) {
      console.error('⚠️ [WorkspaceService] Failed to persist data/workspaces.json:', err);
    }
  }

  /**
   * Sanitizes a Discord channel or thread name into a clean, filesystem-safe directory slug.
   * Strips emojis, diacritics, and OS-forbidden characters without breaking if name is emoji-only.
   */
  public sanitizeSlug(name: string, fallbackId: string = 'channel'): string {
    if (!name) return `workspace-${fallbackId.slice(-6)}`;

    const cleaned = name
      // Normalize accents (e.g. á -> a, ç -> c)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Remove pictographic emojis only (without swallowing numbers 0-9)
      .replace(/\p{Extended_Pictographic}/gu, '')
      // Remove forbidden OS and punctuation characters
      .replace(/[<>:"/\\|?*#~`!@$%^&()+=;.,[\]{}]/g, '')
      // Replace whitespace and underscores with a single dash
      .replace(/[\s_]+/g, '-')
      // Remove multiple consecutive dashes
      .replace(/-+/g, '-')
      // Trim dashes from start and end
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    return cleaned.length > 0 ? cleaned : `workspace-${fallbackId.slice(-6)}`;
  }

  /**
   * Resolves the workspace for a channel or thread.
   * - If manually mapped: returns the explicit project path.
   * - If not mapped: creates/returns an auto-sandbox directory under ./workspaces/<slug>/.
   */
  public resolveWorkspace(channel: ChannelLike): WorkspaceResolution {
    const isThread = typeof channel.isThread === 'function' ? channel.isThread() : false;
    const directMapped = this.manualMappings[channel.id];
    const parentMapped = channel.parentId ? this.manualMappings[channel.parentId] : undefined;

    // Case 1: Explicit project path mapped manually
    const mappedPath = directMapped ?? (isThread ? parentMapped : undefined);
    if (mappedPath) {
      if (!fs.existsSync(mappedPath)) {
        try {
          fs.mkdirSync(mappedPath, { recursive: true });
        } catch {
          // Ignore if unable to create (e.g. permission or read-only), runner will report on spawn
        }
      }
      return {
        path: path.resolve(mappedPath),
        mode: 'mapped',
        isAutoSandbox: false,
      };
    }

    // Case 2: Auto-Sandbox directory in the bot's workspaces folder
    const channelName = channel.name || channel.id;
    const slug = this.sanitizeSlug(channelName, channel.id);
    const autoPath = path.resolve(env.autoWorkspacesRoot, slug);

    if (!fs.existsSync(autoPath)) {
      fs.mkdirSync(autoPath, { recursive: true });
      console.log(`📁 [Auto-Sandbox] Created directory for channel #${channelName}: ${autoPath}`);
    }

    return {
      path: autoPath,
      mode: 'auto-sandbox',
      isAutoSandbox: true,
    };
  }

  /**
   * Handles channel or thread rename events in Discord.
   * If the workspace is in auto-sandbox mode, renames the physical folder on disk.
   */
  public handleChannelRename(channelId: string, oldName: string, newName: string): boolean {
    // If it's a manually mapped workspace, don't rename the project folder!
    if (this.manualMappings[channelId]) {
      return false;
    }

    const oldSlug = this.sanitizeSlug(oldName, channelId);
    const newSlug = this.sanitizeSlug(newName, channelId);

    if (oldSlug === newSlug) {
      return false;
    }

    const oldPath = path.resolve(env.autoWorkspacesRoot, oldSlug);
    const newPath = path.resolve(env.autoWorkspacesRoot, newSlug);

    if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
      try {
        fs.renameSync(oldPath, newPath);
        console.log(`🔄 [Auto-Sandbox] Renamed workspace: ${oldSlug} -> ${newSlug}`);
        return true;
      } catch (err) {
        console.error(`⚠️ [Auto-Sandbox] Failed to rename workspace ${oldSlug} to ${newSlug}:`, err);
      }
    }

    return false;
  }

  /**
   * Binds a Discord channel explicitly to a path on disk.
   */
  public setManualMapping(channelId: string, targetPath: string): string {
    const resolved = path.resolve(targetPath);
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
    }
    this.manualMappings[channelId] = resolved;
    this.persistMappings();
    console.log(`🔗 [Workspace] Mapped channel [${channelId}] -> ${resolved}`);
    return resolved;
  }

  /**
   * Unmaps a channel, restoring it to auto-sandbox mode.
   */
  public removeManualMapping(channelId: string): boolean {
    if (this.manualMappings[channelId]) {
      delete this.manualMappings[channelId];
      this.persistMappings();
      console.log(`🔓 [Workspace] Unmapped channel [${channelId}]. Reverted to auto-sandbox.`);
      return true;
    }
    return false;
  }

  /**
   * Returns list of all explicit mappings.
   */
  public listManualMappings(): Record<string, string> {
    return { ...this.manualMappings };
  }
}

export const workspaceService = new WorkspaceService();
