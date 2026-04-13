-- Fix sequence synchronization for tables with SERIAL PRIMARY KEY
-- This resolves "duplicate key value violates unique constraint" errors
-- that occur when sequences fall out of sync with actual data
-- Note: conversations uses UUID, not SERIAL, so it's excluded

-- Fix planned_workouts sequence
SELECT setval(
  pg_get_serial_sequence('planned_workouts', 'id'),
  COALESCE((SELECT MAX(id) FROM planned_workouts), 0) + 1,
  false
);

-- Fix training_plans sequence
SELECT setval(
  pg_get_serial_sequence('training_plans', 'id'),
  COALESCE((SELECT MAX(id) FROM training_plans), 0) + 1,
  false
);

-- Fix activities sequence
SELECT setval(
  pg_get_serial_sequence('activities', 'id'),
  COALESCE((SELECT MAX(id) FROM activities), 0) + 1,
  false
);

-- Fix chat_messages sequence
SELECT setval(
  pg_get_serial_sequence('chat_messages', 'id'),
  COALESCE((SELECT MAX(id) FROM chat_messages), 0) + 1,
  false
);
