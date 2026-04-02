// app.js

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


// ===============================
// SIDEBAR TOGGLE (fixed)
// ===============================
function setupSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebar-toggle');
  const container = document.getElementById('container');

  toggle.addEventListener('click', () => {
    const isCollapsed = sidebar.classList.toggle('collapsed');
    toggle.classList.toggle('collapsed', isCollapsed);
    container.classList.toggle('collapsed', isCollapsed);
    map.resize();
  });
}


// ===============================
// SEARCH BAR (top of sidebar)
// ===============================
function setupSearchBar() {
  const searchInput = document.getElementById('search-bar');
  searchInput.addEventListener('input', () => {
    currentFilters.search = searchInput.value.toLowerCase();
    applyFilters();
  });
}


// ===============================
// LOAD DATA + INIT UI
// ===============================
async function loadDataAndInitUI() {
  const res = await fetch('data/map_data.geojson');
  const geojson = await res.json();

  geojson.features = geojson.features.filter(f => {
    const c = f.geometry?.coordinates;
    return Array.isArray(c) && c.length === 2 && isFinite(c[0]) && isFinite(c[1]);
  });

  allFeatures = geojson.features.map(f => {
    f.properties.raw = JSON.stringify(f.properties);
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
  renderOrgList(filteredFeatures);
  applyFilters();
}


// ===============================
// MAP LAYERS
// ===============================
function addLayers() {
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

  map.addLayer({
    id: 'org-points',
    type: 'circle',
    source: 'orgs',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 6,
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
      ],
      'circle-stroke-width': 1,
      'circle-stroke-color': '#333'
    }
  });

  map.on('click', 'clusters', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
    const clusterId = features[0].properties.cluster_id;

    map.getSource('orgs').getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({
        center: features[0].geometry.coordinates,
        zoom: zoom
      });
    });
  });

  map.on('click', 'org-points', (e) => {
    const props = e.features[0].properties;
    const data = JSON.parse(props.raw || JSON.stringify(props));

    const climate = (data.climate_categories || []).slice(0, 3).join(', ');
    const social = (data.social_links || []).join('<br>');
    const check = data.verified ? '✔️ ' : '';
    const verifyLink = !data.verified
      ? `<div class="verify-link"><a href="YOUR_SURVEY_URL" target="_blank">Click to claim and verify</a></div>`
      : '';

    const html = `
      <strong>${check}${data.name || 'Unknown'}</strong><br>
      ${data.address || ''}<br>
      ${data.city || ''}, ${data.state || ''}<br><br>

      <strong>Type:</strong> ${data.organization_type || 'Unknown'}<br>
      <strong>Action:</strong> ${data.action_category || 'Unknown'}<br>
      <strong>Climate:</strong> ${climate || 'Unknown'}<br>
      <strong>Audience:</strong> ${data.audience_focus || 'Unknown'}<br>
      <strong>Reach:</strong> ${data.reach || 'Unknown'}<br><br>

      ${data.website_url ? `<a href="${data.website_url}" target="_blank">Website</a><br>` : ''}
      ${social ? `<div style="margin-top:4px;">${social}</div>` : ''}
      <div style="margin-top:8px; font-size:12px;">${data.summary || ''}</div>
      ${verifyLink}
    `;

    new mapboxgl.Popup({ anchor: 'auto', maxWidth: '300px' })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);
  });
}


// ===============================
// FILTERS (dropdowns + Unknown last)
// ===============================
function buildFiltersFromData(features) {
  const filtersEl = document.getElementById('filters');
  filtersEl.innerHTML = '';

  const fields = [
    { key: 'action_category', label: 'Action Category' },
    { key: 'climate_categories', label: 'Climate Categories' },
    { key: 'organization_type', label: 'Organization Type' },
    { key: 'audience_focus', label: 'Audience Focus' },
    { key: 'reach', label: 'Reach' },
    { key: 'status', label: 'Status' },
    { key: 'tags', label: 'Tags' },
    { key: 'city', label: 'City' },
    { key: 'county', label: 'County' },
    { key: 'verified', label: 'Verification' }
  ];

  const valuesByField = {};
  fields.forEach(f => valuesByField[f.key] = new Set());

  features.forEach(f => {
    const p = f.properties;
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
    summary.textContent = `${label} (0)`;
    group.appendChild(summary);

    const boxContainer = document.createElement('div');
    boxContainer.className = 'checkbox-container';

    const values = Array.from(valuesByField[key]).sort((a, b) => {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return a.localeCompare(b);
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
        summary.textContent = `${label} (${selected.length})`;
        applyFilters();
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
// APPLY FILTERS
// ===============================
function applyFilters() {
  filteredFeatures = allFeatures.filter(f => {
    const p = f.properties;

    if (currentFilters.search) {
      const haystack = `${p.name || ''} ${p.summary || ''}`.toLowerCase();
      if (!haystack.includes(currentFilters.search)) return false;
    }

    const simple = [
      'action_category',
      'organization_type',
      'audience_focus',
      'reach',
      'status',
      'city',
      'county',
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

  renderOrgList(filteredFeatures);
}


// ===============================
// CLEAR FILTERS
// ===============================
function setupClearFilters() {
  const btn = document.getElementById('clear-filters');
  btn.addEventListener('click', () => {
    Object.keys(currentFilters).forEach(key => {
      currentFilters[key] = Array.isArray(currentFilters[key]) ? [] : '';
    });

    document.querySelectorAll('#filters input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });

    document.getElementById('search-bar').value = '';

    applyFilters();
  });
}


// ===============================
// SIDEBAR LIST
// ===============================
function renderOrgList(features) {
  const listEl = document.getElementById('org-list');
  listEl.innerHTML = '';

  features.forEach(f => {
    const p = f.properties;
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
