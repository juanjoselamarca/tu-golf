import { describe, it, expect } from 'vitest';
import { parseStructural, estimateTokens } from '../parse-structural.mjs';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, 'fixtures', 'sample-rules.txt');

describe('parseStructural', () => {
  it('extrae chunks con breadcrumb jerárquico desde fixture USGA', async () => {
    const text = await readFile(FIXTURE, 'utf8');
    const chunks = parseStructural(text, { docTitle: 'Test Rules' });

    expect(chunks.length).toBeGreaterThan(0);

    const rule1 = chunks.find((c) => c.breadcrumb === 'Rule 1');
    expect(rule1).toBeDefined();
    expect(rule1.content).toContain('General Provisions');

    const r11 = chunks.find((c) => c.breadcrumb === 'Rule 1 > 1.1');
    expect(r11).toBeDefined();
    expect(r11.ruleAnchor).toBe('1.1');

    const r11a = chunks.find((c) => c.breadcrumb === 'Rule 1 > 1.1 > 1.1a');
    expect(r11a).toBeDefined();
    expect(r11a.ruleAnchor).toBe('1.1a');

    const r2 = chunks.find((c) => c.breadcrumb === 'Rule 2');
    expect(r2).toBeDefined();
  });

  it('chunk_hash determinístico entre runs', async () => {
    const text = await readFile(FIXTURE, 'utf8');
    const c1 = parseStructural(text, { docTitle: 'T' });
    const c2 = parseStructural(text, { docTitle: 'T' });
    expect(c1.map((c) => c.chunkHash)).toEqual(c2.map((c) => c.chunkHash));
  });

  it('splittea chunks que exceden 800 tokens por párrafos', () => {
    const longParagraph = 'word '.repeat(900); // ~225 tokens
    const veryLong = (longParagraph + '\n\n').repeat(5); // ~1125 tokens combined
    const text = `Rule 1\nGeneral\n\n1.1\nScope\n${veryLong}`;
    const chunks = parseStructural(text, { docTitle: 'T' });
    const r11Chunks = chunks.filter((c) => c.breadcrumb.startsWith('Rule 1 > 1.1'));
    expect(r11Chunks.length).toBeGreaterThan(1);
    for (const c of r11Chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(900); // allow margin
    }
  });

  it('texto sin estructura cae a fallback con chunks por tamaño', () => {
    const flatText = 'This is a flat document with no rules. '.repeat(500);
    const chunks = parseStructural(flatText, { docTitle: 'Flat Doc' });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].ruleAnchor).toBeNull();
    expect(chunks[0].breadcrumb).toContain('Flat Doc');
    expect(chunks[0].breadcrumb).toContain('chunk');
  });

  it('forceFallback fuerza split por tamaño aunque haya estructura', async () => {
    const text = await readFile(FIXTURE, 'utf8');
    const chunks = parseStructural(text, { docTitle: 'X', forceFallback: true });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].ruleAnchor).toBeNull();
  });

  it('texto vacío devuelve []', () => {
    expect(parseStructural('', { docTitle: 'X' })).toEqual([]);
    expect(parseStructural('   \n  \n  ', { docTitle: 'X' })).toEqual([]);
  });

  it('estimateTokens es razonable', () => {
    expect(estimateTokens('hello world')).toBeGreaterThan(0);
    expect(estimateTokens('a'.repeat(100))).toBeGreaterThan(20);
  });
});
