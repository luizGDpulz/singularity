import fs from 'node:fs';
import path from 'node:path';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  supportedEfforts: ReasoningEffort[];
  defaultEffort?: ReasoningEffort;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    description: 'Fast, highly intelligent model with high reasoning capacity (Default)',
    supportedEfforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    description: 'Previous gen high-reasoning Flash model with balanced speed',
    supportedEfforts: ['low', 'medium', 'high'],
    defaultEffort: 'medium',
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    description: 'Concise, high-efficiency Gemini Flash model',
    supportedEfforts: ['low', 'medium', 'high'],
    defaultEffort: 'medium',
  },
  {
    id: 'gemini-3.1-pro',
    name: 'Gemini 3.1 Pro',
    description: 'Heavyweight reasoning model for complex architectural problems',
    supportedEfforts: ['low', 'high'],
    defaultEffort: 'high',
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6 (Thinking)',
    description: 'Anthropic Sonnet 4.6 with native extended thinking',
    supportedEfforts: [],
  },
  {
    id: 'claude-opus-4-6-thinking',
    name: 'Claude Opus 4.6 (Thinking)',
    description: 'Anthropic Opus 4.6 with extreme reasoning depth',
    supportedEfforts: [],
  },
  {
    id: 'gpt-oss-120b-medium',
    name: 'GPT-OSS 120B (Medium)',
    description: 'Open-weight 120B model for local or private execution',
    supportedEfforts: [],
  },
];

export type PermissionMode = 'auto' | 'ask';

export interface AiSettings {
  model: string;
  effort: ReasoningEffort;
  skipPermissions: boolean;
  permissionMode: PermissionMode;
}

export class AiSettingsService {
  private readonly settingsFile: string;
  private settings: AiSettings;

  constructor() {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.settingsFile = path.join(dataDir, 'ai-settings.json');

    this.settings = {
      model: 'gemini-3.8-flash',
      effort: 'high',
      skipPermissions: true,
      permissionMode: 'auto',
    };

    this.loadSettings();
  }

  /**
   * Normalizes model identifiers (e.g. strips legacy suffix 'gemini-3.8-flash-high' -> 'gemini-3.8-flash').
   */
  public normalizeModel(rawModel: string): { modelId: string; inferredEffort?: ReasoningEffort } {
    const match = rawModel.match(/^(gemini-[0-9.]+-flash|gemini-[0-9.]+-pro)-(low|medium|high)$/);
    if (match && match[1] && match[2]) {
      return {
        modelId: match[1],
        inferredEffort: match[2] as ReasoningEffort,
      };
    }
    return { modelId: rawModel };
  }

  private loadSettings(): void {
    if (fs.existsSync(this.settingsFile)) {
      try {
        const raw = fs.readFileSync(this.settingsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.model) {
          const { modelId, inferredEffort } = this.normalizeModel(parsed.model);
          this.settings.model = modelId;
          if (inferredEffort && !parsed.effort) {
            this.settings.effort = inferredEffort;
          }
        }
        if (parsed.effort) {
          if (parsed.effort === 'max') {
            this.settings.effort = 'high';
          } else if (['low', 'medium', 'high'].includes(parsed.effort)) {
            this.settings.effort = parsed.effort as ReasoningEffort;
          }
        }
        if (parsed.permissionMode === 'auto' || parsed.permissionMode === 'ask') {
          this.settings.permissionMode = parsed.permissionMode;
        }
        if (typeof parsed.skipPermissions === 'boolean') {
          this.settings.skipPermissions = parsed.skipPermissions;
        }
      } catch (err) {
        console.error('⚠️ [AiSettings] Failed to load ai-settings.json:', err);
      }
    }
  }

  private saveSettings(): void {
    try {
      fs.writeFileSync(
        this.settingsFile,
        JSON.stringify(this.settings, null, 2),
        'utf-8'
      );
    } catch (err) {
      console.error('⚠️ [AiSettings] Failed to persist ai-settings.json:', err);
    }
  }

  public getSettings(): AiSettings {
    return { ...this.settings };
  }

  public getSupportedEfforts(modelId: string = this.settings.model): ReasoningEffort[] {
    const { modelId: normalizedId } = this.normalizeModel(modelId);
    const found = AVAILABLE_MODELS.find((m) => m.id === normalizedId);
    return found ? found.supportedEfforts : ['low', 'medium', 'high'];
  }

  public setModel(rawModelId: string): boolean {
    const { modelId, inferredEffort } = this.normalizeModel(rawModelId);
    const found = AVAILABLE_MODELS.find((m) => m.id === modelId);

    if (found) {
      this.settings.model = found.id;
      // If the current effort is not supported by the new model, set to default or closest
      if (found.supportedEfforts.length > 0) {
        if (!found.supportedEfforts.includes(this.settings.effort)) {
          this.settings.effort = inferredEffort || found.defaultEffort || found.supportedEfforts[0] || 'medium';
        }
      }
      this.saveSettings();
      console.log(`🤖 [AiSettings] Model changed to: ${found.id} (Effort: ${this.settings.effort})`);
      return true;
    }

    this.settings.model = modelId;
    if (inferredEffort) this.settings.effort = inferredEffort;
    this.saveSettings();
    console.log(`🤖 [AiSettings] Model changed to custom ID: ${modelId}`);
    return true;
  }

  public setEffort(effort: ReasoningEffort): void {
    this.settings.effort = effort;
    this.saveSettings();
    console.log(`🧠 [AiSettings] Reasoning Effort set to: ${effort}`);
  }

  /**
   * Cycles reasoning effort left or right matching the native agy arrow stepper.
   */
  public stepEffort(direction: 'prev' | 'next'): ReasoningEffort {
    const supported = this.getSupportedEfforts();
    if (supported.length <= 1) {
      return this.settings.effort;
    }

    const currentIndex = supported.indexOf(this.settings.effort);
    let nextIndex = currentIndex;

    if (direction === 'next') {
      if (currentIndex === -1) nextIndex = 0;
      else if (currentIndex < supported.length - 1) nextIndex = currentIndex + 1;
    } else {
      if (currentIndex === -1) nextIndex = supported.length - 1;
      else if (currentIndex > 0) nextIndex = currentIndex - 1;
    }

    const newEffort = supported[nextIndex] || this.settings.effort;
    this.setEffort(newEffort);
    return newEffort;
  }

  public setPermissionMode(mode: PermissionMode): void {
    this.settings.permissionMode = mode;
    this.saveSettings();
    console.log(`🛡️ [AiSettings] Permission Mode set to: ${mode}`);
  }

  public getModelName(modelId: string = this.settings.model): string {
    const { modelId: normalizedId } = this.normalizeModel(modelId);
    const found = AVAILABLE_MODELS.find((m) => m.id === normalizedId);
    return found ? found.name : modelId;
  }

  /**
   * Renders the native agy visual effort slider bar.
   */
  public renderEffortSlider(): { visual: string; description: string } {
    const supported = this.getSupportedEfforts();
    const current = this.settings.effort;

    if (supported.length === 0) {
      return {
        visual: '`🔒 Fixo no Modelo`',
        description: '*Extended Thinking integrado nativamente pelo provedor.*',
      };
    }

    let visual = '';
    let description = '';

    if (supported.length === 2 && supported.includes('low') && supported.includes('high')) {
      // Gemini 3.1 Pro (low, high)
      if (current === 'low') {
        visual = '`◀ ──●────────────○── ▶`\n`     low          high`';
        description = 'Ultra-fast turnarounds with concise reasoning.';
      } else {
        visual = '`◀ ──○────────────●── ▶`\n`     low          high`';
        description = 'Deep architectural reasoning and heavy logic analysis.';
      }
    } else {
      // Standard 3-step (low, medium, high)
      if (current === 'low') {
        visual = '`◀ ──●──────○──────○── ▶`\n`    low   medium  high`';
        description = 'Ultra-fast turnarounds with concise reasoning.';
      } else if (current === 'high') {
        visual = '`◀ ──○──────○──────●── ▶`\n`    low   medium  high`';
        description = 'Deep reasoning, code architecture, and multi-file analysis.';
      } else {
        visual = '`◀ ──○──────●──────○── ▶`\n`    low   medium  high`';
        description = 'Balanced speed and reasoning quality for most tasks.';
      }
    }

    return { visual, description };
  }

  /**
   * Constructs the full argument array for invoking the CLI with model, effort,
   * permissions bypass, and the prompt placed at the end.
   */
  public buildCliArgs(commandPrefixBin: string, prompt: string): { binary: string; fullArgs: string[] } {
    const parts = commandPrefixBin.trim().split(/\s+/);
    const binary = parts[0] || 'agy';
    const isAgy = binary.toLowerCase().includes('agy') || parts.some((p) => p.toLowerCase().includes('agy'));

    if (isAgy) {
      const args: string[] = [];

      if (this.settings.skipPermissions) {
        args.push('--dangerously-skip-permissions');
      }

      // 1. Resolve normalized model ID
      const { modelId, inferredEffort } = this.normalizeModel(this.settings.model);
      const modelDef = AVAILABLE_MODELS.find((m) => m.id === modelId);

      args.push('--model', modelId);

      // 2. Only supply --effort if the model actually supports reasoning effort (e.g. Gemini)
      const supportsEffort = modelDef ? modelDef.supportedEfforts.length > 0 : !modelId.startsWith('claude') && !modelId.startsWith('gpt');
      if (supportsEffort) {
        let activeEffort = this.settings.effort || inferredEffort || 'medium';
        if (modelDef && modelDef.supportedEfforts.length > 0) {
          if (!modelDef.supportedEfforts.includes(activeEffort)) {
            activeEffort = modelDef.defaultEffort || modelDef.supportedEfforts[modelDef.supportedEfforts.length - 1] || 'medium';
          }
        }
        args.push('--effort', activeEffort);
      }

      // Finally append the print flag -p and the prompt as argument
      args.push('-p', prompt);

      return { binary, fullArgs: args };
    }

    // Generic command runner fallback
    const baseArgs = parts.slice(1);
    return {
      binary,
      fullArgs: [...baseArgs, prompt],
    };
  }

  /**
   * Fetches real-time usage quotas from agy via `/usage`.
   */
  public async fetchUsageQuota(commandPrefixBin: string): Promise<Array<{ group: string; metric: string; percent: number; resetDate: string }>> {
    const parts = commandPrefixBin.trim().split(/\s+/);
    const binary = parts[0] || 'agy';
    const isAgy = binary.toLowerCase().includes('agy') || parts.some((p) => p.toLowerCase().includes('agy'));

    if (!isAgy) {
      return [];
    }

    try {
      const { execa } = await import('execa');
      const result = await execa(binary, ['-p', '/usage'], { timeout: 15000, reject: false });
      if (result.exitCode !== 0 || !result.stdout) {
        return [];
      }

      const lines = result.stdout.trim().split('\n');
      const quotas: Array<{ group: string; metric: string; percent: number; resetDate: string }> = [];

      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 3) {
          const group = parts[0]?.trim() || '';
          const metric = parts[1]?.trim() || '';
          const percentStr = parts[2]?.replace('%', '').trim() || '0';
          const resetDate = parts[3]?.trim() || '';
          const percent = Number.parseFloat(percentStr) || 0;

          quotas.push({ group, metric, percent, resetDate });
        }
      }

      return quotas;
    } catch (err) {
      console.error('⚠️ [AiSettings] Failed to fetch /usage quota from agy:', err);
      return [];
    }
  }

  /**
   * Renders a clean ASCII visual progress bar for Discord embeds.
   */
  public renderProgressBar(percent: number, totalBlocks: number = 14): string {
    const clamped = Math.max(0, Math.min(100, percent));
    const filledBlocks = Math.round((clamped / 100) * totalBlocks);
    const emptyBlocks = totalBlocks - filledBlocks;
    const bar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);
    return `[${bar}] ${clamped}%`;
  }
}

export const aiSettingsService = new AiSettingsService();
