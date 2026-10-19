#!/usr/bin/env node
/**
 * scripts/ceo/budget-hook.mjs — hook PostToolUse de los agentes nocturnos: le dice al agente cuánto
 * presupuesto lleva, en qué fase está y si está dando vueltas en círculo (Fase 1, 15-oct-2026).
 *
 * El runner (runner.mjs) mide la sesión desde el stream-json y escribe el estado en CEO_BUDGET_FILE.
 * Este hook solo lo lee y, cuando hay algo NUEVO que decir (cambio de fase, cada 25 % o una alerta del
 * detector de bucles), lo inyecta como additionalContext. Lo ya dicho se anota en <archivo>.shown
 * para no repetirlo en cada llamada.
 *
 * Sin CEO_BUDGET_FILE (sesiones interactivas) o ante cualquier error: sale en silencio. Un hook
 * nunca debe romper la sesión.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PHASES } from './budget.mjs';

/** Puro: qué decir dado el estado y lo ya dicho. → { text, shown } | null */
export function hookMessage(status, shown = {}) {
  if (!status || !(status.budgetUsd > 0)) return null;
  const pctNow = Math.round(status.fraction * 100);
  const quarter = Math.min(4, Math.floor(status.fraction * 4));
  const phase = PHASES.find(p => p.key === status.phase) ?? PHASES[0];
  const lines = [];
  const next = { ...shown };

  if (status.alert && status.alert.seq !== shown.alertSeq) {
    next.alertSeq = status.alert.seq;
    lines.push(status.alert.level === 'corte'
      ? `⛔ Sesión detenida: ${status.alert.detail}.`
      : `⚠️ Vueltas en círculo: ${status.alert.detail}. Cambia de enfoque o cierra (commit + PR + pendientes). Si sigue igual, la sesión se corta.`);
  }
  if (phase.key !== shown.phase || quarter !== shown.quarter) {
    next.phase = phase.key;
    next.quarter = quarter;
    if (shown.phase !== undefined || pctNow >= 25) {
      lines.push(`💰 Presupuesto: llevas ${pctNow} % (US$${status.usd.toFixed(1)} de US$${status.budgetUsd.toFixed(1)}). Fase ${phase.key.toUpperCase()}: ${phase.text}.`);
    }
  }
  if (!lines.length) return null;
  return { text: lines.join('\n'), shown: next };
}

if (process.argv[1]?.endsWith('budget-hook.mjs')) {
  try {
    const file = process.env.CEO_BUDGET_FILE;
    if (file) {
      const status = JSON.parse(readFileSync(file, 'utf8'));
      let shown = {};
      try { shown = JSON.parse(readFileSync(`${file}.shown`, 'utf8')); } catch { /* primera vez */ }
      const msg = hookMessage(status, shown);
      if (msg) {
        writeFileSync(`${file}.shown`, JSON.stringify(msg.shown));
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg.text } }));
      }
    }
  } catch { /* silencio: nunca romper la sesión */ }
  process.exit(0);
}
