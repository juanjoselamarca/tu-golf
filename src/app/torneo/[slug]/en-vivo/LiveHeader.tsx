'use client'

// src/app/torneo/[slug]/en-vivo/LiveHeader.tsx
// Cabecera del marcador en vivo. Delega en <TorneoHeader> (fuente única de la
// identidad visual del torneo) — antes tenía su propia maqueta + FORMAT_LABEL
// hardcodeado (duplicaba src/golf/formats). Ahora solo aporta la "última
// actualización" y el vocabulario de organizador (quien corre el torneo).

import type { LiveTournament } from './types'
import { TorneoHeader } from '@/components/torneo/TorneoHeader'

export interface LiveHeaderProps {
  tournament: LiveTournament
  lastUpdate: number
}

function formatLastUpdate(ts: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (diffSec < 5) return 'recién actualizado'
  if (diffSec < 60) return `actualizado hace ${diffSec}s`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `actualizado hace ${diffMin} min`
  const hh = String(new Date(ts).getHours()).padStart(2, '0')
  const mm = String(new Date(ts).getMinutes()).padStart(2, '0')
  return `actualizado ${hh}:${mm}`
}

export default function LiveHeader({ tournament, lastUpdate }: LiveHeaderProps) {
  return (
    <TorneoHeader
      name={tournament.name}
      format={tournament.format}
      modo={tournament.modo}
      status={tournament.status}
      courseName={tournament.course_name}
      holeCount={tournament.hole_count}
      audience="organizer"
      note={formatLastUpdate(lastUpdate)}
    />
  )
}
