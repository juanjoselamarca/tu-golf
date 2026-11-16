/**
 * "Así se juega": la config de la Timba escrita como una frase, con cada valor que se puede cambiar marcado y
 * sus alternativas ya armadas (cada una es la config que queda si se elige). Puro: la pantalla solo pinta.
 */
import {
  cambiarDueloPareja, cambiarExtremosPorPuesto, cambiarUnidad, extremosPorPuesto,
  type ConfigJuego, type DueloPareja, type TipoDueloPareja, type Unidad,
} from '@/golf/formats/personalizado'

export interface OpcionDeValor { etiqueta: string; config: ConfigJuego; activa: boolean }
export type TrozoDeFrase =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'valor'; texto: string; titulo: string; opciones: OpcionDeValor[] }

const NOMBRE_DUELO: Record<TipoDueloPareja, string> = { mejor_bola: 'mejor bola', peor_bola: 'peor bola', suma: 'suma' }
const UNIDAD_EN_FRASE: Record<Unidad, string> = {
  individual: 'individual',
  parejas_fijas: 'en parejas fijas',
  parejas_rotativas: 'en parejas que rotan',
}

const texto = (t: string): TrozoDeFrase => ({ tipo: 'texto', texto: t })

function valoresDeDuelo(config: ConfigJuego): number[] {
  // Con "dividir" cada duelo tiene que valer un número par (validador): solo se ofrecen pares.
  return config.repartoPareja === 'dividir' ? [2, 4, 6] : [1, 2, 3, 4]
}

function tramo(holes: number): string {
  return holes % 3 === 0 ? ` cada ${holes / 3} hoyos` : ''
}

function trozosDeUnidad(config: ConfigJuego, holes: number): TrozoDeFrase[] {
  if (config.plantilla === 'personalizado_total') {
    const opciones = (Object.keys(UNIDAD_EN_FRASE) as Unidad[]).map(u => ({
      etiqueta: UNIDAD_EN_FRASE[u], config: cambiarUnidad(config, u), activa: u === config.unidad,
    }))
    return [
      texto('Juegan '),
      { tipo: 'valor', texto: UNIDAD_EN_FRASE[config.unidad], titulo: 'Cómo juegan', opciones },
      texto(config.unidad === 'parejas_rotativas' ? `${tramo(holes)}. ` : '. '),
    ]
  }
  if (config.unidad === 'parejas_fijas') return [texto('Parejas fijas. ')]
  if (config.unidad === 'parejas_rotativas') return [texto(`Parejas que rotan${tramo(holes)}. `)]
  return []
}

function trozosPorPuesto(config: ConfigJuego): TrozoDeFrase[] {
  const ext = extremosPorPuesto(config)
  if (!ext) return []
  const mejor: TrozoDeFrase = {
    tipo: 'valor', texto: ext.mejor === 0 ? 'Nadie suma' : String(ext.mejor), titulo: 'Lo que suma el mejor del hoyo',
    opciones: [0, 1, 2, 3].map(v => ({
      etiqueta: v === 0 ? 'Nadie suma' : `Suma ${v}`, config: cambiarExtremosPorPuesto(config, { ...ext, mejor: v }), activa: v === ext.mejor,
    })),
  }
  const peor: TrozoDeFrase = {
    tipo: 'valor', texto: String(ext.peor), titulo: 'Lo que resta el peor del hoyo',
    opciones: [1, 2, 3].map(v => ({
      etiqueta: `Resta ${v}`, config: cambiarExtremosPorPuesto(config, { ...ext, peor: v }), activa: v === ext.peor,
    })),
  }
  return ext.mejor === 0
    ? [mejor, texto(': el peor del hoyo resta '), peor, texto('.')]
    : [texto('El mejor del hoyo suma '), mejor, texto(' y el peor resta '), peor, texto('. Los del medio quedan en 0.')]
}

function valorDeDuelo(config: ConfigJuego, i: number, d: DueloPareja): TrozoDeFrase {
  return {
    tipo: 'valor', texto: String(d.valor), titulo: `Lo que vale la ${NOMBRE_DUELO[d.tipo]}`,
    opciones: valoresDeDuelo(config).map(v => ({
      etiqueta: `${v} ${v === 1 ? 'punto' : 'puntos'}`, config: cambiarDueloPareja(config, i, { valor: v }), activa: v === d.valor,
    })),
  }
}

function trozosDeParejas(config: ConfigJuego): TrozoDeFrase[] {
  const duelos = config.duelos.flatMap((d, i) => (d.tipo === 'por_puesto' ? [] : [{ d, i }]))
  if (duelos.length === 0) return []
  const trozos: TrozoDeFrase[] = []
  if (duelos.length === 1) {
    const { d, i } = duelos[0]
    trozos.push(
      texto('Solo cuenta la '),
      {
        tipo: 'valor', texto: NOMBRE_DUELO[d.tipo], titulo: 'Qué bola cuenta',
        opciones: (Object.keys(NOMBRE_DUELO) as TipoDueloPareja[]).map(t => ({
          etiqueta: NOMBRE_DUELO[t], config: cambiarDueloPareja(config, i, { tipo: t }), activa: t === d.tipo,
        })),
      },
      texto(', que vale '),
      valorDeDuelo(config, i, d),
      texto('.'),
    )
  } else {
    duelos.forEach(({ d, i }, k) => {
      const nombre = d.tipo === 'suma' ? 'la suma' : NOMBRE_DUELO[d.tipo]
      if (k === 0) trozos.push(texto(`${nombre[0].toUpperCase()}${nombre.slice(1)} vale `))
      else trozos.push(texto(k === duelos.length - 1 ? ` y ${nombre} ` : `, ${nombre} `))
      trozos.push(valorDeDuelo(config, i, d))
    })
    trozos.push(texto('.'))
  }
  if (duelos.some(({ d }) => d.perdedorResta)) trozos.push(texto(' El que pierde resta lo mismo.'))
  return trozos
}

export function fraseDelJuego(config: ConfigJuego, holes: number): TrozoDeFrase[] {
  const cuerpo = config.unidad === 'individual' ? trozosPorPuesto(config) : trozosDeParejas(config)
  const trozos = [...trozosDeUnidad(config, holes), ...cuerpo]
  if (trozos.length === 0) return [texto('Solo cuentan los puntos especiales.')]
  return trozos
}
