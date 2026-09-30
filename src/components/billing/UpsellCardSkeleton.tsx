import styles from './UpsellCard.module.css'

/**
 * Placeholder de UpsellCard (variante medium) mientras ProGate resuelve el
 * acceso. Reserva el alto de la tarjeta para que la página no salte cuando
 * aparece el upsell o el contenido PRO. Pasar como `loadingFallback` de
 * ProGate en los usos que quedan sobre el pliegue.
 */
export function UpsellCardSkeleton() {
  return (
    <div className={styles.skeleton} data-progate-loading="" role="status" aria-busy="true" aria-label="Cargando">
      <div className={styles.head}>
        <span className={styles.skeletonBar} style={{ width: 40, height: 22 }} />
        <span className={styles.skeletonBar} style={{ width: '45%', height: 18 }} />
      </div>
      <span className={styles.skeletonBar} style={{ width: '90%', height: 12 }} />
      <span className={styles.skeletonBar} style={{ width: '65%', height: 12 }} />
      <span className={styles.skeletonCta} />
    </div>
  )
}
