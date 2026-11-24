#!/usr/bin/env node
/**
 * Costo en código de una pantalla, para el asesor «simplificador» del `/consejo` (modo pantalla).
 *
 * Sigue los imports desde la page.tsx de una ruta (solo dentro de src/) y dice cuánto código sostiene la pantalla,
 * cuánto de eso está en zona crítica (`.github/critical-zone-paths.txt`) y qué tests lo cubren. Sirve para pesar
 * una simplificación: sacar una opción de la pantalla a veces borra cientos de líneas y sus casos borde.
 *
 * Uso:  node scripts/consejo/costo-pantalla.mjs /ronda-libre/nueva [/organizador/nuevo ...]
 *       (acepta también la ruta a un archivo: src/app/organizador/nuevo/page.tsx)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const RAIZ = process.cwd()
const EXTENSIONES = ['.tsx', '.ts', '.mjs', '.js']

/** Especificadores importados por un archivo (estáticos, dinámicos y re-exports). Pura. */
export function extraerImports(codigo) {
  const sinComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const salida = new Set()
  for (const re of [/\bfrom\s+['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /^\s*import\s+['"]([^'"]+)['"]/gm]) {
    for (const m of sinComentarios.matchAll(re)) salida.add(m[1])
  }
  return [...salida]
}

/** ¿El archivo (ruta relativa con /) cae en algún prefijo de zona crítica? Pura. */
export function enZonaCritica(archivo, prefijos) {
  return prefijos.some((p) => archivo === p || archivo.startsWith(p))
}

/** Prefijos de `.github/critical-zone-paths.txt` (sin comentarios ni líneas vacías). Pura. */
export function leerPrefijos(texto) {
  return texto.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
}

/** Área de un archivo para agrupar el costo. Pura. */
export function areaDe(archivo) {
  if (archivo.startsWith('src/golf/')) return 'motor de golf (src/golf)'
  if (archivo.startsWith('src/app/api/')) return 'API'
  if (archivo.startsWith('src/app/')) return 'pantalla (src/app)'
  if (archivo.startsWith('src/components/')) return 'componentes compartidos'
  if (archivo.startsWith('src/lib/')) return 'datos e infraestructura (src/lib)'
  return 'otros'
}

const aRel = (abs) => relative(RAIZ, abs).split(sep).join('/')

function resolverArchivo(base) {
  if (existsSync(base) && statSync(base).isFile()) return base
  for (const ext of EXTENSIONES) if (existsSync(base + ext)) return base + ext
  for (const ext of EXTENSIONES) {
    const idx = join(base, `index${ext}`)
    if (existsSync(idx)) return idx
  }
  return null
}

function resolverImport(desde, esp) {
  let base
  if (esp.startsWith('@/')) base = join(RAIZ, 'src', esp.slice(2))
  else if (esp.startsWith('.')) base = resolve(dirname(desde), esp)
  else return null // paquete de node_modules: no es código nuestro
  const abs = resolverArchivo(base)
  return abs && aRel(abs).startsWith('src/') ? abs : null
}

/**
 * La ruta de la app tal como la escribió quien llama. Git Bash convierte `/ronda-libre/nueva` en
 * `C:/Program Files/Git/ronda-libre/nueva` antes de que llegue a node: se deshace esa conversión. Pura.
 */
export function rutaDeLaApp(ruta) {
  return ruta.replace(/\\/g, '/').replace(/^[A-Za-z]:\/.*?\/Git\//, '/')
}

/** page.tsx de una ruta, aceptando segmentos dinámicos ([slug]) y grupos ((grupo)). */
export function paginaDeRuta(ruta) {
  if (/\.(tsx?|jsx?)$/.test(ruta)) return resolve(RAIZ, ruta)
  const partes = rutaDeLaApp(ruta).split('/').filter(Boolean)
  const buscar = (dir, resto) => {
    if (!resto.length) {
      const p = join(dir, 'page.tsx')
      return existsSync(p) ? p : null
    }
    if (!existsSync(dir)) return null
    const [seg, ...cola] = resto
    const hijos = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    const candidatos = [
      ...hijos.filter((h) => h === seg),
      ...hijos.filter((h) => /^\[.+\]$/.test(h)),
    ]
    for (const c of candidatos) {
      const r = buscar(join(dir, c), cola)
      if (r) return r
    }
    for (const g of hijos.filter((h) => /^\(.+\)$/.test(h))) {
      const r = buscar(join(dir, g), resto)
      if (r) return r
    }
    return null
  }
  return buscar(join(RAIZ, 'src', 'app'), partes)
}

/** Todos los archivos de src/ que la página arrastra (incluida ella). */
export function grafoDe(pagina) {
  const vistos = new Set()
  const pila = [pagina]
  while (pila.length) {
    const actual = pila.pop()
    if (vistos.has(actual)) continue
    vistos.add(actual)
    for (const esp of extraerImports(readFileSync(actual, 'utf8'))) {
      const dest = resolverImport(actual, esp)
      if (dest && !vistos.has(dest)) pila.push(dest)
    }
  }
  return vistos
}

function listarTests(dir, acc = []) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name)
    if (d.isDirectory()) {
      if (d.name !== 'node_modules') listarTests(p, acc)
    } else if (/\.(test|spec)\.(tsx?|mjs|js)$/.test(d.name)) acc.push(p)
  }
  return acc
}

const lineas = (abs) => readFileSync(abs, 'utf8').split('\n').filter((l) => l.trim()).length

function listarPaginas(dir, acc = []) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name)
    if (d.isDirectory()) listarPaginas(p, acc)
    // Toda raíz que arrastra código: pantallas, layouts y rutas de API. Un archivo que usa una ruta de API no es
    // «solo de esta pantalla» aunque una sola página lo importe.
    else if (/^(page|layout|route)\.(tsx|ts)$/.test(d.name)) acc.push(p)
  }
  return acc
}

let usosPorArchivo = null
/** Cuántas páginas de la app arrastran cada archivo. Se calcula una vez por corrida. */
function usosDeArchivos() {
  if (usosPorArchivo) return usosPorArchivo
  usosPorArchivo = new Map()
  for (const p of listarPaginas(join(RAIZ, 'src', 'app'))) {
    for (const a of grafoDe(p)) usosPorArchivo.set(a, (usosPorArchivo.get(a) ?? 0) + 1)
  }
  return usosPorArchivo
}

export function costoDeRuta(ruta, prefijos) {
  ruta = rutaDeLaApp(ruta)
  const pagina = paginaDeRuta(ruta)
  if (!pagina || !existsSync(pagina)) throw new Error(`no encontré la página de ${ruta}`)
  const archivos = [...grafoDe(pagina)].filter((a) => !/\.(test|spec)\./.test(a))
  const usos = usosDeArchivos()
  const filas = archivos
    .map((abs) => ({ archivo: aRel(abs), lineas: lineas(abs), paginas: usos.get(abs) ?? 1 }))
    .sort((a, b) => b.lineas - a.lineas)
  const conjunto = new Set(archivos)
  const tests = [...listarTests(join(RAIZ, 'src')), ...(existsSync(join(RAIZ, 'e2e')) ? listarTests(join(RAIZ, 'e2e')) : [])]
    .filter((t) => extraerImports(readFileSync(t, 'utf8')).some((esp) => {
      const dest = resolverImport(t, esp)
      return dest && conjunto.has(dest)
    }))
    .map(aRel)
  return { ruta, pagina: aRel(pagina), filas, tests, prefijos }
}

/** El costo como texto para el expediente. Pura. */
export function costoEnTexto({ ruta, pagina, filas, tests, prefijos }) {
  const total = filas.reduce((s, f) => s + f.lineas, 0)
  const criticos = filas.filter((f) => enZonaCritica(f.archivo, prefijos))
  const porArea = new Map()
  for (const f of filas) porArea.set(areaDe(f.archivo), (porArea.get(areaDe(f.archivo)) ?? 0) + f.lineas)
  // Zona crítica y motor de golf nunca cuentan como «se puede borrar con la pantalla»: se tocan con revisión aparte.
  const exclusivos = filas.filter((f) => f.paginas <= 1 && !enZonaCritica(f.archivo, prefijos) && !f.archivo.startsWith('src/golf/'))
  return [
    `## Costo en código de ${ruta}`,
    '',
    `Página: \`${pagina}\` · arrastra ${filas.length} archivos, ${total} líneas (sin tests) · ` +
      `${criticos.length} en zona crítica (${criticos.reduce((s, f) => s + f.lineas, 0)} líneas) · ${tests.length} archivos de test la cubren`,
    '',
    `**Solo esta pantalla: ${exclusivos.length} archivos, ${exclusivos.reduce((s, f) => s + f.lineas, 0)} líneas.** ` +
      'Es lo que se puede borrar o simplificar sin tocar otras pantallas ni rutas de API. No cuenta la zona ' +
      'crítica ni el motor de golf (se tocan aparte, con revisión) ni lo compartido, que no baja por simplificar esta.',
    '',
    '| Área | Líneas |',
    '|---|---|',
    ...[...porArea].sort((a, b) => b[1] - a[1]).map(([a, n]) => `| ${a} | ${n} |`),
    '',
    'Los 15 archivos más grandes que usa solo esta pantalla (★ = zona crítica):',
    ...exclusivos.slice(0, 15).map((f) => `- ${enZonaCritica(f.archivo, prefijos) ? '★ ' : ''}\`${f.archivo}\` — ${f.lineas}`),
    '',
    'Los 8 más grandes que comparte con otras pantallas:',
    ...filas.filter((f) => f.paginas > 1).slice(0, 8).map((f) => `- ${enZonaCritica(f.archivo, prefijos) ? '★ ' : ''}\`${f.archivo}\` — ${f.lineas} (en ${f.paginas} pantallas)`),
    '',
  ].join('\n')
}

async function main() {
  const rutas = process.argv.slice(2)
  if (!rutas.length) {
    console.error('uso: node scripts/consejo/costo-pantalla.mjs <ruta> [<ruta> ...]   p. ej. /ronda-libre/nueva')
    process.exit(2)
  }
  const prefijos = leerPrefijos(readFileSync(join(RAIZ, '.github', 'critical-zone-paths.txt'), 'utf8'))
  for (const ruta of rutas) console.log(costoEnTexto(costoDeRuta(ruta, prefijos)))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(`✘ costo-pantalla: ${e.message}`)
    process.exit(1)
  })
}
