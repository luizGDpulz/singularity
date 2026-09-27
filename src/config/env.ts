import 'dotenv/config';
import path from 'node:path';
import type { EnvConfig, WorkspaceMappings } from '../types/index.js';

/**
 * Validates and parses environment variables.
 * Fails fast with descriptive error messages if any required variable is missing or invalid.
 */
function loadAndValidateEnv(): EnvConfig {
  const errors: string[] = [];

  // 1. DISCORD_TOKEN
  const rawToken = process.env['DISCORD_TOKEN']?.trim();
  if (!rawToken) {
    errors.push('Missing or empty environment variable: DISCORD_TOKEN');
  }

  // 2. ALLOWED_USER_ID
  const rawAllowedUserId = process.env['ALLOWED_USER_ID']?.trim();
  if (!rawAllowedUserId) {
    errors.push('Missing or empty environment variable: ALLOWED_USER_ID');
  } else if (!/^\d{17,21}$/.test(rawAllowedUserId)) {
    errors.push(`Invalid ALLOWED_USER_ID: "${rawAllowedUserId}". Must be a valid Discord Snowflake (numeric string of 17-21 digits).`);
  }

  // 3. ALLOWED_CATEGORY_ID (Optional: restricts bot execution strictly to channels within this category)
  const rawAllowedCategoryId = process.env['ALLOWED_CATEGORY_ID']?.trim();
  if (rawAllowedCategoryId && !/^\d{17,21}$/.test(rawAllowedCategoryId)) {
    errors.push(`Invalid ALLOWED_CATEGORY_ID: "${rawAllowedCategoryId}". Must be a valid Discord Snowflake (numeric string of 17-21 digits).`);
  }

  // 4. WORKSPACE_MAPPINGS (Optional if ALLOWED_CATEGORY_ID is set for auto-sandboxes)
  const rawWorkspaceMappings = process.env['WORKSPACE_MAPPINGS']?.trim();
  let parsedMappings: WorkspaceMappings = {};

  if (rawWorkspaceMappings) {
    try {
      const parsed = JSON.parse(rawWorkspaceMappings);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        errors.push('WORKSPACE_MAPPINGS must be a JSON object mapping Discord channel IDs to workspace paths.');
      } else {
        for (const [channelId, workspacePath] of Object.entries(parsed)) {
          if (typeof workspacePath !== 'string' || workspacePath.trim() === '') {
            errors.push(`Invalid workspace path for channel ID "${channelId}". Value must be a non-empty string.`);
          }
        }
        parsedMappings = parsed as WorkspaceMappings;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Malformed WORKSPACE_MAPPINGS JSON: ${message}`);
    }
  } else if (!rawAllowedCategoryId) {
    // If no category restriction is defined, at least one workspace mapping must be specified
    errors.push('Either WORKSPACE_MAPPINGS or ALLOWED_CATEGORY_ID must be provided to know where to execute.');
  }

  // 5. AUTO_WORKSPACES_ROOT (Root directory where auto-sandboxes are created)
  const rawAutoRoot = process.env['AUTO_WORKSPACES_ROOT']?.trim();
  const autoWorkspacesRoot = rawAutoRoot
    ? path.resolve(process.cwd(), rawAutoRoot)
    : path.resolve(process.cwd(), 'workspaces');

  // 6. HOST_PROJECTS_PATH (Optional: host directory containing existing projects to map)
  const rawHostProjects = process.env['HOST_PROJECTS_PATH']?.trim();
  const hostProjectsPath = rawHostProjects ? path.resolve(rawHostProjects) : undefined;

  // 7. COMMAND_PREFIX_BIN
  const rawCommandPrefix = process.env['COMMAND_PREFIX_BIN']?.trim();
  const commandPrefixBin = rawCommandPrefix || 'agy -p';

  // 7. Optional settings with fallback defaults
  const rawTimeout = process.env['EXECUTION_TIMEOUT_MS']?.trim();
  const executionTimeoutMs = rawTimeout ? Number.parseInt(rawTimeout, 10) : 600000;
  if (Number.isNaN(executionTimeoutMs) || executionTimeoutMs <= 0) {
    errors.push(`Invalid EXECUTION_TIMEOUT_MS: "${rawTimeout}". Must be a positive integer.`);
  }

  const rawMaxBuffer = process.env['MAX_BUFFER_BYTES']?.trim();
  const maxBufferBytes = rawMaxBuffer ? Number.parseInt(rawMaxBuffer, 10) : 15 * 1024 * 1024;
  if (Number.isNaN(maxBufferBytes) || maxBufferBytes <= 0) {
    errors.push(`Invalid MAX_BUFFER_BYTES: "${rawMaxBuffer}". Must be a positive integer.`);
  }

  const rawTypingInterval = process.env['TYPING_INTERVAL_MS']?.trim();
  const typingIntervalMs = rawTypingInterval ? Number.parseInt(rawTypingInterval, 10) : 7000;
  if (Number.isNaN(typingIntervalMs) || typingIntervalMs <= 0) {
    errors.push(`Invalid TYPING_INTERVAL_MS: "${rawTypingInterval}". Must be a positive integer.`);
  }

  // If any validation errors accumulated, crash daemon immediately
  if (errors.length > 0) {
    const errorBanner = [
      '================================================================================',
      '🚨 SINGULARITY DAEMON CONFIGURATION FATAL ERROR:',
      '================================================================================',
      ...errors.map((err) => `  ✖ ${err}`),
      '================================================================================',
      'Check your .env file or container environment variables before restarting.',
      '================================================================================',
    ].join('\n');

    console.error(errorBanner);
    throw new Error(`Singularity daemon initialization failed with ${errors.length} configuration error(s).`);
  }

  return Object.freeze({
    discordToken: rawToken as string,
    allowedUserId: rawAllowedUserId as string,
    allowedCategoryId: rawAllowedCategoryId || undefined,
    autoWorkspacesRoot,
    hostProjectsPath,
    workspaceMappings: Object.freeze(parsedMappings),
    commandPrefixBin,
    executionTimeoutMs,
    maxBufferBytes,
    typingIntervalMs,
  });
}

export const env: EnvConfig = loadAndValidateEnv();
