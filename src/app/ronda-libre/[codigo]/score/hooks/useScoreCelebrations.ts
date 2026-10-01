'use client'

import { useCallback, useState } from 'react'
import { shouldNotify } from '@/golf/notifications'
import { haptic } from '@/lib/ronda/helpers'

export interface CelebrationData {
  playerName: string
  hole: number
}

/** Desde cuántos hoyos seguidos en par o mejor se muestra el toast de racha. */
export const RACHA_MINIMA = 3

/**
 * Celebraciones del scorer individual: hole in one, eagle y birdie (modales,
 * escalados por importancia) y el toast de racha. `shouldNotify`
 * (`@/golf/notifications`) decide si corresponde celebrar y con qué vibración.
 */
export function useScoreCelebrations() {
  const [holeInOneData, setHoleInOneData] = useState<CelebrationData | null>(null)
  const [birdieData, setBirdieData] = useState<CelebrationData | null>(null)
  const [eagleData, setEagleData] = useState<CelebrationData | null>(null)
  const [streakMsg, setStreakMsg] = useState<string | null>(null)

  /** Celebra el hoyo recién anotado (valores capturados ANTES de navegar). */
  const celebrarHoyo = useCallback((input: {
    savedScore: number
    holePar: number
    hole: number
    playerName: string
    courseName: string
  }) => {
    const { savedScore, holePar, hole, playerName, courseName } = input
    if (savedScore === 1) {
      const decision = shouldNotify({ type: 'hole_in_one', playerName, hole, courseName })
      if (decision.notify) {
        setHoleInOneData({ playerName, hole })
        haptic(decision.hapticPattern ?? [50, 100, 50, 100, 50])
      }
      return
    }
    const diff = savedScore - holePar
    if (diff <= -2) {
      const decision = shouldNotify({ type: 'eagle', playerName, hole, courseName })
      if (decision.notify) {
        setEagleData({ playerName, hole })
        haptic(decision.hapticPattern ?? [30, 60, 30, 60])
      }
    } else if (diff === -1) {
      const decision = shouldNotify({ type: 'birdie', playerName, hole, courseName })
      if (decision.notify) {
        setBirdieData({ playerName, hole })
        haptic(decision.hapticPattern ?? [15, 30, 15])
      }
    }
  }, [])

  /** Toast de racha (`rachaParOMejor`): sólo desde RACHA_MINIMA hoyos. */
  const mostrarRacha = useCallback((racha: number) => {
    if (racha < RACHA_MINIMA) return
    const msgs = [
      `${racha} hoyos en par o mejor`,
      `Racha de ${racha} — consistencia`,
      `${racha} seguidos — en la zona`,
    ]
    setStreakMsg(msgs[Math.min(racha - RACHA_MINIMA, msgs.length - 1)])
    setTimeout(() => setStreakMsg(null), 2500)
  }, [])

  const cerrarHoleInOne = useCallback(() => setHoleInOneData(null), [])
  const cerrarBirdie = useCallback(() => setBirdieData(null), [])
  const cerrarEagle = useCallback(() => setEagleData(null), [])

  return {
    holeInOneData, birdieData, eagleData, streakMsg,
    celebrarHoyo, mostrarRacha,
    cerrarHoleInOne, cerrarBirdie, cerrarEagle,
  }
}

export type ScoreCelebrations = ReturnType<typeof useScoreCelebrations>
