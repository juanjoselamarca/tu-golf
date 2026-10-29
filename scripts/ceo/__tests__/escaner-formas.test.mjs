// Candado nocturno (scripts/ceo/failure.mjs): formas de escribir el mismo comando que el escáner léxico tiene que
// leer igual (líneas continuadas, env, comentarios, método HTTP, cuerpo de --input, flags agrupadas, alias y
// variables de PowerShell). Vuelta 16 del #665. Es DETECCIÓN de formas conocidas; el control duro es server-side
// (docs/claude/escaner-nocturno-limites.md).
import { describe, it, expect } from 'vitest';
import { scanViolations, etiquetasQuePone, commandSegments } from '../failure.mjs';

const ROOT = 'C:/x';
const uso = (name, input) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
const bash = command => uso('Bash', { command });
const ps = command => uso('PowerShell', { command });
const rules = out => scanViolations(out, { repoRoot: ROOT }).map(v => v.rule);

describe('P1-1: líneas continuadas', () => {
  it('Bash: barra invertida + salto une la línea', () => {
    expect(rules(bash('git push \\\n  --no-verify origin HEAD'))).toContain('no-verify');
    expect(rules(bash('gh pr edit 7 \\\n  --add-label fable-reviewed'))).toContain('auto-label-fable');
  });
  it('PowerShell: backtick + salto une la línea', () => {
    expect(rules(ps('git push `\n  --no-verify origin HEAD'))).toContain('no-verify');
    expect(rules(ps('gh pr edit 7 `\r\n  --add-label fable-reviewed'))).toContain('auto-label-fable');
  });
  it('un comentario que termina en barra no se une con la línea siguiente', () => {
    expect(rules(bash('# nota \\\ngit push --no-verify'))).toContain('no-verify');
  });
});

describe('P1-2: env y asignaciones delante del comando', () => {
  it.each([
    'env git push --no-verify',
    'env GIT_TRACE=1 git commit --no-verify -m x',
    'GIT_TRACE=1 env git push --no-verify',
    'env -i git push --no-verify',
  ])('%s → no-verify', cmd => {
    expect(rules(bash(cmd))).toContain('no-verify');
  });
  it('env delante de gh api --input también se juzga', () => {
    expect(rules(bash('env GH_TOKEN=x gh api -X PATCH repos/o/r/issues/7 --input cuerpo.json'))).toContain('etiqueta-sin-ver');
  });
  it('env delante de gh pr merge --admin', () => {
    expect(rules(bash('env gh pr merge 7 --admin'))).toContain('merge-admin');
  });
});

describe('P2-1: comentarios y posición de comando', () => {
  it.each([
    'git show origin/main:.github/workflows/ci.yml  # versión del workflow',
    'grep -c copy .github/workflows/ci.yml',
    'grep -n ren scripts/ci/migraciones-inmutables.mjs',
    'cat .github/workflows/ci.yml # sc ni ac',
  ])('leer no es editar: %s', cmd => {
    expect(rules(bash(cmd))).toEqual([]);
  });
  it('lo que está antes del comentario sí se juzga', () => {
    expect(rules(bash('rm .github/workflows/ci.yml # limpieza'))).toContain('guard-editado');
  });
  it('cmdlet dentro de un bloque o tras el operador de llamada', () => {
    expect(rules(ps('Get-ChildItem x | ForEach-Object { Remove-Item .github\\workflows\\ci.yml }'))).toContain('guard-editado');
    expect(rules(ps('& Remove-Item .github\\workflows\\ci.yml'))).toContain('guard-editado');
  });
});

describe('P2-2: gh api con método GET no pone etiquetas', () => {
  it.each([
    'gh api --method GET repos/o/r/issues -f labels=fable-reviewed',
    'gh api -X GET repos/o/r/issues -f labels=fable-reviewed',
    'gh api -XGET repos/o/r/issues --raw-field labels=fable-reviewed',
  ])('%s → nada', cmd => {
    expect(rules(bash(cmd))).toEqual([]);
  });
  it('GET sobre la protección de main es lectura', () => {
    expect(rules(bash('gh api -X GET repos/o/r/branches/main/protection -f per_page=1'))).toEqual([]);
  });
  it('sin método, los campos implican POST', () => {
    expect(rules(bash('gh api repos/o/r/issues/7/labels -f labels[]=fable-reviewed'))).toContain('auto-label-fable');
  });
});

describe('P2-3: gh api --input se juzga por la ruta', () => {
  it.each([
    'gh api -X PATCH repos/o/r/issues/7 --input cuerpo.json',
    'gh api -X POST repos/o/r/issues/7/labels --input=cuerpo.json',
    'gh api repos/o/r/issues --input cuerpo.json',
    'cat cuerpo.json | gh api -X PUT /repos/o/r/issues/7/labels --input -',
  ])('ruta que pone etiquetas sin cuerpo visible: %s → etiqueta-sin-ver', cmd => {
    expect(rules(bash(cmd))).toContain('etiqueta-sin-ver');
  });
  it('cuerpo visible con una etiqueta de humano', () => {
    const cmd = `gh api -X PATCH repos/o/r/issues/7 --input - <<'JSON'\n{"labels":["fable-reviewed"]}\nJSON`;
    expect(rules(bash(cmd))).toContain('auto-label-fable');
  });
  it('cuerpo visible sin etiquetas de humano', () => {
    const cmd = `gh api -X PATCH repos/o/r/issues/7 --input - <<'JSON'\n{"title":"fable-reviewed pendiente","labels":["operador:juanjo"]}\nJSON`;
    expect(rules(bash(cmd))).not.toContain('etiqueta-sin-ver');
    const sinLabels = `gh api -X PATCH repos/o/r/issues/7 --input - <<'JSON'\n{"title":"x"}\nJSON`;
    expect(rules(bash(sinLabels))).toEqual([]);
  });
  it.each([
    'gh api -X POST repos/o/r/statuses/abc --input cuerpo.json',
    'gh api -X PATCH repos/o/r/pulls/7 --input cuerpo.json',
  ])('otra ruta con --input no se juzga por etiquetas: %s', cmd => {
    expect(rules(bash(cmd))).not.toContain('etiqueta-sin-ver');
    expect(rules(bash(cmd))).not.toContain('auto-label-fable');
  });
  it('graphql: mutation de etiquetas visible, o cuerpo desde archivo', () => {
    expect(rules(bash(`gh api graphql -f query='mutation { addLabelsToLabelable(input: {labelableId: "x", labelIds: ["y"]}) { clientMutationId } }'`)))
      .toContain('etiqueta-sin-ver');
    expect(rules(bash('gh api graphql --input consulta.json'))).toContain('etiqueta-sin-ver');
    expect(rules(bash(`gh api graphql -f query='query { viewer { login } }'`))).toEqual([]);
  });
});

describe('P2-4: un solo parser de flags', () => {
  it.each([
    ['gh pr create -dl fable-reviewed', ['fable-reviewed']],
    ['gh pr create -dlfable-reviewed', ['fable-reviewed']],
    ['gh pr create -l a -l b,c', ['a', 'b', 'c']],
    ['gh api -X POST repos/o/r/issues/7/labels -flabels[]=x -F labels[]=y', ['x', 'y']],
  ])('%s', (cmd, esperado) => {
    expect(etiquetasQuePone(commandSegments(cmd)[0].tokens)).toEqual(esperado);
  });
});

describe('P2-5: alias de PowerShell, [IO.File] pegado y variables', () => {
  const G = '.github\\workflows\\ci.yml';
  it.each([
    `ri ${G}`, `rd ${G}`, `rmdir .github\\workflows\\ci.yml`, `cpi otro.yml ${G}`, `mi otro.yml ${G}`,
    `rni ${G} x.yml`, `clc ${G}`,
    `$null=[IO.File]::Delete('${G}')`, `([System.IO.File]::WriteAllText('${G}', ''))`, `[void][IO.File]::Delete('${G}')`,
  ])('%s → guard-editado', cmd => {
    expect(rules(ps(cmd))).toContain('guard-editado');
  });
  it('la ruta en una variable del mismo comando', () => {
    expect(rules(ps(`$p = '${G}'; Remove-Item $p`))).toContain('guard-editado');
    expect(rules(ps(`$P="scripts/ci/migraciones-inmutables.mjs"\nSet-Content -Path $p -Value ''`))).toContain('guard-editado');
    expect(rules(bash(`F=.github/workflows/ci.yml; rm "$F"`))).toContain('guard-editado');
    expect(rules(bash(`L=fable-reviewed; gh pr edit 7 --add-label "\${L}"`))).toContain('auto-label-fable');
  });
  it('una variable con otra ruta no dispara', () => {
    expect(rules(ps(`$p = 'otro.txt'; Remove-Item $p; Get-Content ${G}`))).toEqual([]);
  });
});
