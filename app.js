console.log("APP.JS STARTED");

import { renderPopupHTML } from './popup.js';

const SIDEBAR_WIDTH = 320;

/* -------------------------------------------------------
   POPUP POSITIONING HELPERS
------------------------------------------------------- */

function computePopupAnchor(screenPos, map) {
  const w = map.getCanvas().width;
  const x = screenPos.x;
  if (x < SIDEBAR_WIDTH + 20) return 'right';
  return x < w / 2 ? 'right' : 'left';
}

function computePopupOffset(screenPos, map) {
  const h = map.getCanvas().height;
  const y = screenPos.y;

  let dx = 14;
  if (screenPos.x < SIDEBAR_WIDTH + 20) {
    dx = SIDEBAR_WIDTH - screenPos.x + 20;
  }

  const margin = 80;
  let dy = 0;
  if (y < margin) dy = margin - y;
  else if (y > h - margin) dy = (h - margin) - y;

  return {
    left: [-dx, dy],
    right: [dx, dy]
  };
}

/* -------------------------------------------------------
   DEBOUNCE
------------------------------------------------------- */

function debounce(fn, delay = 120) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/* -------------------------------------------------------
   MAP INIT
------------------------------------------------------- */

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

/* -------------------------------------------------------
   GLOBAL STATE
------------------------------------------------------- */

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

const popup = new mapboxgl.Popup({
  closeButton: true,
  closeOnClick: false,
  maxWidth: '300px'
});

/* -------------------------------------------------------
   MAP LOAD
------------------------------------------------------- */

map.on('load', () => {
  setupSidebarToggle();
  setupSearchBar();
  loadDataAndInitUI();
});

map.on('moveend', updateVisibleOrgs);

/* -------------------------------------------------------
   SIDEBAR TOGGLE
------------------------------------------------------- */

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

/* -------------------------------------------------------
   FUZZY SEARCH
------------------------------------------------------- */

function fuzzyMatch(haystack, needle) {
  if (!needle) return true;
  haystack = (haystack || '').toLowerCase();
  needle = needle.toLowerCase();
  if (haystack.includes(needle)) return true;
  const tokens = needle.split(/\s+/).filter(Boolean);
  return tokens.every(t => haystack.includes(t));
}

/* -------------------------------------------------------
   SEARCH BAR + DROPDOWN
------------------------------------------------------- */

function setupSearchBar() {
  const input = document.getElementById('search-bar');
  const header = document.getElementById('sidebar-header');
  if (!input || !header) return;

  const suggestions = document.createElement('div');
  suggestions.id = 'search-suggestions';
  suggestions.style.position = 'relative';
  suggestions.style.zIndex = '50';
  header.appendChild(suggestions);

  const dropdown = document.createElement('div');
  dropdown.style.position = 'absolute';
  dropdown.style.top = '100%';
  dropdown.style.left = '0';
  dropdown.style.right = '0';
  dropdown.style.background = '#fff';
  dropdown.style.border = '1px solid #ccc';
  dropdown.style.maxHeight = '200px';
  dropdown.style.overflowY = 'auto';
  dropdown.style.fontSize = '0.85rem';
  dropdown.style.display = 'none';
  dropdown.style.cursor = 'pointer';
  dropdown.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
  suggestions.appendChild(dropdown);

  function hideDropdown() {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
  }

  function showSuggestions(query) {
    if (!query || !allFeatures.length) {
      hideDropdown();
      return;
    }

    const q = query.toLowerCase();
    const seen = new Set();
    const items = [];

    for (const f of allFeatures) {
      const p = f.properties;

      if (p._name.includes(q) && !seen.has(p.name)) {
        seen.add(p.name);
        items.push({ label: p.name, type: 'name' });
      }

      if (p._city.includes(q) && !seen.has(p.city)) {
        seen.add(p.city);
        items.push({ label: p.city, type: 'city' });
      }

      if (p._county.includes(q) && !seen.has(p.county)) {
        seen.add(p.county);
        items.push({ label: p.county, type: 'county' });
      }

      if (p._zip.includes(q) && !seen.has(p._zip)) {
        seen.add(p._zip);
        items.push({ label: p._zip, type: 'zip' });
      }

      if (items.length >= 10) break;
    }

    if (!items.length) {
      hideDropdown();
      return;
    }

    dropdown.innerHTML = '';
    items.forEach(item => {
      const div = document.createElement('div');
      div.textContent = item.label;
      div.style.padding = '6px 10px';
      div.style.borderBottom = '1px solid #eee';

      div.addEventListener('mousedown', () => {
        input.value = item.label;
        currentFilters.search = item.label.toLowerCase();
        debouncedApply();
        hideDropdown();

        if (item.type === 'city') {
          const matches = allFeatures.filter(f => f.properties._city === item.label.toLowerCase());
          zoomToBoundingFeatures(matches);
        }

        if (item.type === 'zip') {
          const matches = allFeatures.filter(f => f.properties._zip === item.label);
          zoomToBoundingFeatures(matches);
        }

        if (item.type === 'county') {
          const matches = allFeatures.filter(f => f.properties._county === item.label.toLowerCase());
          zoomToBoundingFeatures(matches);
        }
      });

      dropdown.appendChild(div);
    });

    dropdown.style.display = 'block';
  }

  const debouncedApply = debounce(applyFilters, 120);
  const debouncedSuggest = debounce(showSuggestions, 120);

  input.addEventListener('input', (e) => {
    const q = e.target.value || '';
    currentFilters.search = q.toLowerCase().trim();
    debouncedApply();
    debouncedSuggest(q);
  });

  input.addEventListener('blur', () => {
    setTimeout(hideDropdown, 150);
  });
}

/* -------------------------------------------------------
   LOAD DATA + INIT UI
------------------------------------------------------- */

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

	// --- VERIFIED NORMALIZATION (authoritative field) ---
	if (typeof p.verified === "boolean") {
	  p.verified = p.verified ? "Verified" : "Not Verified";
	} else if (typeof p.verified === "string") {
 	 const v = p.verified.trim().toLowerCase();
 	 p.verified = v === "verified" ? "Verified" : "Not Verified";
	} else {
	  p.verified = "Not Verified";
	}

// Remove validated entirely
delete p.validated;


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
        Array.isArray(p.climate_categories) ? p.climate_categories.join(' ') : '',
        Array.isArray(p.tags) ? p.tags.join(' ') : ''
      ].filter(Boolean).join(' ').toLowerCase();

      f.properties = p;
      return f;
    });

    // Apply collision-aware jitter once, then use jittered features everywhere
    allFeatures = applyCollisionJitter(allFeatures);
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

/* -------------------------------------------------------
   COLLISION-AWARE JITTER
------------------------------------------------------- */

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
    const radius = 80 / 111000; // ~80m for stronger separation

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

/* -------------------------------------------------------
   LAYERS
------------------------------------------------------- */

function addLayers() {
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
}

/* -------------------------------------------------------
   CLEAR FILTERS
------------------------------------------------------- */

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

/* -------------------------------------------------------
   BUILD FILTER UI
------------------------------------------------------- */

function buildFiltersFromData(features) {
  const filtersEl = document.getElementById('filters');
  if (!filtersEl) return;
  filtersEl.innerHTML = '';

  // --- Add Filters header ---
  const header = document.createElement('h3');
  header.className = 'sidebar-section-header';
  header.textContent = 'Filters';
  filtersEl.appendChild(header);

  const fields = [
    { key: 'organization_type', label: 'Organization Type' },
  { key: 'action_category', label: 'Action Category' },
    { key: 'climate_categories', label: 'Climate Categories' },
    { key: 'audience_focus', label: 'Audience Focus' },
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

/* -------------------------------------------------------
   APPLY FILTERS
------------------------------------------------------- */

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

    const multi = ['climate_categories', 'tags'];
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

/* -------------------------------------------------------
   ZOOM HELPERS
------------------------------------------------------- */

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

  map.once('moveend', () => clampZoom(13));
}

function clampZoom(maxZoom = 13) {
  const z = map.getZoom();
  if (z > maxZoom) {
    map.easeTo({ zoom: maxZoom, duration: 300 });
  }
}

/* -------------------------------------------------------
   VISIBLE ORGS + SIDEBAR LIST
------------------------------------------------------- */

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

  // --- Add header above org list ---
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
    metaEl.textContent = `${p.city || ''} • ${p.organization_type || 'Unknown'}`;

    item.appendChild(nameEl);
    item.appendChild(metaEl);

    item.addEventListener('click', () => {
      const [lon, lat] = f.geometry.coordinates;
      map.easeTo({ center: [lon, lat], zoom: 13 });
    });

    listEl.appendChild(item);
  });
}

/* -------------------------------------------------------
   MAP INTERACTIONS
------------------------------------------------------- */

function setupMapInteractions() {
  const layers = map.getStyle().layers || [];
  let lastSymbolLayerId = null;

  for (const layer of layers) {
    if (layer.type === 'symbol') lastSymbolLayerId = layer.id;
  }

  if (lastSymbolLayerId) {
    if (map.getLayer('clusters')) {
      map.moveLayer('clusters', lastSymbolLayerId);
    }
    if (map.getLayer('cluster-count')) {
      map.moveLayer('cluster-count', lastSymbolLayerId);
    }
    if (map.getLayer('org-points')) {
      map.moveLayer('org-points', lastSymbolLayerId);
    }
  }

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

/* -------------------------------------------------------
   ORG POINT CLICKS
------------------------------------------------------- */

function bindOrgPointClicks() {
  map.on('click', 'org-points', (e) => {
    if (!e.features?.length) return;

    const props = e.features[0].properties;
    const data = JSON.parse(props.raw || JSON.stringify(props));

    requestAnimationFrame(() => {
      const screenPos = map.project(e.lngLat);
      const offset = computePopupOffset(screenPos, map);

      popup
        .setLngLat(e.lngLat)
        .setHTML(renderPopupHTML(data))
        .setOffset(offset)
        .addTo(map);
    });
  });

  map.on('mouseenter', 'org-points', () => {
    map.getCanvas().style.cursor = 'pointer';
  });

  map.on('mouseleave', 'org-points', () => {
    map.getCanvas().style.cursor = '';
  });
}


