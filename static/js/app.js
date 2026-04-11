/**
 * GeoAnalyst-AI — Dashboard Application
 * =======================================
 * Leaflet map + scoring API integration + animated UI
 */

// ═══════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════

const CONFIG = {
    mapCenter: [40.7580, -73.9855],
    mapZoom: 13,
    tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    apiBase: '',
    layerColors: {
        proximity_pois:       '#06d6a0',
        transit_access:       '#118ab2',
        traffic_volume:       '#f59e0b',
        demographics:         '#7c3aed',
        zoning_compatibility: '#f72585',
        competition_density:  '#ef4444',
        flood_zones:          '#ff6b6b',
    },
    layerNames: {
        proximity_pois:       'POI Proximity',
        transit_access:       'Transit Access',
        traffic_volume:       'Traffic Volume',
        demographics:         'Demographics',
        zoning_compatibility: 'Zoning',
        competition_density:  'Competition',
        flood_zones:          'Flood Zones',
    },
    gradeColors: {
        A: '#06d6a0',
        B: '#118ab2',
        C: '#f59e0b',
        D: '#f97316',
        F: '#ef4444',
    },
};


// ═══════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════

const state = {
    map: null,
    marker: null,
    isochroneLayer: null,
    layerGroups: {},
    layerVisibility: {},
    lastResult: null,
};


// ═══════════════════════════════════════════════
// Initialize
// ═══════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initEventListeners();
    loadLayerToggles();
});


function initMap() {
    state.map = L.map('map', {
        center: CONFIG.mapCenter,
        zoom: CONFIG.mapZoom,
        zoomControl: true,
        attributionControl: true,
    });

    L.tileLayer(CONFIG.tileUrl, {
        attribution: CONFIG.tileAttribution,
        maxZoom: 19,
        subdomains: 'abcd',
    }).addTo(state.map);

    // Add SVG defs for gauge gradient
    addGaugeSvgDefs();

    // Map click → score
    state.map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        document.getElementById('input-lat').value = lat.toFixed(4);
        document.getElementById('input-lon').value = lng.toFixed(4);
        scoreLocation(lat, lng);
    });
}


function addGaugeSvgDefs() {
    const gaugeSvg = document.querySelector('.gauge-ring svg');
    if (!gaugeSvg) return;

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.id = 'gaugeGradient';
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '100%');
    gradient.setAttribute('y2', '100%');

    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#06d6a0');

    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', '#118ab2');

    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    defs.appendChild(gradient);
    gaugeSvg.insertBefore(defs, gaugeSvg.firstChild);
}


function initEventListeners() {
    // Form submit
    document.getElementById('coord-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const lat = parseFloat(document.getElementById('input-lat').value);
        const lon = parseFloat(document.getElementById('input-lon').value);
        if (isNaN(lat) || isNaN(lon)) {
            showToast('Please enter valid coordinates', 'error');
            return;
        }
        scoreLocation(lat, lon);
    });

    // Layer panel toggle
    document.getElementById('btn-layers-toggle').addEventListener('click', () => {
        const panel = document.getElementById('side-panel');
        if (window.innerWidth <= 900) {
            panel.classList.toggle('open');
        } else {
            panel.classList.toggle('collapsed');
            setTimeout(() => state.map.invalidateSize(), 300);
        }
    });

    // Isochrone visibility toggle
    document.getElementById('iso-visible').addEventListener('change', (e) => {
        if (state.isochroneLayer) {
            if (e.target.checked) {
                state.isochroneLayer.addTo(state.map);
            } else {
                state.map.removeLayer(state.isochroneLayer);
            }
        }
    });

    // Isochrone profile change → re-score
    document.getElementById('iso-profile').addEventListener('change', () => {
        if (state.lastResult) {
            const { lat, lon } = state.lastResult.coordinates;
            scoreLocation(lat, lon);
        }
    });
}


// ═══════════════════════════════════════════════
// API Calls
// ═══════════════════════════════════════════════

async function scoreLocation(lat, lon) {
    showLoading(true);
    setStatus('scoring', 'Analyzing...');

    const profile = document.getElementById('iso-profile').value;

    try {
        const response = await fetch(`${CONFIG.apiBase}/api/score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lat,
                lon,
                include_isochrone: true,
                isochrone_profile: profile,
            }),
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'API error');
        }

        const result = await response.json();
        state.lastResult = result;

        updateMarker(lat, lon, result);
        updateScoreDisplay(result);
        updateIsochrone(result.isochrone_geojson);

        setStatus('ready', 'Ready');
        showToast(`Score: ${result.composite_score} (Grade ${result.grade})`, 'success');

    } catch (error) {
        console.error('Scoring error:', error);
        showToast(`Error: ${error.message}`, 'error');
        setStatus('ready', 'Ready');
    } finally {
        showLoading(false);
    }
}


async function loadLayerData(layerName) {
    try {
        const response = await fetch(`${CONFIG.apiBase}/api/layer/${layerName}`);
        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}


// ═══════════════════════════════════════════════
// Map Updates
// ═══════════════════════════════════════════════

function updateMarker(lat, lon, result) {
    if (state.marker) {
        state.map.removeLayer(state.marker);
    }

    const gradeColor = CONFIG.gradeColors[result.grade] || '#ef4444';

    // Custom pulsing marker
    const markerIcon = L.divIcon({
        className: 'custom-marker',
        html: `
            <div style="
                width: 24px; height: 24px;
                background: ${gradeColor};
                border: 3px solid rgba(255,255,255,0.9);
                border-radius: 50%;
                box-shadow: 0 0 20px ${gradeColor}80, 0 0 40px ${gradeColor}40;
                animation: markerPulse 2s ease-in-out infinite;
            "></div>
            <style>
                @keyframes markerPulse {
                    0%, 100% { box-shadow: 0 0 20px ${gradeColor}80, 0 0 40px ${gradeColor}40; }
                    50% { box-shadow: 0 0 30px ${gradeColor}a0, 0 0 60px ${gradeColor}60; }
                }
            </style>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
    });

    state.marker = L.marker([lat, lon], { icon: markerIcon })
        .addTo(state.map)
        .bindPopup(`
            <div class="popup-score">
                <div class="popup-value">${result.composite_score}</div>
                <div class="popup-grade" style="background: ${gradeColor}">Grade ${result.grade}</div>
                <div class="popup-label">${result.site_id}</div>
            </div>
        `)
        .openPopup();

    // Smooth pan
    state.map.panTo([lat, lon], { animate: true, duration: 0.5 });

    // Hide hint
    const hint = document.getElementById('map-hint');
    if (hint) hint.classList.add('hidden');
}


function updateIsochrone(geojson) {
    if (state.isochroneLayer) {
        state.map.removeLayer(state.isochroneLayer);
    }

    if (!geojson || !geojson.features || geojson.features.length === 0) return;

    const isoColors = ['rgba(6, 214, 160, 0.08)', 'rgba(17, 138, 178, 0.12)', 'rgba(124, 58, 237, 0.16)'];
    const isoBorders = ['#06d6a0', '#118ab2', '#7c3aed'];

    state.isochroneLayer = L.geoJSON(geojson, {
        style: (feature, idx) => {
            const i = Math.min(feature.properties.range_seconds / 300 - 1, 2);
            const ci = Math.max(0, Math.floor(i));
            return {
                fillColor: isoColors[ci] || isoColors[0],
                fillOpacity: 0.6,
                color: isoBorders[ci] || isoBorders[0],
                weight: 1.5,
                dashArray: '5, 5',
            };
        },
        onEachFeature: (feature, layer) => {
            const mins = feature.properties.range_minutes;
            const method = feature.properties.method || '';
            layer.bindTooltip(`${mins} min ${method.includes('fallback') ? '(approx)' : ''}`, {
                permanent: false,
                direction: 'center',
                className: 'iso-tooltip',
            });
        }
    });

    const isoVisible = document.getElementById('iso-visible').checked;
    if (isoVisible) {
        state.isochroneLayer.addTo(state.map);
    }
}


// ═══════════════════════════════════════════════
// Score Display
// ═══════════════════════════════════════════════

function updateScoreDisplay(result) {
    const section = document.getElementById('score-section');
    section.classList.remove('hidden');

    // Site ID
    document.getElementById('display-site-id').textContent = result.site_id;

    // Animate gauge
    animateGauge(result.composite_score);

    // Grade badge
    const gradeBadge = document.getElementById('grade-badge');
    gradeBadge.textContent = result.grade;
    gradeBadge.className = `grade-badge grade-${result.grade.toLowerCase()}`;
    // Re-trigger animation
    gradeBadge.style.animation = 'none';
    gradeBadge.offsetHeight; // Reflow
    gradeBadge.style.animation = '';

    // Update gauge color based on grade
    const gaugeValue = document.getElementById('gauge-value');
    const gradeColor = CONFIG.gradeColors[result.grade] || '#ef4444';
    gaugeValue.style.background = `linear-gradient(135deg, ${gradeColor}, ${adjustColor(gradeColor, -30)})`;
    gaugeValue.style.webkitBackgroundClip = 'text';
    gaugeValue.style.webkitTextFillColor = 'transparent';

    // Recommendation
    document.getElementById('recommendation-text').textContent = result.recommendation;

    // Hard constraint failures
    const failSection = document.getElementById('constraint-failures');
    if (result.hard_constraint_failures && result.hard_constraint_failures.length > 0) {
        failSection.classList.remove('hidden');
        document.getElementById('constraint-list').innerHTML =
            result.hard_constraint_failures.map(f => `<div>⛔ ${f}</div>`).join('');
    } else {
        failSection.classList.add('hidden');
    }

    // Data gaps
    const gapsSection = document.getElementById('data-gaps');
    if (result.data_gaps && result.data_gaps.length > 0) {
        gapsSection.classList.remove('hidden');
        document.getElementById('gaps-list').innerHTML =
            result.data_gaps.map(g => `<div>⚠️ ${g}</div>`).join('');
    } else {
        gapsSection.classList.add('hidden');
    }

    // Layer breakdown bars
    updateLayerBars(result.layer_scores);
}


function animateGauge(targetScore) {
    const gaugeFill = document.getElementById('gauge-fill');
    const gaugeValue = document.getElementById('gauge-value');

    const circumference = 2 * Math.PI * 52; // r=52
    const offset = circumference - (targetScore / 100) * circumference;

    // Animate the ring
    gaugeFill.style.strokeDashoffset = circumference; // Reset
    requestAnimationFrame(() => {
        gaugeFill.style.strokeDashoffset = offset;
    });

    // Animate the number
    let current = 0;
    const duration = 1200;
    const start = performance.now();

    function step(timestamp) {
        const elapsed = timestamp - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        current = Math.round(eased * targetScore);
        gaugeValue.textContent = current;

        if (progress < 1) {
            requestAnimationFrame(step);
        }
    }

    requestAnimationFrame(step);
}


function updateLayerBars(layerScores) {
    const container = document.getElementById('layer-bars');
    container.innerHTML = '';

    const entries = Object.entries(layerScores);

    // Sort by raw score descending
    entries.sort((a, b) => b[1].raw - a[1].raw);

    entries.forEach(([name, data]) => {
        const displayName = CONFIG.layerNames[name] || name.replace(/_/g, ' ');
        const color = CONFIG.layerColors[name] || '#06d6a0';
        const raw = data.raw || 0;
        const weight = data.weight || 0;
        const weighted = data.weighted || 0;

        const item = document.createElement('div');
        item.className = 'layer-bar-item';
        item.innerHTML = `
            <div class="layer-bar-header">
                <span class="layer-bar-name">${displayName}</span>
                <span class="layer-bar-value" style="color: ${color}">${raw.toFixed(0)}</span>
            </div>
            <div class="layer-bar-track">
                <div class="layer-bar-fill" style="width: 0%; background: linear-gradient(90deg, ${color}, ${adjustColor(color, 30)})"></div>
            </div>
            <div class="layer-bar-weight">Weight: ${(weight * 100).toFixed(0)}% · Weighted: ${weighted.toFixed(1)}</div>
        `;
        container.appendChild(item);

        // Animate bar fill after a tick
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                item.querySelector('.layer-bar-fill').style.width = `${raw}%`;
            });
        });
    });
}


// ═══════════════════════════════════════════════
// Layer Toggles
// ═══════════════════════════════════════════════

async function loadLayerToggles() {
    const container = document.getElementById('layer-toggles');

    try {
        const response = await fetch(`${CONFIG.apiBase}/api/layers`);
        if (!response.ok) return;
        const layers = await response.json();

        container.innerHTML = '';

        Object.entries(layers).forEach(([name, info]) => {
            const color = CONFIG.layerColors[name] || '#888';
            const displayName = CONFIG.layerNames[name] || name.replace(/_/g, ' ');

            state.layerVisibility[name] = false;

            const item = document.createElement('div');
            item.className = 'layer-toggle-item';
            item.innerHTML = `
                <div class="layer-toggle-left">
                    <div class="layer-color-dot" style="background: ${color}; opacity: 0.4" id="dot-${name}"></div>
                    <span class="layer-toggle-name">${displayName}</span>
                </div>
                <span class="layer-toggle-count">${info.feature_count}</span>
            `;

            item.addEventListener('click', () => toggleLayer(name, color, item));
            container.appendChild(item);
        });

    } catch (error) {
        container.innerHTML = '<p style="font-size: 0.78rem; color: var(--text-muted)">Could not load layers</p>';
    }
}


async function toggleLayer(name, color, itemEl) {
    state.layerVisibility[name] = !state.layerVisibility[name];
    const visible = state.layerVisibility[name];

    const dot = document.getElementById(`dot-${name}`);
    if (dot) dot.style.opacity = visible ? '1' : '0.4';

    if (visible) {
        // Load and display layer
        if (!state.layerGroups[name]) {
            const data = await loadLayerData(name);
            if (!data) {
                showToast(`Failed to load ${name}`, 'error');
                state.layerVisibility[name] = false;
                if (dot) dot.style.opacity = '0.4';
                return;
            }

            state.layerGroups[name] = L.geoJSON(data, {
                pointToLayer: (feature, latlng) => {
                    return L.circleMarker(latlng, {
                        radius: 5,
                        fillColor: color,
                        color: 'rgba(255,255,255,0.5)',
                        weight: 1,
                        fillOpacity: 0.7,
                    });
                },
                style: (feature) => {
                    const geomType = feature.geometry.type;
                    if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
                        return {
                            fillColor: color,
                            fillOpacity: 0.15,
                            color: color,
                            weight: 1.5,
                            dashArray: name === 'flood_zones' ? '5, 5' : null,
                        };
                    }
                    return {
                        color: color,
                        weight: 3,
                        opacity: 0.7,
                    };
                },
                onEachFeature: (feature, layer) => {
                    const props = feature.properties;
                    let popupContent = '<div style="font-size: 0.82rem;">';
                    Object.entries(props).forEach(([key, val]) => {
                        if (val !== null && val !== undefined) {
                            const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                            popupContent += `<b>${label}:</b> ${val}<br>`;
                        }
                    });
                    popupContent += '</div>';
                    layer.bindPopup(popupContent);
                },
            });
        }
        state.layerGroups[name].addTo(state.map);
    } else {
        if (state.layerGroups[name]) {
            state.map.removeLayer(state.layerGroups[name]);
        }
    }
}


// ═══════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════

function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

function setStatus(type, text) {
    const chip = document.getElementById('status-chip');
    const statusText = chip.querySelector('.status-text');
    chip.className = `status-chip ${type === 'scoring' ? 'scoring' : ''}`;
    statusText.textContent = text;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function adjustColor(hex, amount) {
    // Lighten or darken a hex color
    hex = hex.replace('#', '');
    const num = parseInt(hex, 16);
    const r = Math.min(255, Math.max(0, (num >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
    const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
    return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}
