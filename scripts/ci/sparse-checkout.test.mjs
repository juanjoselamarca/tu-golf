// Canario: un workflow con `sparse-checkout` baja sólo algunas rutas del repo. Si un script que corre ahí
// importa un archivo que quedó fuera, el job muere con ERR_MODULE_NOT_FOUND. Pasó con el monitor de caídas
// (uptime.yml) del 03 al 09-oct-2026: importaba scripts/lib/supabase-ref.mjs, que no estaba en la lista, y
// la alerta de GitHub no vigiló nada durante 6 días. Este test sigue los imports relativos de cada script
// `node <archivo>` del workflow y exige que todos caigan dentro de lo que el checkout baja.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WF_DIR = join(ROOT, '.github', 'workflows');
const rel = (p) => relative(ROOT, p).split(sep).join('/');

/** Rutas del bloque `sparse-checkout:` (valor en línea o bloque `|`). */
export function rutasSparse(yml) {
  const lineas = yml.split(/\r?\n/);
  const i = lineas.findIndex((l) => /^\s*sparse-checkout:/.test(l));
  if (i < 0) return null;
  const enLinea = lineas[i].replace(/^\s*sparse-checkout:\s*/, '').trim();
  if (enLinea && enLinea !== '|') return [enLinea];
  const sangria = lineas[i + 1]?.match(/^\s*/)?.[0].length ?? 0;
  const out = [];
  for (let j = i + 1; j < lineas.length; j++) {
    const l = lineas[j];
    if (!l.trim()) continue;
    if ((l.match(/^\s*/)?.[0].length ?? 0) < sangria) break;
    out.push(l.trim());
  }
  return out;
}

/** Scripts que el workflow ejecuta con `node <ruta>`. */
export function scriptsEjecutados(yml) {
  return [...yml.matchAll(/\bnode\s+(?:--[\w-]+(?:=\S+)?\s+)*((?:\.\/)?[\w./-]+\.m?js)\b/g)].map((m) => m[1].replace(/^\.\//, ''));
}

/** Cierre transitivo de imports relativos (estáticos y dinámicos con literal). */
export function cierreDeImports(archivoRel) {
  const vistos = new Set();
  const pila = [archivoRel];
  while (pila.length) {
    const actual = pila.pop();
    if (vistos.has(actual)) continue;
    vistos.add(actual);
    const abs = join(ROOT, actual);
    if (!existsSync(abs)) continue; // lo reporta el test como "no existe"
    const src = readFileSync(abs, 'utf8');
    for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"](\.\.?\/[^'"]+)['"]/g)) {
      pila.push(rel(resolve(dirname(abs), m[1])));
    }
  }
  return [...vistos];
}

const cubre = (rutas, archivo) => rutas.some((r) => archivo === r || archivo.startsWith(r.replace(/\/$/, '') + '/'));

describe('sparse-checkout: los scripts tienen todo lo que importan', () => {
  const workflows = readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f));
  const conSparse = workflows
    .map((f) => ({ f, yml: readFileSync(join(WF_DIR, f), 'utf8') }))
    .filter(({ yml }) => rutasSparse(yml));

  it('hay al menos un workflow con sparse-checkout (si no, el test no vigila nada)', () => {
    expect(conSparse.length).toBeGreaterThan(0);
  });

  for (const { f, yml } of conSparse) {
    it(`${f}: todo import de sus scripts está dentro del checkout`, () => {
      const rutas = rutasSparse(yml);
      const faltan = [];
      for (const script of scriptsEjecutados(yml)) {
        for (const archivo of cierreDeImports(script)) {
          if (!existsSync(join(ROOT, archivo))) faltan.push(`${archivo} (no existe en el repo)`);
          else if (!cubre(rutas, archivo)) faltan.push(`${archivo} (importado desde ${script})`);
        }
      }
      expect(faltan).toEqual([]);
    });
  }

  it('discrimina: la lista vieja de uptime.yml deja fuera scripts/lib/supabase-ref.mjs', () => {
    const vieja = ['scripts/monitor', 'scripts/ceo/telegram.mjs'];
    const imports = cierreDeImports('scripts/monitor/uptime.mjs');
    expect(imports.filter((a) => !cubre(vieja, a))).toContain('scripts/lib/supabase-ref.mjs');
  });
});
