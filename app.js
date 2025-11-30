// ------------------------------------
// --- LÓGICA DEL MAPA ---
// ------------------------------------

// --- 1. Inicialización del Mapa ---
const mapCenter = [16.7569, -93.1297];
const defaultZoom = 14;

const map = L.map('map', {
    zoomControl: false 
}).setView(mapCenter, defaultZoom);


// --- 1.5. Control Personalizado de Zoom y Reset ---
function createButton(html, title, className, container, fn, context) {
    const link = L.DomUtil.create('a', className, container);
    link.innerHTML = html;
    link.href = '#';
    link.title = title;
    link.role = 'button';
    link.setAttribute('aria-label', title);

    L.DomEvent.on(link, 'click', L.DomEvent.stop)
              .on(link, 'click', fn, context)
              .on(link, 'click', L.DomEvent.preventDefault);
    return link;
}

L.Control.CustomButtons = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar custom-control-container');
        L.DomEvent.disableClickPropagation(container);

        createButton('+', 'Acercar', 'custom-zoom-in', container, function() { this.zoomIn(); }, map);
        createButton('-', 'Alejar', 'custom-zoom-out', container, function() { this.zoomOut(); }, map);
        
        const resetHtml = '<i class="bi bi-house-fill"></i>';
        createButton(resetHtml, 'Restablecer Vista', 'custom-reset-view', container, function() {
            this.setView(mapCenter, defaultZoom);
        }, map);

        return container;
    }
});

new L.Control.CustomButtons().addTo(map);


// --- 1.8. Branding Institucional (Marca de Agua) ---
L.Control.Watermark = L.Control.extend({
    onAdd: function(map) {
        var img = L.DomUtil.create('img', 'branding-watermark');
        // Usamos el nombre exacto de tu archivo
        img.src = 'vectores branding_1.png'; 
        img.alt = 'Logotipo Oficial';
        return img;
    },
    onRemove: function(map) { }
});

L.control.watermark = function(opts) {
    return new L.Control.Watermark(opts);
}

// Lo añadimos a la esquina inferior izquierda
L.control.watermark({ position: 'bottomleft' }).addTo(map);


// --- 2. Capas Base (Basemaps) y Control de Capas ---

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
});

const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution: 'Tiles &copy; Esri'
});

const baseMaps = {
    "Mapa Callejero": osm,
    "Vista Satelital": satellite
};

L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
osm.addTo(map);


// --- 3. Conexión a Supabase ---
let supabaseClient;
try {
    const SUPABASE_URL = 'https://ulmweagltluaeqfihtqj.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsbXdlYWdsdGx1YWVxZmlodHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0Mjc0NzIsImV4cCI6MjA3NTAwMzQ3Mn0.-JbIFHtIDokywpnvCQLGwMw5RFDgR6hA3jeAg7mbFRk';
    
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('Cliente de Supabase inicializado.');
} catch (e) {
    console.error('Error inicializando Supabase.', e);
}

// --- 4. Definición de Capas (Layer Groups) ---
const comedoresLayer = L.layerGroup();
const jornadasLayer = L.layerGroup();
const humanismoContigoLayer = L.layerGroup();
const mercadosLayer = L.layerGroup();
const coloniasLayer = L.layerGroup();

// --- 5. UI - Control de Capas ---
document.getElementById('check-comedores').addEventListener('change', function() {
    if (this.checked) map.addLayer(comedoresLayer); else map.removeLayer(comedoresLayer);
});
document.getElementById('check-jornadas').addEventListener('change', function() {
    if (this.checked) map.addLayer(jornadasLayer); else map.removeLayer(jornadasLayer);
});
document.getElementById('check-humanismo-contigo').addEventListener('change', function() {
    if (this.checked) map.addLayer(humanismoContigoLayer); else map.removeLayer(humanismoContigoLayer);
});
document.getElementById('check-mercados').addEventListener('change', function() {
    if (this.checked) map.addLayer(mercadosLayer); else map.removeLayer(mercadosLayer);
});
document.getElementById('check-colonias').addEventListener('change', function() {
    if (this.checked) map.addLayer(coloniasLayer); else map.removeLayer(coloniasLayer);
});


// --- 5.8. UI - Búsqueda por Coordenadas ---
let searchMarker = null; 
const searchIcon = L.divIcon({
    html: '<i class="bi bi-geo-alt-fill"></i>',
    className: 'search-marker-icon',
    iconSize: [30, 30],
    iconAnchor: [15, 30]
});

document.getElementById('search-coord-btn').addEventListener('click', function() {
    const input = document.getElementById('coord-input');
    const value = input.value.trim();
    const parts = value.split(',');

    if (parts.length !== 2) { alert("Formato: Latitud, Longitud"); return; }
    
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    
    if (isNaN(lat) || isNaN(lng)) { alert("Coordenadas inválidas."); return; }
    
    const coords = [lat, lng];
    if (searchMarker) map.removeLayer(searchMarker);
    searchMarker = L.marker(coords, { icon: searchIcon }).addTo(map);
    map.flyTo(coords, 17);
});

document.getElementById('clear-coord-btn').addEventListener('click', function() {
    document.getElementById('coord-input').value = '';
    if (searchMarker) { map.removeLayer(searchMarker); searchMarker = null; }
});


// --- 6. Funciones de Carga de Datos (PostGIS/GeoJSON) ---

function onEachFeature(feature, layer) {
    if (!feature.properties) { return; }
    const props = feature.properties;
    let popupContent = '<div class="popup-content">'; 

    if (props.Nombre) popupContent += `<div class="popup-header">${props.Nombre}</div>`;
    popupContent += '<div class="popup-body">';
    for (const key in props) {
        if (key !== 'Nombre' && props[key]) {
            popupContent += `<div class="popup-row"><strong>${key}:</strong><span>${props[key]}</span></div>`;
        }
    }
    popupContent += '</div></div>';
    layer.bindPopup(popupContent);
}

const estiloColonias = { "color": "#ff7800", "weight": 2, "opacity": 0.65 };

// --- Funciones asíncronas de carga ---
function createIcon(html, className, colorClass) {
    return L.divIcon({
        html: html,
        className: className,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
}

(async function cargarComedores() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient.rpc('get_comedores_geojson');
    if (!error && data && data[0].geojson) {
        L.geoJSON(data[0].geojson, {
            onEachFeature: onEachFeature,
            pointToLayer: (f, latlng) => L.marker(latlng, { icon: createIcon('<i class="bi bi-cup-straw"></i>', 'icono-mapa-comedor') })
        }).addTo(comedoresLayer);
    }
})();

(async function cargarJornadas() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient.rpc('get_jornadas_geojson');
    if (!error && data && data[0].geojson) {
        L.geoJSON(data[0].geojson, { 
            onEachFeature: onEachFeature,
            pointToLayer: (f, latlng) => L.marker(latlng, { icon: createIcon('<i class="bi bi-people-fill"></i>', 'icono-mapa-jornadas') })
        }).addTo(jornadasLayer);
    }
})();

(async function cargarHumanismoContigo() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient.rpc('get_humanismo_contigo_geojson');
    if (!error && data && data[0].geojson) {
        L.geoJSON(data[0].geojson, { 
            onEachFeature: onEachFeature,
            pointToLayer: (f, latlng) => L.marker(latlng, { icon: createIcon('<i class="bi bi-heart-fill"></i>', 'icono-mapa-humanismo') })
        }).addTo(humanismoContigoLayer);
    }
})();

(async function cargarMercados() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient.rpc('get_mercados_geojson');
    if (!error && data && data[0].geojson) {
        L.geoJSON(data[0].geojson, { 
            onEachFeature: onEachFeature,
            pointToLayer: (f, latlng) => L.marker(latlng, { icon: createIcon('<i class="bi bi-shop"></i>', 'icono-mapa-mercados') })
        }).addTo(mercadosLayer);
    }
})();

(async function cargarColonias() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient.rpc('get_colonias_geojson');
    if (!error && data && data[0].geojson) {
        L.geoJSON(data[0].geojson, {
            style: estiloColonias,
            onEachFeature: onEachFeature
        }).addTo(coloniasLayer);
    }
})();


// ------------------------------------
// --- 7. Configuración del Tour Guiado (Intro.js) ---
// ------------------------------------

document.getElementById('start-tour-btn').addEventListener('click', function() {
    
    // Si la pantalla es pequeña (celular), cerramos el menú sidebar si está abierto
    // para que no estorbe el tour inicial
    const sidebarElement = document.getElementById('sidebar');
    const bsOffcanvas = bootstrap.Offcanvas.getInstance(sidebarElement);
    if (bsOffcanvas) { bsOffcanvas.hide(); }

    introJs().setOptions({
        nextLabel: 'Siguiente',
        prevLabel: 'Atrás',
        doneLabel: '¡Entendido!',
        showProgress: true,
        steps: [
            {
                title: 'Bienvenido',
                intro: 'Este es el <b>Geoportal "Humanismo que Transforma"</b>. Aquí podrás consultar la ubicación de los programas sociales en Chiapas.',
            },
            {
                element: '#sidebar-toggle-btn', // Apunta al botón hamburguesa
                title: 'Menú de Capas',
                intro: 'Haz clic aquí para desplegar el panel donde puedes activar o desactivar las capas de información (Comedores, Jornadas, etc.) y buscar coordenadas.',
                position: 'bottom'
            },
            {
                element: '.leaflet-control-layers', // Apunta al control de mapas base
                title: 'Mapa Base',
                intro: 'Aquí puedes cambiar entre la vista de mapa callejero y la vista satelital.',
                position: 'left'
            },
            {
                element: '.custom-control-container', // Apunta a botones zoom
                title: 'Navegación',
                intro: 'Usa estos botones para acercar (+), alejar (-) o regresar a la vista inicial de Chiapas.',
                position: 'left'
            },
            {
                element: '.branding-watermark', // Apunta al logo
                title: 'Información Oficial',
                intro: 'Geoportal oficial de la Secretaría del Humanismo - Gobierno de Chiapas.',
                position: 'top'
            }
        ]
    }).start();
});