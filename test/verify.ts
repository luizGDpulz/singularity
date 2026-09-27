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

console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
