// GUARD_FILES (scripts/ceo/failure.mjs): los archivos de los guards del CI, incluido el de migraciones mergeadas
// intactas (#665). Editarlos de noche es `guard-editado`, y todos están en zona crítica.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { GUARD_FILES, scanViolations } from '../failure.mjs';

const uso = (name, input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const rules = out => scanViolations(out, { repoRoot: 'C:/x' }).map(v => v.rule);

describe('GUARD_FILES', () => {
  it('incluye los archivos del guard de migraciones', () => {
    for (const g of ['.github/workflows/migraciones-inmutables.yml', 'scripts/ci/migraciones-inmutables.mjs',
      'scripts/lib/nombre-migracion.mjs', '.github/workflows/ci.yml', 'scripts/lib/rama-nocturna.mjs',
      '.github/workflows/migraciones-prod.yml']) expect(GUARD_FILES).toContain(g);
  });

  it('todos están en .github/critical-zone-paths.txt (el PR que los toca exige review)', () => {
    const prefijos = readFileSync('.github/critical-zone-paths.txt', 'utf8').split(/\r?\n/)
      .map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    expect(GUARD_FILES.filter(g => !prefijos.some(p => g.startsWith(p.toLowerCase())))).toEqual([]);
  });

  it.each(GUARD_FILES)('Edit de %s es guard-editado', g => {
    expect(rules(uso('Edit', { file_path: `C:/ceo-worktrees/x/${g}` }))).toContain('guard-editado');
  });

  it.each(GUARD_FILES)('rm %s por Bash es guard-editado', g => {
    expect(rules(uso('Bash', { command: `rm ${g}` }))).toContain('guard-editado');
  });
});
