SELECT pg_get_constraintdef(oid) AS constraint_def
FROM pg_constraint
WHERE conrelid = 'public.coach_events'::regclass
  AND contype = 'c';
