// Canario: el Índice Golfers+ (`profiles.indice_golfers`) se muestra SOLO en /perfil.
//
// Decisión de Juanjo (16-nov-2026): fuera del perfil, el índice del jugador es el
// oficial (`profiles.indice`), rotulado "Índice", y pasa por `indiceVisible`
// (src/golf/core/indice-visible.ts). La auditoría como usuario encontró el dashboard
// diciendo "HCP 10.4" (el Golfers+) y el perfil "Índice 8.5" (el oficial): el mismo
// jugador con dos índices según la pantalla.
//
// Alcance: código de pantallas (src/app fuera de api/ y src/components). Fuera de eso,
// `indice_golfers` vive legítimamente en la capa de datos, el motor y el coach.
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

/** /perfil es donde el Golfers+ se muestra, al lado del oficial y con su rótulo. */
const esPerfil = (ruta: string) => ruta.startsWith('src/app/perfil/')

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
  // Ranking con pestañas "Golfers+" / "Federación", cada una rotulada. Pendiente de
  // decisión de producto (¿se queda la pestaña Golfers+ fuera de /perfil?).
  'src/app/ranking/page.tsx': 'ranking rotulado, decisión pendiente',
}

const pantallas = archivos(join(ROOT, 'src'))
  .map((p) => ({ ruta: rel(p), src: readFileSync(p, 'utf8') }))
  .filter((f) => (f.ruta.startsWith('src/app/') && !f.ruta.startsWith('src/app/api/')) || f.ruta.startsWith('src/components/'))

describe('canario — el Índice Golfers+ se muestra solo en /perfil', () => {
  it('ninguna pantalla fuera de /perfil (salvo las permitidas) nombra indice_golfers', () => {
    const ofensores = pantallas
      .filter((f) => !esPerfil(f.ruta) && !(f.ruta in PERMITIDOS))
      .filter((f) => MENCIONA_INDICE_GOLFERS.test(sinComentarios(f.src)))
      .map((f) => f.ruta)
    expect(ofensores).toEqual([])
  })

  it('la lista de permitidos no tiene entradas muertas', () => {
    const vivos = new Set(pantallas.filter((f) => MENCIONA_INDICE_GOLFERS.test(sinComentarios(f.src))).map((f) => f.ruta))
    expect(Object.keys(PERMITIDOS).filter((r) => !vivos.has(r))).toEqual([])
  })

  it('el canario discrimina: marca una pantalla que pinta el Golfers+ y no un comentario', () => {
    expect(MENCIONA_INDICE_GOLFERS.test(sinComentarios('<span>{data.indiceGolfers}</span>'))).toBe(true)
    expect(MENCIONA_INDICE_GOLFERS.test(sinComentarios("select('indice_golfers')"))).toBe(true)
    expect(MENCIONA_INDICE_GOLFERS.test(sinComentarios('// igual que calcular_indice_golfers'))).toBe(false)
    expect(MENCIONA_INDICE_GOLFERS.test(sinComentarios('/* calcular_indice_golfers */ const x = 1'))).toBe(false)
  })

  it('el dashboard lee el índice oficial a través de indiceVisible', () => {
    for (const ruta of ['src/components/mi-golf/CompetenciaSection.tsx', 'src/components/mi-golf/IdentidadSection.tsx']) {
      expect(readFileSync(join(ROOT, ruta), 'utf8'), ruta).toMatch(/indiceVisible\(\{ indice: data\.indice \}\)/)
    }
  })
})
