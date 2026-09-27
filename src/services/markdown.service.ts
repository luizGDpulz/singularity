import { gitService } from './git.service.js';

export class MarkdownService {
  /**
   * Unicode superscript map for digits, signs, and common algebraic variables.
   */
  private static readonly SUPERSCRIPTS: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
    '+': '⁺',
    '-': '⁻',
    '=': '⁼',
    '(': '⁽',
    ')': '⁾',
    'n': 'ⁿ',
    'i': 'ⁱ',
  };

  /**
   * Unicode subscript map for digits, signs, and common indices.
   */
  private static readonly SUBSCRIPTS: Record<string, string> = {
    '0': '₀',
    '1': '₁',
    '2': '₂',
    '3': '₃',
    '4': '₄',
    '5': '₅',
    '6': '₆',
    '7': '₇',
    '8': '₈',
    '9': '₉',
    '+': '₊',
    '-': '₋',
    '=': '₌',
    '(': '₍',
    ')': '₎',
    'a': 'ₐ',
    'e': 'ₑ',
    'h': 'ₕ',
    'i': 'ᵢ',
    'j': 'ⱼ',
    'k': 'ₖ',
    'l': 'ₗ',
    'm': 'ₘ',
    'n': 'ₙ',
    'o': 'ₒ',
    'p': 'ₚ',
    'r': 'ᵣ',
    's': 'ₛ',
    't': 'ₜ',
    'u': 'ᵤ',
    'v': 'ᵥ',
    'x': 'ₓ',
  };

  /**
   * LaTeX symbol translations to clean Unicode characters.
   */
  private static readonly LATEX_SYMBOLS: [RegExp, string][] = [
    // Arrows
    [/\\(?:iff|Leftrightarrow)/g, '⇔'],
    [/\\(?:implies|Rightarrow)/g, '⇒'],
    [/\\Leftarrow/g, '⇐'],
    [/\\(?:to|rightarrow)/g, '→'],
    [/\\leftarrow/g, '←'],
    [/\\leftrightarrow/g, '↔'],

    // Relations & Comparison
    [/\\(?:approx|thickapprox)/g, '≈'],
    [/\\sim/g, '~'],
    [/\\(?:le|leq)/g, '≤'],
    [/\\(?:ge|geq)/g, '≥'],
    [/\\(?:ne|neq)/g, '≠'],
    [/\\ll/g, '≪'],
    [/\\gg/g, '≫'],
    [/\\pm/g, '±'],
    [/\\mp/g, '∓'],
    [/\\times/g, '×'],
    [/\\cdot/g, '·'],
    [/\\div/g, '÷'],

    // Sets & Logic
    [/\\in/g, '∈'],
    [/\\notin/g, '∉'],
    [/\\subset(?:eq)?/g, '⊆'],
    [/\\supset(?:eq)?/g, '⊇'],
    [/\\cup/g, '∪'],
    [/\\cap/g, '∩'],
    [/\\emptyset/g, '∅'],
    [/\\infty/g, '∞'],
    [/\\forall/g, '∀'],
    [/\\exists/g, '∃'],
    [/\\neg/g, '¬'],

    // Calculus / Algebra
    [/\\sum/g, '∑'],
    [/\\prod/g, '∏'],
    [/\\int/g, '∫'],
    [/\\partial/g, '∂'],
    [/\\nabla/g, '∇'],

    // Number sets
    [/\\mathbb\{R\}|\\mathbf\{R\}/g, 'ℝ'],
    [/\\mathbb\{N\}|\\mathbf\{N\}/g, 'ℕ'],
    [/\\mathbb\{Z\}|\\mathbf\{Z\}/g, 'ℤ'],
    [/\\mathbb\{Q\}|\\mathbf\{Q\}/g, 'ℚ'],
    [/\\mathbb\{C\}|\\mathbf\{C\}/g, 'ℂ'],

    // Ellipsis & braces
    [/\\(?:dots|ldots|cdots|ddots|vdots)/g, '...'],
    [/\\\{/g, '{'],
    [/\\\}/g, '}'],

    // Spacing
    [/\\(?:quad|qquad|[;,!])/g, ' '],

    // Greek lowercase
    [/\\alpha/g, 'α'],
    [/\\beta/g, 'β'],
    [/\\gamma/g, 'γ'],
    [/\\delta/g, 'δ'],
    [/\\epsilon|\\varepsilon/g, 'ε'],
    [/\\zeta/g, 'ζ'],
    [/\\eta/g, 'η'],
    [/\\theta|\\vartheta/g, 'θ'],
    [/\\iota/g, 'ι'],
    [/\\kappa/g, 'κ'],
    [/\\lambda/g, 'λ'],
    [/\\mu/g, 'μ'],
    [/\\nu/g, 'ν'],
    [/\\xi/g, 'ξ'],
    [/\\pi|\\varpi/g, 'π'],
    [/\\rho|\\varrho/g, 'ρ'],
    [/\\sigma|\\varsigma/g, 'σ'],
    [/\\tau/g, 'τ'],
    [/\\upsilon/g, 'υ'],
    [/\\phi|\\varphi/g, 'φ'],
    [/\\chi/g, 'χ'],
    [/\\psi/g, 'ψ'],
    [/\\omega/g, 'ω'],

    // Greek uppercase
    [/\\Gamma/g, 'Γ'],
    [/\\Delta/g, 'Δ'],
    [/\\Theta/g, 'Θ'],
    [/\\Lambda/g, 'Λ'],
    [/\\Xi/g, 'Ξ'],
    [/\\Pi/g, 'Π'],
    [/\\Sigma/g, 'Σ'],
    [/\\Upsilon/g, 'Υ'],
    [/\\Phi/g, 'Φ'],
    [/\\Psi/g, 'Ψ'],
    [/\\Omega/g, 'Ω'],
  ];

  /**
   * Converts a LaTeX mathematical expression into a clean, human-readable Unicode representation.
   */
  public latexToUnicode(latex: string): string {
    let expr = latex.trim();
    if (!expr) return '';

    // 1. Delimiter sizing: \left\lfloor ... \right\rfloor -> \lfloor ... \rfloor
    expr = expr.replace(/\\left\./g, '');
    expr = expr.replace(/\\right\./g, '');
    expr = expr.replace(/\\left([(\[{|])/g, '$1');
    expr = expr.replace(/\\right([)\]}|])/g, '$1');
    expr = expr.replace(/\\(?:left|right)\b/g, '');

    // 2. Floors and Ceils
    expr = expr.replace(/\\lfloor\s*([\s\S]*?)\s*\\rfloor/g, '⌊$1⌋');
    expr = expr.replace(/\\lceil\s*([\s\S]*?)\s*\\rceil/g, '⌈$1⌉');

    // 3. Roots: \sqrt[n]{x} -> n√(x) or \sqrt{x} -> √x
    expr = expr.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, '$1√($2)');
    expr = expr.replace(/\\sqrt\{([^}]+)\}/g, (_m, inner: string) => {
      const clean = inner.trim();
      return clean.length <= 3 && !clean.includes(' ') ? `√${clean}` : `√(${clean})`;
    });

    // 4. Fractions: \frac{a}{b} -> a/b
    expr = expr.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, (_m, a: string, b: string) => {
      const cleanA = a.trim();
      const cleanB = b.trim();
      if (cleanA.length <= 4 && cleanB.length <= 4 && !cleanA.includes(' ') && !cleanB.includes(' ')) {
        return `${cleanA}/${cleanB}`;
      }
      return `(${cleanA} / ${cleanB})`;
    });

    // 5. Fonts and style wrappers: \mathcal{O}, \mathbf{x}, \text{...}
    expr = expr.replace(/\\mathcal\{([a-zA-Z])\}/g, '$1');
    expr = expr.replace(/\\(?:mathbf|mathit|mathrm|text|operatorname|mathrm)\{([^}]+)\}/g, '$1');

    // 6. Common functions: \log, \ln, \sin, \cos, etc.
    expr = expr.replace(/\\(log|ln|exp|sin|cos|tan|min|max|gcd|lcm|det|deg|lim)\b/g, '$1');

    // 7. Symbol replacements
    for (const [regex, replacement] of MarkdownService.LATEX_SYMBOLS) {
      expr = expr.replace(regex, replacement);
    }

    // 8. Superscripts: ^{14} -> ¹⁴, ^3 -> ³
    expr = expr.replace(/\^{([0-9+\-nNi()=]+)}/g, (_m, content: string) => {
      let mapped = '';
      for (const char of content) {
        mapped += MarkdownService.SUPERSCRIPTS[char] ?? char;
      }
      return mapped;
    });
    expr = expr.replace(/\^([0-9+\-nNi])/g, (_m, char: string) => {
      return MarkdownService.SUPERSCRIPTS[char] ?? `^${char}`;
    });

    // 9. Subscripts: _{n-1} -> ₙ₋₁, _i -> ᵢ
    expr = expr.replace(/_{([0-9+\-aehijklmnoprstuvx()=]+)}/g, (_m, content: string) => {
      let mapped = '';
      for (const char of content) {
        mapped += MarkdownService.SUBSCRIPTS[char] ?? char;
      }
      return mapped;
    });
    expr = expr.replace(/_([0-9+\-aehijklmnoprstuvx])/g, (_m, char: string) => {
      return MarkdownService.SUBSCRIPTS[char] ?? `_${char}`;
    });

    // 10. Clean unmapped backslashes: e.g. \foo -> foo
    expr = expr.replace(/\\([a-zA-Z]+)\{([^}]+)\}/g, '$2');
    expr = expr.replace(/\\([a-zA-Z]+)/g, '$1');

    // 11. Normalize inner spaces
    expr = expr.replace(/\s+/g, ' ').trim();

    // 12. Single variable formatting: If single alphabetic letter, italicize for mathematical prose clarity
    if (/^[a-zA-Z]$/.test(expr)) {
      return `*${expr}*`;
    }

    return expr;
  }

  /**
   * Formats AI response markdown specifically for Discord:
   * 1. Protects fenced code blocks (```...```).
   * 2. Transforms file:// links into clickable GitHub URLs or inline badges (via GitService).
   * 3. Protects inline code blocks (`...`) from math substitutions.
   * 4. Normalizes unsupported Discord headings (####, #####, ###### -> ###).
   * 5. Converts LaTeX math expressions ($...$, $$...$$, \(...\), \[...\]) to clean Unicode.
   * 6. Restores inline code and fenced code blocks.
   */
  public formatForDiscord(text: string, workspaceDir?: string): string {
    if (!text) return text;

    // Step 1: Protect fenced code blocks (```...```)
    const fencedBlocks: string[] = [];
    const fencePlaceholder = '%%FENCED_BLOCK_';
    let content = text.replace(/```[\s\S]*?```/g, (match) => {
      const token = `${fencePlaceholder}${fencedBlocks.length}%%`;
      fencedBlocks.push(match);
      return token;
    });

    // Step 2: Transform links (file:// -> GitHub, clean backticks in labels)
    content = gitService.transformFileLinks(content, workspaceDir);

    // Step 3: Protect inline code blocks (`...`)
    const inlineBlocks: string[] = [];
    const inlinePlaceholder = '%%INLINE_BLOCK_';
    content = content.replace(/`([^`\n]+)`/g, (match) => {
      const token = `${inlinePlaceholder}${inlineBlocks.length}%%`;
      inlineBlocks.push(match);
      return token;
    });

    // Step 4: Normalize Discord headings: Discord only supports H1 (#), H2 (##), and H3 (###).
    // H4-H6 (####, #####, ######) are rendered as raw text in Discord. Convert to ###.
    content = content.replace(/^(#{4,6})\s+(.+)$/gm, '### $2');

    // Step 5: Convert LaTeX Math expressions
    // 5A. Block/Display Math: $$...$$ and \[...\]
    content = content.replace(/\$\$([\s\S]*?)\$\$/g, (_match, math: string) => {
      const converted = this.latexToUnicode(math);
      return `\n${converted}\n`;
    });
    content = content.replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => {
      const converted = this.latexToUnicode(math);
      return `\n${converted}\n`;
    });

    // 5B. Inline Math: $...$ and \(...\)
    // Uses negative lookahead (?!\d) to avoid matching currency like $5 or $10.
    const inlineMathRegex = /(?<!\\)\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g;
    content = content.replace(inlineMathRegex, (_match, math: string) => {
      return this.latexToUnicode(math);
    });

    content = content.replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => {
      return this.latexToUnicode(math);
    });

    // Step 6: Restore inline code blocks
    content = content.replace(
      new RegExp(`${inlinePlaceholder}(\\d+)%%`, 'g'),
      (_match, idxStr: string) => {
        const idx = Number(idxStr);
        return inlineBlocks[idx] ?? '';
      }
    );

    // Step 7: Restore fenced code blocks
    content = content.replace(
      new RegExp(`${fencePlaceholder}(\\d+)%%`, 'g'),
      (_match, idxStr: string) => {
        const idx = Number(idxStr);
        return fencedBlocks[idx] ?? '';
      }
    );

    return content;
  }
}

export const markdownService = new MarkdownService();
