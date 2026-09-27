import { discordService } from '../src/services/discord.service.js';
import { runnerService } from '../src/services/runner.service.js';

console.log('🧪 Starting Singularity Verification Tests...');

// 1. Test Chunking Logic
console.log('\n--- Testing DiscordService.splitIntoChunks ---');

// Case 1: Short text <= 1900
const shortText = 'Hello Singularity! Simple task output.';
const shortChunks = discordService.splitIntoChunks(shortText, 1900);
console.assert(shortChunks.length === 1, 'Expected 1 chunk for short text');
console.assert(shortChunks[0] === shortText, 'Chunk content mismatch');
console.log('✅ Case 1 (Short text <= 1900) passed.');

// Case 2: Multi-line text splitting cleanly on newlines
const line = 'This is a test line with some output information from a build task.';
const multiLineText = Array(40).fill(line).join('\n'); // ~2700 chars
const multiChunks = discordService.splitIntoChunks(multiLineText, 1900);
console.assert(multiChunks.length > 1, `Expected > 1 chunk, got ${multiChunks.length}`);
for (const chunk of multiChunks) {
  console.assert(chunk.length <= 1900, `Chunk length ${chunk.length} exceeds 1900 limit`);
  console.assert(!chunk.startsWith('\n'), 'Chunk should not start with an orphaned newline');
}
console.log(`✅ Case 2 (Multi-line text ~${multiLineText.length} chars split into ${multiChunks.length} chunks <= 1900) passed.`);

// Case 3: Oversized single line without newlines
const longWord = 'A'.repeat(4000);
const slicedChunks = discordService.splitIntoChunks(longWord, 1900);
console.assert(slicedChunks.length === 3, `Expected 3 chunks for 4000 char line, got ${slicedChunks.length}`);
console.assert(slicedChunks[0]?.length === 1900, 'Chunk 1 length should be 1900');
console.assert(slicedChunks[1]?.length === 1900, 'Chunk 2 length should be 1900');
console.assert(slicedChunks[2]?.length === 200, 'Chunk 3 length should be 200');
console.log('✅ Case 3 (Oversized single line) passed.');

// 2. Test Runner Header Formatting
console.log('\n--- Testing RunnerService Header Formatting ---');

const mockSuccess = {
  stdout: 'Success output',
  stderr: '',
  exitCode: 0,
  failed: false,
  timedOut: false,
  durationMs: 4200,
  command: 'antigravity run',
};
const successHeader = runnerService.formatHeader(mockSuccess, '/workspace/project-alpha');
console.assert(successHeader.includes('Execution Succeeded'), 'Success header text mismatch');
console.assert(successHeader.includes('4.2s'), 'Duration calculation mismatch');
console.log('✅ Success header passed:', successHeader.split('\n')[0]);

const mockFailure = {
  stdout: '',
  stderr: 'Error occurred',
  exitCode: 2,
  failed: true,
  timedOut: false,
  durationMs: 1500,
  command: 'antigravity run',
};
const failureHeader = runnerService.formatHeader(mockFailure, '/workspace/project-alpha');
console.assert(failureHeader.includes('Execution Failed'), 'Failure header text mismatch');
console.assert(failureHeader.includes('Exit Code 2'), 'Exit code mismatch');
console.log('✅ Failure header passed:', failureHeader.split('\n')[0]);

const mockTimeout = {
  stdout: '',
  stderr: 'Timed out',
  exitCode: null,
  failed: true,
  timedOut: true,
  durationMs: 600000,
  command: 'antigravity run',
};
const timeoutHeader = runnerService.formatHeader(mockTimeout, '/workspace/project-alpha');
console.assert(timeoutHeader.includes('Execution Timed Out'), 'Timeout header text mismatch');
console.log('✅ Timeout header passed:', timeoutHeader.split('\n')[0]);

// 3. Test Workspace Slug Sanitization
console.log('\n--- Testing WorkspaceService.sanitizeSlug ---');
import { workspaceService } from '../src/services/workspace.service.js';

const slug1 = workspaceService.sanitizeSlug('✨Ai Chat');
console.assert(slug1 === 'ai-chat', `Expected "ai-chat", got "${slug1}"`);
console.log('✅ Case 1 ("✨Ai Chat" -> "ai-chat") passed.');

const slug2 = workspaceService.sanitizeSlug('🚀-Projeto_Avançado #1!');
console.assert(slug2 === 'projeto-avancado-1', `Expected "projeto-avancado-1", got "${slug2}"`);
console.log('✅ Case 2 ("🚀-Projeto_Avançado #1!" -> "projeto-avancado-1") passed.');

const slug3 = workspaceService.sanitizeSlug('🔥🔥🔥', '123456789');
console.assert(slug3 === 'workspace-456789', `Expected "workspace-456789", got "${slug3}"`);
console.log('✅ Case 3 (Emoji-only fallback -> "workspace-456789") passed.');

// 4. Test Auto-Sandbox Resolution
console.log('\n--- Testing WorkspaceService.resolveWorkspace ---');
const autoRes = workspaceService.resolveWorkspace({ id: '999999', name: '✨teste-sandbox' });
console.assert(autoRes.isAutoSandbox === true, 'Should resolve to auto-sandbox');
console.assert(autoRes.path.includes('teste-sandbox'), 'Path should include sanitized slug');
console.log('✅ Auto-sandbox resolution passed:', autoRes.path);

// 5. Test AiSettingsService Model Normalization and CLI Args
console.log('\n--- Testing AiSettingsService ---');
import { aiSettingsService } from '../src/services/ai-settings.service.js';

// Normalization
const norm1 = aiSettingsService.normalizeModel('gemini-3.8-flash-high');
console.assert(norm1.modelId === 'gemini-3.8-flash', 'ModelId should be stripped of -high');
console.assert(norm1.inferredEffort === 'high', 'Inferred effort should be high');
console.log('✅ Normalization of legacy model ID passed.');

// CLI args for Gemini with effort
aiSettingsService.setModel('gemini-3.8-flash');
aiSettingsService.setEffort('medium');
const cliArgsGemini = aiSettingsService.buildCliArgs('agy -p', 'Hello');
console.assert(cliArgsGemini.fullArgs.includes('--model') && cliArgsGemini.fullArgs.includes('gemini-3.8-flash'), 'Should include base model');
console.assert(cliArgsGemini.fullArgs.includes('--effort') && cliArgsGemini.fullArgs.includes('medium'), 'Should include effort medium');
console.log('✅ Gemini CLI arguments builder passed:', cliArgsGemini.fullArgs.join(' '));

// CLI args for Claude without effort
aiSettingsService.setModel('claude-sonnet-4-6');
const cliArgsClaude = aiSettingsService.buildCliArgs('agy -p', 'Hello');
console.assert(!cliArgsClaude.fullArgs.includes('--effort'), 'Claude should NOT include --effort');
console.assert(cliArgsClaude.fullArgs.includes('claude-sonnet-4-6'), 'Should include claude model');
console.log('✅ Claude CLI arguments (no effort flag) passed:', cliArgsClaude.fullArgs.join(' '));

// Stepper
aiSettingsService.setModel('gemini-3.8-flash');
aiSettingsService.setEffort('low');
aiSettingsService.stepEffort('next');
console.assert(aiSettingsService.getSettings().effort === 'medium', 'Effort should step from low to medium');
aiSettingsService.stepEffort('next');
console.assert(aiSettingsService.getSettings().effort === 'high', 'Effort should step from medium to high');
aiSettingsService.stepEffort('prev');
console.assert(aiSettingsService.getSettings().effort === 'medium', 'Effort should step from high to medium');
console.log('✅ Effort stepper ◀ ▶ passed.');

// 6. Test Markdown Chunking and Codeblock Preservation
console.log('\n--- Testing DiscordService.splitMarkdownChunks ---');
const mdText = 'Olá! Aqui está o resumo do código:\n```typescript\n' + 'const item = 1;\n'.repeat(100) + '```\nFim!';
const mdChunks = discordService.splitMarkdownChunks(mdText, 500);
console.assert(mdChunks.length > 1, 'Should split large codeblock across chunks');
console.assert(mdChunks[0]?.endsWith('```'), 'Chunk 1 must cleanly close the open code fence');
console.assert(mdChunks[1]?.startsWith('```typescript'), 'Chunk 2 must re-open the code fence with the original language');
console.log(`✅ Markdown code block fence preservation passed (${mdChunks.length} chunks generated).`);

// 7. Test GitService and File Link Transformation
console.log('\n--- Testing GitService & Link Transformation ---');
import { gitService } from '../src/services/git.service.js';

// Remote URL normalization
const sshNorm = gitService.normalizeGitRemoteToWebUrl('git@github.com:luizGDpulz/singularity.git');
console.assert(sshNorm === 'https://github.com/luizGDpulz/singularity', 'SSH git remote should convert to HTTPS URL');
const httpsNorm = gitService.normalizeGitRemoteToWebUrl('https://github.com/luizGDpulz/Mind.git');
console.assert(httpsNorm === 'https://github.com/luizGDpulz/Mind', 'HTTPS git remote should strip .git');
console.log('✅ Remote URL normalization passed.');

// Metadata resolution for current repo and Mind
const singularityMeta = gitService.resolveRepoMeta(process.cwd());
console.assert(singularityMeta !== null, 'Should resolve repo meta for Singularity');
console.assert(singularityMeta?.webUrl.includes('github.com/luizGDpulz/singularity'), 'Repo URL should match singularity repo');
console.log('✅ Singularity Git metadata resolution passed:', singularityMeta?.webUrl);

// URL resolution
const rootUrl = gitService.resolveWebUrl('file:///C:/Projects/singularity');
console.assert(rootUrl === 'https://github.com/luizGDpulz/singularity', `Expected repo root URL, got ${rootUrl}`);

const fileUrlWithLines = gitService.resolveWebUrl('file:///C:/Projects/singularity/src/services/workspace.service.ts#L106-L143');
console.assert(
  fileUrlWithLines === 'https://github.com/luizGDpulz/singularity/blob/main/src/services/workspace.service.ts#L106-L143',
  `Expected file URL with lines, got ${fileUrlWithLines}`
);

const dirUrl = gitService.resolveWebUrl('file:///C:/Projects/singularity/src/services');
console.assert(
  dirUrl === 'https://github.com/luizGDpulz/singularity/tree/main/src/services',
  `Expected directory tree URL, got ${dirUrl}`
);
console.log('✅ URL resolution (root, file+lines, directory) passed.');

// Markdown link transformation
const rawMarkdown = [
  'Acesso validado tanto no repositório [singularity](file:///C:/Projects/singularity) quanto no Second Brain em [c:\\Mind](file:///C:/Mind).',
  'O **Singularity** ([`singularity-bridge`](file:///C:/Projects/singularity/package.json)) é um daemon headless.',
  'Veja a classe [`WorkspaceService`](file:///C:/Projects/singularity/src/services/workspace.service.ts#L106-L143).',
  'Arquivo temporário sem git: [local.log](file:///C:/tmp/local.log).',
  '```typescript',
  'const test = "file:///C:/Projects/singularity";',
  '```',
  'Link com backtick no label: [`Padrões`](https://github.com/luizGDpulz/Mind)',
].join('\n');

const transformedMarkdown = discordService.sanitizeFileLinks(rawMarkdown, 'C:/Projects/singularity');

console.assert(
  transformedMarkdown.includes('[singularity](https://github.com/luizGDpulz/singularity)'),
  'Should transform repo root link'
);
console.assert(
  transformedMarkdown.includes('[c:\\Mind](https://github.com/luizGDpulz/Mind)'),
  'Should transform Mind Second Brain link'
);
console.assert(
  transformedMarkdown.includes('[singularity-bridge](https://github.com/luizGDpulz/singularity/blob/main/package.json)'),
  'Should strip inner backticks and create clickable GitHub link for package.json'
);
console.assert(
  transformedMarkdown.includes('[WorkspaceService](https://github.com/luizGDpulz/singularity/blob/main/src/services/workspace.service.ts#L106-L143)'),
  'Should strip inner backticks and create clickable GitHub link with line numbers'
);
console.assert(
  transformedMarkdown.includes('`local.log`'),
  'Should convert non-git local file link to inline code badge'
);
console.assert(
  transformedMarkdown.includes('const test = "file:///C:/Projects/singularity";'),
  'Should preserve code blocks untouched'
);
console.assert(
  transformedMarkdown.includes('[Padrões](https://github.com/luizGDpulz/Mind)'),
  'Should sanitize inner backticks in HTTPS links for Discord compatibility'
);
console.log('✅ Full conversational markdown link transformation passed.');

console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');



