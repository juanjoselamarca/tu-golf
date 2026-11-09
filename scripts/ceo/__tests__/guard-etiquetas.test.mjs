// Candado nocturno (scripts/ceo/failure.mjs): etiquetas que solo pone un humano, archivos de guards y escrituras por
// PowerShell. Vuelta 15 del #665.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { GUARD_FILES, scanViolations } from '../failure.mjs';
import { PREFIJO_ETIQUETA } from '../../lib/nombre-migracion.mjs';

const ROOT = 'C:/x';
const uso = (name, input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const bash = command => uso('Bash', { command });
const ps = command => uso('PowerShell', { command });
const rules = out => scanViolations(out, { repoRoot: ROOT }).map(v => v.rule);

const MIG = `${PREFIJO_ETIQUETA}20261001000000`;
const ETIQUETAS = [['fable-reviewed', 'auto-label-fable'], [MIG, 'auto-label-migracion']];

describe('etiquetas que solo pone un humano: se juzga cada valor, en todas las formas de ponerla', () => {
  const formas = e => [
    `gh pr edit 7 --add-label ${e}`,
    `gh pr edit 7 --add-label=${e}`,
    `gh pr edit 7 --add-label otra --add-label ${e}`,
    `gh pr edit 7 --add-label "operador:juanjo,${e}"`,
    `GH_REPO=o/r gh pr edit 7 --add-label ${e}`,
    `env GH_REPO=o/r gh issue edit 7 --add-label ${e}`,
    `gh pr create --title t --body b --label ${e}`,
    `gh pr create -l ${e}`,
    `gh pr new --label=operador:juanjo,${e}`,
    `gh issue create --title t -l ${e}`,
    `gh api -X POST repos/o/r/issues/7/labels -f 'labels[]=${e}'`,
    `gh api -X PATCH repos/o/r/issues/7 -f 'labels[]=${e}'`,
    `gh api --method PATCH repos/o/r/issues/7 --raw-field labels[]=${e}`,
    `gh api -X PATCH repos/o/r/issues/7 --input - <<'JSON'\n{"labels":["${e}"]}\nJSON`,
  ];
  for (const [e, regla] of ETIQUETAS) {
    it.each(formas(e))(`%s → ${regla}`, cmd => {
      expect(rules(bash(cmd))).toContain(regla);
    });
    it(`también por PowerShell (${regla})`, () => {
      expect(rules(ps(`gh pr edit 7 --add-label ${e}`))).toContain(regla);
    });
  }

  it.each([
    'gh pr create --label operador:juanjo --body "falta fable-reviewed"',
    `gh pr create --label operador:juanjo --body "sin ${MIG}"`,
    'gh pr edit 7 --add-label operador:juanjo --body "fable-reviewed pendiente"',
    `gh pr list --label ${MIG}`,
    'gh pr view 7 --json labels',
    'gh pr edit 7 --add-label permitir-tocar-migracion',
    `gh api repos/o/r/issues/7 -f 'body=pedir ${MIG} a Juanjo'`,
  ])('no es violación: %s', cmd => {
    expect(rules(bash(cmd)).filter(r => r.startsWith('auto-label'))).toEqual([]);
  });
});

describe('GUARD_FILES', () => {
  it('todos están en .github/critical-zone-paths.txt (el PR que los toca exige review)', () => {
    const prefijos = readFileSync('.github/critical-zone-paths.txt', 'utf8').split(/\r?\n/)
      .map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    expect(GUARD_FILES.filter(g => !prefijos.some(p => g.startsWith(p.toLowerCase())))).toEqual([]);
  });

  it.each(GUARD_FILES)('Edit de %s es guard-editado', g => {
    expect(rules(uso('Edit', { file_path: `C:/ceo-worktrees/x/${g}` }))).toContain('guard-editado');
  });
});

describe('escrituras por PowerShell sobre un guard (con / o \\)', () => {
  const G = 'scripts\\ci\\migraciones-inmutables.mjs';
  it.each([
    `Set-Content -Path ${G} -Value ''`,
    `Add-Content ${G} 'x'`,
    `Clear-Content .github/workflows/ci.yml`,
    `'' | Out-File -FilePath ${G}`,
    `New-Item -ItemType File -Force .github\\workflows\\migraciones-prod.yml`,
    `Remove-Item .github\\critical-zone-paths.txt`,
    `Move-Item otro.yml .github\\workflows\\migraciones-inmutables.yml -Force`,
    `Copy-Item otro.mjs scripts\\lib\\nombre-migracion.mjs`,
    `Rename-Item scripts\\lib\\rama-nocturna.mjs x.mjs`,
    `del scripts\\ci\\evidencia-pr-nocturno.mjs`,
    `[IO.File]::WriteAllText('${G}', '')`,
    `[System.IO.File]::Delete('.github/workflows/critical-zone-guard.yml')`,
    `"x" > ${G}`,
  ])('%s → guard-editado', cmd => {
    expect(rules(ps(cmd))).toContain('guard-editado');
  });

  it.each([
    `Get-Content ${G}`,
    `Select-String -Path .github\\workflows\\ci.yml -Pattern verify`,
    'node scripts/ci/migraciones-inmutables.mjs --arbol=HEAD',
    `Set-Content -Path otro.txt -Value 'scripts/ci/x.mjs'`,
  ])('leer o correr no es editar: %s', cmd => {
    expect(rules(ps(cmd))).toEqual([]);
  });
});
