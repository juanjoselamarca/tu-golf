# Auditoría visual + contraste WCAG — 2026-05-05T04-39-38

**Producción:** https://golfersplus.vercel.app
**Pantallas:** 7 × 2 modos × 2 viewports = 28
**Fails de contraste totales:** 134
**Warnings (texto grande borderline):** 32

## Por pantalla

| Pantalla | Viewport | Modo | Path final | Fails | Warnings |
|---|---|---|---|---|---|
| home | desktop | light | / | 22 | 2 |
| login | desktop | light | /login | 3 | 0 |
| register | desktop | light | /register | 5 | 0 |
| recuperar | desktop | light | /recuperar | 5 | 0 |
| leaderboard | desktop | light | /leaderboard | 8 | 2 |
| ranking | desktop | light | /ranking | 7 | 0 |
| dashboard | desktop | light | /login | 3 | 0 |
| home | desktop | dark | / | 8 | 3 |
| login | desktop | dark | /login | 0 | 1 |
| register | desktop | dark | /register | 4 | 1 |
| recuperar | desktop | dark | /recuperar | 0 | 1 |
| leaderboard | desktop | dark | /leaderboard | 0 | 2 |
| ranking | desktop | dark | /ranking | 1 | 2 |
| dashboard | desktop | dark | /login | 0 | 1 |
| home | mobile | light | / | 22 | 2 |
| login | mobile | light | /login | 3 | 0 |
| register | mobile | light | /register | 5 | 0 |
| recuperar | mobile | light | /recuperar | 5 | 0 |
| leaderboard | mobile | light | /leaderboard | 9 | 1 |
| ranking | mobile | light | /ranking | 7 | 0 |
| dashboard | mobile | light | /login | 3 | 0 |
| home | mobile | dark | / | 8 | 3 |
| login | mobile | dark | /login | 0 | 1 |
| register | mobile | dark | /register | 4 | 1 |
| recuperar | mobile | dark | /recuperar | 0 | 1 |
| leaderboard | mobile | dark | /leaderboard | 1 | 5 |
| ranking | mobile | dark | /ranking | 1 | 2 |
| dashboard | mobile | dark | /login | 0 | 1 |

## Detalle de fails (primeros 10 por pantalla)

### home — desktop — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| A | Entrar | `rgb(196, 153, 42)` | `rgba(255, 255, 255, 0.97)` | **2.65** |
| A | Inicio | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| DIV | Tema | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| BUTTON | Oscuro | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| DIV | Golfers+ · El golf amateur en español · Chile y LatAm | `rgb(232, 192, 106)` | `rgb(250, 250, 247)` | **1.65** |
| SPAN | Tu mejor golf, | `rgb(237, 234, 228)` | `rgb(250, 250, 247)` | **1.15** |
| SPAN | empieza con los datos | `rgb(196, 153, 42)` | `rgb(250, 250, 247)` | **2.53** |
| P | Scoring en vivo, análisis con IA y coaching mental — todo lo | `rgba(237, 234, 227, 0.75)` | `rgb(250, 250, 247)` | **1.15** |
| A | Ver demo | `rgb(196, 153, 42)` | `rgb(250, 250, 247)` | **2.53** |
| P | Sin tarjeta · Sin descarga · En español | `rgba(237, 234, 227, 0.45)` | `rgb(250, 250, 247)` | **1.15** |

### login — desktop — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | o continúa con email | `rgba(196, 153, 42, 0.6)` | `rgb(255, 255, 255)` | **2.65** |
| A | Regístrate gratis → | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| A | Términos y Condiciones | `rgb(144, 153, 168)` | `rgb(255, 255, 255)` | **2.87** |

### register — desktop — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | o con email | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| A | Términos | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| BUTTON | Crear mi cuenta → | `rgb(255, 255, 255)` | `rgb(196, 153, 42)` | **2.65** |
| P | GRATIS  · SIN TARJETA  · SIN SPAM | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| A | Términos y Condiciones | `rgb(144, 153, 168)` | `rgb(255, 255, 255)` | **2.87** |

### recuperar — desktop — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| A | Entrar | `rgb(196, 153, 42)` | `rgba(255, 255, 255, 0.97)` | **2.65** |
| DIV | Tema | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| BUTTON | Oscuro | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| A | ← Volver al login | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| A | Términos y Condiciones | `rgb(144, 153, 168)` | `rgb(255, 255, 255)` | **2.87** |

### leaderboard — desktop — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| A | Entrar | `rgb(196, 153, 42)` | `rgba(255, 255, 255, 0.97)` | **2.65** |
| DIV | Tema | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| BUTTON | Oscuro | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| DIV | MP | `rgb(255, 255, 255)` | `rgb(250, 250, 247)` | **1.05** |
| SPAN | CAT B | `rgb(196, 153, 42)` | `rgb(250, 250, 247)` | **2.53** |
| SPAN | CAT A | `rgb(0, 230, 118)` | `rgb(250, 250, 247)` | **1.6** |
| SPAN | 13 | `rgba(255, 255, 255, 0.6)` | `rgb(250, 250, 247)` | **1.05** |
| A | Términos y Condiciones | `rgb(144, 153, 168)` | `rgb(255, 255, 255)` | **2.87** |

### ranking — desktop — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| A | Entrar | `rgb(196, 153, 42)` | `rgba(255, 255, 255, 0.97)` | **2.65** |
| A | Ranking | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| DIV | Tema | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| BUTTON | Oscuro | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| SPAN | Índice FedeGolf | `rgb(144, 153, 168)` | `rgb(255, 255, 255)` | **2.87** |
| DIV | 01 | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| A | Términos y Condiciones | `rgb(144, 153, 168)` | `rgb(255, 255, 255)` | **2.87** |

### dashboard — desktop — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | o continúa con email | `rgba(196, 153, 42, 0.6)` | `rgb(255, 255, 255)` | **2.65** |
| A | Regístrate gratis → | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| A | Términos y Condiciones | `rgb(144, 153, 168)` | `rgb(255, 255, 255)` | **2.87** |

### home — desktop — dark
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| DIV | Golfers+ · El golf amateur en español · Chile y LatAm | `rgb(232, 192, 106)` | `rgb(255,255,255)` | **1.72** |
| SPAN | Tu mejor golf, | `rgb(237, 234, 228)` | `rgb(255,255,255)` | **1.2** |
| SPAN | empieza con los datos | `rgb(196, 153, 42)` | `rgb(255,255,255)` | **2.65** |
| P | Scoring en vivo, análisis con IA y coaching mental — todo lo | `rgba(237, 234, 227, 0.75)` | `rgb(255,255,255)` | **1.2** |
| A | Ver demo | `rgb(196, 153, 42)` | `rgb(255,255,255)` | **2.65** |
| P | Sin tarjeta · Sin descarga · En español | `rgba(237, 234, 227, 0.45)` | `rgb(255,255,255)` | **1.2** |
| H2 | Todo para mejorar tu juego | `rgb(237, 234, 228)` | `rgb(255,255,255)` | **1.2** |
| H3 | Crea la competencia | `rgb(237, 234, 228)` | `rgb(255,255,255)` | **1.2** |

### register — desktop — dark
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | o con email | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| A | Términos | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| BUTTON | Crear mi cuenta → | `rgb(255, 255, 255)` | `rgb(196, 153, 42)` | **2.65** |
| P | GRATIS  · SIN TARJETA  · SIN SPAM | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |

### ranking — desktop — dark
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | Cálculo propio | `rgba(255, 255, 255, 0.7)` | `rgb(237, 234, 228)` | **1.2** |

### home — mobile — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| A | Entrar | `rgb(196, 153, 42)` | `rgba(255, 255, 255, 0.97)` | **2.65** |
| A | Inicio | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| DIV | Tema | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| BUTTON | Oscuro | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| DIV | Golfers+ · El golf amateur en español · Chile y LatAm | `rgb(232, 192, 106)` | `rgb(250, 250, 247)` | **1.65** |
| SPAN | Tu mejor golf, | `rgb(237, 234, 228)` | `rgb(250, 250, 247)` | **1.15** |
| SPAN | empieza con los datos | `rgb(196, 153, 42)` | `rgb(250, 250, 247)` | **2.53** |
| P | Scoring en vivo, análisis con IA y coaching mental — todo lo | `rgba(237, 234, 227, 0.75)` | `rgb(250, 250, 247)` | **1.15** |
| A | Ver demo | `rgb(196, 153, 42)` | `rgb(250, 250, 247)` | **2.53** |
| P | Sin tarjeta · Sin descarga · En español | `rgba(237, 234, 227, 0.45)` | `rgb(250, 250, 247)` | **1.15** |

### login — mobile — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | o continúa con email | `rgba(196, 153, 42, 0.6)` | `rgb(255, 255, 255)` | **2.65** |
| A | Regístrate gratis → | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| A | Términos y Condiciones | `rgb(144, 153, 168)` | `rgb(255, 255, 255)` | **2.87** |

### register — mobile — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | o con email | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| A | Términos | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| BUTTON | Crear mi cuenta → | `rgb(255, 255, 255)` | `rgb(196, 153, 42)` | **2.65** |
| P | GRATIS  · SIN TARJETA  · SIN SPAM | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| A | Términos y Condiciones | `rgb(144, 153, 168)` | `rgb(255, 255, 255)` | **2.87** |

### recuperar — mobile — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| A | Entrar | `rgb(196, 153, 42)` | `rgba(255, 255, 255, 0.97)` | **2.65** |
| DIV | Tema | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| BUTTON | Oscuro | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| A | ← Volver al login | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| A | Términos y Condiciones | `rgb(144, 153, 168)` | `rgb(255, 255, 255)` | **2.87** |

### leaderboard — mobile — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| A | Entrar | `rgb(196, 153, 42)` | `rgba(255, 255, 255, 0.97)` | **2.65** |
| DIV | Tema | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| BUTTON | Oscuro | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| SPAN | R 1 | `rgb(144, 153, 168)` | `rgb(250, 250, 247)` | **2.75** |
| DIV | Copa Golfers+ Demo | `rgb(26, 29, 36)` | `rgb(7, 13, 24)` | **1.15** |
| SPAN | 10 | `rgb(26, 29, 36)` | `rgb(7, 13, 24)` | **1.15** |
| SPAN | GWI™ = probabilidad de ganar vs el field | `rgb(144, 153, 168)` | `rgb(249, 250, 251)` | **2.75** |
| SPAN | POS | `rgb(156, 163, 175)` | `rgb(249, 250, 251)` | **2.43** |
| A | Términos y Condiciones | `rgb(144, 153, 168)` | `rgb(255, 255, 255)` | **2.87** |

### ranking — mobile — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| A | Entrar | `rgb(196, 153, 42)` | `rgba(255, 255, 255, 0.97)` | **2.65** |
| A | Ranking | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| DIV | Tema | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| BUTTON | Oscuro | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| SPAN | Índice FedeGolf | `rgb(144, 153, 168)` | `rgb(255, 255, 255)` | **2.87** |
| DIV | 01 | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| A | Términos y Condiciones | `rgb(144, 153, 168)` | `rgb(255, 255, 255)` | **2.87** |

### dashboard — mobile — light
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | o continúa con email | `rgba(196, 153, 42, 0.6)` | `rgb(255, 255, 255)` | **2.65** |
| A | Regístrate gratis → | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| A | Términos y Condiciones | `rgb(144, 153, 168)` | `rgb(255, 255, 255)` | **2.87** |

### home — mobile — dark
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| DIV | Golfers+ · El golf amateur en español · Chile y LatAm | `rgb(232, 192, 106)` | `rgb(255,255,255)` | **1.72** |
| SPAN | Tu mejor golf, | `rgb(237, 234, 228)` | `rgb(255,255,255)` | **1.2** |
| SPAN | empieza con los datos | `rgb(196, 153, 42)` | `rgb(255,255,255)` | **2.65** |
| P | Scoring en vivo, análisis con IA y coaching mental — todo lo | `rgba(237, 234, 227, 0.75)` | `rgb(255,255,255)` | **1.2** |
| A | Ver demo | `rgb(196, 153, 42)` | `rgb(255,255,255)` | **2.65** |
| P | Sin tarjeta · Sin descarga · En español | `rgba(237, 234, 227, 0.45)` | `rgb(255,255,255)` | **1.2** |
| H2 | Todo para mejorar tu juego | `rgb(237, 234, 228)` | `rgb(255,255,255)` | **1.2** |
| H3 | Crea la competencia | `rgb(237, 234, 228)` | `rgb(255,255,255)` | **1.2** |

### register — mobile — dark
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | o con email | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |
| A | Términos | `rgb(196, 153, 42)` | `rgb(255, 255, 255)` | **2.65** |
| BUTTON | Crear mi cuenta → | `rgb(255, 255, 255)` | `rgb(196, 153, 42)` | **2.65** |
| P | GRATIS  · SIN TARJETA  · SIN SPAM | `rgb(148, 163, 184)` | `rgb(255, 255, 255)` | **2.56** |

### leaderboard — mobile — dark
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | POS | `rgb(156, 163, 175)` | `rgb(249, 250, 251)` | **2.43** |

### ranking — mobile — dark
| Tag | Texto | FG | BG | Ratio |
|---|---|---|---|---|
| SPAN | Cálculo propio | `rgba(255, 255, 255, 0.7)` | `rgb(237, 234, 228)` | **1.2** |
