# Planes archivados

Planes ya shippeados o cerrados. Se mueven aquí cuando el feature está en producción y validado.

## Criterio de archivo

Un plan se mueve a `archive/YYYY-QN/` cuando:
- Todas las tasks están hechas y en `main`
- Está validado en producción (no es un draft de feature)
- Han pasado al menos 2 semanas desde el último commit relevante

## Cómo archivar

```bash
git mv docs/superpowers/plans/<archivo>.md docs/superpowers/plans/archive/YYYY-QN/
git commit -m "docs(plans): archive <archivo> (shipped YYYY-MM-DD)"
```

Si el plan es untracked (nunca se commiteó), usar `mv` normal.
