/**
 * scripts/inbox-triage.mjs
 *
 * Clasifica un reporte del inbox con Haiku 4.5 (multimodal).
 * Devuelve JSON: {tipo, confidence, razon}.
 *
 * Tipos:
 * - "tecnico-trivial": bug claro, fix 1-2 archivos (typos, off-by-one, NaN, tokens)
 * - "tecnico-complejo": refactor multi-archivo o decisión de arquitectura
 * - "visual": problema de diseño/UX con varias soluciones legítimas
 * - "producto": decisión de producto pura (copy, comportamiento)
 * - "ambiguo": no se puede decidir entre 2+ categorías con confianza
 *
 * Uso:
 *   node --env-file=.env.local scripts/inbox-triage.mjs \
 *     --texto="..." --caption="..." --photo=path/foto.jpg
 *
 * Spec: docs/superpowers/specs/2026-05-15-inbox-5b-consumer-design.md §3.3 PASO 2
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';

const TIPOS_VALIDOS = [
  'tecnico-trivial',
  'tecnico-complejo',
  'visual',
  'producto',
  'ambiguo',
];

const SYSTEM_PROMPT = `Sos un triage agent para reportes de bugs de Golfers+ (app de golf premium para usuarios chilenos exigentes).
Clasificás cada reporte en una de 5 categorías:

- "tecnico-trivial": bug claro y reproducible, fix de 1-2 archivos. Ejemplos: typos, off-by-one, NaN guards faltantes, falta de contraste WCAG por color hardcoded, token hardcoded fuera del design system, validaciones faltantes, errores de pluralización.
- "tecnico-complejo": bug que requiere refactor multi-archivo, cambio de arquitectura, o decisión técnica significativa. Ejemplos: race condition, problema de schema BD, performance issue, integración rota.
- "visual": problema de diseño/UX donde puede haber varias soluciones legítimas. Ejemplos: rediseñar un widget, jerarquía visual confusa, empty state inexistente, ornament infantil, AI-slop aesthetic.
- "producto": decisión de producto pura, no técnica. Ejemplos: qué muestra una pantalla cuando no hay datos, copy específico, comportamiento de feature, qué incluir/excluir.
- "ambiguo": no podés decidir entre 2+ categorías con confianza, o el reporte es incomprensible.

Respondés SIEMPRE con un único objeto JSON en este formato exacto:
{"tipo": "...", "confidence": 0.0-1.0, "razon": "1 línea explicando la clasificación"}

Reglas:
- "confidence" refleja certeza de la clasificación (0=ninguna, 1=total).
- Si dudás entre 2 categorías concretas → bajá confidence (~0.5-0.7) y elegí la más probable. NO uses "ambiguo" salvo que sean 3+ o el reporte no se entienda.
- "razon" es 1 línea concreta, en español.
- NO incluyas texto antes ni después del JSON.`;

export function parseTriageOutput(raw) {
  let cleaned = String(raw).replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1');
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('triage: no JSON found in output');
  const obj = JSON.parse(match[0]);
  if (!TIPOS_VALIDOS.includes(obj.tipo)) {
    throw new Error(`triage: tipo inválido "${obj.tipo}"`);
  }
  return {
    tipo: obj.tipo,
    confidence: Math.max(0, Math.min(1, Number(obj.confidence) || 0)),
    razon: String(obj.razon ?? ''),
  };
}

export async function triage({ texto, caption, photoPath }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const client = new Anthropic({ apiKey });

  const userText = `Texto del reporte: ${texto ?? '(vacío)'}\nCaption: ${caption ?? '(vacío)'}\n\nClasificá este reporte.`;
  const content = [{ type: 'text', text: userText }];

  if (photoPath && fs.existsSync(photoPath)) {
    const b64 = fs.readFileSync(photoPath).toString('base64');
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
    });
  }

  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  });

  const block = resp.content.find((c) => c.type === 'text');
  const raw = block && block.type === 'text' ? block.text : '';
  return parseTriageOutput(raw);
}

async function cli() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const m = a.match(/^--([^=]+)=(.*)$/);
      return m ? [m[1], m[2]] : [a, true];
    }),
  );
  const result = await triage({
    texto: args.texto || null,
    caption: args.caption || null,
    photoPath: args.photo || null,
  });
  process.stdout.write(JSON.stringify(result) + '\n');
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('inbox-triage.mjs');
if (invokedDirectly) {
  cli().catch((e) => {
    console.error('triage error:', e.message);
    process.exit(1);
  });
}
