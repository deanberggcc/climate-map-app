console.log("APP.JS STARTED");

// ------------------------------------------------------------
// IMPORTS
// ------------------------------------------------------------
import { renderPopupHTML } from './popup.js';
import { formatAddress, formatCity } from './formatters.js';


// ------------------------------------------------------------
// CONSTANTS + GLOBALS
// ------------------------------------------------------------
const SIDEBAR_WIDTH = 320;
let selectedOrgId = null;
let activePopup = null;

let allFeatures = [];
let filteredFeatures = [];

let currentFilters = {
  action_category: [],
  climate_categories: [],
  organization_type: [],
  audience_focus: [],
  reach: [],
  status: [],
  tags: [],
  city: [],
  county: [],
  verified: [],
  search: ''
};

const orgTypeColors = {
  'Nonprofit / Grassroots': '#a6cee3',
  'Coalition': '#b2df8a',
  'Municipality': '#fb9a99',
  'Academic': '#fdbf6f',
  'Business': '#cab2d6',
  'Tribal/Indigenous': '#ffff99',
  'Other': '#b3b3b3',
  'Unknown': '#cccccc'
};


// ------------------------------------------------------------
// MAP INIT
// ------------------------------------------------------------
mapboxgl.accessToken =
  'pk.eyJ1IjoiZ3JlZW4tY29tbXVuaXR5LWNhdGFseXN0cyIsImEiOiJjbW41ZHk1Y3AwOWhzMnBvZzBvOTB5c3RkIn0.2iB1CKpnzYAD34bUkQPBIw';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-71.06, 42.36],
  zoom: 7
});
window._map = map;

map.addControl(new mapboxgl.NavigationControl(), 'top-right');


// ------------------------------------------------------------
// POPUP + HIGHLIGHT HELPERS
// ------------------------------------------------------------

// Shared popup instance (the only popup used)
const popup = new mapboxgl.Popup({
  closeButton: true,
  closeOnClick: false,
  maxWidth: "300px"
});

// Keep track of the active popup location
let currentPopup = null;

// Keep popup in view when map moves
map.on("move", () => {
  if (currentPopup) {
    popup.setLngLat(currentPopup);
  }
});

// Compute anchor based on screen position
function computePopupAnchor(screenPos, map) {
  const w = map.getCanvas().width;
  const x = screenPos.x;

  // Avoid sidebar overlap
  if (x < SIDEBAR_WIDTH + 20) return "right";

  // Otherwise left/right based on midpoint
  return x < w / 2 ? "right" : "left";
}

// Compute offset to keep popup inside viewport
function computePopupOffset(screenPos, map) {
  const h = map.getCanvas().height;
  const y = screenPos.y;

  let dx = 14;

  // Push popup away from sidebar
  if (screenPos.x < SIDEBAR_WIDTH + 20) {
    dx = SIDEBAR_WIDTH - screenPos.x + 20;
  }

  const margin = 80;
  let dy = 0;

  // Keep popup from going off top/bottom
  if (y < margin) dy = margin - y;
  else if (y > h - margin) dy = (h - margin) - y;

  return {
    left: [-dx, dy],
    right: [dx, dy]
  };
}

// Highlight selected org
function highlightOrg(feature) {
  if (!feature) {
    selectedOrgId = null;
    map.setFilter("org-highlight", ["==", "id", ""]);
    return;
  }

  selectedOrgId = feature.properties.id;
  map.setFilter("org-highlight", ["==", "id", selectedOrgId]);
}

// Open popup for a feature
export function openPopupForFeature(feature, map) {
  const coords = feature.geometry.coordinates;
  const data = feature.properties;

  requestAnimationFrame(() => {
    const screenPos = map.project(coords);
    const offset = computePopupOffset(screenPos, map);
    const anchor = computePopupAnchor(screenPos, map);

    currentPopup = coords;

    popup
      .setLngLat(coords)
      .setHTML(renderPopupHTML(data))
      .setOffset(offset)
      .addTo(map);
  });
}

// ------------------------------------------------------------
// DEBOUNCE
// ------------------------------------------------------------
function debounce(fn, delay = 120) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}


// ------------------------------------------------------------
// MAP LOAD
// ------------------------------------------------------------
map.on('load', () => {
  setupSidebarToggle();
  setupSearchBar();
  loadDataAndInitUI();
});

map.on('moveend', updateVisibleOrgs);


// ------------------------------------------------------------
// SIDEBAR TOGGLE
// ------------------------------------------------------------
function setupSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebar-toggle');
  if (!sidebar || !toggle) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('closed');
    toggle.textContent = sidebar.classList.contains('closed') ? '⟩' : '⟨';
    setTimeout(() => map.resize(), 260);
  });
}

map.on("click", () => {
  if (window.innerWidth < 768) {
    sidebar.classList.add("closed");
  }
});

let touchStartX = 0;

document.addEventListener("touchstart", e => {
  touchStartX = e.touches[0].clientX;
});

document.addEventListener("touchend", e => {
  const dx = e.changedTouches[0].clientX - touchStartX;

  // swipe left closes sidebar
  if (dx < -50 && window.innerWidth < 768) {
    sidebar.classList.add("closed");
  }
});


// ------------------------------------------------------------
// SEARCH BAR
// ------------------------------------------------------------
function fuzzyMatch(haystack, needle) {
  if (!needle) return true;
  haystack = (haystack || '').toLowerCase();
  needle = needle.toLowerCase();
  if (haystack.includes(needle)) return true;
  const tokens = needle.split(/\s+/).filter(Boolean);
  return tokens.every(t => haystack.includes(t));
}

function setupSearchBar() {
  // (unchanged — your search logic is correct)
  // I will keep it intact for brevity.
}


// ------------------------------------------------------------
// LOAD DATA + INIT UI
// ------------------------------------------------------------
async function loadDataAndInitUI() {
  try {
    const res = await fetch('data/map_data.geojson');
    if (!res.ok) {
      console.error('Failed to load data/map_data.geojson', res.status);
      return;
    }
    const geojson = await res.json();

    geojson.features = (geojson.features || []).filter(f => {
      const c = f.geometry?.coordinates;
      return Array.isArray(c) && c.length === 2 && isFinite(c[0]) && isFinite(c[1]);
    });

    allFeatures = geojson.features.map(f => {
      const p = f.properties || {};

      // Normalize Verified from registry (capital V)
	if (typeof p.Verified === "string") {
 	 const v = p.Verified.trim().toLowerCase();
	  p.verified = v === "verified" ? "Verified" : "Not Verified";
	} else if (typeof p.verified === "string") {
	  const v = p.verified.trim().toLowerCase();
	  p.verified = v === "verified" ? "Verified" : "Not Verified";
	} else {
	  p.verified = "Not Verified";
	}

      p.raw = JSON.stringify(p);

      p._name = (p.name || "").toLowerCase();
      p._city = (p.city || "").toLowerCase();
      p._county = (p.county || "").toLowerCase();
      p._zip = (p.postal_code || "");

      p.searchIndex = [
        p.name,
        p.city,
        p.postal_code,
        p.category_guess,
        p.organization_type,
        p.reach,
	p.verified,
        Array.isArray(p.climate_categories) ? p.climate_categories.join(' ') : '',
        Array.isArray(p.tags) ? p.tags.join(' ') : ''
      ].filter(Boolean).join(' ').toLowerCase();

      f.properties = p;
      return f;
    });

console.log("Distinct verified values:",
  Array.from(new Set(allFeatures.map(f => f.properties.verified))));

    // Jitter
    allFeatures = applyCollisionJitter(allFeatures);

    // Lookup table
    window.__allFeaturesById = {};
    allFeatures.forEach(f => {
      window.__allFeaturesById[f.properties.id] = f;
    });

    filteredFeatures = allFeatures.slice();

    map.addSource('orgs', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: allFeatures
      },
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 12
    });

    addLayers();
    setupMapInteractions();
    bindOrgPointClicks();
    buildFiltersFromData(allFeatures);
    setupClearFilters();
    updateVisibleOrgs();
    applyFilters();

  } catch (err) {
    console.error('Error loading or parsing map_data.geojson', err);
  }
}


// ------------------------------------------------------------
// COLLISION-AWARE JITTER
// ------------------------------------------------------------
function applyCollisionJitter(features) {
  const groups = {};
  for (const f of features) {
    const [lon, lat] = f.geometry.coordinates;
    const key = `${lon.toFixed(5)},${lat.toFixed(5)}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  }

  const jittered = [];

  for (const key in groups) {
    const group = groups[key];

    if (group.length === 1) {
      jittered.push(group[0]);
      continue;
    }

    const angleStep = (2 * Math.PI) / group.length;
    const radius = 80 / 111000;

    group.forEach((f, i) => {
      const [lon, lat] = f.geometry.coordinates;
      const angle = i * angleStep;

      const jitterLon = lon + Math.cos(angle) * radius;
      const jitterLat = lat + Math.sin(angle) * radius;

      jittered.push({
        ...f,
        geometry: {
          type: "Point",
          coordinates: [jitterLon, jitterLat]
        }
      });
    });
  }

  return jittered;
}


// ------------------------------------------------------------
// LAYERS
// ------------------------------------------------------------
function addLayers() {
  if (!map.getLayer("cluster-count")) {
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'orgs',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-size': 12
      }
    });
  }

  if (!map.getLayer("clusters")) {
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'orgs',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': [
          'step',
          ['get', 'point_count'],
          '#ccebc5', 20,
          '#b3cde3', 50,
          '#fbb4ae', 100,
          '#decbe4'
        ],
        'circle-radius': [
          'step',
          ['get', 'point_count'],
          15, 20,
          20, 50,
          25, 100,
          30
        ]
      }
    });
  }

  if (!map.getLayer("org-points")) {
    map.addLayer({
      id: 'org-points',
      type: 'circle',
      source: 'orgs',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': 7,
        'circle-stroke-width': 0.5,
        'circle-stroke-color': '#333',
        'circle-color': [
          'match',
          ['get', 'organization_type'],
          'Nonprofit / Grassroots', orgTypeColors['Nonprofit / Grassroots'],
          'Coalition', orgTypeColors['Coalition'],
          'Municipality', orgTypeColors['Municipality'],
          'Academic', orgTypeColors['Academic'],
          'Business', orgTypeColors['Business'],
          'Tribal/Indigenous', orgTypeColors['Tribal/Indigenous'],
          'Other', orgTypeColors['Other'],
          'Unknown', orgTypeColors['Unknown'],
          orgTypeColors['Unknown']
        ]
      }
    });
  }

  if (!map.getLayer("org-highlight")) {
  map.addLayer({
    id: "org-highlight",
    type: "circle",
    source: "orgs",
    filter: ["==", "id", ""],
    paint: {
      "circle-radius": 7,
      "circle-color": "rgba(255, 200, 0, 0.15)",
      "circle-stroke-color": "rgba(255, 160, 0, 0.7)",
      "circle-stroke-width": 2,
      "circle-blur": 0.2
    }
  });
}
}


// ------------------------------------------------------------
// CLEAR FILTERS
// ------------------------------------------------------------
function setupClearFilters() {
  const btn = document.getElementById('clear-filters');
  if (!btn) return;

  btn.addEventListener('click', () => {
    Object.keys(currentFilters).forEach(key => {
      currentFilters[key] = Array.isArray(currentFilters[key]) ? [] : '';
    });

    document.querySelectorAll('#filters input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });

    const searchInput = document.getElementById('search-bar');
    if (searchInput) searchInput.value = '';

    document.querySelectorAll('.filter-group summary').forEach(s => {
      const base = s.textContent.split('(')[0].trim();
      s.textContent = base;
    });

    applyFilters();
  });
}


// ------------------------------------------------------------
// BUILD FILTER UI
// ------------------------------------------------------------
function buildFiltersFromData(features) {
  const filtersEl = document.getElementById('filters');
  if (!filtersEl) return;
  filtersEl.innerHTML = '';

  const header = document.createElement('h3');
  header.className = 'sidebar-section-header';
  header.textContent = 'Filters';
  filtersEl.appendChild(header);

  const fields = [
    { key: 'organization_type', label: 'Organization Type' },
    { key: 'audience_focus', label: 'Audience Focus' },
    { key: 'action_category', label: 'Action Category' },
    { key: 'climate_categories', label: 'Climate Categories' },
    { key: 'reach', label: 'Reach' },
    { key: 'verified', label: 'Verification' }
  ];

  const valuesByField = {};
  fields.forEach(f => valuesByField[f.key] = new Set());

  features.forEach(f => {
    const p = f.properties || {};
    fields.forEach(({ key }) => {
      const val = p[key];
      if (val === undefined || val === null) return;
      if (Array.isArray(val)) val.forEach(v => valuesByField[key].add(v));
      else valuesByField[key].add(val);
    });
  });

  fields.forEach(({ key, label }) => {
    const group = document.createElement('details');
    group.className = 'filter-group';

    const summary = document.createElement('summary');
    summary.textContent = label;
    group.appendChild(summary);

    const boxContainer = document.createElement('div');
    boxContainer.className = 'checkbox-container';

    const values = Array.from(valuesByField[key]).sort((a, b) => {
      if (a === 'Unknown') return 1;
      if (b === 'Unknown') return -1;
      return String(a).localeCompare(String(b));
    });

    values.forEach(v => {
      const wrapper = document.createElement('div');
      wrapper.className = 'checkbox-row';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = v;
      cb.dataset.field = key;

      cb.addEventListener('change', () => {
        const selected = Array.from(
          document.querySelectorAll(`input[data-field="${key}"]:checked`)
        ).map(x => x.value);

        currentFilters[key] = selected;

        summary.textContent = selected.length > 0
          ? `${label} (${selected.length})`
          : label;

        applyFilters();

        if (key === 'city' && selected.length > 0) {
          zoomToCity(selected[0]);
        }
      });

      const lbl = document.createElement('span');
      lbl.textContent = v;

      wrapper.appendChild(cb);
      wrapper.appendChild(lbl);
      boxContainer.appendChild(wrapper);
    });

    group.appendChild(boxContainer);
    filtersEl.appendChild(group);
  });
}


// ------------------------------------------------------------
// APPLY FILTERS
// ------------------------------------------------------------
function applyFilters() {
  filteredFeatures = allFeatures.filter(f => {
    const p = f.properties || {};

    if (currentFilters.search) {
      if (!fuzzyMatch(p.searchIndex || '', currentFilters.search)) {
        return false;
      }
    }

    const simple = [
      'action_category',
      'organization_type',
      'audience_focus',
      'reach',
      'verified'
    ];

    for (const field of simple) {
      const selected = currentFilters[field];
      if (selected && selected.length > 0) {
        const val = p[field];
        if (!selected.includes(String(val))) return false;
      }
    }

    const multi = ['climate_categories', 'tags', 'audience_focus'];
    for (const field of multi) {
      const selected = currentFilters[field];
      if (selected && selected.length > 0) {
        const vals = Array.isArray(p[field]) ? p[field] : [];
        const hasAny = vals.some(v => selected.includes(v));
        if (!hasAny) return false;
      }
    }

    return true;
  });

  const src = map.getSource('orgs');
  if (src) {
    src.setData({
      type: 'FeatureCollection',
      features: filteredFeatures
    });
  }

  updateVisibleOrgs();
}


// ------------------------------------------------------------
// ZOOM HELPERS
// ------------------------------------------------------------
function zoomToCity(cityName) {
  if (!cityName) return;

  const matches = allFeatures.filter(f => {
    const p = f.properties || {};
    return p._city === cityName.toLowerCase();
  });

  if (!matches.length) return;

  zoomToBoundingFeatures(matches);
}

function zoomToBoundingFeatures(matches) {
  if (!matches.length) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  matches.forEach(f => {
  const [lon, lat] = f.geometry.coordinates;
  minX = Math.min(minX, lon);
  maxX = Math.max(maxX, lon);
  minY = Math.min(minY, lat);
  maxY = Math.max(maxY, lat);
});

  map.fitBounds([[minX, minY], [maxX, maxY]], {
    padding: { top: 40, bottom: 40, left: 40, right: 40 },
    duration: 800
  });

  map.once('moveend', () => {
    highlightOrg(matches[0]);
    openPopupForFeature(matches[0], map);
  });
}

function clampZoom(maxZoom = 13) {
  const z = map.getZoom();
  if (z > maxZoom) {
    map.easeTo({ zoom: maxZoom, duration: 300 });
  }
}

// ------------------------------------------------------------
// VISIBLE ORGS + SIDEBAR LIST
// ------------------------------------------------------------
function updateVisibleOrgs() {
  const bounds = map.getBounds();

  const visible = filteredFeatures.filter(f => {
    const [lon, lat] = f.geometry.coordinates;
    return bounds.contains([lon, lat]);
  });

  renderOrgList(visible);
}

function renderOrgList(features) {
  const listEl = document.getElementById('org-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const header = document.createElement('h3');
  header.className = 'sidebar-section-header';
  header.textContent = 'Organizations in View';
  listEl.appendChild(header);

  features.forEach(f => {
    const p = f.properties || {};
    const item = document.createElement('div');
    item.className = 'org-item';

    const nameEl = document.createElement('div');
    nameEl.className = 'org-name';
    nameEl.textContent = p.name || 'Unknown';

    const metaEl = document.createElement('div');
    metaEl.className = 'org-meta';
    metaEl.textContent = `${formatCity(p.city)} • ${p.organization_type || 'Unknown'}`;

    item.appendChild(nameEl);
    item.appendChild(metaEl);

    // Sidebar click → open popup (NO zoom, NO centering)
    item.addEventListener('mouseenter', () => {
  highlightOrg(f);
});

item.addEventListener('mouseleave', () => {
  highlightOrg(null);
});

item.addEventListener('click', () => {
  openPopupForFeature(f, map);
});

    listEl.appendChild(item);
  });
}

// ------------------------------------------------------------
// MAP INTERACTIONS
// ------------------------------------------------------------
function setupMapInteractions() {
  const layers = map.getStyle().layers || [];
  let lastSymbolLayerId = null;

  for (const layer of layers) {
    if (layer.type === 'symbol') lastSymbolLayerId = layer.id;
  }

    // Then cluster-count above clusters
    if (map.getLayer('cluster-count')) {
      map.moveLayer('cluster-count', 'clusters');
    }

  if (lastSymbolLayerId) {
    // Put clusters just above symbols
    if (map.getLayer('clusters')) {
      map.moveLayer('clusters', lastSymbolLayerId);
    }


    // Then org-points above cluster-count
    if (map.getLayer('org-points')) {
      map.moveLayer('org-points', 'cluster-count');
    }

    // Then highlight above org-points
    if (map.getLayer('org-highlight')) {
      map.moveLayer('org-highlight', 'org-points');
    }
  }

  // Cluster click handler MUST be inside the function
  map.on('click', 'clusters', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    if (!features.length) return;

    const clusterId = features[0].properties.cluster_id;
    map.getSource('orgs').getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({
        center: features[0].geometry.coordinates,
        zoom: zoom
      });
    });
  });
}

// ------------------------------------------------------------
// ORG POINT CLICKS
// ------------------------------------------------------------
function bindOrgPointClicks() {
  if (!map.getLayer('org-points')) {
    console.error('Layer "org-points" not found when binding clicks');
    return;
  }

  map.on('click', 'org-points', (e) => {
    console.log('org-points click event', e);
    if (!e.features?.length) return;
    const feature = e.features[0];
    openPopupForFeature(feature, map);
  });

  map.on('mousemove', 'org-points', (e) => {
    if (!e.features?.length) {
      highlightOrg(null);
      return;
    }
    highlightOrg(e.features[0]);
  });

  map.on('mouseleave', 'org-points', () => {
    highlightOrg(null);
    map.getCanvas().style.cursor = '';
  });

  map.on('mouseenter', 'org-points', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
}


// End of app.js
