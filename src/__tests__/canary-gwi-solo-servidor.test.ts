// Canario: el GWI se calcula SÓLO en el servidor.
// Bug (plan 02-oct-2026, ítem 4): `calcularGWI` corría en el navegador, así que
// /api/gwi/* mandaba los inputs crudos — historial, promedio en la cancha y
// patrones del coach (back9Collapse, postBogeySpiral) de TODOS los rivales — a
// cualquier participante. Ahora la ruta responde `GWIResponse` (resultados
// públicos) y el cliente sólo pinta. Si alguien vuelve a calcular en el cliente,
// los inputs privados tienen que volver a viajar: este canario lo frena antes.
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

/** Nombres importados por un archivo, con su módulo. */
function importsDe(src: string): Array<{ nombres: string[]; modulo: string }> {
  const out: Array<{ nombres: string[]; modulo: string }> = []
  for (const m of src.matchAll(/import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    const nombres = (m[1].match(/[A-Za-z_$][\w$]*/g) ?? []).filter((n) => n !== 'type' && n !== 'as')
    out.push({ nombres, modulo: m[2] })
  }
  return out
}

const todos = archivos(join(ROOT, 'src')).map((p) => ({ ruta: rel(p), src: readFileSync(p, 'utf8') }))
const esCliente = (src: string) => /^\s*['"]use client['"]/.test(src)
/** Código que corre (o puede correr) en el navegador: src/app fuera de api/, src/components, y todo 'use client'. */
const delCliente = todos.filter(
  (f) => (f.ruta.startsWith('src/app/') && !f.ruta.startsWith('src/app/api/')) || f.ruta.startsWith('src/components/') || esCliente(f.src),
)

describe('canario — el GWI se calcula sólo en el servidor', () => {
  it('ningún archivo de src/app fuera de api/ (ni de src/components) importa calcularGWI', () => {
    const ofensores = delCliente.filter((f) => importsDe(f.src).some((i) => i.nombres.includes('calcularGWI')))
    expect(ofensores.map((f) => f.ruta)).toEqual([])
  })

  it('ningún archivo "use client" toca los inputs privados ni los arma', () => {
    const PROHIBIDOS = ['calcularGWI', 'construirRespuestaGWI', 'redactarGWIParaPublico', 'JugadorGWIInput', 'historialGWI', 'patronesGWI']
    const MODULOS_SERVIDOR = /(^|\/)(gwi-historial|gwi-ronda-libre|gwi-torneo)$|@\/lib\/data\/gwi$/
    const ofensores = todos
      .filter((f) => esCliente(f.src))
      .filter((f) => importsDe(f.src).some((i) => i.nombres.some((n) => PROHIBIDOS.includes(n)) || MODULOS_SERVIDOR.test(i.modulo)))
    expect(ofensores.map((f) => f.ruta)).toEqual([])
  })

  it('el cliente obtiene el GWI sólo por fetchGWIRondaLibre (respuesta pública)', () => {
    const fetchDirecto = delCliente.filter((f) => /fetch\(\s*[`'"][^`'"]*\/api\/gwi\//.test(f.src))
    expect(fetchDirecto.map((f) => f.ruta)).toEqual([])
  })

  it('calcularGWIMatch (que sí corre en el cliente) no usa historial ni patrones', () => {
    // Si su input sumara datos privados, tendría que pasar al servidor como calcularGWI.
    const fuente = readFileSync(join(ROOT, 'src/golf/stats/gwi-match.ts'), 'utf8')
    const input = fuente.slice(fuente.indexOf('export interface MatchGWIInput'), fuente.indexOf('export interface MatchGWIResult'))
    expect(input.length).toBeGreaterThan(0)
    expect(input).not.toMatch(/historical|pattern|patron|rounds|historial|courseAvg/i)
  })

  it('las rutas /api/gwi/* no devuelven `inputs`', () => {
    for (const ruta of ['src/app/api/gwi/ronda-libre/[codigo]/route.ts', 'src/app/api/gwi/torneo/[slug]/route.ts']) {
      const src = readFileSync(join(ROOT, ruta), 'utf8')
      expect(src).not.toMatch(/\binputs\b/)
      expect(src).toMatch(/HEADERS_PRIVADO_NO_STORE/)
    }
  })

  it('el canario mira archivos reales (no pasa en vacío)', () => {
    expect(delCliente.length).toBeGreaterThan(100)
    expect(delCliente.some((f) => f.ruta === 'src/components/GWILeaderboard.tsx')).toBe(true)
  })
})
