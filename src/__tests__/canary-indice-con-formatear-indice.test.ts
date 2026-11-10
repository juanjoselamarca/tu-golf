/**
 * CANARIO — un índice o hándicap se muestra con `formatearIndice` / `formatearHandicap`
 * (src/golf/handicap-index-range.ts).
 *
 * El plus se guarda negativo: pintado a mano sale "-1.0" o "(-1)" en vez de "+1.0" / "(+1)", la
 * notación del golf. PR #765 los pasó todos por el formateador canónico. Dos reglas, en src/app,
 * src/components, src/lib y src/golf (sin tests):
 *  1. `.toFixed(1)` cuyo receptor (identificador, o la llamada/paréntesis entero, justo antes) nombre
 *     un índice o un hándicap (`/indice|index|idx|hcp|handicap/i`).
 *  2. `{…}` en posición de hijo JSX (.tsx) o `${…}` de un template, cuyo VALOR MOSTRADO contenga
 *     `indice|indice_golfers|indiceGolfers|handicap_index|hcpDisplay` sin pasar por `formatear*`
 *     (se descartan las comparaciones `x != null`, `typeof x === '…'` y los strings literales).
 * Las excepciones legítimas van en PERMITIDOS: archivo + fragmento de la línea + cuántas veces calza
 * (`veces`) + su porqué. Si una excepción deja de calzar o calza otra cantidad, el test se cae.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC = path.resolve(__dirname, '..')
const RAICES = ['app', 'components', 'lib', 'golf']
const NOMBRE_INDICE = /(indice|index|idx|hcp|handicap)/i
const ID_MOSTRADO = /\b(indice|indice_golfers|indiceGolfers|handicap_index|hcpDisplay)\b/
const TOFIXED = '.toFixed(1)'

const PROMPT = 'texto para el modelo del coach, no UI; cambiarlo mueve los snapshots y el examen del coach: va en su propio PR'

/** Archivo (relativo a src/) + fragmento de la línea + veces que calza. Sin número de línea: se corre. */
const PERMITIDOS: Array<{ archivo: string; fragmento: string; veces: number; porque: string }> = [
  // Regla 1 (.toFixed(1))
  { archivo: 'components/GWIDisplay.tsx', fragmento: 'vsIndex.toFixed(1)', veces: 1, porque: 'delta con signo explícito (golpes vs esperado), no un índice' },
  { archivo: 'app/perfil/components/EditorialBlocks.tsx', fragmento: 'Math.abs(profile.indice - profile.indice_golfers).toFixed(1)', veces: 2, porque: 'distancia entre dos índices, siempre positiva (calza en las dos reglas)' },
  { archivo: 'lib/fedegolf/tarjetas.ts', fragmento: 'indiceDerivado.toFixed(1) === oficialDelMismoInstante.toFixed(1)', veces: 1, porque: 'compara dos números a la décima; no se muestra' },
  { archivo: 'lib/fedegolf/tarjetas.ts', fragmento: 'valor: indice.toFixed(1)', veces: 1, porque: 'paso de la cuenta (suma → promedio → truncado): va con el signo aritmético de los pasos anteriores' },
  { archivo: 'app/demo/taiger/page.tsx', fragmento: 'PLAYER.indiceGolfers.toFixed(1)', veces: 1, porque: 'maqueta con constantes positivas fijas, sin datos de usuario' },
  { archivo: 'app/demo/taiger/page.tsx', fragmento: 'PLAYER.indiceWHS.toFixed(1)', veces: 1, porque: 'maqueta con constantes positivas fijas, sin datos de usuario' },
  { archivo: 'app/demo/taiger/page.tsx', fragmento: '(-indiceDelta).toFixed(1)', veces: 1, porque: 'delta de la maqueta, con su signo escrito a mano' },
  // Regla 2 ({…} / ${…})
  { archivo: 'components/mi-golf/CompetenciaTab.tsx', fragmento: '{hcpDisplay}', veces: 1, porque: 'ya es texto: lo arma CompetenciaSection con formatearIndice' },
  { archivo: 'golf/coach/prompts/contexto.ts', fragmento: '`Índice actual: ${indice}`', veces: 1, porque: PROMPT },
  { archivo: 'golf/coach/prompts/contexto.ts', fragmento: 'aún sin índice oficial): ${indiceGolfers}`', veces: 1, porque: PROMPT },
  { archivo: 'golf/coach/prompts/contexto.ts', fragmento: '${indice ?? (indiceGolfers != null ?', veces: 2, porque: PROMPT },
  { archivo: 'golf/coach/v3/exam/build-exam-system.ts', fragmento: '${seed.handicap.indice}', veces: 1, porque: PROMPT },
  { archivo: 'golf/coach/v3/exam/mock-executor.ts', fragmento: 'DISTINTO del índice (${h.indice})', veces: 1, porque: PROMPT },
  { archivo: 'lib/data/coach-handicap.ts', fragmento: 'DISTINTO del índice (${indice})', veces: 1, porque: PROMPT },
  { archivo: 'lib/import/confirmar.ts', fragmento: '(índice: ${profile?.indice ?? ', veces: 1, porque: PROMPT },
  { archivo: 'lib/import-round.ts', fragmento: 'Indice de handicap negativo (${profile.indice})', veces: 1, porque: 'aviso interno (no UI) que nombra el valor crudo guardado' },
]

/** Regla 1: receptores de cada `.toFixed(1)` de la línea. */
function receptores(linea: string): string[] {
  const out: string[] = []
  for (let i = linea.indexOf(TOFIXED); i !== -1; i = linea.indexOf(TOFIXED, i + 1)) {
    let j = i
    let prof = 0
    while (j > 0) {
      const c = linea[j - 1]
      if (c === ')' || c === ']') { prof++; j--; continue }
      if (c === '(' || c === '[') { if (prof === 0) break; prof--; j--; continue }
      if (prof > 0 || /[\w$.?!]/.test(c)) { j--; continue }
      break
    }
    out.push(linea.slice(j, i))
  }
  return out
}

/** ¿El `{` que sigue a `prev` abre un hijo JSX? (no una prop, un objeto, un bloque ni una desestructuración) */
function hijoJsx(prev: string): boolean {
  const t = prev.trimEnd()
  if (t === '') return true
  const c = t.at(-1)
  if (c === '>' || c === '}') return true
  if (c === ':') return /[A-ZÁÉÍÓÚ][\wáéíóúñ]*:$/.test(t) // "Índice: {x}" (texto), no "clave: {"
  if (/[=(,?[{&|!+*/<-]$/.test(t)) return false
  return !/\b(const|let|var|import|export|type|interface|return|function|case|default|in|of|else)$/.test(t)
}

/** Regla 2: `${…}` y, en .tsx, `{…}` hijos JSX que cierran en la misma línea. */
function expresiones(linea: string, tsx: boolean): string[] {
  const out: string[] = []
  for (let i = 0; i < linea.length; i++) {
    if (linea[i] !== '{') continue
    const tpl = linea[i - 1] === '$'
    if (!tpl && (!tsx || !hijoJsx(linea.slice(0, i)))) continue
    let prof = 0
    let j = i
    for (; j < linea.length; j++) {
      if (linea[j] === '{') prof++
      else if (linea[j] === '}' && --prof === 0) break
    }
    if (j < linea.length) out.push(linea.slice(i + 1, j))
  }
  return out
}

/** Lo que la expresión pinta: sin comentarios, strings literales ni comparaciones contra null/tipo. */
function valorMostrado(expr: string): string {
  return expr
    .replace(/\/\*.*?\*\//g, '')
    .replace(/'[^']*'|"[^"]*"/g, "''")
    .replace(/typeof\s+[\w.?!]+\s*[!=]==?\s*''/g, '')
    .replace(/[\w.?!]+\s*[!=]==?\s*(null|undefined)/g, '')
    .replace(/\.filter\([^)]*\)/g, '')
}

const marcaExpr = (e: string) =>
  !/^\s*[\w'"]+\s*:/.test(e) && !/formatear/.test(e) && !/</.test(e) && ID_MOSTRADO.test(valorMostrado(e))

/** Cuántas marcas tiene la línea (las dos reglas). */
function marcas(linea: string, tsx: boolean): number {
  return receptores(linea).filter(r => NOMBRE_INDICE.test(r)).length + expresiones(linea, tsx).filter(marcaExpr).length
}

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : archivos(p)
    return /\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts') ? [p] : []
  })
}

describe('índice y hándicap: siempre con su formateador', () => {
  it('regla 1 marca los receptores que fueron fallos reales y deja pasar los que no son índices', () => {
    for (const s of [
      "{idx_ != null ? idx_.toFixed(1) : '—'}", // ranking
      'return handicap.toFixed(1)', // hoja de salida + WhatsApp
      "currentHandicap != null ? currentHandicap.toFixed(1) : '—'", // coach / progreso
      'const meta = targetHandicap.toFixed(1)',
      '`Tu índice ahora: ${index.toFixed(1)}`', // historial
      '`Tu índice ahora: ${res.index.toFixed(1)}`',
      "{hcp != null ? hcp.toFixed(1) : '—'}", // tees del organizador
      '{r.hcp.toFixed(1)}', // simulación
      'profile.indice.toFixed(1)', 'u.indice_golfers.toFixed(1)', 'data.indiceGolfers.toFixed(1)',
      'status.ultimoIndice.toFixed(1)', 'body?.indice?.toFixed(1)', 'Number(profile.indice).toFixed(1)',
    ]) expect(marcas(s, false), s).toBeGreaterThan(0)
    for (const s of ['r.diferencial.toFixed(1)', 'delta.toFixed(1)', 'suma.toFixed(1)', 'promedioCrudo.toFixed(2)']) {
      expect(marcas(s, false), s).toBe(0)
    }
  })

  it('regla 2 marca los valores pintados a mano que fueron fallos reales', () => {
    for (const s of [
      '<td style={tdNumStyle}>{p.handicap_index ?? EMPTY}</td>', // board en vivo
      "<td style={s}>{p.profiles?.indice ?? '—'}</td>", // inscritos del organizador
      '{p.indice != null && <span> · Indice {p.indice}</span>}', // buscador de inscripción
      '                Índice: {profile.indice}', // cabecera del perfil
      "{j.indice != null ? ` · idx ${j.indice}` : ''}", // confirmar ronda libre
      "{typeof u.indice === 'number' ? `· hcp ${u.indice}` : ''}", // playground admin
      '              {hcpDisplay}',
    ]) expect(marcas(s, true), s).toBeGreaterThan(0)
  })

  it('regla 2 deja pasar lo que no pinta un índice', () => {
    for (const s of [
      '{p.handicap_index != null ? formatearHandicap(p.handicap_index) : EMPTY}',
      "{profileIndex.indice_golfers != null ? 'Historial real' : 'Activa tu índice'}",
      "{ label: 'Con indice G+', value: users.filter(u => u.indice_golfers != null).length },",
      "{ key: 'indice_golfers' as const, label: 'Indice G+' },",
      '      const { indice } = r',
      '<Hero indice={indiceGolfers} nivel={nivel} />',
      '{/* Handicap (indice) */}',
    ]) expect(marcas(s, true), s).toBe(0)
  })

  it('ningún archivo pinta un índice o un hándicap a mano fuera de las excepciones', () => {
    const hallazgos: string[] = []
    const veces = PERMITIDOS.map(() => 0)
    let barridos = 0
    for (const raiz of RAICES) {
      for (const abs of archivos(path.join(SRC, raiz))) {
        barridos++
        const rel = path.relative(SRC, abs).split(path.sep).join('/')
        const tsx = abs.endsWith('.tsx')
        fs.readFileSync(abs, 'utf8').split('\n').forEach((linea, i) => {
          const n = marcas(linea, tsx)
          if (n === 0) return
          const k = PERMITIDOS.findIndex(p => p.archivo === rel && linea.includes(p.fragmento))
          if (k === -1) hallazgos.push(`${rel}:${i + 1}: ${linea.trim()}`)
          else veces[k] += n
        })
      }
    }
    // Guard: un barrido que no lee nada pasaría en vacío.
    expect(barridos).toBeGreaterThan(800)
    expect(hallazgos).toEqual([])
    // Cada excepción calza exactamente las veces declaradas: ni vencida ni tapando una marca nueva en su línea.
    expect(PERMITIDOS.map((p, k) => `${p.archivo}: ${p.fragmento} → ${veces[k]}`))
      .toEqual(PERMITIDOS.map(p => `${p.archivo}: ${p.fragmento} → ${p.veces}`))
  })
})
