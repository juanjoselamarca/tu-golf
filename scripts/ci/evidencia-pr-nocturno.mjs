#!/usr/bin/env node
/**
 * scripts/ci/evidencia-pr-nocturno.mjs — un PR de agente nocturno no se mergea sin evidencia (Fase 1, 15-oct-2026).
 *
 * Por qué: las reglas en papel (night-rules.md) no alcanzaron. Hubo PRs nocturnos mergeados sin code review,
 * fixes de UI sin un solo screenshot y "arreglos" sin test que los proteja. Este check lo exige en el CI:
 *
 *   Aplica a ramas de agentes nocturnos (scripts/lib/rama-nocturna.mjs; los reverts automáticos no) con más
 *   de MAX_LOC líneas cambiadas (sin contar lockfiles). Exige, en la descripción del PR:
 *     1. Revisión: una sección "Revisión" cuyo último veredicto sea APROBADO, con la ruta del expediente
 *        (`.claude/expedientes/<fecha>.md`, de `node scripts/expediente-review.mjs`).
 *     2. Si toca pantallas (src/app o src/components: .tsx, .css o archivos de tema/estilos): screenshots a
 *        390 px en claro y en oscuro (imágenes o rutas .png; al menos 2, y las palabras claro/oscuro o light/dark).
 *   Y en el diff:
 *     3. Si es un fix (título `fix(…)`/`fix:` o rama `fix/`): al menos un test (.test./.spec.), el de regresión.
 *        Un fix solo visual (todo lo no-test son pantallas) se prueba con los screenshots del punto 2.
 *
 * Que la rama sea nocturna lo garantiza el scheduler: un agente que crea o empuja otra rama se detiene en el
 * acto (scripts/ceo/failure.mjs, rama-fuera-de-la-noche). El check solo bloquea el merge si es obligatorio en
 * la protección de main ("Evidencia de revisión (PR nocturno)").
 *
 * Corre con pull_request_target (el script es SIEMPRE el de main: un PR no puede aflojarse su propio check)
 * y solo lee el PR por la API. Uso: GH_TOKEN, GITHUB_REPOSITORY y PR en el entorno → exit 0 ok · exit 1 falta evidencia.
 */

import { esRamaDeAgente } from '../lib/rama-nocturna.mjs';

export const MAX_LOC = 100;

const LOCKFILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;
const UI_FILE = /^src\/(app|components)\/.+(\.(tsx|css)|(theme|tokens|styles?|estilos)\.ts)$/i;
const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|mjs)$/;
const FIX_TITLE = /^fix(\(|:|!)/i;
const EXPEDIENTE = /expedientes\/[\w.-]+\.md/;

/** ¿El archivo es una pantalla (y no un test)? */
export const esUI = f => UI_FILE.test(f) && !TEST_FILE.test(f);

/**
 * Puro. `files`: [{ filename, additions, deletions }]. → { aplica, loc, faltas: string[] }
 */
export function evaluar({ branch = '', title = '', body = '', files = [] }) {
  if (!esRamaDeAgente(branch)) return { aplica: false, loc: 0, faltas: [] };
  const loc = files.filter(f => !LOCKFILE.test(f.filename)).reduce((n, f) => n + (f.additions || 0) + (f.deletions || 0), 0);
  if (loc <= MAX_LOC) return { aplica: false, loc, faltas: [] };

  const texto = body || '';
  const faltas = [];

  const seccion = texto.match(/^#{1,4}\s*Revisi[oó]n\b[\s\S]*?(?=^#{1,4}\s|(?![\s\S]))/im)?.[0] ?? '';
  if (!seccion) faltas.push('Falta la sección "## Revisión" con el veredicto del revisor y la ruta del expediente.');
  else {
    // El último veredicto manda: "CAMBIOS … (2ª vuelta) APROBADO" pasa; "APROBADO … luego CAMBIOS" no.
    const veredictos = seccion.match(/\b(APROBADO|CAMBIOS)\b/g) || [];
    if (veredictos.at(-1) !== 'APROBADO') faltas.push('La sección "Revisión" no termina en el veredicto APROBADO (con CAMBIOS no se mergea).');
    if (!EXPEDIENTE.test(seccion)) faltas.push('La sección "Revisión" no cita la ruta del expediente (.claude/expedientes/….md, de node scripts/expediente-review.mjs).');
  }

  const tocaUI = files.some(f => esUI(f.filename));
  if (tocaUI) {
    const imagenes = (texto.match(/!\[[^\]]*\]\([^)]+\)|<img\b[^>]*>|[\w./\\-]+\.png\b/gi) || []).length;
    const claroOscuro = /\b(claro|light)\b/i.test(texto) && /\b(oscuro|dark)\b/i.test(texto);
    if (imagenes < 2 || !claroOscuro || !/\b390\s?px\b/i.test(texto)) {
      faltas.push('Toca pantallas: faltan screenshots a 390 px en claro y en oscuro (imágenes o rutas .png en la descripción).');
    }
  }

  const esFix = FIX_TITLE.test(title) || /^fix\//.test(branch);
  const soloVisual = tocaUI && files.every(f => esUI(f.filename) || TEST_FILE.test(f.filename) || LOCKFILE.test(f.filename));
  if (esFix && !soloVisual && !files.some(f => TEST_FILE.test(f.filename))) {
    faltas.push('Es un fix y el diff no trae ningún test (.test./.spec.): agrega el test de regresión que falla sin el arreglo.');
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
    const r = evaluar({ branch: pr.head.ref, title: pr.title, body: pr.body, files });
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
