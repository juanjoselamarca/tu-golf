#!/usr/bin/env node
/**
 * CLI de Claude falso para las pruebas del scheduler. Reproduce respuestas
 * definidas en el escenario (CEO_FAKE_SCENARIO) con la forma real del stream-json.
 *
 * Escenario: { probe: {five, seven, fiveReset, sevenReset, status},
 *              agents: { <agente>: [ { kind, turns, commit, resetAt, costUsd } ... ] } }
 * kinds: ok · limit_five · limit_seven · noverify · loop (repite la misma llamada) ·
 *        spend (un mensaje con usage que pasa el tope duro) · otro = error real.
 * El agente sale del prompt (línea "AGENT=<nombre>"). Cada llamada consume la
 * siguiente respuesta; el contador vive en <escenario>.state.json.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const scenarioFile = process.env.CEO_FAKE_SCENARIO;
const scenario = JSON.parse(readFileSync(scenarioFile, 'utf8'));
const stateFile = `${scenarioFile}.state.json`;
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
const args = process.argv.slice(2);
// Como el CLI real: prompt como argumento tras -p o, si no viene, por stdin.
const afterP = args[args.indexOf('-p') + 1];
const prompt = afterP && !afterP.startsWith('--') ? afterP : (args.includes('haiku') ? '' : readFileSync(0, 'utf8'));
const out = l => process.stdout.write(JSON.stringify(l) + '\n');

const unified = (q) => ({
  type: 'rate_limit_event',
  rate_limit_info: {
    status: q.status || 'allowed', rateLimitType: 'five_hour', resetsAt: q.fiveReset / 1000,
    unifiedWindows: { five_hour: { utilization: q.five, resetsAt: q.fiveReset / 1000 }, seven_day: { utilization: q.seven, resetsAt: q.sevenReset / 1000 } },
  },
});

if (args.includes('haiku')) {
  out({ type: 'system', subtype: 'init', session_id: 'probe' });
  out(unified(scenario.probe));
  out({ type: 'result', subtype: 'success', is_error: false, num_turns: 1, result: 'ok' });
  process.exit(0);
}

const agent = (prompt.match(/AGENT=([\w-]+)/) || [])[1] || 'desconocido';
const n = state[agent] || 0;
state[agent] = n + 1;
writeFileSync(stateFile, JSON.stringify(state));
appendFileSync(`${scenarioFile}.calls.jsonl`, JSON.stringify({ agent, n, cwd: process.cwd(), retoma: prompt.includes('## RETOMA'), carried: /empezó la noche/.test(prompt), hasAccessToken: !!process.env.SUPABASE_ACCESS_TOKEN, budgetFile: process.env.CEO_BUDGET_FILE || null, settings: args.includes('--settings') ? args[args.indexOf('--settings') + 1] : null, budgetPrompt: prompt.includes('## PRESUPUESTO') }) + '\n');

const resp = (scenario.agents[agent] || [])[n] || { kind: 'ok' };
out({ type: 'system', subtype: 'init', session_id: `${agent}-${n}` });

if (resp.commit) {
  writeFileSync(`${process.cwd()}/avance-${agent}-${n}.txt`, 'x');
  execFileSync('git', ['add', '.'], { cwd: process.cwd() });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', `avance ${n}`], { cwd: process.cwd() });
}

const q = scenario.probe;
switch (resp.kind) {
  case 'ok':
    out(unified({ ...q, ...(resp.quota || {}) }));
    out({ type: 'result', subtype: 'success', is_error: false, num_turns: resp.turns ?? 30, result: 'listo', ...(resp.costUsd != null ? { total_cost_usd: resp.costUsd } : {}) });
    process.exit(0);
  case 'loop':
    // La misma llamada con el mismo resultado una y otra vez: el detector debe avisar y después cortar.
    for (let i = 0; i < 8; i++) {
      out({ type: 'assistant', message: { id: `m${i}`, content: [{ type: 'tool_use', id: `t${i}`, name: 'Bash', input: { command: 'npx tsc --noEmit' } }] } });
      out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: `t${i}`, content: 'error TS2322 en x.ts' }] } });
    }
    setTimeout(() => { out({ type: 'result', subtype: 'success', is_error: false, num_turns: 8, result: 'sigo' }); process.exit(0); }, 5000);
    break;
  case 'spend':
    // 3 M de output (×5 ponderado) ≈ US$50 estimados: sobre el tope duro de cualquier presupuesto de prueba.
    out({ type: 'assistant', message: { id: 'gasto', model: 'claude-opus-5-5', usage: { output_tokens: 3_000_000 }, content: [{ type: 'text', text: 'pensando' }] } });
    setTimeout(() => { out({ type: 'result', subtype: 'success', is_error: false, num_turns: 2, result: 'listo' }); process.exit(0); }, 5000);
    break;
  case 'limit_five':
    out({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', resetsAt: resp.resetAt / 1000 } });
    out({ type: 'result', subtype: 'success', is_error: true, num_turns: resp.turns ?? 1, result: "You've hit your limit · resets 5am (America/Santiago)" });
    process.exit(1);
  case 'limit_seven':
    out(unified({ ...q, seven: 1, status: 'rejected' }));
    out({ type: 'result', subtype: 'success', is_error: true, num_turns: resp.turns ?? 12, result: "You've hit your limit · resets Oct 8" });
    process.exit(1);
  case 'noverify':
    out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'git push --no-verify origin HEAD' } }] } });
    // El scheduler debe matar la sesión antes de que llegue el result.
    setTimeout(() => {
      out({ type: 'result', subtype: 'success', is_error: false, num_turns: 3, result: 'empujé sin hooks' });
      process.exit(0);
    }, 5000);
    break;
  default:
    out({ type: 'result', subtype: 'error_during_execution', is_error: true, num_turns: 4, result: 'TypeError: boom' });
    process.exit(1);
}
