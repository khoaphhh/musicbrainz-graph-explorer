\set ON_ERROR_STOP on

\echo 'Importing...'
\ir 00_init.sql
\ir 01_schema.sql
\ir 02_import_staging.sql
\ir 03_transform.sql
\ir 04_indexes.sql
\ir 05_cleanup.sql
\echo 'Imported'