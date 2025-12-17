// ==========================================
// 1. CONFIGURACIÓN SUPABASE
// ==========================================
const SUPABASE_URL = 'https://ulmweagltluaeqfihtqj.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsbXdlYWdsdGx1YWVxZmlodHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0Mjc0NzIsImV4cCI6MjA3NTAwMzQ3Mn0.-JbIFHtIDokywpnvCQLGwMw5RFDgR6hA3jeAg7mbFRk';

// Variable 'client' para evitar conflictos con la librería global
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let globalData = [];

// ==========================================
// 2. CONFIGURACIÓN DEL MAPA
// ==========================================
const MEXICO_CENTER = [23.6345, -102.5528]; 
const MEXICO_ZOOM = 5; 

const map = L.map('map', { zoomControl: false }).setView(MEXICO_CENTER, MEXICO_ZOOM); 

// Capas
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' });
const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' });
const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' });

osm.addTo(map);
L.control.layers({ "Callejero": osm, "Satélite": satelite, "Modo Oscuro": cartoDark }, null, { position: 'topright' }).addTo(map);

// ==========================================
// 3. CONTROLES DEL MAPA (Zoom, Reset, Tour)
// ==========================================

// 1. Zoom (se añade explícitamente para que Driver.js lo encuentre fácil)
L.control.zoom({ position: 'bottomright' }).addTo(map);

// 2. Botón de Ayuda / Tour
L.Control.Tour = L.Control.extend({
    onAdd: function(map) {
        var div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        div.innerHTML = '<a href="#" id="btnHelp" title="Ayuda / Tour" role="button" style="font-size: 1.2rem;">?</a>';
        div.onclick = function(e) { 
            e.stopPropagation(); e.preventDefault(); 
            startTour(); 
        };
        return div;
    }
});
new L.Control.Tour({ position: 'bottomright' }).addTo(map);

// 3. Botón Home (Reset Vista)
L.Control.ResetView = L.Control.extend({
    onAdd: function(map) {
        var div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-reset');
        div.innerHTML = '<a href="#" id="btnResetView" title="Vista General" role="button">🏠</a>';
        div.onclick = function(e) { 
            e.stopPropagation(); e.preventDefault(); 
            map.setView(MEXICO_CENTER, MEXICO_ZOOM); 
        };
        return div;
    }
});
new L.Control.ResetView({ position: 'bottomright' }).addTo(map);

// ==========================================
// 4. ICONOS Y LEYENDA
// ==========================================
const goldIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

const legend = L.control({ position: 'bottomleft' }); 
legend.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'info legend');
    div.innerHTML = `
        <div class="legend-item"><img src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png" class="legend-icon"><span>Tu Ubicación</span></div>
        <div class="legend-item"><img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png" class="legend-icon"><span>Colega Registrado</span></div>
    `;
    return div;
};
legend.addTo(map);

const markersLayer = L.featureGroup().addTo(map);

// ==========================================
// 5. FUNCIONES AUXILIARES (PostGIS)
// ==========================================
function parsePostGISHex(hex) {
    if (!hex || typeof hex !== 'string' || hex.length < 50) return null;
    try {
        const buffer = new Uint8Array(hex.match(/[\da-f]{2}/gi).map(h => parseInt(h, 16))).buffer;
        const view = new DataView(buffer);
        const littleEndian = view.getUint8(0) === 1;
        const lng = view.getFloat64(9, littleEndian);
        const lat = view.getFloat64(17, littleEndian);
        return { lat, lng };
    } catch (e) { console.error(e); return null; }
}

function processCoordinates(rawLoc) {
    let coords = null;
    if (typeof rawLoc === 'string' && rawLoc.indexOf('010100') === 0) coords = parsePostGISHex(rawLoc);
    else if (typeof rawLoc === 'string' && rawLoc.includes('POINT')) {
        const match = rawLoc.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
        if (match) coords = { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
    }
    else if (typeof rawLoc === 'object' && rawLoc.coordinates) coords = { lng: rawLoc.coordinates[0], lat: rawLoc.coordinates[1] };
    return coords;
}

function addMarkerToMap(egresado) {
    const coords = processCoordinates(egresado.location || egresado.location_wkt);
    if (coords && !isNaN(coords.lat) && !isNaN(coords.lng)) {
        let tagsHtml = '';
        if(egresado.esp_cartografia) tagsHtml += `<span class="popup-tag">🗺️ Cartografía</span>`;
        if(egresado.esp_fotogrametria) tagsHtml += `<span class="popup-tag">✈️ Fotogrametría</span>`;
        if(egresado.esp_topografia) tagsHtml += `<span class="popup-tag">📐 Topografía</span>`;
        if(egresado.esp_geodesia) tagsHtml += `<span class="popup-tag">🌐 Geodesia</span>`;
        if(egresado.esp_drones) tagsHtml += `<span class="popup-tag">🚁 Drones</span>`;
        if(egresado.esp_desarrollo) tagsHtml += `<span class="popup-tag">💻 SIG/Dev</span>`;
        if(egresado.esp_otro_texto) tagsHtml += `<span class="popup-tag">🔹 ${egresado.esp_otro_texto}</span>`;

        let descHtml = egresado.descripcion_servicios ? `<div class="popup-desc">"${egresado.descripcion_servicios}"</div>` : '';
        let contactHtml = egresado.contacto_url ? `<a href="${egresado.contacto_url.startsWith('http') ? egresado.contacto_url : 'https://' + egresado.contacto_url}" target="_blank" class="btn-popup-contact">🔗 Ver Perfil</a>` : '';

        const popupHTML = `
            <div class="popup-card">
                <div class="popup-header">
                    <span class="popup-avatar">🎓</span>
                    <h3 class="popup-name">${egresado.nombre_completo}</h3>
                    <span class="popup-career">${egresado.carrera || 'Ingeniería'}</span>
                </div>
                <div class="popup-body">
                    <div class="popup-info-row">
                        <span><strong>Gen:</strong> ${egresado.anio_egreso || '--'}</span>
                        <span class="popup-badge">${egresado.situacion_laboral || 'Activo'}</span>
                    </div>
                    <div class="popup-tags">${tagsHtml}</div>
                    ${descHtml}
                    ${contactHtml}
                </div>
            </div>
        `;
        const marker = L.marker([coords.lat, coords.lng], { icon: goldIcon }).bindPopup(popupHTML);
        markersLayer.addLayer(marker);
        return true;
    }
    return false;
}

// ==========================================
// 6. LÓGICA DE DATOS
// ==========================================
function updateCountersUI() {
    const total = globalData.length;
    const countSpan = document.getElementById('totalRegistros');
    const btnCountSpan = document.getElementById('btnCount');
    if(countSpan) countSpan.innerText = total;
    if(btnCountSpan) btnCountSpan.innerText = total;
    const modal = document.getElementById('statsModal');
    if (modal && modal.classList.contains('show')) updateCharts();
}

async function initData() {
    try {
        console.log("Conectando a Supabase...");
        const { data, error } = await client.from('egresados_unicach').select('*'); 
        if (error) throw error;
        globalData = data;
        markersLayer.clearLayers();
        let puntosValidos = 0;
        data.forEach(egresado => { if(addMarkerToMap(egresado)) puntosValidos++; });
        updateCountersUI();
        if (puntosValidos > 0) map.fitBounds(markersLayer.getBounds(), { padding: [50, 50] });

        client.channel('egresados_realtime')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'egresados_unicach' }, (payload) => {
                globalData.push(payload.new);
                addMarkerToMap(payload.new);
                updateCountersUI();
                const btnStats = document.querySelector('[data-bs-target="#statsModal"]');
                if(btnStats) { btnStats.classList.add('btn-warning'); setTimeout(() => btnStats.classList.remove('btn-warning'), 1000); }
            }).subscribe();
    } catch (err) { console.error("🔥 Error:", err); }
}
initData();

// ==========================================
// 7. SIDEBAR Y RESPONSIVIDAD
// ==========================================
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const toggleIcon = document.getElementById('toggleIcon');

function updateToggleIcon() {
    const isActive = sidebar.classList.contains('active');
    const isMobile = window.innerWidth < 768;
    if (isMobile) toggleIcon.innerHTML = isActive ? '▼' : '▲'; else toggleIcon.innerHTML = isActive ? '◀' : '▶';
}

sidebarToggle.addEventListener('click', () => { sidebar.classList.toggle('active'); updateToggleIcon(); });
function initSidebarState() { if (window.innerWidth >= 768) sidebar.classList.add('active'); else sidebar.classList.remove('active'); updateToggleIcon(); }
initSidebarState();
window.addEventListener('resize', () => { updateToggleIcon(); });

// ==========================================
// 8. GEOLOCALIZACIÓN
// ==========================================
let userMarker = null; let currentLat = null, currentLng = null;
const btnLocate = document.getElementById('btnLocate');
const coordsInfo = document.getElementById('coordsInfo');
const coordsDisplay = document.getElementById('coordsDisplay');

function updateLocationUI(lat, lng) {
    currentLat = lat; currentLng = lng;
    coordsInfo.style.display = 'block'; coordsDisplay.innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    btnLocate.classList.remove('btn-locate'); btnLocate.classList.add('btn', 'btn-success', 'text-white'); btnLocate.innerHTML = "✅ Ubicación Lista";
    setTimeout(() => { btnLocate.classList.remove('btn', 'btn-success', 'text-white'); btnLocate.classList.add('btn-locate'); btnLocate.innerHTML = "📍 Recalcular Ubicación"; }, 2500);
}

function setUserMarker(latlng, zoom = null) {
    if (userMarker) userMarker.setLatLng(latlng);
    else { userMarker = L.marker(latlng, { draggable: true }).addTo(map); userMarker.on('dragend', e => { const pos = userMarker.getLatLng(); updateLocationUI(pos.lat, pos.lng); }); }
    updateLocationUI(latlng.lat, latlng.lng);
    if (zoom) map.setView(latlng, zoom); else map.panTo(latlng);
}

btnLocate.addEventListener('click', () => {
    btnLocate.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Buscando...`;
    map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
});

map.on('locationfound', e => { setUserMarker(e.latlng, 16); if(window.innerWidth < 768) { sidebar.classList.add('active'); updateToggleIcon(); } });
map.on('locationerror', (e) => { alert("⚠️ No se pudo obtener ubicación."); btnLocate.innerHTML = "📍 Reintentar GPS"; });
map.on('click', e => { setUserMarker(e.latlng); if(window.innerWidth < 768) { sidebar.classList.add('active'); updateToggleIcon(); } });

// ==========================================
// 9. FORMULARIO
// ==========================================
const checkOtro = document.getElementById('check_otro');
const inputOtro = document.getElementById('input_otro_texto');
checkOtro.addEventListener('change', function() { if(this.checked) { inputOtro.classList.add('show-input'); inputOtro.focus(); } else { inputOtro.classList.remove('show-input'); inputOtro.value = ''; } });

const selectCarrera = document.getElementById('carrera');
const inputCarreraOtro = document.getElementById('carrera_otro');
selectCarrera.addEventListener('change', function() { if(this.value === 'Otro') { inputCarreraOtro.classList.add('show-input'); inputCarreraOtro.focus(); } else { inputCarreraOtro.classList.remove('show-input'); inputCarreraOtro.value = ''; } });

const form = document.getElementById('surveyForm');
const btnSubmit = document.getElementById('btnSubmit');

form.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    if (!currentLat || !currentLng) return alert("⚠️ Falta ubicación.");
    btnSubmit.disabled = true; btnSubmit.innerHTML = "Guardando...";
    let carreraVal = selectCarrera.value; if (carreraVal === 'Otro') carreraVal = inputCarreraOtro.value || 'No especificado';
    
    const formData = {
        nombre_completo: document.getElementById('nombre').value, carrera: carreraVal, anio_egreso: document.getElementById('anio').value, situacion_laboral: document.getElementById('situacion').value,
        descripcion_servicios: document.getElementById('descripcion').value, contacto_url: document.getElementById('contacto').value,
        esp_cartografia: document.getElementById('check_cartografia').checked, esp_fotogrametria: document.getElementById('check_fotogrametria').checked,
        esp_topografia: document.getElementById('check_topografia').checked, esp_geodesia: document.getElementById('check_geodesia').checked,
        esp_drones: document.getElementById('check_drones').checked, esp_desarrollo: document.getElementById('check_desarrollo').checked,
        esp_otro_texto: checkOtro.checked ? inputOtro.value : null, location: `POINT(${currentLng} ${currentLat})`
    };

    try {
        const { error } = await client.from('egresados_unicach').insert([formData]);
        if (error) throw error;
        alert("¡Registro exitoso!"); form.reset(); 
        map.setView(MEXICO_CENTER, MEXICO_ZOOM); coordsInfo.style.display = 'none'; btnLocate.innerHTML = "📍 Obtener mi Ubicación";
        sidebar.classList.remove('active'); updateToggleIcon(); 
        if(userMarker) { map.removeLayer(userMarker); userMarker = null; }
    } catch (err) { alert("Error guardando: " + err.message); } finally { btnSubmit.disabled = false; btnSubmit.innerHTML = "Guardar Registro"; }
});

// ==========================================
// 10. GRÁFICAS
// ==========================================
let chartSituacionInstance = null, chartEspInstance = null;
function updateCharts() {
    if(globalData.length === 0) return;
    const conteoSituacion = {};
    const conteoEsp = { "Cartografía": 0, "Fotogrametría": 0, "Topografía": 0, "Geodesia": 0, "Drones": 0, "Dev/SIG": 0 };
    globalData.forEach(item => { 
        const sit = item.situacion_laboral || "No especificado"; conteoSituacion[sit] = (conteoSituacion[sit] || 0) + 1; 
        if(item.esp_cartografia) conteoEsp["Cartografía"]++; if(item.esp_fotogrametria) conteoEsp["Fotogrametría"]++; 
        if(item.esp_topografia) conteoEsp["Topografía"]++; if(item.esp_geodesia) conteoEsp["Geodesia"]++; 
        if(item.esp_drones) conteoEsp["Drones"]++; if(item.esp_desarrollo) conteoEsp["Dev/SIG"]++; 
    });
    const isMobile = window.innerWidth < 768;
    const ctx1 = document.getElementById('chartSituacion');
    if (ctx1) {
        if(chartSituacionInstance) chartSituacionInstance.destroy();
        chartSituacionInstance = new Chart(ctx1.getContext('2d'), { type: 'doughnut', data: { labels: Object.keys(conteoSituacion), datasets: [{ data: Object.values(conteoSituacion), backgroundColor: ['#003399', '#FFCC00', '#28a745', '#dc3545', '#6c757d', '#17a2b8'], borderWidth: 2, borderColor: '#ffffff' }] }, options: { responsive: true, maintainAspectRatio: false, layout: { padding: 10 }, plugins: { legend: { position: isMobile ? 'right' : 'bottom', labels: { boxWidth: 10, padding: 10, font: { size: isMobile ? 10 : 12 } }, display: true } } } });
    }
    const ctx2 = document.getElementById('chartEspecialidades');
    if (ctx2) {
        if(chartEspInstance) chartEspInstance.destroy();
        chartEspInstance = new Chart(ctx2.getContext('2d'), { type: 'bar', data: { labels: Object.keys(conteoEsp), datasets: [{ label: 'Ingenieros', data: Object.values(conteoEsp), backgroundColor: '#003399', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } } });
    }
}

// ==========================================
// 11. TOUR GUIADO INTELIGENTE (ACTUALIZADO)
// ==========================================

// Función auxiliar para abrir/cerrar sidebar según necesidad
const toggleSidebarForTour = (shouldBeOpen) => {
    const isActive = sidebar.classList.contains('active');
    
    // Si debe estar abierto y está cerrado -> Abrir
    if (shouldBeOpen && !isActive) {
        sidebar.classList.add('active');
        updateToggleIcon();
    } 
    // Si debe estar cerrado (para mostrar mapa) y está abierto -> Cerrar
    else if (!shouldBeOpen && isActive) {
        sidebar.classList.remove('active');
        updateToggleIcon();
    }
};

function startTour() {
    const driver = window.driver.js.driver;
    const isMobile = window.innerWidth < 768;

    const driverObj = driver({
        showProgress: true,
        animate: true,
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Atrás',
        doneBtnText: '¡Listo!',
        // Restaura el sidebar al terminar (si es escritorio)
        onDestroyed: () => { 
            if (!isMobile) toggleSidebarForTour(true); 
        },
        steps: [
            // PASO 1: Registro (Sidebar DEBE estar abierto)
            { 
                element: '#sidebar', 
                popover: { title: '📝 Registro', description: 'Regístrate aquí.', side: "right", align: 'start' },
                onHighlightStarted: () => toggleSidebarForTour(true)
            },
            // PASO 2: GPS (Sidebar DEBE estar abierto)
            { 
                element: '#btnLocate', 
                popover: { title: '📍 GPS', description: 'Obtén tu ubicación antes de guardar.', side: "bottom" },
                onHighlightStarted: () => toggleSidebarForTour(true)
            },
            // PASO 3: Capas (Sidebar DEBE estar cerrado en móvil)
            { 
                element: '.leaflet-control-layers', 
                popover: { title: '🗺️ Mapas', description: 'Cambia el fondo.', side: "left" },
                onHighlightStarted: () => { if(isMobile) toggleSidebarForTour(false); }
            },
            // PASO 4: Zoom (Sidebar DEBE estar cerrado en móvil)
            { 
                element: '.leaflet-control-zoom', 
                popover: { title: '🔍 Zoom', description: 'Acerca o aleja el mapa.', side: "left" },
                onHighlightStarted: () => { if(isMobile) toggleSidebarForTour(false); }
            },
            // PASO 5: Reset View (Sidebar DEBE estar cerrado en móvil)
            { 
                element: '#btnResetView', 
                popover: { title: '🏠 Vista General', description: 'Regresa al mapa de México.', side: "left" },
                onHighlightStarted: () => { if(isMobile) toggleSidebarForTour(false); }
            },
            // PASO 6: Ayuda (Sidebar DEBE estar cerrado en móvil)
            { 
                element: '#btnHelp', 
                popover: { title: '❓ Ayuda', description: 'Repite este tour cuando quieras.', side: "left" },
                onHighlightStarted: () => { if(isMobile) toggleSidebarForTour(false); }
            },
            // PASO 7: SIMBOLOGÍA (CORREGIDO: Sidebar DEBE cerrarse en AMBOS)
            { 
                element: '.info.legend', 
                popover: { title: '🏷️ Simbología', description: 'Azul: tú. Dorado: colegas.', side: "top" },
                // CORRECCIÓN AQUÍ: Quitamos el "if(isMobile)" para que cierre siempre
                onHighlightStarted: () => { toggleSidebarForTour(false); }
            }
        ]
    });

    driverObj.drive();
}

// Iniciar tour automáticamente
const ua = navigator.userAgent || navigator.vendor || window.opera;
if ((ua.indexOf("FBAN") > -1) || (ua.indexOf("FBAV") > -1) || (ua.indexOf("Instagram") > -1)) { 
    document.getElementById('browser-alert').style.display = 'block'; 
} else {
    if (!localStorage.getItem('tourVisto')) { 
        setTimeout(() => { 
            startTour(); 
            localStorage.setItem('tourVisto', 'true'); 
        }, 1500); 
    }
}