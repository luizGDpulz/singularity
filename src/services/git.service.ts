import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface GitRepoMeta {
  rootDir: string;
  webUrl: string;
  branch: string;
}

export class GitService {
  private repoCache = new Map<string, GitRepoMeta | null>();

  /**
   * Normalizes a Git remote URL into a clean HTTP/HTTPS web URL.
   * Handles SSH (git@github.com:user/repo.git), SSH protocol (ssh://git@...), and HTTPS URLs.
   */
  public normalizeGitRemoteToWebUrl(rawRemote: string): string | null {
    let clean = rawRemote.trim();
    if (!clean) return null;

    // Convert SSH shorthand: git@github.com:owner/repo.git -> https://github.com/owner/repo.git
    clean = clean.replace(/^git@([^:]+):/, 'https://$1/');

    // Convert SSH protocol: ssh://git@github.com/owner/repo.git -> https://github.com/owner/repo.git
    clean = clean.replace(/^ssh:\/\/git@([^/]+)\//, 'https://$1/');

    // Strip trailing .git
    clean = clean.replace(/\.git$/, '');

    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      return clean;
    }

    return null;
  }

  /**
   * Resolves the Git repository metadata (root dir, remote web URL, and branch)
   * for a given filesystem path or directory.
   */
  public resolveRepoMeta(targetPath: string): GitRepoMeta | null {
    if (!targetPath) return null;

    // Normalize slashes
    const normalized = targetPath.replace(/\\/g, '/');

    // Determine directory to inspect
    let searchDir = normalized;
    try {
      if (fs.existsSync(normalized)) {
        if (!fs.statSync(normalized).isDirectory()) {
          searchDir = path.dirname(normalized).replace(/\\/g, '/');
        }
      } else {
        searchDir = path.dirname(normalized).replace(/\\/g, '/');
      }
    } catch {
      searchDir = path.dirname(normalized).replace(/\\/g, '/');
    }

    const cacheKey = searchDir.toLowerCase();
    if (this.repoCache.has(cacheKey)) {
      return this.repoCache.get(cacheKey) ?? null;
    }

    try {
      const rawRoot = execSync('git rev-parse --show-toplevel', {
        cwd: searchDir,
        stdio: ['pipe', 'pipe', 'ignore'],
      })
        .toString()
        .trim();

      const rootDir = rawRoot.replace(/\\/g, '/');
      const rootCacheKey = rootDir.toLowerCase();

      if (this.repoCache.has(rootCacheKey)) {
        const cached = this.repoCache.get(rootCacheKey) ?? null;
        this.repoCache.set(cacheKey, cached);
        return cached;
      }

      const rawRemote = execSync('git config --get remote.origin.url', {
        cwd: rootDir,
        stdio: ['pipe', 'pipe', 'ignore'],
      })
        .toString()
        .trim();

      const webUrl = this.normalizeGitRemoteToWebUrl(rawRemote);
      if (!webUrl) {
        this.repoCache.set(cacheKey, null);
        this.repoCache.set(rootCacheKey, null);
        return null;
      }

      let branch = 'main';
      try {
        const abbrev = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: rootDir,
          stdio: ['pipe', 'pipe', 'ignore'],
        })
          .toString()
          .trim();

        if (abbrev && abbrev !== 'HEAD') {
          branch = abbrev;
        } else if (abbrev === 'HEAD') {
          const sha = execSync('git rev-parse --short HEAD', {
            cwd: rootDir,
            stdio: ['pipe', 'pipe', 'ignore'],
          })
            .toString()
            .trim();
          branch = sha || 'main';
        }
      } catch {
        branch = 'main';
      }

      const meta: GitRepoMeta = {
        rootDir,
        webUrl,
        branch,
      };

      this.repoCache.set(cacheKey, meta);
      this.repoCache.set(rootCacheKey, meta);
      return meta;
    } catch {
      this.repoCache.set(cacheKey, null);
      return null;
    }
  }

  /**
   * Converts a local file or directory URL/path (e.g. file:///C:/Projects/... or C:/Projects/...)
   * with optional #L10-L20 fragment to a web URL if it belongs to a Git repo with a remote.
   */
  public resolveWebUrl(rawUrlOrPath: string, workspaceHint?: string): string | null {
    if (!rawUrlOrPath) return null;

    // 1. Separate hash fragment (#L10-L20)
    const [rawUri, fragment] = rawUrlOrPath.split('#');
    if (!rawUri) return null;

    // 2. Normalize file URI to OS path
    let pathPart = decodeURIComponent(rawUri.replace(/^file:\/\//i, ''));
    if (/^\/[a-zA-Z]:/.test(pathPart)) {
      pathPart = pathPart.slice(1);
    }
    pathPart = pathPart.replace(/\\/g, '/');

    // 3. Resolve Git repo metadata
    let meta: GitRepoMeta | null = null;
    if (workspaceHint) {
      const hintNorm = workspaceHint.replace(/\\/g, '/');
      if (pathPart.toLowerCase().startsWith(hintNorm.toLowerCase())) {
        meta = this.resolveRepoMeta(hintNorm);
      }
    }

    if (!meta) {
      meta = this.resolveRepoMeta(pathPart);
    }

    if (!meta) {
      return null;
    }

    // 4. Map path inside the repo
    const normTarget = pathPart.toLowerCase();
    const normRoot = meta.rootDir.toLowerCase();

    // Case A: The path is the repository root itself
    if (normTarget === normRoot) {
      return meta.webUrl;
    }

    // Case B: The path is inside the repository
    if (normTarget.startsWith(`${normRoot}/`)) {
      const relativePath = pathPart.slice(meta.rootDir.length + 1);

      let isDirectory = false;
      try {
        if (fs.existsSync(pathPart)) {
          isDirectory = fs.statSync(pathPart).isDirectory();
        } else {
          // If file not currently on disk, infer by lack of file extension
          isDirectory = !path.extname(pathPart);
        }
      } catch {
        isDirectory = !path.extname(pathPart);
      }

      if (isDirectory) {
        return `${meta.webUrl}/tree/${meta.branch}/${relativePath}`;
      }

      const lineHash = fragment ? `#${fragment}` : '';
      return `${meta.webUrl}/blob/${meta.branch}/${relativePath}${lineHash}`;
    }

    return null;
  }

  /**
   * Transforms markdown text by converting unclickable file:// links into:
   * 1. Real, clickable web URLs (GitHub/GitLab) if inside a tracked repository.
   * 2. Clean inline code badges (`filename` or `label`) if local without remote.
   * 3. Cleans any backticks from markdown link labels so Discord's parser recognizes the hyperlink.
   * 4. Preserves fenced code blocks (```...```) untouched.
   */
  public transformFileLinks(markdown: string, workspaceHint?: string): string {
    if (!markdown) return markdown;

    // Step 1: Stash fenced code blocks so we don't modify code snippets
    const codeBlocks: string[] = [];
    const fencePlaceholder = '%%CODE_FENCE_BLOCK_';
    const textWithoutFences = markdown.replace(/```[\s\S]*?```/g, (match) => {
      const token = `${fencePlaceholder}${codeBlocks.length}%%`;
      codeBlocks.push(match);
      return token;
    });

    // Step 2: Transform Markdown links with file:// scheme: [Label](file://...)
    // Also handles backticks inside label: [`Symbol`](file://...)
    const linkRegex = /\[([^\]]+)\]\((file:\/\/[^\s\)]+)\)/gi;
    let transformed = textWithoutFences.replace(linkRegex, (_match, label: string, url: string) => {
      // Strip backticks inside label so Discord can render as a clickable hyperlink
      const cleanLabel = label.replace(/`/g, '').trim() || label;
      const webUrl = this.resolveWebUrl(url, workspaceHint);

      if (webUrl) {
        return `[${cleanLabel}](${webUrl})`;
      }

      // If no git remote or local path, convert to clean inline code badge
      return `\`${cleanLabel}\``;
    });

    // Step 3: Transform any raw unlinked file:// URLs: file:///C:/...
    const rawFileRegex = /(?<!\[)(?<!\()(file:\/\/[^\s\)\],<]+)/gi;
    transformed = transformed.replace(rawFileRegex, (_match, rawUrl: string) => {
      const webUrl = this.resolveWebUrl(rawUrl, workspaceHint);
      if (webUrl) {
        return `<${webUrl}>`;
      }
      // Wrap local path in inline backticks
      const cleanPath = decodeURIComponent(rawUrl.replace(/^file:\/\/\/?/i, ''));
      return `\`${cleanPath}\``;
    });

    // Step 4: Fix Discord markdown bug for HTTP/HTTPS links having backticks inside label:
    // e.g. [`ClassName`](https://...) -> [ClassName](https://...)
    transformed = transformed.replace(
      /\[`+([^`\]]+)`+\]\((https?:\/\/[^\s\)]+)\)/gi,
      '[$1]($2)'
    );

    // Step 5: Restore fenced code blocks
    const restored = transformed.replace(
      new RegExp(`${fencePlaceholder}(\\d+)%%`, 'g'),
      (_match, idxStr: string) => {
        const idx = Number(idxStr);
        return codeBlocks[idx] ?? '';
      }
    );

    return restored;
  }
}

export const gitService = new GitService();
