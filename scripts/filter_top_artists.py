import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import psycopg2
from app.config import Config

conn = psycopg2.connect(**Config.get_db_args())
try:
    with conn:
        with conn.cursor() as cur:
            cur.execute("DROP TABLE IF EXISTS relations_top, artists_top, artist_aliases_top;")

            cur.execute("""
                CREATE TABLE IF NOT EXISTS relation_weights (
                    link_type_id INT PRIMARY KEY REFERENCES link_types(id),
                    weight FLOAT NOT NULL DEFAULT 1.0,
                    description TEXT
                );
            """)
            cur.execute("""
                INSERT INTO relation_weights (link_type_id, weight)
                SELECT id, 1.0 FROM link_types
                ON CONFLICT (link_type_id) DO NOTHING;
            """)
            cur.execute("""
                UPDATE relation_weights
                SET weight = 5.0
                WHERE link_type_id IN (SELECT id FROM link_types WHERE name = 'recording_collab');
            """)

            cur.execute("""
                CREATE TEMP TABLE all_artist_ids AS
                SELECT source_id AS artist_id FROM relations
                UNION ALL
                SELECT target_id AS artist_id FROM relations;
            """)

            cur.execute("""
                CREATE TABLE artists_top AS
                SELECT artist_id AS id, COUNT(*) AS degree
                FROM all_artist_ids
                GROUP BY artist_id
                HAVING COUNT(*) >= 1;
            """)

            cur.execute("""
                ALTER TABLE artists_top
                    ADD COLUMN name TEXT,
                    ADD COLUMN gid UUID,
                    ADD COLUMN comment TEXT,
                    ADD COLUMN sort_name TEXT,
                    ADD COLUMN influence_score FLOAT;

                UPDATE artists_top
                SET name = a.name, gid = a.gid, sort_name = a.sort_name, comment = a.comment
                FROM artists a
                WHERE a.id = artists_top.id;

                ALTER TABLE artists_top ADD PRIMARY KEY (id);
            """)

            cur.execute("""
                CREATE TABLE relations_top AS
                SELECT r.source_id, r.target_id, r.link_type_id, r.song_name
                FROM relations r
                WHERE r.source_id IN (SELECT id FROM artists_top)
                  AND r.target_id IN (SELECT id FROM artists_top);
            """)

            cur.execute("""
                CREATE TABLE artist_aliases_top AS
                SELECT DISTINCT aa.artist, aa.name, aa.locale, aa.primary_for_locale
                FROM artist_aliases aa
                JOIN artists_top a ON a.id = aa.artist;
            """)

            cur.execute("CREATE INDEX idx_relations_top_source ON relations_top(source_id);")
            cur.execute("CREATE INDEX idx_relations_top_target ON relations_top(target_id);")
            cur.execute("CREATE INDEX idx_relations_top_source_target ON relations_top(source_id, target_id);")
            cur.execute("CREATE INDEX idx_relations_top_target_source ON relations_top(target_id, source_id);")
            cur.execute("CREATE INDEX idx_relations_top_link ON relations_top(link_type_id);")
            cur.execute("CREATE INDEX idx_artists_top_influence ON artists_top(influence_score DESC);")
            cur.execute("CREATE INDEX idx_artists_gid_top ON artists_top(gid);")
            cur.execute("CREATE INDEX idx_artist_aliases_top_artist ON artist_aliases_top(artist);")

            cur.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
            cur.execute("CREATE INDEX idx_artists_top_name_trgm ON artists_top USING gin (immutable_unaccent(name) gin_trgm_ops);")
            cur.execute("CREATE INDEX idx_artists_top_sort_name_trgm ON artists_top USING gin (immutable_unaccent(sort_name) gin_trgm_ops);")
            cur.execute("CREATE INDEX idx_artist_aliases_top_name_trgm ON artist_aliases_top USING gin (immutable_unaccent(name) gin_trgm_ops);")

            cur.execute("ANALYZE artists_top;")
            cur.execute("ANALYZE relations_top;")
            cur.execute("ANALYZE artist_aliases_top;")

            # Keep only the materialized graph used by the application.
            cur.execute("DROP TABLE relations, artist_aliases, artists CASCADE;")
finally:
    conn.close()

print("Filtered and cleaned")