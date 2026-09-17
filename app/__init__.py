from flask import Flask, jsonify, render_template  
from psycopg2 import pool
from app.config import Config
import networkx as nx

db_pool = pool.ThreadedConnectionPool(
    minconn=1,
    maxconn=20,
    **Config.get_db_args()
)

G = nx.Graph() 

def load_global_graph():
    conn = db_pool.getconn()
    cur = None
    try:
        cur = conn.cursor()
        cur.execute("SELECT source_id, target_id FROM relations_top;")
        G.clear()
        while True:
            edges = cur.fetchmany(10000)
            if not edges:
                break
            G.add_edges_from(edges)
    except Exception:
        conn.rollback()
        raise
    finally:
        if cur:
            cur.close()
        db_pool.putconn(conn)

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    load_global_graph()

    from app.routes.graph import graph_bp
    app.register_blueprint(graph_bp, url_prefix='/api')

    from app.routes.search import search_bp
    app.register_blueprint(search_bp, url_prefix='/api')


    from app.routes.path import path_bp
    app.register_blueprint(path_bp, url_prefix='/api')


    @app.route('/')
    def index():
        return render_template('index.html')

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({'error': 'Không tìm thấy API hoặc dữ liệu này'}), 404

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({'error': 'Lỗi máy chủ nội bộ. Vui lòng thử lại sau.'}), 500
    
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({'error': 'Tham số truyền vào không hợp lệ'}), 400

    return app
