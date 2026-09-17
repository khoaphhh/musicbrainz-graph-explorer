import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import psycopg2
import networkx as nx
from psycopg2.extras import execute_values

from app.config import Config

DB_CONFIG = Config.get_db_args()

ALPHA = 0.85
BAND_REVERSE_WEIGHT = 5
SCORE_MULTIPLIER = 1000000

def main():


    conn = psycopg2.connect(**DB_CONFIG)
    cursor = None
    try:
        cursor = conn.cursor()

        query = """
            SELECT 
                r.source_id, 
                r.target_id, 
                lt.name AS relation_type,
                COUNT(*) AS weight_count,
                COALESCE(rw.weight, 1.0) AS base_weight
            FROM relations_top r
            JOIN link_types lt ON r.link_type_id = lt.id
            LEFT JOIN relation_weights rw ON lt.id = rw.link_type_id
            GROUP BY r.source_id, r.target_id, lt.name, rw.weight;
        """
        cursor.execute(query)
        edges = cursor.fetchall()

        G = nx.DiGraph()
        for source, target, rel_type, weight_count, base_weight in edges:
            edge_weight = weight_count * base_weight
            if rel_type == 'member of band':
                G.add_edge(source, target, weight=G.get_edge_data(source, target, default={'weight': 0})['weight'] + edge_weight)
                G.add_edge(target, source, weight=G.get_edge_data(target, source, default={'weight': 0})['weight'] + BAND_REVERSE_WEIGHT)
            else:
                G.add_edge(source, target, weight=G.get_edge_data(source, target, default={'weight': 0})['weight'] + edge_weight)

        scores = nx.pagerank(G, alpha=ALPHA, weight='weight')

        update_data = [(round(score * SCORE_MULTIPLIER, 2), node) for node, score in scores.items()]
        update_query = """
            UPDATE artists_top AS a
            SET influence_score = data.score
            FROM (VALUES %s) AS data(score, id)
            WHERE a.id = data.id;
        """
        execute_values(cursor, update_query, update_data, page_size=10000)
        conn.commit()

        print(f"Calculated")
    except Exception:
        conn.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        conn.close()

if __name__ == "__main__":
    main()