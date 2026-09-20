SELECT id, name FROM artists_top
WHERE immutable_unaccent(name) ILIKE immutable_unaccent('%dam vinh hung%') 
LIMIT 5;

SELECT a.id, a.name, aa.name as match_alias
FROM artist_aliases_top aa
JOIN artists_top a ON aa.artist = a.id
WHERE immutable_unaccent(aa.name) ILIKE immutable_unaccent('%hatsune%')
LIMIT 5;