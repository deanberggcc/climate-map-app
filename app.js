// app.js

console.log("APP.JS STARTED");

// popup.js (or top of app.js)

export function renderPopupHTML(data) {
  const climate = (data.climate_categories || []).slice(0, 3).join(', ');
  const social = (data.social_links || []).join(' • ');
  const verified = data.verified ? '✔️ ' : '';

  return `
    <div class="popup">
      <div class="popup-title">${verified}${data.name || 'Unknown'}</div>

      <div class="popup-address">
        ${data.address || ''}
        ${data.city || ''}${data.state ? ', ' + data.state : ''}
      </div>

      <div class="popup-meta">
        <div><strong>Type:</strong> ${data.organization_type || 'Unknown'}</div>
        <div><strong>Action:</strong> ${data.action_category || 'Unknown'}</div>
        <div><strong>Climate:</strong> ${climate || 'Unknown'}</div>
        <div><strong>Audience:</strong> ${data.audience_focus || 'Unknown'}</div>
        <div><strong>Reach:</strong> ${data.reach || 'Unknown'}</div>
      </div>

      ${data.website_url ? `<a class="popup-link" href="${data.website_url}" target="_blank">Website</a>` : ''}

      ${social ? `<div class="popup-social">${social}</div>` : ''}

      ${data.summary ? `<div class="popup-summary">${data.summary}</div>` : ''}

      ${!data.verified ? `
        <div class="popup-verify">
          <a href="YOUR_SURVEY_URL" target="_blank">Click to claim and verify</a>
        </div>` : ''}
    </div>
  `;
}

// SMART POPUP POSITIONING
function computePopupAnchor(screenPos, map) {
  const w = map.getCanvas().width;
  const h = map.getCanvas().height;

  const left = screenPos.x < w * 0.33;
  const right = screenPos.x > w * 0.66;
  const top = screenPos.y < h * 0.33;
  const bottom = screenPos.y > h * 0.66;

  if (top && left) return 'top-left';
  if (top && right) return 'top-right';
  if (bottom && left) return 'bottom-left';
  if (bottom && right) return 'bottom-right';
  if (left) return 'left';
  if (right) return 'right';
  if (top) return 'top';
  return 'bottom';
}

function computePopupOffset(screenPos, map) {
  const w = map.getCanvas().width;
  const sidebarWidth = 320;

  // If point is behind the sidebar, push popup right
  if (screenPos.x < sidebarWidth + 20) {
    return { left: [sidebarWidth - screenPos.x + 20, 0] };
  }

  return 12; // default small offset
}


mapboxgl.accessToken = 'pk.eyJ1IjoiZ3JlZW4tY29tbXVuaXR5LWNhdGFseXN0cyIsImEiOiJjbW41ZHk1Y3AwOWhzMnBvZzBvOTB5c3RkIn0.2iB1CKpnzYAD34bUkQPBIw';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-71.06, 42.36],
  zoom: 7
});

map.addControl(new mapboxgl.NavigationControl(), 'top-right');

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

let activePopup = null;
let activePopupLngLat = null;

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

map.on('load', () => {
  setupSidebarToggle();
  setupSearchBar();
  loadDataAndInitUI();
});

map.on('moveend', updateVisibleOrgs);

// ===============================
// SMART POPUP POSITIONING
// ===============================

const SIDEBAR_WIDTH = 320; // match your CSS

function computePopupAnchor(screenPos, map) {
  const w = map.getCanvas().width;
  const x = screenPos.x;

  // If point is under sidebar → force popup to the right
  if (x < SIDEBAR_WIDTH + 20) return 'right';

  // Otherwise: left half → right anchor, right half → left anchor
  return x < w / 2 ? 'right' : 'left';
}


function computePopupOffset(screenPos, map) {
  const h = map.getCanvas().height;
  const y = screenPos.y;

  // Horizontal offset (distance from point)
  let dx = 14;

  // If under sidebar, push popup further right
  if (screenPos.x < SIDEBAR_WIDTH + 20) {
    dx = SIDEBAR_WIDTH - screenPos.x + 20;
  }

  // Vertical clamping
  const margin = 80; // minimum distance from top/bottom
  let dy = 0;

  if (y < margin) {
    dy = margin - y; // push down
  } else if (y > h - margin) {
    dy = (h - margin) - y; // push up
  }

  return {
    'left': [-dx, dy],
    'right': [dx, dy]
  };
}


// ===============================
// SIDEBAR TOGGLE (overlay)
// ===============================
function setupSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebar-toggle');
  if (!sidebar || !toggle) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('closed');

    // Flip arrow direction
    toggle.textContent = sidebar.classList.contains('closed') ? '⟩' : '⟨';

    // Resize map after animation
    setTimeout(() => map.resize(), 260);
  });
}

// ===============================
// SIMPLE FUZZY MATCH
// ===============================
function fuzzyMatch(haystack, needle) {
  if (!needle) return true;
  haystack = (haystack || '').toLowerCase();
  needle = needle.toLowerCase();

  if (haystack.includes(needle)) return true;

  const tokens = needle.split(/\s+/).filter(Boolean);
  return tokens.every(t => haystack.includes(t));
}

// ===============================
// SEARCH BAR + AUTOCOMPLETE
// ===============================
function setupSearchBar() {
  const input = document.getElementById('search-bar');
  const header = document.getElementById('sidebar-header');
  if (!input || !header) return;

  // Create suggestions container
  const suggestions = document.createElement('div');
  suggestions.id = 'search-suggestions';
  suggestions.style.position = 'relative';
  suggestions.style.zIndex = '50';

  // SAFE append (instead of insertBefore)
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
      const name = p.name || '';
	const city = p.city || '';
	const county = p.county || '';
	const zip = p.postal_code || '';

	if (name.toLowerCase().includes(q) && !seen.has(name)) {
 			 seen.add(name);
 			 items.push({ label: name, type: 'name' });
	}

	if (city.toLowerCase().includes(q) && !seen.has(city)) {
	  seen.add(city);
 			 items.push({ label: city, type: 'city' });
	}

	if (county.toLowerCase().includes(q) && !seen.has(county)) {
	  seen.add(county);
	  items.push({ label: county, type: 'county' });
	}

	if (zip.includes(q) && !seen.has(zip)) {
 			 seen.add(zip);
	  items.push({ label: zip, type: 'zip' });
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
      div.style.padding = '4px 8px';
      div.textContent = item.type === 'city'
        ? `${item.label} (city)`
        : item.label;

      div.addEventListener('click', () => {
        input.value = item.label;
        currentFilters.search = item.label.toLowerCase();
        applyFilters();
        hideDropdown();

        if (item.type === 'city') {
 			 const matches = allFeatures.filter(f => f.properties.city === item.label.toLowerCase());
	   zoomToBoundingFeatures(matches);
	}

	if (item.type === 'zip') {
	  const matches = allFeatures.filter(f => f.properties.postal_code === item.label);
	  zoomToBoundingFeatures(matches);
	}

	if (item.type === 'county') {
	  const matches = allFeatures.filter(f => f.properties.county === item.label.toLowerCase());
	  zoomToBoundingFeatures(matches);
	}

      });

      dropdown.appendChild(div);
    });

    dropdown.style.display = 'block';
  }

  input.addEventListener('input', (e) => {
    const q = e.target.value || '';
    currentFilters.search = q.toLowerCase().trim();
    applyFilters();
    showSuggestions(q);
  });

  input.addEventListener('blur', () => {
    setTimeout(hideDropdown, 150);
  });
}

// ===============================
// LOAD DATA + INIT UI
// ===============================
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

      p.raw = JSON.stringify(p);

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
    buildFiltersFromData(allFeatures);
    setupClearFilters();
    updateVisibleOrgs();
    applyFilters();
  } catch (err) {
    console.error('Error loading or parsing map_data.geojson', err);
  }
}

// ===============================
// MAP LAYERS
// ===============================
function addLayers() {
  // --- CLUSTERS ---
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

  // --- CLUSTER COUNT LABELS ---
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

  // --- ORG POINTS ---
  map.addLayer({
    id: 'org-points',
    type: 'circle',
    source: 'orgs',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 7,
      'circle-stroke-width': 2,
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

  // ============================================================
  //  FIX 1: GUARANTEED LAYER ORDERING (AFTER STYLE LOAD)
  // ============================================================
  map.on('styledata', () => {
    const layers = map.getStyle().layers;
    let lastSymbolLayerId = null;

    for (const layer of layers) {
      if (layer.type === 'symbol') {
        lastSymbolLayerId = layer.id;
      }
    }

    if (lastSymbolLayerId) {
      map.moveLayer('clusters', lastSymbolLayerId);
      map.moveLayer('cluster-count', lastSymbolLayerId);
      map.moveLayer('org-points', lastSymbolLayerId);
    }
  });

  // ============================================================
  //  FIX 2: GUARANTEED CLICK HANDLER ATTACHMENT
  // ============================================================
  map.on('styledata', () => {
    if (!map.getLayer('org-points')) return;

    // Remove old handlers to avoid duplicates
    map.off('click', 'org-points');
    map.off('click', 'clusters');

    // --- CLUSTER CLICK ---
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

    // --- ORG CLICK ---
	import { renderPopupHTML } from './popup.js';

	const popup = new mapboxgl.Popup({
	  closeButton: true,
 			 closeOnClick: false,
 			 maxWidth: '300px',
 			 fadeDuration: 0
	});

	map.on('click', 'org-points', (e) => {
 			 if (!e.features?.length) return;

 			 const props = e.features[0].properties;
 			 const data = JSON.parse(props.raw || JSON.stringify(props));

 			 const screenPos = map.project(e.lngLat);
 			 const anchor = computePopupAnchor(screenPos, map);
	  const offset = computePopupOffset(screenPos, map);

	  popup
 			   .setLngLat(e.lngLat)
 			   .setHTML(renderPopupHTML(data))
 			   .setOffset(offset)
 			   .setAnchor(anchor)
 			   .addTo(map);
	});
  });
}

// ===============================
// FILTERS (dropdowns + Unknown last)
// ===============================
function buildFiltersFromData(features) {
  const filtersEl = document.getElementById('filters');
  if (!filtersEl) return;
  filtersEl.innerHTML = '';

  const fields = [
    { key: 'action_category', label: 'Action Category' },
    { key: 'climate_categories', label: 'Climate Categories' },
    { key: 'organization_type', label: 'Organization Type' },
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

// ===============================
// ZOOM TO CITY
// ===============================
function zoomToCity(cityName) {
  if (!cityName) return;

  const matches = allFeatures.filter(f => {
    const p = f.properties || {};
    return (p.city || '').toLowerCase() === cityName.toLowerCase();
  });

  if (!matches.length) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  matches.forEach(f => {
    const [lon, lat] = f.geometry.coordinates;
    if (lon < minX) minX = lon;
    if (lon > maxX) maxX = lon;
    if (lat < minY) minY = lat;
    if (lat > maxY) maxY = lat;
  });

  if (isFinite(minX) && isFinite(maxX) && isFinite(minY) && isFinite(maxY)) {
    map.fitBounds([[minX, minY], [maxX, maxY]], {
      padding: { top: 40, bottom: 40, left: 40, right: 40 },
      duration: 800
    });
  }
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

  // Clamp zoom after fitBounds animation completes
  map.once('moveend', () => clampZoom(13));
}


function clampZoom(maxZoom = 13) {
  const z = map.getZoom();
  if (z > maxZoom) {
    map.easeTo({ zoom: maxZoom, duration: 300 });
  }
}

function updateVisibleOrgs() {
  const bounds = map.getBounds();

  const visible = filteredFeatures.filter(f => {
    const [lon, lat] = f.geometry.coordinates;
    return bounds.contains([lon, lat]);
  });

  renderOrgList(visible);
}

// ===============================
// APPLY FILTERS
// ===============================
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

// ===============================
// CLEAR FILTERS
// ===============================
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
      const text = s.textContent;
      const base = text.split('(')[0].trim();
      s.textContent = base;
    });

    applyFilters();
  });
}

// ===============================
// SIDEBAR LIST
// ===============================
function renderOrgList(features) {
  const listEl = document.getElementById('org-list');
  if (!listEl) return;
  listEl.innerHTML = '';

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
