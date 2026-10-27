// Dirección "Businessweek" (Bloomberg): el pilar "el dato que te baja el hándicap"
// cuando hay varios niveles que comparar. Guía de marca, sección 4.2.
// Tipografía: Inter Tight (su Neue Haas Grotesk), Source Serif 4 (Publico), IBM Plex Mono.
import { COLOR, LOGO, escapar } from '../marca.mjs'

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
.b td.up{color:${COLOR.rojo}}
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
      const celdas = f.celdas
        .map((c, i) => {
          const alza = !f.destacada && t.columnaAlza === i ? ' class="up"' : ''
          return `<td${alza}>${escapar(c)}</td>`
        })
        .join('')
      return `<tr${clase}>${celdas}</tr>`
    })
    .join('')
  return `<table>${cabeza}${cuerpo}</table>`
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
