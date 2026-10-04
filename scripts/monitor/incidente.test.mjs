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

import { resumirEstadoSupabase } from './evidencia.mjs'

describe('resumirEstadoSupabase', () => {
  it('resume incidentes abiertos y componentes degradados del status page', () => {
    const r = resumirEstadoSupabase({
      status: { description: 'Partially Degraded Service' },
      incidents: [{ name: 'Intermittent latency in Eastern US', status: 'identified', impact: 'minor', created_at: '2026-10-02T21:00:00Z', updated_at: '2026-10-02T21:06:20Z' }],
      components: [{ name: 'API Gateway', status: 'degraded_performance' }, { name: 'Database', status: 'operational' }],
    })
    expect(r.estado).toBe('Partially Degraded Service')
    expect(r.incidentes_abiertos[0].nombre).toContain('Eastern US')
    expect(r.componentes_con_problemas).toEqual([{ nombre: 'API Gateway', estado: 'degraded_performance' }])
  })

  it('sin datos no explota', () => {
    expect(resumirEstadoSupabase(null)).toEqual({ estado: null, incidentes_abiertos: [], componentes_con_problemas: [] })
  })

  it('el prompt del diagnóstico pide mirar el estado del proveedor', () => {
    expect(promptDiagnostico('x')).toContain('estado_supabase')
  })
})
