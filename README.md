# Golfers+

Live scoring para torneos amateur · https://golfersplus.vercel.app

## Documentación — EMPEZAR AQUÍ

→ [docs/ESTADO_ACTUAL.md](docs/ESTADO_ACTUAL.md)

| Documento | Descripción |
|-----------|-------------|
| [ESTADO_ACTUAL.md](docs/ESTADO_ACTUAL.md) | ← Empezar aquí |
| [SPRINT_LOG.md](docs/SPRINT_LOG.md) | Historial sprints |
| [ROADMAP_COMPLETO.md](docs/ROADMAP_COMPLETO.md) | Visión futura |
| [ARQUITECTURA.md](docs/ARQUITECTURA.md) | Stack y schema BD |
| [TAIGER_SYSTEM_PROMPT.md](docs/TAIGER_SYSTEM_PROMPT.md) | tAIger |
| [GWI_MODELO.md](docs/GWI_MODELO.md) | Probabilidades |
| [SQL_PENDIENTE.md](docs/SQL_PENDIENTE.md) | SQL Supabase |

## Antes de trabajar siempre

```
git remote -v  → debe mostrar github.com/juanjoselamarca/tu-golf.git
git pull origin main
```

## Schema BD crítico

course_holes → columna: numero (NO hole_number)
courses → columna: nombre (NO name)
Siempre guardar: gross_score + net_score + points
