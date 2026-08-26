-- Prevent duplicate historical round entries from double-finalization.
-- Partial index: only applies when course_id IS NOT NULL.
-- Includes total_gross to allow legitimate double rounds at the same course
-- on the same day (different scores = different rounds).

-- Step 1: Deduplicate existing data (keep the latest entry by created_at)
DELETE FROM historical_rounds
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, played_at, course_id, total_gross
        ORDER BY created_at DESC
      ) as rn
    FROM historical_rounds
    WHERE course_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Step 2: Create unique partial index
CREATE UNIQUE INDEX IF NOT EXISTS uq_historical_user_date_course_gross
ON historical_rounds (user_id, played_at, course_id, total_gross)
WHERE course_id IS NOT NULL;
