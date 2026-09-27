import fs from 'node:fs';
import path from 'node:path';

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'max';

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  recommendedEffort?: ReasoningEffort;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'gemini-3.8-flash-high',
    name: 'Gemini 3.8 Flash (High Reasoning)',
    description: 'Fast, highly intelligent model with high reasoning capacity (Default)',
    recommendedEffort: 'high',
  },
  {
    id: 'gemini-3.8-flash-medium',
    name: 'Gemini 3.8 Flash (Medium)',
    description: 'Balanced speed and reasoning for everyday coding tasks',
    recommendedEffort: 'medium',
  },
  {
    id: 'gemini-3.8-flash-low',
    name: 'Gemini 3.8 Flash (Low / Ultra-Fast)',
    description: 'Fastest turnarounds with concise reasoning',
    recommendedEffort: 'low',
  },
  {
    id: 'gemini-3.7-flash-high',
    name: 'Gemini 3.7 Flash (High)',
    description: 'Previous gen high-reasoning Flash model',
    recommendedEffort: 'high',
  },
  {
    id: 'gemini-3.1-pro-high',
    name: 'Gemini 3.1 Pro (Deep Reasoning)',
    description: 'Heavyweight model for complex architecture and deep logic',
    recommendedEffort: 'high',
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6 (Thinking)',
    description: 'Anthropic Sonnet 4.6 with native extended thinking',
    recommendedEffort: 'high',
  },
  {
    id: 'claude-opus-4-6-thinking',
    name: 'Claude Opus 4.6 (Thinking)',
    description: 'Anthropic Opus 4.6 for extreme problem solving',
    recommendedEffort: 'max',
  },
  {
    id: 'gpt-oss-120b-medium',
    name: 'GPT-OSS 120B (Medium)',
    description: 'Open-weight 120B model for local or private execution',
    recommendedEffort: 'medium',
  },
];

export interface AiSettings {
  model: string;
  effort: ReasoningEffort;
  skipPermissions: boolean;
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
      model: 'gemini-3.8-flash-high',
      effort: 'high',
      skipPermissions: true,
    };

    this.loadSettings();
  }

  private loadSettings(): void {
    if (fs.existsSync(this.settingsFile)) {
      try {
        const raw = fs.readFileSync(this.settingsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.model) this.settings.model = parsed.model;
        if (parsed.effort) this.settings.effort = parsed.effort;
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

  public setModel(modelId: string): boolean {
    const found = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (found) {
      this.settings.model = found.id;
      if (found.recommendedEffort) {
        this.settings.effort = found.recommendedEffort;
      }
      this.saveSettings();
      console.log(`🤖 [AiSettings] Model changed to: ${found.id} (Effort: ${this.settings.effort})`);
      return true;
    }
    // Allow custom model identifier string if not in default list
    this.settings.model = modelId;
    this.saveSettings();
    console.log(`🤖 [AiSettings] Model changed to custom ID: ${modelId}`);
    return true;
  }

  public setEffort(effort: ReasoningEffort): void {
    this.settings.effort = effort;
    this.saveSettings();
    console.log(`🧠 [AiSettings] Reasoning Effort set to: ${effort}`);
  }

  public getModelName(modelId: string = this.settings.model): string {
    const found = AVAILABLE_MODELS.find((m) => m.id === modelId);
    return found ? found.name : modelId;
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
      // Build optimized agy invocation:
      // agy --dangerously-skip-permissions --model <model> --effort <effort> -p "<prompt>"
      const args: string[] = [];

      if (this.settings.skipPermissions) {
        args.push('--dangerously-skip-permissions');
      }

      if (this.settings.model) {
        args.push('--model', this.settings.model);
      }

      if (this.settings.effort) {
        args.push('--effort', this.settings.effort);
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
}

export const aiSettingsService = new AiSettingsService();
