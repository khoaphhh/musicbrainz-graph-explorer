from flask import Blueprint, request, jsonify
import networkx as nx
from app import db_pool, G

path_bp = Blueprint('path', __name__)

@path_bp.route('/path', methods=['POST'])
def multi_stop_path():
    data = request.get_json(silent=True) or {}
    waypoints = data.get('waypoints', [])
    
    allow_unnamed = data.get('allow_unnamed', False)
    show_shortcuts = data.get('show_shortcuts', True)

    if (
        not isinstance(waypoints, list)
        or len(waypoints) < 2
        or len(waypoints) > 8
        or any(not isinstance(w, int) or w <= 0 for w in waypoints)
    ):
        return jsonify({'error': 'Please provide at least 2 valid artists.'}), 400

    path_nodes_sequence = []
    waypoint_set = set(waypoints)
    
    conn = db_pool.getconn()
    cur = None
    
    try:
        cur = conn.cursor()
        
        for i in range(len(waypoints) - 1):
            source = waypoints[i]
            target = waypoints[i + 1]
            
            blocked_nodes = set()
            sub_path = []
            
            while True:
                try:
                    if blocked_nodes:
                        G_view = nx.subgraph_view(G, filter_node=lambda n: n not in blocked_nodes)
                    else:
                        G_view = G
                        
                    candidate_path = nx.shortest_path(G_view, source=source, target=target)
                except nx.NetworkXNoPath:
                    if blocked_nodes:
                        return jsonify({'error': 'Cannot find a valid route without unnamed artists. Try enabling "Allow unnamed artists".'}), 422
                    return jsonify({'error': 'No path found between some of these artists.'}), 404
                except nx.NodeNotFound:
                    return jsonify({'error': 'One or more artists not found in the graph.'}), 404

                if allow_unnamed:
                    sub_path = candidate_path
                    break
                    
                cur.execute("SELECT id, name FROM artists_top WHERE id = ANY(%s);", (candidate_path,))
                rows = cur.fetchall()
                
                unnamed_in_path = []
                for r_id, r_name in rows:
                    if r_id in waypoint_set:  
                        continue
                    if not r_name or (r_name.strip().startswith('[') and r_name.strip().endswith(']')) or 'various artists' in r_name.lower():
                        unnamed_in_path.append(r_id)
                        
                if not unnamed_in_path:
                    sub_path = candidate_path
                    break
                    
                blocked_nodes.update(unnamed_in_path)
            
            if i > 0:
                path_nodes_sequence.extend(sub_path[1:])
            else:
                path_nodes_sequence.extend(sub_path)

        if len(path_nodes_sequence) > 30:
            return jsonify({'error': 'The route exceeds 30 nodes. Cannot render.'}), 400

        cur.execute("""
            SELECT a.id, a.name, a.influence_score, ar.gid
            FROM artists_top a
            JOIN artists ar ON a.id = ar.id
            WHERE a.id = ANY(%s);
        """, (path_nodes_sequence,))
        node_rows = cur.fetchall()
        
        node_order = {node_id: idx for idx, node_id in enumerate(path_nodes_sequence)}
                
        nodes_json = [
            {
                'id': row[0], 
                'name': row[1], 
                'influence_score': row[2], 
                'gid': row[3], 
                'is_waypoint': row[0] in waypoint_set,
                'path_order': node_order.get(row[0], 999)
            }
            for row in node_rows
        ]
        nodes_json.sort(key=lambda x: x['path_order'])
        
        if show_shortcuts:
            cur.execute("""
                SELECT r.source_id, r.target_id, ltc.name, ltc.link_phrase, ltc.reverse_link_phrase, r.song_name
                FROM relations_top r
                JOIN link_types ltc ON r.link_type_id = ltc.id
                WHERE r.source_id = ANY(%s) AND r.target_id = ANY(%s);
            """, (path_nodes_sequence, path_nodes_sequence))
            edge_rows = cur.fetchall()
        else:
            pair_conditions = []
            pair_params = []
            for u, v in zip(path_nodes_sequence, path_nodes_sequence[1:]):
                pair_conditions.append("((r.source_id = %s AND r.target_id = %s) OR (r.source_id = %s AND r.target_id = %s))")
                pair_params.extend((u, v, v, u))
                
            if pair_conditions:
                cur.execute(f"""
                    SELECT r.source_id, r.target_id, ltc.name, ltc.link_phrase, ltc.reverse_link_phrase, r.song_name
                    FROM relations_top r
                    JOIN link_types ltc ON r.link_type_id = ltc.id
                    WHERE {' OR '.join(pair_conditions)};
                """, tuple(pair_params))
                edge_rows = cur.fetchall()
            else:
                edge_rows = []
        
        route_pairs = {frozenset((source, target)) for source, target in zip(path_nodes_sequence, path_nodes_sequence[1:]) if source != target}
        
        edge_map = {}
        for row in edge_rows:
            src, tgt, rel, forward, reverse, song = row
            idx_src = node_order.get(src, 999)
            idx_tgt = node_order.get(tgt, 999)
            
            if idx_src == 999 or idx_tgt == 999 or src == tgt: 
                continue
            
            final_src, final_tgt = (src, tgt) if idx_src < idx_tgt else (tgt, src)
                
            edge = edge_map.setdefault((final_src, final_tgt), {
                'source': str(final_src), 'target': str(final_tgt),
                'details_list': []
            })
            
            detail_item = {'type': rel, 'forward': forward, 'reverse': reverse, 'song': song or None}
            if detail_item not in edge['details_list']:
                edge['details_list'].append(detail_item)

        edges_json = []
        for index, ((source, target), edge) in enumerate(edge_map.items()):
            edges_json.append({
                'id': f"path_e_{index}",
                'source': edge['source'],
                'target': edge['target'],
                'details': edge['details_list'],
                'is_shortcut': frozenset((source, target)) not in route_pairs
            })

        return jsonify({'nodes': nodes_json, 'edges': edges_json})
        
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        if cur: cur.close()
        db_pool.putconn(conn)