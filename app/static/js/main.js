(() => {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const state = {
        mode: 'graph',
        graphCy: null, graphSim: null, routeCy: null, routeSim: null,
        graphArtist: null,
        searchTimer: null, routeSearchTimer: null,
        graphRequest: null, routeRequest: null,
        routeDrag: null,
        history: []
    };

    const graph = {
        input: $('graph-search'), suggestions: $('graph-suggestions'), limit: $('graph-limit'),
        limitValue: $('graph-limit-value'), canvas: $('graph-canvas'), empty: $('graph-empty'),
        status: $('graph-status'), fit: $('graph-fit'),
        detailsPath: $('details-path'), detailsContent: $('details-content'),
        relationsPanel: $('relations-panel'), relationsCount: $('relations-count'),
        relationsSearch: $('relations-search'), relationsList: $('relations-list'),
        historyContainer: $('history-container'), historyScroll: $('graph-history'),
        historyPrev: $('history-prev'), historyNext: $('history-next')
    };

    const route = {
        stops: $('route-stops'), add: $('route-add-stop'), find: $('route-find'),
        shortcuts: $('route-shortcuts'), allowUnnamed: $('route-allow-unnamed'),
        canvas: $('route-canvas'), empty: $('route-empty'), status: $('route-status'), fit: $('route-fit'),
        detailsPath: $('route-details-path'), detailsContent: $('route-details-content')
    };

    const invalidName = (name) => {
        const value = String(name || '').trim();
        return !value || (value.startsWith('[') && value.endsWith(']')) || value.toLowerCase().includes('various artists');
    };

    const asArray = (value) => Array.isArray(value) ? value : [];
    const debounce = (fn, delay, key) => (...args) => { clearTimeout(state[key]); state[key] = setTimeout(() => fn(...args), delay); };
    const setStatus = (element, text, kind = '') => { element.textContent = text; element.className = `status-line ${kind}`.trim(); };

    function stopSim(sim) {
        if (sim) sim.stop();
    }

    function switchMode(mode) {
        state.mode = mode;
        document.querySelectorAll('.mode-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.mode === mode));
        document.querySelectorAll('.mode-view').forEach((view) => {
            const active = view.id === `${mode}-mode`;
            view.hidden = !active; view.classList.toggle('active', active);
        });
        requestAnimationFrame(() => {
            const cy = mode === 'graph' ? state.graphCy : state.routeCy;
            if (cy) { cy.resize(); cy.fit(undefined, 35); }
        });
    }

    function updateHistoryBar() {
        graph.historyScroll.replaceChildren();
        if (state.history.length === 0) {
            graph.historyContainer.classList.add('hidden');
            return;
        }
        graph.historyContainer.classList.remove('hidden');

        state.history.forEach((artist, index) => {
            const step = document.createElement('span');
            step.className = 'history-step';
            step.textContent = artist.name;
            step.onclick = () => {
                state.history = state.history.slice(0, index);
                loadGraphArtist(artist);
            };
            graph.historyScroll.appendChild(step);

            if (index < state.history.length - 1) {
                const sep = document.createElement('span');
                sep.className = 'history-separator';
                sep.textContent = '➔';
                graph.historyScroll.appendChild(sep);
            }
        });

        setTimeout(() => {
            const isOverflowing = graph.historyScroll.scrollWidth > graph.historyScroll.clientWidth;
            graph.historyPrev.style.display = isOverflowing ? 'block' : 'none';
            graph.historyNext.style.display = isOverflowing ? 'block' : 'none';
            if (isOverflowing) graph.historyScroll.scrollLeft = graph.historyScroll.scrollWidth;
        }, 50);

        graph.historyPrev.onclick = () => graph.historyScroll.scrollBy({ left: -200, behavior: 'smooth' });
        graph.historyNext.onclick = () => graph.historyScroll.scrollBy({ left: 200, behavior: 'smooth' });
    }

    function showDetails(sourceData, targetData, detailsArr, pathEl, contentEl) {
        if (!sourceData) {
            pathEl.innerHTML = `<strong>Connections</strong>`;
            contentEl.innerHTML = `<span class="muted">Select a node or a line to discover their relationships.</span>`;
            return;
        }

        const sName = sourceData.label || sourceData.name;
        const sGid = sourceData.gid || '';
        const tName = targetData.label || targetData.name;
        const tGid = targetData.gid || '';

        pathEl.innerHTML = `
            <div class="connection-header-compact">
                <div class="artist-info-box">
                    <span class="artist-name-truncate" title="${sName}">${sName}</span>
                    <span class="artist-gid-full">${sGid}</span>
                </div>
                <div class="connection-arrow">➔</div>
                <div class="artist-info-box">
                    <span class="artist-name-truncate" title="${tName}">${tName}</span>
                    <span class="artist-gid-full">${tGid}</span>
                </div>
            </div>
        `;

        let html = '';
        if (!detailsArr || !detailsArr.length) {
            html = '<span class="muted" style="display:block; margin-top:12px;">No direct relations found.</span>';
        } else {
            const typeMap = {};
            detailsArr.forEach(d => {
                const uniqueKey = d.song ? d.song : "no_song";
                let relationTitle = `<span style="font-weight:normal">${d.type}</span>`;

                if (d.forward && d.forward !== 'None') {
                    const phrase = d.forward.trim().charAt(0).toLowerCase() + d.forward.trim().slice(1);
                    relationTitle = `<strong style="color:var(--ink)">${sName}</strong> <span style="font-weight:normal; color:var(--muted)">${phrase}</span> <strong style="color:var(--ink)">${tName}</strong>`;
                }

                if (!typeMap[relationTitle]) typeMap[relationTitle] = new Set();
                typeMap[relationTitle].add(uniqueKey);
            });

            html += `<ul style="list-style-type: disc; padding-left: 16px; margin: 0; color: var(--primary);">`;

            for (const [title, songs] of Object.entries(typeMap)) {
                html += `<li class="relation-item"><span style="color: var(--ink);">${title}</span>`;

                const actualSongs = Array.from(songs).filter(s => s !== "no_song");
                if (actualSongs.length > 0) {
                    html += `<ul class="relation-song-list">`;
                    actualSongs.forEach(song => html += `<li>${song}</li>`);
                    html += `</ul>`;
                }
                html += `</li>`;
            }
            html += `</ul>`;
        }
        contentEl.innerHTML = html;
    }

    function renderSuggestions(items) {
        graph.suggestions.replaceChildren();
        asArray(items).slice(0, 100).forEach((artist) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'suggestion';
            button.style.display = 'flex';
            button.style.flexDirection = 'column';
            button.style.alignItems = 'flex-start';
            button.style.textAlign = 'left';
            button.style.padding = '8px 12px';
            button.style.gap = '4px';

            const line1 = document.createElement('div');
            line1.style.lineHeight = '1.3';

            let nameStr = '';
            if (artist.matched_alias && artist.matched_alias.toLowerCase() !== artist.name.toLowerCase()) {
                nameStr = `<strong>${artist.matched_alias}</strong> <span class="muted">(${artist.name})</span>`;
            } else {
                nameStr = `<strong>${artist.name}</strong>`;
            }
            if (artist.comment) {
                nameStr += ` <span class="muted">— <em>${artist.comment}</em></span>`;
            }
            line1.innerHTML = nameStr;

            const line2 = document.createElement('small');
            line2.className = 'muted';
            line2.style.fontSize = '11px';
            line2.style.wordBreak = 'break-all';
            line2.textContent = artist.gid ? artist.gid : `#${artist.id}`;

            button.append(line1, line2);

            button.onclick = () => {
                graph.input.value = '';
                graph.suggestions.classList.add('hidden');
                loadGraphArtist(artist, true);
            };
            graph.suggestions.appendChild(button);
        });
        graph.suggestions.classList.toggle('hidden', !graph.suggestions.children.length);
    }

    async function searchGraph(value) {
        if (state.graphRequest) state.graphRequest.abort();
        if (value.length < 2) { graph.suggestions.classList.add('hidden'); return; }
        const controller = new AbortController(); state.graphRequest = controller;
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`, { signal: controller.signal });
            if (!response.ok) throw new Error('Search failed');
            renderSuggestions(await response.json());
        } catch (error) {
            if (error.name !== 'AbortError') setStatus(graph.status, 'Search is unavailable.', 'error');
        }
    }

    async function loadGraphArtist(artist, isNewSearch = false) {
        if (isNewSearch) { state.history = []; }
        if (state.history.length === 0 || state.history[state.history.length - 1].id !== artist.id) {
            state.history.push(artist);
        }

        state.graphArtist = artist;
        updateHistoryBar();
        showDetails(null, null, null, graph.detailsPath, graph.detailsContent);

        setStatus(graph.status, 'Loading network…');
        graph.empty.classList.add('hidden');
        const params = new URLSearchParams({ artist_id: artist.id, limit: graph.limit.value });

        const controller = new AbortController();
        if (state.graphRequest) state.graphRequest.abort();
        state.graphRequest = controller;

        try {
            const response = await fetch(`/api/graph?${params}`, { signal: controller.signal });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Graph could not be loaded.');

            const graphData = data && data.graph;
            if (!graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges)) throw new Error('Invalid format.');

            renderGraph(graphData, artist.id);
            renderRelationsList(data.all_relations);
            setStatus(graph.status, `${graphData.nodes.length} artists · ${graphData.edges.length} relationships`, 'success');
        } catch (error) {
            if (error.name !== 'AbortError') {
                if (state.graphCy) state.graphCy.destroy();
                setStatus(graph.status, error.message, 'error');
            }
        }
    }

    function renderRelationsList(relations) {
        relations = asArray(relations);
        graph.relationsPanel.classList.remove('hidden');
        graph.relationsCount.textContent = relations.length;

        const renderList = (filterText) => {
            graph.relationsList.replaceChildren();
            relations.filter(r => (r.name || '').toLowerCase().includes(filterText.toLowerCase())).forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <div style="line-height: 1.3;">
                        <strong>${item.name}</strong><br>
                        <small class="muted" style="font-size: 11px;">${item.gid || ''}</small>
                    </div>
                `;

                li.onclick = async () => {
                    const node = state.graphCy.getElementById(String(item.id));
                    const centerNode = state.graphCy.getElementById(String(state.graphArtist.id));

                    state.graphCy.nodes().removeClass('highlighted');
                    if (node.length > 0) node.addClass('highlighted');

                    if (node.length > 0) {
                        const edge = state.graphCy.edges(`[source="${centerNode.id()}"][target="${node.id()}"], [source="${node.id()}"][target="${centerNode.id()}"]`);
                        if (edge.length > 0) showDetails(centerNode.data(), node.data(), edge[0].data('details'), graph.detailsPath, graph.detailsContent);
                    } else {
                        const currentCenter = state.graphArtist;

                        graph.detailsPath.innerHTML = `
                            <div class="connection-header-compact">
                                <div class="artist-info-box">
                                    <span class="artist-name-truncate" title="${currentCenter.name}">${currentCenter.name}</span>
                                    <span class="artist-gid-full">${currentCenter.gid || ''}</span>
                                </div>
                                <div class="connection-arrow">➔</div>
                                <div class="artist-info-box">
                                    <span class="artist-name-truncate" title="${item.name}">${item.name}</span>
                                    <span class="artist-gid-full">${item.gid || ''}</span>
                                </div>
                            </div>
                        `;
                        graph.detailsContent.innerHTML = `<span class="muted">Loading connection...</span>`;

                        try {
                            const res = await fetch(`/api/connection?source=${currentCenter.id}&target=${item.id}`);
                            const data = await res.json();

                            if (state.graphArtist.id !== currentCenter.id) return;

                            showDetails(currentCenter, item, data.details, graph.detailsPath, graph.detailsContent);
                        } catch (err) {
                            if (state.graphArtist.id === currentCenter.id) {
                                graph.detailsContent.innerHTML = `<span class="muted" style="color:red">Failed to load</span>`;
                            }
                        }
                    }
                };
                li.ondblclick = () => loadGraphArtist(item);
                graph.relationsList.appendChild(li);
            });
        };
        renderList('');
        graph.relationsSearch.value = '';
        graph.relationsSearch.oninput = (e) => renderList(e.target.value);
    }


    function renderGraph(data, centerId) {
        stopSim(state.graphSim);
        state.graphSim = null;
        if (state.graphCy) state.graphCy.destroy();

        const nodesData = asArray(data && data.nodes);
        const edgesData = asArray(data && data.edges);

        const influences = nodesData.map(n => Number(n.influence_score) || 0);
        const minInf = Math.min(...influences);
        const maxInf = Math.max(...influences);

        const nodes = nodesData
            .filter((node) => node && node.id !== undefined && node.id !== null)
            .map((node) => {
                const inf = Number(node.influence_score) || 0;
                const normalized = maxInf > minInf ? Math.sqrt((inf - minInf) / (maxInf - minInf)) : 0.5;
                return {
                    data: {
                        id: String(node.id),
                        label: node.name,
                        gid: node.gid,
                        size: 24 + (normalized * 34),
                        influence: inf,
                        artistObj: node
                    }
                };
            });

        const validIds = new Set(nodes.map((node) => node.data.id));
        const edges = edgesData
            .filter((edge) => validIds.has(String(edge.source)) && validIds.has(String(edge.target)))
            .map((edge, index) => ({
                data: {
                    id: `graph-edge-${index}`,
                    source: String(edge.source),
                    target: String(edge.target),
                    details: edge.details,
                    weight: edge.weight || 1
                }
            }));

        const canvasRect = graph.canvas.getBoundingClientRect();
        const cx = canvasRect.width / 2 || 500;
        const cy0 = canvasRect.height / 2 || 400;
        const baseRadius = Math.max(150, Math.min(cx, cy0) * 0.6);
        nodes.forEach((n, i) => {
            const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
            const jitter = 0.65 + Math.random() * 0.5;
            n.position = {
                x: cx + Math.cos(angle) * baseRadius * jitter,
                y: cy0 + Math.sin(angle) * baseRadius * jitter
            };
        });

        state.graphCy = cytoscape({
            container: graph.canvas,
            elements: { nodes, edges },
            minZoom: 0.15,
            maxZoom: 4,
            wheelSensitivity: 0.2,
            motionBlur: true,
            textureOnViewport: false,
            hideEdgesOnViewport: false,
            pixelRatio: 'auto',

            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': '#4f7cff',
                        'background-fill': 'radial-gradient',
                        'background-gradient-stop-colors': '#6d9bff #315efb',
                        'background-gradient-stop-positions': '0% 100%',
                        'border-width': 2,
                        'border-color': '#ffffff',
                        'border-opacity': 0.9,
                        label: 'data(label)',
                        color: '#ffffff',
                        'font-size': 10,
                        'font-weight': 600,
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'text-wrap': 'wrap',
                        'text-max-width': 62,
                        'text-outline-color': '#1e3a8a',
                        'text-outline-width': 1.5,
                        'text-outline-opacity': 0.6,
                        width: 'data(size)',
                        height: 'data(size)',
                        'overlay-opacity': 0,
                        'transition-property': 'background-color, border-color, width, height',
                        'transition-duration': '0.25s'
                    }
                },
                {
                    selector: `node[id = "${String(centerId)}"]`,
                    style: {
                        'background-gradient-stop-colors': '#ffd97a #f2b94b',
                        'border-width': 4,
                        'border-color': '#ffffff',
                        'font-weight': 800,
                        'font-size': 12,
                        'text-max-width': 68,
                        color: '#3b2a05',
                        'text-outline-color': '#ffffff',
                        'text-outline-width': 2,
                        'text-outline-opacity': 0.9,
                        width: 72,
                        height: 72,
                        'z-index': 100
                    }
                },
                {
                    selector: 'node.hover',
                    style: {
                        'background-gradient-stop-colors': '#22d3c5 #16b8a6',
                        'border-color': '#ffffff',
                        'border-width': 3,
                        'z-index': 50
                    }
                },
                {
                    selector: 'node:active',
                    style: { 'overlay-opacity': 0.15, 'overlay-color': '#16b8a6' }
                },
                {
                    selector: 'edge',
                    style: {
                        'line-color': '#cbd5e1',
                        width: 'mapData(weight, 1, 10, 1.2, 4)',
                        opacity: 0.35,
                        'curve-style': 'bezier',
                        'control-point-step-size': 60,
                        'target-arrow-shape': 'none',
                        'transition-property': 'line-color, width, opacity',
                        'transition-duration': '0.25s'
                    }
                },
                {
                    selector: 'edge.hover',
                    style: {
                        'line-color': '#4f7cff',
                        opacity: 1,
                        'z-index': 99
                    }
                },
                {
                    selector: 'node.highlighted',
                    style: {
                        'background-gradient-stop-colors': '#fbbf24 #f59e0b',
                        'border-color': '#fef3c7',
                        'border-width': 4,
                        'z-index': 200
                    }
                },
            ]
        });

        const sim = new ForceSimulation(state.graphCy, {
            springK: 0.05,        
            restLength: 300, 
            repulsion: 120000,
            damping: 0.82,
            maxSpeed: 30,
            collisionStiffness: 1.0,
            collisionPadding: 30,
            plowRadius: 110,
            plowStrength: 9,
            gravity: 0.015,
            maxRepDist: 900,
            dragSpringDamp: 0.15,
            releaseGraceDuration: 500
        });
        sim.init();
        sim.start();
        state.graphSim = sim;

        state.graphCy.on('mouseover', 'edge', (e) => {
            e.target.addClass('hover');
            document.body.style.cursor = 'pointer';
        });
        state.graphCy.on('mouseout', 'edge', (e) => {
            e.target.removeClass('hover');
            document.body.style.cursor = '';
        });
        state.graphCy.on('mouseover', 'node', (e) => {
            e.target.addClass('hover');
            document.body.style.cursor = 'grab';
        });
        state.graphCy.on('mouseout', 'node', (e) => {
            e.target.removeClass('hover');
            document.body.style.cursor = '';
        });

        state.graphCy.on('grab', 'node', (e) => {
            sim.onGrab(e.target.id());
            e.target.style('z-index', 999);
            document.body.style.cursor = 'grabbing';
        });

        state.graphCy.on('drag', 'node', (e) => {
            sim.onDrag(e.target.id(), e.target.position());
        });

        state.graphCy.on('dragfree', 'node', (e) => {
            sim.onRelease();
            e.target.style('z-index', 'auto');
            document.body.style.cursor = 'grab';
        });

        state.graphCy.on('tap', 'edge', (e) => {
    const edge = e.target;
    const sNode = state.graphCy.getElementById(edge.data('source'));
    const tNode = state.graphCy.getElementById(edge.data('target'));

    state.graphCy.nodes().removeClass('highlighted');
        const centerIdStr = String(centerId);
        if (sNode.id() !== centerIdStr) sNode.addClass('highlighted');
        if (tNode.id() !== centerIdStr) tNode.addClass('highlighted');

        if (sNode.id() === centerIdStr) {
            showDetails(sNode.data(), tNode.data(), edge.data('details'), graph.detailsPath, graph.detailsContent);
        } else if (tNode.id() === centerIdStr) {
            showDetails(tNode.data(), sNode.data(), edge.data('details'), graph.detailsPath, graph.detailsContent);
        } else {
            showDetails(sNode.data(), tNode.data(), edge.data('details'), graph.detailsPath, graph.detailsContent);
        }
    });

        state.graphCy.on('tap', 'node', async (e) => {
            state.graphCy.nodes().removeClass('highlighted');
            e.target.addClass('highlighted');

            const node = e.target;
            const centerNode = state.graphCy.getElementById(String(centerId));

            if (node.id() !== String(centerId)) {
                const edge = state.graphCy.edges(
                    `[source="${centerNode.id()}"][target="${node.id()}"], [source="${node.id()}"][target="${centerNode.id()}"]`
                );
                if (edge.length > 0) {
                    showDetails(centerNode.data(), node.data(), edge[0].data('details'), graph.detailsPath, graph.detailsContent);
                } else {
                    const currentCenterData = centerNode.data();
                    const targetNodeData = node.data();

                    graph.detailsPath.innerHTML = `
                        <div class="connection-header-compact">
                            <div class="artist-info-box">
                                <span class="artist-name-truncate" title="${currentCenterData.label}">${currentCenterData.label}</span>
                                <span class="artist-gid-full">${currentCenterData.gid || ''}</span>
                            </div>
                            <div class="connection-arrow">➔</div>
                            <div class="artist-info-box">
                                <span class="artist-name-truncate" title="${targetNodeData.label}">${targetNodeData.label}</span>
                                <span class="artist-gid-full">${targetNodeData.gid || ''}</span>
                            </div>
                        </div>
                    `;
                    graph.detailsContent.innerHTML = `<span class="muted">Loading connection...</span>`;

                    try {
                        const res = await fetch(`/api/connection?source=${currentCenterData.id}&target=${targetNodeData.id}`);
                        const data = await res.json();

                        if (state.graphArtist.id !== currentCenterData.id) return;

                        showDetails(currentCenterData, targetNodeData, data.details, graph.detailsPath, graph.detailsContent);
                    } catch (err) {
                        if (state.graphArtist.id === currentCenterData.id) {
                            graph.detailsContent.innerHTML = `<span class="muted" style="color:red">Failed to load</span>`;
                        }
                    }
                }
            } else {
                showDetails(null, null, null, graph.detailsPath, graph.detailsContent);
            }
        });

        state.graphCy.on('dblclick', 'node', (e) => {
            const node = e.target;
            if (node.id() !== String(centerId)) loadGraphArtist(node.data('artistObj'));
        });

        const ro = new ResizeObserver(() => {
            if (state.graphCy) state.graphCy.resize();
        });
        ro.observe(graph.canvas);
    }

    function createStop() {
        const item = document.createElement('div');
        item.className = 'waypoint-item'; item.draggable = true;
        item.style.width = '100%';
        item.style.flexShrink = '0';
        item.style.marginBottom = '8px';
        item.style.display = 'flex';
        item.style.alignItems = 'center';

        item.innerHTML = `
            <span class="drag-handle" style="margin-right: 8px; cursor: grab;">⠿</span>
            <div class="search-field" style="flex: 1; width: 100%;">
                <input type="search" placeholder="Search artist…" autocomplete="off" style="width: 100%;">
            </div>
            <button class="remove-btn" type="button" style="margin-left: 8px;">×</button>
        `;

        const input = item.querySelector('input');

        const list = document.createElement('div');
        list.className = 'suggestions hidden';
        list.style.position = 'fixed';
        list.style.zIndex = '99999';
        list.style.background = '#fff';
        list.style.border = '1px solid var(--border)';
        list.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
        list.style.borderRadius = '6px';
        list.style.maxHeight = '300px';
        list.style.overflowY = 'auto';
        document.body.appendChild(list);

        const updatePosition = () => {
            const rect = input.getBoundingClientRect();
            list.style.top = (rect.bottom + 4) + 'px';
            list.style.left = rect.left + 'px';
            list.style.width = rect.width + 'px';
        };

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !list.contains(e.target)) {
                list.classList.add('hidden');
            }
        });

        document.querySelector('aside').addEventListener('scroll', () => {
            list.classList.add('hidden');
        }, { passive: true });

        input.oninput = () => {
            delete input.dataset.artistId; clearTimeout(state.routeSearchTimer);
            const value = input.value.trim();

            if (value.length < 2) { list.classList.add('hidden'); return; }

            state.routeSearchTimer = setTimeout(async () => {
                const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
                if (!response.ok) return;

                list.replaceChildren();
                asArray(await response.json()).filter((artist) => !invalidName(artist.name)).slice(0, 100).forEach((artist) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'suggestion';

                    button.style.display = 'flex';
                    button.style.flexDirection = 'column';
                    button.style.alignItems = 'flex-start';
                    button.style.textAlign = 'left';
                    button.style.padding = '8px 12px';
                    button.style.gap = '4px';
                    button.style.borderBottom = '1px solid #f0f0f0';
                    button.style.width = '100%';

                    const line1 = document.createElement('div');
                    line1.style.lineHeight = '1.3';

                    let nameStr = '';
                    if (artist.matched_alias && artist.matched_alias.toLowerCase() !== artist.name.toLowerCase()) {
                        nameStr = `<strong>${artist.matched_alias}</strong> <span class="muted" style="font-weight:normal">(${artist.name})</span>`;
                    } else {
                        nameStr = `<strong>${artist.name}</strong>`;
                    }
                    if (artist.comment) {
                        nameStr += ` <span class="muted">— <em>${artist.comment}</em></span>`;
                    }
                    line1.innerHTML = nameStr;

                    const line2 = document.createElement('small');
                    line2.className = 'muted';
                    line2.style.fontSize = '11px';
                    line2.style.wordBreak = 'break-all';
                    line2.textContent = artist.gid ? artist.gid : `#${artist.id}`;

                    button.append(line1, line2);

                    button.onclick = () => {
                        input.value = artist.matched_alias || artist.name;
                        input.dataset.artistId = artist.id;
                        list.classList.add('hidden');
                        updateRouteButton();
                    };
                    list.appendChild(button);
                });

                updatePosition();
                list.classList.toggle('hidden', !list.children.length);

            }, 250);
            updateRouteButton();
        };

        input.onfocus = () => {
            if (list.children.length > 0 && input.value.trim().length >= 2) {
                updatePosition();
                list.classList.remove('hidden');
            }
        };

        item.querySelector('.remove-btn').onclick = () => {
            item.remove();
            list.remove();
            updateRouteButton();
        };

        item.ondragstart = () => { state.routeDrag = item; item.classList.add('dragging'); list.classList.add('hidden'); };
        item.ondragend = () => { state.routeDrag = null; item.classList.remove('dragging'); };
        item.ondragover = (event) => event.preventDefault();
        item.ondrop = (event) => { event.preventDefault(); if (state.routeDrag && state.routeDrag !== item) route.stops.insertBefore(state.routeDrag, item); updateRouteButton(); };

        route.stops.appendChild(item);
    }

    function updateRouteButton() {
        const inputs = [...route.stops.querySelectorAll('input')];
        route.find.disabled = inputs.length < 2 || inputs.some((input) => !input.dataset.artistId);
    }

    async function calculateRoute() {
        const waypoints = [...route.stops.querySelectorAll('input')].map((input) => Number(input.dataset.artistId));
        if (waypoints.length < 2 || waypoints.some((id) => !Number.isInteger(id) || id <= 0)) return;
        if (state.routeRequest) state.routeRequest.abort();

        const controller = new AbortController(); state.routeRequest = controller;
        setStatus(route.status, 'Calculating route…'); route.empty.classList.add('hidden');

        showDetails(null, null, null, route.detailsPath, route.detailsContent);

        try {
            const payload = {
                waypoints,
                show_shortcuts: route.shortcuts.checked,
                allow_unnamed: route.allowUnnamed.checked
            };
            const response = await fetch('/api/path', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Route could not be calculated.');
            renderRoute(data, waypoints);
            setStatus(route.status, `${data.nodes.length} artists · ${data.edges.length} relationships`, 'success');
        } catch (error) {
            if (error.name !== 'AbortError') {
                if (state.routeCy) state.routeCy.destroy();
                setStatus(route.status, error.message, 'error');
            }
        }
    }

    function renderRoute(data, waypoints) {
        stopSim(state.routeSim);
        state.routeSim = null;
        if (state.routeCy) state.routeCy.destroy();

        const waypointIds = new Set(waypoints.map(String));
        const nodesData = asArray(data && data.nodes);
        const edgesData = asArray(data && data.edges);

        const nodes = nodesData.filter(node => node && node.id !== undefined).map((node) => {
            const d = { id: String(node.id), label: node.name, gid: node.gid };
            if (Boolean(node.is_waypoint) || waypointIds.has(String(node.id))) {
                d.isWaypoint = true;
            }
            return { data: d, position: { x: 0, y: 0 } };
        });

        const ids = new Set(nodes.map(n => n.data.id));
        const edges = edgesData.filter(e => ids.has(String(e.source)) && ids.has(String(e.target))).map((edge, index) => {
            const d = { id: edge.id || `route-edge-${index}`, source: String(edge.source), target: String(edge.target), details: edge.details };
            if (edge.is_shortcut) d.isShortcut = true;
            return { data: d };
        });

        const canvasRect = route.canvas.getBoundingClientRect();
        const startX = 100;
        const yCenter = (canvasRect.height / 2) || 300;
        const stepX = Math.max(90, Math.min(180, (canvasRect.width - 200) / Math.max(nodes.length, 1)));
        nodes.forEach((n, i) => {
            n.position = {
                x: startX + i * stepX,
                y: yCenter + (Math.random() - 0.5) * 60
            };
        });

        state.routeCy = cytoscape({
            container: route.canvas,
            elements: { nodes, edges },
            minZoom: 0.25,
            maxZoom: 3,
            wheelSensitivity: 0.18,
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': '#315efb',
                        'background-fill': 'radial-gradient',
                        'background-gradient-stop-colors': '#6d9bff #315efb',
                        'background-gradient-stop-positions': '0% 100%',
                        'border-width': 2,
                        'border-color': '#ffffff',
                        'border-opacity': 0.9,
                        label: 'data(label)',
                        color: '#ffffff',
                        'font-size': 10,
                        'font-weight': 600,
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'text-wrap': 'wrap',
                        'text-max-width': 56,
                        'text-outline-color': '#1e3a8a',
                        'text-outline-width': 1.5,
                        'text-outline-opacity': 0.6,
                        width: 56,
                        height: 56,
                        'overlay-opacity': 0,
                        'transition-property': 'background-color, border-color, width, height',
                        'transition-duration': '0.25s'
                    }
                },
                {
                    selector: 'node[?isWaypoint]',
                    style: {
                        'background-gradient-stop-colors': '#ffd97a #f2b94b',
                        'border-width': 4,
                        'border-color': '#ffffff',
                        'font-weight': 800,
                        'font-size': 12,
                        'text-max-width': 68,
                        color: '#3b2a05',
                        'text-outline-color': '#ffffff',
                        'text-outline-width': 2,
                        'text-outline-opacity': 0.9,
                        width: 72,
                        height: 72
                    }
                },
                { selector: 'edge', style: { width: 2, 'line-color': '#cbd5e1', 'target-arrow-shape': 'triangle', 'target-arrow-color': '#cbd5e1', opacity: 0.4, 'curve-style': 'bezier', 'transition-property': 'line-color, width, opacity, target-arrow-color', 'transition-duration': '0.2s' } },
                { selector: 'edge[?isShortcut]', style: { 'line-style': 'dashed', 'curve-style': 'unbundled-bezier', 'control-point-distances': -60, 'control-point-weights': 0.5 } },
                { selector: 'edge.hover', style: { 'line-color': '#315efb', 'target-arrow-color': '#315efb', opacity: 1, width: 3.5, 'z-index': 99 } },
                { selector: 'node.hover', style: { 'background-gradient-stop-colors': '#22d3c5 #16b8a6' } }
            ]
        });

        const sim = new ForceSimulation(state.routeCy, {
            springK: 0.10,
            restLength: 180,
            repulsion: 60000,
            damping: 0.86,
            maxSpeed: 22,
            collisionStiffness: 1.0,
            collisionPadding: 25,
            plowRadius: 80,
            plowStrength: 7,
            gravity: 0.015,
            maxRepDist: 700,
            dragSpringDamp: 0.25,
            releaseGraceDuration: 350
        });
        sim.init();
        sim.start();
        state.routeSim = sim;

        state.routeCy.on('mouseover', 'edge', (e) => { e.target.addClass('hover'); document.body.style.cursor = 'pointer'; });
        state.routeCy.on('mouseout', 'edge', (e) => { e.target.removeClass('hover'); document.body.style.cursor = ''; });
        state.routeCy.on('mouseover', 'node', (e) => { e.target.addClass('hover'); document.body.style.cursor = 'grab'; });
        state.routeCy.on('mouseout', 'node', (e) => { e.target.removeClass('hover'); document.body.style.cursor = ''; });

        state.routeCy.on('grab', 'node', (e) => {
            sim.onGrab(e.target.id());
            e.target.style('z-index', 999);
            document.body.style.cursor = 'grabbing';
        });

        state.routeCy.on('drag', 'node', (e) => {
            sim.onDrag(e.target.id(), e.target.position());
        });

        state.routeCy.on('dragfree', 'node', (e) => {
            sim.onRelease();
            e.target.style('z-index', 'auto');
            document.body.style.cursor = 'grab';
        });

        state.routeCy.on('tap', 'edge', (e) => {
            const edge = e.target;
            const sNode = state.routeCy.getElementById(edge.data('source'));
            const tNode = state.routeCy.getElementById(edge.data('target'));
            showDetails(sNode.data(), tNode.data(), edge.data('details'), route.detailsPath, route.detailsContent);
        });
    }
    document.querySelectorAll('.mode-tab').forEach((tab) => tab.onclick = () => switchMode(tab.dataset.mode));
    graph.input.oninput = debounce(() => searchGraph(graph.input.value.trim()), 250, 'searchTimer');
    graph.limit.oninput = () => { graph.limitValue.value = graph.limit.value; if (state.graphArtist) loadGraphArtist(state.graphArtist); };
    graph.fit.onclick = () => state.graphCy && state.graphCy.fit(undefined, 35);

    route.add.onclick = () => {
        if (route.stops.children.length < 15) {
            createStop();
            setTimeout(() => { route.stops.scrollTop = route.stops.scrollHeight; }, 10);
        }
    };

    route.find.onclick = calculateRoute;
    route.fit.onclick = () => state.routeCy && state.routeCy.fit(undefined, 35);

    createStop(); createStop();
})();