CREATE INDEX idx_relations_source ON relations(source_id);
CREATE INDEX idx_relations_target ON relations(target_id);
CREATE INDEX idx_artist_aliases_artist ON artist_aliases(artist);

CREATE INDEX idx_artists_name_trgm ON artists USING GIN (immutable_unaccent(name) gin_trgm_ops);
CREATE INDEX idx_artist_aliases_name_trgm ON artist_aliases USING GIN (immutable_unaccent(name) gin_trgm_ops);