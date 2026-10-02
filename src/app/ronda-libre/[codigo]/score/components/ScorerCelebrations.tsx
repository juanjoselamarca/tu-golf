'use client'

import HoleInOneCelebration from '@/components/HoleInOneCelebration'
import BirdieCelebration from '@/components/BirdieCelebration'
import EagleCelebration from '@/components/EagleCelebration'
import { Flame } from '@/components/icons'
import type { ScoreCelebrations } from '../hooks/useScoreCelebrations'

/** Modales de celebración (escalados por importancia) + toast de racha. */
export function ScorerCelebrations({ c }: { c: ScoreCelebrations }) {
  return (
    <>
      {c.birdieData && (
        <BirdieCelebration
          playerName={c.birdieData.playerName}
          holeNumber={c.birdieData.hole}
          onClose={c.cerrarBirdie}
        />
      )}
      {c.eagleData && (
        <EagleCelebration
          playerName={c.eagleData.playerName}
          holeNumber={c.eagleData.hole}
          onClose={c.cerrarEagle}
        />
      )}
      {c.holeInOneData && (
        <HoleInOneCelebration
          playerName={c.holeInOneData.playerName}
          holeNumber={c.holeInOneData.hole}
          onClose={c.cerrarHoleInOne}
        />
      )}
      {/* Streak toast */}
      {c.streakMsg && (
        <div style={{
          position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(22,163,74,0.95)', color: 'var(--ivory)', padding: '10px 20px',
          borderRadius: '24px', fontSize: '14px', fontWeight: 600, zIndex: 180,
          animation: 'fadeInOut 2.5s ease-in-out forwards', whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(22,163,74,0.3)',
        }}>
          <Flame size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> {c.streakMsg}
        </div>
      )}
    </>
  )
}
