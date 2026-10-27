/**
 * scripts/ceo/budget.mjs — presupuesto de cupo por agente (Fase 1, decidido con Juanjo el 15-oct-2026).
 *
 * "Como antes (4 agentes cada noche) pero que nunca más se consuman el cupo de esa forma", con
 * inteligencia y no un corte simple por % (BATS 2511.17006: el agente que SABE cuánto le queda
 * rinde más con el mismo presupuesto; EET/Fail-Fast: cortar temprano lo que no avanza).
 *
 *   - La noche tiene un pozo fijo (NIGHT_BUDGET_WEEKLY del semanal). Cada agente recibe
 *     restante / agentes que faltan: lo que uno no usa pasa a los siguientes.
 *   - El medidor estima en vivo lo gastado desde el `usage` del stream-json y lo traduce a fase
 *     (explorar → ejecutar → cerrar). El hook budget-hook.mjs se lo dice al agente.
 *   - El tope duro (HARD_CAP) es solo la red: el agente debería cerrar solo al 70 %.
 *
 * Calibración (medido 17 y 18-oct, 16 corridas):
 *   - El stream entrega `output_tokens` parciales (el primer bloque de cada mensaje), así que la
 *     estimación queda bajo el costo final: real/estimado entre 1,10 y 1,41, mediana ≈1,25.
 *   - 1 % semanal ≈ US$10,5 (18-oct: 8 corridas por US$74 subieron el semanal 29 → 36 %).
 *   Ambos se recalibran solos con lo que se va midiendo (budget-calibration.jsonl).
 *
 * Funciones puras salvo las de E/S del final (leer/escribir la calibración).
 */

import { readFileSync, appendFileSync } from 'node:fs';

export const NIGHT_BUDGET_WEEKLY = 0.05;     // pozo de la noche: 5 % del semanal (decisión 15-oct)
export const DEFAULT_USD_PER_PCT = 10.5;     // US$ por 1 % semanal (18-oct)
export const DEFAULT_STREAM_CORRECTION = 1.25;
export const MIN_AGENT_USD = 2;              // con menos no alcanza a hacer nada útil: se cierra la noche
export const HARD_CAP = 1.25;                // red: corte duro al 125 % de su presupuesto

/** Fases del presupuesto, por fracción gastada. La última es el aviso de "se acabó". */
export const PHASES = [
  { key: 'explorar', until: 0.4, text: 'explora y elige UNA cosa de alto valor' },
  { key: 'ejecutar', until: 0.7, text: 'ejecuta lo elegido; no abras frentes nuevos' },
  { key: 'cerrar', until: 1, text: 'cierra: tests, commit, PR con evidencia y archivo de pendientes. Nada nuevo' },
  { key: 'agotado', until: Infinity, text: 'presupuesto agotado: deja todo commiteado y termina en las próximas llamadas' },
];

export function phaseOf(fraction) {
  return PHASES.find(p => fraction < p.until) ?? PHASES.at(-1);
}

// US$ por token "ponderado" (input ×1, lectura de caché ×0,1, escritura 5 min ×1,25, 1 h ×2, output ×5),
// despejado de modelUsage.costUSD de las corridas del 15 al 18-oct. Modelo desconocido → el de Opus
// (el más caro medido): el medidor prefiere sobreestimar.
const USD_PER_WEIGHTED = { opus: 2.701e-6, haiku: 0.29e-6 };

export function weightedTokens(u = {}) {
  const c = u.cache_creation;
  // Sin el desglose por duración, la escritura de caché se cuenta como 1 h (la más cara: los agentes usan 1 h).
  const write5m = c ? (c.ephemeral_5m_input_tokens || 0) : 0;
  const write1h = c ? (c.ephemeral_1h_input_tokens || 0) : (u.cache_creation_input_tokens || 0);
  return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) * 0.1
    + write5m * 1.25 + write1h * 2 + (u.output_tokens || 0) * 5;
}

export function usdOf(usage, model = '') {
  return weightedTokens(usage) * (/haiku/i.test(model) ? USD_PER_WEIGHTED.haiku : USD_PER_WEIGHTED.opus);
}

/**
 * Medidor en vivo de una sesión. `ingest(evento)` con cada línea parseada del stream.
 * El stream repite el mismo mensaje una vez por bloque de contenido (mismo message.id y usage):
 * se cuenta una vez por id. Incluye los mensajes de subagentes (parent_tool_use_id).
 */
export function createMeter({ budgetUsd, correction = DEFAULT_STREAM_CORRECTION }) {
  const seen = new Set();
  let rawUsd = 0;
  let finalUsd = null;
  return {
    ingest(ev) {
      if (ev?.type === 'result' && typeof ev.total_cost_usd === 'number') finalUsd = ev.total_cost_usd;
      const m = ev?.type === 'assistant' ? ev.message : null;
      if (!m?.usage || !m.id || seen.has(m.id)) return;
      seen.add(m.id);
      rawUsd += usdOf(m.usage, m.model);
    },
    state() {
      const usd = finalUsd ?? rawUsd * correction;
      const fraction = budgetUsd > 0 ? usd / budgetUsd : 0;
      return { usd, rawUsd, finalUsd, budgetUsd, fraction, phase: phaseOf(fraction).key, overCap: fraction >= HARD_CAP };
    },
  };
}

/**
 * Presupuesto del próximo agente: lo que queda del pozo repartido entre los que faltan
 * (incluido él). null = no alcanza (la noche se cierra).
 */
export function agentBudget({ poolUsd, spentUsd, agentsLeft }) {
  const left = poolUsd - spentUsd;
  if (agentsLeft <= 0 || left < MIN_AGENT_USD) return null;
  return left / agentsLeft;
}

export function nightPoolUsd(usdPerPct = DEFAULT_USD_PER_PCT) {
  return NIGHT_BUDGET_WEEKLY * 100 * usdPerPct;
}

const median = xs => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/**
 * Calibración desde el historial. Filas:
 *   { kind: 'attempt', rawUsd, realUsd }            → corrección del stream (real/estimado)
 *   { kind: 'night', usd, sevenStart, sevenEnd }    → US$ por 1 % semanal
 * El semanal llega con 1 % de resolución: solo cuentan noches que lo subieron ≥3 puntos.
 */
export function calibrate(rows = []) {
  const ratios = rows.filter(r => r.kind === 'attempt' && r.rawUsd > 0.5 && r.realUsd > 0)
    .slice(-20).map(r => r.realUsd / r.rawUsd);
  const perPct = rows.filter(r => r.kind === 'night' && r.usd > 0 && r.sevenEnd - r.sevenStart >= 0.03)
    .slice(-7).map(r => r.usd / ((r.sevenEnd - r.sevenStart) * 100));
  const c = median(ratios);
  const p = median(perPct);
  return {
    correction: c == null ? DEFAULT_STREAM_CORRECTION : Math.min(2, Math.max(1, c)),
    usdPerPct: p == null ? DEFAULT_USD_PER_PCT : Math.min(30, Math.max(4, p)),
  };
}

export function readCalibration(file) {
  try {
    return calibrate(readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)));
  } catch { return calibrate([]); }
}

export function appendCalibration(file, row) {
  try { appendFileSync(file, JSON.stringify(row) + '\n'); } catch { /* la calibración nunca rompe la noche */ }
}

/** Bloque para el prompt del agente: cuánto tiene y cómo se reparte. */
export function budgetPromptBlock({ budgetUsd, usdPerPct }) {
  const pctTxt = (budgetUsd / usdPerPct).toFixed(1).replace('.', ',');
  return [
    '',
    '## PRESUPUESTO DE ESTA SESIÓN',
    `Tienes ~US$${budgetUsd.toFixed(1)} de cupo (≈${pctTxt} % del semanal). Lo que no uses pasa al agente siguiente.`,
    'Un aviso automático te dirá cuánto llevas y en qué fase estás. Respétalas:',
    ...PHASES.slice(0, 3).map(p => `- hasta ${Math.round(p.until * 100)} % (${p.key}): ${p.text}.`),
    `Al ${Math.round(HARD_CAP * 100)} % la sesión se corta sola (lo que no esté commiteado se pierde).`,
    'Si un aviso te dice que estás repitiendo algo sin resultado, cambia de enfoque o cierra: insistir corta la sesión.',
  ].join('\n');
}
