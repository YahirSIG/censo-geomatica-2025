const SUPABASE_URL = 'https://ulmweagltluaeqfihtqj.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsbXdlYWdsdGx1YWVxZmlodHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0Mjc0NzIsImV4cCI6MjA3NTAwMzQ3Mn0.-JbIFHtIDokywpnvCQLGwMw5RFDgR6hA3jeAg7mbFRk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let globalData = [];

const MEXICO_CENTER = [23.6345, -102.5528];
const map = L.map('map', { zoomControl: false }).setView(MEXICO_CENTER, 5); 

// Zoom abajo derecha
L.control.zoom({ position: 'bottomright' }).addTo(map);

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' });
const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' });
const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' });
osm.addTo(map);
L.control.layers({ "Callejero": osm, "Satélite": satelite, "Modo Oscuro": cartoDark }).addTo(map);

// --- CONTROL DE RESET VIEW (CASITA) ---
L.Control.ResetView = L.Control.extend({
    onAdd: function(map) {
        var div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-reset');
        div.innerHTML = '🏠'; 
        div.title = "Restablecer Vista";
        div.onclick = function(e) {
            e.stopPropagation(); 
            map.setView(MEXICO_CENTER, 5); 
        };
        return div;
    }
});
new L.Control.ResetView({ position: 'bottomright' }).addTo(map);

const goldIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

async function loadMapPoints() {
    try {
        const { data, error } = await supabase.from('egresados_unicach').select('*, location_wkt'); 
        if (error) return console.error("❌ Error:", error.message);
        globalData = data;
        document.getElementById('totalRegistros').innerText = data.length;

        data.forEach(egresado => {
            if (!egresado.location_wkt) return;
            const match = egresado.location_wkt.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/);
            if (match) {
                const lng = parseFloat(match[1]); 
                const lat = parseFloat(match[2]);
                let popupContent = `
                    <div style="min-width: 200px; font-family: 'Roboto', sans-serif;">
                        <h3 style="margin: 0; color: #003399; font-size: 1rem; border-bottom: 2px solid #FFCC00; padding-bottom: 5px;">${egresado.nombre_completo}</h3>
                        <p class="small mt-1 mb-2" style="color: #009933; font-weight: bold;">${egresado.carrera || 'Ing. Geomática'}</p>
                        <p class="text-muted small mb-2">🎓 Gen: ${egresado.anio_egreso || 'No esp.'} <br> 💼 <strong>${egresado.situacion_laboral}</strong></p>
                `;
                let especialidades = [];
                if(egresado.esp_cartografia) especialidades.push("Cartografía");
                if(egresado.esp_fotogrametria) especialidades.push("Fotogrametría");
                if(egresado.esp_topografia) especialidades.push("Topografía");
                if(egresado.esp_geodesia) especialidades.push("Geodesia");
                if(egresado.esp_drones) especialidades.push("Drones");
                if(egresado.esp_desarrollo) especialidades.push("Dev/SIG");
                if(egresado.esp_otro_texto) especialidades.push(egresado.esp_otro_texto);
                
                if (especialidades.length > 0) {
                    popupContent += `<div style="margin-bottom: 8px;">`;
                    especialidades.forEach(esp => popupContent += `<span style="background:#eee; color:#333; padding:2px 6px; border-radius:4px; font-size:0.7rem; margin-right:3px; display:inline-block; margin-bottom:2px;">${esp}</span>`);
                    popupContent += `</div>`;
                }
                if (egresado.descripcion_servicios) popupContent += `<p style="font-style: italic; font-size: 0.85rem; color: #555; background: #f9f9f9; padding: 5px; border-left: 3px solid #ccc;">"${egresado.descripcion_servicios}"</p>`;
                if (egresado.contacto_url) {
                    let link = egresado.contacto_url;
                    if (!link.startsWith('http')) link = 'https://' + link;
                    popupContent += `<a href="${link}" target="_blank" class="btn btn-sm btn-primary w-100 text-white" style="text-decoration:none; display:block; text-align:center; padding: 4px; border-radius: 4px; background-color: #003399; font-size: 0.8rem;">Ver Perfil 🔗</a>`;
                }
                popupContent += `</div>`;
                L.marker([lat, lng], { icon: goldIcon }).addTo(map).bindPopup(popupContent);
            }
        });
    } catch (err) { console.error(err); }
}
loadMapPoints();

let chartSituacionInstance = null;
let chartEspInstance = null;
function updateCharts() {
    if(globalData.length === 0) return;
    const conteoSituacion = {};
    globalData.forEach(item => { const sit = item.situacion_laboral || "No especificado"; conteoSituacion[sit] = (conteoSituacion[sit] || 0) + 1; });
    const conteoEsp = { "Cartografía": 0, "Fotogrametría": 0, "Topografía": 0, "Geodesia": 0, "Drones": 0, "Dev/SIG": 0 };
    globalData.forEach(item => {
        if(item.esp_cartografia) conteoEsp["Cartografía"]++;
        if(item.esp_fotogrametria) conteoEsp["Fotogrametría"]++;
        if(item.esp_topografia) conteoEsp["Topografía"]++;
        if(item.esp_geodesia) conteoEsp["Geodesia"]++;
        if(item.esp_drones) conteoEsp["Drones"]++;
        if(item.esp_desarrollo) conteoEsp["Dev/SIG"]++;
    });
    const ctx1 = document.getElementById('chartSituacion').getContext('2d');
    if(chartSituacionInstance) chartSituacionInstance.destroy();
    chartSituacionInstance = new Chart(ctx1, { type: 'doughnut', data: { labels: Object.keys(conteoSituacion), datasets: [{ data: Object.values(conteoSituacion), backgroundColor: ['#003399', '#FFCC00', '#009933', '#dc3545', '#6c757d', '#17a2b8'] }] }, options: { responsive: true, plugins: { legend: { position: 'bottom' } } } });
    const ctx2 = document.getElementById('chartEspecialidades').getContext('2d');
    if(chartEspInstance) chartEspInstance.destroy();
    chartEspInstance = new Chart(ctx2, { type: 'bar', data: { labels: Object.keys(conteoEsp), datasets: [{ label: 'Profesionales', data: Object.values(conteoEsp), backgroundColor: '#003399' }] }, options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } } });
}

let marker = null;
let currentLat = null, currentLng = null;
const btnLocate = document.getElementById('btnLocate');
const coordsInfo = document.getElementById('coordsInfo');
const coordsDisplay = document.getElementById('coordsDisplay');

function updateLocationUI(lat, lng) {
    currentLat = lat; currentLng = lng;
    coordsInfo.style.display = 'block';
    coordsDisplay.innerText = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
    btnLocate.classList.remove('btn-outline-primary'); btnLocate.classList.add('btn-success'); btnLocate.innerHTML = "✅ Ubicación Lista";
    setTimeout(() => { btnLocate.classList.remove('btn-success'); btnLocate.classList.add('btn-outline-primary'); btnLocate.innerHTML = "📍 Recalcular Ubicación"; }, 2500);
}

function setMarker(latlng, zoom = null) {
    if (marker) marker.setLatLng(latlng);
    else {
        marker = L.marker(latlng, { draggable: true }).addTo(map);
        marker.on('dragend', e => { const pos = marker.getLatLng(); updateLocationUI(pos.lat, pos.lng); });
    }
    updateLocationUI(latlng.lat, latlng.lng);
    if (zoom) map.setView(latlng, zoom); else map.panTo(latlng);
}

btnLocate.addEventListener('click', () => {
    btnLocate.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Buscando GPS...`;
    
    // OPCIONES RELAJADAS PARA MÓVILES/FACEBOOK
    const options = { 
        enableHighAccuracy: false,  // IMPORTANTE: False para que no falle en Facebook
        timeout: 20000,             // 20 segundos de espera
        maximumAge: 10000           // Acepta ubicaciones de hace 10 segundos
    };
    map.locate({ setView: true, maxZoom: 16, ...options });
});

map.on('locationfound', e => {
    setMarker(e.latlng, 16);
    if(window.innerWidth < 768) { sidebar.classList.add('active'); updateToggleIcon(); }
});

map.on('locationerror', (e) => {
    console.warn(e);
    // MENSAJE ESPECÍFICO SI FALLA
    alert("⚠️ No se pudo obtener el GPS automáticamente (posiblemente bloqueado por Facebook).\n\n👉 Solución: Arrastra el pin manualmente o abre este enlace en Chrome/Safari.");
    btnLocate.innerHTML = "📍 Reintentar GPS";
});

map.on('click', e => {
    setMarker(e.latlng);
    if(window.innerWidth < 768) { sidebar.classList.add('active'); updateToggleIcon(); }
});

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
    if (!currentLat || !currentLng) return alert("Falta ubicación en el mapa.");
    btnSubmit.disabled = true; btnSubmit.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Enviando...`;
    let carreraVal = selectCarrera.value;
    if (carreraVal === 'Otro') carreraVal = inputCarreraOtro.value || 'No especificado';

    const formData = {
        nombre_completo: document.getElementById('nombre').value,
        carrera: carreraVal,
        anio_egreso: document.getElementById('anio').value,
        situacion_laboral: document.getElementById('situacion').value,
        descripcion_servicios: document.getElementById('descripcion').value,
        contacto_url: document.getElementById('contacto').value,
        esp_cartografia: document.getElementById('check_cartografia').checked,
        esp_fotogrametria: document.getElementById('check_fotogrametria').checked,
        esp_topografia: document.getElementById('check_topografia').checked,
        esp_geodesia: document.getElementById('check_geodesia').checked,
        esp_drones: document.getElementById('check_drones').checked,
        esp_desarrollo: document.getElementById('check_desarrollo').checked,
        esp_otro_texto: checkOtro.checked ? inputOtro.value : null,
        location: `POINT(${currentLng} ${currentLat})`
    };

    try {
        const { error } = await supabase.from('egresados_unicach').insert([formData]);
        if (error) throw error;
        alert("¡Registro exitoso!");
        form.reset(); inputOtro.classList.remove('show-input'); inputCarreraOtro.classList.remove('show-input');
        map.setView(MEXICO_CENTER, 5); coordsInfo.style.display = 'none'; btnLocate.innerHTML = "📍 Obtener mi Ubicación Actual";
        loadMapPoints(); 
    } catch (err) { alert("Error al guardar: " + err.message); } finally { btnSubmit.disabled = false; btnSubmit.innerHTML = "Guardar Registro"; }
});

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const toggleIcon = document.getElementById('toggleIcon');

function updateToggleIcon() {
    const isActive = sidebar.classList.contains('active');
    const isMobile = window.innerWidth < 768;
    if (isMobile) toggleIcon.innerHTML = isActive ? '▼' : '▲'; else toggleIcon.innerHTML = isActive ? '◀' : '▶';
}

sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('active');
    updateToggleIcon();
    const mobileHint = document.getElementById('mobile-hint');
    if (mobileHint) mobileHint.style.display = 'none';
});

function initSidebarState() {
    if (window.innerWidth >= 768) sidebar.classList.add('active'); else sidebar.classList.remove('active');
    updateToggleIcon();
}
initSidebarState();
window.addEventListener('resize', () => { updateToggleIcon(); });

const legend = L.control({ position: 'bottomleft' });
legend.onAdd = function (map) {
    const div = L.DomUtil.create('div', 'info legend');
    div.innerHTML = `<h4>Simbología</h4><div class="legend-item"><img src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png" class="legend-icon"><span>Tu Ubicación (Registro)</span></div><div class="legend-item"><img src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-gold.png" class="legend-icon"><span>Colega Registrado</span></div>`;
    return div;
};
legend.addTo(map);

// AUTO-HIDE HINTS (4 SEGUNDOS)
setTimeout(() => { const hint = document.getElementById('map-hint'); if(hint) { hint.style.transition = "opacity 0.5s ease"; hint.style.opacity = "0"; setTimeout(() => hint.style.display = "none", 500); } }, 4000);
setTimeout(() => { const layerHint = document.getElementById('layers-hint'); if(layerHint) { layerHint.style.opacity = "0"; setTimeout(() => layerHint.style.display = "none", 500); } }, 4000);
setTimeout(() => { const zoomHint = document.getElementById('zoom-hint'); if(zoomHint) { zoomHint.style.opacity = "0"; setTimeout(() => zoomHint.style.display = "none", 500); } }, 4000);
setTimeout(() => { const resetHint = document.getElementById('reset-hint'); if(resetHint) { resetHint.style.opacity = "0"; setTimeout(() => resetHint.style.display = "none", 500); } }, 4000);

const layerControl = document.querySelector('.leaflet-control-layers');
if(layerControl) {
    layerControl.addEventListener('mouseover', () => { const layerHint = document.getElementById('layers-hint'); if(layerHint) layerHint.style.display = "none"; });
    layerControl.addEventListener('click', () => { const layerHint = document.getElementById('layers-hint'); if(layerHint) layerHint.style.display = "none"; });
}

// --- DETECCIÓN DE FACEBOOK (NUEVO) ---
const ua = navigator.userAgent || navigator.vendor || window.opera;
if ((ua.indexOf("FBAN") > -1) || (ua.indexOf("FBAV") > -1) || (ua.indexOf("Instagram") > -1)) {
    document.getElementById('browser-alert').style.display = 'block';
}