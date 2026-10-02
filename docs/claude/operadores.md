# OPERADORES — trazabilidad por sesión

> Detalle movido desde `CLAUDE.md` el 02-oct-2026 (texto original, sin cambios). CLAUDE.md conserva la regla resumida y apunta acá.

El proyecto tiene dos operadores humanos que trabajan en sesiones separadas de Claude Code. Para que Juanjo nunca confunda un PR de Max con uno suyo (y viceversa), se aplican estas convenciones automáticamente:

### Identificación automática

Al inicio de sesión, ejecutar `git config user.name` para detectar el operador:

| `git config user.name` | Operador |
|---|---|
| `juanjoselamarca` | Juanjo |
| `mundurragac` | Max |

Si el usuario no está en la tabla, preguntar quién es y agregarlo.

### Convenciones automáticas según operador

| | Juanjo | Max |
|---|---|---|
| **Branch suffix** | `-juanjo` | `-max` |
| **Label en PR** | `operador:juanjo` (azul) | `operador:max` (naranja) |
| **Co-Authored-By** | incluye `Sesión de Juanjo` | incluye `Sesión de Max` |

Ejemplo branch: `feat/fix-leaderboard-juanjo` vs `feat/fix-leaderboard-max`.

### Reglas

1. Claude aplica suffix + label **sin preguntar** — es automático.
2. Si el operador no se identifica, asumir Juanjo (es el PM y operador principal).
3. Los labels ya existen en GitHub: `operador:juanjo` y `operador:max`.
4. Cada operador trabaja en su propia sesión — no hay cambio de operador mid-sesión.
