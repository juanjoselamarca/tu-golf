/**
 * scripts/ceo/loops.mjs — detector de "vueltas en círculo" de un agente (Fase 1, 15-oct-2026).
 *
 * Dos señales, ambas medidas sobre las llamadas a herramientas del stream-json:
 *   - repite: la MISMA llamada (herramienta + argumentos) devuelve el MISMO resultado por
 *     REPEAT_LIMIT vez dentro de las últimas WINDOW llamadas. Correr tsc tras cada arreglo no
 *     dispara (el resultado cambia); correrlo tres veces sin tocar nada, sí.
 *   - sin avance: NO_PROGRESS_CALLS llamadas seguidas sin escribir un archivo, commitear ni
 *     abrir/comentar un PR, una vez pasada la fase de exploración (la lectura inicial es legítima).
 *
 * Escala en dos pasos: primero un AVISO (el hook se lo dice al agente, que puede corregir);
 * si después del aviso la señal sigue, CORTE (el runner mata la sesión y lo que sobra del
 * presupuesto vuelve al pozo de la noche).
 */

import { createHash } from 'node:crypto';

export const WINDOW = 40;
export const REPEAT_LIMIT = 3;
export const NO_PROGRESS_CALLS = 80;
export const GRACE_AFTER_WARNING = 25;   // llamadas sin avance tras el aviso antes de cortar
export const EXPLORE_FRACTION = 0.4;     // antes de esto, "sin avance" no cuenta

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const PROGRESS_CMD = /\bgit\s+(commit|push)\b|\bgh\s+pr\s+(create|comment|edit)\b/;

const hash = s => createHash('sha1').update(s).digest('hex').slice(0, 12);

function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${k}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

function resultText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(c => (typeof c?.text === 'string' ? c.text : '')).join('\n');
  return '';
}

export function isProgress(name, input = {}) {
  return WRITE_TOOLS.has(name) || (name === 'Bash' && PROGRESS_CMD.test(String(input.command || '')));
}

/**
 * `ingest(evento, { fraction })` → null | { level: 'aviso'|'corte', rule, detail }.
 * Devuelve algo solo cuando el nivel sube (un aviso, después a lo más un corte).
 */
export function createLoopDetector() {
  const pending = new Map();      // tool_use_id → { name, input, sig }
  const recent = [];              // últimas llamadas completadas: clave acción+resultado
  let sinceProgress = 0;
  let warned = null;              // { rule, key?, at }
  let cut = false;

  function check({ name, sig }, key, fraction) {
    const reps = recent.filter(k => k === key).length;
    if (reps >= REPEAT_LIMIT) {
      const detail = `${name} repetido ${reps} veces con el mismo resultado`;
      if (!warned) { warned = { rule: 'repite', key }; return { level: 'aviso', rule: 'repite', detail, sig }; }
      if (warned.rule === 'repite' || warned.key === key) { cut = true; return { level: 'corte', rule: 'repite', detail, sig }; }
    }
    if (fraction >= EXPLORE_FRACTION) {
      if (!warned && sinceProgress >= NO_PROGRESS_CALLS) {
        warned = { rule: 'sin-avance', at: sinceProgress };
        return { level: 'aviso', rule: 'sin-avance', detail: `${sinceProgress} llamadas sin escribir, commitear ni abrir un PR` };
      }
      if (warned?.rule === 'sin-avance' && sinceProgress >= warned.at + GRACE_AFTER_WARNING) {
        cut = true;
        return { level: 'corte', rule: 'sin-avance', detail: `${sinceProgress} llamadas sin avance, ${GRACE_AFTER_WARNING} después del aviso` };
      }
    }
    return null;
  }

  return {
    ingest(ev, { fraction = 0 } = {}) {
      if (cut) return null;
      const content = ev?.message?.content;
      if (!Array.isArray(content)) return null;
      let out = null;
      for (const c of content) {
        if (ev.type === 'assistant' && c?.type === 'tool_use') {
          pending.set(c.id, { name: c.name, input: c.input || {}, sig: `${c.name} ${stable(c.input || {})}`.slice(0, 300) });
        } else if (ev.type === 'user' && c?.type === 'tool_result') {
          const call = pending.get(c.tool_use_id);
          if (!call) continue;
          pending.delete(c.tool_use_id);
          if (isProgress(call.name, call.input)) {
            sinceProgress = 0;
            // Escribir algo después de un aviso por "sin avance" lo resuelve.
            if (warned?.rule === 'sin-avance') warned = null;
          } else sinceProgress++;
          const key = hash(`${call.sig}\u0000${resultText(c.content).slice(0, 4000)}`);
          recent.push(key);
          if (recent.length > WINDOW) recent.shift();
          out = check(call, key, fraction) || out;
          if (cut) break;
        }
      }
      return out;
    },
  };
}
