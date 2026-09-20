import uuid
from functools import lru_cache

from flask import Blueprint, jsonify, request

from app import db_pool


search_bp = Blueprint("search", __name__)


def escape_like(value):
    """Escape characters that have a special meaning in a LIKE pattern."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@lru_cache(maxsize=200)
def cached_search(query, is_gid=False):
    conn = db_pool.getconn()
    cur = None

    try:
        cur = conn.cursor()

        if is_gid:
            cur.execute(
                """
                SELECT
                    id,
                    name,
                    influence_score,
                    degree,
                    gid,
                    comment,
                    NULL AS matched_alias
                FROM artists_top
                WHERE gid = %s
                LIMIT 1;
                """,
                (query,),
            )
        else:
            exact = query
            prefix = f"{escape_like(query)}%"
            contains = f"%{escape_like(query)}%"

            cur.execute(
                """
                WITH candidates AS (
                    -- 1. Quét trên tên gốc (name)
                    SELECT a.id, a.name, a.influence_score, a.degree, a.gid, a.comment,
                           NULL::TEXT AS matched_alias,
                           CASE 
                               WHEN immutable_unaccent(a.name) ILIKE immutable_unaccent(%s) THEN 1
                               WHEN immutable_unaccent(a.name) ILIKE immutable_unaccent(%s) THEN 2
                               ELSE 3
                           END AS match_rank
                    FROM artists_top a
                    WHERE immutable_unaccent(a.name) ILIKE immutable_unaccent(%s)

                    UNION ALL

                    -- 2. Quét trên tên phiên âm (sort_name) - Trả về sort_name làm alias
                    SELECT a.id, a.name, a.influence_score, a.degree, a.gid, a.comment,
                           a.sort_name AS matched_alias,
                           CASE 
                               WHEN immutable_unaccent(a.sort_name) ILIKE immutable_unaccent(%s) THEN 1
                               WHEN immutable_unaccent(a.sort_name) ILIKE immutable_unaccent(%s) THEN 2
                               ELSE 3
                           END AS match_rank
                    FROM artists_top a
                    WHERE immutable_unaccent(a.sort_name) ILIKE immutable_unaccent(%s)

                    UNION ALL

                    -- 3. Quét trên tên phụ (artist_aliases_top)
                    SELECT a.id, a.name, a.influence_score, a.degree, a.gid, a.comment,
                           aa.name AS matched_alias,
                           CASE 
                               WHEN immutable_unaccent(aa.name) ILIKE immutable_unaccent(%s) THEN 1
                               WHEN immutable_unaccent(aa.name) ILIKE immutable_unaccent(%s) THEN 2
                               ELSE 3
                           END AS match_rank
                    FROM artist_aliases_top aa
                    JOIN artists_top a ON a.id = aa.artist
                    WHERE immutable_unaccent(aa.name) ILIKE immutable_unaccent(%s)
                ),
                one_result_per_artist AS (
                    SELECT *,
                           ROW_NUMBER() OVER (
                               PARTITION BY id
                               ORDER BY match_rank ASC, 
                               CASE WHEN matched_alias IS NULL THEN 0 ELSE 1 END
                           ) AS rn
                    FROM candidates
                )
                SELECT id, name, influence_score, degree, gid, comment,
                       CASE
                           WHEN matched_alias IS NOT NULL
                            AND immutable_unaccent(matched_alias) NOT ILIKE immutable_unaccent(name)
                           THEN matched_alias
                           ELSE NULL
                       END AS matched_alias
                FROM one_result_per_artist
                WHERE rn = 1
                ORDER BY match_rank ASC, influence_score DESC NULLS LAST, LENGTH(name) ASC
                LIMIT 100;
                """,
                (exact, prefix, contains, exact, prefix, contains, exact, prefix, contains)
            )

        return cur.fetchall()
    except Exception:
        conn.rollback()
        raise
    finally:
        if cur:
            cur.close()
        db_pool.putconn(conn)


def clear_search_cache():
    cached_search.cache_clear()


@search_bp.route("/search", methods=["GET"])
def search():
    query = request.args.get("q", "").strip()

    if not query:
        return jsonify([])

    if len(query) > 100:
        return jsonify({"error": "Search query is too long"}), 400

    try:
        uuid.UUID(query)
    except ValueError:
        rows = cached_search(query, is_gid=False)
    else:
        rows = cached_search(query, is_gid=True)

    artists = [
        {
            "id": row[0],
            "name": row[1],
            "influence_score": round(row[2], 2) if row[2] is not None else 0,
            "degree": row[3],
            "gid": str(row[4]) if row[4] is not None else None,
            "comment": row[5] or "",
            "matched_alias": row[6] or "",
        }
        for row in rows
    ]

    return jsonify(artists)
