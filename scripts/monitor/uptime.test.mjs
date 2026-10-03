import { describe, it, expect } from 'vitest';
import {
  nextState, downMessage, upMessage, FAILS_TO_ALERT, sanitizeState, afterSend, ghaDecision, ghaExitCode, pickPreviousConclusion,
  debeReiniciar, RESTART_COOLDOWN_MS,
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
  const r = (web, db, auth) => [
    { name: 'web', ok: web, detail: '' }, { name: 'db', ok: db, detail: '' }, { name: 'auth', ok: auth, detail: '' },
  ];
  const base = { down: true, results: r(true, false, false), dbSanaSegunApi: false, lastRestart: null, now: T0 };
  it('base caída confirmada, web arriba, API no dice sana → reinicia', () => {
    expect(debeReiniciar(base).reiniciar).toBe(true);
    expect(debeReiniciar({ ...base, dbSanaSegunApi: null }).reiniciar).toBe(true);
  });
  it('sin caída confirmada no reinicia (un blip no basta)', () => {
    expect(debeReiniciar({ ...base, down: false }).reiniciar).toBe(false);
  });
  it('si la web tampoco responde no reinicia: probable falta de internet del PC', () => {
    expect(debeReiniciar({ ...base, results: r(false, false, false) }).reiniciar).toBe(false);
  });
  it('si solo falla la web (Vercel) no reinicia la base', () => {
    expect(debeReiniciar({ ...base, results: r(false, true, true) }).reiniciar).toBe(false);
  });
  it('si la API de Supabase dice que la base está sana no reinicia', () => {
    expect(debeReiniciar({ ...base, dbSanaSegunApi: true }).reiniciar).toBe(false);
  });
  it('máximo un reinicio por hora', () => {
    expect(debeReiniciar({ ...base, lastRestart: T0 - 30 * MIN }).reiniciar).toBe(false);
    expect(debeReiniciar({ ...base, lastRestart: T0 - RESTART_COOLDOWN_MS }).reiniciar).toBe(true);
  });
});
