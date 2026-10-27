// Dirección "Businessweek" (Bloomberg): el pilar "el dato que te baja el hándicap"
// cuando hay varios niveles que comparar. Guía de marca, sección 4.2.
// Tipografía: Inter Tight (su Neue Haas Grotesk), Source Serif 4 (Publico), IBM Plex Mono.
import { COLOR, LOGO, escapar, zonaSeguraStoryPct } from '../marca.mjs'

const SEGURA = zonaSeguraStoryPct()

export const clave = 'bloomberg'
export const nombre = 'Businessweek'
export const familias = ['Inter Tight', 'IBM Plex Mono', 'Source Serif 4', 'DM Sans']

// Medido en cqw: 1cqw = 1 % del ancho del marco, así el mismo CSS sirve en 4:5 y 9:16.
export const css = `
.b{background:${COLOR.navy};font-family:"Inter Tight",sans-serif}
.b .rule{left:7cqw;right:7cqw;top:7cqw;border-top:1.6cqw solid ${COLOR.bone}}
.b .kick{left:7cqw;right:7cqw;top:10.5cqw;display:flex;justify-content:space-between;font:600 2.8cqw "IBM Plex Mono";letter-spacing:.04em;color:${COLOR.mist};text-transform:uppercase}
.b .h{left:7cqw;right:9cqw;top:18cqw;font:800 9.4cqw/0.98 "Inter Tight";letter-spacing:-.035em}
.b .h em{font-style:normal;color:${COLOR.gold}}
.b table{position:absolute;left:7cqw;top:52cqw;width:86cqw;border-collapse:collapse;font-family:"IBM Plex Mono"}
.b th{font:600 2.5cqw "IBM Plex Mono";letter-spacing:.05em;color:${COLOR.mist};text-align:right;padding:0 0 1.6cqw;border-bottom:1px solid ${COLOR.bone};text-transform:uppercase}
.b th:first-child,.b td:first-child{text-align:left}
.b td{font-size:3.8cqw;text-align:right;padding:1.1cqw 0;border-bottom:1px solid ${COLOR.linea}}
.b tr.hl td{color:${COLOR.gold};font-weight:600}
.b .src{left:7cqw;right:7cqw;bottom:5cqw;display:flex;justify-content:space-between;align-items:flex-end;gap:4cqw;font:400 2.8cqw/1.35 "Source Serif 4";color:${COLOR.mist}}
.b .src span:first-child{max-width:62cqw}
.b .src .wm{font-size:4.2cqw;white-space:nowrap}

/* Lámina de un solo número: la barra del Terminal, su ámbar pasado a nuestro dorado */
.b .term{left:0;right:0;top:9cqw;background:${COLOR.gold};color:${COLOR.negroTerminal};font:600 3.2cqw "IBM Plex Mono";letter-spacing:.02em;padding:1.8cqw 7cqw;display:flex;justify-content:space-between}
.b .q{left:7cqw;right:9cqw;top:20cqw;font:400 3.9cqw/1.4 "IBM Plex Mono";color:${COLOR.mist}}
.b .ans{left:6cqw;right:6cqw;top:30cqw;font:800 30cqw/0.85 "Inter Tight";letter-spacing:-.05em;color:${COLOR.gold}}
.b .ans small{font-size:.3em;letter-spacing:-.02em}
.b .body{left:7cqw;right:9cqw;top:66cqw;font:400 5.2cqw/1.3 "Source Serif 4";color:${COLOR.bone}}
.b .meta{left:7cqw;right:7cqw;bottom:16cqw;font:400 3.2cqw/1.8 "IBM Plex Mono";color:${COLOR.mist};border-top:1px solid ${COLOR.linea};padding-top:2.4cqw}
.b .meta b{color:${COLOR.bone};font-weight:600}

/* Cierre: el llamado a la acción, con el mismo peso editorial */
.b .cta{left:7cqw;right:9cqw;top:80cqw;font:500 5.4cqw/1.35 "Inter Tight";color:${COLOR.bone};border-top:1px solid ${COLOR.gold};padding-top:3.2cqw}
.b .cta em{font-style:normal;color:${COLOR.gold}}

/* 9:16 (story y cierre de reel). Las medidas verticales van en % del alto, no
   en cqw: en vertical el marco mide 177 cqw de alto y el mismo "top:80cqw" que
   en 4:5 queda a media lámina. Entre SEGURA.arriba y SEGURA.abajo está lo que
   la interfaz de Instagram NO tapa; fuera de ahí no va nada que haya que leer. */
.b.s9 .rule{top:${SEGURA.arriba + 2}%}
.b.s9 .kick{top:${SEGURA.arriba + 4}%;font-size:3.4cqw}
.b.s9 .h{top:${SEGURA.arriba + 11}%;font-size:13.5cqw}
.b.s9 .cta{top:auto;bottom:${SEGURA.abajo + 9}%;font-size:6.4cqw;padding-top:4cqw}
.b.s9 .src{bottom:${SEGURA.abajo + 1.5}%;font-size:3.4cqw}
.b.s9 .src .wm{font-size:5.6cqw}
`

/** Cabecera común: la regla gruesa y los dos rótulos. */
function cabecera(l, ctx) {
  const izq = escapar(l.rotulo ?? ctx.rotulo ?? 'Golf · Datos')
  const der = escapar(l.folio ?? `N.º ${String(ctx.indice).padStart(2, '0')}`)
  return `<div class="abs rule"></div>
  <div class="abs kick"><span>${izq}</span><span>${der}</span></div>`
}

/** Pie: la fuente del dato a la izquierda, el logo a la derecha. */
function pie(l) {
  return `<div class="abs src"><span>${l.fuente ? escapar(l.fuente) : ''}</span>${LOGO}</div>`
}

/** El titular admite UNA palabra protagonista en dorado, marcada con *asteriscos*. */
function titular(texto) {
  return escapar(texto).replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

function tabla(t) {
  const cabeza = `<tr>${t.columnas.map((c) => `<th>${escapar(c)}</th>`).join('')}</tr>`
  const cuerpo = t.filas
    .map((f) => {
      const clase = f.destacada ? ' class="hl"' : ''
      const celdas = f.celdas.map((c) => `<td>${escapar(c)}</td>`).join('')
      return `<tr${clase}>${celdas}</tr>`
    })
    .join('')
  return `<table>${cabeza}${cuerpo}</table>`
}

/**
 * Campos que cada plantilla LEE. El validador los exige antes de renderizar:
 * sin esto, `escapar(l.codigo)` con el campo ausente imprimía "undefined"
 * dentro del PNG, o `tabla(undefined)` reventaba a mitad de la tanda.
 * Si una plantilla empieza a usar un campo nuevo, se agrega acá.
 */
/**
 * Qué plantilla tiene layout resuelto en cada formato. En 9:16 solo el cierre:
 * la tabla y el número están compuestos para 4:5 y en vertical quedarían con
 * el dato arriba y medio marco vacío.
 */
export const plantillasPorFormato = {
  carrusel: ['tabla', 'numero', 'cierre'],
  story: ['cierre'],
}

export const requisitos = {
  tabla: ['titular', 'tabla'],
  numero: ['codigo', 'pregunta', 'numero', 'cuerpo'],
  cierre: ['titular', 'cta'],
}

export const laminas = {
  /** Portada y láminas de tabla: titular apretado + tabla de líneas finas. */
  tabla: (l, ctx) => `${cabecera(l, ctx)}
  <div class="abs h">${titular(l.titular)}</div>
  ${tabla(l.tabla)}
  ${pie(l)}`,

  /** Un solo número, con la barra del Terminal arriba. */
  numero: (l, ctx) => `<div class="abs term"><span>${escapar(l.codigo)}</span><span>&lt;GO&gt;</span></div>
  <div class="abs q">${escapar(l.pregunta)}</div>
  <div class="abs ans">${escapar(l.numero)}${l.unidad ? `<small>${escapar(l.unidad)}</small>` : ''}</div>
  <div class="abs body">${titular(l.cuerpo)}</div>
  ${l.detalle ? `<div class="abs meta">${l.detalle.map((d) => escapar(d).replace(/\*([^*]+)\*/g, '<b>$1</b>')).join('<br>')}</div>` : ''}
  ${pie(l)}`,

  /** Cierre: titular + llamado a la acción. */
  cierre: (l, ctx) => `${cabecera(l, ctx)}
  <div class="abs h">${titular(l.titular)}</div>
  <div class="abs cta">${titular(l.cta)}</div>
  ${pie(l)}`,
}
