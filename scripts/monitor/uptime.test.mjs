import { describe, it, expect } from 'vitest';
import {
  nextState, downMessage, upMessage, FAILS_TO_ALERT, sanitizeState, afterSend, ghaDecision, ghaExitCode, pickPreviousConclusion,
  debeReiniciar, aplicarReinicio, RESTART_COOLDOWN_MS, MAX_REINICIOS_POR_CAIDA, ESTADOS_EN_TRANSICION,
} from './uptime.mjs';

const T0 = Date.parse('2026-10-02T22:35:00Z'); // 19:35 Chile
const MIN = 60_000;

describe('monitor de caídas — máquina de estados', () => {
  it('un chequeo fallido aislado NO alerta (blip)', () => {
    const r = nextState({}, false, T0);
    expect(r.alert).toBeNull();
    expect(nextState(r.state, true, T0 + 5 * MIN).alert).toBeNull();
  });
  it(`${FAILS_TO_ALERT} fallas seguidas → alerta de caída una sola vez, con la hora de la primera falla`, () => {
    let s = nextState({}, false, T0).state;
    const r = nextState(s, false, T0 + 5 * MIN);
    expect(r.alert).toBe('down');
    expect(r.state.downSince).toBe(T0);
    s = r.state;
    expect(nextState(s, false, T0 + 10 * MIN).alert).toBeNull(); // no repite
  });
  it('al volver avisa "volvió" con la duración, y el estado se reinicia', () => {
    let s = nextState({}, false, T0).state;
    s = nextState(s, false, T0 + 5 * MIN).state;
    const r = nextState(s, true, T0 + 260 * MIN);
    expect(r.alert).toBe('up');
    expect(r.downSince).toBe(T0);
    expect(r.state).toEqual({ fails: 0, down: false, downSince: null, firstFail: null });
    expect(upMessage(r.downSince, T0 + 260 * MIN, 'monitor PC')).toContain('~260 min');
  });
  it('el mensaje de caída dice qué falló y desde cuándo (hora de Chile)', () => {
    const msg = downMessage([
      { name: 'web', ok: true, detail: '200 en 230 ms' },
      { name: 'db', ok: false, detail: 'sin respuesta en 15 s' },
    ], T0, 'monitor PC');
    expect(msg).toContain('desde 19:35');
    expect(msg).toContain('❌ db: sin respuesta en 15 s');
    expect(msg).toContain('✅ web');
    expect(msg).toContain('Runbook');
  });
});

describe('monitor — estado corrupto, reintento de aviso y modo GitHub', () => {

  it('estado corrupto no silencia la alerta', () => {
    expect(sanitizeState({ fails: NaN, down: 'false', downSince: 'x' })).toEqual({ fails: 0, down: false, downSince: null, firstFail: null });
    let s = nextState({ fails: 'x', down: 'true' }, false, T0).state;
    expect(nextState(s, false, T0 + 5 * MIN).alert).toBe('down');
  });

  it('si el aviso de caída no salió (Telegram caído), se reintenta en el próximo chequeo', () => {
    let s = nextState({}, false, T0).state;
    const n = nextState(s, false, T0 + 5 * MIN);
    s = afterSend(n, false);
    expect(nextState(s, false, T0 + 10 * MIN).alert).toBe('down');
  });

  it('si el "volvió" no salió, se reintenta', () => {
    let s = nextState({}, false, T0).state;
    s = nextState(s, false, T0 + 5 * MIN).state;
    const n = nextState(s, true, T0 + 20 * MIN);
    s = afterSend(n, false);
    expect(nextState(s, true, T0 + 25 * MIN).alert).toBe('up');
  });

  it('GitHub: avisa en cambios, la conclusión significa "caída avisada"', () => {
    expect(ghaDecision({ ok: false, prev: 'success' }).alert).toBe('down');
    expect(ghaDecision({ ok: false, prev: 'failure' }).alert).toBeNull();
    expect(ghaDecision({ ok: true, prev: 'failure' }).alert).toBe('up');
    expect(ghaDecision({ ok: true, prev: 'success' }).alert).toBeNull();
    expect(ghaExitCode({ ok: false, alert: 'down', sent: true })).toBe(1);
    expect(ghaExitCode({ ok: false, alert: 'down', sent: false })).toBe(0); // reintenta
    expect(ghaExitCode({ ok: true, alert: 'up', sent: false })).toBe(1);    // reintenta el "volvió"
    expect(ghaExitCode({ ok: false, alert: null, sent: true })).toBe(1);
  });
});

describe('modo GitHub — conclusión de la corrida anterior', () => {
  it('ignora canceladas, timeouts y la corrida propia', () => {
    const runs = [
      { id: 9, conclusion: 'success' }, // yo
      { id: 8, conclusion: 'cancelled' },
      { id: 7, conclusion: 'timed_out' },
      { id: 6, conclusion: 'failure' },
      { id: 5, conclusion: 'success' },
    ];
    expect(pickPreviousConclusion(runs, 9)).toBe('failure');
  });
  it('sin historial → se asume arriba', () => {
    expect(pickPreviousConclusion([], 1)).toBe('success');
  });
});

describe('monitor de caídas — auto-reinicio (03-oct)', () => {
  // status 0 = timeout/red; ≥500 = base colgada; 4xx = la base responde.
  const r = (web, db, auth) => [
    { name: 'web', ok: web === 200, status: web, detail: '' },
    { name: 'db', ok: db === 200, status: db, detail: '' },
    { name: 'auth', ok: auth === 200, status: auth, detail: '' },
  ];
  const base = { down: true, results: r(200, 0, 504), apiDb: { healthy: false, status: 'ACTIVE_UNHEALTHY' }, lastRestart: null, reinicios: 0, now: T0 };
  it('base colgada confirmada, web arriba → reinicia (también sin poder leer la API de Supabase)', () => {
    expect(debeReiniciar(base).reiniciar).toBe(true);
    expect(debeReiniciar({ ...base, apiDb: null }).reiniciar).toBe(true);
  });
  it('sin caída confirmada no reinicia (un blip no basta)', () => {
    expect(debeReiniciar({ ...base, down: false }).reiniciar).toBe(false);
  });
  it('4xx no es base colgada (RLS, key vencida): no reinicia', () => {
    const d = debeReiniciar({ ...base, results: r(200, 401, 200) });
    expect(d.reiniciar).toBe(false);
    expect(d.motivo).toMatch(/4xx/);
  });
  it('si la web tampoco responde no reinicia: probable falta de internet del PC', () => {
    expect(debeReiniciar({ ...base, results: r(0, 0, 0) }).reiniciar).toBe(false);
  });
  it('si solo falla la web (Vercel) no reinicia la base', () => {
    expect(debeReiniciar({ ...base, results: r(503, 200, 200) }).reiniciar).toBe(false);
  });
  it('si Supabase dice sana, o ya la está levantando, no reinicia', () => {
    expect(debeReiniciar({ ...base, apiDb: { healthy: true, status: 'ACTIVE_HEALTHY' } }).reiniciar).toBe(false);
    for (const st of ESTADOS_EN_TRANSICION) expect(debeReiniciar({ ...base, apiDb: { healthy: false, status: st } }).reiniciar).toBe(false);
  });
  it('máximo un reinicio por hora', () => {
    expect(debeReiniciar({ ...base, lastRestart: T0 - 30 * MIN }).reiniciar).toBe(false);
    expect(debeReiniciar({ ...base, lastRestart: T0 - RESTART_COOLDOWN_MS }).reiniciar).toBe(true);
  });
  it(`tras ${MAX_REINICIOS_POR_CAIDA} reinicios en la misma caída escala a manual en vez de seguir`, () => {
    const d = debeReiniciar({ ...base, reinicios: MAX_REINICIOS_POR_CAIDA, lastRestart: T0 - 2 * RESTART_COOLDOWN_MS });
    expect(d).toMatchObject({ reiniciar: false, escalar: true });
  });
});

describe('monitor de caídas — aplicarReinicio (orden y avisos)', () => {
  const deps = (guardarOk, reiniciarRes) => {
    const orden = [];
    return {
      orden,
      guardar: () => { orden.push('guardar'); return guardarOk; },
      reiniciar: async () => { orden.push('reiniciar'); return reiniciarRes; },
      avisar: async t => { orden.push(`avisar:${[...t][0]}`); return true; },
    };
  };
  const estado = { lastRestart: null, reinicios: 0, escalado: false };
  it('guarda el estado ANTES de reiniciar y avisa que reinició', async () => {
    const d = deps(true, { ok: true, texto: 'HTTP 200' });
    const r = await aplicarReinicio({ decision: { reiniciar: true }, estado, now: T0, ...d });
    expect(d.orden).toEqual(['guardar', 'reiniciar', 'avisar:🔧']);
    expect(r).toEqual({ lastRestart: T0, reinicios: 1, escalado: false });
  });
  it('si no puede guardar el estado NO reinicia (evita reinicios en cadena) y pide acción manual', async () => {
    const d = deps(false, { ok: true, texto: '' });
    const r = await aplicarReinicio({ decision: { reiniciar: true }, estado, now: T0, ...d });
    expect(d.orden).toEqual(['guardar', 'avisar:⚠']);
    expect(r.lastRestart).toBeNull();
  });
  it('si el reinicio falla avisa que NO pudo (no dice "la reinicié")', async () => {
    const d = deps(true, { ok: false, texto: 'HTTP 401' });
    const r = await aplicarReinicio({ decision: { reiniciar: true }, estado, now: T0, ...d });
    expect(d.orden).toEqual(['guardar', 'reiniciar', 'avisar:❌']);
    expect(r.lastRestart).toBe(T0);
  });
  it('escalar avisa una sola vez', async () => {
    const d = deps(true, { ok: true, texto: '' });
    const r1 = await aplicarReinicio({ decision: { reiniciar: false, escalar: true }, estado: { ...estado, reinicios: 2 }, now: T0, ...d });
    const r2 = await aplicarReinicio({ decision: { reiniciar: false, escalar: true }, estado: r1, now: T0 + 5 * MIN, ...d });
    expect(d.orden.filter(x => x.startsWith('avisar'))).toHaveLength(1);
    expect(r2.escalado).toBe(true);
  });
});
