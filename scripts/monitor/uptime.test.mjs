import { describe, it, expect } from 'vitest';
import { nextState, downMessage, upMessage, FAILS_TO_ALERT } from './uptime.mjs';

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
    expect(r.state).toEqual({ fails: 0, down: false, downSince: null });
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
