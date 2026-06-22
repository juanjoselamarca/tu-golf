'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { RondaLibre, HoleData } from '@/types/ronda'
import { isTeamFormat } from '@/golf/formats'
import { resolverCourseHandicap, cargarCourseData } from '@/golf/core/course-handicap'
import { parTotalEstandar } from '@/golf/core/round-score'
import { getTeeYardageColumn, generarOrdenHoyos } from '@/lib/ronda/helpers'
import { loadScores as lsLoad } from '@/lib/ronda/score-storage'

export interface RondaScoreData {
  ronda: RondaLibre | null
  setRonda: React.Dispatch<React.SetStateAction<RondaLibre | null>>
  scores: Record<string, Record<number, number>>
  setScores: React.Dispatch<React.SetStateAction<Record<string, Record<number, number>>>>
  parMap: Record<number, number>
  setParMap: React.Dispatch<React.SetStateAction<Record<number, number>>>
  holeDataMap: Record<number, HoleData>
  setHoleDataMap: React.Dispatch<React.SetStateAction<Record<number, HoleData>>>
  playerHcp: Record<string, number>
  setPlayerHcp: React.Dispatch<React.SetStateAction<Record<string, number>>>
  activeJugadorId: string | null
  setActiveJugadorId: React.Dispatch<React.SetStateAction<string | null>>
  selectedPlayer: string | null
  setSelectedPlayer: React.Dispatch<React.SetStateAction<string | null>>
  currentHole: number
  setCurrentHole: React.Dispatch<React.SetStateAction<number>>
  loading: boolean
  adminRedirectMsg: string | null
}

export function useRondaScoreData(codigo: string, jugadorParam: string | null): RondaScoreData {
  const router = useRouter()

  const [ronda, setRonda] = useState<RondaLibre | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeJugadorId, setActiveJugadorId] = useState<string | null>(null)
  const [currentHole, setCurrentHole] = useState(1)
  const [scores, setScores] = useState<Record<string, Record<number, number>>>({})
  const [parMap, setParMap] = useState<Record<number, number>>({})
  const [holeDataMap, setHoleDataMap] = useState<Record<number, HoleData>>({})
  const [playerHcp, setPlayerHcp] = useState<Record<string, number>>({})
  const [adminRedirectMsg, setAdminRedirectMsg] = useState<string | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)

  /* ── Load ronda ── */
  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('rondas_libres')
        .select('id, codigo, course_name, course_id, tees, holes, fecha, estado, modo_juego, formato_juego, hoyo_inicio, admin_mode, admin_user_id, recorridos, ronda_libre_jugadores(id, nombre, user_id, scores, handicap, tees)')
        .eq('codigo', codigo)
        .single()
      if (!data) { router.push('/dashboard'); return }
      const r = data as unknown as RondaLibre
      // If ronda was closed (by admin or player), redirect to detail view (read-only)
      if (r.estado === 'finalizada') { router.replace(`/ronda-libre/${codigo}`); return }
      // Demo rondas son spectator-only: cualquier usuario es redirigido al leaderboard.
      // El scoring usa la UI real en /score, no queremos que toquen demo data.
      if (r.es_demo) { router.replace(`/ronda-libre/${codigo}`); return }
      // Team formats must use score-grupo (individual scoring doesn't support teams)
      if (isTeamFormat(r.formato_juego)) {
        router.replace(`/ronda-libre/${codigo}/score-grupo`)
        return
      }
      // Admin mode: non-admin members cannot use individual scoring
      if (r.admin_mode) {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (r.admin_user_id === authUser?.id) {
          router.replace(`/ronda-libre/${codigo}/score-grupo`)
          return
        }
        if (r.admin_user_id !== authUser?.id) {
          // Show message before redirecting
          setAdminRedirectMsg('El admin de grupo lleva tu score. Redirigiendo al leaderboard...')
          setTimeout(() => router.replace(`/ronda-libre/${codigo}`), 1500)
          return
        }
      }
      setRonda(r)

      const initialScores: Record<string, Record<number, number>> = {}
      for (const j of r.ronda_libre_jugadores) {
        const db: Record<number, number> = {}
        if (j.scores) for (const [k, v] of Object.entries(j.scores)) db[parseInt(k)] = v as number
        initialScores[j.id] = { ...lsLoad(codigo, j.id), ...db }
      }
      setScores(initialScores)

      const pm: Record<number, number> = {}
      const hdm: Record<number, HoleData> = {}
      for (let i = 1; i <= r.holes; i++) { pm[i] = 4; hdm[i] = { numero: i, par: 4, stroke_index: i, yardaje: null } }
      setParMap(pm)
      let finalParTotal = parTotalEstandar(r.holes)  // se actualiza si hay course_holes

      if (r.course_id) {
        let holeQuery = supabase.from('course_holes')
          .select('numero, par, stroke_index, recorrido, yardaje_negras, yardaje_azul, yardaje_blanco, yardaje_rojo, yardaje_verificado_at')
          .eq('course_id', r.course_id)
        // Multi-loop: filter by selected recorridos
        const recorridos = r.recorridos as string[] | null
        if (recorridos && recorridos.length > 0) {
          holeQuery = holeQuery.in('recorrido', recorridos)
        }
        const { data: holes } = await holeQuery.order('recorrido').order('numero')
        if (holes && holes.length > 0) {
          const pm2: Record<number, number> = {}; const hdm2: Record<number, HoleData> = {}
          const teeCol = getTeeYardageColumn(r.tees || 'azul')
          const isMultiLoop = recorridos && recorridos.length > 1
          let holeNum = 1
          for (const h of holes) {
            const num = isMultiLoop ? holeNum : h.numero
            pm2[num] = h.par
            hdm2[num] = {
              numero: num,
              par: h.par,
              stroke_index: h.stroke_index,
              // Solo exponer yardajes auditados contra fuente primaria. Si no
              // está verificado, la UI muestra '–' en lugar de un metro sospechoso.
              yardaje: (h as Record<string, unknown>).yardaje_verificado_at
                ? ((h as Record<string, unknown>)[teeCol] as number | null) ?? null
                : null,
              yardajes: (h as Record<string, unknown>).yardaje_verificado_at ? {
                negras: (h as Record<string, unknown>).yardaje_negras as number | null ?? null,
                azul: h.yardaje_azul ?? null,
                blanco: h.yardaje_blanco ?? null,
                rojo: (h as Record<string, unknown>).yardaje_rojo as number | null ?? null,
              } : undefined,
            }
            holeNum++
          }
          setParMap(pm2); setHoleDataMap(hdm2)
          finalParTotal = Object.values(pm2).reduce((a, b) => a + b, 0)
        } else { setHoleDataMap(hdm) }
      } else { setHoleDataMap(hdm) }

      // Convertir índice → course handicap usando fórmula WHS (tee por jugador)
      const hcpMap: Record<string, number> = {}
      const courseDataByTee: Record<string, Awaited<ReturnType<typeof cargarCourseData>>> = {}
      for (const j of r.ronda_libre_jugadores) {
        let index: number
        if (j.handicap != null) { index = j.handicap }
        else if (j.user_id) { const { data: p } = await supabase.from('profiles').select('indice').eq('id', j.user_id).single(); index = p?.indice ?? 0 }
        else { index = 0 }
        const playerTee = (j.tees || r.tees || 'azul').toLowerCase()
        if (!courseDataByTee[playerTee]) {
          courseDataByTee[playerTee] = await cargarCourseData(r.course_id ?? null, playerTee, r.holes, finalParTotal, (r.recorridos as string[] | null) ?? null)
        }
        hcpMap[j.id] = resolverCourseHandicap(index, courseDataByTee[playerTee])
      }
      setPlayerHcp(hcpMap)

      // Auto-detect player: if user is logged in and matches a jugador, auto-select
      const { data: { user: authUser } } = await supabase.auth.getUser()
      const matchedPlayer = authUser ? r.ronda_libre_jugadores.find(j => j.user_id === authUser.id) : null
      // If jugadorParam is set OR user matches a player, auto-select and lock
      const preselect = jugadorParam
        ? r.ronda_libre_jugadores.find(j => j.id === jugadorParam)?.id ?? r.ronda_libre_jugadores[0]?.id
        : matchedPlayer?.id ?? (r.ronda_libre_jugadores.length === 1 ? r.ronda_libre_jugadores[0]?.id : null)

      if (preselect) {
        setSelectedPlayer(preselect)
        setActiveJugadorId(preselect)
        const ex = initialScores[preselect] ?? {}
        const orden = generarOrdenHoyos(r.hoyo_inicio ?? 1, r.holes)
        const firstEmpty = orden.find(h => ex[h] == null)
        if (firstEmpty != null) setCurrentHole(firstEmpty)
        else setCurrentHole(orden[0])
      } else {
        // Multi-player, no auto-match: show player selection screen
        // Set activeJugadorId to first player so data is loaded, but don't lock
        setActiveJugadorId(r.ronda_libre_jugadores[0]?.id ?? null)
      }
      setLoading(false)
    }
    load()
  }, [codigo, jugadorParam, router])

  return {
    ronda,
    setRonda,
    scores,
    setScores,
    parMap,
    setParMap,
    holeDataMap,
    setHoleDataMap,
    playerHcp,
    setPlayerHcp,
    activeJugadorId,
    setActiveJugadorId,
    selectedPlayer,
    setSelectedPlayer,
    currentHole,
    setCurrentHole,
    loading,
    adminRedirectMsg,
  }
}
