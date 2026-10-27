#!/bin/sh
# El pre-push verifica el checkout (HEAD): tsc, tests, build y verify-db-schema corren sobre lo que hay en disco.
# Si el push manda a una rama remota un commit distinto de HEAD, esas verificaciones no cubrirían lo que se empuja.
#
# Uso: sh scripts/git-hooks/push-solo-head.sh <sha de HEAD> < stdin del pre-push
# Cada línea de la stdin es "<ref local> <sha local> <ref remota> <sha remoto>".
# - Se revisa todo lo que va a refs/heads/* (rama remota), venga de una rama, de HEAD o de un sha suelto.
# - Un tag (refs/tags/*) no se revisa.
# - Un borrado (sha local todo en cero, 40 o 64 caracteres) no se revisa.
head_sha="$1"
while read -r local_ref local_sha remote_ref remote_sha || [ -n "$local_ref" ]; do
  [ -n "$local_ref" ] || continue
  case "$remote_ref" in
    refs/heads/*) ;;
    *) continue ;;
  esac
  case "$local_sha" in
    *[!0]*) ;;
    *) continue ;;
  esac
  if [ "$local_sha" != "$head_sha" ]; then
    echo "pre-push: $local_ref -> $remote_ref no es tu HEAD: haz el push desde el checkout de esa rama (el pre-push verifica HEAD)" >&2
    exit 1
  fi
done
exit 0
