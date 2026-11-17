// Canario: el Índice Golfers+ (`profiles.indice_golfers`) se muestra SOLO en /perfil.
//
// Decisión de Juanjo (16-nov-2026): fuera del perfil, el índice del jugador es el
// oficial (`profiles.indice`), rotulado "Índice", y pasa por `indiceVisible`
// (src/golf/core/indice-visible.ts). La auditoría como usuario encontró el dashboard
// diciendo "HCP 10.4" (el Golfers+) y el perfil "Índice 8.5" (el oficial): el mismo
// jugador con dos índices según la pantalla.
//
// Alcance: lo que llega a la pantalla — src/app fuera de api/, src/components, src/hooks
// y src/lib fuera de la capa de datos (data/, import/). `indice_golfers` vive legítimamente
// en la capa de datos, el motor (src/golf) y las API.
//
// Dos patrones, porque el Golfers+ puede llegar a la pantalla con otro nombre:
// 1. el nombre de la columna (`indice_golfers` / `indiceGolfers`);
// 2. el número rotulado en un texto armado (`Golfers+ ${...}`), como el aviso post-ronda,
//    que recibe el valor como `golfers` y nunca nombra la columna.
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

/** Sin comentarios: mencionar el RPC `calcular_indice_golfers` en un comentario no pinta nada. */
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const MENCIONA_INDICE_GOLFERS = /indice_golfers|indiceGolfers/

/** Número del Golfers+ armado en un texto visible: "Golfers+ 12.3". */
const ROTULA_NUMERO_GOLFERS = /Golfers\+\s*\$\{/

/**
 * /perfil (la pantalla, no sus subrutas /perfil/stats ni /perfil/historial) es donde el
 * Golfers+ se muestra, al lado del oficial y con su rótulo.
 */
const esPerfil = (ruta: string) => ruta === 'src/app/perfil/page.tsx' || ruta.startsWith('src/app/perfil/components/')

/**
 * Pantallas fuera de /perfil que hoy nombran el Golfers+, cada una con su porqué.
 * Agregar una entrada exige el mismo nivel de justificación.
 */
const PERMITIDOS: Record<string, string> = {
  // Herramienta interna: el admin compara los dos índices de cada usuario ("Indice G+").
  'src/app/admin/usuarios/page.tsx': 'admin',
  'src/app/admin/usuarios/[id]/page.tsx': 'admin',
  // Demo con datos ficticios del coach, rotulado "Índice Golfers+".
  'src/app/demo/taiger/page.tsx': 'demo',
  // Ranking con pestañas "Golfers+" / "Federación", cada una rotulada. Juanjo (16-nov-2026):
  // se queda así.
  'src/app/ranking/page.tsx': 'ranking rotulado',
  // Aviso al finalizar una ronda libre: los dos índices, cada uno rotulado ("Federación X ·
  // Golfers+ Y"). Decisión de Juanjo 09-nov-2026, ratificada el 16-nov-2026.
  'src/lib/ronda/aviso-indices-ronda.ts': 'aviso post-ronda rotulado',
}

const enAlcance = (ruta: string) =>
  (ruta.startsWith('src/app/') && !ruta.startsWith('src/app/api/')) ||
  ruta.startsWith('src/components/') ||
  ruta.startsWith('src/hooks/') ||
  (ruta.startsWith('src/lib/') && !ruta.startsWith('src/lib/data/') && !ruta.startsWith('src/lib/import/'))

const muestraGolfers = (src: string) => {
  const codigo = sinComentarios(src)
  return MENCIONA_INDICE_GOLFERS.test(codigo) || ROTULA_NUMERO_GOLFERS.test(codigo)
}

const pantallas = archivos(join(ROOT, 'src'))
  .map((p) => ({ ruta: rel(p), src: readFileSync(p, 'utf8') }))
  .filter((f) => enAlcance(f.ruta))

describe('canario — el Índice Golfers+ se muestra solo en /perfil', () => {
  it('ninguna pantalla fuera de /perfil (salvo las permitidas) nombra indice_golfers', () => {
    const ofensores = pantallas
      .filter((f) => !esPerfil(f.ruta) && !(f.ruta in PERMITIDOS))
      .filter((f) => muestraGolfers(f.src))
      .map((f) => f.ruta)
    expect(ofensores).toEqual([])
  })

  it('la lista de permitidos no tiene entradas muertas', () => {
    const vivos = new Set(pantallas.filter((f) => muestraGolfers(f.src)).map((f) => f.ruta))
    expect(Object.keys(PERMITIDOS).filter((r) => !vivos.has(r))).toEqual([])
  })

  it('el canario discrimina: marca una pantalla que pinta el Golfers+ y no un comentario', () => {
    expect(MENCIONA_INDICE_GOLFERS.test(sinComentarios('<span>{data.indiceGolfers}</span>'))).toBe(true)
    expect(MENCIONA_INDICE_GOLFERS.test(sinComentarios("select('indice_golfers')"))).toBe(true)
    expect(MENCIONA_INDICE_GOLFERS.test(sinComentarios('// igual que calcular_indice_golfers'))).toBe(false)
    expect(MENCIONA_INDICE_GOLFERS.test(sinComentarios('/* calcular_indice_golfers */ const x = 1'))).toBe(false)
    // El número rotulado en un texto, aunque llegue con otro nombre.
    expect(muestraGolfers('const m = `Golfers+ ${txt(golfers)}`')).toBe(true)
    expect(muestraGolfers("const t = 'Golfers+ se activa con 3 rondas'")).toBe(false)
    // Alcance: un helper de src/lib o src/hooks cuenta; la capa de datos no; las subrutas de /perfil tampoco son "perfil".
    expect(enAlcance('src/lib/ronda/x.ts')).toBe(true)
    expect(enAlcance('src/hooks/useX.ts')).toBe(true)
    expect(enAlcance('src/lib/data/x.ts')).toBe(false)
    expect(esPerfil('src/app/perfil/stats/components/StatsView.tsx')).toBe(false)
    expect(esPerfil('src/app/perfil/components/DualIndexCards.tsx')).toBe(true)
  })

  it('el dashboard lee el índice oficial a través de indiceVisible', () => {
    for (const ruta of ['src/components/mi-golf/CompetenciaSection.tsx', 'src/components/mi-golf/IdentidadSection.tsx']) {
      expect(readFileSync(join(ROOT, ruta), 'utf8'), ruta).toMatch(/indiceVisible\(\{ indice: data\.indice \}\)/)
    }
  })
})
