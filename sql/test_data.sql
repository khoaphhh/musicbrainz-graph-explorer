SELECT id, name FROM artists 
WHERE immutable_unaccent(name) ILIKE immutable_unaccent('%dam vinh hung%') 
LIMIT 5;

SELECT a.id, a.name, aa.name as match_alias
FROM artist_aliases aa
JOIN artists a ON aa.artist = a.id
WHERE immutable_unaccent(aa.name) ILIKE immutable_unaccent('%hatsune%')
LIMIT 5;