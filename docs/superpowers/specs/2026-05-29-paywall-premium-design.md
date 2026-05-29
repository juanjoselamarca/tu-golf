# Paywall Premium Golfers+ — Diseño

**Fecha:** 2026-05-29
**Autor:** Claude (CTO) + Juanjo (PM)
**Estado:** Aprobado — diseño. NO implementar hasta que el motor existente esté estable (directiva CERO FALLOS). Spec listo para encender cuando toque monetización.

---

## 0. Contexto y filosofía

Golfers+ va a monetizar vía un plan premium centrado en el coach **tAIger+**. El insight rector (análisis del 28-may-2026 sobre el shift de pricing por IA en servicios profesionales) es:

> **La IA mueve el valor del esfuerzo al resultado. Se vende *outcome*, no *features*.**

Por lo tanto cada plan no es "un combo de features" sino **una promesa de resultado más grande**. El moat no es la IA en sí (commodity) sino los **datos reales de golf chileno + outputs verificados** — lo que hace que el anti-alucinación sea prioridad de negocio, no solo técnica.

Lineamientos previos de Juanjo (memoria `project_paywall_brainstorm`): pantalla elegante y transparente, **nunca bloqueante**, CTA dorado sobre azul/negro, paleta anclada a `src/golf/core/colors` (Garmin).

---

## 1. Estructura de planes (value ladder)

Tres tiers, cada uno con un **horizonte de resultado** creciente:

| | **Gratis** | **Pro** | **Pro+ / Elite** |
|---|---|---|---|
| **Promesa** | "Sabes qué mejorar" | "Te ayudo a resolverlo" | "Te llevo a tu meta del año" |
| **Coach tAIger+** | Diagnóstico ilimitado | + Plan de mejora + seguimiento ronda a ronda | + Objetivo de temporada, proyección de handicap, comparativa vs tu mejor versión / jugadores similares |
| **Horizonte** | Ahora | Este mes | La temporada |
| **Historial / stats** | Básico | Completo | Completo + comparativas |

**Criterio de diseño (no negociable):** un nuevo tier solo se justifica si vende un **resultado mayor**, no más volumen de features. Si en el futuro se propone un feature para Pro+, debe poder expresarse como "esto te acerca a tu meta de temporada"; si no, no va.

### Por qué esta escalera (Approach A elegido)
- Progresión que el golfista entiende en 3 segundos: ahora → mes → temporada.
- La proyección de handicap y el "vs tu mejor versión" de Pro+ **ya viven en el motor** (cerebro v2 calcula handicap equivalente; existe historial). Es empaquetar lo existente como outcome vendible → bajo riesgo de implementación, alto valor percibido.
- Descartados: escalera por "más datos/profundidad" (suena a feature, no a resultado, y depende de madurez de cerebro v3); solo-2-tiers (más seguro pero Juanjo decidió 3, y A da los 3 sin tier vacío).

---

## 2. Modelo de gating — qué se gatea y qué nunca

**Nunca bloqueado (la app operativa es 100% libre):**
- Crear y jugar torneos, scorear, leaderboard, share cards.
- Diagnóstico del coach (saber *qué* mejorar).
- Razón: protege CERO FALLOS (un torneo real nunca puede toparse con un muro de pago) y no castiga al organizador, que es quien trae jugadores.

**Gateado:**
- **Pro:** el *plan de mejora* (el *cómo*) + seguimiento ronda a ronda + historial/stats completos.
- **Pro+:** *proyección de temporada* + comparativas + objetivo del año.

El gancho de conversión es estructural: el usuario gratis **siempre sabe su problema** (diagnóstico ilimitado) pero no recibe la solución continua. Deseo natural: "sé mi problema → quiero resolverlo".

---

## 3. Gatillo y UX

**Gatillo primario — contextual, en el momento de máximo deseo:**
- El usuario termina su diagnóstico → tarjeta soft: *"Tu plan de mejora está listo 🎯 — desbloquéalo con Pro"*.
- Aparece donde el valor se hace evidente, nunca como interrupción de otra pantalla.
- Elegante, descartable, no modal-bloqueante.

**Pantalla de gestión (requisito técnico, no de adquisición):**
- En perfil: ver plan actual, cambiar/cancelar, **restaurar compra** (exigido por App Store / Play).
- Muestra los planes con beneficios breves + precio mensual. CTA "Suscribirse" dorado sobre azul/negro (lineamiento Juanjo).
- El diseño visual de esta pantalla se resuelve después con `design-shotgun` (no es parte de este spec).

---

## 4. Precio y cobro

- **Solo mensual visible al lanzar.** Decisión de Juanjo. Simplicidad para un mercado que recién prueba.
- **Anual arquitectado pero apagado:** el modelo de datos y la UI deben soportar cadencia anual desde el día uno, detrás de un flag, para encenderlo apenas se valide conversión **sin rehacer la pantalla**. (Recomendación CTO registrada: el anual captura caja por adelantado y retención —el golfista anual no cancela en invierno—; The Grint y V-Par viven de esto.)
- **Sin trial temporal.** El diagnóstico gratis ilimitado **es** el trial permanente. Más puro, coherente con "vender resultado".
- **Moneda: USD** por decisión de Juanjo (App Store localiza; facilita escalar). **Nota CTO:** evaluar precio anclado en **CLP** antes de encender — el target chileno percibe USD como ajeno/caro. El precio/tier debe ser **configurable por flag, nunca hardcodeado**, para cambiar moneda/cifra sin redeploy de UI.

> Decisiones de pricing pendientes de cerrar antes de implementar: cifra exacta del Pro y del Pro+, moneda final (USD vs CLP). No bloquean el diseño porque están detrás de config.

---

## 5. Arquitectura técnica (alto nivel)

Objetivo: que el gating sea una **capa desacoplada**, no condicionales `if (plan === 'pro')` regados por la UI (deuda inmediata).

- **Capa de entitlements:** hook `useEntitlement(feature)` que responde "¿este usuario puede X?". La UI pregunta por *capacidad*, no por *nombre de plan*. Esto permite cambiar la composición de planes sin tocar 50 componentes.
- **Componente de gate:** `<ProGate feature="plan-mejora" fallback={<UpsellCard/>}>...</ProGate>` envuelve el contenido premium. Un solo lugar define el comportamiento del muro.
- **Estado de suscripción:** `profiles.subscription_tier` (`free` | `pro` | `pro_plus`) + tabla de eventos de billing (`billing_events`) para auditoría e idempotencia de webhooks.
- **Config de planes:** catálogo de tiers/precios/moneda/cadencia en config (no hardcode). Encender anual o cambiar precio = cambio de config + flag.
- **Provider de pago:** a definir en el plan de implementación (App Store / Play IAP vs Stripe web). Decisión pospuesta — el diseño de entitlements es independiente del provider.
- **Verificación:** el estado premium se valida server-side antes de servir contenido gateado (no confiar en el cliente).

Esta capa se construye al estándar "el que toca, ordena": entitlements en `src/lib/` (infra) o `src/golf/` si lleva lógica de planes de golf; acceso a datos vía `src/lib/data/`.

---

## 6. Fuera de alcance (YAGNI)

- **Tier Club / B2B (organizadores):** es otro comprador y casi otro producto. Merece su propio spec si se prioriza.
- **Plan anual visible al lanzar:** arquitectado y apagado, no expuesto.
- **Trial temporal del Pro.**
- **Cobro per-outcome** (ej. "% de tu mejora de handicap"): no aplica al consumidor de golf; el per-outcome del análisis McKinsey era marco mental (vender resultado), no mecanismo de cobro.
- **Diseño visual final de la pantalla de planes:** se resuelve con `design-shotgun` + `frontend-design` en la fase de implementación.

---

## 7. Métrica de éxito

- **Norte:** conversión gratis → Pro impulsada por el momento de deseo (post-diagnóstico), sin degradar la experiencia operativa de torneo (CERO FALLOS intacto).
- Señal para encender Pro+ y/o anual: existencia demostrada de usuarios Pro que piden "más" / mayor compromiso.
