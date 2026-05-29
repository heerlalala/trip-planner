
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
    },
    nature: {
        icon: '🌳',
        color: '#10b981',
        tags: ['leisure=park', 'tourism=camp_site', 'tourism=picnic_site', 'natural=beach'],
        name: 'Nature & Parks'
    },
    nightlife: {
        icon: '🍺',
        color: '#f43f5e',
        tags: ['amenity=pub', 'amenity=bar', 'amenity=nightclub'],
        name: 'Nightlife'
    },
    adventure: {
        icon: '🎡',
        color: '#ec4899',
        tags: ['leisure=theme_park', 'tourism=zoo', 'leisure=playground'],
        name: 'Adventure'
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
    selectedCategories: new Set(['food', 'cafe', 'landmark', 'nature']),
    selectedStyle: 'adventure',
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

    // Travel style selectors
    document.querySelectorAll('.style-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.style-option').forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            const radio = option.querySelector('input[type="radio"]');
            radio.checked = true;
            state.selectedStyle = radio.value;
            
            // Auto refresh travel costs and AI advice if it's active
            if (document.getElementById('itinerary-panel').style.display !== 'none') {
                renderTravelCostsAndAIAdvice();
            }
        });
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

    // Auto-update travel costs and AI advice if visible
    const itineraryPanel = document.getElementById('itinerary-panel');
    if (itineraryPanel && itineraryPanel.style.display !== 'none') {
        renderTravelCostsAndAIAdvice();
    }
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

async function getOSRMRoute(coordinates) {
    if (coordinates.length < 2) return null;
    const coordsString = coordinates.map(c => `${c[1]},${c[0]}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const distanceKm = route.distance / 1000;
            const durationSec = route.duration;
            const geojson = route.geometry;
            return {
                coordinates: geojson.coordinates.map(c => [c[1], c[0]]),
                distance: distanceKm,
                duration: durationSec
            };
        }
    } catch (e) {
        console.error("OSRM routing failed, falling back to straight lines:", e);
    }
    return null;
}

async function updateRoute() {
    // Remove existing polyline
    if (state.route.polyline) {
        state.map.removeLayer(state.route.polyline);
    }

    // Need at least 2 stops for a route
    if (state.route.stops.length < 2) return;

    // Create baseline straight polyline from stops as loading fallback
    const latlngs = state.route.stops.map(stop => [stop.lat, stop.lon]);

    state.route.polyline = L.polyline(latlngs, {
        color: '#6366f1',
        weight: 4,
        opacity: 0.5,
        dashArray: '5, 10',
        className: 'route-line-animated'
    }).addTo(state.map);

    // Fit map to show entire route
    state.map.fitBounds(state.route.polyline.getBounds().pad(0.1));

    // Try OSRM routing
    const osrmData = await getOSRMRoute(latlngs);
    if (osrmData) {
        state.map.removeLayer(state.route.polyline);
        state.route.polyline = L.polyline(osrmData.coordinates, {
            color: '#6366f1',
            weight: 5,
            opacity: 0.9,
            className: 'route-line-animated'
        }).addTo(state.map);

        // Store real distance and duration
        state.route.actualDistance = osrmData.distance;
        state.route.actualDuration = osrmData.duration;
    } else {
        // Fallback
        state.route.actualDistance = calculateRouteDistance();
        state.route.actualDuration = null;
    }

    // Auto-update itinerary cost calculator if it's already visible
    const itineraryPanel = document.getElementById('itinerary-panel');
    if (itineraryPanel && itineraryPanel.style.display !== 'none') {
        renderTravelCostsAndAIAdvice();
    }
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

        // Fetch POIs in bulk using a single optimized request (up to 15x faster and avoids rate limits!)
        const categoriesArray = Array.from(state.selectedCategories);
        try {
            await fetchPOIsInBulk(searchPoints, categoriesArray);
        } catch (apiError) {
            console.warn("Overpass API failed, falling back to simulated local highlights:", apiError);
            generateSimulatedPOIs(searchPoints, categoriesArray);
        }

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

        // Render travel costs and AI advice
        renderTravelCostsAndAIAdvice();

    } catch (error) {
        console.error('Error fetching POIs:', error);
        alert('Error fetching places. Please try again.');
    } finally {
        btn.innerHTML = '<span>✨</span> Explore Places';
        btn.disabled = false;
    }
}

async function fetchPOIsInBulk(searchPoints, categories) {
    if (searchPoints.length === 0 || categories.length === 0) return;

    // 1. Calculate bounding box dimensions
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    searchPoints.forEach(p => {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lon < minLon) minLon = p.lon;
        if (p.lon > maxLon) maxLon = p.lon;
    });

    const latDiff = maxLat - minLat;
    const lonDiff = maxLon - minLon;
    const boxArea = latDiff * lonDiff; // Area in square degrees

    let unionBlock = "";

    // If the search area is compact (e.g. under ~200km or a local destination search),
    // use a single, highly optimized Bounding Box query!
    // Bounding box queries utilize 2D database index ranges and are up to 10x faster than distance math (around)
    if (boxArea <= 1.5 && searchPoints.length > 1) {
        console.log(`Searching via optimized Bounding Box (Area: ${boxArea.toFixed(4)} sq deg)`);
        
        // Add a padding of approx. 4km (0.04 degrees) around the corridor
        const pad = 0.04;
        const bboxScope = `(${minLat - pad},${minLon - pad},${maxLat + pad},${maxLon + pad})`;
        
        categories.forEach(category => {
            const statements = getQLStatementsForCategory(category, bboxScope);
            statements.forEach(stmt => {
                unionBlock += `  ${stmt}\n`;
            });
        });
    } else {
        // For long-distance trips or single stops, search only around the actual stops
        // (origin, destination, and user-defined stops) to keep it fast and relevant.
        console.log("Searching via localized stop radii");
        const uniqueLocations = [];
        
        // Limit search to stops, removing intermediate path points for efficiency
        const stopsOnly = state.route.stops.length > 0 ? state.route.stops : searchPoints;
        
        stopsOnly.forEach(pt => {
            const isDuplicate = uniqueLocations.some(u => haversineDistance(u.lat, u.lon, pt.lat, pt.lon) < 1.0);
            if (!isDuplicate) {
                uniqueLocations.push(pt);
            }
        });

        uniqueLocations.forEach(point => {
            const radius = uniqueLocations.length > 2 ? 1500 : (CONFIG.poi?.searchRadius || 2500);
            const scope = `(around:${radius},${point.lat.toFixed(6)},${point.lon.toFixed(6)})`;
            categories.forEach(category => {
                const statements = getQLStatementsForCategory(category, scope);
                statements.forEach(stmt => {
                    unionBlock += `  ${stmt}\n`;
                });
            });
        });
    }

    if (!unionBlock) return;

    const query = `
    [out:json][timeout:15];
    (
      ${unionBlock}
    );
    out body 100;
  `;

    // Try primary and fallback Overpass servers
    const servers = [
        CONFIG.overpass.url,
        'https://lz4.overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter'
    ];

    let success = false;
    let data = null;
    let errorDetails = null;

    for (const url of servers) {
        try {
            console.log(`Fetching POIs from: ${url}`);
            const response = await fetch(url, {
                method: 'POST',
                body: `data=${encodeURIComponent(query)}`
            });
            if (response.ok) {
                data = await response.json();
                success = true;
                break;
            } else {
                errorDetails = `HTTP ${response.status} ${response.statusText}`;
            }
        } catch (e) {
            console.warn(`Failed to fetch from ${url}, trying next server...`, e);
            errorDetails = e.message;
        }
    }

    if (success && data && data.elements) {
        // Track unique nodes to prevent duplicate markers
        const seenIds = new Set();
        data.elements.forEach(poi => {
            if (seenIds.has(poi.id)) return;
            seenIds.add(poi.id);

            const matchedCategory = getCategoryForElement(poi);
            if (matchedCategory) {
                createPOIMarker(poi, matchedCategory);
            }
        });
    } else {
        throw new Error(`All Overpass servers failed or timed out. Last error: ${errorDetails}`);
    }
}

// Helper to determine category from returned tags
function getCategoryForElement(element) {
    if (!element.tags) return null;
    for (const [category, poiType] of Object.entries(POI_TYPES)) {
        for (const tag of poiType.tags) {
            const [key, value] = tag.split('=');
            if (element.tags[key] === value) {
                return category;
            }
        }
    }
    return null;
}

// Helper to compile optimized QL statements using regex tag filters
function getQLStatementsForCategory(category, scope) {
    const statements = [];
    if (category === 'food') {
        statements.push(`node${scope}["amenity"~"restaurant|food_court"];`);
    } else if (category === 'cafe') {
        statements.push(`node${scope}["amenity"="cafe"];`);
    } else if (category === 'shop') {
        statements.push(`node${scope}["shop"~"supermarket|convenience|mall"];`);
    } else if (category === 'luxury') {
        statements.push(`node${scope}["leisure"="spa"];`);
        statements.push(`node${scope}["amenity"="spa"];`);
        statements.push(`node${scope}["tourism"="spa"];`);
    } else if (category === 'landmark') {
        statements.push(`node${scope}["historic"~"monument|memorial|castle"];`);
        statements.push(`node${scope}["tourism"="viewpoint"];`);
    } else if (category === 'nature') {
        statements.push(`node${scope}["leisure"="park"];`);
        statements.push(`node${scope}["tourism"~"camp_site|picnic_site"];`);
        statements.push(`node${scope}["natural"="beach"];`);
    } else if (category === 'nightlife') {
        statements.push(`node${scope}["amenity"~"pub|bar|nightclub"];`);
    } else if (category === 'adventure') {
        statements.push(`node${scope}["leisure"~"theme_park|playground"];`);
        statements.push(`node${scope}["tourism"="zoo"];`);
    } else if (category === 'hotel') {
        statements.push(`node${scope}["tourism"~"hotel|guest_house|hostel"];`);
    }
    return statements;
}

function generateSimulatedPOIs(searchPoints, categories) {
    // Determine the destination city name
    const lastStop = state.route.stops.length > 0 ? state.route.stops[state.route.stops.length - 1] : state.currentDestination;
    if (!lastStop) return;

    const destName = lastStop.name || "Destination";
    let city = "Generic";
    const nameLower = destName.toLowerCase();
    if (nameLower.includes("mumbai")) city = "Mumbai";
    else if (nameLower.includes("goa")) city = "Goa";
    else if (nameLower.includes("pune")) city = "Pune";
    else if (nameLower.includes("lonavala") || nameLower.includes("khandala")) city = "Lonavala";
    else if (nameLower.includes("jaipur")) city = "Jaipur";
    else if (nameLower.includes("udaipur")) city = "Udaipur";

    const mockDB = {
        "Mumbai": {
            "food": [
                { name: "Mahesh Lunch Home", tags: { cuisine: "Mangalorean Seafood", "addr:street": "Sir PM Road, Fort" } },
                { name: "Britannia & Co. Restaurant", tags: { cuisine: "Parsi / Iranian", "addr:street": "Sprott Road, Ballard Estate" } },
                { name: "Bademiya Street Food", tags: { cuisine: "Kebabs & Mughlai", "addr:street": "Tulloch Road, Colaba" } }
            ],
            "cafe": [
                { name: "Leopold Cafe", tags: { "addr:street": "Colaba Causeway" } },
                { name: "Sea Lounge - Taj Palace", tags: { "addr:street": "Apollo Bunder" } },
                { name: "Blue Tokai Coffee Roasters", tags: { "addr:street": "Kala Ghoda" } }
            ],
            "landmark": [
                { name: "Gateway of India", tags: { "addr:street": "Apollo Bunder" } },
                { name: "Chhatrapati Shivaji Maharaj Terminus", tags: { "addr:street": "Fort" } },
                { name: "Haji Ali Dargah", tags: { "addr:street": "Worli Coast" } }
            ],
            "nature": [
                { name: "Sanjay Gandhi National Park", tags: { "addr:street": "Borivali" } },
                { name: "Girgaon Chowpatty Beach", tags: { "addr:street": "Marine Drive" } }
            ],
            "nightlife": [
                { name: "Colaba Social", tags: { "addr:street": "Behind Taj Mahal Palace" } },
                { name: "TOTO's Garage Bar", tags: { "addr:street": "Pali Hill, Bandra" } }
            ],
            "adventure": [
                { name: "Hanging Gardens Play Park", tags: { "addr:street": "Malabar Hill" } }
            ],
            "hotel": [
                { name: "The Taj Mahal Palace", tags: { "addr:street": "Apollo Bunder" } },
                { name: "Trident Hotel Nariman Point", tags: { "addr:street": "Marine Drive" } }
            ]
        },
        "Goa": {
            "food": [
                { name: "Vinayak Family Restaurant", tags: { cuisine: "Goan Fish Thali", "addr:street": "Assagao" } },
                { name: "Gunpowder Restaurant", tags: { cuisine: "Peninsular Indian", "addr:street": "Anjuna Mapusa Road" } },
                { name: "The Fisherman's Wharf", tags: { cuisine: "Goan Seafood", "addr:street": "Mobor Beach, Cavelossim" } }
            ],
            "cafe": [
                { name: "Artjuna Cafe Anjuna", tags: { "addr:street": "Monster House, Anjuna" } },
                { name: "Baba Au Rhum Bakery", tags: { "addr:street": "Arpora" } }
            ],
            "landmark": [
                { name: "Fort Aguada", tags: { "addr:street": "Candolim" } },
                { name: "Basilica of Bom Jesus", tags: { "addr:street": "Old Goa" } },
                { name: "Chapora Fort Ruins", tags: { "addr:street": "Vagator" } }
            ],
            "nature": [
                { name: "Arambol Sweet Water Lake", tags: { "addr:street": "North Goa" } },
                { name: "Palolem Scenic Beach", tags: { "addr:street": "Canacona, South Goa" } },
                { name: "Dudhsagar Waterfalls", tags: { "addr:street": "Sanguem Taluk" } }
            ],
            "nightlife": [
                { name: "Tito's Nightclub Lane", tags: { "addr:street": "Baga" } },
                { name: "Joseph Bar", tags: { "addr:street": "Fontainhas, Panaji" } }
            ],
            "adventure": [
                { name: "Grand Island Scuba Center", tags: { "addr:street": "Vasco da Gama Coast" } }
            ],
            "hotel": [
                { name: "W Goa Luxury Resort", tags: { "addr:street": "Vagator Beach" } },
                { name: "Taj Exotica Resort & Spa", tags: { "addr:street": "Benaulim Beach" } }
            ]
        },
        "Pune": {
            "food": [
                { name: "Vaishali Restaurant", tags: { cuisine: "South Indian", "addr:street": "Fergusson College Road" } },
                { name: "Cafe Goodluck", tags: { cuisine: "Irani Bun Maska & Keema", "addr:street": "Deccan Gymkhana" } },
                { name: "SP's Biryani House", tags: { cuisine: "Sajuk Tup Biryani", "addr:street": "Sadashiv Peth" } }
            ],
            "cafe": [
                { name: "Kayani Bakery Cafe", tags: { "addr:street": "East Street, Camp" } },
                { name: "German Bakery", tags: { "addr:street": "Koregaon Park" } }
            ],
            "landmark": [
                { name: "Shaniwar Wada Palace", tags: { "addr:street": "Shaniwar Peth" } },
                { name: "Aga Khan Palace", tags: { "addr:street": "Nagar Road, Yerwada" } },
                { name: "Sinhagad Fort Gates", tags: { "addr:street": "Sinhagad Ghat Road" } }
            ],
            "nature": [
                { name: "Pune Okayama Friendship Garden", tags: { "addr:street": "Sinhagad Road" } },
                { name: "Vetal Tekdi Hilltop", tags: { "addr:street": "Kothrud" } }
            ],
            "nightlife": [
                { name: "High Spirits Cafe", tags: { "addr:street": "Koregaon Park" } },
                { name: "Toit Microbrewery", tags: { "addr:street": "NIBM Road" } }
            ],
            "adventure": [
                { name: "Kamshet Paragliding Fields", tags: { "addr:street": "Pune-Lonavala Road" } }
            ],
            "hotel": [
                { name: "JW Marriott Hotel Pune", tags: { "addr:street": "Senapati Bapat Road" } },
                { name: "The O Hotel Luxury Spa", tags: { "addr:street": "Koregaon Park" } }
            ]
        },
        "Lonavala": {
            "food": [
                { name: "Golden Chariot Restaurant", tags: { cuisine: "North Indian", "addr:street": "Old Mumbai Pune Highway" } },
                { name: "Maganlal Chikki Highway Hub", tags: { cuisine: "Snacks & Dessert", "addr:street": "Lonavala Bazaar" } }
            ],
            "cafe": [
                { name: "Cooper's Fudge Cafe", tags: { "addr:street": "Opposite Railway Station" } },
                { name: "Cafe 24", tags: { "addr:street": "Della Adventure Resort" } }
            ],
            "landmark": [
                { name: "Lohagad Fort Ruins", tags: { "addr:street": "Lohagad Trek Path" } },
                { name: "Karla Buddhist Caves", tags: { "addr:street": "Karli" } },
                { name: "Tiger's Leap Cliff", tags: { "addr:street": "Khandala" } }
            ],
            "nature": [
                { name: "Pawna Lake Viewpoint", tags: { "addr:street": "Thakursai Camp Area" } },
                { name: "Ryewood Valley Park", tags: { "addr:street": "Lonavala Center" } }
            ],
            "nightlife": [
                { name: "Tavern Bar Lounge", tags: { "addr:street": "Fariyas Resort, Khandala" } }
            ],
            "adventure": [
                { name: "Della Adventure Activity Park", tags: { "addr:street": "Kunegaon" } },
                { name: "Wet N Joy Waterpark", tags: { "addr:street": "Mundhawa" } }
            ],
            "hotel": [
                { name: "Fariyas Resort Lonavala", tags: { "addr:street": "Frichley Hills, Tungarli" } },
                { name: "The Machan Forest Resort", tags: { "addr:street": "Atvan" } }
            ]
        },
        "Jaipur": {
            "food": [
                { name: "Chokhi Dhani Ethnic Village", tags: { cuisine: "Rajasthani Thali", "addr:street": "Tonk Road" } },
                { name: "Rawat Mishtan Bhandar", tags: { cuisine: "Kachoris & Sweets", "addr:street": "Station Road" } },
                { name: "1135 AD Royal Restaurant", tags: { cuisine: "Mughlai & Rajputana", "addr:street": "Amber Fort Courtyard" } }
            ],
            "cafe": [
                { name: "Lassiwala Original", tags: { "addr:street": "MI Road" } },
                { name: "Wind View Cafe Hawa Mahal", tags: { "addr:street": "Opp. Hawa Mahal" } }
            ],
            "landmark": [
                { name: "Hawa Mahal (Palace of Winds)", tags: { "addr:street": "Badi Choupad" } },
                { name: "Amer Fort & Palace Gates", tags: { "addr:street": "Amer Road" } },
                { name: "City Palace & Museums", tags: { "addr:street": "Old City" } }
            ],
            "nature": [
                { name: "Jal Mahal Lake Gardens", tags: { "addr:street": "Man Sagar Lake" } },
                { name: "Central Park Jaipur", tags: { "addr:street": "C-Scheme" } }
            ],
            "nightlife": [
                { name: "Bar Palladio Lounge", tags: { "addr:street": "Narain Niwas Palace Hotel" } },
                { name: "Steam Restobar", tags: { "addr:street": "Rambagh Palace" } }
            ],
            "adventure": [
                { name: "Neemrana Flying Fox Zipline", tags: { "addr:street": "Jaipur Highway" } }
            ],
            "hotel": [
                { name: "Rambagh Palace Hotel", tags: { "addr:street": "Bhawani Singh Road" } },
                { name: "ITC Rajputana Luxury Stay", tags: { "addr:street": "Gopalbari" } }
            ]
        },
        "Udaipur": {
            "food": [
                { name: "Ambrai Lakeside Dining", tags: { cuisine: "Mewari / Continental", "addr:street": "Amet Haveli, Chandpole" } },
                { name: "Krishna Dal Bati House", tags: { cuisine: "Rajasthani Baati", "addr:street": "Jalmarg" } }
            ],
            "cafe": [
                { name: "Jheel's Ginger Coffee House", tags: { "addr:street": "Gangaur Ghat" } },
                { name: "Cafe Edelweiss", tags: { "addr:street": "Lal Ghat" } }
            ],
            "landmark": [
                { name: "City Palace Complex", tags: { "addr:street": "City Palace Road" } },
                { name: "Sajjangarh Monsoon Palace", tags: { "addr:street": "Sajjangarh Hill" } },
                { name: "Jagdish Temple Plaza", tags: { "addr:street": "Lal Ghat Road" } }
            ],
            "nature": [
                { name: "Lake Pichola Scenic Boat Ghat", tags: { "addr:street": "Pichola" } },
                { name: "Fateh Sagar Lakeside Walk", tags: { "addr:street": "Fatehsagar Road" } },
                { name: "Saheliyon-ki-Bari Gardens", tags: { "addr:street": "Saheli Marg" } }
            ],
            "nightlife": [
                { name: "Panera Bar Palace", tags: { "addr:street": "Taj Lake Palace" } }
            ],
            "adventure": [
                { name: "Mansapurna Karni Mata Ropeway", tags: { "addr:street": "Deen Dayal Park" } }
            ],
            "hotel": [
                { name: "Taj Lake Palace Luxury", tags: { "addr:street": "Lake Pichola Center" } },
                { name: "The Leela Palace Udaipur", tags: { "addr:street": "Udai Kothi" } }
            ]
        }
    };

    categories.forEach(category => {
        const cityData = mockDB[city];
        let items = [];

        if (cityData && cityData[category]) {
            items = cityData[category];
        } else {
            // Generate generic spots if city is unknown
            const catName = POI_TYPES[category]?.name || "Local Spot";
            items = [
                { name: `${city} Grand ${catName}`, tags: { "addr:street": `${city} Downtown Boulevard` } },
                { name: `Terrace Vista ${catName}`, tags: { "addr:street": `Lakeside Way` } }
            ];
        }

        items.forEach((item, index) => {
            const offsetLat = (Math.random() - 0.5) * 0.015;
            const offsetLon = (Math.random() - 0.5) * 0.015;
            
            const simulatedPoi = {
                id: `sim-${category}-${index}-${Date.now()}`,
                lat: lastStop.lat + offsetLat,
                lon: lastStop.lon + offsetLon,
                tags: {
                    name: item.name,
                    ...item.tags
                }
            };
            createPOIMarker(simulatedPoi, category);
        });
    });
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
        category, // Store category for filtering
        placeName: name // Store name for itinerary
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
    const style = state.selectedStyle || 'adventure';

    // Get only visible (budget-matching) POIs and use their real place names
    const visiblePois = state.markers.pois.filter(marker => {
        const markerBudget = marker.options.budget || 2;
        return markerBudget <= state.trip.budget;
    });

    const pois = visiblePois.map(marker => ({
        name: marker.options.placeName || 'Amazing Spot',
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

    // CURATED THEMATIC TRAILS SECTION (Unique & Different from Google Maps!)
    let trailTitle = "";
    let trailDesc = "";
    let trailStopsHTML = "";
    
    // Filter POIs for different curated trails
    const foodPois = pois.filter(p => p.category === 'food' || p.category === 'cafe');
    const activePois = pois.filter(p => p.category === 'adventure' || p.category === 'nature');
    const culturePois = pois.filter(p => p.category === 'landmark');
    const chillPois = pois.filter(p => p.category === 'luxury' || p.category === 'cafe' || p.category === 'nature');

    if (style === 'foodie' && foodPois.length > 0) {
        trailTitle = "Signature Gourmet Trail";
        trailDesc = "A curated culinary trail linking the finest local eateries and cozy cafés found along your route.";
        const spots = foodPois.slice(0, 3);
        spots.forEach((poi, index) => {
            const label = index === 0 ? "Morning Break" : index === 1 ? "Signature Lunch" : "Dinner Specialty";
            trailStopsHTML += `
                <div style="display: flex; align-items: center; gap: var(--space-sm); background: rgba(255, 255, 255, 0.03); padding: 8px 12px; border-radius: var(--border-radius-sm); border-left: 3px solid #f43f5e;">
                    <span style="font-size: 1.1rem;">${poi.icon}</span>
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 0.7rem; font-weight: 700; color: #f43f5e; text-transform: uppercase;">${label}</span>
                        <span style="font-size: 0.8rem; color: var(--text-primary); font-weight: 500;">${poi.name}</span>
                    </div>
                </div>
            `;
        });
    } else if (style === 'adventure' && activePois.length > 0) {
        trailTitle = "Wild Quest Trail";
        trailDesc = "An active, outdoor-focused trail traversing scenic nature spots and high-energy local attractions.";
        const spots = activePois.slice(0, 3);
        spots.forEach((poi, index) => {
            const label = index === 0 ? "Morning Trek" : index === 1 ? "Afternoon Action" : "Sunset View";
            trailStopsHTML += `
                <div style="display: flex; align-items: center; gap: var(--space-sm); background: rgba(255, 255, 255, 0.03); padding: 8px 12px; border-radius: var(--border-radius-sm); border-left: 3px solid #ec4899;">
                    <span style="font-size: 1.1rem;">${poi.icon}</span>
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 0.7rem; font-weight: 700; color: #ec4899; text-transform: uppercase;">${label}</span>
                        <span style="font-size: 0.8rem; color: var(--text-primary); font-weight: 500;">${poi.name}</span>
                    </div>
                </div>
            `;
        });
    } else if (style === 'cultural' && culturePois.length > 0) {
        trailTitle = "Chronicles Heritage Walk";
        trailDesc = "Immerse yourself in local history, heritage architecture, and monuments along your route.";
        const spots = culturePois.slice(0, 3);
        spots.forEach((poi, index) => {
            const label = index === 0 ? "Historical Highlight" : index === 1 ? "Architectural Wonder" : "Local Landmark";
            trailStopsHTML += `
                <div style="display: flex; align-items: center; gap: var(--space-sm); background: rgba(255, 255, 255, 0.03); padding: 8px 12px; border-radius: var(--border-radius-sm); border-left: 3px solid #6366f1;">
                    <span style="font-size: 1.1rem;">${poi.icon}</span>
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 0.7rem; font-weight: 700; color: #6366f1; text-transform: uppercase;">${label}</span>
                        <span style="font-size: 0.8rem; color: var(--text-primary); font-weight: 500;">${poi.name}</span>
                    </div>
                </div>
            `;
        });
    } else if (style === 'relaxed' && chillPois.length > 0) {
        trailTitle = "Mindful Slow Escape";
        trailDesc = "A peaceful route designed to avoid crowds, focusing on tranquil parks, wellness, and quiet breaks.";
        const spots = chillPois.slice(0, 3);
        spots.forEach((poi, index) => {
            const label = index === 0 ? "Serene Escape" : index === 1 ? "Cozy Retreat" : "Sunset View";
            trailStopsHTML += `
                <div style="display: flex; align-items: center; gap: var(--space-sm); background: rgba(255, 255, 255, 0.03); padding: 8px 12px; border-radius: var(--border-radius-sm); border-left: 3px solid #10b981;">
                    <span style="font-size: 1.1rem;">${poi.icon}</span>
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 0.7rem; font-weight: 700; color: #10b981; text-transform: uppercase;">${label}</span>
                        <span style="font-size: 0.8rem; color: var(--text-primary); font-weight: 500;">${poi.name}</span>
                    </div>
                </div>
            `;
        });
    } else if (pois.length > 0) {
        trailTitle = "Voyage Discovery Trail";
        trailDesc = "A handpicked combination of top-rated landmarks, parks, and cafes discovered along your route.";
        const spots = pois.slice(0, 3);
        spots.forEach((poi, index) => {
            const label = index === 0 ? "Explore First" : index === 1 ? "Local Favorite" : "Evening Rest";
            trailStopsHTML += `
                <div style="display: flex; align-items: center; gap: var(--space-sm); background: rgba(255, 255, 255, 0.03); padding: 8px 12px; border-radius: var(--border-radius-sm); border-left: 3px solid var(--accent);">
                    <span style="font-size: 1.1rem;">${poi.icon}</span>
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 0.7rem; font-weight: 700; color: var(--accent); text-transform: uppercase;">${label}</span>
                        <span style="font-size: 0.8rem; color: var(--text-primary); font-weight: 500;">${poi.name}</span>
                    </div>
                </div>
            `;
        });
    }

    if (trailTitle) {
        html += `
            <div class="curated-trail-card" style="
                background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.05));
                border: 1px solid rgba(99, 102, 241, 0.2);
                border-radius: var(--border-radius-md);
                padding: var(--space-md);
                margin-bottom: var(--space-lg);
                box-shadow: 0 4px 20px rgba(99, 102, 241, 0.1);
            ">
                <div style="
                    display: flex;
                    align-items: center;
                    gap: var(--space-sm);
                    margin-bottom: var(--space-xs);
                ">
                    <span style="font-size: 1.25rem;">✨</span>
                    <h4 style="margin: 0; color: var(--text-primary); font-size: 0.9rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                        ${trailTitle}
                    </h4>
                </div>
                <p style="
                    font-size: 0.75rem;
                    color: var(--text-secondary);
                    line-height: 1.4;
                    margin: 0 0 var(--space-sm) 0;
                ">
                    ${trailDesc}
                </p>
                <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
                    ${trailStopsHTML}
                </div>
            </div>
        `;
    }

    if (pois.length === 0) {
        html += '<div class="itinerary-empty">No places found matching your budget</div>';
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
// TRAVEL COST & AI RECOMMENDATIONS
// ========================================

function renderTravelCostsAndAIAdvice() {
    const costPanel = document.getElementById('cost-panel');
    const costContent = document.getElementById('cost-content');
    const aiCard = document.getElementById('ai-recommendation-card');
    const aiContent = document.getElementById('ai-recommendation-content');

    if (!costPanel || !costContent || !aiCard || !aiContent) return;

    const distance = state.route.actualDistance || calculateRouteDistance() || 0;
    const budget = state.trip.budget || 25000;
    const style = state.selectedStyle || 'adventure';

    // Show panels
    aiCard.style.display = 'block';

    if (state.route.stops.length >= 2 && distance > 0) {
        costPanel.style.display = 'block';

        // CAR ESTIMATES
        const carFuel = Math.round(distance * 9.5);
        const carToll = Math.round(distance * 1.5);
        const carCost = carFuel + carToll;
        const carDurationHours = state.route.actualDuration ? (state.route.actualDuration / 3600) : (distance / 65);
        const carPercent = Math.round((carCost / budget) * 100);
        const carDisplayPercent = Math.max(1, Math.min(100, carPercent));

        // TRAIN ESTIMATES
        const trainSL = Math.round(120 + distance * 1.1);
        const train3AC = Math.round(380 + distance * 2.8);
        const trainCost = budget < 12000 ? trainSL : train3AC;
        const trainDurationHours = (distance / 50) + 1;
        const trainPercent = Math.round((trainCost / budget) * 100);
        const trainDisplayPercent = Math.max(1, Math.min(100, trainPercent));

        // BUS ESTIMATES
        const busCost = Math.round(180 + distance * 3.2);
        const busDurationHours = (distance / 45) + 0.5;
        const busPercent = Math.round((busCost / budget) * 100);
        const busDisplayPercent = Math.max(1, Math.min(100, busPercent));

        // FLIGHT ESTIMATES
        const hasFlight = distance >= 250;
        const flightCost = hasFlight ? Math.round(3200 + distance * 5.5) : 0;
        const flightDurationHours = hasFlight ? (1.5 + distance / 650) : 0;
        const flightPercent = hasFlight ? Math.round((flightCost / budget) * 100) : 0;
        const flightDisplayPercent = Math.max(1, Math.min(100, flightPercent));

        // Formatter helpers
        const formatINR = (val) => '₹' + Math.round(val).toLocaleString('en-IN');
        const formatDuration = (hours) => {
            const h = Math.floor(hours);
            const m = Math.round((hours - h) * 60);
            if (h === 0) return `${m}m`;
            return `${h}h ${m}m`;
        };

        const getMeterClass = (pct) => {
            if (pct > 100) return 'danger';
            if (pct > 70) return 'warning';
            return '';
        };

        costContent.innerHTML = `
            <div class="transit-card">
                <div class="transit-header">
                    <div class="transit-type">
                        <span class="transit-icon">🚗</span>
                        <span class="transit-name">Self Drive / Cab</span>
                    </div>
                    <span class="transit-time">${formatDuration(carDurationHours)}</span>
                    <span class="transit-cost">${formatINR(carCost)}</span>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: -4px;">
                    Fuel: ${formatINR(carFuel)} | Tolls: ${formatINR(carToll)}
                </div>
                <div class="transit-meter">
                    <div class="transit-meter-fill ${getMeterClass(carPercent)}" style="width: ${carDisplayPercent}%;"></div>
                </div>
            </div>

            <div class="transit-card">
                <div class="transit-header">
                    <div class="transit-type">
                        <span class="transit-icon">🚂</span>
                        <span class="transit-name">Indian Railways</span>
                    </div>
                    <span class="transit-time">${formatDuration(trainDurationHours)}</span>
                    <span class="transit-cost">${formatINR(trainCost)}</span>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: -4px;">
                    Sleeper: ${formatINR(trainSL)} | 3AC: ${formatINR(train3AC)}
                </div>
                <div class="transit-meter">
                    <div class="transit-meter-fill ${getMeterClass(trainPercent)}" style="width: ${trainDisplayPercent}%;"></div>
                </div>
            </div>

            <div class="transit-card">
                <div class="transit-header">
                    <div class="transit-type">
                        <span class="transit-icon">🚌</span>
                        <span class="transit-name">Intercity Bus</span>
                    </div>
                    <span class="transit-time">${formatDuration(busDurationHours)}</span>
                    <span class="transit-cost">${formatINR(busCost)}</span>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: -4px;">
                    AC Sleeper Seat / Luxury Multi-Axle
                </div>
                <div class="transit-meter">
                    <div class="transit-meter-fill ${getMeterClass(busPercent)}" style="width: ${busDisplayPercent}%;"></div>
                </div>
            </div>

            <div class="transit-card" style="${!hasFlight ? 'opacity: 0.5; pointer-events: none;' : ''}">
                <div class="transit-header">
                    <div class="transit-type">
                        <span class="transit-icon">✈️</span>
                        <span class="transit-name">Commercial Flight</span>
                    </div>
                    ${hasFlight ? `
                        <span class="transit-time">${formatDuration(flightDurationHours)}</span>
                        <span class="transit-cost">${formatINR(flightCost)}</span>
                    ` : `
                        <span class="transit-time">N/A</span>
                        <span class="transit-cost">--</span>
                    `}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: -4px;">
                    ${hasFlight ? 'Economy Class flight' : 'Not recommended (Distance &lt; 250 km)'}
                </div>
                ${hasFlight ? `
                    <div class="transit-meter">
                        <div class="transit-meter-fill ${getMeterClass(flightPercent)}" style="width: ${flightDisplayPercent}%;"></div>
                    </div>
                ` : ''}
            </div>
        `;
    } else {
        // Only 1 stop, or no stops
        costPanel.style.display = 'none';
        costContent.innerHTML = '';
    }

    // AI ADVICE GENERATION
    // Determine the destination city name
    const lastStop = state.route.stops.length > 0 ? state.route.stops[state.route.stops.length - 1] : state.currentDestination;
    const destName = lastStop ? (lastStop.name || "") : "";
    let city = "";
    const nameLower = destName.toLowerCase();
    if (nameLower.includes("mumbai")) city = "Mumbai";
    else if (nameLower.includes("goa")) city = "Goa";
    else if (nameLower.includes("pune")) city = "Pune";
    else if (nameLower.includes("lonavala") || nameLower.includes("khandala")) city = "Lonavala";
    else if (nameLower.includes("jaipur")) city = "Jaipur";
    else if (nameLower.includes("udaipur")) city = "Udaipur";

    // Build specific tips based on City & Style, or fallback to Style
    let routeAdvice = "";
    let spotlightTitle = "";
    let spotlightAdvice = "";
    let savingAdvice = "";

    // 1. Route Advice
    if (city === "Mumbai") {
        routeAdvice = "Mumbai traffic can be intense. We recommend using local trains for north-south travel or booking a cab via the Bandra-Worli Sea Link to bypass congestion during peak hours.";
    } else if (city === "Goa") {
        routeAdvice = "Rent a scooter or car at the airport/station for the best Goa experience. Taxis are expensive and don't use meters. Avoid driving late on narrow unlit rural roads.";
    } else if (city === "Pune") {
        routeAdvice = "If driving from Mumbai, the Expressway route is beautiful. Within the city, use auto-rickshaws or rent a self-drive scooter to navigate Old Pune's narrow lanes.";
    } else if (city === "Lonavala") {
        routeAdvice = "Expect heavy fog and bumper-to-bumper traffic on weekends, especially during monsoons. Start early (by 6 AM) to enjoy the ghats peacefully.";
    } else if (city === "Jaipur") {
        routeAdvice = "Use e-rickshaws for short travel within the walled Pink City. For Amer Fort, hire an official guide at the main gate to bypass long ticketing and entry queues.";
    } else if (city === "Udaipur") {
        routeAdvice = "The old city lanes surrounding Lake Pichola are extremely narrow. Avoid taking cars there; walking, auto-rickshaws, or two-wheelers are your best options.";
    } else {
        // Generic fallback by Style
        if (style === 'adventure') {
            routeAdvice = "Adventure routes often feature rugged terrain. Ensure your vehicle has decent ground clearance, keep offline maps downloaded, and carry an emergency tire inflator.";
        } else if (style === 'relaxed') {
            routeAdvice = "Plan a relaxed pace with structured 20-minute rest breaks for every 2 hours of driving. Look for scenic bypasses instead of busy expressways.";
        } else if (style === 'cultural') {
            routeAdvice = "Look out for historic transit links, such as local passenger ferries or vintage toy trains, which offer an authentic cultural introduction to the region.";
        } else { // foodie
            routeAdvice = "Map your itinerary around iconic highway dhabas and historical street vendors. Avoid generic highway food courts to get the real local flavor.";
        }
    }

    // 2. Spotlight Tips (City + Style match)
    if (city === "Mumbai") {
        if (style === 'foodie') {
            spotlightTitle = "🍕 Foodie Spotlight: Coastal & Street Eats";
            spotlightAdvice = "Indulge in fresh butter-pepper-garlic crab at Mahesh Lunch Home, classic Keema Pav at Britannia & Co., and spicy Vada Pav opposite Mithibai College.";
        } else if (style === 'adventure') {
            spotlightTitle = "🧗 Adventure Spotlight: City Treks";
            spotlightAdvice = "Rent a cycle in the early morning to explore Sanjay Gandhi National Park, or try sea kayaking at the Gateway of India during sunrise.";
        } else if (style === 'cultural') {
            spotlightTitle = "🎨 Cultural Spotlight: Heritage & Architecture";
            spotlightAdvice = "Take a walking tour of the Gothic Revival structures in Fort, visit the Dr. Bhau Daji Lad Museum, and catch the evening prayers at Haji Ali Dargah.";
        } else { // relaxed
            spotlightTitle = "🏖️ Relaxed Spotlight: Sunset & Sea Breeze";
            spotlightAdvice = "Spend a peaceful evening sitting at Marine Drive, enjoy high tea at the Taj Mahal Palace Hotel, or take a ferry to the quiet Elephanta Caves.";
        }
    } else if (city === "Goa") {
        if (style === 'foodie') {
            spotlightTitle = "🍕 Foodie Spotlight: Goan Shacks & Spice";
            spotlightAdvice = "Savor authentic Goan fish thali at Vinayak Family Restaurant in Assagao, try modern fusion at Gunpowder, and sip local Feni at Joseph Bar.";
        } else if (style === 'adventure') {
            spotlightTitle = "🧗 Adventure Spotlight: Waterfalls & Reefs";
            spotlightAdvice = "Go scuba diving at Grand Island, try windsurfing at Baga beach, or hike through Bhagwan Mahavir Sanctuary to the majestic Dudhsagar Falls.";
        } else if (style === 'cultural') {
            spotlightTitle = "🎨 Cultural Spotlight: Portuguese Heritage";
            spotlightAdvice = "Wander through the colorful Latin Quarter of Fontainhas in Panaji, explore Old Goa's Basilica of Bom Jesus, and tour a Sahakari Spice Farm.";
        } else { // relaxed
            spotlightTitle = "🏖️ Relaxed Spotlight: Serene Beaches";
            spotlightAdvice = "Lounge on the quiet sands of Mandrem or Patnem beach, book an Ayurvedic massage, and watch the sunset from the ramparts of Cabo de Rama fort.";
        }
    } else if (city === "Pune") {
        if (style === 'foodie') {
            spotlightTitle = "🍕 Foodie Spotlight: Bakeries & Irani Cafes";
            spotlightAdvice = "Grab warm Shrewsbury biscuits from Kayani Bakery, try Bun Maska and tea at Cafe Goodluck, and order a classic SPDP at Vaishali on FC Road.";
        } else if (style === 'adventure') {
            spotlightTitle = "🧗 Adventure Spotlight: Fort Treks & Flights";
            spotlightAdvice = "Trek up Sinhagad Fort early in the morning for hot pitla-bhakri, or book a weekend paragliding session in nearby Kamshet.";
        } else if (style === 'cultural') {
            spotlightTitle = "🎨 Cultural Spotlight: Maratha History";
            spotlightAdvice = "Explore the historic Shaniwar Wada ruins, visit the majestic Aga Khan Palace, and see the Peshwa relics at the Raja Dinkar Kelkar Museum.";
        } else { // relaxed
            spotlightTitle = "🏖️ Relaxed Spotlight: Parks & Zen Gardens";
            spotlightAdvice = "Spend a quiet afternoon walking in the Pune Okayama Friendship Garden or enjoy a meditation session at the Osho International Meditation Resort.";
        }
    } else if (city === "Lonavala") {
        if (style === 'foodie') {
            spotlightTitle = "🍕 Foodie Spotlight: Fudge & Hot Pakodas";
            spotlightAdvice = "Buy fresh chocolate walnut fudge at Cooper's, hot corn pakodas at Tiger Point, and traditional peanut chikki from Maganlal.";
        } else if (style === 'adventure') {
            spotlightTitle = "🧗 Adventure Spotlight: Valley Hikes & Caves";
            spotlightAdvice = "Hike up to Lohagad Fort, climb the rock cut stairs at Bhaja Caves, or attempt the Duke's Nose rappelling trek.";
        } else if (style === 'cultural') {
            spotlightTitle = "🎨 Cultural Spotlight: Ancient Cave Temples";
            spotlightAdvice = "Explore the Karla Buddhist Caves dating back to the 2nd century BC, featuring the largest Hinayana chaityagriha in India.";
        } else { // relaxed
            spotlightTitle = "🏖️ Relaxed Spotlight: Lakeside Camping";
            spotlightAdvice = "Pitch a lakeside tent at Pawna Lake, enjoy a barbecue under the stars, or book a luxury spa villa overlooking Valvan Lake.";
        }
    } else if (city === "Jaipur") {
        if (style === 'foodie') {
            spotlightTitle = "🍕 Foodie Spotlight: Royal Thali & Street Bites";
            spotlightAdvice = "Dine at Chokhi Dhani for an immersive Rajasthani thali, grab spicy Pyaz Kachori at Rawat Mishtan Bhandar, and drink creamy sweet lassi from Lassiwala.";
        } else if (style === 'adventure') {
            spotlightTitle = "🧗 Adventure Spotlight: Ballooning & Zips";
            spotlightAdvice = "Book a hot air balloon flight over Amer Fort at sunrise, or go zip-lining over the valleys of Neemrana Fort.";
        } else if (style === 'cultural') {
            spotlightTitle = "🎨 Cultural Spotlight: Palace Marvels";
            spotlightAdvice = "Explore the cosmic instruments at Jantar Mantar, photograph the facade of Hawa Mahal, and admire the mirror-work at Sheesh Mahal in Amer.";
        } else { // relaxed
            spotlightTitle = "🏖️ Relaxed Spotlight: Courtyard High Tea";
            spotlightAdvice = "Sip royalty-themed cocktails at Bar Palladio, walk around the peaceful gardens of Sisodia Rani Palace, and enjoy folk music at Albert Hall Museum.";
        }
    } else if (city === "Udaipur") {
        if (style === 'foodie') {
            spotlightTitle = "🍕 Foodie Spotlight: Mewari Culinary Secrets";
            spotlightAdvice = "Try the tender Lal Maas at Ambrai overlooking the lake, enjoy local Dal Baati Churma at Krishna Dal Bati, and have cold coffee at Fatehsagar lake.";
        } else if (style === 'adventure') {
            spotlightTitle = "🧗 Adventure Spotlight: Hill Climbs & Boating";
            spotlightAdvice = "Take a speed boat ride around Lake Pichola, ride the ropeway to Karni Mata temple, or hike up to the Monsoon Palace (Sajjangarh) at sunset.";
        } else if (style === 'cultural') {
            spotlightTitle = "🎨 Cultural Spotlight: Haveli Puppet Shows";
            spotlightAdvice = "Attend the evening Dharohar folk dance and puppet show at Bagore-ki-Haveli, and admire the detailed stone carvings of Jagdish Temple.";
        } else { // relaxed
            spotlightTitle = "🏖️ Relaxed Spotlight: Lake-View Leisure";
            spotlightAdvice = "Stroll through the fountains of Saheliyon-ki-Bari, read a book at a lakeside cafe, or take a vintage car ride around the City Palace grounds.";
        }
    } else {
        // Fallback by Style only
        if (style === 'foodie') {
            spotlightTitle = "🍕 Foodie Spotlight: Local Food Trails";
            spotlightAdvice = "Ask locals where they get breakfast! Prioritize heritage eateries, family-run cafes, and high-rated street vendors over standard hotel buffets.";
        } else if (style === 'adventure') {
            spotlightTitle = "🧗 Adventure Spotlight: Active Exploring";
            spotlightAdvice = "Search for local trailheads, outdoor recreational parks, and natural viewpoints. Check weather patterns to ensure safe hiking.";
        } else if (style === 'cultural') {
            spotlightTitle = "🎨 Cultural Spotlight: Artisan Markets & History";
            spotlightAdvice = "Visit the local government museum or artisan handicraft market. Hiring a certified local guide can double your appreciation of historic monuments.";
        } else { // relaxed
            spotlightTitle = "🏖️ Relaxed Spotlight: Scenic Leisure";
            spotlightAdvice = "Keep your itinerary simple. Focus on one major attraction in the morning, followed by a quiet afternoon at a park, lake, or wellness café.";
        }
    }

    // 3. Saving Advice (based on budget limit)
    if (budget < 12000) {
        savingAdvice = `With a budget of ${formatINR(budget)}, maximize savings by traveling via Train Sleeper class or public AC buses. Stay in highly-rated hostels, eat street food (hygienic options), and look for student or group discounts for monument tickets.`;
    } else if (budget >= 12000 && budget < 25000) {
        savingAdvice = `A budget of ${formatINR(budget)} is perfect for a balanced trip. Renting a shared car or booking 3AC trains will keep you comfortable. Consider booking boutique homestays or mid-range hotels online in advance to capture early-bird deals.`;
    } else {
        savingAdvice = `Your premium budget of ${formatINR(budget)} allows for maximum luxury. Consider booking direct flights or private cabs for convenient transit. Indulge in heritage luxury resorts, fine-dining food walks, and exclusive curated day-tours.`;
    }

    // Output AI Advice HTML
    aiContent.innerHTML = `
        <div class="ai-block route">
            <div class="ai-block-title">🧭 Local Route Insights</div>
            <div class="ai-block-text">${routeAdvice}</div>
        </div>
        <div class="ai-block spotlight">
            <div class="ai-block-title">${spotlightTitle}</div>
            <div class="ai-block-text">${spotlightAdvice}</div>
        </div>
        <div class="ai-block saving">
            <div class="ai-block-title">💰 Smart Saving Tips</div>
            <div class="ai-block-text">${savingAdvice}</div>
        </div>
    `;
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
