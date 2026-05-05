# Auditoría visual + contraste WCAG — 2026-05-05T16-28-04

**Producción:** https://golfersplus.vercel.app
**Pantallas:** 7 × 2 modos × 2 viewports = 28
**Fails de contraste totales:** 21
**Warnings (texto grande borderline):** 23

## Por pantalla

| Pantalla | Viewport | Modo | Path final | Fails | Warnings |
|---|---|---|---|---|---|
| home | desktop | light | / | 2 | 1 |
| login | desktop | light | /login | 0 | 0 |
| register | desktop | light | /register | 0 | 0 |
| recuperar | desktop | light | /recuperar | 0 | 0 |
| leaderboard | desktop | light | /leaderboard | 4 | 2 |
| ranking | desktop | light | /ranking | 0 | 0 |
| dashboard | desktop | light | /login | 0 | 0 |
| home | desktop | dark | / | 4 | 1 |
| login | desktop | dark | /login | 0 | 2 |
| register | desktop | dark | /register | 0 | 0 |
| recuperar | desktop | dark | /recuperar | 0 | 1 |
| leaderboard | desktop | dark | /leaderboard | 0 | 1 |
| ranking | desktop | dark | /ranking | 1 | 0 |
| dashboard | desktop | dark | /login | 0 | 2 |
| home | mobile | light | / | 2 | 1 |
| login | mobile | light | /login | 0 | 0 |
| register | mobile | light | /register | 0 | 0 |
| recuperar | mobile | light | /recuperar | 0 | 0 |
| leaderboard | mobile | light | /leaderboard | 2 | 4 |
| ranking | mobile | light | /ranking | 0 | 0 |
| dashboard | mobile | light | /login | 0 | 0 |
| home | mobile | dark | / | 4 | 1 |
| login | mobile | dark | /login | 0 | 2 |
| register | mobile | dark | /register | 0 | 0 |
| recuperar | mobile | dark | /recuperar | 0 | 1 |
| leaderboard | mobile | dark | /leaderboard | 1 | 2 |
| ranking | mobile | dark | /ranking | 1 | 0 |
| dashboard | mobile | dark | /login | 0 | 2 |

## Detalle de fails (primeros 10 por pantalla)

### home — desktop — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | LABS | `rgb(196, 153, 42)` | `rgb(250, 250, 247)` | **2.53** |
| H2 | La ciencia detrás de tu juego | `rgb(237, 234, 228)` | `rgb(250, 250, 247)` | **1.15** |

### leaderboard — desktop — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| DIV | RS | `rgb(255, 255, 255)` | `rgb(250, 250, 247)` | **1.05** |
| SPAN | CAT A | `rgb(0, 230, 118)` | `rgb(250, 250, 247)` | **1.6** |
| SPAN | -1 | `rgb(196, 153, 42)` | `rgb(250, 250, 247)` | **2.53** |
| SPAN | 18 | `rgba(255, 255, 255, 0.6)` | `rgb(250, 250, 247)` | **1.05** |

### home — desktop — dark
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| H2 | Todo para mejorar tu juego | `rgb(237, 234, 228)` | `rgb(255,255,255)` | **1.2** |
| P | Tres herramientas diseñadas para el golfista amateur que qui | `rgb(148, 168, 192)` | `rgb(255,255,255)` | **2.44** |
| H3 | Crea la competencia | `rgb(237, 234, 228)` | `rgb(255,255,255)` | **1.2** |
| SPAN | LABS | `rgb(196, 153, 42)` | `rgb(255,255,255)` | **2.65** |

### ranking — desktop — dark
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | Cálculo propio | `rgba(255, 255, 255, 0.7)` | `rgb(237, 234, 228)` | **1.2** |

### home — mobile — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | LABS | `rgb(196, 153, 42)` | `rgb(250, 250, 247)` | **2.53** |
| H2 | La ciencia detrás de tu juego | `rgb(237, 234, 228)` | `rgb(250, 250, 247)` | **1.15** |

### leaderboard — mobile — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| DIV | Copa Golfers+ Demo | `rgb(26, 29, 36)` | `rgb(7, 13, 24)` | **1.15** |
| SPAN | 10 | `rgb(26, 29, 36)` | `rgb(7, 13, 24)` | **1.15** |

### home — mobile — dark
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| H2 | Todo para mejorar tu juego | `rgb(237, 234, 228)` | `rgb(255,255,255)` | **1.2** |
| P | Tres herramientas diseñadas para el golfista amateur que qui | `rgb(148, 168, 192)` | `rgb(255,255,255)` | **2.44** |
| H3 | Crea la competencia | `rgb(237, 234, 228)` | `rgb(255,255,255)` | **1.2** |
| SPAN | LABS | `rgb(196, 153, 42)` | `rgb(255,255,255)` | **2.65** |

### leaderboard — mobile — dark
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | GWI™ = probabilidad de ganar vs el field | `rgb(136, 149, 168)` | `rgb(249, 250, 251)` | **2.91** |

### ranking — mobile — dark
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | Cálculo propio | `rgba(255, 255, 255, 0.7)` | `rgb(237, 234, 228)` | **1.2** |
