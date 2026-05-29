# Paywall Premium Golfers+ — Diseño y Estrategia de Penetración

**Fecha:** 2026-05-29
**Autores:** Claude (CTO + Chief Sales Manager) · Juanjo (PM)
**Estado:** Aprobado — diseño y go-to-market. **NO implementar** hasta que el motor (cerebro v3 / anti-alucinación) esté estable (directiva CERO FALLOS). Este spec es la guía a seguir cuando toque encender monetización.

---

## 0. Tesis: por qué esto sale del estadio

Tres hechos que casi nadie tiene juntos, y nosotros sí:

1. **Ya tenemos lo más difícil construido.** La herramienta operativa de torneos que los clubes *usan*, + 137 canchas + integración FedeGolf + un motor de coach (tAIger+). El activo caro ya existe.
2. **El canal de distribución ya está fluyendo.** Cada torneo que un club corre en Golfers+ = una tanda de golfistas usando la app gratis. Ese es el tope del embudo, y ya gotea solo.
3. **El golf se vende por comunidad, no por ads.** ~60 clubes federados en Chile, todos se conocen. Quien gana clubes, gana golfistas. El modelo probado de la categoría (BlueGolf, 18Birdies) es B2B2C + referidos.

**La jugada:** no construir demanda desde cero — *convertir* el uso operativo (gratis, ya existente) en suscripción al coach. El paywall no es un muro; es el puente entre "uso la app en el torneo" y "el coach me hace mejor golfista".

**Filosofía de producto (insight pricing-IA, 28-may):** se vende **resultado, no features**. Cada plan = una promesa de outcome más grande. El moat no es la IA (commodity) sino **datos reales de golf chileno + outputs verificados** — por eso el anti-alucinación es prioridad de negocio, no técnica.

**Forma de distribución (fundamental):** Golfers+ es **web/PWA** (Next.js, sin app nativa). Consecuencia clave: **no pagamos el 30% de App Store / Play** ni estamos sujetos a sus reglas de IAP. Cobramos por web con pasarela chilena → mejores márgenes y control total de precios y códigos (ver §7).

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

### Cold-start: cómo aseguramos el primer "wow" (fundamental)

El embudo asume que el usuario *ya tiene rondas*. Un golfista nuevo de un torneo puede tener solo scores de torneo, o ninguno. Si el primer diagnóstico es flojo por falta de data, **el embudo no arranca.** Puente al wow:

1. **Importar historial:** usar nuestra importación por foto (OCR) + sync WHS de FedeGolf para sembrar rondas históricas al registrarse.
2. **Semilla con scores de torneo:** las rondas jugadas en torneos Golfers+ ya están en el sistema — alimentan el diagnóstico desde el día uno.
3. **Mini-quiz de onboarding:** hándicap aprox + falla típica → diagnóstico inicial con baja fricción.
4. **Umbral de confianza honesto (anti-alucinación):** si no hay data suficiente, el coach **no inventa** — dice *"jugá 1-2 rondas más para tu diagnóstico completo"*. Mejor honesto que un wow falso que destruye confianza (CERO FALLOS).

### Incentivo al organizador (alinear el nodo de distribución)

El organizador es quien trae jugadores — el nodo más valioso del embudo y hoy sin incentivo. Propuesta: **organizador activo (corre torneos / supera N jugadores) obtiene Pro gratis o un pool de códigos para repartir a sus jugadores.** Convierte al organizador en vendedor sin que lo sienta. A definir el umbral exacto en el plan.

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

**Packaging psicológico:** Pro+ funciona también como **ancla alta** — su precio hace que Pro se perciba razonable (efecto decoy). El plan destacado por default es **Pro anual** (el que queremos vender).

**Por qué la proyección de Pro+ ya es viable:** el motor (cerebro v2) ya calcula hándicap equivalente y tenemos historial. Es *empaquetar lo existente como outcome vendible* → bajo riesgo de implementación, alto valor percibido.

---

## 4. Pricing

**Cadencia:** mensual + **anual (destacado como "mejor valor", ~2 meses gratis)**. Confirmado por data de categoría: anual es el estándar, mejora retención y caja, y nos hace ver mejor valor que un mensual-only.

**Anclas propuestas (a validar — config, no hardcode, IVA incluido):**

| Plan | Mensual (CLP) | Anual (CLP) | Equivalente USD/año |
|---|---|---|---|
| **Pro** | ~$6.990 | ~$59.900 | ~$63 |
| **Pro+ Elite** | ~$11.990 | ~$99.900 | ~$105 |

Racional: Pro entre The Grint ($40) y 18Birdies ($100), justificado por el coach. Pro+ a la altura de 18Birdies, justificado por proyección + comparativas. **Moneda CLP** (el target chileno percibe USD como ajeno/caro). Precio/moneda/cadencia **por config con flag**.

**Anclaje de precio en la UI:** mostrar el número relativo a algo conocido — *"menos que una docena de bolas al mes"* / *"el precio de medio balde en el driving"*.

### Cost-to-serve y margen por tier (fundamental — la lección de McKinsey aplicada a nosotros)

El coach tiene **COGS real**: cada sesión de tAIger quema tokens LLM (hoy Gemini, presupuesto inicial ~$5 USD — insuficiente a escala). Un usuario Pro+ intensivo puede costar **más de lo que paga**. Sin medir esto vendemos a pérdida sin saberlo.

- **Estimar costo por sesión de coach** (tokens × precio modelo) y costo medio mensual por usuario Pro / Pro+.
- **Margen bruto objetivo por tier ≥ ~70%** tras COGS de LLM + pasarela (~3% comisión).
- **Fair-use en "ilimitado":** "ilimitado razonable" con tope blando alto (ej. N sesiones/mes) para acotar el costo del 1% abusivo, sin que el 99% lo note.
- **Línea de presupuesto LLM real** en el modelo financiero antes de Fase 2 (el budget de $5 es de prueba, no de producción).

### Founding members y grandfathering (palanca de lanzamiento)

- **"Socio Fundador":** primeros N usuarios y **clubes piloto** obtienen **precio fijo de por vida** (o descuento permanente). Premia early adopters, crea urgencia y le da a los clubes piloto una razón para empujar.
- **Grandfathering:** al subir precios, los suscriptores existentes **mantienen su precio**. Política explícita desde el día uno (evita churn por aumento y construye confianza).

### Cómo validamos el precio (no casarse con la ancla)

Las cifras de arriba son educadas, no verdades. Validar antes de fijar:
- **Encuesta van Westendorp** (precio "muy caro / caro / barato / muy barato") a los clubes piloto.
- **A/B de price page** en Fase 1-2.
- **Willingness-to-pay observada** en el trial → paid de la Fase 1.

---

## 5. Free trial (reverse trial por rondas)

**Modelo:** reverse trial — el usuario nuevo recibe **acceso Pro+ completo durante sus próximas 3 rondas** (tope de 30 días si no juega), **sin tarjeta de crédito**. Al terminar, cae a Gratis (diagnóstico) y aparece el gatillo de conversión con sus resultados reales.

**Por qué estas decisiones:**
- **Por rondas, no por días:** el golfista juega 1-2 veces/semana; un trial de 7 días = 1 ronda = no alcanza a sentir el plan. Por rondas garantiza que se cierre el loop de valor (juego → plan → juego → ¿funcionó? → plan ajustado). **Diferenciador: nadie en la categoría lo hace.** (Resuelve la duda rondas-vs-sesiones: una sesión de coach se dispara por ronda → 3 rondas = 3 sesiones, misma unidad.)
- **Pro+ completo:** ve el wow máximo (incluida la proyección). Aversión a la pérdida = mayor conversión post-trial.
- **Sin tarjeta:** maximiza *inicios* de trial; el free tier retiene igual. (Trade-off consciente: pedir tarjeta = opt-out convierte 2-3× más — testeable más adelante.)
- **Tope de 30 días:** evita trial colgado eterno para inactivos.

**Features del trial (Pro+ completo):** plan tras cada ronda · seguimiento ronda a ronda · proyección de hándicap + objetivo de temporada · comparativa vs tu mejor versión / golfistas similares · historial y stats completos.

**Anti-abuso (fundamental):** **un trial por identidad verificada** (teléfono/email) + fingerprint de dispositivo. Sin esto, cuentas nuevas = trials infinitos. Sin trial repetido para una identidad ya usada.

**Post-trial:** cae a Gratis. El gatillo usa **datos reales del trial**: *"En estas 3 rondas, tu plan te bajó 2 golpes. Mantén tu coach → Pro/Pro+."* (Si no mejoró: *"tu plan recién empieza a rendir — los cambios se consolidan en 4-5 rondas"*.)

---

## 6. Sistema de códigos de descuento

Tres usos, un solo motor. **Los códigos de club son un canal de distribución, no solo un descuento.**

### Tipos de código
| Tipo | Qué hace | Uso típico |
|---|---|---|
| `percent` | % de descuento | Promos ("LANZAMIENTO50" = 50% primer año) |
| `fixed` | Monto fijo off | Promos puntuales |
| `free_period` | N meses o N rondas gratis | Clubes ("3 meses Pro gratis socios Club X") |
| `comp` | 100% — acceso comp | Family & friends, prensa, embajadores, organizadores |

### Campañas (scope)
- **Family & friends:** `comp` o `free_period` largo, `max_redemptions` bajo, único por persona.
- **Clubes (B2B2C — el estratégico):** código del club (ej. `LASBRISAS`) que da a sus socios X% o N meses gratis. **Compartido** (muchos usos) o **único por socio**. Club recibe co-branding / torneos potenciados. Atribución por `partner_club_id` → medimos installs y conversiones por club.
- **Promociones:** códigos de marketing, acotados en tiempo y usos.

### Mecánica
- Validación **server-side**: ventana activa + usos restantes + unicidad por usuario + tier/cadencia aplicable.
- **Un código por suscripción** (no apilables) salvo regla explícita.
- Tracking por `campaign_label` para atribución.

### Modelo de datos
- `discount_codes`: `code`, `type`, `value`, `tier_scope`, `cadence_scope`, `max_redemptions`, `redemptions_count`, `valid_from`, `valid_until`, `campaign_label`, `partner_club_id`, `created_by`, `active`.
- `code_redemptions`: `code_id`, `user_id`, `subscription_id`, `redeemed_at` (previene doble uso + auditoría).
- **Admin UI** para generar/gestionar códigos (área `admin/golf-ops`).

> **Ventaja de ser PWA:** al cobrar por web (no IAP), tenemos **control total** sobre estos códigos sin las restricciones de Apple Offer Codes / Google promo codes. Esto solo justifica la decisión de cobrar por web (ver §7).

---

## 7. Cobro, legal y tributario (Chile)

Sección crítica para poder cobrar de verdad. **Corrige el supuesto erróneo de "IAP vs Stripe": somos PWA, el dilema real es qué pasarela chilena.**

### Pasarela de pago
- **No usamos IAP** (no estamos en App Store/Play) → sin comisión 30%, sin reglas de tienda.
- **Stripe casi no opera en Chile** (requiere entidad extranjera) → descartado como primario.
- **Opciones chilenas para suscripción recurrente:** **Flow**, **Mercado Pago** (API de suscripciones), **Transbank Webpay/Oneclick**, Khipu (transferencia).
- **Recomendación:** Flow o Mercado Pago — soportan recurrencia, múltiples medios (tarjeta + transferencia), integración más simple, comisión ~2-4%. **Decisión final en el plan de implementación.**

### Legal / tributario
- **IVA 19%** incluido en el precio mostrado (convención B2C chilena: precio IVA-incluido).
- **Boleta electrónica (SII)** obligatoria por cada cobro → integrar SII directo o vía proveedor (Bsale/Nubox) o el que provea la pasarela.
- **Derecho a retracto / SERNAC:** política de cancelación y reembolso clara y accesible. Ya existe `/reembolsos` — extender a suscripciones.
- **Términos de servicio + privacidad** para datos de pago.

### Dunning (pagos fallidos — fuente mayor de churn)
- Reintentos inteligentes (3-5 intentos escalonados en días).
- Aviso por email/push: "actualiza tu medio de pago".
- **Período de gracia** antes de degradar a free (no cortar el coach de golpe).
- Flujo de "actualizar tarjeta" en 1 paso.

---

## 8. Modelo de gating — qué se gatea y qué nunca

**Nunca bloqueado (la app operativa es 100% libre):**
- Crear/jugar torneos, scorear, leaderboard, share cards.
- Diagnóstico del coach (saber *qué* mejorar).
- Razón: protege CERO FALLOS (un torneo real jamás topa un muro) y no castiga al organizador. **El uso operativo gratis ES el canal de adquisición — cobrarlo lo mataría.**

**Gateado:**
- **Pro:** el *plan de mejora* (el cómo) + seguimiento + historial/stats completos.
- **Pro+:** proyección de temporada + comparativas + objetivo del año.

El gancho es estructural: el usuario gratis **siempre sabe su problema** pero no recibe la solución continua.

---

## 9. Gatillo y experiencia "wow" (estándar elite)

Lo que hacen los mejores paywalls del mundo (Noom, Whoop, Flo), aplicado a golf:

1. **Mostrar el plan, no prometerlo.** Tras el diagnóstico, mostrar el **primer paso real y específico, gratis**, y bloquear el resto:
   > *"tAIger+ analizó tus 47 rondas. Tu mayor fuga: el segundo putt. Primer paso → deja el approach bajo el hoyo, nunca arriba. [Los 4 pasos restantes ↓ desbloquéalos]"*
   El asombro = especificidad sobre él. (Validado: Noom usa exactamente esto.)
2. **El número de tu futuro** (héroe de Pro+): *"A este ritmo, llegas a hándicap 12 en septiembre."*
3. **Una promesa, un número por plan** (anti-lista de checks). La lista de features va abajo, chica.
4. **CTA por beneficio:** "Activar mi plan", nunca "Suscribirse".
5. **Gatillo en pico de motivación:** contextual, post-diagnóstico/post-trial. Soft, nunca interrumpe.
6. **Prueba social:** "X golfistas chilenos mejorando con tAIger+", rating, mini-testimonios reales.
7. **Mostrar el "after":** gráfico de proyección de hándicap bajando.
8. **Capa de confianza:** "cancela cuando quieras", "tus datos son tuyos", restaurar/gestionar, aplicar código.
9. **El coach ya hizo el trabajo:** *"ya te armó el plan, solo falta activarlo"*.

**Pantalla de gestión** (gestión de cuenta): ver plan, cambiar/cancelar, restaurar, aplicar código, actualizar medio de pago. CTA dorado sobre azul/negro (marca, paleta `src/golf/core/colors`). Diseño visual final → `design-shotgun` en implementación.

---

## 10. Retención y estacionalidad (clave en Chile)

El golf chileno tiene temporada: verano (oct–mar) peak, invierno (may–ago) bajo. Un mensual se cae en invierno.

- **Anual** captura el año completo (razón #1 por la que el anual importa).
- **Pausar suscripción** (en vez de cancelar) para temporada baja → reduce churn duro.
- **Códigos winback** al inicio de temporada para lapsos.
- **Coach de invierno:** plan de práctica/driving para off-season → el valor persiste cuando no se juega.

---

## 11. Arquitectura técnica (alto nivel)

- **Capa de entitlements:** hook `useEntitlement(feature)` — la UI pregunta por *capacidad*, no por nombre de plan.
- **Gate como componente:** `<ProGate feature="plan-mejora" fallback={<UpsellCard/>}>...`.
- **Estado de suscripción:** `profiles.subscription_tier` (`free` | `pro` | `pro_plus`) + `subscription_status` (incl. `trialing`, `past_due`, `paused`) + `trial_rounds_remaining` / `trial_ends_at` + tabla `billing_events` (auditoría/idempotencia de webhooks de la pasarela).
- **Trial por rondas:** contador decremental atado al evento "ronda finalizada"; cae a free al llegar a 0 o pasar el tope de 30 días. **Anti-abuso:** unicidad por identidad verificada.
- **Dunning:** estado `past_due` + cron de reintentos + período de gracia antes de degradar.
- **Códigos:** `discount_codes` + `code_redemptions` (§6).
- **Config de planes/precios:** catálogo en config con flag (tiers, precios, moneda, cadencia, anual on/off, founding-member lock).
- **Pasarela:** Flow / Mercado Pago (§7); abstracción de provider para no acoplar. Verificación server-side del estado premium antes de servir contenido gateado.
- Construcción al estándar "el que toca, ordena": entitlements en `src/lib/`/`src/golf/`; datos vía `src/lib/data/`.

---

## 12. Métricas e instrumentación

**Plan de tracking (PostHog — ya instalado):** eventos en cada paso del embudo — `diagnosis_viewed`, `trial_started`, `trial_round_completed`, `trial_ended`, `paywall_viewed`, `plan_selected`, `subscribed`, `payment_failed`, `churned`, `code_redeemed` (con `partner_club_id`).

**KPIs:**
- **Activación:** % de operativos que registran ronda propia + reciben diagnóstico.
- **Trial start rate** y **Trial → paid** (objetivo 8–12%, posible más alto por modelo rondas + free valioso).
- **Mix anual** · **Installs/conversiones por club** · **Churn** (mensual vs anual) · **LTV** · **CAC por canal** · **Margen bruto por tier** (con COGS de LLM).
- **ROI del coach:** mejora promedio de golpes de usuarios Pro → munición de marketing y prueba social.

---

## 13. Fases de lanzamiento

| Fase | Qué | Pre-requisito |
|---|---|---|
| **0 — Pre** | Paywall OFF. Motor estable + anti-alucinación (cerebro v3). | CERO FALLOS |
| **1 — Soft (1-2 clubes piloto)** | Encender con clubes amigos. Códigos F&F + Socio Fundador. Validar precio + activación + trial. | Fase 0 ✅ |
| **2 — Canal de club** | Códigos de club a clubes que ya corren torneos. Anual ON. Presupuesto LLM real. | Señal de conversión en Fase 1 |
| **3 — Escala** | Asociación/federación, promociones, loop de referidos. | Métricas sanas en Fase 2 |

---

## 14. Riesgos

- **Anti-alucinación sin resolver** → diagnóstico falso → confianza destruida → no vuelve nunca (CERO FALLOS). **Gate duro antes de Fase 1.**
- **Cost-to-serve descontrolado** → vender el coach a pérdida. Medir margen antes de escalar (§4).
- **Cold-start** → primer diagnóstico flojo mata el embudo. Resolver puente al wow (§2).
- **Cumplimiento tributario** → no emitir boleta = problema legal. Resolver antes de cobrar (§7).
- **Precio mal calibrado vs The Grint** → validar, no adivinar (§4).
- **Canibalizar la buena voluntad operativa** → uso operativo 100% gratis para siempre. No negociable.
- **Estacionalidad** → anual + pausa + winback (§10).

---

## 15. Fuera de alcance (YAGNI)

- **Tier Club/B2B como producto pago** (el club *distribuye*, no paga; cobrarle es otro spec).
- **Cobro per-outcome** ("% de tu mejora"): marco mental, no mecanismo.
- **Plan familiar / multi-usuario:** posible palanca futura, no v1.
- **Diseño visual final** → `design-shotgun` + `frontend-design` en implementación.
- **Apilamiento de códigos**, multi-moneda simultánea, regalar suscripciones → post-validación.

---

## 16. Métrica de éxito (norte)

Conversión gratis → trial → Pro/Pro+ impulsada por el momento de deseo y el canal de club, con **margen bruto sano** y **sin degradar jamás la experiencia operativa de torneo** (CERO FALLOS intacto). Señal de que ganamos: clubes pidiendo su código, y usuarios Pro mostrando "bajé X golpes con mi coach".

---

## Anexo — Fuentes del benchmark

- The Grint pricing — Windtree Golf, MyGolfSpy
- 18Birdies / Arccos pricing — ScoringZone (golf app subscription cost 2026)
- Paywall elite (Noom/Whoop/Flo), CTA, timing — Apphud, Airbridge, PaywallPro/DEV
- Reverse trial / freemium benchmarks — ChartMogul, Thoughtlytics, 1Capture
- Mercado golf Chile — Federación Chilena de Golf (chilegolf.cl), Wikipedia "Golf en Chile"
- Distribución B2B2C golf — Clubessential/BlueGolf, Golf Business Monitor (GolfN)
