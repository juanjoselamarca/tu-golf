'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { addToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import { esRechazoDefinitivoDeTimba } from '@/lib/data/ronda-libre-cierre'
import { marcarRetiroTimba } from '@/lib/data/ronda-libre-scores'
import {
  marcarPuntitoConRespaldo,
  marcasPendientes,
  reenviarPuntitosPendientes,
  type MarcaPendiente,
} from '@/lib/ronda/puntitos-pendientes'
import { marcasVigentes, type MarcaEnCola } from '@/golf/ronda-libre/marcas-de-la-timba'
import { retirosQueFaltanEnLaVista } from '@/golf/ronda-libre/retiros-de-la-timba'
import { escribirRetirosConfirmados, guardarRetiroConfirmado, leerRetirosConfirmados } from '@/lib/ronda/retiros-confirmados'
import type { VistaDelJuego } from '@/golf/ronda-libre/juego-de-la-ronda'
import type { MarcaPuntito, PuntitoConfig } from '@/golf/formats/personalizado'

/** Una marca que el servidor rechazó para siempre: salió de la cola y no cuenta. Se le avisa al grupo. */
export interface MarcaRechazada {
  jugadorId: string
  puntitoId: string
  hoyo: number
  marcar: boolean
}

export interface MarcasDeLaTimba {
  /** Las que valen para mostrar: las guardadas más las que esperan envío. */
  marcas: MarcaPuntito[]
  /** Las que esperan envío en este teléfono. */
  enCola: MarcaEnCola[]
  hayPendientes: boolean
  alternar: (jugadorId: string, puntito: PuntitoConfig, hoyo: number) => void
  /** Reenvía lo pendiente; `true` si ya no queda nada sin enviar (cerrar la ronda lo exige). */
  enviarPendientes: () => Promise<boolean>
  rechazadas: MarcaRechazada[]
  descartarRechazadas: () => void
  /** Retira (o, con `desde: null`, devuelve) a un jugador. `true` si el servidor lo guardó. */
  retirar: (jugadorId: string, desde: number | null) => Promise<boolean>
  retirando: boolean
  /** Retiros que el servidor ya guardó y la vista todavía no trae (`retirosVigentes` los aplica). */
  retirosConfirmados: Readonly<Record<string, number | null>>
}

/** Una marca que el servidor guardó, con cuándo: vale hasta que llegue una vista pedida después. */
type MarcaEnviada = MarcaEnCola & { confirmadaEn: number }

const aCola = (m: MarcaPendiente): MarcaEnCola => ({ jugadorId: m.jugadorId, puntitoId: m.puntitoId, hoyo: m.hoyo, marcar: m.marcar })

/**
 * Puntos especiales y retiros desde el scorer de grupo de una Timba libre (spec, "Para el PR C").
 *
 * Las marcas van por la cola con respaldo del teléfono (`puntitos-pendientes.ts`, mismo patrón que los golpes):
 * se ven al toque, se envían, y al volver la señal se reenvían en orden. Las que el servidor rechaza para siempre
 * (`rechazadas`) salieron de la cola y no cuentan: quedan en `rechazadas` para avisarle al grupo.
 */
export function useMarcasDeLaTimba(input: {
  codigo: string
  activo: boolean
  vista: VistaDelJuego | null
  /** Cuándo se pidió `vista` (`useJuegoDeLaTimba`). */
  vistaPedidaEn: number | null
  /** Vuelve a pedir `GET /juego` (los puntos se recalculan en el servidor). */
  recargar: () => Promise<void>
  conexion: string
}): MarcasDeLaTimba {
  const { codigo, activo, vista, vistaPedidaEn, recargar, conexion } = input
  const [enCola, setEnCola] = useState<MarcaEnCola[]>([])
  // Enviadas y guardadas, pero quizás todavía no en la vista: sin esto el ✓ se apagaba entre que la cola se
  // vacía y llega el GET nuevo.
  const [enviadas, setEnviadas] = useState<MarcaEnviada[]>([])
  const [retirosConfirmados, setRetirosConfirmados] = useState<Record<string, number | null>>({})
  const [rechazadas, setRechazadas] = useState<MarcaRechazada[]>([])
  const [retirando, setRetirando] = useState(false)
  const reenviando = useRef<Promise<boolean> | null>(null)

  const leerCola = useCallback(() => setEnCola(marcasPendientes(codigo).map(aCola)), [codigo])

  const anotarRechazo = useCallback((r: MarcaRechazada[]) => {
    if (r.length > 0) setRechazadas(prev => [...prev, ...r])
  }, [])

  const anotarEnviadas = useCallback((m: MarcaEnCola[]) => {
    const confirmadaEn = Date.now()
    if (m.length > 0) setEnviadas(prev => [...prev, ...m.map(x => ({ ...x, confirmadaEn }))])
  }, [])

  const enviarPendientes = useCallback(async (): Promise<boolean> => {
    if (!activo) return true
    // Un solo reenvío a la vez: dos en paralelo mandarían las mismas marcas fuera de orden.
    if (reenviando.current) return reenviando.current
    const tarea = (async () => {
      try {
        const r = await reenviarPuntitosPendientes(createClient(), codigo)
        anotarRechazo(r.rechazadas.map(({ marca }) => ({ jugadorId: marca.jugadorId, puntitoId: marca.puntitoId, hoyo: marca.hoyo, marcar: marca.marcar })))
        anotarEnviadas(r.confirmadas.map(aCola))
        if (r.enviadas > 0 || r.rechazadas.length > 0) void recargar()
        return r.pendientes === 0
      } catch (e) {
        void captureError(e, { context: 'timba.reenviar_marcas', meta: { codigo } })
        return false
      } finally {
        leerCola()
        reenviando.current = null
      }
    })()
    reenviando.current = tarea
    return tarea
  }, [activo, codigo, anotarRechazo, anotarEnviadas, recargar, leerCola])

  const enviarRef = useRef(enviarPendientes)
  useEffect(() => { enviarRef.current = enviarPendientes }, [enviarPendientes])

  // Al abrir y al volver la señal: lo que quedó en el teléfono sube solo.
  useEffect(() => {
    if (!activo) return
    leerCola()
    if (conexion === 'ok' && marcasPendientes(codigo).length > 0) void enviarPendientes()
  }, [activo, conexion, codigo, leerCola, enviarPendientes])

  // Cada vista nueva: lo enviado antes de pedirla ya viene en ella, los retiros que ya trae se olvidan, y si quedó
  // algo en la cola (la señal volvió sin que `conexion` cambiara) se reintenta.
  useEffect(() => {
    if (!activo || !vista || vistaPedidaEn == null) return
    setEnviadas(prev => {
      const siguen = prev.filter(m => m.confirmadaEn >= vistaPedidaEn)
      return siguen.length === prev.length ? prev : siguen
    })
    const guardados = leerRetirosConfirmados(codigo)
    const faltan = retirosQueFaltanEnLaVista(vista.retiros, guardados)
    if (Object.keys(faltan).length !== Object.keys(guardados).length) {
      escribirRetirosConfirmados(codigo, faltan)
      setRetirosConfirmados(faltan)
    }
    if (marcasPendientes(codigo).length > 0) void enviarRef.current()
  }, [activo, vista, vistaPedidaEn, codigo])

  // Al abrir: los retiros confirmados que quedaron en el teléfono (sin vista todavía).
  useEffect(() => {
    if (activo) setRetirosConfirmados(leerRetirosConfirmados(codigo))
  }, [activo, codigo])

  const esGreenie = useCallback(
    (puntitoId: string) => vista?.config.puntitos.find(p => p.id === puntitoId)?.tipo === 'greenie',
    [vista],
  )
  const marcas = useMemo(
    () => marcasVigentes(vista?.marcas ?? [], [...enviadas, ...enCola], esGreenie),
    [vista, enviadas, enCola, esGreenie],
  )

  const alternar = useCallback((jugadorId: string, puntito: PuntitoConfig, hoyo: number) => {
    const marcado = marcas.some(m => m.jugadorId === jugadorId && m.hoyo === hoyo && m.puntitoId === puntito.id)
    const marca = { jugadorId, puntitoId: puntito.id, hoyo, marcar: !marcado, esGreenie: puntito.tipo === 'greenie' }
    // La cola se escribe antes del primer await: el botón cambia al toque, con o sin señal.
    const envio = marcarPuntitoConRespaldo(createClient(), codigo, marca)
    leerCola()
    void envio
      .then(({ error }) => {
        if (error && esRechazoDefinitivoDeTimba(error)) anotarRechazo([{ jugadorId, puntitoId: puntito.id, hoyo, marcar: marca.marcar }])
        if (!error) anotarEnviadas([{ jugadorId, puntitoId: puntito.id, hoyo, marcar: marca.marcar }])
        if (!error || esRechazoDefinitivoDeTimba(error)) void recargar()
      })
      .catch(e => { void captureError(e, { context: 'timba.marcar_punto', meta: { codigo } }) })
      .finally(leerCola)
  }, [marcas, codigo, leerCola, anotarRechazo, anotarEnviadas, recargar])

  const retirar = useCallback(async (jugadorId: string, desde: number | null): Promise<boolean> => {
    setRetirando(true)
    try {
      const { error } = await marcarRetiroTimba(createClient(), { codigo, jugadorId, desdeHoyo: desde })
      if (error) {
        addToast({
          type: 'error',
          title: desde == null ? 'No se deshizo el retiro' : 'No se guardó el retiro',
          message: esRechazoDefinitivoDeTimba(error) ? 'La ronda ya no acepta cambios.' : 'Revisa la señal e intenta de nuevo.',
          duration: 6000,
        })
        return false
      }
      // Confirmado: el teléfono lo recuerda hasta que la vista lo traiga (la recarga puede fallar sin señal).
      setRetirosConfirmados(guardarRetiroConfirmado(codigo, jugadorId, desde))
      await recargar()
      return true
    } finally {
      setRetirando(false)
    }
  }, [codigo, recargar])

  return {
    marcas,
    enCola,
    hayPendientes: enCola.length > 0,
    alternar,
    enviarPendientes,
    rechazadas,
    descartarRechazadas: useCallback(() => setRechazadas([]), []),
    retirar,
    retirando,
    retirosConfirmados,
  }
}
