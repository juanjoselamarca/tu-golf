'use client'
import type { Feature } from '@/golf/billing/plans'
import { FEATURE_MIN_TIER } from '@/golf/billing/plans'
import { ChevronRight } from '@/components/icons'
import { ProBadge } from './ProBadge'
import styles from './UpsellCard.module.css'

interface UpsellCardProps {
  feature: Feature
  title: string
  description: string
  /**
   * compact = fila (listas, dentro de otra tarjeta), medium = tarjeta (default),
   * full = sección en páginas donde el upsell es la única acción.
   */
  variant?: 'compact' | 'medium' | 'full'
}

/**
 * Tarjeta de upsell del paywall. Crece con su contenido: antes era una capa
 * absoluta sobre una caja fija de 160px con overflow oculto, y el badge y el
 * "Conocer PRO" quedaban recortados (reporte del wizard de torneo, 23-sep).
 */
export function UpsellCard({ feature, title, description, variant = 'medium' }: UpsellCardProps) {
  const tier = FEATURE_MIN_TIER[feature] === 'pro_plus' ? 'pro_plus' : 'pro'
  const label = `Conocer ${tier === 'pro_plus' ? 'PRO+' : 'PRO'}`

  if (variant === 'compact') {
    return (
      <div className={styles.compact} data-upsell={feature}>
        <ProBadge tier={tier} variant="filled" />
        <h3 className={styles.title}>{title}</h3>
        <a href="/planes" className={styles.ctaGhost}>
          {label}
          <ChevronRight size={16} aria-hidden="true" />
        </a>
      </div>
    )
  }

  const full = variant === 'full'
  return (
    <div className={full ? styles.full : styles.card} data-upsell={feature}>
      <div className={styles.head}>
        <ProBadge tier={tier} variant="filled" />
        {!full && <h3 className={styles.title}>{title}</h3>}
      </div>
      {full && <h3 className={styles.title}>{title}</h3>}
      <p className={styles.description}>{description}</p>
      <a href="/planes" className={full ? styles.ctaCommit : styles.ctaNav}>
        {label}
      </a>
    </div>
  )
}
