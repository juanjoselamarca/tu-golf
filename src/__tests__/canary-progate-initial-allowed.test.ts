/**
 * TEST CANARIO — `initialAllowed` sólo donde el servidor ya autorizó.
 *
 * `<ProGate initialAllowed>` cortocircuita el gate del cliente: muestra el
 * contenido premium sin preguntar (ProGate.tsx). Es correcto SÓLO si la
 * page.tsx que renderiza ese componente ya decidió el acceso server-side con
 * `canAccessServer('<feature>', …)` — hoy /torneo/[slug]/en-vivo y /tv.
 *
 * Sin este canario, copiar `initialAllowed` a otra pantalla regala la feature
 * PRO a todo el mundo y ningún test lo nota (el componente renderiza feliz).
 *
 * Regla: cada archivo de src/ (no test, ≠ ProGate.tsx) que usa
 * `initialAllowed` tiene una page.tsx en su carpeta o en una ancestra (dentro
 * de src/app) que llama `canAccessServer(` con la MISMA feature del ProGate.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC = path.resolve(__dirname, '..')
const APP = path.join(SRC, 'app')
const PROGATE = path.join(SRC, 'components', 'billing', 'ProGate.tsx')

function sinComentarios(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function archivosFuente(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === '__tests__' ? [] : archivosFuente(p)
    return /\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) ? [p] : []
  })
}

/** Features de cada `<ProGate … initialAllowed …>` del código (null si no se puede leer la feature). */
function featuresConInitialAllowed(code: string): Array<string | null> {
  const limpio = sinComentarios(code)
  if (!/\binitialAllowed\b/.test(limpio)) return []
  const aperturas = limpio.match(/<ProGate\b[^>]*?>/g) ?? []
  const conFlag = aperturas.filter((tag) => /\binitialAllowed\b/.test(tag))
  // initialAllowed fuera de un tag <ProGate …> legible (spread, wrapper…) → no se puede verificar la feature.
  if (conFlag.length === 0) return [null]
  return conFlag.map((tag) => tag.match(/\bfeature=["'{]+([\w-]+)/)?.[1] ?? null)
}

/** page.tsx más cercana: la carpeta del archivo y sus ancestras, sin salir de src/app. */
function pageAncestras(archivo: string): string[] {
  const pages: string[] = []
  let dir = path.dirname(archivo)
  while (dir.startsWith(APP)) {
    const p = path.join(dir, 'page.tsx')
    if (fs.existsSync(p)) pages.push(p)
    if (dir === APP) break
    dir = path.dirname(dir)
  }
  return pages
}

function violaciones(archivo: string, code: string, leer: (p: string) => string, pages: string[]): string[] {
  const features = featuresConInitialAllowed(code)
  return features.flatMap((feature) => {
    if (feature === null) return [`${archivo}: initialAllowed sin <ProGate feature="…"> legible`]
    const autoriza = pages.some((p) =>
      new RegExp(String.raw`canAccessServer\(\s*['"]${feature}['"]`).test(sinComentarios(leer(p))),
    )
    return autoriza ? [] : [`${archivo}: <ProGate feature="${feature}" initialAllowed> sin canAccessServer('${feature}', …) en su page.tsx`]
  })
}

describe('Canario: <ProGate initialAllowed> exige autorización server-side', () => {
  const usos = archivosFuente(SRC)
    .filter((f) => f !== PROGATE)
    .filter((f) => featuresConInitialAllowed(fs.readFileSync(f, 'utf8')).length > 0)

  it('encuentra los usos conocidos (guard de cardinalidad: no pasa en vacío)', () => {
    const rel = usos.map((f) => path.relative(SRC, f).split(path.sep).join('/'))
    expect(rel).toEqual(expect.arrayContaining([
      'app/torneo/[slug]/en-vivo/LiveView.tsx',
      'app/torneo/[slug]/tv/TVBoard.tsx',
    ]))
  })

  it('cada uso tiene una page.tsx ancestra con canAccessServer de la misma feature', () => {
    const fallas = usos.flatMap((f) =>
      violaciones(path.relative(SRC, f), fs.readFileSync(f, 'utf8'), (p) => fs.readFileSync(p, 'utf8'), pageAncestras(f)),
    )
    expect(fallas, fallas.join('\n')).toEqual([])
  })

  it('el detector discrimina: sin canAccessServer, o con otra feature, falla', () => {
    const comp = `<ProGate feature="leaderboard-live" initialAllowed fallback={null}>x</ProGate>`
    const leer = (p: string) => ({
      ok: `if (!(await canAccessServer('leaderboard-live', supabase, user.id))) redirect('/')`,
      otra: `await canAccessServer('tournament-tv', supabase, user.id)`,
      nada: `export default function Page() { return null }`,
      comentada: `// canAccessServer('leaderboard-live', supabase, id)`,
    })[p] ?? ''
    expect(violaciones('X.tsx', comp, leer, ['ok'])).toEqual([])
    expect(violaciones('X.tsx', comp, leer, ['nada'])).toHaveLength(1)
    expect(violaciones('X.tsx', comp, leer, ['otra'])).toHaveLength(1)
    expect(violaciones('X.tsx', comp, leer, ['comentada'])).toHaveLength(1)
    expect(violaciones('X.tsx', comp, leer, [])).toHaveLength(1)
    expect(violaciones('X.tsx', `const p = { initialAllowed: true }`, leer, ['ok'])).toHaveLength(1)
  })
})
