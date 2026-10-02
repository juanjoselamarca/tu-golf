# graphify — mapa del codebase

> Detalle movido desde `CLAUDE.md` el 02-oct-2026 (texto original, sin cambios). CLAUDE.md conserva la regla resumida y apunta acá.

El repo tiene un knowledge graph en `graphify-out/` con god nodes, comunidades y relaciones cross-archivo (código + docs + ADRs).

### Setup post-clone (cada dev, una sola vez)

```bash
# 1. Instalar la CLI (Python 3.10+)
uv tool install graphifyy --with openai
graphify install --platform windows  # o sin flag en Linux/Mac

# 2. Generar graph.json + graph.html locales (gitignored — AST local, gratis, ~30s)
graphify update .

# 3. Wireo hooks git (post-commit auto-rebuild, post-checkout, merge driver)
graphify hook install
```

A partir de ahí cualquier `git commit` rebuilds el grafo en background.

### Reglas de uso (Claude)

- ANTES de leer fuentes, grep/glob o responder preguntas sobre el codebase: leer `graphify-out/GRAPH_REPORT.md`. Es el mapa primario.
- Si existe `graphify-out/wiki/index.md`, navegarlo en vez de leer archivos crudos.
- Para "cómo se relaciona X con Y" cross-módulo: preferir `graphify query "<pregunta>"`, `graphify path "<A>" "<B>"`, o `graphify explain "<concepto>"` sobre grep — atraviesan las aristas EXTRACTED + INFERRED del grafo en vez de escanear archivos.
- Si `graphify-out/graph.json` no existe (clon fresco antes del setup): correr `graphify update .` antes de usar las queries.

### Mantenimiento

- Tras cambios de código: `graphify update .` (gratis, AST local). Automático si corriste `graphify hook install`.
- Re-extracción semántica completa (refresca nodos de docs + re-labela comunidades): `set -a && . ./.env.local && set +a && graphify extract . --backend gemini`. ~$1 USD vía Gemini Flash. Sólo cuando cambian docs importantes (CLAUDE.md, ARQUITECTURA.md, ADRs, etc.).

### Por qué `graph.json` no se commitea

Pesa ~2MB y se reescribe en cada cambio de código. Committearlo significa que `.git` infla 100MB+/año solo por el grafo. En su lugar committeamos los artefactos chicos (report + análisis + labels) y cada dev/agente regenera `graph.json` local con `graphify update .` (gratis).
