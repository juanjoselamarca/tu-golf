/**
 * Vista client del historial — orquestador interactivo.
 *
 * Recibe la carga inicial por props desde el Server Component page.tsx
 * (rondas + stats agregadas, resueltas en paralelo server-side — patrón
 * PR #262 de /perfil/stats). Acá vive TODO lo interactivo con paridad 1:1:
 * menú (…) por portal (#256), borrar/excluir/editar con recálculo de índice,
 * agregar ronda, borrado masivo, FAB.
 *
 * `stats` puede ser null (fetch server falló): las pills y los PR caen al
 * cálculo local desde las rondas — misma degradación que tenía el fetch
 * client non-blocking a /api/historial/stats.
 */
'use client'

import { useState } from 'react'
import { parPerHoleArray } from '@/golf/core/compare'
import type { HistorialStats } from '@/golf/stats/historial'
import { useHistorialRounds } from '../hooks/useHistorialRounds'
import { useRoundActions } from '../hooks/useRoundActions'
import { useExpandedRounds } from '../hooks/useExpandedRounds'
import { useAddRoundForm } from '../hooks/useAddRoundForm'
import { FatalErrorScreen, EmptyHistorialState } from './EmptyStates'
import { HistorialHeader } from './HistorialHeader'
import { DefaultTeeBanner } from '@/components/DefaultTeeBanner'
import { PersonalRecordsGrid } from './PersonalRecordsGrid'
import { AddRoundForm } from './AddRoundForm'
import { RoundCard } from './RoundCard'
import { BulkDeleteModal } from './BulkDeleteModal'
import { groupByMonth, computeStats, formatOv, isMatchPlay, isCompleteRound } from '../lib/helpers'
import { cardStyle } from '../lib/constants'
import { useToast } from '@/hooks/useToast'
import type { BestRound, HistoricalRound, Pill } from '../lib/types'

export interface HistorialViewProps {
  userId: string
  initialRounds: HistoricalRound[]
  initialLoadError: boolean
  stats: HistorialStats | null
  /** true si la página se abrió con ?add=true (deep-link al form de ronda). */
  initialShowForm: boolean
}

export function HistorialView({ userId, initialRounds, initialLoadError, stats, initialShowForm }: HistorialViewProps) {
  /* ── Hooks ── */
  const { loadError, rounds, setRounds, setLoadError, reload } =
    useHistorialRounds({ initialRounds, initialLoadError })
  const {
    deleting, deletingAll, savingEdit,
    deleteRound, toggleExcluded, saveEdit, deleteAllRounds,
  } = useRoundActions({ userId, setRounds })
  const { isExpanded, toggleExpand, forceExpand, courseParCache } = useExpandedRounds()
  const toast = useToast()

  /* ── Local state ── */
  const [showForm, setShowForm] = useState(initialShowForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)

  /* ── Handlers con feedback visible (CERO FALLOS: nada falla en silencio) ── */
  // Subtítulo honesto: muestra el índice REAL recalculado, no una promesa vacía.
  // null = <3 rondas válidas (todavía no hay índice).
  const idxMsg = (index?: number | null) =>
    index != null ? `Tu índice ahora: ${index.toFixed(1)}` : 'Índice recalculado.'

  const handleDelete = async (id: string) => {
    const res = await deleteRound(id)
    if (res.ok) {
      toast.showSuccess('Ronda eliminada', idxMsg(res.index))
    } else if (res.reason === 'noop') {
      toast.showWarning('No se eliminó', 'La ronda ya no existe. Recargá la página.')
    } else {
      toast.showError('No se pudo eliminar', 'Revisá tu conexión e intentá de nuevo.')
    }
  }

  const handleToggleExcluded = async (round: typeof rounds[number]) => {
    const willExclude = !round.excluded_from_handicap
    const res = await toggleExcluded(round)
    if (res.ok) {
      toast.showSuccess(
        willExclude ? 'Excluida del índice' : 'Incluida en el índice',
        idxMsg(res.index),
      )
    } else {
      toast.showError(
        'No se pudo cambiar',
        res.reason === 'noop' ? 'La ronda ya no existe. Recargá.' : 'Revisá tu conexión e intentá de nuevo.',
      )
    }
  }

  const handleDeleteAll = async () => {
    const res = await deleteAllRounds()
    setShowBulkConfirm(false)
    if (res.ok) {
      toast.showSuccess(
        `${res.deletedCount} ${res.deletedCount === 1 ? 'ronda eliminada' : 'rondas eliminadas'}`,
        res.index != null ? `Tu índice ahora: ${res.index.toFixed(1)}` : 'Ya no tienes índice (sin rondas).',
      )
    } else if (res.reason === 'noop') {
      toast.showWarning('No se eliminó nada', 'Recargá la página e intentá de nuevo.')
    } else {
      toast.showError('No se pudieron eliminar', 'Revisá tu conexión e intentá de nuevo.')
    }
  }

  const form = useAddRoundForm({
    userId,
    onSaved: async () => { setShowForm(false); await reload() },
  })

  /* ── Aggregate stats (fallback from local if API hasn't loaded) ── */
  let aggBirdies = 0, aggEagles = 0
  let ovSum = 0, ovCount = 0
  for (const r of rounds) {
    const holePars = parPerHoleArray(r.par_per_hole, r.scores?.length ?? 0)
    const s = computeStats(r.scores, holePars)
    if (!s) continue
    aggBirdies += s.birdies
    aggEagles  += s.eagles
    if (r.total_gross != null && !isMatchPlay(r) && isCompleteRound(r)) {
      const expectedHoles = r.holes_played ?? r.scores?.length ?? 18
      const parRonda = expectedHoles <= 9 ? 36 : 72
      ovSum += r.total_gross - parRonda
      ovCount++
    }
  }
  const avgOv = ovCount > 0 ? Math.round(ovSum / ovCount * 10) / 10 : null

  /* ── Personal Record — por vsPar, solo rondas COMPLETAS (excluye match play) ── */
  let bestRound18: BestRound | null = null
  let bestRound9:  BestRound | null = null
  for (const r of rounds) {
    if (r.total_gross == null || isMatchPlay(r) || !isCompleteRound(r)) continue
    const expectedHoles = r.holes_played ?? r.scores?.length ?? 18
    const parRonda = expectedHoles <= 9 ? 36 : 72
    const rVsPar = r.total_gross - parRonda
    if (expectedHoles > 9) {
      if (!bestRound18 || rVsPar < bestRound18.vsPar) {
        bestRound18 = { score: r.total_gross, course: r.course_name, date: r.played_at, vsPar: rVsPar, roundId: r.id }
      }
    } else {
      if (!bestRound9 || rVsPar < bestRound9.vsPar) {
        bestRound9 = { score: r.total_gross, course: r.course_name, date: r.played_at, vsPar: rVsPar, roundId: r.id }
      }
    }
  }

  /* ── Header pills ── */
  const totalRounds = rounds.length
  const statProm = stats?.avgOverPar18 != null
    ? formatOv(stats.avgOverPar18)
    : (avgOv != null ? formatOv(avgOv) : '—')
  const pills: Pill[] = [
    { label: 'Rondas',  value: String(stats?.totalRounds ?? totalRounds) },
    { label: 'Prom',    value: statProm },
    { label: 'Birdies', value: String(stats?.totalBirdies ?? aggBirdies) },
    { label: 'Eagles',  value: String(stats?.totalEagles ?? aggEagles) },
  ]
  const progress = Math.min(totalRounds / Math.max(totalRounds, 1), 1)
  const monthGroups = groupByMonth(rounds)

  /* ── Guards ── */
  if (loadError && rounds.length === 0) {
    return <FatalErrorScreen onRetry={() => { setLoadError(false); void reload() }} />
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <HistorialHeader pills={pills} totalRounds={totalRounds} progress={progress} />

      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px 16px 100px' }}>
        {/* Red de seguridad: tarjetas importadas sin tee → fijar el tee habitual
            para que alimenten el índice. Auto-oculto si ya lo fijó. */}
        <DefaultTeeBanner />

        {/* Personal Records */}
        <PersonalRecordsGrid
          bestRound18={stats?.bestRound18 ?? bestRound18}
          bestRound9={stats?.bestRound9 ?? bestRound9}
        />

        {/* Add round form */}
        {showForm && <AddRoundForm form={form} />}

        {/* Empty state */}
        {rounds.length === 0 && !showForm && (
          <EmptyHistorialState loadError={loadError} onAddRound={() => setShowForm(true)} />
        )}

        {/* Rounds grouped by month */}
        {rounds.length > 0 && (
          <>
            {monthGroups.map(group => (
              <div key={group.key} style={{ marginBottom: '24px' }}>
                <h2 style={{
                  fontFamily: '"Playfair Display", serif',
                  fontSize: '18px', fontWeight: 700, color: 'var(--text)',
                  margin: '0 0 10px 4px',
                }}>
                  {group.label}
                </h2>
                <div style={{ ...cardStyle }}>
                  {group.rounds.map((r, rIdx) => (
                    <RoundCard
                      key={r.id}
                      round={r}
                      isExpanded={isExpanded(r.id)}
                      isEditing={editingId === r.id}
                      isLast={rIdx === group.rounds.length - 1}
                      deleting={deleting === r.id}
                      savingEdit={savingEdit}
                      courseParCache={r.course_id ? courseParCache[r.course_id] : undefined}
                      onToggleExpand={() => toggleExpand(r)}
                      onStartEdit={() => { setEditingId(r.id); forceExpand(r.id) }}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={async (scores) => {
                        const res = await saveEdit(r.id, scores)
                        if (res.ok) { setEditingId(null); toast.showSuccess('Ronda actualizada', idxMsg(res.index)) }
                        else toast.showError('No se pudo guardar', 'Revisá tu conexión e intentá de nuevo.')
                      }}
                      onToggleExcluded={() => void handleToggleExcluded(r)}
                      onDeleteRound={() => void handleDelete(r.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
            <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-3)', marginTop: '20px' }}>
              {rounds.length} tarjetas guardadas
            </p>

            {/* Borrado masivo — detrás de confirmación fuerte (acción destructiva) */}
            <div style={{ textAlign: 'center', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setShowBulkConfirm(true)}
                disabled={deletingAll}
                data-testid="historial-bulk-delete-open"
                style={{
                  background: 'none', border: 'none',
                  color: '#dc2626', fontSize: '12px', fontWeight: 600,
                  cursor: deletingAll ? 'not-allowed' : 'pointer',
                  padding: '8px 12px', opacity: deletingAll ? 0.5 : 1,
                  textDecoration: 'underline', textUnderlineOffset: '2px',
                }}
              >
                Eliminar todas mis rondas
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modal de borrado masivo */}
      <BulkDeleteModal
        open={showBulkConfirm}
        count={rounds.length}
        deleting={deletingAll}
        onConfirm={() => void handleDeleteAll()}
        onCancel={() => setShowBulkConfirm(false)}
      />

      {/* FAB */}
      <button
        onClick={() => { setShowForm(!showForm); if (!showForm) form.resetForm() }}
        style={{
          position: 'fixed', bottom: '24px', right: '24px',
          width: '56px', height: '56px', borderRadius: '50%',
          background: showForm ? '#6b7280' : '#c4992a',
          color: showForm ? '#ffffff' : '#1a1a2e',
          border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
          fontSize: '24px', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50,
          transition: 'background 0.2s, transform 0.2s',
        }}
        aria-label={showForm ? 'Cancelar' : 'Agregar ronda'}
      >
        <span style={{ transform: showForm ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block', lineHeight: 1 }}>+</span>
      </button>
    </div>
  )
}
