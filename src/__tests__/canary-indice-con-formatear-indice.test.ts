/**
 * CANARIO — un índice o hándicap se muestra con `formatearIndice` / `formatearHandicap`
 * (src/golf/handicap-index-range.ts).
 *
 * El plus se guarda negativo: pintado a mano sale "-1.0" o "(-1)" en vez de "+1.0" / "(+1)", la
 * notación del golf. PR #765 los pasó todos por el formateador canónico. Dos reglas, en src/app,
 * src/components, src/lib y src/golf (sin tests):
 *  1. `.toFixed(1)` cuyo receptor (identificador, o la llamada/paréntesis entero, justo antes) nombre
 *     un índice o un hándicap (`/indice|index|idx|hcp|handicap/i`).
 *  2. `{…}` en posición de hijo JSX (.tsx; también "({x})" y expresiones de varias líneas) o `${…}` de un
 *     template, cuyo VALOR MOSTRADO nombre un índice o un hándicap (ID_MOSTRADO) sin pasar por
 *     `formatear*`. Un ternario se mira por rama: si una rama formatea y la otra pinta el valor crudo,
 *     marca. Se descartan la condición, las comparaciones `x != null` / `typeof x === '…'`, los strings
 *     y el texto fijo de los templates. ID_MOSTRADO busca hcp/handicap/indice DENTRO de cualquier
 *     identificador (`hcpLabel`, `currentHandicap`, `teamHandicap`), sin importar mayúsculas.
 *  3. Etiqueta: un `{…}` / `${…}` justo después del texto "HCP", "Hcp", "hcp", "Índice", "Indice" o
 *     "idx" pinta un hándicap aunque la variable se llame `golpes`: cada rama tiene que pasar por un
 *     formateador, ser un `<Componente` (HcpCelda) o ser un texto fijo / constante ('—', EMPTY).
 * Las excepciones legítimas van en PERMITIDOS: archivo + fragmento de la línea donde abre la marca +
 * cuántas veces calza (`veces`) + su porqué. Si una excepción deja de calzar o calza otra cantidad,
 * el test se cae.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const SRC = path.resolve(__dirname, '..')
const RAICES = ['app', 'components', 'lib', 'golf']
const NOMBRE_INDICE = /(indice|index|idx|hcp|handicap)/i
const ID_MOSTRADO = /(hcp|handicap|indice)/i
/** Identificadores que contienen hcp/handicap/indice pero no son un hándicap: porcentaje, posición en
 *  una lista, fecha. Las constantes en MAYÚSCULAS (MIN_DIFERENCIALES_INDICE) tampoco. */
const NO_ES_VALOR = /(pct|EnLista$|_at$|At$)/i
/** En ronda libre `golpes` es el hándicap de cancha: "${golpes} golpes" lo pinta. (Un gross "${total} golpes" no.) */
const ETIQUETA_DESPUES = /^\s*golpes\b/
const ES_GOLPES = /^\s*([\w$]+[?!]*\.)*golpes\s*$/
/** Texto que rotula lo que sigue como un hándicap o un índice ("HCP {x}", "· idx ${x}", "Índice: {x}"). */
const ETIQUETA = /\b(HCP|Hcp|hcp|Índice|Indice|idx)\s*:?\s*\(?$/
const TOFIXED = '.toFixed(1)'
/** Formateadores canónicos (o que los envuelven): lo que pasa por ellos ya sale con su "+". */
const FORMATEADOR = /\b(formatear\w*|handicapHojaSalida)\(/
/** Una expresión JSX/template más larga que esto no es un valor pintado: es un bloque mal leído. */
const MAX_EXPR = 400

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
  { archivo: 'app/demo/taiger/page.tsx', fragmento: '(-indiceDelta).toFixed(1)', veces: 2, porque: 'delta de la maqueta, con su signo escrito a mano (calza en las dos reglas)' },
  // Regla 2 ({…} / ${…})
  { archivo: 'components/mi-golf/CompetenciaTab.tsx', fragmento: '{hcpDisplay}', veces: 1, porque: 'ya es texto: lo arma CompetenciaSection con formatearIndice' },
  { archivo: 'app/coach/progreso/components/MetaResumen.tsx', fragmento: '>{indiceTexto}</div>', veces: 2, porque: 'ya es texto: indiceTexto = formatearIndice(currentHandicap)' },
  { archivo: 'components/Scorecard.tsx', fragmento: "HCP {typeof displayHandicap === 'string' ? displayHandicap : formatearHandicap(", veces: 1, porque: 'la rama cruda es el texto ya armado ("S/Ind", el de 9h); la numérica pasa por formatearHandicap' },
  { archivo: 'golf/coach/prompts/contexto.ts', fragmento: '`Índice actual: ${indice}`', veces: 1, porque: PROMPT },
  { archivo: 'golf/coach/prompts/contexto.ts', fragmento: 'aún sin índice oficial): ${indiceGolfers}`', veces: 1, porque: PROMPT },
  { archivo: 'golf/coach/prompts/contexto.ts', fragmento: '${indice ?? (indiceGolfers != null ?', veces: 2, porque: PROMPT },
  { archivo: 'golf/coach/prompts/contexto.ts', fragmento: 'el índice ${anyIndice} refleja', veces: 3, porque: PROMPT },
  { archivo: 'golf/coach/v3/exam/build-exam-system.ts', fragmento: '${seed.handicap.indice}', veces: 1, porque: PROMPT },
  { archivo: 'golf/coach/v3/exam/mock-executor.ts', fragmento: 'DISTINTO del índice (${h.indice})', veces: 2, porque: PROMPT },
  { archivo: 'lib/data/coach-handicap.ts', fragmento: 'DISTINTO del índice (${indice})', veces: 2, porque: PROMPT },
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
  // Dentro de un comentario ("/** recibe {name, hcp} */") no hay JSX.
  if (/^\s*(\*|\/\/|\/\*)/.test(prev.slice(prev.lastIndexOf('\n') + 1))) return false
  const t = prev.trimEnd()
  if (t === '') return true
  const c = t.at(-1)
  // "f(x): Partial<T> {" o "): { a: string; b: number } | null {": tipo de retorno (en la misma línea)
  if (/\)\s*:\s*[^()=]+$/.test(t.slice(t.lastIndexOf('\n') + 1))) return false
  if (c === '>') return !t.endsWith('=>') // "<td>{x}" sí; "x => {" es un bloque
  if (c === '}') return true // "{a} {b}"
  // "Ana ({x})" o "</b>({x})": texto JSX entre paréntesis; no "f({", "if (", "return (", "=> ({".
  if (c === '(') return /(\w\s+|[^=]>\s*)\($/.test(t) && !/\b(return|await|typeof|if|while|for|switch|catch|new)\s*\($/.test(t)
  if (c === ':') return /[A-ZÁÉÍÓÚ][\wáéíóúñ]*:$/.test(t) // "Índice: {x}" (texto), no "clave: {"
  if (/[=(),?[{&|!+*/<;-]$/.test(t)) return false
  if (/\b(class|interface|enum|namespace|extends|implements)\b[^{};()]*$/.test(t)) return false
  return !/\b(const|let|var|import|export|type|interface|return|function|case|default|in|of|else|try|catch|finally|do)$/.test(t)
}

/**
 * Regla 2: `${…}` y, en .tsx, `{…}` hijos JSX, aunque crucen líneas. Devuelve cada expresión con el
 * número (0-based) de la línea donde abre.
 */
function expresiones(texto: string, tsx: boolean): Array<{ expr: string; linea: number; antes: string; despues: string }> {
  const out: Array<{ expr: string; linea: number; antes: string; despues: string }> = []
  let linea = 0
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] === '\n') { linea++; continue }
    if (texto[i] !== '{') continue
    const tpl = texto[i - 1] === '$'
    if (!tpl && (!tsx || !hijoJsx(texto.slice(Math.max(0, i - 300), i)))) continue
    let prof = 0
    let j = i
    for (; j < texto.length && j - i <= MAX_EXPR; j++) {
      if (texto[j] === '{') prof++
      else if (texto[j] === '}' && --prof === 0) break
    }
    if (texto[j] === '}' && prof === 0) out.push({ expr: texto.slice(i + 1, j), linea, antes: texto.slice(Math.max(0, i - 40), tpl ? i - 1 : i), despues: texto.slice(j + 1, j + 20) })
  }
  return out
}

/** Índice del cierre del string que abre en `k` (comilla simple, doble o backtick). */
function finString(e: string, k: number): number {
  const q = e[k]
  for (let m = k + 1; m < e.length; m++) {
    if (e[m] === '\\') { m++; continue }
    if (e[m] === q) return m
  }
  return e.length
}

/** Las ramas que se pintan de un ternario de primer nivel (sin la condición); sin ternario, la expresión entera. */
function ramas(e: string): string[] {
  const esPregunta = (k: number) => e[k] === '?' && e[k + 1] !== '.' && e[k + 1] !== '?' && e[k - 1] !== '?'
  let prof = 0
  let q = -1
  for (let k = 0; k < e.length && q === -1; k++) {
    const c = e[k]
    if (c === '`' || c === "'" || c === '"') k = finString(e, k)
    else if ('([{'.includes(c)) prof++
    else if (')]}'.includes(c)) prof--
    else if (prof === 0 && esPregunta(k)) q = k
  }
  if (q === -1) return [e]
  let anidados = 0
  prof = 0
  for (let k = q + 1; k < e.length; k++) {
    const c = e[k]
    if (c === '`' || c === "'" || c === '"') k = finString(e, k)
    else if ('([{'.includes(c)) prof++
    else if (')]}'.includes(c)) prof--
    else if (prof === 0 && esPregunta(k)) anidados++
    else if (prof === 0 && c === ':') {
      if (anidados === 0) return [e.slice(q + 1, k), ...ramas(e.slice(k + 1))]
      anidados--
    }
  }
  return [e]
}

/** El código de la expresión sin el texto fijo de sus templates (`HCP ${x}` → `${x}`): ese texto no es un valor. */
function sinTextoDeTemplates(e: string): string {
  let out = ''
  const modos: Array<'codigo' | 'template'> = ['codigo']
  const llaves = [0]
  for (let i = 0; i < e.length; i++) {
    const c = e[i]
    if (modos.at(-1) === 'template') {
      if (c === '\\') i++
      else if (c === '`') { modos.pop(); out += c }
      else if (c === '$' && e[i + 1] === '{') { modos.push('codigo'); llaves.push(0); out += '${'; i++ }
      continue
    }
    if (c === '`') { modos.push('template'); out += c; continue }
    if (c === '{') llaves[llaves.length - 1]++
    else if (c === '}') {
      if (llaves.at(-1) === 0 && modos.length > 1) { modos.pop(); llaves.pop(); out += c; continue }
      llaves[llaves.length - 1]--
    }
    out += c
  }
  return out
}

/** Lo que la expresión pinta: sin comentarios, strings literales ni comparaciones contra null/tipo. */
function valorMostrado(expr: string): string {
  return sinTextoDeTemplates(expr)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'[^']*'|"[^"]*"/g, "''")
    .replace(/typeof\s+[\w.?!]+\s*[!=]==?\s*''/g, '')
    .replace(/[\w.?!]+\s*[!=]==?\s*(null|undefined)/g, '')
    .replace(/\.filter\([^)]*\)/g, '')
}

/** ¿El valor pinta un identificador de hándicap/índice? Cuenta el FINAL de cada cadena (`r.breakdown.handicapInfo.handicap`
 *  sí, `handicapInfo.label` o `sinHandicap.map(…)` no), sin constantes en mayúsculas ni NO_ES_VALOR. */
function nombraHandicap(v: string): boolean {
  for (const m of v.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const id = m[0]
    if (!ID_MOSTRADO.test(id) || /^[A-Z0-9_$]+$/.test(id) || NO_ES_VALOR.test(id)) continue
    if (/^[?!]*\s*\./.test(v.slice(m.index + id.length))) continue
    return true
  }
  return false
}

/** Una rama rotulada como hándicap está bien si formatea, es un componente o es un texto fijo / constante. */
const ramaRotuladaOk = (r: string) =>
  FORMATEADOR.test(r) || /<[A-Z]/.test(r) || /^\s*(''|[A-Z_]+|null|undefined)?\s*$/.test(valorMostrado(r))

const marcaExpr = (e: string, antes = '', despues = '') =>
  !/^\s*[\w'"]+\s*:/.test(e) &&
  (ramas(e).some(r => !FORMATEADOR.test(r) && !/</.test(r) && nombraHandicap(valorMostrado(r))) ||
    ((ETIQUETA.test(antes) || (ETIQUETA_DESPUES.test(despues) && ramas(e).some(r => ES_GOLPES.test(r)))) &&
      !ramas(e).every(ramaRotuladaOk)))

/** Líneas (0-based) con marca, una entrada por marca (las dos reglas). */
function marcas(texto: string, tsx: boolean): number[] {
  const out: number[] = []
  texto.split('\n').forEach((l, i) => {
    for (const r of receptores(l)) if (NOMBRE_INDICE.test(r)) out.push(i)
  })
  for (const { expr, linea, antes, despues } of expresiones(texto, tsx)) if (marcaExpr(expr, antes, despues)) out.push(linea)
  return out
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
    ]) expect(marcas(s, false).length, s).toBeGreaterThan(0)
    for (const s of ['r.diferencial.toFixed(1)', 'delta.toFixed(1)', 'suma.toFixed(1)', 'promedioCrudo.toFixed(2)']) {
      expect(marcas(s, false), s).toEqual([])
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
      '<span className="hcp"> ({hcpAMostrar(p)})</span>', // board del torneo, junto al nombre
      // scorer en cancha: "HCP -1.5 · juega con -2"
      "<p>{nombre} · HCP {selectedPlayer.handicap_at_registration ?? '—'}{pct !== 100 && ` · juega con ${courseHcpDe(selectedPlayer)} (${pct} %)`}</p>",
      '<span>Hcp {entry.hcp}</span>', // pegado masivo del organizador
      '<div>\n  HCP {r.breakdown.handicapInfo.handicap}\n</div>', // GWI
      '<span>\n  HCP {equipo.handicap_equipo}\n</span>', // equipo de bola compartida
      // varias líneas
      "<td>\n  {p.handicap != null\n    ? p.handicap\n    : '—'}\n</td>",
      // una rama formatea y la otra pinta crudo
      "<td>{esPlus ? formatearHandicap(p.hcp) : p.hcp}</td>",
      // vuelta 6: identificadores que contienen hcp/handicap, y etiquetas con variables de otro nombre
      "{showNet && hcpLabel != null && <span style={{ color: 'var(--brand-on-bg)', marginRight: '4px' }}>HCP {hcpLabel}</span>}", // header del scorer
      '<span style={hcpDeJugador}>\n  HCP {golpes}\n</span>', // tarjeta del rival
      '<span style={hcpDeJugador}>\n  HCP {props.golpes}\n</span>', // tarjeta del creador
      "{golpes != null ? ` · ${golpes} golpes` : ''}", // confirmar ronda libre
      "<span style={label(y(currentHandicap) - 5, 'right', 'var(--text-3)')}>hcp {currentHandicap}</span>", // avance del coach
      '<span style={{ marginLeft: 6 }}>\n  HCP {team.teamHandicap}\n</span>', // leaderboard de equipos
      '<td>{h == null ? EMPTY : modo === 1 ? formatearIndice(h) : h.handicap}</td>',
    ]) expect(marcas(s, true).length, s).toBeGreaterThan(0)
  })

  it('regla 2 deja pasar lo que no pinta un índice', () => {
    for (const s of [
      '{p.handicap_index != null ? formatearHandicap(p.handicap_index) : EMPTY}',
      "<td>\n  {p.handicap != null\n    ? formatearHandicap(p.handicap)\n    : '—'}\n</td>",
      "{profileIndex.indice_golfers != null ? 'Historial real' : 'Activa tu índice'}",
      "{ label: 'Con indice G+', value: users.filter(u => u.indice_golfers != null).length },",
      "{ key: 'indice_golfers' as const, label: 'Indice G+' },",
      '      const { indice } = r',
      '<Hero indice={indiceGolfers} nivel={nivel} />',
      '{/* Handicap (indice) */}',
      'const f = ({ hcp }: Props) => hcp',
      'setEstado({ hcp })',
      'if (x) {\n  return hcp\n}',
      'function f(hcp: number) {\n  return hcp\n}',
      'items.map(p => {\n  return p.hcp\n})',
      'class Board extends Base {\n  hcp = 1\n}',
      'function hcpAMostrar(p: Player): number | null {\n  return p.hcp\n}',
      '/** Recibe un array de {name, hcp} */',
      "{p.handicap != null ? handicapHojaSalida(p.handicap) : '—'}",
      '<span>HCP <HcpCelda hcp={hcpLabel} /></span>',
      "<span>HCP {h != null ? formatearHandicap(h) : '—'}</span>",
      '<td>Índice {EMPTY}</td>',
      "{`Ronda de ${hoyos} hoyos`}",
      '<p>{indexOf}</p>',
      'Necesitas {MIN_DIFERENCIALES_INDICE} rondas',
      "{avisoHcpPct && <p>{avisoHcpPct}</p>}",
      'Nombre del jugador {indiceEnLista + 1}',
      "{` · ±${r.breakdown.handicapInfo.sigma} strokes`}",
      '): Partial<TournamentConfig> {\n  return { hcp }\n}',
      '} catch {\n  setHcp(hcp)\n}',
    ]) expect(marcas(s, true), s).toEqual([])
  })

  it('ningún archivo pinta un índice o un hándicap a mano fuera de las excepciones', () => {
    const hallazgos: string[] = []
    const veces = PERMITIDOS.map(() => 0)
    let barridos = 0
    for (const raiz of RAICES) {
      for (const abs of archivos(path.join(SRC, raiz))) {
        barridos++
        const rel = path.relative(SRC, abs).split(path.sep).join('/')
        const texto = fs.readFileSync(abs, 'utf8')
        const lineas = texto.split('\n')
        for (const i of marcas(texto, abs.endsWith('.tsx'))) {
          const linea = lineas[i]
          const k = PERMITIDOS.findIndex(p => p.archivo === rel && linea.includes(p.fragmento))
          if (k === -1) hallazgos.push(`${rel}:${i + 1}: ${linea.trim()}`)
          else veces[k]++
        }
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
