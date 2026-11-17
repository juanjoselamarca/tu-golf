// Canario: el estado de un torneo que se MUESTRA sale de una sola regla, `estadoDelTorneo`
// (src/golf/tournament-live-status.ts), vía `badgeDelTorneo` / `torneoEnVivo`.
//
// Auditoría como usuario del 16-nov-2026: torneos de abril seguían "EN CURSO" y el mismo
// torneo decía "Sin rondas en curso" arriba y "Jugando en: EN CURSO" abajo. Había seis
// predicados: status crudo, `diasRestantes < 0`, status + fecha sin date_end, mapas de
// labels por status en cada componente, etc.
//
// Alcance: lo que llega a la pantalla — src/app fuera de api/ y admin/, src/components,
// src/hooks y src/lib fuera de la capa de datos (data/). Quedan fuera las pantallas
// operativas del organizador (src/app/organizador/[slug]/): ahí los botones de
// iniciar/cerrar/reabrir y el scoring dependen del status ESCRITO (`badgeDelStatusEscrito`).
//
// Patrones prohibidos:
// 1. Comparar el status de un torneo con un valor literal (`tournament.status === 'in_progress'`).
// 2. Un mapa de labels por status (`in_progress: 'En vivo'`), como el que tenía el botón compartir.
// 3. Decidir "en curso" por días restantes negativos (`diasRestantes < 0`).
// Límite conocido: el patrón 1 mira el objeto (`tournament`, `torneo`, `t`, …); un `status`
// suelto recibido por props no se detecta. Revisar a mano en code review.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'

const ROOT = process.cwd()

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === '__tests__' || f === 'node_modules' ? [] : archivos(p)
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
}

const rel = (p: string) => relative(ROOT, p).split(sep).join('/')
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const STATUS_TORNEO = "(?:in_progress|active|open|closed|published|finished|draft)"
const OBJETO_TORNEO = '(?:tournament|tournamentInicial|torneo|t|row)'

const PATRONES: Array<{ nombre: string; re: RegExp }> = [
  {
    nombre: 'status del torneo comparado con un literal',
    re: new RegExp(`\\b${OBJETO_TORNEO}\\??\\.status\\s*[!=]==?\\s*'${STATUS_TORNEO}'`),
  },
  { nombre: 'mapa de labels por status', re: /\b(?:in_progress|published)\s*:\s*['"`]/ },
  { nombre: '"en curso" por días restantes negativos', re: /diasRestantes\s*<\s*0/ },
]

const enAlcance = (ruta: string) =>
  (ruta.startsWith('src/app/') && !ruta.startsWith('src/app/api/') && !ruta.startsWith('src/app/admin/') &&
    !ruta.startsWith('src/app/organizador/[slug]/')) ||
  ruta.startsWith('src/components/') ||
  ruta.startsWith('src/hooks/') ||
  (ruta.startsWith('src/lib/') && !ruta.startsWith('src/lib/data/'))

/**
 * Líneas que leen el status ESCRITO a propósito, cada una con su porqué. La excepción es
 * por LÍNEA (regex sobre la línea), no por archivo: el resto del archivo sigue vigilado.
 * Agregar una entrada exige el mismo nivel de justificación.
 */
const PERMITIDOS: Record<string, Array<{ linea: RegExp; porque: string }>> = {
  'src/app/torneo/[slug]/page.tsx': [
    {
      linea: /^\s*isClosed\s*=\s*tournament\.status === 'closed' \|\| tournament\.status === 'published'\s*$/,
      porque: 'podio y resultados oficiales solo con el torneo CERRADO por el organizador (tarjetas a medio anotar)',
    },
  ],
}

/** Hallazgos de un archivo: cada línea que matchea un patrón y no está permitida. */
function hallazgosDe(ruta: string, fuente: string): string[] {
  const permitidas = PERMITIDOS[ruta] ?? []
  const out: string[] = []
  sinComentarios(fuente).split('\n').forEach((linea, i) => {
    if (permitidas.some(({ linea: re }) => re.test(linea))) return
    for (const { nombre, re } of PATRONES) {
      if (re.test(linea)) out.push(`${ruta}:${i + 1}: ${nombre}`)
    }
  })
  return out
}

describe('canario: estado del torneo con una sola fuente (estadoDelTorneo)', () => {
  const rutas = ['src/app', 'src/components', 'src/hooks', 'src/lib']
    .flatMap((d) => archivos(join(ROOT, d)))
    .map((p) => ({ p, ruta: rel(p) }))
    .filter(({ ruta }) => enAlcance(ruta))

  it('el alcance no está vacío (el canario mira algo)', () => {
    expect(rutas.length).toBeGreaterThan(100)
    expect(rutas.some(({ ruta }) => ruta === 'src/components/mi-golf/CompetenciaTab.tsx')).toBe(true)
  })

  it('"¿se puede inscribir?" tiene una sola fuente (motivoNoInscribible/torneoInscribible), también en el servidor', () => {
    // Antes eran dos: `esInscribible`/`isInscribibleStatus` (solo status) y la ficha con status + fecha;
    // /unirse y el gate del servidor dejaban inscribir un `open` vencido que la ficha ya no ofrecía.
    const PREDICADO_SUELTO = /\b(?:esInscribible|isInscribibleStatus|INSCRIBIBLE_STATUSES)\b/
    const todo = ['src/app', 'src/components', 'src/hooks', 'src/lib']
      .flatMap((d) => archivos(join(ROOT, d)))
      .filter((p) => PREDICADO_SUELTO.test(sinComentarios(readFileSync(p, 'utf8'))))
      .map(rel)
    expect(todo, 'Usa torneoInscribible / motivoNoInscribible (src/golf/tournament-status.ts)').toEqual([])
  })

  it('ninguna pantalla decide el estado de un torneo con un predicado propio', () => {
    const hallazgos: string[] = []
    for (const { p, ruta } of rutas) hallazgos.push(...hallazgosDe(ruta, readFileSync(p, 'utf8')))
    expect(hallazgos, 'Usa estadoDelTorneo / badgeDelTorneo / torneoEnVivo (src/golf/tournament-live-status.ts)').toEqual([])
  })

  it('cada línea permitida sigue existiendo (si ya no, sale la entrada)', () => {
    for (const [ruta, lineas] of Object.entries(PERMITIDOS)) {
      const r = rutas.find((x) => x.ruta === ruta)
      expect(r, ruta).toBeDefined()
      const src = sinComentarios(readFileSync(r!.p, 'utf8')).split('\n')
      for (const { linea } of lineas) expect(src.some((l) => linea.test(l)), `${ruta} ${linea}`).toBe(true)
    }
  })

  it('la excepción es por línea: habría cazado la pestaña "En vivo" por status escrito (vuelta 1 de Fable)', () => {
    const antes = [
      "    isClosed       = tournament.status === 'closed' || tournament.status === 'published'",
      "          showLiveTab={isLive || (tournament.status === 'in_progress')}",
    ].join('\n')
    expect(hallazgosDe('src/app/torneo/[slug]/page.tsx', antes)).toEqual([
      'src/app/torneo/[slug]/page.tsx:2: status del torneo comparado con un literal',
    ])
  })

  it('los patrones cazan los predicados que causaron el bug', () => {
    const [literal, mapa, dias] = PATRONES.map((x) => x.re)
    expect(literal.test("const isLive = t.status === 'in_progress'")).toBe(true)
    expect(literal.test("tournament?.status !== 'closed'")).toBe(true)
    expect(literal.test("match.status === 'in_progress'")).toBe(false)
    expect(mapa.test("const L = { in_progress: 'En vivo' }")).toBe(true)
    expect(dias.test("t.diasRestantes < 0 ? 'En curso'")).toBe(true)
  })
})
