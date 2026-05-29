/**
 * parse-structural.mjs — Convierte texto de PDF de reglas a chunks estructurados
 * con breadcrumb jerárquico Rule > Sub-rule > Paragraph.
 *
 * Estrategia:
 *   - Detecta encabezados "Rule N", "N.M", "N.Ma-z" en líneas standalone.
 *   - Cada chunk hereda su breadcrumb de la última jerarquía vista.
 *   - Chunks > 800 tokens se splittean por párrafos preservando breadcrumb.
 *   - Fallback genérico: si el texto no tiene estructura USGA/R&A reconocible,
 *     splittea por tamaño (~500 tokens, overlap 50) con `rule_anchor = null`.
 */
import { createHash } from 'node:crypto';

const APPROX_TOKENS_PER_CHAR = 0.25; // ~4 chars/token
const MAX_TOKENS_PER_CHUNK = 800;
const FALLBACK_CHUNK_TOKENS = 500;
const FALLBACK_OVERLAP_TOKENS = 50;

const RULE_RE = /^Rule\s+(\d+)\s*$/;
const SUBRULE_RE = /^(\d+)\.(\d+)\s*$/;
const PARAGRAPH_RE = /^(\d+)\.(\d+)([a-z])\s*$/;

export function estimateTokens(text) {
  return Math.ceil(text.length * APPROX_TOKENS_PER_CHAR);
}

function hashChunk(breadcrumb, content) {
  return createHash('sha256').update(`${breadcrumb}\n${content}`).digest('hex').slice(0, 16);
}

/**
 * Parse estructural — detecta Rule N > N.M > N.Ma-z.
 */
function parseHierarchical(text) {
  const lines = text.split(/\r?\n/);
  const chunks = [];
  let currentRule = null;
  let currentSub = null;
  let currentPara = null;
  let buffer = [];

  const flush = () => {
    const content = buffer.join('\n').trim();
    buffer = [];
    if (!content) return;
    const breadcrumb = currentPara
      ? `Rule ${currentRule} > ${currentSub} > ${currentPara}`
      : currentSub
        ? `Rule ${currentRule} > ${currentSub}`
        : currentRule
          ? `Rule ${currentRule}`
          : 'Preamble';
    const ruleAnchor = currentPara ?? currentSub ?? (currentRule ? `Rule ${currentRule}` : null);

    const pushPiece = (piece) => {
      const trimmed = piece.trim();
      if (!trimmed) return;
      chunks.push({
        breadcrumb,
        ruleAnchor,
        content: trimmed,
        chunkHash: hashChunk(breadcrumb, trimmed),
        tokenCount: estimateTokens(trimmed),
      });
    };

    // Splittea un párrafo que de por sí excede el máximo
    const splitLongParagraph = (p) => {
      const charsPerChunk = MAX_TOKENS_PER_CHUNK / APPROX_TOKENS_PER_CHAR;
      const pieces = [];
      for (let i = 0; i < p.length; i += charsPerChunk) {
        pieces.push(p.slice(i, i + charsPerChunk));
      }
      return pieces;
    };

    if (estimateTokens(content) <= MAX_TOKENS_PER_CHUNK) {
      pushPiece(content);
    } else {
      // Split por párrafos (doble newline)
      const paragraphs = content.split(/\n\s*\n/);
      let acc = '';
      for (const p of paragraphs) {
        // Si el párrafo solo ya excede el máximo, hay que partirlo
        if (estimateTokens(p) > MAX_TOKENS_PER_CHUNK) {
          if (acc.trim()) {
            pushPiece(acc);
            acc = '';
          }
          for (const sub of splitLongParagraph(p)) {
            pushPiece(sub);
          }
          continue;
        }
        const next = acc ? acc + '\n\n' + p : p;
        if (estimateTokens(next) > MAX_TOKENS_PER_CHUNK && acc) {
          pushPiece(acc);
          acc = p;
        } else {
          acc = next;
        }
      }
      if (acc.trim()) pushPiece(acc);
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const ruleMatch = trimmed.match(RULE_RE);
    const paraMatch = trimmed.match(PARAGRAPH_RE);
    const subMatch = trimmed.match(SUBRULE_RE);

    if (ruleMatch) {
      flush();
      currentRule = ruleMatch[1];
      currentSub = null;
      currentPara = null;
    } else if (paraMatch) {
      flush();
      currentRule = paraMatch[1];
      currentSub = `${paraMatch[1]}.${paraMatch[2]}`;
      currentPara = `${paraMatch[1]}.${paraMatch[2]}${paraMatch[3]}`;
    } else if (subMatch) {
      flush();
      currentRule = subMatch[1];
      currentSub = `${subMatch[1]}.${subMatch[2]}`;
      currentPara = null;
    } else {
      buffer.push(line);
    }
  }
  flush();

  return chunks;
}

/**
 * Fallback: split por tamaño con overlap, sin estructura.
 */
function parseFallback(text, docTitle) {
  const chunks = [];
  const charsPerChunk = FALLBACK_CHUNK_TOKENS / APPROX_TOKENS_PER_CHAR;
  const overlapChars = FALLBACK_OVERLAP_TOKENS / APPROX_TOKENS_PER_CHAR;
  const stride = charsPerChunk - overlapChars;

  let i = 0;
  let idx = 0;
  while (i < text.length) {
    const piece = text.slice(i, i + charsPerChunk).trim();
    if (piece) {
      const breadcrumb = `${docTitle} > chunk ${idx + 1}`;
      chunks.push({
        breadcrumb,
        ruleAnchor: null,
        content: piece,
        chunkHash: hashChunk(breadcrumb, piece),
        tokenCount: estimateTokens(piece),
      });
      idx++;
    }
    i += stride;
  }
  return chunks;
}

/**
 * Entry point.
 *
 * @param {string} text — texto extraído del PDF.
 * @param {{ docTitle: string, forceFallback?: boolean }} opts
 * @returns {Array<{ breadcrumb: string, ruleAnchor: string|null, content: string, chunkHash: string, tokenCount: number }>}
 */
export function parseStructural(text, opts = {}) {
  if (!text || text.trim().length === 0) return [];
  const docTitle = opts.docTitle ?? 'Document';

  if (opts.forceFallback) {
    return parseFallback(text, docTitle);
  }

  const structured = parseHierarchical(text);

  // Si no encontró ningún Rule/Sub-rule, usar fallback
  const hasStructure = structured.some(
    (c) => c.ruleAnchor && (c.ruleAnchor.includes('.') || c.ruleAnchor.startsWith('Rule '))
  );
  if (!hasStructure) {
    return parseFallback(text, docTitle);
  }

  return structured;
}
