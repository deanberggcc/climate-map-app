// app.js

mapboxgl.accessToken = 'pk.eyJ1IjoiZ3JlZW4tY29tbXVuaXR5LWNhdGFseXN0cyIsImEiOiJjbW41ZHk1Y3AwOWhzMnBvZzBvOTB5c3RkIn0.2iB1CKpnzYAD34bUkQPBIw';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-71.06, 42.36],
  zoom: 7
});

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
  map.addSource('orgs', {
    type: 'geojson',
    data: 'data/map_data.geojson',
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 12
  });

  addLayers();
  setupSidebarToggle();
  loadDataAndInitUI();
});

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
        'case',
        ['has', 'organization_type'],
        [
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
    const data = JSON.parse(props.raw || JSON.stringify(props)); // see below

    const climate = (data.climate_categories || []).slice(0, 3).join(', ');
    const social = (data.social_links || []).join('<br>');

    const html = `
      <strong>${data.name || 'Unknown'}</strong><br>
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
    `;

    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);
  });

  map.on('mouseenter', 'org-points', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'org-points', () => {
    map.getCanvas().style.cursor = '';
  });
}

function setupSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebar-toggle');

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    toggle.textContent = sidebar.classList.contains('collapsed') ? '⟩' : '⟨';
  });
}

async function loadDataAndInitUI() {
  const res = await fetch('data/map_data.geojson');
  const geojson = await res.json();

  // Store full feature set
  allFeatures = geojson.features.map(f => {
    // store raw properties as JSON string for popup
    f.properties.raw = JSON.stringify(f.properties);
    return f;
  });

  filteredFeatures = allFeatures.slice();

  buildFiltersFromData(allFeatures);
  renderOrgList(filteredFeatures);
  applyFilters(); // initial
}

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
    { key: 'county', label: 'County' }
  ];

  const valuesByField = {};
  fields.forEach(f => valuesByField[f.key] = new Set());

  features.forEach(f => {
    const p = f.properties;
    fields.forEach(({ key }) => {
      const val = p[key];
      if (!val) return;
      if (Array.isArray(val)) {
        val.forEach(v => valuesByField[key].add(v));
      } else {
        valuesByField[key].add(val);
      }
    });
  });

  fields.forEach(({ key, label }) => {
    const group = document.createElement('div');
    group.className = 'filter-group';

    const lab = document.createElement('label');
    lab.textContent = label;
    group.appendChild(lab);

    const select = document.createElement('select');
    select.multiple = true;
    select.dataset.field = key;

    Array.from(valuesByField[key])
      .filter(v => v && v !== 'unknown' && v !== 'Unknown')
      .sort()
      .forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        select.appendChild(opt);
      });

    select.addEventListener('change', () => {
      const selected = Array.from(select.selectedOptions).map(o => o.value);
      currentFilters[key] = selected;
      applyFilters();
    });

    group.appendChild(select);
    filtersEl.appendChild(group);
  });

  // Search bar
  const searchGroup = document.createElement('div');
  searchGroup.className = 'filter-group';
  const searchLabel = document.createElement('label');
  searchLabel.textContent = 'Search (name / summary)';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.addEventListener('input', () => {
    currentFilters.search = searchInput.value.toLowerCase();
    applyFilters();
  });
  searchGroup.appendChild(searchLabel);
  searchGroup.appendChild(searchInput);
  filtersEl.appendChild(searchGroup);
}

function applyFilters() {
  filteredFeatures = allFeatures.filter(f => {
    const p = f.properties;

    // text search
    if (currentFilters.search) {
      const haystack = `${p.name || ''} ${p.summary || ''}`.toLowerCase();
      if (!haystack.includes(currentFilters.search)) return false;
    }

    // categorical filters
    const checks = [
      'action_category',
      'organization_type',
      'audience_focus',
      'reach',
      'status',
      'city',
      'county'
    ];

    for (const field of checks) {
      const selected = currentFilters[field];
      if (selected && selected.length > 0) {
        const val = p[field];
        if (!val || !selected.includes(val)) return false;
      }
    }

    // multi-valued fields
    const multiFields = ['climate_categories', 'tags'];
    for (const field of multiFields) {
      const selected = currentFilters[field];
      if (selected && selected.length > 0) {
        const vals = Array.isArray(p[field]) ? p[field] : [];
        const hasAny = vals.some(v => selected.includes(v));
        if (!hasAny) return false;
      }
    }

    return true;
  });

  // Update source data (hide non-matching by only feeding matching features)
  const newGeoJSON = {
    type: 'FeatureCollection',
    features: filteredFeatures
  };
  map.getSource('orgs').setData(newGeoJSON);

  renderOrgList(filteredFeatures);
}

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
