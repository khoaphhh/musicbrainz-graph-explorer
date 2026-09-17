from flask import Blueprint, request, jsonify
from functools import lru_cache
from app import db_pool 

graph_bp = Blueprint('graph', __name__)

@lru_cache(maxsize=500)
def get_graph_data(artist_id, limit, relation_types=None):
    conn = db_pool.getconn()
    cur = None
    try:
        cur = conn.cursor()

        cur.execute("""
            SELECT a.id, a.name, a.influence_score, ar.gid 
            FROM artists_top a 
            JOIN artists ar ON a.id = ar.id 
            WHERE a.id = %s;
        """, (artist_id,))
        center_row = cur.fetchone()
        if not center_row:
            return None
        center_node = {'id': center_row[0], 'name': center_row[1], 'influence_score': center_row[2], 'gid': center_row[3], 'depth': 0}

        link_type_ids = None
        if relation_types:
            cur.execute("SELECT id FROM link_types WHERE name = ANY(%s);", (list(relation_types),))
            link_type_ids = [row[0] for row in cur.fetchall()]
            if not link_type_ids:
                return {'graph': {'nodes': [center_node], 'edges': []}, 'all_relations': []}

        if link_type_ids:
            cur.execute("""
                SELECT a.id, a.name, a.influence_score, ar.gid
                FROM (
                    SELECT target_id AS id FROM relations_top WHERE source_id = %s AND link_type_id = ANY(%s)
                    UNION
                    SELECT source_id AS id FROM relations_top WHERE target_id = %s AND link_type_id = ANY(%s)
                ) AS links
                JOIN artists_top a ON a.id = links.id
                JOIN artists ar ON ar.id = a.id
                ORDER BY a.influence_score DESC NULLS LAST;
            """, (artist_id, link_type_ids, artist_id, link_type_ids))
        else:
            cur.execute("""
                SELECT a.id, a.name, a.influence_score, ar.gid
                FROM (
                    SELECT target_id AS id FROM relations_top WHERE source_id = %s
                    UNION
                    SELECT source_id AS id FROM relations_top WHERE target_id = %s
                ) AS links
                JOIN artists_top a ON a.id = links.id
                JOIN artists ar ON ar.id = a.id
                ORDER BY a.influence_score DESC NULLS LAST;
            """, (artist_id, artist_id))
            
        all_neighbors = cur.fetchall()
        all_relations_json = [{'id': n[0], 'name': n[1], 'influence_score': n[2], 'gid': n[3]} for n in all_neighbors]
        graph_nodes_json = [center_node] + all_relations_json[:limit]
        
        for n in graph_nodes_json[1:]:
            n['depth'] = 1
            
        graph_node_ids = [n['id'] for n in graph_nodes_json]

        if len(graph_node_ids) > 1:
            if link_type_ids:
                cur.execute("""
                    SELECT LEAST(r.source_id, r.target_id) AS source, 
                           GREATEST(r.source_id, r.target_id) AS target, 
                           JSON_AGG(JSON_BUILD_OBJECT('type', ltc.name, 'forward', ltc.link_phrase, 'reverse', ltc.reverse_link_phrase, 'song', r.song_name)) AS details,
                           COUNT(*) AS weight
                    FROM relations_top r
                    JOIN link_types ltc ON r.link_type_id = ltc.id
                    WHERE r.source_id = ANY(%s) AND r.target_id = ANY(%s)
                      AND r.link_type_id = ANY(%s)
                    GROUP BY 1, 2;
                """, (graph_node_ids, graph_node_ids, link_type_ids))
            else:
                cur.execute("""
                    SELECT LEAST(r.source_id, r.target_id) AS source, 
                           GREATEST(r.source_id, r.target_id) AS target, 
                           JSON_AGG(JSON_BUILD_OBJECT('type', ltc.name, 'forward', ltc.link_phrase, 'reverse', ltc.reverse_link_phrase, 'song', r.song_name)) AS details,
                           COUNT(*) AS weight
                    FROM relations_top r
                    JOIN link_types ltc ON r.link_type_id = ltc.id
                    WHERE r.source_id = ANY(%s) AND r.target_id = ANY(%s)
                    GROUP BY 1, 2;
                """, (graph_node_ids, graph_node_ids))
            edges = cur.fetchall()
        else:
            edges = []
            
        edges_json = [{'source': e[0], 'target': e[1], 'details': e[2], 'weight': e[3]} for e in edges]

        return {
            'graph': {'nodes': graph_nodes_json, 'edges': edges_json},
            'all_relations': all_relations_json
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        if cur: cur.close()
        db_pool.putconn(conn)


@graph_bp.route('/connection', methods=['GET'])
def get_connection():
    source_id = request.args.get('source', type=int)
    target_id = request.args.get('target', type=int)
    
    if not source_id or not target_id:
        return jsonify({'error': 'Missing source or target'}), 400

    conn = db_pool.getconn()
    cur = None
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT ltc.name, ltc.link_phrase, ltc.reverse_link_phrase, r.song_name
            FROM relations_top r
            JOIN link_types ltc ON r.link_type_id = ltc.id
            WHERE (r.source_id = %s AND r.target_id = %s)
               OR (r.source_id = %s AND r.target_id = %s);
        """, (source_id, target_id, target_id, source_id))
        rows = cur.fetchall()
        
        details = [{'type': row[0], 'forward': row[1], 'reverse': row[2], 'song': row[3]} for row in rows]
        return jsonify({'weight': len(rows), 'details': details})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if cur: cur.close()
        db_pool.putconn(conn)

def clear_graph_cache():
    get_graph_data.cache_clear()

@graph_bp.route('/graph', methods=['GET'])
def get_graph():
    artist_id = request.args.get('artist_id', type=int)
    limit = request.args.get('limit', default=30, type=int)
    if artist_id is None or artist_id <= 0:
        return jsonify({'error': 'Missing artist_id parameter'}), 400
    if limit is None or not 10 <= limit <= 50:
        return jsonify({'error': 'limit must be between 10 and 50'}), 400

    relation_param = request.args.get('relation_type', '')
    if relation_param:
        relation_list = sorted({r.strip() for r in relation_param.split(',') if r.strip()})
    else:
        relation_list = None

    graph_data = get_graph_data(artist_id, limit, tuple(relation_list) if relation_list else None)

    if graph_data is None:
        return jsonify({'error': 'Artist not found or has no relations'}), 404

    return jsonify(graph_data)