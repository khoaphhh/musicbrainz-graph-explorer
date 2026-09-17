\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';

\copy staging_artist FROM '../data/mbdump/cleaned/artist_cleaned.tsv' WITH (FORMAT text, DELIMITER E'\t', NULL E'\\N', ENCODING 'UTF8');
\copy staging_artist_alias FROM '../data/mbdump/cleaned/artist_alias_cleaned.tsv' WITH (FORMAT text, DELIMITER E'\t', NULL E'\\N', ENCODING 'UTF8');
\copy staging_l_artist_artist FROM '../data/mbdump/cleaned/l_artist_artist_cleaned.tsv' WITH (FORMAT text, DELIMITER E'\t', NULL E'\\N', ENCODING 'UTF8');
\copy staging_link FROM '../data/mbdump/cleaned/link_cleaned.tsv' WITH (FORMAT text, DELIMITER E'\t', NULL E'\\N', ENCODING 'UTF8');
\copy staging_link_type FROM '../data/mbdump/cleaned/link_type_cleaned.tsv' WITH (FORMAT text, DELIMITER E'\t', NULL E'\\N', ENCODING 'UTF8');
\copy staging_artist_credit_name FROM '../data/mbdump/cleaned/artist_credit_name_cleaned.tsv' WITH (FORMAT text, DELIMITER E'\t', NULL E'\\N', ENCODING 'UTF8');
\copy staging_recording FROM '../data/mbdump/cleaned/recording_cleaned.tsv' WITH (FORMAT text, DELIMITER E'\t', NULL E'\\N', ENCODING 'UTF8');