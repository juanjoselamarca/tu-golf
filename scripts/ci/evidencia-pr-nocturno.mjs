#!/usr/bin/env node
/**
 * scripts/ci/evidencia-pr-nocturno.mjs — un PR de agente nocturno no se mergea sin evidencia (Fase 1, 15-oct-2026).
 *
 * Por qué: las reglas en papel (night-rules.md) no alcanzaron. Hubo PRs nocturnos mergeados sin code review,
 * fixes de UI sin un solo screenshot y "arreglos" sin test que los proteja. Este check lo exige en el CI:
 *
 *   Aplica a ramas de agentes nocturnos (`<prefijo>/ceo-<agente>-…`, salvo los reverts automáticos)
 *   con más de MAX_LOC líneas cambiadas (sin contar lockfiles). Exige, en la descripción del PR:
 *     1. Revisión: una sección "Revisión" con el veredicto APROBADO y la ruta del expediente
 *        (`node scripts/expediente-review.mjs`).
 *     2. Si toca pantallas (src/app o src/components, .tsx/.css): screenshots a 390 px en claro y en
 *        oscuro (imágenes o rutas .png; al menos 2, y las palabras claro/oscuro o light/dark).
 *   Y en el diff:
 *     3. Si la rama es `fix/`: al menos un archivo de test (el test de regresión del arreglo).
 *
 * Corre con pull_request_target (el script es SIEMPRE el de main: un PR no puede aflojarse su propio check)
 * y solo lee el PR por la API. Uso: GH_TOKEN, GITHUB_REPOSITORY y PR en el entorno → exit 0 ok · exit 1 falta evidencia.
 */

export const MAX_LOC = 100;

const NIGHT_BRANCH = /^[\w-]+\/ceo-(?!revert-)/;
const LOCKFILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;
const UI_FILE = /^src\/(app|components)\/.+\.(tsx|css)$/;
const TEST_FILE = /(\.(test|spec)\.(ts|tsx|js|mjs)$)|(^|\/)(__tests__|e2e)\//;

/** ¿El archivo es una pantalla (y no un test)? */
export const esUI = f => UI_FILE.test(f) && !TEST_FILE.test(f);

/**
 * Puro. `files`: [{ filename, additions, deletions }]. → { aplica, loc, faltas: string[] }
 */
export function evaluar({ branch = '', body = '', files = [] }) {
  if (!NIGHT_BRANCH.test(branch)) return { aplica: false, loc: 0, faltas: [] };
  const loc = files.filter(f => !LOCKFILE.test(f.filename)).reduce((n, f) => n + (f.additions || 0) + (f.deletions || 0), 0);
  if (loc <= MAX_LOC) return { aplica: false, loc, faltas: [] };

  const texto = body || '';
  const faltas = [];

  const seccion = texto.match(/^#{1,4}\s*Revisi[oó]n\b[\s\S]*?(?=^#{1,4}\s|(?![\s\S]))/im)?.[0] ?? '';
  if (!seccion) faltas.push('Falta la sección "## Revisión" con el veredicto del revisor y la ruta del expediente.');
  else {
    if (!/\bAPROBADO\b/.test(seccion)) faltas.push('La sección "Revisión" no tiene el veredicto APROBADO (con CAMBIOS no se mergea).');
    if (!/expediente/i.test(seccion)) faltas.push('La sección "Revisión" no cita la ruta del expediente (node scripts/expediente-review.mjs).');
  }

  if (files.some(f => esUI(f.filename))) {
    const imagenes = (texto.match(/!\[[^\]]*\]\([^)]+\)|<img\b[^>]*>|[\w./\\-]+\.png\b/gi) || []).length;
    const claroOscuro = /\b(claro|light)\b/i.test(texto) && /\b(oscuro|dark)\b/i.test(texto);
    if (imagenes < 2 || !claroOscuro || !/390/.test(texto)) {
      faltas.push('Toca pantallas: faltan screenshots a 390 px en claro y en oscuro (imágenes o rutas .png en la descripción).');
    }
  }

  if (/^fix\//.test(branch) && !files.some(f => TEST_FILE.test(f.filename))) {
    faltas.push('Es un fix y el diff no trae ningún test: agrega el test de regresión que falla sin el arreglo.');
  }

  return { aplica: true, loc, faltas };
}

async function api(path, token) {
  const out = [];
  for (let page = 1; ; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await fetch(`https://api.github.com${path}${sep}per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status} en ${path}`);
    const data = await res.json();
    if (!Array.isArray(data)) return data;
    out.push(...data);
    if (data.length < 100) return out;
  }
}

if (process.argv[1]?.endsWith('evidencia-pr-nocturno.mjs')) {
  const { GH_TOKEN, GITHUB_REPOSITORY, PR } = process.env;
  if (!GH_TOKEN || !GITHUB_REPOSITORY || !PR) {
    console.error('Faltan GH_TOKEN, GITHUB_REPOSITORY o PR.');
    process.exit(1);
  }
  try {
    const pr = await api(`/repos/${GITHUB_REPOSITORY}/pulls/${PR}`, GH_TOKEN);
    const files = await api(`/repos/${GITHUB_REPOSITORY}/pulls/${PR}/files`, GH_TOKEN);
    const r = evaluar({ branch: pr.head.ref, body: pr.body, files });
    if (!r.aplica) {
      console.log(r.loc ? `PR nocturno chico (${r.loc} líneas ≤ ${MAX_LOC}): sin exigencia de evidencia.` : 'No es un PR de agente nocturno.');
      process.exit(0);
    }
    if (!r.faltas.length) {
      console.log(`PR nocturno (${r.loc} líneas) con la evidencia completa.`);
      process.exit(0);
    }
    for (const f of r.faltas) console.log(`::error::${f}`);
    console.log('Completa la descripción del PR (gh pr edit <N> --body-file …): el check se vuelve a correr solo al editarla.');
    process.exit(1);
  } catch (e) {
    console.log(`::error::No pude leer el PR: ${e.message}`);
    process.exit(1);
  }
}
