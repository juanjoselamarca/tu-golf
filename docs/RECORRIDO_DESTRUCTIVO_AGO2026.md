# Recorrido Destructivo — Golfers+ (18 agosto 2026)

Inventario completo de todo lo roto, incompleto, confuso o feo. Base para el plan de ejecución.

---

## RESUMEN: 54 rutas, 5 dead-ends, 8 bugs de formato, ~25 issues de UX/diseño

---

## 1. DEAD-ENDS Y BOTONES ROTOS

| # | Severidad | Qué ve el usuario | Archivo | Qué pasa | Fix |
|---|-----------|-------------------|---------|----------|-----|
| DE-1 | **P0** | "Unirme con código" en Dashboard | CompetenciaTab.tsx:293 | **404** — ruta `/torneo/unirme` no existe | Crear página con formulario de código → redirect a `/torneo/[slug]/unirse` |
| DE-2 | **P0** | Cards de Match Play en bracket de torneo | MatchPlayBracket.tsx:74,276 | **Solo console.log** — click no hace nada visible | Implementar expansión de scorecard o modal de detalle |
| DE-3 | **P1** | Dot de notificación en "Mi Golf" | Navbar.tsx:481 | Deshabilitado con TODO — nunca muestra notificaciones nuevas | Restaurar con `useMiGolfHasNew()` |
| DE-4 | **P1** | "Liga de Golf" en play sheet | Navbar.tsx:654 | Comentado — no visible (bien manejado) | Dejar oculto hasta implementación |
| DE-5 | **P2** | Leaderboard individual en Match Play | IndividualLeaderboard.tsx:49 | `display: none` — correcto para el formato | No fix necesario |

---

## 2. BUGS DE FORMATOS NO-STROKE-PLAY

### Best Ball
| # | Severidad | Problema | Archivo | Fix |
|---|-----------|---------|---------|-----|
| FMT-1 | **P1** | `playerDotHcps[jid]` puede ser undefined → 0 strokes | BestBallTeamCard.tsx:194 | Agregar fallback: `?? playerHcp[jid] ?? 0` |
| FMT-2 | **P1** | UI no valida que todos los miembros tengan score antes de calcular team total | BestBallTeamCard.tsx | Agregar guard |

### Scramble
| # | Severidad | Problema | Archivo | Fix |
|---|-----------|---------|---------|-----|
| FMT-3 | **P1** | UI no diferencia visualmente Scramble (1 score) vs Best Ball (scores individuales) | score-grupo/page.tsx | Mostrar label "Score del equipo" vs "Score individual" |

### Foursome
| # | Severidad | Problema | Archivo | Fix |
|---|-----------|---------|---------|-----|
| FMT-4 | **P2** | `invertirOrden` existe en el código pero no hay toggle en la UI | foursome.ts:49 | Exponer toggle en Step 3 del wizard |
| FMT-5 | **P2** | Scorecard no indica quién pegó cada hoyo | TeamLeaderboards.tsx | Agregar indicador A/B por hoyo |

### Stableford
| # | Severidad | Problema | Archivo | Fix |
|---|-----------|---------|---------|-----|
| FMT-6 | **P1** | Permite modo gross cuando Chile juega neto — inconsistencia con leyenda UI | rules.ts:51 | Decidir: restringir a neto o documentar gross |
| FMT-7 | **P2** | Display no muestra "34 puntos" sino score como stroke play | Score page | Formato-specific display para Stableford |

### Match Play
| # | Severidad | Problema | Archivo | Fix |
|---|-----------|---------|---------|-----|
| FMT-8 | **P1** | Resultado final ("3&2") NO se guarda en historical_rounds | useFinalizeRonda.ts:181 | Agregar campo `match_result` al record |

### Todos los formatos de equipo
| # | Severidad | Problema | Archivo | Fix |
|---|-----------|---------|---------|-----|
| FMT-9 | **P1** | Finalización pierde contexto de equipo — solo guarda scores individuales | useFinalizeRonda.ts:103 | Agregar `team_id` y `team_result` a historical_rounds |
| FMT-10 | **P1** | No hay explicación visual de reglas por formato al crear la ronda | AsignacionDeEquipos.tsx | Tooltip/card con reglas resumidas del formato elegido |

---

## 3. ISSUES DE UX/DISEÑO POR RUTA

### Landing y Auth (OK — 8/10)
- Landing es la mejor parte de la app visualmente
- Login/Register limpios con Google OAuth

### Dashboard (7/10 — primer contacto post-registro)
| # | Problema | Impacto |
|---|---------|---------|
| UX-1 | Dashboard vacío para usuario nuevo — sin onboarding | **CRÍTICO** — 85% rebota acá |
| UX-2 | Tabs "Competencia"/"Identidad" sin distinción visual clara | Medio |

### Scorer — Ronda Libre (8.5/10 — lo mejor)
| # | Problema | Impacto |
|---|---------|---------|
| UX-3 | Setup de ronda: 4 pasos, 15+ taps, sin "repetir última ronda" rápido | Alto — reportado por Juanjo |
| UX-4 | Desplegable de canchas recientes: lento, confuso al dedo | Alto — reportado por Juanjo |
| UX-5 | No se pueden conectar jugadores con cuenta existente — hay que re-tipear | Alto — reportado por Juanjo |
| UX-6 | Índice/tee de jugadores conectados no se auto-completa | Alto — reportado por Juanjo |
| UX-7 | "Descartar ronda" es cambio de texto en botón, no modal de confirmación | Medio |
| UX-8 | Score permite 1-19 sin advertencia relativa al par | Bajo |

### Coach tAIger+ (8/10 cuando funciona)
| # | Problema | Impacto |
|---|---------|---------|
| UX-9 | Requiere mínimo 1 ronda para activarse — contradice "impresionar desde primera tarjeta" | **CRÍTICO** — deal-breaker de Juanjo |
| UX-10 | No hay auto-trigger post-ronda — el coach no avisa que analizó la ronda | Alto |
| UX-11 | Costo Psicológico solo calcula si hay patrón `post_bogey_spiral` activo | Medio |

### Historial (7/10)
| # | Problema | Impacto |
|---|---------|---------|
| UX-12 | No muestra si una tarjeta cuenta o no para el índice | **ALTO** — reportado por Juanjo |
| UX-13 | No hay switch manual para incluir/excluir ronda del cálculo | Alto — Juanjo quiere control manual |
| UX-14 | Sin filtro por cancha, fecha, formato | Medio |
| UX-15 | Sin gráfico de progresión del handicap en el tiempo | Medio |

### Torneos (7/10 — core del producto)
| # | Problema | Impacto |
|---|---------|---------|
| UX-16 | No hay "Mis Torneos" en la navegación — difícil descubrir torneos | Alto |
| UX-17 | No hay QR para distribución en campo | Alto — estándar en golf |
| UX-18 | Invitación de jugadores uno por uno, no en lote | Alto |
| UX-19 | "Unirme con código" → 404 (dead-end DE-1) | **P0** |
| UX-20 | Sin botón "Join" visible para invitados en página de torneo | Alto |
| UX-21 | Si jugador llega tarde y grupos ya asignados, no se agrega automáticamente | Medio |
| UX-22 | Si jugador se retira, grupos no se rebalancean | Medio |

### Leaderboard (/leaderboard)
| # | Problema | Impacto |
|---|---------|---------|
| UX-23 | **Sirve datos DEMO** sin etiquetar — parece torneo real | **P0** — erosiona confianza |
| UX-24 | Juanjo no sabía que el leaderboard live existía — está escondido | Alto |

### Navegación general
| # | Problema | Impacto |
|---|---------|---------|
| UX-25 | Menú: COMUNIDAD/MI JUEGO/LABORATORIO — jerarquía confusa | Medio |
| UX-26 | "Intelligence" bajo LABORATORIO — nadie sabe qué es | Medio |
| UX-27 | Sin breadcrumbs en rutas profundas (/organizador/[slug]/scoring) | Bajo |

### Diseño visual ("irregular" según Juanjo)
| # | Problema | Impacto |
|---|---------|---------|
| DIS-1 | Colores hardcodeados en ~20 componentes vs CSS tokens | Inconsistencia visual |
| DIS-2 | Loading states: algunos con skeleton (bueno), otros con "Cargando..." texto | Irregular |
| DIS-3 | Botones disabled sin cambio visual uniforme (opacity/cursor) | Confuso |
| DIS-4 | Admin pages 5-6/10 vs scoring pages 8-9/10 — gap enorme | Irregular |

---

## 4. FORTALEZAS (preservar)

- **Scoring engine**: Motor WHS correcto, offline con localStorage + RPC merge
- **Format registry**: TEAM_FORMAT_KEYS, isTeamFormat() centralizados
- **Share cards**: Calidad PGA Tour, canvas rendering profesional
- **Leaderboard live (cuando muestra datos reales)**: Estética 8-9/10
- **Coach chat**: Streaming SSE, pattern highlighting, 8 frameworks de psicología
- **Validación de golf**: Handicap por formato (Scramble USGA, Foursome alternado)
- **Auth + middleware**: Robusto, redirect params, refresh tokens

---

## 5. CONTEO FINAL

| Categoría | P0 | P1 | P2 | Total |
|-----------|----|----|----|----|
| Dead-ends / botones rotos | 2 | 2 | 1 | 5 |
| Bugs de formatos | 0 | 7 | 3 | 10 |
| UX/diseño del flujo | 4 | 15 | 8 | 27 |
| **Total** | **6** | **24** | **12** | **42** |

---

**Siguiente paso:** Plan de ejecución con scope exacto basado en este inventario.
