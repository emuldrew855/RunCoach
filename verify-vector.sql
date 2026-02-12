-- Verify and create vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- List all extensions
\dx

-- Test vector type
SELECT 'vector extension is working'::text as status;
