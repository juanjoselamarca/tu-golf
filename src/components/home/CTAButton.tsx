'use client'

import Link from 'next/link'
import { usePostHog } from 'posthog-js/react'

/**
 * CTA del landing con tracking de conversión. Envuelve un <Link> y dispara un
 * evento `home_cta_click` con { location, target } al hacer click — así medimos
 * qué CTA se usa y desde qué sección (PostHog ya hace autocapture + pageviews;
 * esto agrega la capa semántica accionable). Se puede usar en Server Components
 * porque es un client component aislado.
 *
 * `posthog?.` con guard: si PostHog no está inicializado (sin token), el click
 * funciona igual — nunca rompe la navegación (CERO FALLOS).
 */
export default function CTAButton({
  href,
  location,
  target,
  className,
  children,
}: {
  href: string
  location: string
  target: string
  className?: string
  children: React.ReactNode
}) {
  const posthog = usePostHog()
  return (
    <Link
      href={href}
      className={className}
      onClick={() => posthog?.capture('home_cta_click', { location, target })}
    >
      {children}
    </Link>
  )
}
