// script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO GLOBAL DE LA APLICACIÓN ---
    let appData = {
        listaCategorias: [],
        datosPorCategoria: {}, // { "nombreCategoria": { torneos: [], jugadoresGlobal: {} } }
        ultimaCategoriaActiva: null
    };
    let categoriaActiva = null;
    let isAdminMode = false;

    // Referencias a los datos de la categoría activa
    let torneos = [];
    let jugadoresGlobal = {};

    // --- CONSTANTES ---
    const MAX_JUGADORES_INDIVIDUAL = 12;
    const MAX_PAREJAS_PAREJASFIJAS = 6;
    const MAX_RONDAS = 7;
    const PUNTOS_POR_CANCHA = { 1: 3, 2: 2, 3: 1 };
    const PUNTOS_EXTRA_INDIVIDUAL = { 1: 600, 2: 500, 3: 400, 4: 300, 5: 250, 6: 200, 7: 175, 8: 150, 9: 125, 10: 100, 11: 75, 12: 50 };
    const PUNTOS_EXTRA_PAREJAS = { 1: 600, 2: 500, 3: 400, 4: 300, 5: 200, 6: 100 };
    const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwEXT8SU9tx9ICnxcfOHDQ1uF7rsbo9wSgw1D7k-Al0GBnyH8yRCBmWm9bt0U-6nqq2mw/exec'; 
    const ADMIN_PASSWORD = '5858';
    const ADMIN_SESSION_DURATION = 4 * 60 * 60 * 1000; // 4 horas en milisegundos

    // --- SELECTORES DEL DOM ---
    const seleccionCategoriaScreen = document.getElementById('seleccionCategoriaScreen');
    const listaCategoriasContainerEl = document.getElementById('listaCategoriasContainer');
    const btnAgregarCategoriaEl = document.getElementById('btnAgregarCategoria');
    const btnVolverCategoriasEl = document.getElementById('btnVolverCategorias');
    const categoriaActivaHeaderEl = document.getElementById('categoriaActivaHeader');
    const dynamicCategoryNameElements = document.querySelectorAll('.dynamic-category-name');
    const dynamicCategoryNameModalElements = document.querySelectorAll('.dynamic-category-name-modal');
    const appContentScreen = document.getElementById('appContentScreen');
    const navButtons = document.querySelectorAll('.nav-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const bienvenidoMsgEl = document.getElementById('bienvenidoMsg');
    const modalCrearTorneo = document.getElementById('modalCrearTorneo');
    const modalEditarNombreJugador = document.getElementById('modalEditarNombreJugador');
    const modalEditarCategoria = document.getElementById('modalEditarCategoria');
    const closeModalButtons = document.querySelectorAll('.modal .close-button');
    const btnGoToCrearIndividual = document.getElementById('btnGoToCrearIndividual');
    const btnGoToCrearParejas = document.getElementById('btnGoToCrearParejas');
    const btnAbrirModalCrearTorneo = document.getElementById('btnAbrirModalCrearTorneo');
    const tipoTorneoModal = document.getElementById('tipoTorneoModal');
    const nombreTorneoInput = document.getElementById('nombreTorneo');
    const jugadoresInputContainer = document.getElementById('jugadoresInputContainer');
    const sugerenciasJugadoresGlobalesDatalist = document.getElementById('sugerenciasJugadoresGlobales');
    const btnConfirmarCrearTorneo = document.getElementById('btnConfirmarCrearTorneo');
    const vistaListaTorneosEl = document.getElementById('vistaListaTorneos');
    const vistaDetalleTorneoEl = document.getElementById('vistaDetalleTorneo');
    const listaTorneosActualesEl = document.getElementById('listaTorneosActuales');
    const listaTorneosHistoricosEl = document.getElementById('listaTorneosHistoricos');
    const btnVolverListaTorneos = document.getElementById('btnVolverListaTorneos');
    const nombreTorneoDetalleEl = document.getElementById('nombreTorneoDetalle');
    const btnEditarNombreTorneo = document.getElementById('btnEditarNombreTorneo');
    const infoTipoTorneoDetalleEl = document.getElementById('infoTipoTorneoDetalle');
    const rondasContainerEl = document.getElementById('rondasContainer');
    const btnGenerarSiguienteRonda = document.getElementById('btnGenerarSiguienteRonda');
    const btnFinalizarTorneo = document.getElementById('btnFinalizarTorneo');
    const tablaPuntosTorneoActualBodyEl = document.querySelector('#tablaPuntosTorneoActual tbody');
    const btnExportarTorneoDetalle = document.getElementById('btnExportarTorneoDetalle');
    const btnEliminarTorneoDetalle = document.getElementById('btnEliminarTorneoDetalle');
    const listaGlobalJugadoresEl = document.getElementById('listaGlobalJugadores');
    const filtroNombreJugadorInput = document.getElementById('filtroNombreJugador');
    const nombreJugadorActualInput = document.getElementById('nombreJugadorActual');
    const nombreJugadorNuevoInput = document.getElementById('nombreJugadorNuevo');
    const btnConfirmarEditarNombreJugador = document.getElementById('btnConfirmarEditarNombreJugador');
    const btnConfirmarEditarCategoria = document.getElementById('btnConfirmarEditarCategoria');
    const tablaResultadosGlobalesBodyEl = document.querySelector('#tablaResultadosGlobales tbody');
    const filtroTipoTorneoResultadosEl = document.getElementById('filtroTipoTorneoResultados');
    const filtroMesResultadosEl = document.getElementById('filtroMesResultados'); 
    const btnExportarRankingGlobalEl = document.getElementById('btnExportarRankingGlobal');
    const adminLockBtn = document.getElementById('adminLockBtn');
    const inicioDashboardEl = document.getElementById('inicioDashboard');
    const top5RankingListEl = document.getElementById('top5RankingList');
    const ultimoTorneoSectionEl = document.getElementById('ultimoTorneoSection');
    const ultimoTorneoInfoEl = document.getElementById('ultimoTorneoInfo');

    let torneoActualSeleccionadoId = null;
    let jugadorParaEditarNombre = null;
    let categoriaParaEditarNombre = null;

    // --- GESTIÓN DE MODO ADMIN ---
    function checkAdminSession() {
        const adminTimestamp = localStorage.getItem('adminUnlockTimestamp');
        if (adminTimestamp) {
            const timeElapsed = Date.now() - parseInt(adminTimestamp, 10);
            isAdminMode = timeElapsed < ADMIN_SESSION_DURATION;
            if (!isAdminMode) {
                localStorage.removeItem('adminUnlockTimestamp');
                console.log("Sesión de administrador expirada.");
            } else {
                 console.log("Sesión de administrador activa.");
            }
        } else {
            isAdminMode = false;
        }
        updateAdminUI();
    }

    function updateAdminUI() {
        const adminFeatures = document.querySelectorAll('.admin-feature');
        adminFeatures.forEach(el => el.classList.toggle('hidden', !isAdminMode));

        if (adminLockBtn) {
            const icon = adminLockBtn.querySelector('i');
            adminLockBtn.classList.toggle('unlocked', isAdminMode);
            icon.classList.toggle('fa-lock', !isAdminMode);
            icon.classList.toggle('fa-lock-open', isAdminMode);
            adminLockBtn.title = isAdminMode ? "Modo Administrador Desbloqueado" : "Desbloquear Modo Administrador";
        }
        
        rondasContainerEl.querySelectorAll('.team-button').forEach(button => {
            button.classList.toggle('admin-mode-enabled', isAdminMode);
        });
    }

    adminLockBtn.addEventListener('click', () => {
        if (isAdminMode) {
            if (confirm("¿Deseas bloquear el modo administrador?")) {
                isAdminMode = false;
                localStorage.removeItem('adminUnlockTimestamp');
                alert("Modo administrador bloqueado.");
                updateAdminUI();
            }
            return;
        }

        const password = prompt("Ingrese la contraseña de administrador (4 dígitos):");
        if (password === ADMIN_PASSWORD) {
            isAdminMode = true;
            localStorage.setItem('adminUnlockTimestamp', Date.now().toString());
            alert("¡Modo administrador desbloqueado por 4 horas!");
            updateAdminUI();
        } else if (password !== null && password !== "") {
            alert("Contraseña incorrecta.");
        }
    });

    // --- GESTIÓN DE CATEGORÍAS ---
    async function cargarDatosGlobales() {
        console.log("Cargando datos desde Google Sheet...");
        try {
            const response = await fetch(APPS_SCRIPT_URL);
            if (!response.ok) { throw new Error(`Error de red al cargar datos: ${response.statusText}`); }
            const dataDesdeSheet = await response.json();
            if (dataDesdeSheet && typeof dataDesdeSheet === 'object') {
                appData.listaCategorias = dataDesdeSheet.listaCategorias || [];
                appData.datosPorCategoria = dataDesdeSheet.datosPorCategoria || {};
                appData.ultimaCategoriaActiva = dataDesdeSheet.ultimaCategoriaActiva || null;
                appData.listaCategorias.forEach(cat => {
                    if (!appData.datosPorCategoria[cat]) appData.datosPorCategoria[cat] = { torneos: [], jugadoresGlobal: {} };
                    else {
                        if (!appData.datosPorCategoria[cat].torneos) appData.datosPorCategoria[cat].torneos = [];
                        if (!appData.datosPorCategoria[cat].jugadoresGlobal) appData.datosPorCategoria[cat].jugadoresGlobal = {};
                    }
                    Object.values(appData.datosPorCategoria[cat].jugadoresGlobal || {}).forEach(jugador => {
                        if (!jugador.puntosTotalesPorTipo) jugador.puntosTotalesPorTipo = { individual: 0, parejas: 0, todos: 0 };
                    });
                });
                console.log("Datos cargados:", appData);
            } else {
                console.warn("No se recibieron datos válidos. Usando estructura por defecto.");
                appData.listaCategorias = ["4ta Varonil", "5ta Varonil"]; 
                appData.datosPorCategoria = {};
                appData.listaCategorias.forEach(cat => { appData.datosPorCategoria[cat] = { torneos: [], jugadoresGlobal: {} }; });
                appData.ultimaCategoriaActiva = null;
            }
        } catch (error) {
            console.error("Error CRÍTICO al cargar datos:", error);
            alert("No se pudieron cargar los datos desde Google Sheets.\nError: " + error.message);
            appData.listaCategorias = ["Fallback"]; appData.datosPorCategoria = {"Fallback": { torneos: [], jugadoresGlobal: {} }}; appData.ultimaCategoriaActiva = null;
        }
    }
    async function guardarDatosGlobales() {
        if (!isAdminMode) {
            console.warn("Intento de guardado sin ser admin. Operación denegada.");
            return;
        }
        console.log("Intentando guardar datos en Google Sheet...");
        if (guardarDatosGlobales.timeoutId) clearTimeout(guardarDatosGlobales.timeoutId);
        guardarDatosGlobales.timeoutId = setTimeout(async () => {
            try {
                const response = await fetch(APPS_SCRIPT_URL, {
                    method: 'POST', mode: 'cors', headers: {'Content-Type': 'text/plain;charset=utf-8'},
                    body: JSON.stringify(appData) 
                });
                if (!response.ok) { let eM = `Error red: ${response.status} ${response.statusText}`; try {const eB=await response.json();eM=eB.message||eM;}catch(e){} throw new Error(eM); }
                const result = await response.json();
                if (result.status === "success") console.log("Datos guardados en Google Sheet.", result.message);
                else { console.error("Error Apps Script al guardar:", result.message); alert("Error al guardar en Google Sheets:\n" + result.message); }
            } catch (error) { console.error("Error CRÍTICO al guardar:", error); alert("No se pudieron guardar los datos.\nError: " + error.message); }
        }, 1500);
    }
    function renderizarListaCategorias() {
        listaCategoriasContainerEl.innerHTML = '';
        if (appData.listaCategorias.length === 0) {
            listaCategoriasContainerEl.innerHTML = '<p>No hay categorías.</p>';
            return;
        }
        appData.listaCategorias.forEach(nombreCat => {
            const catItem = document.createElement('div');
            catItem.className = 'category-list-item';
            catItem.innerHTML = `
                <span>${nombreCat}</span>
                <div class="category-buttons admin-feature">
                    <button class="edit-category-btn" data-cat="${nombreCat}" title="Editar Nombre"><i class="fas fa-edit"></i></button>
                    <button class="delete-category-btn" data-cat="${nombreCat}" title="Eliminar"><i class="fas fa-trash-alt"></i></button>
                </div>`;
            
            catItem.querySelector('span').addEventListener('click', () => seleccionarCategoria(nombreCat));
            
            const editBtn = catItem.querySelector('.edit-category-btn');
            if(editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); abrirModalEditarCategoria(nombreCat); });

            const deleteBtn = catItem.querySelector('.delete-category-btn');
            if(deleteBtn) deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmarEliminarCategoria(nombreCat); });
            
            listaCategoriasContainerEl.appendChild(catItem);
        });
        updateAdminUI();
    }
    btnAgregarCategoriaEl.addEventListener('click', () => {
        if (!isAdminMode) return;
        const inputEl = document.getElementById('inputNuevaCategoria');
        const nombreNuevaCat = inputEl.value.trim().replace(/\s+/g, ' ');
        if (nombreNuevaCat) {
            if (appData.listaCategorias.map(c => c.toLowerCase()).includes(nombreNuevaCat.toLowerCase())) {
                alert('La categoría ya existe.');
                return;
            }
            appData.listaCategorias.push(nombreNuevaCat);
            appData.datosPorCategoria[nombreNuevaCat] = { torneos: [], jugadoresGlobal: {} };
            guardarDatosGlobales();
            renderizarListaCategorias();
            inputEl.value = '';
        } else {
            alert('Ingresa un nombre para la nueva categoría.');
        }
    });
    function confirmarEliminarCategoria(nombreCat) {
        if (!isAdminMode) return;
        if (confirm(`ELIMINARÁS "${nombreCat}" y TODOS sus datos.\nEsta acción es IRREVERSIBLE.\n\n¿Deseas continuar?`)) {
            const index = appData.listaCategorias.indexOf(nombreCat);
            if (index > -1) appData.listaCategorias.splice(index, 1);
            delete appData.datosPorCategoria[nombreCat];
            if (appData.ultimaCategoriaActiva === nombreCat) appData.ultimaCategoriaActiva = null;
            if (categoriaActiva === nombreCat) mostrarPantallaCategorias();
            guardarDatosGlobales();
            renderizarListaCategorias();
        }
    }
    function seleccionarCategoria(nombreCat) {
        categoriaActiva = nombreCat;
        appData.ultimaCategoriaActiva = nombreCat;
        torneos = appData.datosPorCategoria[categoriaActiva].torneos;
        jugadoresGlobal = appData.datosPorCategoria[categoriaActiva].jugadoresGlobal;

        Object.values(jugadoresGlobal).forEach(jugador => {
            if (!jugador.puntosTotalesPorTipo) jugador.puntosTotalesPorTipo = { individual: 0, parejas: 0, todos: 0 };
        });

        categoriaActivaHeaderEl.textContent = categoriaActiva;
        dynamicCategoryNameElements.forEach(el => el.textContent = categoriaActiva);
        dynamicCategoryNameModalElements.forEach(el => el.textContent = categoriaActiva);
        bienvenidoMsgEl.textContent = `Bienvenido a ${categoriaActiva}`;
        
        seleccionCategoriaScreen.classList.remove('active-screen');
        seleccionCategoriaScreen.style.display = 'none';
        appContentScreen.style.display = 'block';
        appContentScreen.classList.add('active-screen');

        popularFiltroMeses();
        renderizarDashboardInicio();
        document.querySelector('.nav-button[data-tab="inicio"]').click();
        mostrarVistaListaTorneos();
        renderizarListasDeTorneos();
        updateAdminUI();
    }
    
    function abrirModalEditarCategoria(nombreActual) {
        if (!isAdminMode) return;
        categoriaParaEditarNombre = nombreActual;
        document.getElementById('nombreCategoriaActual').value = nombreActual;
        document.getElementById('nombreCategoriaNuevo').value = '';
        openModal(modalEditarCategoria);
    }

    btnConfirmarEditarCategoria.addEventListener('click', () => {
        if (!isAdminMode || !categoriaParaEditarNombre) return;

        const nombreActual = categoriaParaEditarNombre;
        const inputNuevo = document.getElementById('nombreCategoriaNuevo');
        const nombreNuevo = inputNuevo.value.trim().replace(/\s+/g, ' ');

        if (!nombreNuevo) {
            alert("El nuevo nombre no puede estar vacío.");
            return;
        }
        if (nombreNuevo.toLowerCase() === nombreActual.toLowerCase()) {
            closeModal(modalEditarCategoria);
            return;
        }
        if (appData.listaCategorias.some(cat => cat.toLowerCase() === nombreNuevo.toLowerCase())) {
            alert(`La categoría "${nombreNuevo}" ya existe.`);
            return;
        }

        const index = appData.listaCategorias.indexOf(nombreActual);
        if (index > -1) {
            appData.listaCategorias[index] = nombreNuevo;
        }

        appData.datosPorCategoria[nombreNuevo] = appData.datosPorCategoria[nombreActual];
        delete appData.datosPorCategoria[nombreActual];

        if (appData.ultimaCategoriaActiva === nombreActual) {
            appData.ultimaCategoriaActiva = nombreNuevo;
        }
        
        if (categoriaActiva === nombreActual) {
            categoriaActiva = nombreNuevo;
            categoriaActivaHeaderEl.textContent = nombreNuevo;
            dynamicCategoryNameElements.forEach(el => el.textContent = nombreNuevo);
            dynamicCategoryNameModalElements.forEach(el => el.textContent = nombreNuevo);
        }

        guardarDatosGlobales();
        closeModal(modalEditarCategoria);
        renderizarListaCategorias();
        alert(`La categoría "${nombreActual}" ha sido renombrada a "${nombreNuevo}".`);
    });

    function editarNombreTorneo(torneoId) {
        if (!isAdminMode) return;
        const torneo = torneos.find(t => t.id === torneoId);
        if (!torneo) return;

        const nuevoNombre = prompt("Ingrese el nuevo nombre para el torneo:", torneo.nombre);

        if (nuevoNombre && nuevoNombre.trim() !== "") {
            torneo.nombre = nuevoNombre.trim();
            guardarDatosCategoriaActual();
            renderizarDetalleTorneo(torneoId);
            renderizarListasDeTorneos();
            alert("Nombre del torneo actualizado.");
        }
    }
    
    function mostrarPantallaCategorias() {
        categoriaActiva = null; torneos = []; jugadoresGlobal = {};
        appContentScreen.classList.remove('active-screen'); appContentScreen.style.display = 'none';
        seleccionCategoriaScreen.style.display = 'flex'; seleccionCategoriaScreen.classList.add('active-screen');
        renderizarListaCategorias();
        updateAdminUI();
    }
    btnVolverCategoriasEl.addEventListener('click', mostrarPantallaCategorias);

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (!categoriaActiva && button.dataset.tab !== 'inicio') { 
                const inicioTab = document.getElementById('inicio');
                if (inicioTab) inicioTab.innerHTML = `<div class="content-card"><p>Por favor, selecciona primero una categoría para continuar.</p></div>`;
                navButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(tab => tab.classList.remove('active'));
                document.querySelector('.nav-button[data-tab="inicio"]').classList.add('active');
                if (inicioTab) inicioTab.classList.add('active');
                return;
            }
            const targetTab = button.dataset.tab;
            navButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(tab => tab.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
            
            if (targetTab === 'torneos') { mostrarVistaListaTorneos(); renderizarListasDeTorneos(); }
            else if (targetTab === 'jugadores') { renderizarListaGlobalJugadores(); }
            else if (targetTab === 'puntos') { renderizarResultadosGlobales(); } 
            
            updateAdminUI();
        });
    });
    function openModal(modalElement) { modalElement.style.display = 'block'; }
    function closeModal(modalElement) { modalElement.style.display = 'none'; }
    closeModalButtons.forEach(button => button.addEventListener('click', (e) => closeModal(e.target.closest('.modal'))));
    window.addEventListener('click', (event) => { if (event.target.classList.contains('modal')) closeModal(event.target); });
    btnGoToCrearIndividual.addEventListener('click', () => { if (!categoriaActiva || !isAdminMode) return; tipoTorneoModal.value = 'individual'; actualizarInputsJugadores(); openModal(modalCrearTorneo); document.querySelector('.nav-button[data-tab="torneos"]').click(); });
    btnGoToCrearParejas.addEventListener('click', () => { if (!categoriaActiva || !isAdminMode) return; tipoTorneoModal.value = 'parejas'; actualizarInputsJugadores(); openModal(modalCrearTorneo); document.querySelector('.nav-button[data-tab="torneos"]').click(); });
    btnAbrirModalCrearTorneo.addEventListener('click', () => { if (!categoriaActiva || !isAdminMode) return; nombreTorneoInput.value = ''; tipoTorneoModal.value = 'individual'; actualizarInputsJugadores(); openModal(modalCrearTorneo); });
    tipoTorneoModal.addEventListener('change', actualizarInputsJugadores);

    function actualizarInputsJugadores() {
        if (!categoriaActiva) return;
        const tipo = tipoTorneoModal.value; const esParejas = tipo === 'parejas';
        const numInputs = esParejas ? MAX_PAREJAS_PAREJASFIJAS * 2 : MAX_JUGADORES_INDIVIDUAL;
        jugadoresInputContainer.innerHTML = '';
        const actualizarSugerencias = () => {
            sugerenciasJugadoresGlobalesDatalist.innerHTML = '';
            const nombresEnForm = new Set(Array.from(jugadoresInputContainer.querySelectorAll('input')).map(inp => inp.value.trim().toLowerCase()).filter(n => n));
            Object.keys(jugadoresGlobal).sort((a,b) => a.localeCompare(b)).forEach(nJG => { 
                 if (!nombresEnForm.has(nJG.toLowerCase())) { 
                    const opt = document.createElement('option'); 
                    opt.value = nJG; 
                    sugerenciasJugadoresGlobalesDatalist.appendChild(opt); 
                }
            });
        };
        actualizarSugerencias();
        for (let i = 0; i < numInputs; i++) {
            const group = document.createElement('div'); group.className = 'player-input-group'; const span = document.createElement('span');
            const input = document.createElement('input'); input.type = 'text'; input.className = 'styled-input'; input.required = true; input.setAttribute('list', 'sugerenciasJugadoresGlobales');
            input.addEventListener('input', actualizarSugerencias);
            input.addEventListener('change', actualizarSugerencias); 
            input.addEventListener('blur', (e) => {
                const nIngresados = Array.from(jugadoresInputContainer.querySelectorAll('input')).map(inp => inp.value.trim().toLowerCase()).filter(n => n);
                const counts = {}; nIngresados.forEach(item => { counts[item] = (counts[item] || 0) + 1; });
                jugadoresInputContainer.querySelectorAll('input').forEach(inp => { inp.style.borderColor = (inp.value.trim() && counts[inp.value.trim().toLowerCase()] > 1) ? 'var(--functional-red)' : ''; });
            });
            if (esParejas) { const pN=Math.floor(i/2)+1; const jNP=(i%2)+1; span.textContent=`P${pN}.${jNP}:`; input.placeholder=`Jugador ${jNP}, Pareja ${pN}`; }
            else { span.textContent=`${i+1}.`; input.placeholder=`Jugador ${i+1}`; }
            group.appendChild(span); group.appendChild(input); jugadoresInputContainer.appendChild(group);
        }
    }
    btnConfirmarCrearTorneo.addEventListener('click', () => {
        if (!categoriaActiva || !isAdminMode) return;
        const nombre = nombreTorneoInput.value.trim(); const tipo = tipoTorneoModal.value;
        const inputs = Array.from(jugadoresInputContainer.querySelectorAll('input'));
        const nombresJugadoresInput = inputs.map(input => input.value.trim().replace(/\s+/g, ' '));
        if (!nombre) { alert('Nombre del torneo obligatorio.'); return; }
        if (nombresJugadoresInput.some(n => !n)) { alert('Todos los nombres de jugadores obligatorios.'); return; }
        const nombresNormalizados = nombresJugadoresInput.map(n => n.toLowerCase());
        if (new Set(nombresNormalizados).size !== nombresNormalizados.length) {
            alert('No puede haber jugadores duplicados en el mismo torneo. Corrige los nombres marcados.');
            const counts = {}; nombresNormalizados.forEach(item => { counts[item] = (counts[item] || 0) + 1; });
            inputs.forEach(input => { input.style.borderColor = (counts[input.value.trim().toLowerCase()] > 1) ? 'var(--functional-red)' : ''; });
            return;
        }
        inputs.forEach(input => input.style.borderColor = '');
        const nuevoTorneo = { id: `torneo_${Date.now()}`, nombre, tipo, jugadores: [], parejas: [], rondas: [], estado: 'actual', fechaCreacion: new Date().toISOString(), rankingFinal: null };
        if (tipo === 'individual') {
            nombresJugadoresInput.forEach((n, idx) => {
                nuevoTorneo.jugadores.push({ nombre: n, puntosRonda: 0, puntosExtra: 0, idOriginal: idx, historialParejasRonda: [], victoriasEnCancha1: 0, ultimaCanchaJugadaEnRonda: null });
                registrarJugadorGlobal(n);
            });
        } else {
            for (let i = 0; i < nombresJugadoresInput.length; i += 2) {
                const pId = `pareja_${Math.floor(i/2)}`; const j1N = nombresJugadoresInput[i]; const j2N = nombresJugadoresInput[i+1];
                nuevoTorneo.parejas.push({ id: pId, jugadoresNombres: [j1N, j2N], puntosRonda: 0, puntosExtra: 0, victoriasEnCancha1: 0, ultimaCanchaJugadaEnRonda: null });
                nuevoTorneo.jugadores.push({ nombre: j1N, puntosRonda: 0, puntosExtra: 0, idOriginal: i, parejaId:pId, victoriasEnCancha1: 0, ultimaCanchaJugadaEnRonda: null });
                nuevoTorneo.jugadores.push({ nombre: j2N, puntosRonda: 0, puntosExtra: 0, idOriginal: i+1, parejaId:pId, victoriasEnCancha1: 0, ultimaCanchaJugadaEnRonda: null });
                registrarJugadorGlobal(j1N); registrarJugadorGlobal(j2N);
            }
        }
        generarRondaInicial(nuevoTorneo); torneos.push(nuevoTorneo); guardarDatosCategoriaActual();
        closeModal(modalCrearTorneo); seleccionarTorneo(nuevoTorneo.id);
    });
    function registrarJugadorGlobal(nombreJugadorOriginal) {
        if (!categoriaActiva || !isAdminMode) return; const nombreNormalizado = nombreJugadorOriginal.toLowerCase();
        let nombreExistente = Object.keys(jugadoresGlobal).find(key => key.toLowerCase() === nombreNormalizado);
        if (!nombreExistente) jugadoresGlobal[nombreJugadorOriginal] = { puntosTotalesPorTipo: { individual: 0, parejas: 0, todos: 0 }, torneosJugados: 0 };
        else if (nombreExistente !== nombreJugadorOriginal) console.warn(`Jugador "${nombreJugadorOriginal}" se asocia con "${nombreExistente}" en "${categoriaActiva}".`);
    }

    function generarRondaInicial(torneo) {
        const ronda = { numero: 1, partidos: [] }; const numCanchas = 3;
        if (torneo.tipo === 'individual') {
            const jugadoresOrdenados = [...torneo.jugadores];
            for (let i = 0; i < numCanchas; i++) {
                const baseIdx = i * 4;
                if (baseIdx + 3 < jugadoresOrdenados.length) {
                    const j1=jugadoresOrdenados[baseIdx], j2=jugadoresOrdenados[baseIdx+1], j3=jugadoresOrdenados[baseIdx+2], j4=jugadoresOrdenados[baseIdx+3];
                    ronda.partidos.push({ cancha: i+1, equipo1: [j1.nombre, j2.nombre], equipo2: [j3.nombre, j4.nombre], jugadoresEnCanchaNombres: [j1.nombre,j2.nombre,j3.nombre,j4.nombre], ganadorEquipoKey: null });
                    actualizarHistorialParejas(torneo, j1.nombre, j2.nombre, 1); actualizarHistorialParejas(torneo, j3.nombre, j4.nombre, 1);
                    [j1,j2,j3,j4].forEach(jug => jug.ultimaCanchaJugadaEnRonda = {ronda: 1, cancha: i+1});
                }
            }
        } else {
            const parejasOrdenadas = [...torneo.parejas];
            for (let i = 0; i < numCanchas; i++) {
                const baseIdx = i * 2;
                if (baseIdx + 1 < parejasOrdenadas.length) {
                    const p1 = parejasOrdenadas[baseIdx]; const p2 = parejasOrdenadas[baseIdx + 1];
                    ronda.partidos.push({ cancha: i+1, equipo1: p1.jugadoresNombres, equipo2: p2.jugadoresNombres, datosParejasSiAplica: {equipo1ParejaId:p1.id, equipo2ParejaId:p2.id}, ganadorEquipoKey: null });
                    p1.ultimaCanchaJugadaEnRonda = {ronda: 1, cancha: i+1}; p2.ultimaCanchaJugadaEnRonda = {ronda: 1, cancha: i+1};
                    [...p1.jugadoresNombres, ...p2.jugadoresNombres].forEach(nJ => { const jug = torneo.jugadores.find(j=>j.nombre===nJ && (j.parejaId===p1.id || j.parejaId===p2.id)); if(jug) jug.ultimaCanchaJugadaEnRonda={ronda:1, cancha:i+1}; });
                }
            }
        }
        torneo.rondas.push(ronda);
    }
    btnGenerarSiguienteRonda.addEventListener('click', () => {
        if (!categoriaActiva || !isAdminMode) return;
        const torneo = torneos.find(t => t.id === torneoActualSeleccionadoId); if (!torneo) return;
        const ultimaRonda = torneo.rondas[torneo.rondas.length - 1];
        if (ultimaRonda.partidos.some(p => p.ganadorEquipoKey === null)) { alert("Registra todos los resultados de la ronda actual."); return; }
        if (torneo.rondas.length >= MAX_RONDAS) { alert("Máximo de rondas alcanzado."); btnFinalizarTorneo.style.display = 'inline-flex'; btnGenerarSiguienteRonda.style.display = 'none'; return; }
        generarNuevaRondaLogica(torneo); guardarDatosCategoriaActual(); renderizarDetalleTorneo(torneo.id);
    });
    function generarNuevaRondaLogica(torneo) {
        const ultimaRonda = torneo.rondas[torneo.rondas.length - 1];
        const nuevaRonda = { numero: ultimaRonda.numero + 1, partidos: [] }; const numCanchas = 3;
        let jugadoresPorCanchaDestino = { 1: [], 2: [], 3: [] }; let parejasPorCanchaDestino = { 1: [], 2: [], 3: [] };
        ultimaRonda.partidos.forEach(partido => {
            const ganadoresNombres = partido.ganadorEquipoKey === 'equipo1' ? partido.equipo1 : partido.equipo2;
            const perdedoresNombres = partido.ganadorEquipoKey === 'equipo1' ? partido.equipo2 : partido.equipo1;
            if (torneo.tipo === 'individual') {
                ganadoresNombres.forEach(n => moverJugadorIndividual(n, true, partido.cancha, jugadoresPorCanchaDestino));
                perdedoresNombres.forEach(n => moverJugadorIndividual(n, false, partido.cancha, jugadoresPorCanchaDestino));
            } else {
                const pGanadoraId = partido.ganadorEquipoKey === 'equipo1' ? partido.datosParejasSiAplica.equipo1ParejaId : partido.datosParejasSiAplica.equipo2ParejaId;
                const pPerdedoraId = partido.ganadorEquipoKey === 'equipo1' ? partido.datosParejasSiAplica.equipo2ParejaId : partido.datosParejasSiAplica.equipo1ParejaId;
                moverParejaFija(pGanadoraId, true, partido.cancha, parejasPorCanchaDestino);
                moverParejaFija(pPerdedoraId, false, partido.cancha, parejasPorCanchaDestino);
            }
        });
        if (torneo.tipo === 'individual') {
            for (let canchaNum = 1; canchaNum <= numCanchas; canchaNum++) {
                let jugNombresEnCancha = jugadoresPorCanchaDestino[canchaNum].map(j => j.nombre);
                if (jugNombresEnCancha.length > 4) jugNombresEnCancha = jugadoresPorCanchaDestino[canchaNum].sort((a,b)=>(b.ganoUltimoPartido?1:0)-(a.ganoUltimoPartido?1:0)).slice(0,4).map(j=>j.nombre);
                if (jugNombresEnCancha.length === 4) {
                    const parejasF = asignarParejasEnCancha(torneo, jugNombresEnCancha, nuevaRonda.numero);
                    if (parejasF) {
                        const [eq1, eq2] = parejasF;
                        nuevaRonda.partidos.push({ cancha: canchaNum, equipo1:eq1, equipo2:eq2, jugadoresEnCanchaNombres:[...eq1,...eq2], ganadorEquipoKey: null });
                        actualizarHistorialParejas(torneo, eq1[0], eq1[1], nuevaRonda.numero); actualizarHistorialParejas(torneo, eq2[0], eq2[1], nuevaRonda.numero);
                        [...eq1,...eq2].forEach(nJ => { const jug = torneo.jugadores.find(j=>j.nombre===nJ); if(jug) jug.ultimaCanchaJugadaEnRonda = {ronda: nuevaRonda.numero, cancha: canchaNum}; });
                    } else console.warn(`No se formaron parejas C${canchaNum} R${nuevaRonda.numero}. Jugadores: ${jugNombresEnCancha.join(', ')}`);
                } else if (jugNombresEnCancha.length >= 2) console.warn(`C${canchaNum} con ${jugNombresEnCancha.length} jugadores. No 2vs2.`);
            }
        } else {
            for (let canchaNum = 1; canchaNum <= numCanchas; canchaNum++) {
                const pIdsEnCancha = parejasPorCanchaDestino[canchaNum].map(p => p.parejaId);
                if (pIdsEnCancha.length >= 2) {
                    const pId1 = pIdsEnCancha[0]; const pId2 = pIdsEnCancha[1];
                    const p1 = torneo.parejas.find(p=>p.id===pId1); const p2 = torneo.parejas.find(p=>p.id===pId2);
                    if(p1 && p2) {
                        nuevaRonda.partidos.push({ cancha:canchaNum, equipo1:p1.jugadoresNombres, equipo2:p2.jugadoresNombres, datosParejasSiAplica:{equipo1ParejaId:p1.id, equipo2ParejaId:p2.id}, ganadorEquipoKey:null });
                        p1.ultimaCanchaJugadaEnRonda = {ronda:nuevaRonda.numero, cancha:canchaNum}; p2.ultimaCanchaJugadaEnRonda = {ronda:nuevaRonda.numero, cancha:canchaNum};
                        [...p1.jugadoresNombres, ...p2.jugadoresNombres].forEach(nJ => { const jug = torneo.jugadores.find(j=>j.nombre===nJ && (j.parejaId===p1.id || j.parejaId===p2.id)); if(jug) jug.ultimaCanchaJugadaEnRonda = {ronda:nuevaRonda.numero, cancha:canchaNum}; });
                    }
                }
            }
        }
        if (nuevaRonda.partidos.length > 0) torneo.rondas.push(nuevaRonda);
        else if (torneo.rondas.length < MAX_RONDAS) { alert(`No se pudieron crear partidos para la Ronda ${nuevaRonda.numero}. Asegúrate de que todos los resultados de la ronda anterior estén completos.`); btnFinalizarTorneo.style.display='inline-flex'; btnGenerarSiguienteRonda.style.display='none';}
    }
    function moverJugadorIndividual(n, g, cO, jPCD) { let cD=cO; if(g&&cD>1)cD--; else if(!g&&cD<3)cD++; jPCD[cD].push({nombre:n,ganoUltimoPartido:g});}
    function moverParejaFija(pId, g, cO, pPCD) { let cD=cO; if(g&&cD>1)cD--; else if(!g&&cD<3)cD++; pPCD[cD].push({parejaId:pId,ganoUltimoPartido:g});}
    function actualizarHistorialParejas(t, nJ1, nJ2, nR) { if(t.tipo!=='individual')return; const j1=t.jugadores.find(j=>j.nombre===nJ1),j2=t.jugadores.find(j=>j.nombre===nJ2); if(j1&&!j1.historialParejasRonda.some(p=>p.companeroNombre===nJ2&&p.rondaNumero===nR))j1.historialParejasRonda.push({companeroNombre:nJ2,rondaNumero:nR}); if(j2&&!j2.historialParejasRonda.some(p=>p.companeroNombre===nJ1&&p.rondaNumero===nR))j2.historialParejasRonda.push({companeroNombre:nJ1,rondaNumero:nR});}

    function asignarParejasEnCancha(torneo, nombresJugadoresCancha, numeroRondaActual) {
        if (nombresJugadoresCancha.length !== 4) {
            console.error("asignarParejasEnCancha requiere 4 jugadores, recibió:", nombresJugadoresCancha);
            return null;
        }
        let jugadoresObj = nombresJugadoresCancha.map(nombre => 
            torneo.jugadores.find(j => j.nombre === nombre)
        ).filter(j => j); 

        if (jugadoresObj.length !== 4) {
            console.error("No se pudieron obtener los 4 objetos de jugador válidos:", nombresJugadoresCancha, jugadoresObj);
            return [[nombresJugadoresCancha[0], nombresJugadoresCancha[1]], [nombresJugadoresCancha[2], nombresJugadoresCancha[3]]];
        }

        const p = jugadoresObj; 

        const esParejaNueva = (j1, j2) => {
            if (!j1 || !j2 || !j1.historialParejasRonda || !j2.historialParejasRonda) {
                 console.warn("Jugador o historialParejasRonda indefinido en esParejaNueva", j1 ? j1.nombre : 'undef', j2 ? j2.nombre : 'undef'); 
                 return true; 
            }
            return !j1.historialParejasRonda.some(h => h.companeroNombre === j2.nombre);
        }

        const obtenerRondaMasAntiguaSiRepetida = (j1, j2) => {
            if (!j1 || !j2 || !j1.historialParejasRonda) return Infinity;
            const historial = j1.historialParejasRonda.filter(h => h.companeroNombre === j2.nombre);
            if (historial.length === 0) return Infinity; 
            return Math.min(...historial.map(h => h.rondaNumero));
        };

        let combinacionesEvaluadas = [
            { par1: [p[0], p[1]], par2: [p[2], p[3]] },
            { par1: [p[0], p[2]], par2: [p[1], p[3]] },
            { par1: [p[0], p[3]], par2: [p[1], p[2]] }
        ];

        combinacionesEvaluadas.forEach(comb => {
            comb.par1Obj = [torneo.jugadores.find(j => j.nombre === comb.par1[0].nombre), torneo.jugadores.find(j => j.nombre === comb.par1[1].nombre)];
            comb.par2Obj = [torneo.jugadores.find(j => j.nombre === comb.par2[0].nombre), torneo.jugadores.find(j => j.nombre === comb.par2[1].nombre)];

            comb.par1Nueva = esParejaNueva(comb.par1Obj[0], comb.par1Obj[1]);
            comb.par2Nueva = esParejaNueva(comb.par2Obj[0], comb.par2Obj[1]);
            comb.nuevasCount = (comb.par1Nueva ? 1 : 0) + (comb.par2Nueva ? 1 : 0);

            let antiguedadScore = 0; 
            if (!comb.par1Nueva) antiguedadScore += obtenerRondaMasAntiguaSiRepetida(comb.par1Obj[0], comb.par1Obj[1]);
            if (!comb.par2Nueva) antiguedadScore += obtenerRondaMasAntiguaSiRepetida(comb.par2Obj[0], comb.par2Obj[1]);

            comb.antiguedadAgregada = antiguedadScore; 
        });

        combinacionesEvaluadas.sort((a, b) => {
            if (b.nuevasCount !== a.nuevasCount) return b.nuevasCount - a.nuevasCount;
            return a.antiguedadAgregada - b.antiguedadAgregada; 
        });

        if (combinacionesEvaluadas.length > 0) {
            const elegida = combinacionesEvaluadas[0];
            console.log(`Ronda ${numeroRondaActual}, Cancha con: ${nombresJugadoresCancha.join(', ')}. Elegida: (${elegida.par1[0].nombre}&${elegida.par1[1].nombre}) vs (${elegida.par2[0].nombre}&${elegida.par2[1].nombre}). Nuevas: ${elegida.nuevasCount}, AntigüedadAgregada (score): ${elegida.antiguedadAgregada}`);
            return [
                [elegida.par1[0].nombre, elegida.par1[1].nombre],
                [elegida.par2[0].nombre, elegida.par2[1].nombre]
            ];
        }

        console.error("Fallback extremo: No se pudo determinar combinación de parejas.", nombresJugadoresCancha);
        return [[p[0].nombre, p[1].nombre], [p[2].nombre, p[3].nombre]];
    }

    function mostrarVistaListaTorneos() { if (!categoriaActiva) return; vistaListaTorneosEl.style.display = 'block'; vistaDetalleTorneoEl.style.display = 'none'; torneoActualSeleccionadoId = null; updateAdminUI();}
    function renderizarListasDeTorneos() { if (!categoriaActiva) return; listaTorneosActualesEl.innerHTML = ''; listaTorneosHistoricosEl.innerHTML = ''; const actuales = torneos.filter(t => t.estado === 'actual').sort((a,b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion)); const historicos = torneos.filter(t => t.estado === 'historico').sort((a,b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion)); actuales.forEach(t => listaTorneosActualesEl.appendChild(crearElementoLiTorneo(t))); historicos.forEach(t => listaTorneosHistoricosEl.appendChild(crearElementoLiTorneo(t))); if (actuales.length === 0) listaTorneosActualesEl.innerHTML = '<li>No hay torneos actuales.</li>'; if (historicos.length === 0) listaTorneosHistoricosEl.innerHTML = '<li>No hay torneos finalizados.</li>'; }
    function crearElementoLiTorneo(torneo) { const li = document.createElement('li'); const fecha = new Date(torneo.fechaCreacion); const fechaFmt = `${fecha.getDate().toString().padStart(2,'0')}/${(fecha.getMonth()+1).toString().padStart(2,'0')}/${fecha.getFullYear()}`; li.innerHTML = `<div class="tournament-details"><span class="tournament-name">${torneo.nombre}</span><span class="tournament-date">Creado: ${fechaFmt} - ${torneo.tipo}</span></div><div class="tournament-actions-list"><span class="tournament-status ${torneo.estado}">${torneo.estado==='actual'?'En curso':'Finalizado'}</span></div>`; li.dataset.torneoId = torneo.id; li.addEventListener('click', (e) => { if(e.target.closest('button')) return; seleccionarTorneo(torneo.id)}); return li; }
    function seleccionarTorneo(torneoId) { if (!categoriaActiva) return; torneoActualSeleccionadoId = torneoId; vistaListaTorneosEl.style.display = 'none'; vistaDetalleTorneoEl.style.display = 'block'; renderizarDetalleTorneo(torneoId); }
    btnVolverListaTorneos.addEventListener('click', () => { if(!categoriaActiva) return; mostrarVistaListaTorneos(); renderizarListasDeTorneos(); });
    
    function renderizarDetalleTorneo(torneoId) { 
        if (!categoriaActiva) return; 
        const torneo = torneos.find(t => t.id === torneoId); 
        if (!torneo) { mostrarVistaListaTorneos(); return; }
        
        console.log(`--- Renderizando Detalle del Torneo: ${torneo.nombre} ---`);

        nombreTorneoDetalleEl.textContent = torneo.nombre; 
        const fechaC = new Date(torneo.fechaCreacion);
        infoTipoTorneoDetalleEl.textContent = `Tipo: ${torneo.tipo} | Estado: ${torneo.estado==='actual'?'En Curso':'Finalizado'} | Creado: ${fechaC.toLocaleDateString()}`;
        
        btnEliminarTorneoDetalle.onclick = () => confirmarEliminarTorneo(torneo.id);
        btnEditarNombreTorneo.onclick = () => editarNombreTorneo(torneo.id);
        btnExportarTorneoDetalle.onclick = () => exportarReporteMovilTorneo(torneo.id);
        
        btnExportarTorneoDetalle.style.display = torneo.estado === 'historico' ? 'inline-flex' : 'none';

        rondasContainerEl.innerHTML = '';
        torneo.rondas.forEach((ronda, rIdx) => {
            const rondaCard = document.createElement('div'); 
            rondaCard.className = 'ronda-card';
            let htmlR = `<h5>Ronda ${ronda.numero}</h5>`;
            ronda.partidos.forEach((partido, pIdx) => {
                console.log(`Renderizando HTML para Ronda ${ronda.numero}, Partido ${pIdx + 1}. Ganador en datos: ${partido.ganadorEquipoKey}`);
                htmlR += `<div class="cancha-match" data-ronda-idx="${rIdx}" data-partido-idx="${pIdx}" data-cancha-num="${partido.cancha}"><h6>Cancha ${partido.cancha}</h6>
                <button class="team-button ${partido.ganadorEquipoKey==='equipo1'?'winner':(partido.ganadorEquipoKey?'loser':'')}" data-equipo="equipo1">${partido.equipo1.join(' & ')}</button>
                <div class="vs-separator">VS</div>
                <button class="team-button ${partido.ganadorEquipoKey==='equipo2'?'winner':(partido.ganadorEquipoKey?'loser':'')}" data-equipo="equipo2">${partido.equipo2.join(' & ')}</button></div>`;
            });
            rondaCard.innerHTML = htmlR; 
            rondasContainerEl.appendChild(rondaCard);
        });

        if (torneo.rondas.length === 0) rondasContainerEl.innerHTML = '<p>No hay rondas generadas.</p>';
        
        rondasContainerEl.querySelectorAll('.cancha-match .team-button').forEach(button => {
            button.addEventListener('click', (e) => {
                if (!isAdminMode) return;
                const canchaMatchDiv = e.currentTarget.closest('.cancha-match'); 
                const rIdx = parseInt(canchaMatchDiv.dataset.rondaIdx);
                const pIdx = parseInt(canchaMatchDiv.dataset.partidoIdx); 
                const cNum = parseInt(canchaMatchDiv.dataset.canchaNum);
                const eqGanadorKey = e.currentTarget.dataset.equipo;
                registrarResultadoPartido(torneo.id, rIdx, pIdx, cNum, eqGanadorKey);
            });
        });

        const ultimaRonda = torneo.rondas.length > 0 ? torneo.rondas[torneo.rondas.length - 1] : null;
        const puedeGenRonda = torneo.estado === 'actual' && 
                             torneo.rondas.length < MAX_RONDAS && 
                             (ultimaRonda && ultimaRonda.partidos.every(p => p.ganadorEquipoKey !== null));
        
        console.log(`Chequeo para botón 'Generar': puedeGenRonda = ${puedeGenRonda}`);
        if(ultimaRonda) {
             console.log("Estado de ganadores en última ronda:", ultimaRonda.partidos.map(p => p.ganadorEquipoKey));
        }

        btnGenerarSiguienteRonda.style.display = puedeGenRonda ? 'inline-flex' : 'none';
        
        renderizarTablaPuntosTorneoActual(torneo);
        updateAdminUI();
    }

    function registrarResultadoPartido(torneoId, rondaIdx, partidoIdx, canchaNum, equipoSeleccionadoKey) {
        console.log("--- INICIO DE registrarResultadoPartido ---");
        console.log(`Argumentos: torneoId=${torneoId}, rondaIdx=${rondaIdx}, partidoIdx=${partidoIdx}, equipoSeleccionadoKey=${equipoSeleccionadoKey}`);
        
        if (!isAdminMode) {
            console.log("Acción denegada: no es modo admin.");
            return;
        }

        const torneo = torneos.find(t => t.id === torneoId);
        if (!torneo) {
            console.error("No se encontró el torneo con ID:", torneoId);
            return;
        }
        if (torneo.estado === 'historico') {
            alert("No se puede modificar un torneo ya finalizado. Debe reabrirlo primero (función futura).");
            return;
        }

        const partido = torneo.rondas[rondaIdx].partidos[partidoIdx];
        console.log("Estado del partido ANTES de modificar:", JSON.parse(JSON.stringify(partido)));
        
        const ganadorOriginal = partido.ganadorEquipoKey;
        const puntosCancha = PUNTOS_POR_CANCHA[canchaNum];

        // --- RUTA 1: Se hace clic en el ganador actual para LIMPIAR el resultado ---
        if (ganadorOriginal === equipoSeleccionadoKey) {
            console.log("Lógica: Se hizo clic en el ganador existente. Mostrando confirmación para limpiar.");
            if (confirm("Este equipo ya está marcado como ganador. ¿Deseas LIMPIAR el resultado de este partido para poder corregirlo?")) {
                console.log("Usuario confirmó LIMPIAR el resultado.");
                // Revertir puntos del ganador que se está quitando
                const ganadoresAnterioresNombres = ganadorOriginal === 'equipo1' ? partido.equipo1 : partido.equipo2;
                modificarPuntosRondaYTorneo(torneo, ganadoresAnterioresNombres, torneo.tipo === 'parejas' ? partido.datosParejasSiAplica : null, ganadorOriginal, -puntosCancha, canchaNum, false);
                
                // Limpiar el ganador
                partido.ganadorEquipoKey = null;
                console.log("Estado del partido DESPUÉS de limpiar:", JSON.parse(JSON.stringify(partido)));
            } else {
                console.log("Usuario canceló la limpieza.");
                return; // El usuario canceló la acción
            }
        } 
        // --- RUTA 2: Se establece un ganador nuevo o se cambia de un equipo a otro ---
        else {
            console.log("Lógica: Se está estableciendo un ganador nuevo o cambiando el ganador.");
            // Revertir puntos si había un ganador PREVIO y DIFERENTE
            if (ganadorOriginal) {
                console.log(`Había un ganador original (${ganadorOriginal}). Revirtiendo sus puntos.`);
                const ganadoresAnterioresNombres = ganadorOriginal === 'equipo1' ? partido.equipo1 : partido.equipo2;
                modificarPuntosRondaYTorneo(torneo, ganadoresAnterioresNombres, torneo.tipo === 'parejas' ? partido.datosParejasSiAplica : null, ganadorOriginal, -puntosCancha, canchaNum, false);
            }
            
            // Establecer el nuevo ganador
            partido.ganadorEquipoKey = equipoSeleccionadoKey;
            console.log(`Nuevo ganador establecido a: ${equipoSeleccionadoKey}`);
            
            // Otorgar puntos al nuevo ganador
            const nuevosGanadoresNombres = equipoSeleccionadoKey === 'equipo1' ? partido.equipo1 : partido.equipo2;
            modificarPuntosRondaYTorneo(torneo, nuevosGanadoresNombres, torneo.tipo === 'parejas' ? partido.datosParejasSiAplica : null, equipoSeleccionadoKey, puntosCancha, canchaNum, true);
        }

        // Guardar cambios y refrescar la vista
        guardarDatosCategoriaActual();
        console.log("Llamando a renderizarDetalleTorneo para refrescar la vista...");
        renderizarDetalleTorneo(torneoId);
        console.log("--- FIN DE registrarResultadoPartido ---");
    }
    
    function modificarPuntosRondaYTorneo(t, nJugs, dP, eqK, cantP, cN, esVic) {
        const esC1 = cN === 1;
        if (t.tipo === 'individual') {
            nJugs.forEach(n => { const jug = t.jugadores.find(j=>j.nombre===n); if(jug){
                jug.puntosRonda=(jug.puntosRonda||0)+cantP;
                if(esC1){ 
                    if(esVic && cantP > 0) jug.victoriasEnCancha1=(jug.victoriasEnCancha1||0)+1; 
                    else if (cantP < 0 && (jug.victoriasEnCancha1||0) > 0) jug.victoriasEnCancha1--;
                }
            }});
        } else { 
            if(!dP)return; 
            const pIdA = eqK === 'equipo1' ? dP.equipo1ParejaId : dP.equipo2ParejaId; 
            const par = t.parejas.find(p=>p.id===pIdA);
            if(par){ 
                par.puntosRonda=(par.puntosRonda||0)+cantP; 
                if(esC1){ 
                    if(esVic && cantP > 0)par.victoriasEnCancha1=(par.victoriasEnCancha1||0)+1; 
                    else if (cantP < 0 && (par.victoriasEnCancha1||0) > 0)par.victoriasEnCancha1--;
                }
                par.jugadoresNombres.forEach(n=>{
                    const jug=t.jugadores.find(j=>j.nombre===n && j.parejaId===pIdA); 
                    if(jug){
                        jug.puntosRonda=(jug.puntosRonda||0)+cantP;
                    }
                });
            }
        }
    }
    function renderizarTablaPuntosTorneoActual(t) {
        tablaPuntosTorneoActualBodyEl.innerHTML = ''; let items = [];
        if (t.tipo === 'individual') items = t.jugadores.map(j => ({ nombre: j.nombre, pR: j.puntosRonda, pE: j.puntosExtra || 0, total: (j.puntosRonda || 0) + (j.puntosExtra || 0) }));
        else items = t.parejas.map(p => ({ nombre: p.jugadoresNombres.join(' & '), pR: p.puntosRonda, pE: p.puntosExtra || 0, total: (p.puntosRonda || 0) + (p.puntosExtra || 0) }));
        items.sort((a,b) => b.total - a.total || b.pR - a.pR); 
        items.forEach(item => { const tr = document.createElement('tr'); tr.innerHTML = `<td data-label="Jugador/Pareja">${item.nombre}</td><td data-label="P. Rondas">${item.pR || 0}</td><td data-label="P. Extra">${item.pE || 0}</td><td data-label="Total Puntos Palmira">${item.total || 0}</td>`; tablaPuntosTorneoActualBodyEl.appendChild(tr); });
        if (items.length === 0) tablaPuntosTorneoActualBodyEl.innerHTML = '<tr><td colspan="4" data-label="Info">No hay puntos.</td></tr>';
    }

    function finalizarLogicaTorneo(torneo, esRefinalizacion = false) {
        if (esRefinalizacion) {
            restarPuntosExtraDeTorneo(torneo); 
        }

        const calcularBalanceEnfrentamientosDirectos = (objA, objB, torneoConsiderado) => {
            let victoriasA = 0; let victoriasB = 0;
            const nombresA = torneoConsiderado.tipo === 'individual' ? [objA.nombre] : objA.jugadoresNombres;
            const nombresB = torneoConsiderado.tipo === 'individual' ? [objB.nombre] : objB.jugadoresNombres;

            torneoConsiderado.rondas.forEach(ronda => {
                ronda.partidos.forEach(partido => {
                    if (!partido.equipo1 || !partido.equipo2) return;
                    const equipo1EsA = nombresA.every(n => partido.equipo1.includes(n)) && nombresA.length === partido.equipo1.length;
                    const equipo2EsA = nombresA.every(n => partido.equipo2.includes(n)) && nombresA.length === partido.equipo2.length;
                    const equipo1EsB = nombresB.every(n => partido.equipo1.includes(n)) && nombresB.length === partido.equipo1.length;
                    const equipo2EsB = nombresB.every(n => partido.equipo2.includes(n)) && nombresB.length === partido.equipo2.length;

                    if ((equipo1EsA && equipo2EsB) || (equipo2EsA && equipo1EsB)) {
                        if (partido.ganadorEquipoKey === 'equipo1') {
                            if (equipo1EsA) victoriasA++; else if (equipo1EsB) victoriasB++;
                        } else if (partido.ganadorEquipoKey === 'equipo2') {
                            if (equipo2EsA) victoriasA++; else if (equipo2EsB) victoriasB++;
                        }
                    }
                });
            });
            return victoriasA - victoriasB;
        };

        const compararJugadoresOParejas = (a, b) => {
            if ((a.puntosRonda || 0) !== (b.puntosRonda || 0)) return (b.puntosRonda || 0) - (a.puntosRonda || 0);
            const victoriasC1A = a.victoriasEnCancha1 || 0; const victoriasC1B = b.victoriasEnCancha1 || 0;
            if (victoriasC1A !== victoriasC1B) return victoriasC1B - victoriasC1A;
            const rondaAInfo = a.ultimaCanchaJugadaEnRonda; const rondaBInfo = b.ultimaCanchaJugadaEnRonda;
            const canchaA = rondaAInfo ? rondaAInfo.cancha : Infinity; const canchaB = rondaBInfo ? rondaBInfo.cancha : Infinity;
            if (canchaA !== canchaB) return canchaA - canchaB;
            if (rondaAInfo && rondaBInfo && rondaAInfo.ronda !== rondaBInfo.ronda) return (rondaBInfo.ronda || 0) - (rondaAInfo.ronda || 0);
            const balanceDirecto = calcularBalanceEnfrentamientosDirectos(a, b, torneo);
            if (balanceDirecto !== 0) return -balanceDirecto; 
            if (torneo.tipo === 'individual' && a.idOriginal !== undefined && b.idOriginal !== undefined) return a.idOriginal - b.idOriginal;
            return 0;
        };

        let entidadesParaOrdenar = torneo.tipo === 'individual' ? [...torneo.jugadores] : [...torneo.parejas];
        entidadesParaOrdenar.sort(compararJugadoresOParejas);

        torneo.rankingFinal = entidadesParaOrdenar.map((entidad, index) => {
            const posicion = index + 1;
            const puntosExtra = (torneo.tipo === 'individual' ? PUNTOS_EXTRA_INDIVIDUAL[posicion] : PUNTOS_EXTRA_PAREJAS[posicion]) || 0;
            entidad.puntosExtra = puntosExtra;
            if (torneo.tipo === 'parejas') {
                entidad.jugadoresNombres.forEach(nombreJugador => {
                    const jugadorObj = torneo.jugadores.find(j => j.nombre === nombreJugador && j.parejaId === entidad.id);
                    if (jugadorObj) jugadorObj.puntosExtra = puntosExtra;
                });
            }
            return { 
                nombre: torneo.tipo === 'individual' ? entidad.nombre : entidad.jugadoresNombres.join(' & '),
                posicion, puntosRonda: entidad.puntosRonda || 0, puntosExtra, total: (entidad.puntosRonda || 0) + puntosExtra 
            };
        });
        if (torneo.tipo === 'individual') { 
            torneo.jugadores.forEach(jugadorTorneo => {
                const rankingEntry = torneo.rankingFinal.find(r => r.nombre === jugadorTorneo.nombre);
                jugadorTorneo.puntosExtra = rankingEntry ? rankingEntry.puntosExtra : 0;
            });
        }

        if (!esRefinalizacion) { 
            torneo.estado = 'historico'; 
            actualizarPuntosGlobalesTrasFinalizar(torneo); 
        }
    }
    function restarPuntosExtraDeTorneo(t) { 
        const jugadoresAfectadosGlobal = new Set();
        if (t.tipo === 'individual') {
            t.jugadores.forEach(j => {
                if (j.puntosExtra > 0) jugadoresAfectadosGlobal.add(j.nombre);
                j.puntosExtra = 0;
            });
        } else { // parejas
            t.parejas.forEach(p => {
                if (p.puntosExtra > 0) {
                    p.jugadoresNombres.forEach(nJ => {
                        jugadoresAfectadosGlobal.add(nJ);
                        const jug = t.jugadores.find(j=>j.nombre===nJ && j.parejaId === p.id); 
                        if(jug) jug.puntosExtra=0;
                    });
                }
                p.puntosExtra = 0; 
            });
        }
    }
    function actualizarPuntosGlobalesTrasFinalizar(t) { if (t.tipo === 'individual') t.jugadores.forEach(j => { if (jugadoresGlobal[j.nombre]) recalcularPuntosGlobalesJugador(j.nombre); }); else t.parejas.forEach(p => p.jugadoresNombres.forEach(nJ => { if (jugadoresGlobal[nJ]) recalcularPuntosGlobalesJugador(nJ); }));}
    function recalcularPuntosGlobalesJugador(nJ) {
        if (!categoriaActiva || !jugadoresGlobal[nJ]) return; let pI=0,pP=0,tJ=0;
        const torneosDeCategoria = appData.datosPorCategoria[categoriaActiva].torneos || [];
        torneosDeCategoria.forEach(t=>{
            if(t.estado==='historico'){ 
                const jET=t.jugadores.find(j=>j.nombre===nJ); 
                if(jET){
                    const pTJ=(jET.puntosRonda||0)+(jET.puntosExtra||0); 
                    if(t.tipo==='individual')pI+=pTJ; 
                    else if(t.tipo==='parejas')pP+=pTJ; 
                    tJ++;
                }
            }
        });
        if(!jugadoresGlobal[nJ].puntosTotalesPorTipo) jugadoresGlobal[nJ].puntosTotalesPorTipo={individual:0,parejas:0,todos:0};
        jugadoresGlobal[nJ].puntosTotalesPorTipo.individual=pI; 
        jugadoresGlobal[nJ].puntosTotalesPorTipo.parejas=pP; 
        jugadoresGlobal[nJ].puntosTotalesPorTipo.todos=pI+pP; 
        jugadoresGlobal[nJ].torneosJugados=tJ;
    }
    btnFinalizarTorneo.addEventListener('click', () => {
        if (!categoriaActiva || !isAdminMode) return;
        const torneo = torneos.find(t => t.id === torneoActualSeleccionadoId); if (!torneo || torneo.estado === 'historico') return;
        if (!confirm(`Finalizar torneo "${torneo.nombre}"? Se calcularán puntos extra y no se podrán hacer más cambios (a menos que se edite).`)) return;
        finalizarLogicaTorneo(torneo, false); 
        guardarDatosCategoriaActual(); renderizarDetalleTorneo(torneo.id); renderizarListasDeTorneos();
        alert(`Torneo "${torneo.nombre}" finalizado. Puntos Palmira asignados.`);
    });

    filtroTipoTorneoResultadosEl.addEventListener('change', renderizarResultadosGlobales);
    if (filtroMesResultadosEl) filtroMesResultadosEl.addEventListener('change', renderizarResultadosGlobales);

    function popularFiltroMeses() {
        if (!categoriaActiva || !filtroMesResultadosEl) return; 
        filtroMesResultadosEl.innerHTML = '<option value="todos">Todos los tiempos</option>';
        const opcionesFiltro = new Map();
        const anoActual = new Date().getFullYear();
        const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

        torneos.forEach(torneo => {
            if (torneo.estado === 'historico' && torneo.fechaCreacion) {
                const fecha = new Date(torneo.fechaCreacion);
                const anioTorneo = fecha.getFullYear();
                const mesTorneoNum = fecha.getMonth();

                if (anioTorneo === anoActual) {
                    const mesKey = `${anioTorneo}-${String(mesTorneoNum + 1).padStart(2, '0')}`;
                    const nombreMesUsuario = `${nombresMeses[mesTorneoNum]} ${anioTorneo}`;
                    if (!opcionesFiltro.has(mesKey)) {
                        opcionesFiltro.set(mesKey, { texto: nombreMesUsuario, valor: mesKey, tipo: 'mes' });
                    }
                } else {
                    const anioKey = `${anioTorneo}`; 
                    const nombreAnioUsuario = `Todo ${anioTorneo}`;
                     if (!opcionesFiltro.has(anioKey)) {
                        opcionesFiltro.set(anioKey, { texto: nombreAnioUsuario, valor: anioKey, tipo: 'anio' });
                    }
                }
            }
        });
        const opcionesArray = Array.from(opcionesFiltro.values());
        opcionesArray.sort((a, b) => {
            if (a.tipo === 'mes' && b.tipo === 'anio') return -1;
            if (a.tipo === 'anio' && b.tipo === 'mes') return 1;
            return b.valor.localeCompare(a.valor);
        });
        opcionesArray.forEach(opcionData => {
            const option = document.createElement('option'); option.value = opcionData.valor; option.textContent = opcionData.texto;
            filtroMesResultadosEl.appendChild(option);
        });
    }

    function renderizarResultadosGlobales() {
        if (!categoriaActiva) return; 
        tablaResultadosGlobalesBodyEl.innerHTML = ''; 
        const tipoFiltro = filtroTipoTorneoResultadosEl.value;
        const mesAnioFiltro = filtroMesResultadosEl ? filtroMesResultadosEl.value : 'todos'; 

        const jugadoresPuntosFiltrados = {};
        Object.keys(jugadoresGlobal).forEach(nombreJugador => {
            jugadoresPuntosFiltrados[nombreJugador] = 0;
            torneos.forEach(torneo => { 
                if (torneo.estado === 'historico') {
                    let coincideTipo = (tipoFiltro === 'todos' || torneo.tipo === tipoFiltro);
                    let coincidePeriodo = false;
                    if (mesAnioFiltro === 'todos') {
                        coincidePeriodo = true;
                    } else if (torneo.fechaCreacion) {
                        const fechaTorneo = new Date(torneo.fechaCreacion);
                        const anioTorneo = fechaTorneo.getFullYear().toString();
                        const mesKeyTorneo = `${anioTorneo}-${String(fechaTorneo.getMonth() + 1).padStart(2, '0')}`;
                        if (mesAnioFiltro.length === 4) { 
                            if (anioTorneo === mesAnioFiltro) coincidePeriodo = true;
                        } else { 
                            if (mesKeyTorneo === mesAnioFiltro) coincidePeriodo = true;
                        }
                    }
                    if (coincideTipo && coincidePeriodo) {
                        const jugadorEnTorneo = torneo.jugadores.find(j => j.nombre === nombreJugador);
                        if (jugadorEnTorneo) {
                            jugadoresPuntosFiltrados[nombreJugador] += (jugadorEnTorneo.puntosRonda || 0) + (jugadorEnTorneo.puntosExtra || 0);
                        }
                    }
                }
            });
        });
        const jugArray = Object.entries(jugadoresPuntosFiltrados)
            .map(([nombre, puntosMostrados]) => ({ nombre, puntosMostrados }))
            .filter(j => j.puntosMostrados > 0 || (tipoFiltro === 'todos' && mesAnioFiltro === 'todos'))
            .sort((a, b) => b.puntosMostrados - a.puntosMostrados);
        jugArray.forEach((jug, idx) => { const tr = document.createElement('tr'); tr.innerHTML = `<td data-label="Pos.">${idx + 1}</td><td data-label="Jugador">${jug.nombre}</td><td data-label="Total Puntos Palmira">${jug.puntosMostrados}</td>`; tablaResultadosGlobalesBodyEl.appendChild(tr); });
        if (jugArray.length === 0) { 
            let msg = `No hay datos en ${categoriaActiva} para los filtros seleccionados.`;
            tablaResultadosGlobalesBodyEl.innerHTML = `<tr><td colspan="3" data-label="Info">${msg}</td></tr>`; 
        }
    }

    btnExportarRankingGlobalEl.addEventListener('click', () => {
        exportarRankingGlobalMovil();
    });

    function exportarRankingGlobalMovil() {
        if (!categoriaActiva) return;

        const tipoFiltro = filtroTipoTorneoResultadosEl.value;
        const mesAnioFiltro = filtroMesResultadosEl.value;
        const opcionMesSeleccionada = Array.from(filtroMesResultadosEl.options).find(opt => opt.value === mesAnioFiltro);
        const textoMesFiltro = opcionMesSeleccionada ? opcionMesSeleccionada.textContent : "Todos los tiempos";
        const textoTipoFiltro = tipoFiltro.charAt(0).toUpperCase() + tipoFiltro.slice(1);

        const jugadoresPuntosFiltrados = {};
        Object.keys(jugadoresGlobal).forEach(nombreJugador => {
            jugadoresPuntosFiltrados[nombreJugador] = 0;
            torneos.forEach(torneo => {
                if (torneo.estado === 'historico') {
                    let coincideTipo = (tipoFiltro === 'todos' || torneo.tipo === tipoFiltro);
                    let coincidePeriodo = (mesAnioFiltro === 'todos');
                    if (!coincidePeriodo && torneo.fechaCreacion) {
                        const fechaTorneo = new Date(torneo.fechaCreacion);
                        const anioTorneo = fechaTorneo.getFullYear().toString();
                        const mesKeyTorneo = `${anioTorneo}-${String(fechaTorneo.getMonth() + 1).padStart(2, '0')}`;
                        if (mesAnioFiltro.length === 4) { if (anioTorneo === mesAnioFiltro) coincidePeriodo = true; }
                        else { if (mesKeyTorneo === mesAnioFiltro) coincidePeriodo = true; }
                    }
                    if (coincideTipo && coincidePeriodo) {
                        const jugadorEnTorneo = torneo.jugadores.find(j => j.nombre === nombreJugador);
                        if (jugadorEnTorneo) {
                            jugadoresPuntosFiltrados[nombreJugador] += (jugadorEnTorneo.puntosRonda || 0) + (jugadorEnTorneo.puntosExtra || 0);
                        }
                    }
                }
            });
        });

        const jugArray = Object.entries(jugadoresPuntosFiltrados)
            .map(([nombre, puntos]) => ({ nombre, puntos }))
            .filter(j => j.puntos > 0 || (tipoFiltro === 'todos' && mesAnioFiltro === 'todos'))
            .sort((a, b) => b.puntos - a.puntos);

        if (jugArray.length === 0) {
            alert("No hay resultados para exportar con los filtros seleccionados.");
            return;
        }

        const reportDiv = document.getElementById('exportableMobileReport');
        const titleEl = document.getElementById('reportTournamentTitle');
        const infoEl = document.getElementById('reportTournamentInfo');
        const playerListEl = document.getElementById('reportPlayerList');
        const tableHeaderEl = reportDiv.querySelector('.report-table-header');

        titleEl.textContent = `Ranking Global`;
        infoEl.textContent = `${categoriaActiva} • ${textoTipoFiltro} • ${textoMesFiltro}`;
        playerListEl.innerHTML = '';
        tableHeaderEl.innerHTML = `<span>Pos.</span><span>Jugador</span><span></span><span style="text-align: right;">Puntos</span>`;

        jugArray.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'report-player-item';
            if (index === 0) li.classList.add('first-place');
            else if (index === 1) li.classList.add('second-place');
            else if (index === 2) li.classList.add('third-place');
            const trofeoHTML = index === 0 ? '<span class="trophy-icon">🏆</span>' : '';
            li.innerHTML = `
                <span class="player-pos">${index + 1}</span>
                <span class="player-name-report">${trofeoHTML}${item.nombre}</span>
                <span class="player-total-points-report">${item.puntos}</span>
            `;
            playerListEl.appendChild(li);
        });

        reportDiv.style.display = 'block';
        const logoImg = reportDiv.querySelector('.report-logo');
        const options = { scale: 2.5, backgroundColor: null, useCORS: true, logging: true, imageTimeout: 0 };

        const onImageLoad = () => {
            html2canvas(reportDiv, options).then(canvas => {
                const img = canvas.toDataURL('image/jpeg', 0.95);
                const link = document.createElement('a');
                link.download = `ranking_${categoriaActiva.replace(/\s+/g, '_')}.jpg`;
                link.href = img;
                link.click();
                reportDiv.style.display = 'none';
            }).catch(err => {
                console.error("Error al exportar ranking:", err);
                alert("Hubo un error al generar la imagen del ranking.");
                reportDiv.style.display = 'none';
            });
        };
        
        if (logoImg && logoImg.complete && logoImg.naturalHeight !== 0) onImageLoad();
        else if (logoImg) { logoImg.onload = onImageLoad; logoImg.onerror = () => { console.warn("Logo no se pudo cargar para exportación."); onImageLoad(); }; }
        else onImageLoad();
    }

    function exportarReporteMovilTorneo(torneoId) {
        if (!categoriaActiva) return;
        const torneo = torneos.find(t => t.id === torneoId);
        if (!torneo || torneo.estado !== 'historico' || !torneo.rankingFinal) {
            alert("Solo se pueden exportar los resultados de torneos finalizados.");
            return;
        }

        const reportDiv = document.getElementById('exportableMobileReport');
        const titleEl = document.getElementById('reportTournamentTitle');
        const infoEl = document.getElementById('reportTournamentInfo');
        const playerListEl = document.getElementById('reportPlayerList');
        const tableHeaderEl = reportDiv.querySelector('.report-table-header');
        
        titleEl.textContent = torneo.nombre;
        const fecha = new Date(torneo.fechaCreacion);
        const fechaFmt = `${fecha.getDate().toString().padStart(2, '0')}/${(fecha.getMonth() + 1).toString().padStart(2, '0')}/${fecha.getFullYear()}`;
        const tipoTorneoTexto = torneo.tipo.charAt(0).toUpperCase() + torneo.tipo.slice(1);
        infoEl.textContent = `${categoriaActiva} • ${tipoTorneoTexto} • ${fechaFmt}`;
        playerListEl.innerHTML = '';
        tableHeaderEl.innerHTML = `<span>Pos.</span><span>Jugador / Pareja</span><span>P. Rondas</span><span style="text-align: right;">Total</span>`;

        torneo.rankingFinal.forEach(item => {
            const li = document.createElement('li');
            li.className = 'report-player-item';

            if (item.posicion === 1) li.classList.add('first-place');
            else if (item.posicion === 2) li.classList.add('second-place');
            else if (item.posicion === 3) li.classList.add('third-place');

            const trofeoHTML = item.posicion === 1 ? '<span class="trophy-icon">🏆</span>' : '';

            li.innerHTML = `
                <span class="player-pos">${item.posicion}</span>
                <span class="player-name-report">${trofeoHTML}${item.nombre}</span>
                <span class="player-points-report">${item.puntosRonda}</span>
                <span class="player-total-points-report">${item.total}</span>
            `;
            playerListEl.appendChild(li);
        });

        reportDiv.style.display = 'block';
        const logoImg = reportDiv.querySelector('.report-logo');

        const options = {
            scale: 2.5,
            backgroundColor: null,
            useCORS: true,
            logging: true,
            imageTimeout: 0
        };

        const onImageLoad = () => {
            html2canvas(reportDiv, options).then(canvas => {
                const img = canvas.toDataURL('image/jpeg', 0.95);
                const link = document.createElement('a');
                link.download = `resultados_${torneo.nombre.replace(/\s+/g, '_')}_${categoriaActiva.replace(/\s+/g, '_')}.jpg`;
                link.href = img;
                link.click();
                reportDiv.style.display = 'none';
            }).catch(err => {
                console.error("Error al exportar reporte móvil:", err);
                alert("Hubo un error al generar la imagen del reporte.");
                reportDiv.style.display = 'none';
            });
        };

        if (logoImg && logoImg.complete && logoImg.naturalHeight !== 0) {
            onImageLoad();
        } else if (logoImg) {
            logoImg.onload = onImageLoad;
            logoImg.onerror = () => {
                console.warn("El logo no se pudo cargar para la exportación. Se continuará sin él.");
                onImageLoad();
            };
        } else {
            onImageLoad();
        }
    }

    function renderizarDashboardInicio() {
        if (!categoriaActiva || !jugadoresGlobal) {
            inicioDashboardEl.classList.add('hidden');
            return;
        }

        const jugadoresArray = Object.entries(jugadoresGlobal).map(([nombre, data]) => ({
            nombre,
            puntos: data.puntosTotalesPorTipo.todos || 0
        }));

        jugadoresArray.sort((a, b) => b.puntos - a.puntos);
        const top5 = jugadoresArray.slice(0, 5);

        top5RankingListEl.innerHTML = '';
        if (top5.length > 0 && top5.some(j => j.puntos > 0)) {
            top5.forEach((jugador, index) => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span class="rank-pos">${index + 1}.</span>
                    <span class="rank-name">${jugador.nombre}</span>
                    <span class="rank-points">${jugador.puntos} pts</span>
                `;
                top5RankingListEl.appendChild(li);
            });
        } else {
             top5RankingListEl.innerHTML = '<li>No hay jugadores con puntos en esta categoría.</li>';
        }
        inicioDashboardEl.classList.remove('hidden');


        const torneosFinalizados = torneos
            .filter(t => t.estado === 'historico')
            .sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

        if (torneosFinalizados.length > 0) {
            const ultimoTorneo = torneosFinalizados[0];
            const fecha = new Date(ultimoTorneo.fechaCreacion);
            const fechaFmt = `${fecha.getDate().toString().padStart(2, '0')}/${(fecha.getMonth() + 1).toString().padStart(2, '0')}/${fecha.getFullYear()}`;
            
            ultimoTorneoInfoEl.innerHTML = `
                <span class="torneo-name">${ultimoTorneo.nombre}</span>
                <span class="torneo-date">${fechaFmt}</span>
                <span class="torneo-ver">Ver Detalles <i class="fas fa-arrow-right"></i></span>
            `;
            ultimoTorneoInfoEl.onclick = () => {
                document.querySelector('.nav-button[data-tab="torneos"]').click();
                seleccionarTorneo(ultimoTorneo.id);
            };
            ultimoTorneoSectionEl.classList.remove('hidden');
        } else {
            ultimoTorneoSectionEl.classList.add('hidden');
        }
    }

    // --- GESTIÓN DE JUGADORES (TAB) ---
    filtroNombreJugadorInput.addEventListener('input', () => renderizarListaGlobalJugadores());
    function renderizarListaGlobalJugadores() {
        if (!categoriaActiva) return; 
        listaGlobalJugadoresEl.innerHTML = ''; 
        const filtro = filtroNombreJugadorInput.value.toLowerCase();
        const nombresJug = Object.keys(jugadoresGlobal).sort((a,b) => a.localeCompare(b)); 
        let count = 0;
        nombresJug.forEach(n => { 
            if (n.toLowerCase().includes(filtro)) { 
                count++; 
                const li = document.createElement('li');
                li.innerHTML = `
                    <span class="player-name">${n}</span>
                    <div class="player-actions admin-feature">
                        <button class="edit-player-button subtle-button icon-only" data-nombre-jugador="${n}" title="Editar Nombre"><i class="fas fa-edit"></i></button>
                        <button class="delete-player-button danger-action icon-only" data-nombre-jugador="${n}" title="Eliminar Jugador"><i class="fas fa-user-times"></i></button>
                    </div>
                `;
                const playerActions = li.querySelector('.player-actions');
                if (playerActions) {
                    playerActions.querySelector('.edit-player-button').addEventListener('click', (e) => abrirModalEditarNombreJugador(e.currentTarget.dataset.nombreJugador));
                    playerActions.querySelector('.delete-player-button').addEventListener('click', (e) => confirmarEliminarJugador(e.currentTarget.dataset.nombreJugador));
                }
                listaGlobalJugadoresEl.appendChild(li); 
            }
        });
        if (count === 0 && filtro) listaGlobalJugadoresEl.innerHTML = '<li>No se encontraron jugadores.</li>';
        else if (nombresJug.length === 0) listaGlobalJugadoresEl.innerHTML = '<li>No hay jugadores registrados.</li>';
        
        updateAdminUI();
    }
    function abrirModalEditarNombreJugador(nombreActual) {
        if (!categoriaActiva || !isAdminMode) return;
        jugadorParaEditarNombre = nombreActual;
        nombreJugadorActualInput.value = nombreActual;
        nombreJugadorNuevoInput.value = '';
        nombreJugadorNuevoInput.placeholder = `Nuevo nombre para ${nombreActual}`;
        dynamicCategoryNameModalElements.forEach(el => el.textContent = categoriaActiva);
        openModal(modalEditarNombreJugador);
    }
    btnConfirmarEditarNombreJugador.addEventListener('click', () => {
        if (!categoriaActiva || !isAdminMode || !jugadorParaEditarNombre) return;
        const nActual = jugadorParaEditarNombre;
        const nNuevo = nombreJugadorNuevoInput.value.trim().replace(/\s+/g, ' ');
        if (!nNuevo) { alert("Nombre nuevo no puede estar vacío."); return; }
        const nNuevoNorm = nNuevo.toLowerCase(); const nActualNorm = nActual.toLowerCase();
        if (nNuevoNorm !== nActualNorm && Object.keys(jugadoresGlobal).some(k => k.toLowerCase() === nNuevoNorm)) { alert(`"${nNuevo}" ya existe. Elige otro.`); return; }
        if (!confirm(`Cambiar "${nActual}" a "${nNuevo}" en ${categoriaActiva}?\nEsto afectará TODOS los torneos y resultados.`)) return;
        if (jugadoresGlobal[nActual]) { if (nActualNorm !== nNuevoNorm || nActual !== nNuevo) { jugadoresGlobal[nNuevo] = jugadoresGlobal[nActual]; delete jugadoresGlobal[nActual]; }}
        torneos.forEach(t => {
            t.jugadores.forEach(j => { if (j.nombre === nActual) j.nombre = nNuevo; if (j.historialParejasRonda) j.historialParejasRonda.forEach(h => { if (h.companeroNombre === nActual) h.companeroNombre = nNuevo; }); });
            if (t.tipo === 'parejas') t.parejas.forEach(p => p.jugadoresNombres = p.jugadoresNombres.map(n => n === nActual ? nNuevo : n));
            t.rondas.forEach(r => r.partidos.forEach(p => { p.equipo1 = p.equipo1.map(n => n === nActual ? nNuevo : n); p.equipo2 = p.equipo2.map(n => n === nActual ? nNuevo : n); if (p.jugadoresEnCanchaNombres) p.jugadoresEnCanchaNombres = p.jugadoresEnCanchaNombres.map(n => n === nActual ? nNuevo : n); }));
            if (t.rankingFinal) t.rankingFinal.forEach(rI => { if (t.tipo==='individual' && rI.nombre===nActual) rI.nombre=nNuevo; else if (t.tipo==='parejas' && rI.nombre.includes(nActual)) rI.nombre = rI.nombre.split(' & ').map(n => n === nActual ? nNuevo : n).join(' & ');});
        });
        guardarDatosCategoriaActual(); closeModal(modalEditarNombreJugador); renderizarListaGlobalJugadores();
        if (torneoActualSeleccionadoId) renderizarDetalleTorneo(torneoActualSeleccionadoId); renderizarResultadosGlobales();
        alert(`Nombre cambiado de "${nActual}" a "${nNuevo}" en ${categoriaActiva}.`);
    });

    function confirmarEliminarJugador(nombreJugador) {
        if (!categoriaActiva || !isAdminMode || !jugadoresGlobal[nombreJugador]) return;
        const torneosActivosConJugador = torneos.filter(t => 
            t.estado === 'actual' && 
            (t.jugadores.some(j => j.nombre === nombreJugador) || 
             (t.tipo === 'parejas' && t.parejas.some(p => p.jugadoresNombres.includes(nombreJugador))))
        );
        if (torneosActivosConJugador.length > 0) {
            alert(`"${nombreJugador}" participa en ${torneosActivosConJugador.length} torneo(s) activo(s).\nNo se puede eliminar.`);
            return;
        }
        if (confirm(`ELIMINAR a "${nombreJugador}" de ${categoriaActiva}?\nNo estará disponible para futuros torneos y se quitará de rankings globales.\nResultados históricos NO se alterarán.`)) {
            delete jugadoresGlobal[nombreJugador]; 
            guardarDatosCategoriaActual();
            renderizarListaGlobalJugadores(); 
            renderizarResultadosGlobales(); 
            if(modalCrearTorneo.style.display === 'block') actualizarInputsJugadores();
            alert(`Jugador "${nombreJugador}" eliminado de ${categoriaActiva}.`);
        }
    }

    function confirmarEliminarTorneo(torneoId) {
        if (!isAdminMode) return;
        console.log("confirmarEliminarTorneo llamado para ID:", torneoId); 
        if (!categoriaActiva) {
            console.error("No hay categoría activa para eliminar el torneo.");
            return;
        }

        const torneoIndex = torneos.findIndex(t => t.id === torneoId);
        if (torneoIndex === -1) {
            console.error("Torneo no encontrado para eliminar:", torneoId, "en torneos:", torneos);
            alert("Error: Torneo no encontrado para eliminar.");
            return;
        }
        const torneoAEliminar = torneos[torneoIndex];

        if (confirm(`¿Estás SEGURO de eliminar el torneo "${torneoAEliminar.nombre}" de la categoría "${categoriaActiva}"?\nEsta acción es IRREVERSIBLE y también afectará los Puntos Palmira globales de los jugadores participantes en esta categoría.`)) {
            console.log(`Eliminando torneo: ${torneoAEliminar.nombre} (ID: ${torneoId})`);

            const jugadoresAfectados = new Set();
            if (torneoAEliminar.estado === 'historico') {
                torneoAEliminar.jugadores.forEach(j => jugadoresAfectados.add(j.nombre));
            }

            torneos.splice(torneoIndex, 1); 
            console.log("Torneo eliminado de la lista en memoria. Torneos restantes:", torneos.length);

            jugadoresAfectados.forEach(nombreJugador => {
                if (jugadoresGlobal[nombreJugador]) {
                    console.log(`Recalculando puntos para jugador afectado: ${nombreJugador}`);
                    recalcularPuntosGlobalesJugador(nombreJugador);
                }
            });

            guardarDatosGlobales().then(() => {
                console.log("Datos guardados en Google Sheets después de eliminar torneo.");
                alert(`Torneo "${torneoAEliminar.nombre}" eliminado permanentemente.`);
                mostrarVistaListaTorneos(); 
                renderizarListasDeTorneos(); 
                renderizarResultadosGlobales();
                popularFiltroMeses(); 
            }).catch(error => {
                console.error("Error al guardar datos después de eliminar torneo:", error);
                alert("El torneo se eliminó de la vista actual, pero hubo un error al guardar los cambios en la nube. Por favor, recarga la aplicación.");
            });
        } else {
            console.log("Eliminación de torneo cancelada por el usuario.");
        }
    }

    // --- PERSISTENCIA ---
    function guardarDatosCategoriaActual() { if (!categoriaActiva || !isAdminMode) return; guardarDatosGlobales(); }

    // --- INICIALIZACIÓN ---
    async function initApp() {
        checkAdminSession();
        await cargarDatosGlobales();
        mostrarPantallaCategorias();
    }
    initApp();
});
