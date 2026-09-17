DROP TABLE IF EXISTS staging_artist, staging_l_artist_artist, staging_link, staging_link_type, staging_recording, staging_artist_credit_name, staging_artist_alias CASCADE;
DROP TABLE IF EXISTS artists, artist_aliases, link_types, relations, artists_top, relations_top, relation_weights CASCADE;

CREATE TABLE staging_artist (id INT, gid UUID, name TEXT, sort_name TEXT, comment TEXT);
CREATE TABLE staging_l_artist_artist (link INT, entity0 INT, entity1 INT);
CREATE TABLE staging_link (id INT, link_type INT);
CREATE TABLE staging_link_type (id INT, name TEXT, link_phrase TEXT, reverse_link_phrase TEXT);
CREATE TABLE staging_recording (id INT, name TEXT, artist_credit INT);
CREATE TABLE staging_artist_credit_name (artist_credit INT, artist INT);
CREATE TABLE staging_artist_alias (artist INT, name TEXT, locale TEXT, primary_for_locale BOOLEAN);

CREATE TABLE artists (
    id INT PRIMARY KEY,
    gid UUID,
    name TEXT NOT NULL,
    sort_name TEXT,
    comment TEXT
);

CREATE TABLE artist_aliases (
    artist INT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    locale TEXT,
    primary_for_locale BOOLEAN
);

CREATE TABLE link_types (
    id INT PRIMARY KEY,
    name TEXT NOT NULL,
    link_phrase TEXT,
    reverse_link_phrase TEXT
);

CREATE TABLE relations (
    id BIGSERIAL PRIMARY KEY,
    source_id INT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    target_id INT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    link_type_id INT NOT NULL REFERENCES link_types(id),
    song_name TEXT
);