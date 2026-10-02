#!/usr/bin/env node
/**
 * CLI de Claude falso para las pruebas del scheduler. Reproduce respuestas
 * definidas en el escenario (CEO_FAKE_SCENARIO) con la forma real del stream-json.
 *
 * Escenario: { probe: {five, seven, fiveReset, sevenReset, status},
 *              agents: { <agente>: [ { kind, turns, commit, resetAt } ... ] } }
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
appendFileSync(`${scenarioFile}.calls.jsonl`, JSON.stringify({ agent, n, cwd: process.cwd(), retoma: prompt.includes('## RETOMA'), carried: /empezó la noche/.test(prompt), sqlProxy: !!process.env.CEO_SQL_PROXY, hasAccessToken: !!process.env.SUPABASE_ACCESS_TOKEN }) + '\n');

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
    out({ type: 'result', subtype: 'success', is_error: false, num_turns: resp.turns ?? 30, result: 'listo' });
    process.exit(0);
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
