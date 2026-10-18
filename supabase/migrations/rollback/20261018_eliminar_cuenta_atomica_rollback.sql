-- Rollback de 20261018060000_eliminar_cuenta_atomica.sql.
-- Ojo: sin la función, DELETE /api/profile/delete-account responde 500 sin borrar nada. Revertir
-- también el route al borrado tabla por tabla (que deja cuentas a medio borrar) o desplegar sin él.
DROP FUNCTION IF EXISTS public.eliminar_cuenta(uuid);
