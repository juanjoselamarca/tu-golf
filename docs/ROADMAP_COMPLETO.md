# TU GOLF — ROADMAP OFICIAL

Última actualización: 17 Mar 2026

## PRINCIPIOS PERMANENTES

1. Mobile first — 90% del uso es desde el campo
2. Costo cero hasta PMF
3. Datos siempre en gross — neto y stableford son derivados
4. El tAIger es el corazón del producto a largo plazo
5. Diseño: #070d18 bg · #c4992a gold · Playfair Display

---

## Sprint 9C — Fixes urgentes 🔧
- Fix PGA widget invisible en mobile (clase hidden lg:flex)
- Fix error modo_juego → graceful fallback
- Historial siempre gross, neto calculado automático
- SQL idempotente completo

---

## Sprint 10 — el tAIger v1 🐯
**El sprint más importante del proyecto**

### Páginas nuevas
/coach → Dashboard del coach
/coach/sesion/nuevo → Nueva conversación
/coach/sesion/[id] → Conversación específica
/coach/progreso → Evolución y patrones
/coach/onboarding → 12 preguntas (solo primera vez)

### System Prompt v1.0 — Base de conocimiento

LIBROS CORE:
- Rotella: proceso sobre resultado, rutina pre-shot
- Valiante: identidad del golfista fearless
- Gallwey: Self 1 vs Self 2, interferencia mental
- Parent: aceptación, presente, reset
- VISION54 Nilsson/Marriott: Think Box / Play Box
- Ericsson: práctica deliberada
- Coyle: The Talent Code, mielinización
- Baumeister: agotamiento de decisiones en ronda

CASOS DEL TOUR (citar por nombre):
- Tiger Woods: rutina pre-shot milimétrica, next shot
- Rory McIlroy: reconstrucción identidad post-Masters 2011
- Jordan Spieth: verbalización positiva, proceso
- Jon Rahm: intensidad controlada
- Bernhard Langer: fe y consistencia a los 65 años
- Lydia Ko: desapego del resultado
- Seve Ballesteros: creatividad bajo presión

CARÁCTER del tAIger:
- Directo como Tim Grover (coach de Jordan y Kobe)
- No condescendiente, no complaciente
- Usa datos REALES del jugador en cada respuesta
- Una sola recomendación concreta por sesión
- Siempre cierra con: 1 acción + tiempo + métrica de éxito
- NUNCA dice "¡Mucho ánimo!" ni "Espero que te ayude"
- No da consejos de swing

LOS 8 PILARES PSICOLÓGICOS:
1. Identidad del golfista (no eres tu score)
2. Process focus vs outcome focus
3. Rutina pre-shot como ancla mental
4. Manejo del error y reset (10 segundos de Rotella)
5. Gestión de energía durante 18 hoyos
6. Presión como aliada (arousal óptimo)
7. Visualización offline
8. Autoconfianza con evidencia real

TÉCNICAS QUE ASIGNA:
- reset_4_pasos: exhalar, paso atrás, ancla, nueva rutina
- breathing_4_4_6: 4 inhala, 4 retén, 6 exhala
- think_box: decidir antes de la línea y comprometerse
- play_box: en la bola solo sensaciones, sin instrucciones
- identity_anchor: "Soy un jugador que..."
- next_shot_mentality: el pasado no existe
- scorecard_amnesia: olvidar el score hasta el hoyo 18

PATRONES QUE DETECTA:
- back_nine_collapse: back9 > front9 en más de 2.5 strokes
- post_bogey_spiral: score post-bogey peor que promedio
- first_hole_anxiety: hoyo 1 > resto × 1.3
- social_pressure: peores scores en torneos vs rondas solas

TIPOS DE SESIÓN:
- post_round: automático al terminar ronda
- weekly_plan: manual, recomendado lunes
- pre_tournament: 24-48h antes de competir
- onboarding: 12 preguntas, una sola vez

FREEMIUM:
Gratis: 3 sesiones/mes + 1 plan semanal/mes
Pro: sesiones ilimitadas + predicciones + historial completo

---

## Sprint 11 — Garmin Golf + tAIger v2 ⌚
- Importar CSV manual de Garmin (fase 1)
- OAuth Garmin automático (fase 2)
- Parser Garmin → historical_rounds
- tAIger v2: aprendizaje acumulativo con datos colectivos
- Predicción pre-torneo personalizada
- Plan de práctica semanal generado por IA

---

## Sprint 12 — PWA + Monetización 💰
- Progressive Web App (agregar a pantalla de inicio)
- Funciona offline: scorecard sin conexión + sync
- Notificaciones push (análisis listo, torneo próximo)
- Plan Pro USD 9.99/mes: tAIger ilimitado
- Paywall elegante (nunca bloqueante)
- Analytics de producto en Supabase

---

## Sprint 13 — Comunidad y Escala 🌐
- Rankings por club/región
- Sistema de amigos con comparación de progreso
- Torneos multi-ronda con corte proyectado
- Handicap WHS calculado automáticamente
- Exportar tarjeta como imagen para Instagram/WhatsApp
- Liga de temporada (sistema FedEx Cup simplificado)

---

## Sprint 14 — tAIger v3 Inteligencia Colectiva 🧠
- Queries SQL mensuales de efectividad de técnicas
- "73% de jugadores con tu patrón mejoraron con esto"
- 4 arquetipos de jugador detectados automáticamente
- Comparación anónima con jugadores similares
- Fine-tuning futuro cuando haya 1000+ usuarios

---

## 7 IDEAS PROFUNDAS (backlog)

IDEA 1 — Momento del partido en torneos:
Detectar automáticamente el hoyo donde se definió el torneo. Genera narrativa entre rondas.

IDEA 2 — tAIger pre-hoyo:
Una frase táctica antes de cada hoyo basada en el historial del jugador EN ESE hoyo específico.
Costo: ~$0.003 por frase. Valor percibido: enorme.

IDEA 3 — Tendencia del índice:
Gráfico de evolución del handicap últimos 12 meses con proyección: "A este ritmo en 3 meses estarás en 10"

IDEA 4 — Memoria de cancha:
Por cancha guardar hoyos difíciles/fáciles del jugador. Mostrar al seleccionar cancha en nueva ronda.

IDEA 5 — Liga de torneos:
N torneos durante una temporada con puntos acumulados. Lo que necesitan los clubes de golf realmente.

IDEA 6 — Dónde pierdes strokes:
Radar chart de 5 dimensiones (tee, approach, short game, putting, mental). Datos ya existentes desde Sprint 8.

IDEA 7 — Competición virtual entre canchas:
Match play entre jugadores en distintas canchas. Ajuste por Course Rating y Slope. Feature más viral.

---

## MÉTRICAS DE ÉXITO

Sprint 10: 50% usuarios inician sesión tAIger, NPS > 8
Sprint 11: 30% conectan Garmin, 2x tarjetas por usuario
Sprint 12: 5% convierten a Pro, churn < 5%/mes
Sprint 13: 40% tienen al menos 1 amigo en la app

---

## DEUDA TÉCNICA

ALTA: SQL idempotente, schema correcto (numero/nombre), error boundaries en todas las páginas
MEDIA: Rate limiting /api/game, logger estructurado
BAJA: i18n inglés/español, 36 hoyos, torneos por equipos
