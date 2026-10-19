-- Rollback de 20261018060000_eliminar_cuenta_atomica.sql.
-- Ojo: sin la función, DELETE /api/profile/delete-account responde 500 sin borrar nada. Revertir
-- también el route al borrado tabla por tabla (que deja cuentas a medio borrar) o desplegar sin él.
DROP FUNCTION IF EXISTS public.eliminar_cuenta(uuid);

-- La FK vuelve a NO ACTION. NOT NULL solo se puede restaurar si ninguna cuenta borrada dejó una
-- corrección sin autor: si las hay, este ALTER falla y hay que decidir qué hacer con esas filas.
ALTER TABLE public.score_audit_log
  DROP CONSTRAINT score_audit_log_changed_by_fkey,
  ADD CONSTRAINT score_audit_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id);
ALTER TABLE public.score_audit_log ALTER COLUMN changed_by SET NOT NULL;
