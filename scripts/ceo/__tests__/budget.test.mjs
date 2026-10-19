import { describe, it, expect } from 'vitest';
import {
  phaseOf, weightedTokens, usdOf, createMeter, agentBudget, nightPoolUsd, calibrate, budgetPromptBlock,
  DEFAULT_STREAM_CORRECTION, DEFAULT_USD_PER_PCT, HARD_CAP,
} from '../budget.mjs';
import { createLoopDetector, isProgress, REPEAT_LIMIT, NO_PROGRESS_CALLS, GRACE_AFTER_WARNING } from '../loops.mjs';
import { hookMessage } from '../budget-hook.mjs';
import { classifyAttempt } from '../failure.mjs';

const assistant = (id, usage, model = 'claude-opus-5-5') => ({ type: 'assistant', message: { id, model, usage, content: [] } });

describe('budget — medidor', () => {
  it('fases por fracción gastada', () => {
    expect(phaseOf(0).key).toBe('explorar');
    expect(phaseOf(0.39).key).toBe('explorar');
    expect(phaseOf(0.4).key).toBe('ejecutar');
    expect(phaseOf(0.7).key).toBe('cerrar');
    expect(phaseOf(1).key).toBe('agotado');
    expect(phaseOf(3).key).toBe('agotado');
  });

  it('tokens ponderados: caché leída ×0,1, escritura 5 min ×1,25 / 1 h ×2, output ×5', () => {
    expect(weightedTokens({ input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 10 })).toBe(100 + 100 + 50);
    expect(weightedTokens({ cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 100 } })).toBe(125 + 200);
    // Sin desglose por duración se cuenta como 1 h (sobreestima, nunca subestima).
    expect(weightedTokens({ cache_creation_input_tokens: 100 })).toBe(200);
    expect(weightedTokens()).toBe(0);
  });

  it('Haiku cuesta menos que Opus; un modelo desconocido se cobra como Opus', () => {
    const u = { output_tokens: 1000 };
    expect(usdOf(u, 'claude-haiku-4-5')).toBeLessThan(usdOf(u, 'claude-opus-5-5'));
    expect(usdOf(u, 'modelo-nuevo')).toBe(usdOf(u, 'claude-opus-5-5'));
  });

  it('cuenta cada mensaje una sola vez aunque el stream lo repita por bloque', () => {
    const m = createMeter({ budgetUsd: 10 });
    const ev = assistant('msg1', { output_tokens: 100000 });
    m.ingest(ev); m.ingest(ev); m.ingest(ev);
    expect(m.state().rawUsd).toBeCloseTo(usdOf({ output_tokens: 100000 }), 10);
    expect(m.state().usd).toBeCloseTo(m.state().rawUsd * DEFAULT_STREAM_CORRECTION, 10);
  });

  it('el costo final del result reemplaza la estimación', () => {
    const m = createMeter({ budgetUsd: 10 });
    m.ingest(assistant('a', { output_tokens: 100000 }));
    m.ingest({ type: 'result', total_cost_usd: 4 });
    expect(m.state()).toMatchObject({ usd: 4, finalUsd: 4, fraction: 0.4, phase: 'ejecutar', overCap: false });
  });

  it('tope duro al 125 %', () => {
    const m = createMeter({ budgetUsd: 10 });
    m.ingest({ type: 'result', total_cost_usd: 10 * HARD_CAP });
    expect(m.state().overCap).toBe(true);
  });

  it('ignora eventos sin usage, sin id o que no son JSON de assistant', () => {
    const m = createMeter({ budgetUsd: 10 });
    m.ingest(null); m.ingest({ type: 'user' }); m.ingest({ type: 'assistant', message: { usage: { output_tokens: 9 } } });
    expect(m.state().usd).toBe(0);
  });
});

describe('budget — pozo y calibración', () => {
  it('el pozo se reparte entre los que faltan; lo que uno no usa pasa a los siguientes', () => {
    const pool = nightPoolUsd();
    expect(pool).toBeCloseTo(5 * DEFAULT_USD_PER_PCT, 10);
    expect(agentBudget({ poolUsd: 40, spentUsd: 0, agentsLeft: 4 })).toBe(10);
    expect(agentBudget({ poolUsd: 40, spentUsd: 4, agentsLeft: 3 })).toBe(12);
  });

  it('con menos de US$2 o sin agentes la noche se cierra', () => {
    expect(agentBudget({ poolUsd: 40, spentUsd: 38.5, agentsLeft: 1 })).toBeNull();
    expect(agentBudget({ poolUsd: 40, spentUsd: 0, agentsLeft: 0 })).toBeNull();
  });

  it('sin historial usa los valores medidos el 18-oct', () => {
    expect(calibrate([])).toEqual({ correction: DEFAULT_STREAM_CORRECTION, usdPerPct: DEFAULT_USD_PER_PCT });
  });

  it('recalibra con la mediana y acota a rangos sanos', () => {
    const rows = [
      { kind: 'attempt', rawUsd: 4, realUsd: 5.2 },
      { kind: 'attempt', rawUsd: 4, realUsd: 4.8 },
      { kind: 'attempt', rawUsd: 4, realUsd: 5.6 },
      { kind: 'attempt', rawUsd: 0.1, realUsd: 9 },          // muy chico: no cuenta
      { kind: 'night', usd: 60, sevenStart: 0.30, sevenEnd: 0.35 },
      { kind: 'night', usd: 60, sevenStart: 0.30, sevenEnd: 0.31 }, // <3 puntos: resolución insuficiente
    ];
    const c = calibrate(rows);
    expect(c.correction).toBeCloseTo(1.3, 5);
    expect(c.usdPerPct).toBeCloseTo(12, 5);
    expect(calibrate([{ kind: 'attempt', rawUsd: 1, realUsd: 9 }]).correction).toBe(2);
    expect(calibrate([{ kind: 'night', usd: 1000, sevenStart: 0, sevenEnd: 0.05 }]).usdPerPct).toBe(30);
  });

  it('el bloque del prompt dice cuánto tiene, las fases y el corte', () => {
    const t = budgetPromptBlock({ budgetUsd: 13.1, usdPerPct: 10.5 });
    expect(t).toMatch(/## PRESUPUESTO DE ESTA SESIÓN/);
    expect(t).toMatch(/US\$13\.1/);
    expect(t).toMatch(/1,2 % del semanal/);
    expect(t).toMatch(/70 % \(ejecutar\)/);
    expect(t).toMatch(/125 %/);
  });
});

describe('loops — vueltas en círculo', () => {
  let id = 0;
  const call = (det, name, input, result, fraction = 0) => {
    const tid = `t${id++}`;
    det.ingest({ type: 'assistant', message: { content: [{ type: 'tool_use', id: tid, name, input }] } }, { fraction });
    return det.ingest({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: tid, content: result }] } }, { fraction });
  };

  it('la misma llamada con el mismo resultado: aviso a la 3ª, corte a la 4ª', () => {
    const d = createLoopDetector();
    const tsc = () => call(d, 'Bash', { command: 'npx tsc --noEmit' }, 'error TS2322');
    for (let i = 1; i < REPEAT_LIMIT; i++) expect(tsc()).toBeNull();
    expect(tsc()).toMatchObject({ level: 'aviso', rule: 'repite' });
    expect(tsc()).toMatchObject({ level: 'corte', rule: 'repite' });
    expect(tsc()).toBeNull(); // ya cortado: no repite la señal
  });

  it('repetir con un resultado distinto (arreglando) no dispara', () => {
    const d = createLoopDetector();
    for (let i = 0; i < 6; i++) expect(call(d, 'Bash', { command: 'npx tsc --noEmit' }, `quedan ${6 - i} errores`)).toBeNull();
  });

  it('el orden de los argumentos no cambia la firma', () => {
    const d = createLoopDetector();
    call(d, 'Grep', { pattern: 'x', path: 'src' }, 'nada');
    call(d, 'Grep', { path: 'src', pattern: 'x' }, 'nada');
    expect(call(d, 'Grep', { pattern: 'x', path: 'src' }, 'nada')).toMatchObject({ level: 'aviso' });
  });

  it('sin avance solo cuenta pasada la exploración, y escribir lo resuelve', () => {
    const d = createLoopDetector();
    for (let i = 0; i < NO_PROGRESS_CALLS + 10; i++) expect(call(d, 'Read', { file_path: `f${i}` }, 'x', 0.2)).toBeNull();
    const hit = call(d, 'Read', { file_path: 'otro' }, 'x', 0.5);
    expect(hit).toMatchObject({ level: 'aviso', rule: 'sin-avance' });
    call(d, 'Edit', { file_path: 'a' }, 'ok', 0.5);
    for (let i = 0; i < GRACE_AFTER_WARNING + 5; i++) expect(call(d, 'Read', { file_path: `g${i}` }, 'x', 0.5)).toBeNull();
  });

  it('sin avance tras el aviso → corte', () => {
    const d = createLoopDetector();
    let hit = null;
    for (let i = 0; i < NO_PROGRESS_CALLS; i++) hit = call(d, 'Read', { file_path: `f${i}` }, 'x', 0.5) || hit;
    expect(hit).toMatchObject({ level: 'aviso', rule: 'sin-avance' });
    hit = null;
    for (let i = 0; i < GRACE_AFTER_WARNING; i++) hit = call(d, 'Read', { file_path: `g${i}` }, 'x', 0.5) || hit;
    expect(hit).toMatchObject({ level: 'corte', rule: 'sin-avance' });
  });

  it('qué cuenta como avance', () => {
    expect(isProgress('Edit')).toBe(true);
    expect(isProgress('Write')).toBe(true);
    expect(isProgress('Bash', { command: 'git commit -m "x"' })).toBe(true);
    expect(isProgress('Bash', { command: 'gh pr create --title x' })).toBe(true);
    expect(isProgress('Bash', { command: 'git status' })).toBe(false);
    expect(isProgress('Read')).toBe(false);
  });
});

describe('budget-hook — qué se le dice al agente', () => {
  const st = (fraction, extra = {}) => ({ budgetUsd: 10, usd: fraction * 10, fraction, phase: phaseOf(fraction).key, alert: null, ...extra });

  it('callado al partir; habla al 25 %, en cada cambio de fase y no repite', () => {
    let r = hookMessage(st(0.05));
    expect(r).toBeNull();
    r = hookMessage(st(0.1), {});
    expect(r).toBeNull();
    const first = hookMessage(st(0.26), {});
    expect(first.text).toMatch(/llevas 26 %/);
    expect(hookMessage(st(0.3), first.shown)).toBeNull();
    const exec = hookMessage(st(0.42), first.shown);
    expect(exec.text).toMatch(/Fase EJECUTAR/);
    const close = hookMessage(st(0.72), exec.shown);
    expect(close.text).toMatch(/Fase CERRAR/);
  });

  it('una alerta del detector se dice una vez', () => {
    const alert = { seq: 1, level: 'aviso', rule: 'repite', detail: 'Bash repetido 3 veces' };
    const r = hookMessage(st(0.1, { alert }), { phase: 'explorar', quarter: 0 });
    expect(r.text).toMatch(/Vueltas en círculo/);
    expect(hookMessage(st(0.1, { alert }), r.shown)).toBeNull();
  });

  it('sin presupuesto (sesión interactiva) no dice nada', () => {
    expect(hookMessage(null)).toBeNull();
    expect(hookMessage({ budgetUsd: 0, fraction: 0 })).toBeNull();
  });
});

describe('failure — cortes del presupuesto', () => {
  it('corte por bucle o por tope se clasifica como tal, no como error real', () => {
    expect(classifyAttempt({ output: '', code: 1, killed: false, cut: 'bucle' }).kind).toBe('cut_loop');
    expect(classifyAttempt({ output: '', code: 1, killed: false, cut: 'presupuesto' }).kind).toBe('cut_budget');
  });
});
