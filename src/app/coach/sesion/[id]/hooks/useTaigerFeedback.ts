'use client'

import { useEffect, useState } from 'react'
import type { TaigerSession } from '@/lib/data/taiger'

interface UseTaigerFeedbackResult {
  rating: number
  setRating: React.Dispatch<React.SetStateAction<number>>
  ratingHover: number
  setRatingHover: React.Dispatch<React.SetStateAction<number>>
  ratingComment: string
  setRatingComment: React.Dispatch<React.SetStateAction<string>>
  ratingSubmitted: boolean
  ratingSubmitting: boolean
  handleRatingSubmit: () => Promise<void>
}

/**
 * Rating de sesión por estrellas (1-5). EXTRAÍDO TAL CUAL del original
 * (page.tsx:334-355) — el cambio a 👍/👎 es PR2, acá NO se toca la lógica.
 *
 * `initialRating` viene de la sesión cargada: si ya había rating, arranca
 * marcado y como enviado.
 */
export function useTaigerFeedback(
  session: TaigerSession | null,
  initialRating: number,
): UseTaigerFeedbackResult {
  const [rating, setRating] = useState<number>(0)
  const [ratingHover, setRatingHover] = useState<number>(0)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingSubmitted, setRatingSubmitted] = useState(false)
  const [ratingSubmitting, setRatingSubmitting] = useState(false)

  // En el original, rating/ratingSubmitted se seteaban DENTRO de loadSession
  // tras cargar la sesión (page.tsx:139-142). Replicamos ese timing: cuando
  // llega un rating previo (>0), lo reflejamos como marcado + enviado.
  useEffect(() => {
    if (initialRating > 0) {
      setRating(initialRating)
      setRatingSubmitted(true)
    }
  }, [initialRating])

  const handleRatingSubmit = async () => {
    if (!session || rating === 0 || ratingSubmitting) return
    setRatingSubmitting(true)
    try {
      const res = await fetch('/api/taiger/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          rating,
          comment: ratingComment.trim() || undefined,
        }),
      })
      if (res.ok) {
        setRatingSubmitted(true)
      }
    } catch {
      // silently fail
    } finally {
      setRatingSubmitting(false)
    }
  }

  return {
    rating, setRating,
    ratingHover, setRatingHover,
    ratingComment, setRatingComment,
    ratingSubmitted, ratingSubmitting,
    handleRatingSubmit,
  }
}
