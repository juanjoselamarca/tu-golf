// Check "evidencia de revisión" de los PRs nocturnos (Fase 1, 15-oct-2026): revisión con expediente,
// screenshots a 390 px claro/oscuro si toca pantallas y test de regresión si es un fix.
import { describe, it, expect } from 'vitest';
import { evaluar, esUI, MAX_LOC } from './evidencia-pr-nocturno.mjs';

const grande = (filename, n = MAX_LOC + 1) => ({ filename, additions: n, deletions: 0 });
const REVISION = '## Revisión\nrevisor-fable: APROBADO. Expediente: .claude/expedientes/2026-10-19-01-59.md\n';
const SHOTS = '## Screenshots 390 px\nClaro: ![claro](a.png) · Oscuro: ![oscuro](b.png)\n';

describe('evidencia-pr-nocturno · a quién aplica', () => {
  it('no aplica a ramas que no son de agentes nocturnos', () => {
    expect(evaluar({ branch: 'feat/algo-juanjo', files: [grande('src/a.ts')] }).aplica).toBe(false);
  });

  it('no aplica a los reverts automáticos del scheduler', () => {
    expect(evaluar({ branch: 'fix/ceo-revert-123', files: [grande('src/a.ts')] }).aplica).toBe(false);
  });

  it('no aplica a PRs nocturnos chicos; los lockfiles no suman', () => {
    const r = evaluar({ branch: 'fix/ceo-hunter-x', files: [grande('package-lock.json', 5000), grande('src/a.ts', MAX_LOC)] });
    expect(r).toMatchObject({ aplica: false, loc: MAX_LOC });
  });

  it('aplica a un PR nocturno sobre el umbral', () => {
    expect(evaluar({ branch: 'chore/ceo-data-quality-y', body: REVISION, files: [grande('scripts/a.mjs')] }))
      .toEqual({ aplica: true, loc: MAX_LOC + 1, faltas: [] });
  });
});

describe('evidencia-pr-nocturno · revisión', () => {
  const base = { branch: 'chore/ceo-e2e-writer-z', files: [grande('scripts/a.mjs')] };

  it('sin sección Revisión falla', () => {
    expect(evaluar({ ...base, body: 'APROBADO expediente' }).faltas).toHaveLength(1);
  });

  it('con CAMBIOS en vez de APROBADO falla', () => {
    const r = evaluar({ ...base, body: '## Revisión\nCAMBIOS. Expediente: x.md' });
    expect(r.faltas.join()).toMatch(/APROBADO/);
  });

  it('APROBADO fuera de la sección Revisión no cuenta', () => {
    const r = evaluar({ ...base, body: '## Resumen\nAPROBADO\n## Revisión\nExpediente: x.md\n' });
    expect(r.faltas.join()).toMatch(/APROBADO/);
  });

  it('sin expediente falla', () => {
    const r = evaluar({ ...base, body: '### Revision\nAPROBADO por el revisor' });
    expect(r.faltas.join()).toMatch(/expediente/);
  });
});

describe('evidencia-pr-nocturno · screenshots', () => {
  const ui = { branch: 'feat/ceo-qa-design-w', files: [grande('src/components/ronda/Hoyo.tsx')] };

  it('pantalla sin screenshots falla', () => {
    expect(evaluar({ ...ui, body: REVISION }).faltas.join()).toMatch(/390 px/);
  });

  it('solo claro (sin oscuro) falla', () => {
    expect(evaluar({ ...ui, body: REVISION + '390 px claro: ![a](a.png) ![b](b.png)' }).faltas).toHaveLength(1);
  });

  it('claro y oscuro a 390 px pasa', () => {
    expect(evaluar({ ...ui, body: REVISION + SHOTS }).faltas).toEqual([]);
  });

  it('un test de componente no exige screenshots', () => {
    expect(esUI('src/components/ronda/__tests__/Hoyo.test.tsx')).toBe(false);
    expect(esUI('src/app/torneo/[slug]/page.tsx')).toBe(true);
  });
});

describe('evidencia-pr-nocturno · test de regresión', () => {
  it('un fix sin test falla', () => {
    const r = evaluar({ branch: 'fix/ceo-hunter-q', body: REVISION, files: [grande('src/lib/a.ts')] });
    expect(r.faltas.join()).toMatch(/test de regresión/);
  });

  it('un fix con test pasa', () => {
    const r = evaluar({ branch: 'fix/ceo-hunter-q', body: REVISION, files: [grande('src/lib/a.ts'), grande('src/lib/a.test.ts', 10)] });
    expect(r.faltas).toEqual([]);
  });
});
