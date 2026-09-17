class ForceSimulation {
    constructor(cy, opts = {}) {
        this.anchorX = 0;
        this.anchorY = 0;
        this.cy = cy;
        this.opt = Object.assign({
            springK: 0.06,
            restLength: 130,
            repulsion: 9000,
            damping: 0.82,
            maxSpeed: 28,
            collisionStiffness: 0.6,
            collisionPadding: 30,
            plowRadius: 80,
            plowStrength: 9,
            dragSpringDamp: 0.2,
            releaseGraceDuration: 450,
            gravity: 0.02,
            maxRepDist: 700
        }, opts);
        this.nodes = [];
        this.edges = [];
        this.nodeMap = new Map();
        this.running = false;
        this.dragged = null;
        this.releaseGraceUntil = 0;
    }

    init() {
        this.nodes = [];
        this.nodeMap.clear();
        this.edges = [];

        this.cy.nodes().forEach((cyNode) => {
            const pos = cyNode.position();
            const w = parseFloat(cyNode.style('width')) || 24;
            const h = parseFloat(cyNode.style('height')) || 24;
            const node = {
                id: cyNode.id(),
                cy: cyNode,
                x: pos.x, y: pos.y,
                vx: 0, vy: 0,
                r: Math.max(w, h) / 2,
                fx: 0, fy: 0,
                degree: 1        
            };
            this.nodes.push(node);
            this.nodeMap.set(node.id, node);
        });

        this.cy.edges().forEach((cyEdge) => {
            const s = this.nodeMap.get(cyEdge.data('source'));
            const t = this.nodeMap.get(cyEdge.data('target'));
            if (s && t) this.edges.push({ source: s, target: t });
        });

        const degMap = new Map();
        this.cy.edges().forEach((e) => {
            const s = e.data('source'), t = e.data('target');
            degMap.set(s, (degMap.get(s) || 0) + 1);
            degMap.set(t, (degMap.get(t) || 0) + 1);
        });
        for (const node of this.nodes) {
            node.degree = degMap.get(node.id) || 1;
        }
        

        let sx = 0, sy = 0;
        for (const node of this.nodes) { sx += node.x; sy += node.y; }
        this.anchorX = this.nodes.length ? sx / this.nodes.length : 0;
        this.anchorY = this.nodes.length ? sy / this.nodes.length : 0;
    }

    step(dt) {
        const { damping, maxSpeed, collisionStiffness, collisionPadding, restLength } = this.opt;
        const nodes = this.nodes;
        const n = nodes.length;
        const isDragging = this.dragged !== null;

        let baseK = this.opt.springK;
        if (this.releaseGraceUntil && performance.now() < this.releaseGraceUntil) {
            const remaining = this.releaseGraceUntil - performance.now();
            const progress = 1 - remaining / this.opt.releaseGraceDuration;
            baseK = this.opt.springK * (0.15 + 0.85 * progress);
        }

        for (const node of nodes) { node.fx = 0; node.fy = 0; }

        for (const e of this.edges) {
            const s = e.source, t = e.target;
            let dx = t.x - s.x, dy = t.y - s.y;
            let d = Math.hypot(dx, dy) || 0.01;
            const disp = d - restLength;

            let k = baseK;
            if (isDragging && (s === this.dragged || t === this.dragged)) {
                k *= this.opt.dragSpringDamp;
            }

            const f = k * disp;
            const fx = (dx / d) * f;
            const fy = (dy / d) * f;

            s.fx += fx / Math.sqrt(s.degree);
            s.fy += fy / Math.sqrt(s.degree);
            t.fx -= fx / Math.sqrt(t.degree);
            t.fy -= fy / Math.sqrt(t.degree);
        }

        for (let i = 0; i < n; i++) {
            const a = nodes[i];
            for (let j = i + 1; j < n; j++) {
                const b = nodes[j];
                let dx = b.x - a.x, dy = b.y - a.y;
                let d2 = dx * dx + dy * dy;
                if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.01; }
                const d = Math.sqrt(d2);
                const nx = dx / d, ny = dy / d;

                if (d < this.opt.maxRepDist) {
                    const rep = this.opt.repulsion / d2;
                    a.fx -= nx * rep; a.fy -= ny * rep;
                    b.fx += nx * rep; b.fy += ny * rep;
                }

                const edgeDist = d - (a.r + b.r + collisionPadding);
                if (edgeDist < 0) {
                    const push = -edgeDist * collisionStiffness;
                    a.fx -= nx * push; a.fy -= ny * push;
                    b.fx += nx * push; b.fy += ny * push;
                }
            }
        }

        if (this.opt.gravity > 0 && n > 0) {
            for (const node of nodes) {
                if (node === this.dragged) continue;
                const dx = this.anchorX - node.x;
                const dy = this.anchorY - node.y;
                const d = Math.hypot(dx, dy) || 0.01;
                const g = this.opt.gravity * d;
                node.fx += (dx / d) * g;
                node.fy += (dy / d) * g;
            }
        }

        for (const node of nodes) {
            if (node === this.dragged) { node.vx = 0; node.vy = 0; continue; }
            node.vx = (node.vx + node.fx * dt) * damping;
            node.vy = (node.vy + node.fy * dt) * damping;

            const sp = Math.hypot(node.vx, node.vy);
            if (sp > maxSpeed) {
                node.vx = (node.vx / sp) * maxSpeed;
                node.vy = (node.vy / sp) * maxSpeed;
            }
            node.x += node.vx * dt;
            node.y += node.vy * dt;
        }
    }

    apply() {
        for (const node of this.nodes) {
            node.cy.position({ x: node.x, y: node.y });
        }
    }

    start() {
        if (this.running) return;
        this.running = true;
        let last = performance.now();
        const loop = (t) => {
            if (!this.running) return;
            const dt = Math.min((t - last) / 16.67, 2);
            last = t;
            this.step(dt);
            this.apply();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    stop() { this.running = false; }

    onGrab(nodeId) {
        const node = this.nodeMap.get(nodeId);
        if (!node) return;
        this.dragged = node;
    }

    onDrag(nodeId, pos) {
        const node = this.nodeMap.get(nodeId);
        if (!node || node !== this.dragged) return;

        const prevX = node.x, prevY = node.y;
        const dx = pos.x - prevX, dy = pos.y - prevY;
        node.x = pos.x; node.y = pos.y;
        node.vx = 0; node.vy = 0;

        const dist = Math.hypot(dx, dy);
        if (dist < 0.5) return;
        const ndx = dx / dist, ndy = dy / dist;
        const R = this.opt.plowRadius;

        for (const other of this.nodes) {
            if (other === node) continue;
            const ox = other.x - node.x;
            const oy = other.y - node.y;
            const od = Math.hypot(ox, oy) || 0.01;
            const minD = node.r + other.r + this.opt.collisionPadding;
            const dot = ox * ndx + oy * ndy;
            const inFront = dot > 0 && od < R + node.r;

            if (od < minD || inFront) {
                const nx = od > 0.01 ? ox / od : ndx;
                const ny = od > 0.01 ? oy / od : ndy;
                const falloff = Math.max(0.2, 1 - od / (R + node.r));
                const strength = this.opt.plowStrength * falloff;
                other.vx += nx * strength;
                other.vy += ny * strength;

                if (od < minD) {
                    const overlap = minD - od + 1;
                    other.x += nx * overlap;
                    other.y += ny * overlap;
                }
            }
        }
    }

    onRelease() {
        this.dragged = null;
        this.releaseGraceUntil = performance.now() + this.opt.releaseGraceDuration;
    }
}