
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
        debounceMs: 100,  // Reduced for faster search
        nominatimUrl: 'https://nominatim.openstreetmap.org/search'
    },
    overpass: {
        url: 'https://overpass-api.de/api/interpreter'
    },
    poi: {
        searchRadius: 10000, // 10km radius for better coverage
        maxResults: 50
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
        budget: 25000
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

    // Create tile layers
    state.streetLayer = L.tileLayer(CONFIG.map.tileLayer, {
        attribution: CONFIG.map.attribution,
        maxZoom: 19
    });

    // Satellite layer (using ESRI World Imagery - free for non-commercial use)
    state.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri &mdash; Source: Esri, DigitalGlobe, GeoEye, Earthstar Geographics',
        maxZoom: 19
    });

    // Add street layer by default
    state.streetLayer.addTo(state.map);
    state.currentLayer = 'street';

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

// Function to switch map view
function switchToSatelliteView() {
    if (state.currentLayer !== 'satellite') {
        state.map.removeLayer(state.streetLayer);
        state.satelliteLayer.addTo(state.map);
        state.currentLayer = 'satellite';
    }
}

function switchToStreetView() {
    if (state.currentLayer !== 'street') {
        state.map.removeLayer(state.satelliteLayer);
        state.streetLayer.addTo(state.map);
        state.currentLayer = 'street';
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

    // Sidebar toggle (collapse/expand)
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarExpand = document.getElementById('sidebar-expand');

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.add('collapsed');
            sidebarExpand?.classList.add('visible');
            // Refresh map size after sidebar collapse
            setTimeout(() => {
                if (state.map) state.map.invalidateSize();
            }, 350);
        });
    }

    if (sidebarExpand) {
        sidebarExpand.addEventListener('click', () => {
            sidebar.classList.remove('collapsed');
            sidebarExpand.classList.remove('visible');
            // Refresh map size after sidebar expand
            setTimeout(() => {
                if (state.map) state.map.invalidateSize();
            }, 350);
        });
    }

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

    // POI Filter Widget - Close button
    const widgetClose = document.getElementById('widget-close');
    if (widgetClose) {
        widgetClose.addEventListener('click', () => {
            document.getElementById('poi-filter-widget').style.display = 'none';
        });
    }

    // POI Filter Widget - Checkbox toggles
    document.querySelectorAll('.widget-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            const category = checkbox.dataset.category;
            const input = checkbox.querySelector('input');

            // Toggle visibility of markers for this category
            toggleCategoryMarkers(category, input.checked);
        });
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

    // Update displayed budget value
    const budgetDisplay = document.getElementById('budget-value');
    if (budgetDisplay) {
        budgetDisplay.textContent = value.toLocaleString('en-IN');
    }

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

    // Get all search points (stops + intermediate points along the route)
    let searchPoints = [];

    if (state.route.stops.length > 0) {
        // Add all stops
        searchPoints = [...state.route.stops];

        // Add intermediate points along the route between each stop
        for (let i = 0; i < state.route.stops.length - 1; i++) {
            const from = state.route.stops[i];
            const to = state.route.stops[i + 1];
            const intermediates = getIntermediatePoints(from, to, 3); // 3 points between each stop
            searchPoints.push(...intermediates);
        }
    } else if (state.currentDestination) {
        searchPoints = [state.currentDestination];
    }

    try {
        // Sync widget checkboxes with sidebar selections before fetching
        syncWidgetWithSidebar();

        // Fetch POIs for all selected categories at ALL route points
        const fetchPromises = [];
        for (const point of searchPoints) {
            for (const category of state.selectedCategories) {
                fetchPromises.push(fetchPOIs(point.lat, point.lon, category));
            }
        }
        await Promise.all(fetchPromises);

        console.log(`Found ${state.markers.pois.length} POIs at ${searchPoints.length} locations`);

        // Show message if no POIs found
        if (state.markers.pois.length === 0) {
            alert('No places found in this area. This region may have limited data in OpenStreetMap. Try searching in a major city.');
        }

        // Show POI filter widget
        document.getElementById('poi-filter-widget').style.display = 'block';

        // Filter by budget
        filterPOIsByBudget();

        // Zoom to fit all POI markers
        zoomToFitPOIs(searchPoints[0]);

        // Switch to satellite view for better visualization
        switchToSatelliteView();

        // Generate and display itinerary
        generateItinerary(searchPoints);

    } catch (error) {
        console.error('Error fetching POIs:', error);
        alert('Error fetching places. Please try again.');
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
        budget, // Store budget level for filtering
        category // Store category for filtering
    }).addTo(state.map);

    // Get additional info from OSM tags
    const address = poi.tags?.['addr:street'] || poi.tags?.['addr:full'] || '';
    const locality = poi.tags?.['addr:suburb'] || poi.tags?.['addr:city'] || poi.tags?.['addr:district'] || '';
    const cuisine = poi.tags?.cuisine || '';
    const phone = poi.tags?.phone || poi.tags?.['contact:phone'] || '';
    const website = poi.tags?.website || poi.tags?.['contact:website'] || '';
    const openingHours = poi.tags?.opening_hours || '';

    // Generate random but consistent price range for demo
    const priceRange = budget <= 2 ? '₹200 - ₹500' : budget === 3 ? '₹500 - ₹1500' : '₹1500+';
    const rating = (3.5 + Math.random() * 1.5).toFixed(1);
    const reviewCount = Math.floor(Math.random() * 500) + 50;

    // Create enhanced popup content
    const popupContent = `
    <div class="poi-popup enhanced">
      <div class="poi-popup-image" style="background: linear-gradient(135deg, ${poiType.color}40, ${poiType.color}20);">
        <span class="poi-popup-emoji">${poiType.icon}</span>
      </div>
      <div class="poi-popup-content">
        <div class="poi-popup-header">
          <div class="poi-popup-info">
            <h4>${name}</h4>
            <div class="poi-popup-type">${poiType.name}${cuisine ? ' • ' + cuisine.split(';')[0] : ''}</div>
          </div>
        </div>
        <div class="poi-popup-details">
          ${locality ? `<div class="poi-detail"><span>📍</span> ${locality}${address ? ', ' + address : ''}</div>` : ''}
          <div class="poi-detail"><span>💰</span> ${priceRange} for two</div>
          ${openingHours ? `<div class="poi-detail"><span>🕐</span> ${openingHours}</div>` : ''}
          ${phone ? `<div class="poi-detail"><span>📞</span> ${phone}</div>` : ''}
        </div>
        <div class="poi-popup-footer">
          <div class="poi-rating">
            <span class="rating-badge">★ ${rating}</span>
            <span class="count">(${reviewCount} reviews)</span>
          </div>
          <span class="poi-budget-badge ${budgetInfo.class}">
            ${budgetInfo.symbol}
          </span>
        </div>
        ${website ? `<a href="${website}" target="_blank" class="poi-website-btn">Visit Website →</a>` : ''}
      </div>
    </div>
  `;

    marker.bindPopup(popupContent, { maxWidth: 300, className: 'enhanced-popup' });
    state.markers.pois.push(marker);
}

function clearPOIMarkers() {
    state.markers.pois.forEach(marker => {
        state.map.removeLayer(marker);
    });
    state.markers.pois = [];
}

function toggleCategoryMarkers(category, visible) {
    state.markers.pois.forEach(marker => {
        if (marker.options.category === category) {
            if (visible) {
                marker.setOpacity(1);
                marker.getElement()?.style.setProperty('pointer-events', 'auto');
            } else {
                marker.setOpacity(0);
                marker.getElement()?.style.setProperty('pointer-events', 'none');
            }
        }
    });
}

// Sync widget checkboxes with sidebar category selections
function syncWidgetWithSidebar() {
    document.querySelectorAll('.widget-checkbox').forEach(widget => {
        const category = widget.dataset.category;
        const input = widget.querySelector('input');
        const isSelected = state.selectedCategories.has(category);
        input.checked = isSelected;
    });
}

function zoomToFitPOIs(center) {
    if (state.markers.pois.length === 0) {
        // No POIs found, zoom to center
        state.map.flyTo([center.lat, center.lon], 14, { duration: 1 });
        return;
    }

    // Create bounds that include all POI markers and route stops
    const allLatLngs = [];

    // Add POI markers
    state.markers.pois.forEach(marker => {
        allLatLngs.push(marker.getLatLng());
    });

    // Add route stops
    state.route.stops.forEach(stop => {
        allLatLngs.push([stop.lat, stop.lon]);
    });

    if (allLatLngs.length > 0) {
        const bounds = L.latLngBounds(allLatLngs);
        state.map.flyToBounds(bounds.pad(0.1), {
            duration: 1.2,
            maxZoom: 15
        });
    }
}

// ========================================
// ITINERARY GENERATION
// ========================================

function generateItinerary(searchPoints) {
    const itineraryPanel = document.getElementById('itinerary-panel');
    const itineraryContent = document.getElementById('itinerary-content');

    if (!itineraryPanel || !itineraryContent) return;

    // Calculate route distance (approximate)
    const routeDistance = calculateRouteDistance();
    const tripDays = state.trip.days;

    // Get all POI markers info
    const pois = state.markers.pois.map(marker => ({
        name: marker.options.icon?.options?.html?.match(/>([^<]+)</)?.[1] || 'Place',
        category: marker.options.category,
        latlng: marker.getLatLng(),
        icon: POI_TYPES[marker.options.category]?.icon || '📍'
    }));

    // Show panel
    itineraryPanel.style.display = 'block';

    // Build itinerary HTML
    let html = '';

    // Route info header
    html += `
        <div class="itinerary-route-info">
            <div class="itinerary-route-stat">📍 ${state.route.stops.length} stops</div>
            <div class="itinerary-route-stat">📏 ${routeDistance} km</div>
            <div class="itinerary-route-stat">📅 ${tripDays} days</div>
        </div>
    `;

    if (pois.length === 0) {
        html += '<div class="itinerary-empty">No places found to add to itinerary</div>';
        itineraryContent.innerHTML = html;
        return;
    }

    // Distribute POIs across days
    const poisPerDay = Math.ceil(pois.length / tripDays);

    for (let day = 1; day <= tripDays; day++) {
        const startIdx = (day - 1) * poisPerDay;
        const dayPois = pois.slice(startIdx, startIdx + poisPerDay);

        if (dayPois.length === 0) continue;

        html += `
            <div class="itinerary-day">
                <div class="itinerary-day-header">
                    <span class="itinerary-day-number">${day}</span>
                    <span>Day ${day}</span>
                </div>
        `;

        // Add route start point for first day
        if (day === 1 && state.route.stops.length > 0) {
            html += `
                <div class="itinerary-place">
                    <span class="itinerary-place-icon">🟢</span>
                    <div class="itinerary-place-info">
                        <div class="itinerary-place-name">${state.route.stops[0].name || 'Start'}</div>
                        <div class="itinerary-place-type">Starting Point</div>
                    </div>
                </div>
            `;
        }

        // Add day's places
        dayPois.forEach(poi => {
            const typeName = POI_TYPES[poi.category]?.name || 'Place';
            html += `
                <div class="itinerary-place">
                    <span class="itinerary-place-icon">${poi.icon}</span>
                    <div class="itinerary-place-info">
                        <div class="itinerary-place-name">${poi.name}</div>
                        <div class="itinerary-place-type">${typeName}</div>
                    </div>
                </div>
            `;
        });

        // Add destination for last day
        if (day === tripDays && state.route.stops.length > 1) {
            const lastStop = state.route.stops[state.route.stops.length - 1];
            html += `
                <div class="itinerary-place">
                    <span class="itinerary-place-icon">🔴</span>
                    <div class="itinerary-place-info">
                        <div class="itinerary-place-name">${lastStop.name || 'Destination'}</div>
                        <div class="itinerary-place-type">Final Destination</div>
                    </div>
                </div>
            `;
        }

        html += '</div>';
    }

    itineraryContent.innerHTML = html;
}

function calculateRouteDistance() {
    if (state.route.stops.length < 2) return 0;

    let totalDistance = 0;
    for (let i = 0; i < state.route.stops.length - 1; i++) {
        const from = state.route.stops[i];
        const to = state.route.stops[i + 1];
        totalDistance += haversineDistance(from.lat, from.lon, to.lat, to.lon);
    }

    return Math.round(totalDistance);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Get intermediate points along a route between two stops
function getIntermediatePoints(from, to, numPoints) {
    const points = [];
    for (let i = 1; i <= numPoints; i++) {
        const fraction = i / (numPoints + 1);
        points.push({
            lat: from.lat + (to.lat - from.lat) * fraction,
            lon: from.lon + (to.lon - from.lon) * fraction,
            name: `En Route (${Math.round(fraction * 100)}%)`
        });
    }
    return points;
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
