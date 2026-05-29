# Paywall Premium Golfers+ — Diseño y Estrategia de Penetración

**Fecha:** 2026-05-29
**Autores:** Claude (CTO + Chief Sales Manager) · Juanjo (PM)
**Estado:** Aprobado — diseño y go-to-market. **NO implementar** hasta que el motor (cerebro v3 / anti-alucinación) esté estable (directiva CERO FALLOS). Este spec es la guía a seguir cuando toque encender monetización.

---

## 0. Tesis: por qué esto sale del estadio

Tres hechos que casi nadie tiene juntos, y nosotros sí:

1. **Ya tenemos lo más difícil construido.** La herramienta operativa de torneos que los clubes *usan*, + 137 canchas + integración FedeGolf + un motor de coach (tAIger+). El activo caro ya existe.
2. **El canal de distribución ya está fluyendo.** Cada torneo que un club corre en Golfers+ = una tanda de golfistas usando la app gratis. Ese es el tope del embudo, y ya gotea solo.
3. **El golf se vende por comunidad, no por ads.** 60 clubes federados en Chile, todos se conocen. Quien gana clubes, gana golfistas. El modelo probado de la categoría (BlueGolf, 18Birdies) es B2B2C + referidos.

**La jugada:** no construir demanda desde cero — *convertir* el uso operativo (gratis, ya existente) en suscripción al coach. El paywall no es un muro; es el puente entre "uso la app en el torneo" y "el coach me hace mejor golfista".

**Filosofía de producto (insight pricing-IA, 28-may):** se vende **resultado, no features**. Cada plan = una promesa de outcome más grande. El moat no es la IA (commodity) sino **datos reales de golf chileno + outputs verificados** — por eso el anti-alucinación es prioridad de negocio, no técnica.

---

## 1. Mercado y oportunidad

| Dato | Valor | Implicancia |
|---|---|---|
| Clubes federados Chile | ~60 | Universo B2B2C abarcable persona a persona |
| Canchas en nuestra BD | 137 (prod) | Cobertura nacional ya resuelta |
| Asociaciones | 3 | Estructura para land-and-expand |
| Mundo del golf chileno | Chico, interconectado | Reputación se propaga (CERO FALLOS manda) y el boca-a-boca también |

**Benchmark de precios de la categoría** (referencia obligatoria):

| App | Precio | Cadencia | Trial | Modelo |
|---|---|---|---|---|
| The Grint | $19.99 (hándicap) / **$39.99 Pro** /yr | Anual | — | Stats + hándicap |
| 18Birdies | **$99.99/yr** · $19.99/mo · $7.99/wk | Anual + mensual | 7 días | AI caddie + stats |
| Arccos | $155.88/yr + hardware | Anual | — | Shot-tracking HW |

Lectura: **toda la categoría cobra anual y los buenos ofrecen trial.** Posicionamiento target: coach-led premium, ancla cerca de 18Birdies, justificado por el coach que *de verdad te mejora* (no solo mide).

---

## 2. Estrategia de penetración (Go-to-Market)

### El wedge: el club como canal de distribución

El club **no paga** — el club *distribuye*. Le damos al club valor (sus torneos potenciados por Golfers+, co-branding, un código para sus socios) y a cambio el club nos pone frente a sus miembros. El coach convierte a cada socio individualmente.

**Land-and-expand:**
1. **Aterrizar** clubes que *ya* corren torneos en Golfers+ (fricción cero, ya nos usan).
2. **Activar** a sus socios con un código de club (ej. 3 meses Pro gratis para socios de Club X).
3. **Expandir** al resto de la asociación (3 asociaciones → efecto federación).

### El embudo de conversión (mapa con palancas)

| Etapa | Qué pasa | Palanca de conversión |
|---|---|---|
| **1. Tope (gratis, operativo)** | Club corre torneo → jugadores usan la app gratis. O golfista entra a jugar la ronda de un amigo. | Fricción cero. CERO FALLOS. Nunca un muro acá. |
| **2. Activación** | El golfista registra rondas propias → recibe **diagnóstico gratis**. | El wow: *"¿cómo sabe que mi problema es el segundo putt?"* Especificidad sobre ÉL. |
| **3. Gatillo de trial** | Termina el diagnóstico, quiere el plan. | *"Tus próximas 3 rondas con Pro+ completo, gratis."* Reverse trial sin tarjeta. |
| **4. Trial (3 rondas)** | Juega con coach completo + ve su **proyección de hándicap**. | Aversión a la pérdida: prueba el wow total, le cuesta soltarlo. |
| **5. Conversión** | Termina el trial → cae a free (diagnóstico). | *"Tu plan te bajó X golpes en 3 rondas — mantenlo."* Anual destacado. |
| **6. Loop de referidos** | Códigos family & friends + share cards. | Golf es boca-a-boca. Cada Pro trae golfistas. |

**Por qué esto le gana a comprar ads:** el golfista no convierte por un banner, convierte porque su club, su flight y su amigo ya lo usan. CAC ≈ 0 por el canal de club. Los ads vienen *después*, si acaso.

---

## 3. Estructura de planes (value ladder por outcome)

| | **Gratis** | **Pro** | **Pro+ / Elite** |
|---|---|---|---|
| **Promesa (1 frase)** | "Sabes qué mejorar" | "Te ayudo a resolverlo" | "Te llevo a tu meta del año" |
| **Número héroe** | Tu fuga, nombrada | −X golpes este mes | Hándicap Y en [mes] |
| **Coach tAIger+** | Diagnóstico ilimitado | + Plan de mejora + seguimiento ronda a ronda | + Proyección de hándicap, objetivo de temporada, vs tu mejor versión / golfistas similares |
| **Horizonte** | Ahora | Este mes | La temporada |
| **Historial / stats** | Básico | Completo | Completo + comparativas |

**Criterio no negociable:** un tier solo se justifica si vende un **resultado mayor**, no más volumen de features. Si un feature propuesto para Pro+ no se puede expresar como "esto te acerca a tu meta de temporada", no entra.

**Por qué la proyección de Pro+ ya es viable:** el motor (cerebro v2) ya calcula hándicap equivalente y tenemos historial. Es *empaquetar lo existente como outcome vendible* → bajo riesgo de implementación, alto valor percibido.

---

## 4. Pricing

**Cadencia:** mensual + **anual (destacado como "mejor valor", ~2 meses gratis)**. Confirmado por data de categoría: anual es el estándar, mejora retención y caja, y nos hace ver mejor valor que un mensual-only.

**Anclas propuestas (a validar con Juanjo — config, no hardcode):**

| Plan | Mensual (CLP) | Anual (CLP) | Equivalente USD/año |
|---|---|---|---|
| **Pro** | ~$6.990 | ~$59.900 | ~$63 |
| **Pro+ Elite** | ~$11.990 | ~$99.900 | ~$105 |

Racional: Pro entre The Grint ($40) y 18Birdies ($100), justificado por el coach. Pro+ a la altura de 18Birdies, justificado por proyección + comparativas. **Moneda CLP** (el target chileno percibe USD como ajeno/caro; CLP se siente nativo). Precio/moneda/cadencia **por config con flag** — cambiar cifra o moneda no requiere redeploy de UI.

**Anclaje de precio en la UI** (técnica elite): mostrar el número relativo a algo conocido — *"menos que una docena de bolas al mes"* / *"el precio de medio balde en el driving"*. Hace que la cifra se sienta chica frente al valor.

---

## 5. Free trial (reverse trial por rondas)

**Modelo:** reverse trial — el usuario nuevo recibe **acceso Pro+ completo durante sus próximas 3 rondas** (tope de 30 días si no juega), **sin tarjeta de crédito**. Al terminar, cae a Gratis (diagnóstico) y aparece el gatillo de conversión con sus resultados reales.

**Por qué estas decisiones:**
- **Por rondas, no por días:** el golfista juega 1-2 veces/semana; un trial de 7 días = 1 ronda = no alcanza a sentir el plan. Por rondas garantiza que se cierre el loop de valor (juego → plan → juego → ¿funcionó? → plan ajustado). **Diferenciador: nadie en la categoría lo hace.** (Resuelve la duda rondas-vs-sesiones: una sesión de coach se dispara por ronda → 3 rondas = 3 sesiones, misma unidad.)
- **Pro+ completo:** ve el wow máximo (incluida la proyección). Aversión a la pérdida = mayor conversión post-trial.
- **Sin tarjeta:** maximiza *inicios* de trial. La data: trial opt-in (sin tarjeta) inicia mucho más aunque convierta menos; el free tier es la red de seguridad que retiene igual. (Trade-off consciente: si más adelante queremos subir conversión, se puede testear pedir tarjeta = opt-out, que convierte 2-3×.)
- **Tope de 30 días:** evita que el trial cuelgue eterno para inactivos; limpia para contabilidad.

**Features del trial (Pro+ completo):**
- Plan de mejora personalizado tras cada ronda.
- Seguimiento ronda a ronda (¿se cumplió el plan?).
- Proyección de hándicap a temporada + objetivo del año.
- Comparativa vs tu mejor versión y vs golfistas similares.
- Historial y stats completos.

**Post-trial:** cae a Gratis. El gatillo de conversión usa **datos reales del trial**: *"En estas 3 rondas, tu plan te bajó 2 golpes. Mantén tu coach → Pro/Pro+."* (Si no mejoró, el copy pivota a "tu plan recién empieza a rendir — los cambios se consolidan en 4-5 rondas").

---

## 6. Sistema de códigos de descuento

Tres usos, un solo motor. **Estratégicamente, los códigos de club son un canal de distribución, no solo un descuento.**

### Tipos de código
| Tipo | Qué hace | Uso típico |
|---|---|---|
| `percent` | % de descuento | Promos ("LANZAMIENTO50" = 50% primer año) |
| `fixed` | Monto fijo off | Promos puntuales |
| `free_period` | N meses o N rondas gratis | Clubes ("3 meses Pro gratis socios Club X") |
| `comp` | 100% — acceso comp | Family & friends, prensa, embajadores |

### Campañas (scope)
- **Family & friends:** `comp` o `free_period` largo, `max_redemptions` bajo, idealmente único por persona. Generados desde admin.
- **Clubes (B2B2C — el estratégico):** código del club (ej. `LASBRISAS`) que da a sus socios X% o N meses gratis. Puede ser **compartido** (muchos usos, un código) o **único por socio** (el club los reparte). El club recibe co-branding / torneos potenciados como contraparte. Atribución por `partner_club_id` → medimos installs y conversiones por club.
- **Promociones:** códigos de marketing, acotados en tiempo (`valid_from`/`valid_until`) y en usos (`max_redemptions`).

### Mecánica
- Validación **server-side**: ventana activa + usos restantes + unicidad por usuario + tier/cadencia aplicable.
- **Un código por suscripción** (no apilables) salvo regla explícita.
- Tracking por `campaign_label` para atribución de marketing y deals de club.

### Modelo de datos
- `discount_codes`: `code`, `type`, `value`, `tier_scope`, `cadence_scope`, `max_redemptions`, `redemptions_count`, `valid_from`, `valid_until`, `campaign_label`, `partner_club_id`, `created_by`, `active`.
- `code_redemptions`: `code_id`, `user_id`, `subscription_id`, `redeemed_at` (previene doble uso + auditoría).
- **Admin UI** para generar/gestionar códigos (área `admin/golf-ops`).

### ⚠️ Restricción crítica de provider (decide la arquitectura de cobro)
Apple/Google **restringen los códigos de descuento custom** en compras in-app (IAP): habría que usar Apple Offer Codes / Google promo codes, que son limitados y rígidos. **Stripe (checkout web/externo) da control total** sobre códigos F&F/club/promo. → **Recomendación:** facturar vía Stripe donde sea posible para flexibilidad de códigos; si la política de la tienda obliga IAP, mapear a Offer Codes con sus límites. **Decisión de provider a cerrar en el plan de implementación** — el diseño de entitlements es independiente del provider.

---

## 7. Modelo de gating — qué se gatea y qué nunca

**Nunca bloqueado (la app operativa es 100% libre):**
- Crear/jugar torneos, scorear, leaderboard, share cards.
- Diagnóstico del coach (saber *qué* mejorar).
- Razón: protege CERO FALLOS (un torneo real jamás topa un muro) y no castiga al organizador, que es quien trae jugadores. **El uso operativo gratis ES el canal de adquisición — cobrarlo lo mataría.**

**Gateado:**
- **Pro:** el *plan de mejora* (el cómo) + seguimiento + historial/stats completos.
- **Pro+:** proyección de temporada + comparativas + objetivo del año.

El gancho es estructural: el usuario gratis **siempre sabe su problema** pero no recibe la solución continua. Deseo natural: "sé mi problema → quiero resolverlo".

---

## 8. Gatillo y experiencia "wow" (estándar elite)

Lo que hacen los mejores paywalls del mundo (Noom, Whoop, Flo), aplicado a golf:

1. **Mostrar el plan, no prometerlo.** Tras el diagnóstico, mostrar el **primer paso real y específico, gratis**, y bloquear el resto:
   > *"tAIger+ analizó tus 47 rondas. Tu mayor fuga: el segundo putt. Primer paso → deja el approach bajo el hoyo, nunca arriba. [Los 4 pasos restantes de tu plan ↓ desbloquéalos]"*
   El asombro = especificidad sobre él. No paga por una promesa; activa algo que ya existe sobre él. (Validado: Noom usa exactamente esto.)
2. **El número de tu futuro** (héroe de Pro+): *"A este ritmo, llegas a hándicap 12 en septiembre."* Ver tu propio número futuro es lo que hace pagar. Nadie en Chile lo muestra.
3. **Una promesa, un número por plan** (anti-lista de checks): Gratis = tu fuga · Pro = −3 este mes · Pro+ = hándicap 12 en sept. La lista de features va abajo, chica.
4. **CTA por beneficio:** "Activar mi plan", nunca "Suscribirse" (convierte más).
5. **Gatillo en pico de motivación:** contextual, post-diagnóstico/post-trial. Soft, nunca interrumpe otra pantalla.
6. **Prueba social:** "X golfistas chilenos mejorando con tAIger+", rating, mini-testimonios reales.
7. **Mostrar el "after":** gráfico de proyección de hándicap bajando. Whoop/Strava venden el gráfico, no la feature.
8. **Capa de confianza:** "cancela cuando quieras", "tus datos son tuyos", restaurar compra visible. Sin esto no se siente premium-serio.
9. **El coach ya hizo el trabajo:** reencuadre — *"ya te armó el plan, solo falta activarlo"*. Reduce fricción de "pagar por algo incierto".

**Pantalla de gestión** (requisito de tienda, no de adquisición): ver plan, cambiar/cancelar, restaurar, aplicar código. CTA dorado sobre azul/negro (lineamiento marca, paleta `src/golf/core/colors`). Diseño visual final → `design-shotgun` en implementación.

---

## 9. Retención y estacionalidad (clave en Chile)

El golf chileno tiene temporada: verano (oct–mar) peak, invierno (may–ago) bajo. Un mensual se cae en invierno.

- **Anual** captura el año completo (razón #1 por la que el anual importa).
- **Pausar suscripción** (en vez de cancelar) para temporada baja → reduce churn duro.
- **Códigos winback** al inicio de temporada para lapsos ("vuelve, primer mes gratis").
- **Coach de invierno:** plan de práctica/driving para off-season → el valor persiste cuando no se juega.

---

## 10. Arquitectura técnica (alto nivel)

- **Capa de entitlements:** hook `useEntitlement(feature)` — la UI pregunta por *capacidad*, no por nombre de plan. Cambiar la composición de planes no toca 50 componentes.
- **Gate como componente:** `<ProGate feature="plan-mejora" fallback={<UpsellCard/>}>...`. Un solo lugar define el muro.
- **Estado de suscripción:** `profiles.subscription_tier` (`free` | `pro` | `pro_plus`) + `subscription_status` (incl. `trialing`) + `trial_rounds_remaining` / `trial_ends_at` + tabla `billing_events` (auditoría/idempotencia de webhooks).
- **Trial por rondas:** contador decremental atado al evento "ronda finalizada"; cae a free al llegar a 0 o pasar el tope de 30 días.
- **Códigos:** `discount_codes` + `code_redemptions` (sección 6).
- **Config de planes/precios:** catálogo en config con flag (tiers, precios, moneda, cadencia, anual on/off).
- **Provider de pago:** Stripe preferido por flexibilidad de códigos (ver §6); IAP si la tienda obliga. A cerrar en el plan.
- **Verificación server-side** del estado premium antes de servir contenido gateado (nunca confiar en el cliente).
- Construcción al estándar "el que toca, ordena": entitlements en `src/lib/` (infra) o `src/golf/` si lleva lógica de planes; datos vía `src/lib/data/`.

---

## 11. Métricas (KPIs)

- **Activación:** % de usuarios operativos que registran ronda propia + reciben diagnóstico.
- **Trial start rate:** % de diagnosticados que inician el reverse trial.
- **Trial → paid:** objetivo 8–12% (elite para reverse trial); nuestro modelo por-rondas + free valioso puede superarlo.
- **Mix anual:** % que elige anual (más anual = mejor retención/caja).
- **Installs/conversiones por club** (`partner_club_id`): mide qué clubes rinden.
- **Churn** (mensual vs anual), **LTV**, **CAC por canal**.
- **ROI del coach:** mejora promedio de golpes de usuarios Pro → munición de marketing y prueba social.

---

## 12. Fases de lanzamiento

| Fase | Qué | Pre-requisito |
|---|---|---|
| **0 — Pre** | Paywall OFF. Motor estable + anti-alucinación (cerebro v3). | CERO FALLOS |
| **1 — Soft (1-2 clubes piloto)** | Encender con clubes amigos. Códigos F&F. Medir activación + trial. | Fase 0 ✅ |
| **2 — Canal de club** | Códigos de club a clubes que ya corren torneos. Anual ON. | Señal de conversión en Fase 1 |
| **3 — Escala** | Asociación/federación, promociones, loop de referidos. | Métricas sanas en Fase 2 |

---

## 13. Riesgos

- **Anti-alucinación sin resolver** → diagnóstico falso → confianza destruida → no vuelve nunca (CERO FALLOS). **Gate duro antes de Fase 1.** Estas mejoras *dependen* de que el diagnóstico sea brutalmente específico y correcto.
- **Restricción de códigos en IAP** → resolver provider (Stripe) en el plan.
- **Precio alto vs The Grint** → anclar con cuidado, liderar con el valor del coach, mostrar el relativo ("docena de bolas").
- **Canibalizar la buena voluntad operativa** → el uso operativo queda 100% gratis para siempre. No negociable.
- **Estacionalidad** → anual + pausa + winback (§9).

---

## 14. Fuera de alcance (YAGNI)

- **Tier Club/B2B como producto pago** (el club *distribuye*, no paga; si más adelante se cobra al club, es otro spec).
- **Cobro per-outcome** ("% de tu mejora"): marco mental, no mecanismo — no aplica al consumidor.
- **Diseño visual final** de las pantallas → `design-shotgun` + `frontend-design` en implementación.
- **Apilamiento de códigos**, multi-moneda simultánea, regalar suscripciones entre usuarios → post-validación.

---

## 15. Métrica de éxito (norte)

Conversión gratis → trial → Pro/Pro+ impulsada por el momento de deseo y el canal de club, **sin degradar jamás la experiencia operativa de torneo** (CERO FALLOS intacto). Señal de que ganamos: clubes pidiendo su código, y usuarios Pro mostrando "bajé X golpes con mi coach".

---

## Anexo — Fuentes del benchmark

- The Grint pricing — Windtree Golf, MyGolfSpy
- 18Birdies / Arccos pricing — ScoringZone (golf app subscription cost 2026)
- Paywall elite (Noom/Whoop/Flo), CTA, timing — Apphud, Airbridge, PaywallPro/DEV
- Reverse trial / freemium benchmarks — ChartMogul, Thoughtlytics, 1Capture
- Mercado golf Chile — Federación Chilena de Golf (chilegolf.cl), Wikipedia "Golf en Chile"
- Distribución B2B2C golf — Clubessential/BlueGolf, Golf Business Monitor (GolfN)
