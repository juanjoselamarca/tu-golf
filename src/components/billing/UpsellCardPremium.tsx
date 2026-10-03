'use client'
import type { Feature } from '@/golf/billing/plans'
import { FEATURE_MIN_TIER } from '@/golf/billing/plans'
import { ChevronRight } from '@/components/icons'
import { ProBadge } from './ProBadge'
import styles from './UpsellCard.module.css'
import { loginUrl } from '@/lib/auth/login-url'

interface UpsellCardProps {
  feature: Feature
  title: string
  description: string
  /**
   * compact = fila (listas, dentro de otra tarjeta), medium = tarjeta (default),
   * full = sección en páginas donde el upsell es la única acción.
   */
  variant?: 'compact' | 'medium' | 'full'
  /**
   * Ruta a la que volver después de iniciar sesión. Sólo se pasa cuando NO hay
   * sesión: quien ya pagó y abrió el link en otro teléfono necesita un camino a
   * "Entrar", no sólo a comprar (en /en-vivo y /tv quedaba en un callejón).
   * Ignorado en `compact` (fila de un solo CTA dentro de páginas usables sin PRO).
   */
  loginNext?: string
}

/**
 * Tarjeta de upsell del paywall. Crece con su contenido: antes era una capa
 * absoluta sobre una caja fija de 160px con overflow oculto, y el badge y el
 * "Conocer PRO" quedaban recortados (reporte del wizard de torneo, 23-sep).
 */
export function UpsellCard({ feature, title, description, variant = 'medium', loginNext }: UpsellCardProps) {
  const tier = FEATURE_MIN_TIER[feature] === 'pro_plus' ? 'pro_plus' : 'pro'
  const tierLabel = tier === 'pro_plus' ? 'PRO+' : 'PRO'
  const label = `Conocer ${tierLabel}`

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
      {loginNext && (
        <p className={styles.yaTengo}>
          ¿Ya tienes {tierLabel}?
          <a href={loginUrl(loginNext)} className={styles.ctaGhost}>
            Entrar
          </a>
        </p>
      )}
    </div>
  )
}
