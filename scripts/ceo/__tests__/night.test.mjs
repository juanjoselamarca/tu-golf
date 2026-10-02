/**
 * Pruebas de día del scheduler v4: noches completas con un CLI de Claude falso,
 * un repo git temporal (con su "origin"), Task Scheduler y Telegram falsos, y
 * reloj inyectado. Nada toca el repo real, GitHub, Supabase ni Telegram.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createNightRunner } from '../night.mjs';
import { RESUME_TASK } from '../windows.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FAKE_CLAUDE = resolve(HERE, 'fake-claude.mjs');
const H = 3600 * 1000;
const DAY = 24 * H;
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime(); // hora local

const ENV_KEYS = ['CEO_CLAUDE_BIN', 'CEO_FAKE_SCENARIO', 'CEO_FAKE_WINDOWS', 'CEO_FAKE_TELEGRAM', 'CEO_WORKTREES_DIR', 'SUPABASE_ACCESS_TOKEN', 'NEXT_PUBLIC_SUPABASE_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ADMIN_CHAT_ID'];
let saved;
let T; // directorio temporal de la prueba
let clock;

function git(args, cwd) {
  return execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function setup(scenario) {
  T = mkdtempSync(resolve(tmpdir(), 'ceo-v4-'));
  const origin = resolve(T, 'origin.git');
  const repo = resolve(T, 'repo');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  execFileSync('git', ['clone', '-q', origin, repo]);
  writeFileSync(resolve(repo, 'README.md'), 'x');
  git(['checkout', '-q', '-b', 'main'], repo);
  git(['add', '.'], repo);
  git(['commit', '-qm', 'init'], repo);
  git(['push', '-q', 'origin', 'main'], repo);
  mkdirSync(resolve(repo, 'node_modules'));
  writeFileSync(resolve(repo, '.env.local'), 'SUPABASE_ACCESS_TOKEN=secreto\nNEXT_PUBLIC_SUPABASE_URL=https://abc.supabase.co\nOTRA=1\n');

  const prompts = resolve(T, 'prompts');
  mkdirSync(prompts);
  for (const a of ['a1', 'a2', 'resumen-ceo']) writeFileSync(resolve(prompts, `${a}.md`), `AGENT=${a}\nRama {{BRANCH}} en {{WORKTREE_PATH}}\n`);
  writeFileSync(resolve(prompts, 'merge-rule.md'), 'regla merge');
  writeFileSync(resolve(prompts, 'night-rules.md'), 'reglas noche');

  const scenarioFile = resolve(T, 'scenario.json');
  writeFileSync(scenarioFile, JSON.stringify(scenario));
  writeFileSync(resolve(T, 'windows.json'), JSON.stringify({ tasks: {}, processes: [], alive: [] }));

  Object.assign(process.env, {
    CEO_CLAUDE_BIN: FAKE_CLAUDE,
    CEO_FAKE_SCENARIO: scenarioFile,
    CEO_FAKE_WINDOWS: resolve(T, 'windows.json'),
    CEO_FAKE_TELEGRAM: resolve(T, 'telegram.jsonl'),
    CEO_WORKTREES_DIR: resolve(T, 'wt'),
  });
  delete process.env.SUPABASE_ACCESS_TOKEN; // el proxy SQL se prueba aparte

  const stubScript = resolve(T, 'relaunch-stub.mjs');
  writeFileSync(stubScript, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(resolve(T, 'relaunched.txt'))}, process.argv.slice(2).join(' '));`);

  const runner = createNightRunner({
    repoRoot: repo,
    logsDir: resolve(T, 'logs'),
    locksDir: resolve(T, 'locks'),
    promptsDir: prompts,
    scriptPath: stubScript,
    agents: [
      { name: 'a1', prefix: 'fix', timeout: 1, maxTurns: 10 },
      { name: 'a2', prefix: 'feat', timeout: 1, maxTurns: 10 },
      { name: 'resumen-ceo', prefix: null, timeout: 1, maxTurns: 5 },
    ],
    refreshAuth: async () => true,
    now: () => clock,
  });
  return { runner, repo, scenarioFile };
}

const calls = () => {
  const f = `${process.env.CEO_FAKE_SCENARIO}.calls.jsonl`;
  return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
};
const night = () => {
  const active = JSON.parse(readFileSync(resolve(T, 'locks', 'active-night.json'), 'utf8'));
  return JSON.parse(readFileSync(resolve(T, 'logs', 'nights', `${active.nightId}.json`), 'utf8'));
};
const windows = () => JSON.parse(readFileSync(process.env.CEO_FAKE_WINDOWS, 'utf8'));
const telegram = () => existsSync(process.env.CEO_FAKE_TELEGRAM) ? readFileSync(process.env.CEO_FAKE_TELEGRAM, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const job = (key) => night().jobs.find(j => j.key === key);

// Cupo holgado sin ronda 2: semanal 0,55 a 6 días del reset → techo 0,60; 0,55 + 0,08 no cabe.
const probe = (o = {}) => ({ five: 0.1, seven: 0.55, fiveReset: at(2, 4), sevenReset: at(8, 11), ...o });

// Dentro de un hook de git (pre-push corre la suite) vienen GIT_DIR, GIT_INDEX_FILE, etc.:
// sin limpiarlos, los `git` de la prueba apuntarían al repo REAL en vez del temporal.
const GIT_ENV = () => Object.keys(process.env).filter(k => /^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|PREFIX)$/.test(k));

beforeEach(() => {
  saved = Object.fromEntries([...ENV_KEYS, ...GIT_ENV()].map(k => [k, process.env[k]]));
  for (const k of GIT_ENV()) delete process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { rmSync(T, { recursive: true, force: true }); } catch { /* Windows a veces retiene archivos */ }
});

describe('scheduler v4 — noches simuladas', { timeout: 120000 }, () => {
  it('a) límite de 5 h a mitad: pausa, programa la retoma y la retoma continúa el MISMO trabajo', async () => {
    const reset = at(2, 12);
    const { runner } = setup({
      probe: probe({ fiveReset: reset }),
      agents: { a1: [{ kind: 'limit_five', turns: 10, commit: true, resetAt: reset }, { kind: 'ok' }], a2: [{ kind: 'ok' }], 'resumen-ceo': [{ kind: 'ok' }] },
    });

    clock = at(2, 10);
    await runner.runNight();
    expect(job('r1:a1').status).toBe('paused_limit');
    expect(night().status).toBe('waiting');
    expect(windows().tasks[RESUME_TASK].at).toBe(new Date(reset + 3 * 60 * 1000).toISOString());
    expect(calls().map(c => c.agent)).toEqual(['a1']);
    const wtPath = job('r1:a1').wtPath;
    expect(existsSync(wtPath)).toBe(true); // se conserva para retomar

    clock = reset + 5 * 60 * 1000;
    await runner.runNight();
    const c = calls();
    expect(c.map(x => x.agent)).toEqual(['a1', 'a1', 'a2', 'resumen-ceo']);
    expect(c[1]).toMatchObject({ retoma: true, cwd: expect.stringContaining('r1-a1') });
    expect(job('r1:a1').status).toBe('ok');
    expect(job('r1:a1').attempts).toHaveLength(2);
    expect(night().status).toBe('done');
    expect(night().summarySent).toBe(true);
    expect(existsSync(wtPath)).toBe(false); // terminado → worktree borrado
    expect(windows().tasks[RESUME_TASK]).toBeUndefined();
    // Logs por intento: nada se sobrescribe
    expect(existsSync(resolve(T, 'logs', `${night().nightId}-r1-a1-a1.log`))).toBe(true);
    expect(existsSync(resolve(T, 'logs', `${night().nightId}-r1-a1-a2.log`))).toBe(true);
  });

  it('b) dos pausas seguidas sin avance → atascado, sin tercer intento', async () => {
    const reset = at(2, 12);
    const { runner } = setup({
      probe: probe({ fiveReset: reset }),
      agents: { a1: [{ kind: 'limit_five', turns: 10, resetAt: reset }, { kind: 'limit_five', turns: 10, resetAt: reset + 5 * H }], a2: [{ kind: 'ok' }] },
    });
    clock = at(2, 10);
    await runner.runNight();
    clock = reset + 5 * 60 * 1000;
    await runner.runNight();
    expect(job('r1:a1').status).toBe('stuck');
    // El cupo sigue agotado: la cola espera el próximo reset en vez de lanzar a2 contra un límite.
    expect(calls().map(x => x.agent)).toEqual(['a1', 'a1']);
    expect(night().status).toBe('waiting');
    clock = reset + 5 * H + 5 * 60 * 1000;
    await runner.runNight();
    expect(calls().map(x => x.agent)).toEqual(['a1', 'a1', 'a2', 'resumen-ceo']);
    expect(job('r1:a1').attempts).toHaveLength(2); // atascado: sin tercer intento
    expect(night().notifications.some(n => /sin avanzar/.test(n.text))).toBe(true);
  });

  it('b2) el límite que corta al arrancar (1 turno) no cuenta como atasco', async () => {
    const r1 = at(2, 12);
    const r2 = at(2, 17);
    const { runner } = setup({
      probe: probe({ fiveReset: r1 }),
      agents: { a1: [{ kind: 'limit_five', turns: 1, resetAt: r1 }, { kind: 'limit_five', turns: 1, resetAt: r2 }, { kind: 'ok' }], a2: [{ kind: 'ok' }] },
    });
    clock = at(2, 10); await runner.runNight();
    clock = r1 + 5 * 60 * 1000; await runner.runNight();
    expect(job('r1:a1').status).toBe('paused_limit');
    clock = r2 + 5 * 60 * 1000; await runner.runNight();
    expect(job('r1:a1').status).toBe('ok');
  });

  it('c) error real → nunca se reintenta y la cola sigue', async () => {
    const { runner } = setup({ probe: probe(), agents: { a1: [{ kind: 'real' }], a2: [{ kind: 'ok' }] } });
    clock = at(2, 10);
    await runner.runNight();
    expect(job('r1:a1').status).toBe('failed_real');
    expect(calls().filter(x => x.agent === 'a1')).toHaveLength(1);
    expect(job('r1:a2').status).toBe('ok');
    expect(night().status).toBe('done');
  });

  it('d) semanal sobre el techo en el preflight → no corre nadie y avisa con la razón', async () => {
    const { runner } = setup({ probe: probe({ seven: 0.7 }), agents: {} });
    clock = at(2, 10);
    await runner.runNight();
    expect(calls()).toHaveLength(0);
    expect(night().frozen).toBe(true);
    const msgs = telegram().filter(m => m.method === 'sendMessage').map(m => m.text).join('\n');
    expect(msgs).toMatch(/semanal sobre el techo/);
    expect(msgs).toMatch(/se renueva/);
  });

  it('d2) mismo 70 % la noche antes de la renovación → sí corre', async () => {
    const { runner } = setup({ probe: probe({ seven: 0.7, sevenReset: at(3, 11) }), agents: { a1: [{ kind: 'ok' }], a2: [{ kind: 'ok' }] } });
    clock = at(2, 10);
    await runner.runNight();
    expect(calls().map(x => x.agent)).toContain('a1');
  });

  it('e) semanal agotado a mitad → se congela y la noche siguiente retoma lo pausado primero', async () => {
    const { runner } = setup({
      probe: probe(),
      agents: { a1: [{ kind: 'limit_seven', commit: true }, { kind: 'ok' }, { kind: 'ok' }], a2: [{ kind: 'ok' }] },
    });
    clock = at(2, 10);
    await runner.runNight();
    expect(job('r1:a1').status).toBe('paused_weekly');
    expect(job('r1:a2').status).toBe('pending');
    expect(night().status).toBe('done');
    const firstNight = night().nightId;

    clock = at(3, 10);
    await runner.runNight();
    const n2 = night();
    expect(n2.nightId).not.toBe(firstNight);
    const c = calls();
    expect(c[1]).toMatchObject({ agent: 'a1', retoma: true, carried: true });
    expect(n2.jobs.find(j => j.key === 'carry:r1:a1').status).toBe('ok');
  });

  it('f) preflight con 5 h agotado → espera al reset sin lanzar agentes', async () => {
    const reset = at(2, 4);
    const { runner } = setup({ probe: probe({ five: 1, status: 'rejected', fiveReset: reset }), agents: {} });
    clock = at(2, 0, 1);
    await runner.runNight();
    expect(calls()).toHaveLength(0);
    expect(night().status).toBe('waiting');
    expect(windows().tasks[RESUME_TASK].at).toBe(new Date(reset + 3 * 60 * 1000).toISOString());
  });

  it('g) dos noches a la vez → la segunda sale por el candado', async () => {
    const { runner } = setup({ probe: probe(), agents: {} });
    mkdirSync(resolve(T, 'locks'), { recursive: true });
    writeFileSync(resolve(T, 'locks', 'night.lock'), '424242');
    writeFileSync(process.env.CEO_FAKE_WINDOWS, JSON.stringify({ tasks: {}, processes: [], alive: [424242] }));
    clock = at(2, 10);
    await runner.runNight();
    expect(calls()).toHaveLength(0);
    expect(existsSync(resolve(T, 'locks', 'active-night.json'))).toBe(false);
  });

  it('h) watchdog: scheduler muerto con trabajo pendiente → relanza UNA vez; la segunda solo avisa', async () => {
    const reset = at(2, 12);
    const { runner } = setup({ probe: probe({ fiveReset: reset }), agents: { a1: [{ kind: 'limit_five', turns: 10, commit: true, resetAt: reset }] } });
    clock = at(2, 10);
    await runner.runNight();
    // Simula que la tarea de retoma se perdió y el proceso no está.
    writeFileSync(process.env.CEO_FAKE_WINDOWS, JSON.stringify({ tasks: {}, processes: [], alive: [] }));
    clock = at(2, 12, 30);
    await runner.runWatchdog();
    await new Promise(r => setTimeout(r, 1500));
    expect(readFileSync(resolve(T, 'relaunched.txt'), 'utf8')).toBe('--night');
    expect(night().watchdogRelaunches).toBe(1);
    rmSync(resolve(T, 'relaunched.txt'));
    await runner.runWatchdog();
    await new Promise(r => setTimeout(r, 1000));
    expect(existsSync(resolve(T, 'relaunched.txt'))).toBe(false);
    expect(night().notifications.some(n => n.kind === 'p0' && /no lo relanzo/.test(n.text))).toBe(true);
  });

  it('h2) watchdog mata sesiones de agente huérfanas pero no las interactivas', async () => {
    const { runner } = setup({ probe: probe(), agents: { a1: [{ kind: 'ok' }], a2: [{ kind: 'ok' }] } });
    clock = at(2, 10);
    await runner.runNight();
    writeFileSync(process.env.CEO_FAKE_WINDOWS, JSON.stringify({
      tasks: {}, alive: [],
      processes: [
        { pid: 111, kind: 'headless', cmd: 'claude.exe -p x --output-format stream-json --dangerously-skip-permissions' },
        { pid: 222, kind: 'interactive', cmd: 'claude.exe --dangerously-skip-permissions' },
      ],
    }));
    await runner.runWatchdog();
    expect(windows().killed).toEqual([111]);
  });

  it('i) PAUSE → ni la noche ni el watchdog hacen nada', async () => {
    const { runner } = setup({ probe: probe(), agents: { a1: [{ kind: 'ok' }] } });
    mkdirSync(resolve(T, 'locks'), { recursive: true });
    writeFileSync(resolve(T, 'locks', 'PAUSE'), '');
    clock = at(2, 10);
    await runner.runNight();
    await runner.runWatchdog();
    expect(calls()).toHaveLength(0);
    expect(existsSync(resolve(T, 'relaunched.txt'))).toBe(false);
  });

  it('j) Telegram caído: el aviso queda pendiente y el watchdog lo reenvía', async () => {
    const { runner } = setup({ probe: probe({ seven: 0.7 }), agents: {} });
    delete process.env.CEO_FAKE_TELEGRAM;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_ADMIN_CHAT_ID;
    clock = at(2, 10);
    await runner.runNight();
    expect(night().notifications.some(n => !n.sent && /semanal/.test(n.text))).toBe(true);
    process.env.CEO_FAKE_TELEGRAM = resolve(T, 'telegram.jsonl');
    await runner.runWatchdog();
    expect(night().notifications.every(n => n.sent)).toBe(true);
    expect(telegram().some(m => /semanal/.test(m.text))).toBe(true);
  });

  it('k) violación en caliente (--no-verify) → sesión detenida, sin reintento, alerta P0', async () => {
    const { runner } = setup({ probe: probe(), agents: { a1: [{ kind: 'noverify' }], a2: [{ kind: 'ok' }] } });
    clock = at(2, 10);
    const t0 = Date.now();
    await runner.runNight();
    expect(job('r1:a1').status).toBe('failed_real');
    expect(job('r1:a1').attempts[0].violation).toBe('no-verify');
    expect(Date.now() - t0).toBeLessThan(4500 + 15000); // no esperó al "result" del falso (5 s) para a1... con margen de git
    expect(telegram().some(m => /no-verify/.test(m.text) && m.disable_notification === false)).toBe(true);
  });

  it('l) cola terminada de madrugada → el briefing sale a las 07:30, no a las 3 am', async () => {
    const { runner } = setup({ probe: probe({ fiveReset: at(2, 5) }), agents: { a1: [{ kind: 'ok' }], a2: [{ kind: 'ok' }], 'resumen-ceo': [{ kind: 'ok' }] } });
    clock = at(2, 3);
    await runner.runNight();
    expect(calls().map(x => x.agent)).toEqual(['a1', 'a2']);
    expect(night()).toMatchObject({ status: 'waiting', summaryOnly: true });
    expect(windows().tasks[RESUME_TASK].at).toBe(new Date(at(2, 7, 30)).toISOString());
    clock = at(2, 7, 31);
    await runner.runNight();
    expect(calls().map(x => x.agent)).toEqual(['a1', 'a2', 'resumen-ceo']);
    expect(night().status).toBe('done');
  });

  it('m) los agentes no reciben el token de Supabase y el .env.local de su worktree va filtrado', async () => {
    const reset = at(2, 12);
    const { runner } = setup({ probe: probe({ fiveReset: reset }), agents: { a1: [{ kind: 'limit_five', turns: 10, resetAt: reset }] } });
    process.env.SUPABASE_ACCESS_TOKEN = 'secreto';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc.supabase.co';
    clock = at(2, 10);
    await runner.runNight();
    const c = calls()[0];
    expect(c.hasAccessToken).toBe(false);
    expect(c.sqlProxy).toBe(true);
    const env = readFileSync(resolve(job('r1:a1').wtPath, '.env.local'), 'utf8');
    expect(env).not.toMatch(/SUPABASE_ACCESS_TOKEN/);
    expect(env).toMatch(/OTRA=1/);
  });

  it('n) segunda ronda solo si cabe bajo el techo semanal', async () => {
    const { runner } = setup({ probe: probe({ seven: 0.3, sevenReset: at(3, 11) }), agents: {} });
    clock = at(2, 10);
    await runner.runNight();
    expect(night().jobs.map(j => j.key)).toEqual(['r1:a1', 'r1:a2', 'r2:a1', 'r2:a2']);
  });

  it('o) error real con commits sin subir → la rama se sube a origin antes de borrar el worktree', async () => {
    const { runner, repo } = setup({ probe: probe(), agents: { a1: [{ kind: 'real', commit: true }], a2: [{ kind: 'ok' }] } });
    clock = at(2, 10);
    await runner.runNight();
    const branch = job('r1:a1').branch;
    expect(git(['ls-remote', '--heads', 'origin', branch], repo)).toContain(branch);
    expect(night().notifications.some(n => n.text.includes(branch))).toBe(true);
  });

  it('p) watchdog: la retoma programada no ocurrió (vencida >10 min) → relanza', async () => {
    const reset = at(2, 12);
    const { runner } = setup({ probe: probe({ fiveReset: reset }), agents: { a1: [{ kind: 'limit_five', turns: 10, commit: true, resetAt: reset }] } });
    clock = at(2, 10);
    await runner.runNight();
    expect(windows().tasks[RESUME_TASK]).toBeDefined(); // la tarea existe pero no disparó
    clock = reset + 30 * 60 * 1000;
    await runner.runWatchdog();
    await new Promise(r => setTimeout(r, 1500));
    expect(readFileSync(resolve(T, 'relaunched.txt'), 'utf8')).toBe('--night');
  });

  it('q) retoma con el directorio del worktree perdido pero la rama viva → recupera la rama', async () => {
    const reset = at(2, 12);
    const { runner, repo } = setup({ probe: probe({ fiveReset: reset }), agents: { a1: [{ kind: 'limit_five', turns: 10, commit: true, resetAt: reset }, { kind: 'ok' }], a2: [{ kind: 'ok' }] } });
    clock = at(2, 10);
    await runner.runNight();
    const { wtPath, branch } = job('r1:a1');
    const head = git(['rev-parse', branch], repo);
    execFileSync('cmd', ['/c', 'rmdir', resolve(wtPath, 'node_modules')]);
    rmSync(wtPath, { recursive: true, force: true });
    clock = reset + 5 * 60 * 1000;
    await runner.runNight();
    const c = calls();
    expect(c[1]).toMatchObject({ agent: 'a1', retoma: true });
    // Discrimina: el intento 2 corrió sobre la rama recuperada (con el commit del
    // intento 1), no sobre una rama nueva desde origin/main.
    // Al terminar "ok" la rama local se borra, pero el rescate la sube a origin con todo.
    git(['fetch', '-q', 'origin', branch], repo);
    expect(git(['log', '--format=%s', 'FETCH_HEAD'], repo)).toContain('avance 0');
    expect(git(['merge-base', '--is-ancestor', head, 'FETCH_HEAD'], repo)).toBe('');
    expect(job('r1:a1').status).toBe('ok');
  });
});
