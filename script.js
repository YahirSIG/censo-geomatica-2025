// ---------------------------------------------------------
// 1. CONFIGURACIÓN DE SUPABASE
// ---------------------------------------------------------
const SUPABASE_URL = 'https://ulmweagltluaeqfihtqj.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsbXdlYWdsdGx1YWVxZmlodHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0Mjc0NzIsImV4cCI6MjA3NTAwMzQ3Mn0.-JbIFHtIDokywpnvCQLGwMw5RFDgR6hA3jeAg7mbFRk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Variable para guardar datos localmente y usarlos en las gráficas
let globalData = [];

// ---------------------------------------------------------
// 2. CONFIGURACIÓN DEL MAPA
// ---------------------------------------------------------
const CHIAPAS_CENTER = [16.7569, -93.1292];
const map = L.map('map').setView(CHIAPAS_CENTER, 8); 

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' });
const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri' });
const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CartoDB' });

osm.addTo(map);

L.control.layers({ 
    "Callejero": osm, 
    "Satélite": satelite, 
    "Modo Oscuro": cartoDark 
}).addTo(map);

// ---------------------------------------------------------
// 3. CARGAR PUNTOS Y DATOS
// ---------------------------------------------------------
async function loadMapPoints() {
    console.log("🔄 Descargando puntos...");

    try {
        const { data, error } = await supabase
            .from('egresados_unicach')
            .select('*, location_wkt'); 
        
        if (error) {
            console.error("❌ Error Supabase:", error.message);
            return; 
        }

        console.log(`✅ Éxito: Se encontraron ${data.length} registros.`);
        
        // Guardamos los datos en la variable global para usarlos en el Dashboard
        globalData = data;
        // Actualizamos el contador del dashboard aunque no se abra el modal aun
        document.getElementById('totalRegistros').innerText = data.length;

        if (data) {
            data.forEach(egresado => {
                if (!egresado.location_wkt) return;
                const match = egresado.location_wkt.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/);
                
                if (match) {
                    const lng = parseFloat(match[1]); 
                    const lat = parseFloat(match[2]);

                    // --- POPUP ---
                    let popupContent = `
                        <div style="min-width: 200px; font-family: 'Roboto', sans-serif;">
                            <h3 style="margin: 0; color: #003399; font-size: 1rem; border-bottom: 2px solid #FFCC00; padding-bottom: 5px;">
                                ${egresado.nombre_completo}
                            </h3>
                            <p class="text-muted small mt-1 mb-2">
                                🎓 Gen: ${egresado.anio_egreso || 'No esp.'} <br>
                                💼 <strong>${egresado.situacion_laboral}</strong>
                            </p>
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
                        especialidades.forEach(esp => {
                            popupContent += `<span style="background:#eee; color:#333; padding:2px 6px; border-radius:4px; font-size:0.7rem; margin-right:3px; display:inline-block; margin-bottom:2px;">${esp}</span>`;
                        });
                        popupContent += `</div>`;
                    }

                    if (egresado.descripcion_servicios) {
                        popupContent += `
                            <p style="font-style: italic; font-size: 0.85rem; color: #555; background: #f9f9f9; padding: 5px; border-left: 3px solid #ccc; margin-bottom: 5px;">
                                "${egresado.descripcion_servicios}"
                            </p>`;
                    }

                    if (egresado.contacto_url) {
                        let link = egresado.contacto_url;
                        if (!link.startsWith('http')) link = 'https://' + link;
                        popupContent += `
                            <a href="${link}" target="_blank" class="btn btn-sm btn-primary w-100 text-white" style="text-decoration:none; display:block; text-align:center; padding: 4px; border-radius: 4px; background-color: #003399; font-size: 0.8rem;">
                                Ver Perfil 🔗
                            </a>
                        `;
                    }
                    popupContent += `</div>`;

                    L.circleMarker([lat, lng], {
                        radius: 8,              
                        fillColor: "#FFCC00",   
                        color: "#333",          
                        weight: 1,
                        opacity: 1,
                        fillOpacity: 0.8
                    })
                    .addTo(map)
                    .bindPopup(popupContent);
                }
            });
        }

    } catch (err) {
        console.error("Excepción:", err);
    }
}

// Cargar inicial
loadMapPoints();

// ---------------------------------------------------------
// 4. LÓGICA DEL DASHBOARD (GRÁFICOS)
// ---------------------------------------------------------
let chartSituacionInstance = null;
let chartEspInstance = null;

function updateCharts() {
    if(globalData.length === 0) return;

    // 1. Procesar Datos de Situación Laboral
    const conteoSituacion = {};
    globalData.forEach(item => {
        const sit = item.situacion_laboral || "No especificado";
        conteoSituacion[sit] = (conteoSituacion[sit] || 0) + 1;
    });

    // 2. Procesar Datos de Especialidades
    const conteoEsp = {
        "Cartografía": 0, "Fotogrametría": 0, "Topografía": 0, 
        "Geodesia": 0, "Drones": 0, "Dev/SIG": 0
    };
    
    globalData.forEach(item => {
        if(item.esp_cartografia) conteoEsp["Cartografía"]++;
        if(item.esp_fotogrametria) conteoEsp["Fotogrametría"]++;
        if(item.esp_topografia) conteoEsp["Topografía"]++;
        if(item.esp_geodesia) conteoEsp["Geodesia"]++;
        if(item.esp_drones) conteoEsp["Drones"]++;
        if(item.esp_desarrollo) conteoEsp["Dev/SIG"]++;
    });

    // --- RENDERIZAR GRÁFICO 1: PIE CHART (SITUACIÓN) ---
    const ctx1 = document.getElementById('chartSituacion').getContext('2d');
    
    // Si ya existe, lo destruimos para actualizar
    if(chartSituacionInstance) chartSituacionInstance.destroy();

    chartSituacionInstance = new Chart(ctx1, {
        type: 'doughnut',
        data: {
            labels: Object.keys(conteoSituacion),
            datasets: [{
                data: Object.values(conteoSituacion),
                backgroundColor: ['#003399', '#FFCC00', '#009933', '#dc3545', '#6c757d', '#17a2b8']
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });

    // --- RENDERIZAR GRÁFICO 2: BAR CHART (ESPECIALIDADES) ---
    const ctx2 = document.getElementById('chartEspecialidades').getContext('2d');
    
    if(chartEspInstance) chartEspInstance.destroy();

    chartEspInstance = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: Object.keys(conteoEsp),
            datasets: [{
                label: 'Profesionales',
                data: Object.values(conteoEsp),
                backgroundColor: '#003399'
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            plugins: { legend: { display: false } }
        }
    });
}


// ---------------------------------------------------------
// 5. GEOLOCALIZACIÓN Y REGISTRO
// ---------------------------------------------------------
let marker = null;
let currentLat = null, currentLng = null;

const btnLocate = document.getElementById('btnLocate');
const coordsInfo = document.getElementById('coordsInfo');
const coordsDisplay = document.getElementById('coordsDisplay');

function updateLocationUI(lat, lng) {
    currentLat = lat; currentLng = lng;
    coordsInfo.style.display = 'block';
    coordsDisplay.innerText = `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
    
    btnLocate.classList.remove('btn-outline-primary');
    btnLocate.classList.add('btn-success');
    btnLocate.innerHTML = "✅ Ubicación Lista";
    
    setTimeout(() => { 
        btnLocate.classList.remove('btn-success');
        btnLocate.classList.add('btn-outline-primary');
        btnLocate.innerHTML = "📍 Recalcular Ubicación"; 
    }, 2500);
}

function setMarker(latlng, zoom = null) {
    if (marker) {
        marker.setLatLng(latlng);
    } else {
        marker = L.marker(latlng, { draggable: true }).addTo(map);
        marker.on('dragend', e => {
            const pos = marker.getLatLng();
            updateLocationUI(pos.lat, pos.lng);
        });
    }
    updateLocationUI(latlng.lat, latlng.lng);
    if (zoom) map.setView(latlng, zoom);
    else map.panTo(latlng);
}

btnLocate.addEventListener('click', () => {
    // IMPORTANTE PARA MOVIL: Feedback visual inmediato
    btnLocate.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Buscando GPS...`;
    
    // Opciones para mejorar la precisión en móvil
    const options = { 
        enableHighAccuracy: true, 
        timeout: 10000, 
        maximumAge: 0 
    };

    map.locate({ setView: true, maxZoom: 16, ...options });
});

map.on('locationfound', e => setMarker(e.latlng, 16));
map.on('locationerror', (e) => {
    console.warn(e); // Para depuración
    alert("No se pudo obtener el GPS automáticamente. \n\nPor favor:\n1. Revisa que tengas el GPS encendido.\n2. Da permisos al navegador.\n3. O haz clic manualmente en el mapa.");
    btnLocate.innerHTML = "📍 Reintentar GPS";
});
map.on('click', e => setMarker(e.latlng));

setMarker({lat: 16.753, lng: -93.115}, 10);

// ---------------------------------------------------------
// 6. FORMULARIO
// ---------------------------------------------------------
const checkOtro = document.getElementById('check_otro');
const inputOtro = document.getElementById('input_otro_texto');

checkOtro.addEventListener('change', function() {
    if(this.checked) {
        inputOtro.classList.add('show-input');
        inputOtro.focus();
    } else {
        inputOtro.classList.remove('show-input');
        inputOtro.value = ''; 
    }
});

const form = document.getElementById('surveyForm');
const btnSubmit = document.getElementById('btnSubmit');

form.addEventListener('submit', async (e) => {
    e.preventDefault(); 
    if (!currentLat || !currentLng) return alert("Falta ubicación en el mapa. Presiona el botón de GPS o haz clic en el mapa.");

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Enviando...`;

    const formData = {
        nombre_completo: document.getElementById('nombre').value,
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
        form.reset();
        inputOtro.classList.remove('show-input');
        map.setView(CHIAPAS_CENTER, 8);
        coordsInfo.style.display = 'none';
        btnLocate.innerHTML = "📍 Obtener mi Ubicación Actual";
        
        loadMapPoints(); // Recargar mapa y actualizar datos globales para gráficas

    } catch (err) {
        console.error(err);
        alert("Error al guardar: " + err.message);
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = "Guardar Registro";
    }
});