-- Fix sequence synchronization for all tables with SERIAL PRIMARY KEY
-- This resolves "duplicate key value violates unique constraint" errors
-- that occur when sequences fall out of sync with actual data

-- Fix planned_workouts sequence
SELECT setval(
  pg_get_serial_sequence('planned_workouts', 'id'),
  COALESCE((SELECT MAX(id) FROM planned_workouts), 0) + 1,
  false
);

-- Fix training_plans sequence (just in case)
SELECT setval(
  pg_get_serial_sequence('training_plans', 'id'),
  COALESCE((SELECT MAX(id) FROM training_plans), 0) + 1,
  false
);

-- Fix activities sequence (just in case)
SELECT setval(
  pg_get_serial_sequence('activities', 'id'),
  COALESCE((SELECT MAX(id) FROM activities), 0) + 1,
  false
);

-- Fix conversations sequence (just in case)
SELECT setval(
  pg_get_serial_sequence('conversations', 'id'),
  COALESCE((SELECT MAX(id) FROM conversations), 0) + 1,
  false
);

-- Fix messages sequence (just in case)
SELECT setval(
  pg_get_serial_sequence('messages', 'id'),
  COALESCE((SELECT MAX(id) FROM messages), 0) + 1,
  false
);
