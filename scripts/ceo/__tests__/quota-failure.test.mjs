import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseQuota, decideStart, weeklyCeiling, weeklyBlock, canStartExtraRound, mergeQuota, measuredDailyUse,
  CEILING_MIN, CEILING_MAX, weeklyPaceAlert,
} from '../quota.mjs';
import { classifyAttempt, scanViolations, lineViolation } from '../failure.mjs';

const fx = name => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', name), 'utf8');
const H = 3600 * 1000;
const DAY = 24 * H;
const T0 = Date.parse('2026-10-02T03:00:00.000Z'); // 00:00 CLT

const ev = (info) => JSON.stringify({ type: 'rate_limit_event', rate_limit_info: info });
const unified = ({ five, seven, fiveReset = T0 + 2 * H, sevenReset = T0 + 3 * DAY, status = 'allowed' }) => ev({
  status, rateLimitType: 'five_hour', resetsAt: fiveReset / 1000,
  unifiedWindows: { five_hour: { utilization: five, resetsAt: fiveReset / 1000 }, seven_day: { utilization: seven, resetsAt: sevenReset / 1000 } },
});

describe('parseQuota — formas reales del CLI', () => {
  it('unifiedWindows (CLI 2.1.286, probe real 01-oct): utilización exacta de las dos ventanas', () => {
    const q = parseQuota(fx('probe-unified-2026-10-01.jsonl'));
    expect(q.estimated).toBe(false);
    expect(q.five.utilization).toBe(0.53);
    expect(q.seven.utilization).toBe(0.05);
    expect(q.five.resetsAt).toBe(1790881200 * 1000);
    expect(q.seven.resetsAt).toBe(1791468000 * 1000);
  });

  it('legacy: aviso semanal sin unifiedWindows queda marcado como estimado', () => {
    const q = parseQuota(fx('legacy-seven-warning-2026-09-30.jsonl'));
    expect(q.estimated).toBe(true);
    expect(q.seven.utilization).toBe(0.84);
    expect(q.five.utilization).toBeNull();
  });

  it('rejected de 5 h (log real 29-sep)', () => {
    const q = parseQuota(fx('limit-five-2026-09-29.jsonl'));
    expect(q.five.status).toBe('rejected');
    expect(q.five.resetsAt).toBe(1790686800 * 1000);
  });

  it('semanal al 100 % dentro de unifiedWindows se marca rejected aunque el evento sea de 5 h', () => {
    const q = parseQuota(unified({ five: 0.2, seven: 1 }));
    expect(q.seven.status).toBe('rejected');
  });

  it('texto sin eventos → seen=false', () => {
    expect(parseQuota('hola\n{"type":"result"}').seen).toBe(false);
  });
});

describe('weeklyCeiling — techo dinámico', () => {
  it.each([
    [6, 0.60], [3, 0.76], [1, 0.92], [0.25, 0.97], [0, 0.97],
  ])('%s días al reset → %s', (days, expected) => {
    expect(weeklyCeiling({ now: T0, sevenResetsAt: T0 + days * DAY, dailyUse: 0.08 })).toBeCloseTo(expected, 2);
  });
  it('sin dato de reset → el techo más conservador', () => {
    expect(weeklyCeiling({ now: T0, sevenResetsAt: null })).toBe(CEILING_MIN);
  });
  it('uso diario medido muy bajo no baja del piso de 0,05', () => {
    expect(weeklyCeiling({ now: T0, sevenResetsAt: T0 + 2 * DAY, dailyUse: 0.01 })).toBeCloseTo(0.90, 2);
  });
  it('nunca supera el máximo', () => {
    expect(weeklyCeiling({ now: T0, sevenResetsAt: T0 - DAY })).toBe(CEILING_MAX);
  });
});

describe('decideStart', () => {
  const q = (o) => parseQuota(unified(o));

  it('cupo holgado → partir', () => {
    expect(decideStart(q({ five: 0.1, seven: 0.3 }), { now: T0 }).action).toBe('run');
  });
  it('semanal sobre el techo (6 días al reset, 0,62) → no correr', () => {
    const d = decideStart(q({ five: 0, seven: 0.62, sevenReset: T0 + 6 * DAY }), { now: T0 });
    expect(d.action).toBe('skip_weekly');
    expect(d.reason).toMatch(/techo/);
  });
  it('mismo 0,62 la última noche (1 día al reset) → sí corre', () => {
    expect(decideStart(q({ five: 0, seven: 0.62, sevenReset: T0 + DAY }), { now: T0 }).action).toBe('run');
  });
  it('semanal agotado → no correr', () => {
    expect(decideStart(q({ five: 0, seven: 1 }), { now: T0 }).action).toBe('skip_weekly');
  });
  it('5 h rechazado → esperar al reset + 3 min', () => {
    const d = decideStart(parseQuota(fx('limit-five-2026-09-29.jsonl')), { now: Date.parse('2026-09-29T08:00:00Z') });
    expect(d.action).toBe('wait');
    expect(d.until).toBe(1790686800 * 1000 + 3 * 60 * 1000);
  });
  it('5 h al 60 % con reset en 40 min → esperar (ventana completa rinde más)', () => {
    expect(decideStart(q({ five: 0.6, seven: 0.2, fiveReset: T0 + 40 * 60 * 1000 }), { now: T0 }).action).toBe('wait');
  });
  it('5 h al 60 % con reset en 3 h → partir', () => {
    expect(decideStart(q({ five: 0.6, seven: 0.2, fiveReset: T0 + 3 * H }), { now: T0 }).action).toBe('run');
  });
  it('5 h al 30 % con reset en 40 min → partir', () => {
    expect(decideStart(q({ five: 0.3, seven: 0.2, fiveReset: T0 + 40 * 60 * 1000 }), { now: T0 }).action).toBe('run');
  });
  it('sin ningún dato (probe falló) → partir; el manejo a mitad de noche cubre el resto', () => {
    expect(decideStart(parseQuota(''), { now: T0 }).action).toBe('run');
  });
  it('legacy con aviso de 5 h (≥0,90) → esperar', () => {
    const legacy = parseQuota(ev({ status: 'allowed_warning', rateLimitType: 'five_hour', utilization: 0.91, resetsAt: (T0 + 2 * H) / 1000 }));
    expect(decideStart(legacy, { now: T0 }).action).toBe('wait');
  });
});

describe('ronda extra y medición', () => {
  it('ronda 2 solo si cabe completa bajo el techo', () => {
    const base = { five: 0.1, sevenReset: T0 + DAY }; // techo 0,92
    expect(canStartExtraRound(parseQuota(unified({ ...base, seven: 0.80 })), { now: T0 })).toBe(true);
    expect(canStartExtraRound(parseQuota(unified({ ...base, seven: 0.86 })), { now: T0 })).toBe(false);
  });
  it('sin dato semanal unificado → no se arriesga una ronda extra', () => {
    expect(canStartExtraRound(parseQuota(''), { now: T0 })).toBe(false);
  });
  it('mergeQuota conserva lo que la lectura nueva no trae', () => {
    const a = parseQuota(unified({ five: 0.2, seven: 0.3 }));
    const b = parseQuota(ev({ status: 'allowed', rateLimitType: 'five_hour', resetsAt: 1 }));
    expect(mergeQuota(a, b).seven.utilization).toBe(0.3);
  });
  it('measuredDailyUse: null con pocos días; percentil 75 con datos', () => {
    expect(measuredDailyUse([])).toBeNull();
    const hist = [];
    [0.03, 0.05, 0.06, 0.07, 0.12].forEach((delta, i) => {
      const day = Date.parse(`2026-10-0${i + 3}T12:00:00-03:00`);
      hist.push({ at: new Date(day).toISOString(), seven: { utilization: 0.2, resetsAt: 1 } });
      hist.push({ at: new Date(day + 8 * H).toISOString(), seven: { utilization: 0.2 + delta, resetsAt: 1 } });
    });
    expect(measuredDailyUse(hist)).toBeCloseTo(0.07, 5);
  });
});

describe('classifyAttempt', () => {
  it('falla por límite real (subtype "success" + is_error) → limit_five con resetsAt', () => {
    const c = classifyAttempt({ output: fx('limit-five-2026-09-29.jsonl'), code: 1, killed: false });
    expect(c.kind).toBe('limit_five');
    expect(c.resetsAt).toBe(1790686800 * 1000);
    expect(c.sessionId).toBe('3a6e49af-6379-4c7c-9e37-c7c2134c8b01');
  });
  it('límite semanal → limit_seven', () => {
    const out = [unified({ five: 0.3, seven: 1, status: 'rejected' }), JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: "You've hit your limit · resets Oct 8" })].join('\n');
    expect(classifyAttempt({ output: out, code: 1, killed: false }).kind).toBe('limit_seven');
  });
  it('error real (exit 1 sin límite) → real', () => {
    const out = JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'TypeError: x' });
    expect(classifyAttempt({ output: out, code: 1, killed: false }).kind).toBe('real');
  });
  it('éxito', () => {
    const out = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 40, result: 'listo' });
    const c = classifyAttempt({ output: out, code: 0, killed: false });
    expect(c.kind).toBe('ok');
    expect(c.numTurns).toBe(40);
  });
  it('exit 0 pero is_error → no es éxito', () => {
    const out = JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'algo raro' });
    expect(classifyAttempt({ output: out, code: 0, killed: false }).kind).toBe('real');
  });
  it('timeout manda aunque haya eventos', () => {
    expect(classifyAttempt({ output: fx('limit-five-2026-09-29.jsonl'), code: null, killed: true }).kind).toBe('timeout');
  });
  it('sin result (crash) → real', () => {
    expect(classifyAttempt({ output: 'SPAWN ERROR: ENOENT', code: -1, killed: false }).kind).toBe('real');
  });
});

describe('scanViolations — candados de las reglas nocturnas', () => {
  const ROOT = 'C:\\Users\\juanj\\OneDrive\\Escritorio\\Proyectos IA\\tu-golf';
  const bash = cmd => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: cmd } }] } });
  const read = p => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: p } }] } });
  const rules = out => scanViolations(out, { repoRoot: ROOT }).map(v => v.rule);

  it.each([
    ['git push --no-verify origin HEAD', 'no-verify'],
    ['git commit -m "x" --no-verify', 'no-verify'],
    ['gh pr merge 12 --squash --admin', 'merge-admin'],
    ['gh pr edit 12 --add-label fable-reviewed', 'auto-label-fable'],
    ['gh api repos/x/y/branches/main/protection/required_status_checks -X PATCH -f strict=false', 'branch-protection'],
    ['cat "C:/Users/juanj/OneDrive/Escritorio/Proyectos IA/tu-golf/.env.local"', 'env-principal'],
    ['curl -X POST https://api.supabase.com/v1/projects/abc/database/query -d "{}"', 'sql-directo'],
    ['npx supabase db push', 'sql-directo'],
  ])('%s → %s', (cmd, rule) => {
    expect(rules(bash(cmd))).toContain(rule);
  });

  it('leer el .env.local principal con la herramienta Read también', () => {
    expect(rules(read(`${ROOT}\\.env.local`))).toContain('env-principal');
  });

  it.each([
    'git push origin HEAD',
    'node --env-file=.env.local scripts/run-sql.mjs q.sql',
    'gh pr merge 12 --squash',
    'gh pr list --label fable-reviewed',
    'gh api repos/x/y/branches/main/protection',
    'cat "C:/ceo-worktrees/2026-10-02-r1-qa-design/.env.local"',
  ])('no es violación: %s', (cmd) => {
    expect(rules(bash(cmd))).toEqual([]);
  });

  it('más de 9 push en una sesión → aviso (no P0)', () => {
    const out = Array.from({ length: 10 }, () => bash('git push origin HEAD')).join('\n');
    const v = scanViolations(out, { repoRoot: ROOT });
    expect(v).toEqual([expect.objectContaining({ rule: 'bucle-push', severity: 'warn' })]);
  });

  it('lineViolation detecta en caliente solo P0', () => {
    expect(lineViolation(bash('git push --no-verify'), { repoRoot: ROOT })?.rule).toBe('no-verify');
    expect(lineViolation(bash('git push'), { repoRoot: ROOT })).toBeNull();
    expect(lineViolation('{"type":"result"}', { repoRoot: ROOT })).toBeNull();
  });
});

describe('weeklyBlock', () => {
  it('legacy sin número semanal → no bloquea (está bajo ~0,56 < techo mínimo 0,60)', () => {
    expect(weeklyBlock(parseQuota(''), { now: T0 })).toBeNull();
  });
});

describe('revisión Fable 01-oct — cupo vencido y candados sin falsos positivos', () => {
  const ROOT = 'C:\Users\juanj\OneDrive\Escritorio\Proyectos IA\tu-golf';
  const bash = cmd => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: cmd } }] } });
  const tool = (name, file_path) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input: { file_path } }] } });
  const rules = out => scanViolations(out, { repoRoot: ROOT }).map(v => v.rule);

  it('un "rejected" cuyo reset ya pasó no hace esperar (lectura vieja)', () => {
    const q = parseQuota(fx('limit-five-2026-09-29.jsonl')); // reset 29-sep 10:00
    expect(decideStart(q, { now: T0 }).action).toBe('run');
  });
  it('la retoma nunca queda en el pasado', async () => {
    const { resumeTimeFor } = await import('../quota.mjs');
    expect(resumeTimeFor(T0 - H, T0)).toBe(T0 + 5 * 60 * 1000);
    expect(resumeTimeFor(null, T0)).toBe(T0 + H + 3 * 60 * 1000);
    expect(resumeTimeFor(T0 + 2 * H, T0)).toBe(T0 + 2 * H + 3 * 60 * 1000);
  });

  it.each([
    'git commit -m "docs: prohibido usar git push --no-verify"',
    'gh pr create --title "x" --body "el agente anterior usó gh pr merge --admin; no repetir"',
    `cat > notas.md <<'EOF'\ngit push --no-verify\nEOF`,
    'gh label list --search fable-reviewed',
    'grep -n critical-zone .github/workflows/critical-zone-guard.yml',
  ])('no es violación (texto, no comando): %s', (cmd) => {
    expect(rules(bash(cmd))).toEqual([]);
  });

  it.each([
    ['gh pr edit 7 --add-label "fable-reviewed"', 'auto-label-fable'],
    ["gh api -X POST repos/o/r/issues/7/labels -f 'labels[]=fable-reviewed'", 'auto-label-fable'],
    ['gh api -X PUT repos/o/r/pulls/7/merge', 'merge-api'],
    ['git add . && git push --no-verify', 'no-verify'],
    ["sed -i 's/exit 1/exit 0/' .github/workflows/critical-zone-guard.yml", 'guard-editado'],
    ['echo "" > .github/critical-zone-paths.txt', 'guard-editado'],
  ])('%s → %s', (cmd, rule) => {
    expect(rules(bash(cmd))).toContain(rule);
  });

  it('editar el guard con Edit/Write es violación; leerlo no', () => {
    expect(rules(tool('Edit', 'C:/ceo-worktrees/x/.github/workflows/critical-zone-guard.yml'))).toContain('guard-editado');
    expect(rules(tool('Read', 'C:/ceo-worktrees/x/.github/workflows/critical-zone-guard.yml'))).toEqual([]);
  });
});

describe('sql-proxy', () => {
  it('fuerza read_only aunque el agente pida lo contrario, exige la ruta secreta y usa el token del scheduler', async () => {
    const { createServer } = await import('node:http');
    const { startSqlProxy, projectRefFromUrl } = await import('../sql-proxy.mjs');
    const seen = [];
    const upstream = createServer((req, res) => {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => { seen.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) }); res.end('[{"ok":1}]'); });
    });
    await new Promise(r => upstream.listen(0, '127.0.0.1', r));
    const proxy = await startSqlProxy({ accessToken: 'tok', projectRef: 'abc', upstream: `http://127.0.0.1:${upstream.address().port}` });
    try {
      const r = await fetch(proxy.url, { method: 'POST', body: JSON.stringify({ query: 'select 1', read_only: false }) });
      expect(r.status).toBe(200);
      expect(seen[0]).toEqual({ url: '/v1/projects/abc/database/query', auth: 'Bearer tok', body: { query: 'select 1', read_only: true } });
      const wrong = await fetch(proxy.url.replace(/\/[0-9a-f]{32}\//, '/otro/'), { method: 'POST', body: '{"query":"select 1"}' });
      expect(wrong.status).toBe(404);
      expect(seen).toHaveLength(1);
      expect(projectRefFromUrl('https://hoswfwhvcgqlqdmzpnce.supabase.co')).toBe('hoswfwhvcgqlqdmzpnce');
      expect(projectRefFromUrl('http://otra.cosa')).toBeNull();
    } finally {
      await proxy.close();
      await new Promise(r => upstream.close(r));
    }
  });
});

describe('heredoc: lo que viene después del terminador sí se revisa', () => {
  const ROOT = 'C:/x';
  const bash = cmd => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: cmd } }] } });
  it('push --no-verify después de un heredoc → violación', () => {
    const cmd = "cat > notas.md <<'EOF'\nhola\nEOF\ngit push --no-verify";
    expect(scanViolations(bash(cmd), { repoRoot: ROOT }).map(v => v.rule)).toContain('no-verify');
  });
  it('heredoc sin terminador: se ignora hasta el final', () => {
    const cmd = "cat > notas.md <<'EOF'\ngit push --no-verify";
    expect(scanViolations(bash(cmd), { repoRoot: ROOT })).toEqual([]);
  });
});

describe('weeklyPaceAlert — aviso diurno de ritmo semanal', () => {
  const q = (u, resetIn) => ({ seen: true, five: {}, seven: { status: 'allowed', utilization: u, resetsAt: T0 + resetIn } });
  it('caso real 09-oct: 53 % a 1 día del reset semanal → avisa y proyecta agotarse antes del reset', () => {
    const a = weeklyPaceAlert(q(0.53, 6 * DAY), { now: T0 });
    expect(a).not.toBeNull();
    expect(a.elapsed).toBeCloseTo(1 / 7, 5);
    expect(a.agotaEn).toBeGreaterThan(T0);
    expect(a.agotaEn).toBeLessThan(T0 + 6 * DAY);
  });
  it('ritmo sostenible (50 % a mitad de semana) → no avisa', () => {
    expect(weeklyPaceAlert(q(0.5, 3.5 * DAY), { now: T0 })).toBeNull();
  });
  it('bajo el mínimo (25 % el primer día) → no avisa aunque vaya rápido', () => {
    expect(weeklyPaceAlert(q(0.25, 6.5 * DAY), { now: T0 })).toBeNull();
  });
  it('sin dato de utilización o ventana ya renovada → no avisa', () => {
    expect(weeklyPaceAlert(q(null, 3 * DAY), { now: T0 })).toBeNull();
    expect(weeklyPaceAlert(q(0.9, -1 * H), { now: T0 })).toBeNull();
  });
  it('semanal agotado → avisa con agotaEn = ahora', () => {
    const a = weeklyPaceAlert(q(1, 2 * DAY), { now: T0 });
    expect(a.agotaEn).toBe(T0);
  });
});
