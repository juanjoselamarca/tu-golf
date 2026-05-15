import { describe, it, expect } from 'vitest';
import { parseTriageOutput } from './inbox-triage.mjs';

describe('parseTriageOutput', () => {
  it('parsea JSON válido con todos los campos', () => {
    const raw = '{"tipo":"tecnico-trivial","confidence":0.92,"razon":"contraste WCAG"}';
    const r = parseTriageOutput(raw);
    expect(r.tipo).toBe('tecnico-trivial');
    expect(r.confidence).toBe(0.92);
    expect(r.razon).toBe('contraste WCAG');
  });

  it('parsea JSON envuelto en code fences ```json', () => {
    const raw = '```json\n{"tipo":"visual","confidence":0.75,"razon":"diseño"}\n```';
    const r = parseTriageOutput(raw);
    expect(r.tipo).toBe('visual');
    expect(r.confidence).toBe(0.75);
  });

  it('parsea JSON con texto extra antes/después (modelo verbose)', () => {
    const raw = 'Análisis:\n{"tipo":"producto","confidence":0.6,"razon":"requiere decisión de UI"}\nFin.';
    const r = parseTriageOutput(raw);
    expect(r.tipo).toBe('producto');
  });

  it('throws si no hay JSON', () => {
    expect(() => parseTriageOutput('not json at all')).toThrow();
  });

  it('throws si tipo fuera de enum', () => {
    expect(() =>
      parseTriageOutput('{"tipo":"xxx","confidence":0.9,"razon":"a"}'),
    ).toThrow(/tipo inválido/);
  });

  it('clamp confidence a [0,1]', () => {
    expect(parseTriageOutput('{"tipo":"visual","confidence":1.5,"razon":"a"}').confidence).toBe(1);
    expect(parseTriageOutput('{"tipo":"visual","confidence":-0.5,"razon":"a"}').confidence).toBe(0);
  });

  it('confidence no numérica → 0', () => {
    expect(parseTriageOutput('{"tipo":"visual","confidence":"alto","razon":"a"}').confidence).toBe(0);
  });

  it('razon faltante → string vacío', () => {
    const r = parseTriageOutput('{"tipo":"visual","confidence":0.5}');
    expect(r.razon).toBe('');
  });
});
