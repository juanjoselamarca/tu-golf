import { describe, it, expect } from 'vitest';
import { resultadoDe, promptDiagnostico } from './incidente.mjs';

describe('diagnóstico automático — piezas puras', () => {
  it('resultadoDe toma el texto final de una sesión stream-json e ignora líneas parciales', () => {
    const salida = [
      '{"type":"system","subtype":"init"}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"pensando"}]}}',
      '{"type":"result","subtype":"success","result":"QUÉ PASÓ: x"}',
      '{"type":"res',
    ].join('\n');
    expect(resultadoDe(salida)).toBe('QUÉ PASÓ: x');
  });
  it('resultadoDe devuelve null si la sesión no terminó (timeout)', () => {
    expect(resultadoDe('{"type":"system"}\nSPAWN ERROR: x')).toBeNull();
  });
  it('el prompt exige formato fijo, no inventar y apunta a la evidencia', () => {
    const p = promptDiagnostico('C:/x/evidencia.json');
    expect(p).toContain('C:/x/evidencia.json');
    for (const s of ['QUÉ PASÓ', 'CAUSA MÁS PROBABLE', 'DESCARTADO', 'CONFIANZA', 'No inventes']) expect(p).toContain(s);
  });
});
