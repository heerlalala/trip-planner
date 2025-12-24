
// ========================================
// CONFIGURATION
// ========================================

const CONFIG = {
    map: {
        defaultCenter: [20.5937, 78.9629], // India center
        defaultZoom: 5,
        tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
    },
    search: {
        debounceMs: 300,
        nominatimUrl: 'https://nominatim.openstreetmap.org/search'
    },
    overpass: {
        url: 'https://overpass-api.de/api/interpreter'
    },
    poi: {
        searchRadius: 5000, // meters
        maxResults: 30
    }
};

// POI type mappings with Overpass tags
const POI_TYPES = {
    food: {
        icon: '🍽️',
        color: '#ef4444',
        tags: ['amenity=restaurant', 'amenity=fast_food', 'amenity=food_court'],
        name: 'Restaurant'
    },
    cafe: {
        icon: '☕',
        color: '#f59e0b',
        tags: ['amenity=cafe', 'shop=coffee'],
        name: 'Cafe'
    },
    shop: {
        icon: '🛍️',
        color: '#3b82f6',
        tags: ['shop=mall', 'shop=department_store', 'shop=supermarket', 'shop=clothes'],
        name: 'Shop'
    },
    luxury: {
        icon: '💎',
        color: '#a855f7',
        tags: ['shop=jewelry', 'shop=boutique', 'shop=watches', 'amenity=spa'],
        name: 'Luxury'
    },
    landmark: {
        icon: '🏛️',
        color: '#06b6d4',
        tags: ['tourism=attraction', 'tourism=museum', 'historic=monument', 'tourism=viewpoint'],
        name: 'Landmark'
    },
    hotel: {
        icon: '🏨',
        color: '#22c55e',
        tags: ['tourism=hotel', 'tourism=guest_house', 'tourism=hostel'],
        name: 'Hotel'
    }
};

const BUDGET_LEVELS = {
    1: { name: 'Economy', class: 'economy', symbol: '₹' },
    2: { name: 'Moderate', class: 'moderate', symbol: '₹₹' },
    3: { name: 'Premium', class: 'premium', symbol: '₹₹₹' },
    4: { name: 'Luxury', class: 'luxury', symbol: '₹₹₹₹' }
};

// ========================================
// APPLICATION STATE
// ========================================

const state = {
    map: null,
    markers: {
        stops: [],
        pois: []
    },
    route: {
        polyline: null,
        stops: []
    },
    trip: {
        days: 3,
        budget: 2
    },
    search: {
        timeout: null,
        originResults: [],
        destinationResults: []
    },
    selectedCategories: new Set(['food', 'cafe', 'landmark']),
    isAddingStop: false,
    currentOrigin: null,
    currentDestination: null
};

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initEventListeners();
    console.log('🧭 Voyage Trip Planner initialized');
});

function initMap() {
    // Initialize Leaflet map
    state.map = L.map('map', {
        center: CONFIG.map.defaultCenter,
        zoom: CONFIG.map.defaultZoom,
        zoomControl: true
    });

    // Add tile layer (OpenStreetMap)
    L.tileLayer(CONFIG.map.tileLayer, {
        attribution: CONFIG.map.attribution,
        maxZoom: 19
    }).addTo(state.map);

    // Map click handler for adding stops
    state.map.on('click', handleMapClick);

    // Try to get user's location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                state.map.setView([latitude, longitude], 12);
            },
            () => {
                console.log('Geolocation not available, using default center');
            }
        );
    }
}

function initEventListeners() {
    // Mobile menu toggle
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');

    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', () => {
            mobileMenuToggle.classList.toggle('active');
            sidebar.classList.toggle('expanded');
        });

        // Close sidebar when clicking on map (mobile)
        document.getElementById('map').addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                mobileMenuToggle.classList.remove('active');
                sidebar.classList.remove('expanded');
            }
        });

        // Close sidebar after selecting a destination
        const originalSelectDestination = selectDestination;
        window.selectDestination = function (result) {
            originalSelectDestination(result);
            if (window.innerWidth <= 768) {
                mobileMenuToggle.classList.remove('active');
                sidebar.classList.remove('expanded');
            }
        };
    }

    // Origin search
    const originInput = document.getElementById('origin-search');
    originInput.addEventListener('input', debounce((e) => handleSearch(e, 'origin'), CONFIG.search.debounceMs));
    originInput.addEventListener('focus', () => showSearchResults('origin'));

    // Destination search
    const destinationInput = document.getElementById('destination-search');
    destinationInput.addEventListener('input', debounce((e) => handleSearch(e, 'destination'), CONFIG.search.debounceMs));
    destinationInput.addEventListener('focus', () => showSearchResults('destination'));

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-input-wrapper') && !e.target.closest('.search-results')) {
            hideSearchResults('origin');
            hideSearchResults('destination');
        }
    });

    // Duration controls
    document.getElementById('days-decrease').addEventListener('click', () => adjustDays(-1));
    document.getElementById('days-increase').addEventListener('click', () => adjustDays(1));

    // Budget slider
    document.getElementById('budget-slider').addEventListener('input', handleBudgetChange);

    // Add stop button
    document.getElementById('add-stop-btn').addEventListener('click', enableAddStopMode);

    // POI categories
    document.querySelectorAll('.poi-category').forEach(cat => {
        cat.addEventListener('click', () => toggleCategory(cat));
    });

    // Explore button
    document.getElementById('explore-btn').addEventListener('click', explorePlaces);

    // Handle window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('expanded');
            mobileMenuToggle?.classList.remove('active');
        }
        // Invalidate map size on resize
        if (state.map) {
            state.map.invalidateSize();
        }
    });
}

// ========================================
// SEARCH FUNCTIONALITY
// ========================================

async function handleSearch(e, type = 'destination') {
    const query = e.target.value.trim();

    if (query.length < 3) {
        hideSearchResults(type);
        return;
    }

    try {
        const response = await fetch(
            `${CONFIG.search.nominatimUrl}?format=json&q=${encodeURIComponent(query)}&limit=5`
        );
        const results = await response.json();

        if (type === 'origin') {
            state.search.originResults = results;
        } else {
            state.search.destinationResults = results;
        }
        displaySearchResults(results, type);
    } catch (error) {
        console.error('Search error:', error);
    }
}

function displaySearchResults(results, type = 'destination') {
    const containerId = type === 'origin' ? 'origin-search-results' : 'destination-search-results';
    const container = document.getElementById(containerId);

    if (results.length === 0) {
        container.innerHTML = '<div class="search-result-item">No results found</div>';
        container.style.display = 'block';
        return;
    }

    container.innerHTML = results.map((result, index) => `
    <div class="search-result-item" data-index="${index}" data-type="${type}">
      <span class="search-result-icon">${type === 'origin' ? '🟢' : '🔴'}</span>
      <div class="search-result-info">
        <div class="search-result-name">${result.display_name.split(',')[0]}</div>
        <div class="search-result-address">${result.display_name}</div>
      </div>
    </div>
  `).join('');

    container.style.display = 'block';

    // Add click handlers
    container.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.index);
            const itemType = item.dataset.type;
            const results = itemType === 'origin' ? state.search.originResults : state.search.destinationResults;
            selectLocation(results[index], itemType);
        });
    });
}

function showSearchResults(type = 'destination') {
    const containerId = type === 'origin' ? 'origin-search-results' : 'destination-search-results';
    const container = document.getElementById(containerId);
    const results = type === 'origin' ? state.search.originResults : state.search.destinationResults;
    if (results.length > 0) {
        container.style.display = 'block';
    }
}

function hideSearchResults(type = 'destination') {
    const containerId = type === 'origin' ? 'origin-search-results' : 'destination-search-results';
    document.getElementById(containerId).style.display = 'none';
}

function selectLocation(result, type = 'destination') {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    const name = result.display_name.split(',')[0];

    // Update appropriate search input
    const inputId = type === 'origin' ? 'origin-search' : 'destination-search';
    document.getElementById(inputId).value = name;
    hideSearchResults(type);

    if (type === 'origin') {
        // Handle origin selection - add as first stop
        state.currentOrigin = { lat, lon, name };

        if (state.route.stops.length === 0) {
            addStop(lat, lon, name, 'start');
        } else {
            updateStop(0, lat, lon, name);
        }

        // Pan to show the origin
        state.map.flyTo([lat, lon], 13, { duration: 1.5 });
    } else {
        // Handle destination selection
        state.currentDestination = { lat, lon, name };

        // Add as the last stop (or second stop if only origin exists)
        if (state.route.stops.length === 0) {
            // No origin set, add destination as first stop
            addStop(lat, lon, name, 'start');
        } else if (state.route.stops.length === 1) {
            // Origin set, add destination as end
            addStop(lat, lon, name, 'end');
        } else {
            // Update the last stop with new destination
            const lastIndex = state.route.stops.length - 1;
            updateStop(lastIndex, lat, lon, name);
        }

        // Pan to location
        state.map.flyTo([lat, lon], 13, { duration: 1.5 });
    }
}

// Keep selectDestination for backward compatibility
function selectDestination(result) {
    selectLocation(result, 'destination');
}

// ========================================
// TRIP DURATION
// ========================================

function adjustDays(delta) {
    const newDays = Math.max(1, Math.min(30, state.trip.days + delta));
    state.trip.days = newDays;

    const display = document.getElementById('days-value');
    display.textContent = newDays;

    // Add animation
    display.style.transform = 'scale(1.2)';
    setTimeout(() => {
        display.style.transform = 'scale(1)';
    }, 150);
}

// ========================================
// BUDGET FILTER
// ========================================

function handleBudgetChange(e) {
    const value = parseInt(e.target.value);
    state.trip.budget = value;

    // Update active label
    document.querySelectorAll('.budget-label').forEach(label => {
        label.classList.toggle('active', parseInt(label.dataset.level) === value);
    });

    // Filter visible POIs
    filterPOIsByBudget();
}

function filterPOIsByBudget() {
    state.markers.pois.forEach(marker => {
        const markerBudget = marker.options.budget || 2;
        const visible = markerBudget <= state.trip.budget;

        if (visible) {
            marker.setOpacity(1);
        } else {
            marker.setOpacity(0.2);
        }
    });
}

// ========================================
// ROUTE STOPS
// ========================================

function handleMapClick(e) {
    if (state.isAddingStop) {
        const { lat, lng } = e.latlng;

        // Reverse geocode to get location name
        reverseGeocode(lat, lng).then(name => {
            addStop(lat, lng, name);
        });

        disableAddStopMode();
    }
}

async function reverseGeocode(lat, lon) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
        );
        const result = await response.json();
        return result.display_name?.split(',')[0] || 'Unknown location';
    } catch (error) {
        return 'Unknown location';
    }
}

function addStop(lat, lon, name, type = 'stop') {
    const stopIndex = state.route.stops.length;
    const markerLabel = String.fromCharCode(65 + stopIndex); // A, B, C, ...

    // Create custom marker
    const markerIcon = L.divIcon({
        className: 'stop-marker-icon',
        html: `
      <div class="stop-marker ${type}" style="
        width: 36px;
        height: 36px;
        background: ${type === 'start' ? '#34d399' : type === 'end' ? '#f472b6' : '#6366f1'};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        border: 3px solid white;
      ">${markerLabel}</div>
    `,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
    });

    const marker = L.marker([lat, lon], { icon: markerIcon }).addTo(state.map);

    // Add popup
    marker.bindPopup(`
    <div class="poi-popup">
      <div class="poi-popup-header">
        <div class="poi-popup-icon landmark">📍</div>
        <div class="poi-popup-info">
          <h4>${name}</h4>
          <div class="poi-popup-type">Stop ${markerLabel}</div>
        </div>
      </div>
    </div>
  `);

    // Store in state
    state.route.stops.push({ lat, lon, name, marker });
    state.markers.stops.push(marker);

    // Update UI
    updateStopsList();
    updateRoute();
}

function updateStop(index, lat, lon, name) {
    const stop = state.route.stops[index];
    if (!stop) return;

    // Update marker position
    stop.marker.setLatLng([lat, lon]);

    // Update stop data
    stop.lat = lat;
    stop.lon = lon;
    stop.name = name;

    // Update UI
    updateStopsList();
    updateRoute();
}

function removeStop(index) {
    if (index < 0 || index >= state.route.stops.length) return;

    // Remove marker from map
    const stop = state.route.stops[index];
    state.map.removeLayer(stop.marker);

    // Remove from state
    state.route.stops.splice(index, 1);
    state.markers.stops.splice(index, 1);

    // Re-label remaining markers
    state.route.stops.forEach((stop, i) => {
        const label = String.fromCharCode(65 + i);
        const type = i === 0 ? 'start' : 'stop';
        stop.marker.setIcon(L.divIcon({
            className: 'stop-marker-icon',
            html: `
        <div class="stop-marker ${type}" style="
          width: 36px;
          height: 36px;
          background: ${type === 'start' ? '#34d399' : '#6366f1'};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 14px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          border: 3px solid white;
        ">${label}</div>
      `,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        }));
    });

    // Update UI
    updateStopsList();
    updateRoute();
}

function updateStopsList() {
    const list = document.getElementById('stops-list');

    if (state.route.stops.length === 0) {
        list.innerHTML = `
      <li class="stop-item">
        <div class="stop-marker start">A</div>
        <div class="stop-info">
          <div class="stop-name">Starting Point</div>
          <div class="stop-details">Click on map to set</div>
        </div>
      </li>
    `;
        return;
    }

    list.innerHTML = state.route.stops.map((stop, index) => {
        const label = String.fromCharCode(65 + index);
        const type = index === 0 ? 'start' : index === state.route.stops.length - 1 && state.route.stops.length > 1 ? 'end' : '';

        return `
      <li class="stop-item" data-index="${index}">
        <div class="stop-marker ${type}">${label}</div>
        <div class="stop-info">
          <div class="stop-name">${stop.name}</div>
          <div class="stop-details">Stop ${index + 1} of ${state.route.stops.length}</div>
        </div>
        <button class="stop-remove" onclick="removeStop(${index})">✕</button>
      </li>
    `;
    }).join('');
}

function updateRoute() {
    // Remove existing polyline
    if (state.route.polyline) {
        state.map.removeLayer(state.route.polyline);
    }

    // Need at least 2 stops for a route
    if (state.route.stops.length < 2) return;

    // Create polyline from stops
    const latlngs = state.route.stops.map(stop => [stop.lat, stop.lon]);

    state.route.polyline = L.polyline(latlngs, {
        color: '#6366f1',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 10',
        className: 'route-line-animated'
    }).addTo(state.map);

    // Fit map to show entire route
    state.map.fitBounds(state.route.polyline.getBounds().pad(0.1));
}

function enableAddStopMode() {
    state.isAddingStop = true;
    document.body.style.cursor = 'crosshair';

    const btn = document.getElementById('add-stop-btn');
    btn.innerHTML = '<span>📍</span> Click on map...';
    btn.classList.add('active');
}

function disableAddStopMode() {
    state.isAddingStop = false;
    document.body.style.cursor = '';

    const btn = document.getElementById('add-stop-btn');
    btn.innerHTML = '<span>+</span> Add a stop';
    btn.classList.remove('active');
}

// ========================================
// POI CATEGORIES
// ========================================

function toggleCategory(element) {
    const category = element.dataset.category;
    const checkbox = element.querySelector('input');

    checkbox.checked = !checkbox.checked;
    element.classList.toggle('active', checkbox.checked);

    if (checkbox.checked) {
        state.selectedCategories.add(category);
    } else {
        state.selectedCategories.delete(category);
    }
}

// ========================================
// EXPLORE POIs
// ========================================

async function explorePlaces() {
    // Need at least one destination
    if (state.route.stops.length === 0 && !state.currentDestination) {
        alert('Please select a destination first');
        return;
    }

    const btn = document.getElementById('explore-btn');
    btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px;"></span> Searching...';
    btn.disabled = true;

    // Clear existing POI markers
    clearPOIMarkers();

    // Get center point (first stop or current destination)
    const center = state.route.stops[0] || state.currentDestination;

    try {
        // Fetch POIs for each selected category
        for (const category of state.selectedCategories) {
            await fetchPOIs(center.lat, center.lon, category);
        }

        // Show legend
        document.getElementById('map-legend').style.display = 'block';

        // Filter by budget
        filterPOIsByBudget();

    } catch (error) {
        console.error('Error fetching POIs:', error);
    } finally {
        btn.innerHTML = '<span>✨</span> Explore Places';
        btn.disabled = false;
    }
}

async function fetchPOIs(lat, lon, category) {
    const poiType = POI_TYPES[category];
    if (!poiType) return;

    // Build Overpass query
    const tags = poiType.tags.map(tag => {
        const [key, value] = tag.split('=');
        return `node["${key}"="${value}"](around:${CONFIG.poi.searchRadius},${lat},${lon});`;
    }).join('\n');

    const query = `
    [out:json][timeout:15];
    (
      ${tags}
    );
    out body ${CONFIG.poi.maxResults};
  `;

    try {
        const response = await fetch(CONFIG.overpass.url, {
            method: 'POST',
            body: `data=${encodeURIComponent(query)}`
        });
        const data = await response.json();

        // Create markers for each POI
        data.elements.forEach(poi => {
            createPOIMarker(poi, category);
        });

    } catch (error) {
        console.error(`Error fetching ${category} POIs:`, error);
    }
}

function createPOIMarker(poi, category) {
    const poiType = POI_TYPES[category];
    const name = poi.tags?.name || poiType.name;

    // Assign random budget level (in real app, this would come from data)
    const budget = Math.ceil(Math.random() * 4);
    const budgetInfo = BUDGET_LEVELS[budget];

    // Create custom icon
    const icon = L.divIcon({
        className: 'poi-marker-icon',
        html: `
      <div style="
        width: 32px;
        height: 32px;
        background: ${poiType.color};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        border: 2px solid white;
        cursor: pointer;
      ">${poiType.icon}</div>
    `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    const marker = L.marker([poi.lat, poi.lon], {
        icon,
        budget // Store budget level for filtering
    }).addTo(state.map);

    // Create popup content
    const popupContent = `
    <div class="poi-popup">
      <div class="poi-popup-header">
        <div class="poi-popup-icon ${category}">${poiType.icon}</div>
        <div class="poi-popup-info">
          <h4>${name}</h4>
          <div class="poi-popup-type">${poiType.name}</div>
        </div>
      </div>
      <div class="poi-popup-body">
        <div class="poi-rating">
          <span class="stars">★★★★☆</span>
          <span class="count">(${Math.floor(Math.random() * 500) + 50})</span>
        </div>
        <span class="poi-budget-badge ${budgetInfo.class}">
          ${budgetInfo.symbol} ${budgetInfo.name}
        </span>
      </div>
    </div>
  `;

    marker.bindPopup(popupContent);
    state.markers.pois.push(marker);
}

function clearPOIMarkers() {
    state.markers.pois.forEach(marker => {
        state.map.removeLayer(marker);
    });
    state.markers.pois = [];
}

// ========================================
// UTILITIES
// ========================================

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Make removeStop available globally for onclick handlers
window.removeStop = removeStop;
