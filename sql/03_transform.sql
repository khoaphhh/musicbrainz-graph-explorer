\set ON_ERROR_STOP on
BEGIN;

INSERT INTO artists (id, gid, name, sort_name, comment)
SELECT id, gid, name, sort_name, comment 
FROM staging_artist;

INSERT INTO artist_aliases (artist, name, locale, primary_for_locale)
SELECT DISTINCT artist, name, locale, primary_for_locale 
FROM staging_artist_alias
WHERE artist IN (SELECT id FROM artists);

INSERT INTO link_types (id, name, link_phrase, reverse_link_phrase)
SELECT id, name, link_phrase, reverse_link_phrase 
FROM staging_link_type;

INSERT INTO link_types (id, name, link_phrase, reverse_link_phrase)
SELECT COALESCE(MAX(id), 0) + 1, 'recording_collab', 'featured in song with', 'featured in song with'
FROM link_types WHERE NOT EXISTS (SELECT 1 FROM link_types WHERE name = 'recording_collab');

INSERT INTO relations (source_id, target_id, link_type_id)
SELECT laa.entity0, laa.entity1, l.link_type
FROM staging_l_artist_artist laa
JOIN staging_link l ON l.id = laa.link
WHERE laa.entity0 IN (SELECT id FROM artists) AND laa.entity1 IN (SELECT id FROM artists);

INSERT INTO relations (source_id, target_id, link_type_id, song_name)
SELECT DISTINCT acn1.artist, acn2.artist, lt.id, r.name
FROM staging_artist_credit_name acn1
JOIN staging_artist_credit_name acn2 ON acn1.artist_credit = acn2.artist_credit AND acn1.artist < acn2.artist
JOIN staging_recording r ON r.artist_credit = acn1.artist_credit
JOIN link_types lt ON lt.name = 'recording_collab'
WHERE acn1.artist IN (SELECT id FROM artists) AND acn2.artist IN (SELECT id FROM artists);

COMMIT;