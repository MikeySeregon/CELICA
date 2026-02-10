import { supabase } from './supabase.js';
const { jsPDF } = window.jspdf; // ya lo hacías correctamente en generarPDF()

// Datos de ejemplo (puedes reemplazar con consultas reales)
let clientes = [];
let camiones = [];
let servicios = [];
let preciosServicios = [];
let direcciones = [];
let choiceDireccion = null;
let preciosPorCamion = {}; // cache precios por id_camion

const params = new URLSearchParams(window.location.search);
const idCotizacion = params.get('id');
const modo = params.get('modo');

// Cotización inicial
let cotizacion = {
	id_cotizacion: null,
	fecha: new Date().toISOString().slice(0, 10),
	estado: 7, // Parcial
	id_camion: null,
	camion: '',
	cliente: { id_cliente: null, nombre: '', direccion: '', dni: null, rtn: null, es_nuevo: false },
	lineas: [], // kept for backward compatibility (legacy single-cam usage)
	camiones: [], // nuevo: lista de camiones con sus lineas
	totales: { subtotal: 0, isv: 0, total: 0 }
};

async function cargarCotizacionExistente(id){
	const { data: cab, error } = await supabase
		.from('cotizaciones')
		.select('*')
		.eq('id_cotizacion', id)
		.single();

	if (error) throw error;

	cotizacion.id_cotizacion = cab.id_cotizacion;
	cotizacion.fecha = cab.fecha_cotizacion;
	cotizacion.estado = cab.id_estado;
	cotizacion.id_camion = cab.id_camion;
	cotizacion.camion = cab.camion || '';

	document.getElementById('fechaCotizacion').value = cab.fecha_cotizacion;

	await cargarPreciosCamion(cab.id_camion);
	/*choiceCamion.setChoiceByValue(String(cab.id_camion));*/

	/*cotizacion.lineas = [];*/

	const clienteBD = clientes.find(c => c.nombre_legal === cab.cliente);

	if (clienteBD) {
		choiceCliente.setChoiceByValue(String(clienteBD.dni));

		cotizacion.cliente = {
			id_cliente: clienteBD.dni,
			nombre: clienteBD.nombre_legal,
			direccion: clienteBD.direccion,
			dni: clienteBD.dni,
			rtn: clienteBD.rtn,
			es_nuevo: false
		};

		document.getElementById('inputDNI').value = clienteBD.dni;
		document.getElementById('inputRTN').value = clienteBD.rtn;
	} else {
		// Cliente manual
		cotizacion.cliente = {
			id_cliente: null,
			nombre: cab.cliente,
			direccion: cotizacion.cliente.direccion,
			dni: '',
			rtn: '',
			es_nuevo: true
		};
	}

	// intentar cargar camiones asociados a la cotización
	const { data: camRows } = await supabase
		.from('cotizacion_camiones')
		.select('*')
		.eq('id_cotizacion', id)
		.order('orden', { ascending: true });

	if (camRows && camRows.length) {
		cotizacion.camiones = [];
		for (const cr of camRows) {
			const camObj = {
				id: cr.id,
				id_camion: cr.id_camion,
				camion: cr.camion,
				orden: cr.orden,
				lineas: []
			};

			const { data: detalles = [] } = await supabase
				.from('cotizacion_detalle')
				.select('*')
				.eq('id_cotizacion_camion', cr.id);

			camObj.lineas = (detalles || []).map(d => ({
				id_linea: crypto.randomUUID(),
				id: d.id,
				id_servicio: d.id_servicio,
				descripcion: d.descripcion_servicio,
				precio_unitario: d.precio_unitario,
				cantidad: d.cantidad,
				total_linea: d.total_linea,
				es_camion: d.id_servicio === null
			}));

			// si no existe la línea camión, añadirla al inicio
			if (!camObj.lineas.find(l => l.es_camion)) {
				camObj.lineas.unshift({
					id_linea: crypto.randomUUID(),
					id: null,
					id_servicio: null,
					descripcion: camObj.camion || `Camión ${cr.id_camion}`,
					precio_unitario: 0,
					cantidad: 0,
					total_linea: 0,
					es_camion: true
				});
			}

			cotizacion.camiones.push(camObj);
		}

		// compatibilidad: setear primer camión como seleccionado global
		if (cotizacion.camiones.length) {
			cotizacion.id_camion = cotizacion.camiones[0].id_camion;
			cotizacion.camion = cotizacion.camiones[0].camion;
		}

	} else {
		// fallback: cargar detalle antiguo (compatibilidad)
		const { data: det } = await supabase
			.from('cotizacion_detalle')
			.select('*')
			.eq('id_cotizacion', id)
			.not('id_servicio', 'is', null);

		cotizacion.lineas = det.map(d => ({
			id_linea: crypto.randomUUID(),
			id: d.id,
			id_servicio: d.id_servicio,
			descripcion: d.descripcion_servicio,
			precio_unitario: d.precio_unitario,
			cantidad: d.cantidad,
			total_linea: d.total_linea,
			es_camion: d.id_servicio === null
		}));

		if (!cotizacion.lineas.find(l => l.es_camion)) {
			cotizacion.lineas.unshift({
				id_linea: crypto.randomUUID(),
				id_servicio: null,
				nombre_servicio: 'Camión',
				descripcion: camiones.find(c => c.id_camion === cab.id_camion)?.camion || `Camión ${cab.id_camion}`,
				precio_unitario: 0,
				cantidad: 0,
				total_linea: 0,
				es_camion: true
			});
		}
	}
	
	recalcularTotales();
	actualizarTabla();
	if (cotizacion.estado === 6) {
		document.querySelectorAll('button, input, select')
			.forEach(el => el.disabled = true);
	}
}

// Choices.js
let choiceCliente = new Choices('#selectCliente', {searchEnabled:true, removeItemButton:true});
let choiceCamion = new Choices('#selectCamion', {searchEnabled:true});

function initDropdowns() {
	choiceCliente.setChoices(clientes.map(c => ({ value: c.dni, label: c.nombre_legal })), 'value', 'label', false);
	choiceCamion.setChoices(camiones.map(c => ({ value: c.id_camion, label: c.camion })), 'value', 'label', false);
}

async function initDropdownsEditar() {
	// Inicializar clientes
	choiceCliente.setChoices(
		clientes.map(c => ({ value: c.dni, label: c.nombre_legal })),
		'value',
		'label',
		false
	);

	// Seleccionar cliente de la cotización
	if (cotizacion.cliente && cotizacion.cliente.dni) {
		choiceCliente.setChoiceByValue(String(cotizacion.cliente.dni));
		document.getElementById('inputClienteNombre').value = cotizacion.cliente.nombre;
		choiceDireccion.setChoiceByValue(cotizacion.cliente.direccion);
		document.getElementById('inputDNI').value = cotizacion.cliente.dni;
		document.getElementById('inputRTN').value = cotizacion.cliente.rtn;
	}

	// Inicializar camiones
	let opcionesCamiones = camiones.map(c => ({ value: c.id_camion, label: c.camion }));

	if (cotizacion.id_camion && !camiones.some(c => c.id_camion === cotizacion.id_camion)) {
        opcionesCamiones.push({
            value: cotizacion.id_camion,
            label: `Camión ${cotizacion.id_camion} (inactivo)`
        });
    }

	if (choiceCamion) choiceCamion.destroy();

	const selectCamionElem = document.getElementById('selectCamion');
    selectCamionElem.innerHTML = '';
    opcionesCamiones.forEach(op => {
        const option = document.createElement('option');
        option.value = op.value;
        option.text = op.label;
        selectCamionElem.add(option);
    });
	selectCamionElem.disabled = true;

	choiceCamion = new Choices(selectCamionElem, { searchEnabled: true });

	if (cotizacion.id_camion) {
        choiceCamion.setChoiceByValue(String(cotizacion.id_camion));
        choiceCamion.disable();
		/*document.getElementById('btnAgregarLinea').disabled = false;*/
    }
}

// ---------------- Eventos ----------------
document.addEventListener('DOMContentLoaded', async () => {
	document.getElementById('fechaCotizacion').value = cotizacion.fecha;

	await cargarDatos();
	/*initDropdowns();*/
	initDropdownDirecciones();
	if (modo === 'editar' && idCotizacion) {
		await cargarCotizacionExistente(idCotizacion);
		await initDropdownsEditar();
		await initDropdownDirecciones(cotizacion.cliente.direccion || '');
	} else {
		initDropdowns(); // modo nuevo
	}

	// render inicial (al inicio puede no haber camiones)
	renderCamionesUI();

	// botón global (legacy) informa al usuario que use el botón dentro de cada camión
	/*document.getElementById('btnAgregarLinea').addEventListener('click', function(){
		alert('Use el botón "+ Agregar servicio" dentro de la tarjeta del camión correspondiente.');
	});*/

	// botón para agregar camión
	document.getElementById('btnAgregarCamion').addEventListener('click', agregarCamionSeleccionado);
	document.getElementById('btnClienteManual').addEventListener('click', clienteManual);
	document.getElementById('btnGuardar').addEventListener('click', () => guardarParcial(cotizacion));
	document.getElementById('btnEmitir').addEventListener('click', () => emitirCotizacion(cotizacion));
	document.getElementById('btnAnular').addEventListener('click', anularCotizacion);
	document.getElementById('selectCamion').addEventListener('change', seleccionarCamion);
	document.getElementById('selectCliente').addEventListener('change', seleccionarCliente);
});

// ---------------- Funciones ----------------
async function cargarDatos() {
	const hoy = new Date().toISOString().slice(0, 10);

	const [{ data: c }, { data: cam }, { data: s }, { data: p }, { data: d }] = await Promise.all([
		supabase.from('clientes').select('*').eq('estado', 1),
		supabase.from('camiones').select('*').eq('estado', 1),
		supabase.from('servicios').select('*').eq('estado', 1),
		supabase.from('precios_servicio')
			.select('*')
			.eq('estado', 1)
			.lte('fecha_inicio', hoy)
			.gte('fecha_fin', hoy),
		supabase.from('direcciones').select('*').eq('estado', 1)
	]);

	clientes = c || [];
	camiones = cam || [];
	servicios = s || [];
	preciosServicios = p || [];
	direcciones = d || [];
}

async function cargarPreciosCamion(id_camion) {
	const hoy = new Date().toISOString().slice(0, 10);

	const { data, error } = await supabase
		.from('precios_servicio')
		.select('*')
		.eq('id_camion', id_camion)
		.eq('estado', 1)
		.lte('fecha_inicio', hoy)
		.gte('fecha_fin', hoy);

	preciosPorCamion[id_camion] = error ? [] : data || [];

	// mantener compatibilidad con variables previas cuando corresponda
	if (!preciosServicios || preciosServicios.length === 0) {
		preciosServicios = preciosPorCamion[id_camion];
	}

	return preciosPorCamion[id_camion];
}

function obtenerPrecioServicio(id_camion, id_servicio) {

	const precios = preciosPorCamion[id_camion] || preciosServicios || [];
	const p = precios.find(x => x.id_servicio === id_servicio && (x.id_camion === undefined || x.id_camion === id_camion));
	return p ? p.precio : 0;
}

function obtenerServiciosDisponibles(id_camion, id_linea) {
	if (!id_camion) return [];

	const precios = preciosPorCamion[id_camion] || [];

	return precios
		.map(p => {
			const s = servicios.find(x => x.id_servicio === p.id_servicio);
			return s ? { ...s, precio: p.precio } : null;
		})
		.filter(Boolean)
		.filter(s => {
			// evitar duplicados solo dentro del mismo camión
			return !cotizacion.camiones.some(cam => cam.id_camion === id_camion && cam.lineas.some(l => l.id_servicio === s.id_servicio && l.id_linea !== id_linea));
		});
}

async function seleccionarCamion(e) {
	if (modo === 'editar') {
		e.target.value = cotizacion.id_camion;
		return;
	}
	const id = parseInt(e.target.value);
	/*if (cotizacion.id_camion && cotizacion.camiones.some(cam => (cam.lineas||[]).some(l => !l.es_camion))) {
		alert('No se puede cambiar el camión con servicios agregados.');
		e.target.value = cotizacion.id_camion;
		return;
	}*/

	cotizacion.id_camion = id;
	cotizacion.camion = getSelectedText(e.target);
	await cargarPreciosCamion(id);

	// legacy: si no hay camiones añadidos automáticamente, agregar la línea camión principal
	if (!cotizacion.camiones.length) {
		agregarLineaCamion();
		/*document.getElementById('btnAgregarLinea').disabled = false;*/
	}

	renderCamionesUI();
}

function agregarLineaCamion() {
	// Legacy helper: convertir a estructura de camiones si no existe
	if (!cotizacion.camiones.length) {
		const sel = document.getElementById('selectCamion');
		const id_cam = parseInt(sel.value) || cotizacion.id_camion;
		const camionObj = {
			id: null,
			id_camion: id_cam,
			camion: getSelectedText(document.getElementById('selectCamion')) || cotizacion.camion || '',
			orden: 1,
			lineas: [
				{
					id_linea: crypto.randomUUID(),
					id: null,
					id_servicio: null,
					descripcion: getSelectedText(document.getElementById('selectCamion')) || cotizacion.camion || '',
					precio_unitario: 0,
					cantidad: 0,
					total_linea: 0,
					es_camion: true
				}
			]
		};
		cotizacion.camiones.push(camionObj);
	}
}

function getSelectedText(select) {
	return select.options[select.selectedIndex]?.text || '';
}

function agregarLineaServicio() {
	// Legacy global add-line; now use per-camión buttons inside each camión card
	alert('Use el botón "+ Agregar servicio" dentro de la tarjeta del camión correspondiente.');
}

function contarLineasTotales(){
	return cotizacion.camiones.reduce((acc, c) => acc + (c.lineas?.length || 0), 0);
}

function agregarCamionSeleccionado(){
	const sel = document.getElementById('selectCamion');
	const id_camion = parseInt(sel.value);
	if (!id_camion) { alert('Seleccione un camión'); return; }

	if (contarLineasTotales() + 1 > 12) { alert('Límite de 12 líneas alcanzado'); return; }

	if (cotizacion.camiones.some(c => c.id_camion === id_camion)) { alert('Camión ya agregado'); return; }

	const camionObj = {
		id: null,
		id_camion: id_camion,
		camion: getSelectedText(sel),
		orden: cotizacion.camiones.length + 1,
		lineas: [
			{
				id_linea: crypto.randomUUID(),
				id: null,
				id_servicio: null,
				descripcion: getSelectedText(sel),
				precio_unitario: 0,
				cantidad: 0,
				total_linea: 0,
				es_camion: true
			}
		]
	};

	cotizacion.camiones.push(camionObj);
	if (!cotizacion.id_camion) {
		cotizacion.id_camion = id_camion;
		cotizacion.camion = camionObj.camion;
	}

	cargarPreciosCamion(id_camion).then(()=>{
		recalcularTotales();
		renderCamionesUI();
	});
}

function agregarLineaServicioEnCamion(id_camion_or_index){
	const cam = cotizacion.camiones.find(c=>c.id_camion===id_camion_or_index) || cotizacion.camiones[id_camion_or_index];
	if (!cam) return;
	if (contarLineasTotales() + 1 > 12) { alert('Límite de 12 líneas alcanzado'); return; }
	cam.lineas.push({
		id_linea: crypto.randomUUID(),
		id: null,
		id_servicio: null,
		descripcion: '',
		precio_unitario: 0,
		cantidad: 1,
		total_linea: 0,
		es_camion: false
	});
	recalcularTotales();
	renderCamionesUI();
}

function eliminarCamionPorIndex(idx){
	if (!confirm('Eliminar este camión y sus líneas?')) return;
	cotizacion.camiones.splice(idx,1);
	cotizacion.camiones.forEach((c,i)=>c.orden = i+1);
	if (cotizacion.camiones.length) {
		cotizacion.id_camion = cotizacion.camiones[0].id_camion;
		cotizacion.camion = cotizacion.camiones[0].camion;
	} else {
		cotizacion.id_camion = null;
		cotizacion.camion = '';
	}
	recalcularTotales();
	renderCamionesUI();
}

function renderCamionesUI(){
	const container = document.getElementById('camionesContainer');
	container.innerHTML = '';
	container.style.overflow = 'visible';
	container.style.position = 'relative';

	cotizacion.camiones.forEach((cam, idx) => {
		const card = document.createElement('div');
		card.className = 'card mb-3';
		card.style.overflow = 'visible';
		card.style.position = 'relative';
		card.innerHTML = `
			<div class="card-body" style="overflow: visible; position: relative; z-index: 1;">
				<div class="d-flex justify-content-between mb-2">
					<h5>Camión ${cam.orden}</h5>
					<div>
						<button class="btn btn-sm btn-danger" data-idx="${idx}" onclick="eliminarCamionPorIndex(${idx})">Eliminar camión</button>
					</div>
				</div>
				<div class="mb-2">
					<input type="text" class="form-control" value="${cam.camion}" onchange="(function(e){ cotizacion.camiones[${idx}].camion = e.target.value; renderCamionesUI(); })(event)">
				</div>
				<div class="mb-2">
					<button class="btn btn-sm btn-success" onclick="agregarLineaServicioEnCamion(${cam.id_camion || idx})">+ Agregar servicio</button>
				</div>
				<div class="table-responsive" style="overflow: visible !important; position: relative; z-index: 1;">
					<table class="table table-bordered lineas-table" style="position: relative; z-index: 1;">
						<thead class="table-light">
							<tr><th>#</th><th>Servicio</th><th>Descripción</th><th>Cantidad</th><th>Precio</th><th>Total</th><th>Acciones</th></tr>
						</thead>
						<tbody id="cam_${idx}_body">
						</tbody>
					</table>
				</div>
			</div>
		`;

		container.appendChild(card);

		const tbody = document.getElementById(`cam_${idx}_body`);
		tbody.innerHTML = '';
		cam.lineas.forEach((l, i) => {
			const tr = document.createElement('tr');
			if (l.es_camion) {
				tr.innerHTML = `
					<td>${i+1}</td>
					<td>Camión</td>
					<td><input type="text" class="form-control" value="${l.descripcion}" onchange="(function(e){ cotizacion.camiones[${idx}].lineas[${i}].descripcion = e.target.value; })(event)"></td>
					<td>-</td>
					<td>-</td>
					<td>-</td>
					<td></td>
				`;
			} else {
				tr.innerHTML = `
					<td>${i+1}</td>
					<td>${generarDropdownServicio(cam.id_camion, l.id_linea, l.id_servicio)}</td>
					<td><input type="text" class="form-control" value="${l.descripcion}" onchange="(function(e){ cotizacion.camiones[${idx}].lineas[${i}].descripcion = e.target.value; })(event)"></td>
					<td><input type="number" class="form-control" value="${l.cantidad}" min="1" onchange="(function(e){ cotizacion.camiones[${idx}].lineas[${i}].cantidad = parseInt(e.target.value)||0; cotizacion.camiones[${idx}].lineas[${i}].total_linea = redondeoBancario((parseInt(e.target.value)||0) * (cotizacion.camiones[${idx}].lineas[${i}].precio_unitario||0)); renderCamionesUI(); recalcularTotales(); })(event)"></td>
					<td><input type="number" class="form-control" value="${l.precio_unitario}" step="0.01" onchange="(function(e){ cotizacion.camiones[${idx}].lineas[${i}].precio_unitario = parseFloat(e.target.value)||0; cotizacion.camiones[${idx}].lineas[${i}].total_linea = redondeoBancario((parseInt(cotizacion.camiones[${idx}].lineas[${i}].cantidad)||0)*(parseFloat(e.target.value)||0)); renderCamionesUI(); recalcularTotales(); })(event)"></td>
					<td>${(l.total_linea||0).toFixed(2)}</td>
					<td><button class="btn btn-sm btn-danger" onclick="(function(){ cotizacion.camiones[${idx}].lineas.splice(${i},1); renderCamionesUI(); recalcularTotales(); })()">Eliminar</button></td>
				`;
			}
			tbody.appendChild(tr);
		});
	});

	// Attach event listeners to selects inside each camión table
	cotizacion.camiones.forEach((cam, camIdx) => {
		cam.lineas.forEach((l, lineIdx) => {
			if (!l.es_camion) {
				const sel = document.getElementById(`servicio_${l.id_linea}`);
				if (sel) {
					if (sel.choicesInstance) sel.choicesInstance.destroy();
					const choices = new Choices(sel, { 
						searchEnabled: true, 
						placeholder: true, 
						placeholderValue: 'Seleccione una opción', 
						removeItemButton: false, 
						shouldSort: false,
						maxItemCount: 1
					});
					sel.choicesInstance = choices;
					// Aplicar estilos adicionales al contenedor de Choices creado
					const choicesContainer = sel.closest('.choices');
					if (choicesContainer) {
						choicesContainer.style.position = 'relative';
						choicesContainer.style.zIndex = '1000';
					}
					sel.addEventListener('change', function(e){ cambiarServicioEnCamion(e, camIdx, lineIdx); });
				}
			}
		});
	});

	// actualizar display de totales
	document.getElementById('subtotal').innerText = cotizacion.totales.subtotal.toFixed(2);
	document.getElementById('isv').innerText = cotizacion.totales.isv.toFixed(2);
	document.getElementById('total').innerText = cotizacion.totales.total.toFixed(2);
}

function clienteManual() {
	cotizacion.cliente.es_nuevo = true;
	document.getElementById('inputClienteNombre').value = '';
	document.getElementById('selectDireccion').value = '';
	document.getElementById('inputDNI').value = '';
	document.getElementById('inputRTN').value = '';
	document.getElementById('selectCliente').disabled = true;
}

function seleccionarCliente(event) {
	const dni = event.target.value;
	const c = clientes.find(x => String(x.dni) === String(dni));
	if (c) {
		cotizacion.cliente = {
			id_cliente: c.dni,
			nombre: c.nombre_legal,
			direccion: c.direccion,
			dni: c.dni,
			rtn: c.rtn,
			es_nuevo: false
		};
		document.getElementById('inputClienteNombre').value = c.nombre_legal;
		document.getElementById('selectDireccion').value = c.direccion;
		document.getElementById('inputDNI').value = c.dni;
		document.getElementById('inputRTN').value = c.rtn;
	}
}

function actualizarTabla() {
	const tbody = document.querySelector('#tablaLineas tbody');
	tbody.innerHTML = '';

	cotizacion.lineas.forEach((l, i) => {
		const tr = document.createElement('tr');

		if (l.es_camion) {
			tr.innerHTML = `
				<td>${i+1}</td>
				<td>${l.nombre_servicio}</td>
				<td><input type="text" class="form-control" value="${cotizacion.camion || l.descripcion}" ${!esEditable() ? 'readonly' : ''} onchange="editarCamion(event)"></td>
				<td>-</td>
				<td>-</td>
				<td>-</td>
				<td></td>
			`;
		} else {
			tr.innerHTML = `
				<td>${i+1}</td>
				<td>${generarDropdownServicio(cotizacion.id_camion, l.id_linea, l.id_servicio)}</td>
				<td><input type="text" class="form-control" value="${l.descripcion}" ${!esEditable() ? 'readonly' : ''} data-id="${l.id_linea}" onchange="editarDescripcion(event)"></td>
				<td><input type="number" class="form-control" value="${l.cantidad || 1}" min="1" ${!esEditable() ? 'readonly' : ''} data-id="${l.id_linea}" onchange="editarCantidad(event)"></td>
				<td><input type="number" class="form-control" value="${l.precio_unitario || 0}" min="0" step="0.01" ${!esEditable() ? 'readonly' : ''} data-id="${l.id_linea}" onchange="editarPrecio(event)"></td>
				<td>${l.total_linea.toFixed(2)}</td>
				<td>${esEditable() ? `<button class="btn btn-danger btn-sm" onclick="eliminarLinea('${l.id_linea}')">Eliminar</button>` : ''}</td>
			`;
		}

		tbody.appendChild(tr);
	});

	cotizacion.lineas.forEach(l => {
		if (!l.es_camion && esEditable()) {
			const select = document.getElementById(`servicio_${l.id_linea}`);
			if (select) {
				if (select.choicesInstance) select.choicesInstance.destroy();

				const choices = new Choices(select, {
					searchEnabled: true,
					placeholder: true,
					placeholderValue: 'Seleccione una opción',
					removeItemButton: false,
					shouldSort: false,
					maxItemCount: 1
				});

				select.choicesInstance = choices;
				// Aplicar estilos adicionales al contenedor de Choices creado
				const choicesContainer = select.closest('.choices');
				if (choicesContainer) {
					choicesContainer.style.position = 'relative';
					choicesContainer.style.zIndex = '1000';
				}

				select.addEventListener('change', cambiarServicioLinea);
			}
		}
	});

	// Totales
	document.getElementById('subtotal').innerText = cotizacion.totales.subtotal.toFixed(2);
	document.getElementById('isv').innerText = cotizacion.totales.isv.toFixed(2);
	document.getElementById('total').innerText = cotizacion.totales.total.toFixed(2);
}

function generarDropdownServicio(id_camion, id_linea, id_servicio_seleccionado) {
	const disponibles = obtenerServiciosDisponibles(id_camion, id_linea);
	const select = document.createElement('select');
	select.className = 'form-select';
	select.id = `servicio_${id_linea}`;
	select.dataset.id = id_linea;

	const placeholder = document.createElement('option');
	placeholder.value = '';
	placeholder.text = 'Seleccione una opción';
	placeholder.disabled = true;
	placeholder.selected = true;
	select.appendChild(placeholder);

	disponibles.forEach(s => {
		const option = document.createElement('option');
		option.value = s.id_servicio;
		option.text = s.servicio;
		if (s.id_servicio === id_servicio_seleccionado) option.selected = true;
		select.appendChild(option);
	});

	if (
		id_servicio_seleccionado &&
		!disponibles.some(s => s.id_servicio === id_servicio_seleccionado)
		) {
		const s = servicios.find(x => x.id_servicio === id_servicio_seleccionado);
		if (s) {
			disponibles.unshift(s);
		}
	}


	return select.outerHTML;
}

function cambiarServicioLinea(event) {
	const id_linea = event.target.dataset.id;
	const id_servicio = parseInt(event.target.value);
	const linea = cotizacion.lineas.find(l => l.id_linea === id_linea);
	if (!linea) return;

	const servicio = servicios.find(s => s.id_servicio === id_servicio);
	const precioObj = preciosServicios.find(p => p.id_servicio === id_servicio && p.id_camion === cotizacion.id_camion);

	if (!servicio || !precioObj) return;

	linea.id_servicio = id_servicio;
	linea.nombre_servicio = servicio.servicio;
	linea.descripcion = servicio.descripcion || servicio.servicio;
	linea.precio_unitario = precioObj.precio || 0;
	linea.total_linea = redondeoBancario(linea.precio_unitario * (linea.cantidad || 1));

	recalcularTotales();
	actualizarTabla(); // actualiza todos los selects para evitar duplicados
}

function sincronizarClienteManual() {
	cotizacion.cliente.nombre = document.getElementById('inputClienteNombre').value.trim();
	cotizacion.cliente.direccion = choiceDireccion.getValue(true)?.trim() || '';
	cotizacion.cliente.dni = document.getElementById('inputDNI').value.trim();
	cotizacion.cliente.rtn = document.getElementById('inputRTN').value.trim();
}

async function validarDNINoDuplicado(dni) {
	if (!dni) return true;

	const { data, error } = await supabase
		.from('clientes')
		.select('dni')
		.eq('dni', dni)
		.limit(1);

	if (error) {
		console.error(error);
		throw new Error('Error validando DNI');
	}

	return data.length === 0; // true = no existe
}

function determinarTipoCliente() {
	const dniInput = document.getElementById('inputDNI').value.trim();
	cotizacion.cliente.es_nuevo = !!dniInput && !cotizacion.cliente.id_cliente;
}

window.editarDescripcion = (e) => {
	const id = e.target.dataset.id;
	const l = cotizacion.lineas.find(x => x.id_linea === id);
	l.descripcion = e.target.value;
};

window.editarCantidad = (e) => {
	const id = e.target.dataset.id;
	const l = cotizacion.lineas.find(x => x.id_linea === id);
	l.cantidad = parseInt(e.target.value) || 0;
	l.total_linea = redondeoBancario(l.cantidad * (l.precio_unitario || 0));
	recalcularTotales();
	actualizarTabla();
};

window.editarPrecio = (e) => {
	const id = e.target.dataset.id;
	const l = cotizacion.lineas.find(x => x.id_linea === id);
	l.precio_unitario = parseFloat(e.target.value) || 0;
	l.total_linea = redondeoBancario(l.cantidad * l.precio_unitario);
	recalcularTotales();
	actualizarTabla();
};

window.eliminarLinea = (id) => {
	cotizacion.lineas = cotizacion.lineas.filter(x => x.id_linea !== id);
	recalcularTotales();
	actualizarTabla();
};

function recalcularTotales() {
	let subtotal = 0;
	if (cotizacion.camiones && cotizacion.camiones.length) {
		subtotal = cotizacion.camiones.reduce((acc, cam) => acc + (cam.lineas || []).reduce((s, l) => s + (l.total_linea || 0), 0), 0);
	} else {
		subtotal = (cotizacion.lineas || []).reduce((a, l) => a + (l.total_linea || 0), 0);
	}
	subtotal = redondeoBancario(subtotal);
	const isv = redondeoBancario(subtotal * 0.15);

	cotizacion.totales = {
		subtotal,
		isv,
		total: redondeoBancario(subtotal + isv)
	};
}

function redondeoBancario(valor){
	return Math.round(valor*100)/100;
}

function esEditable(){
	return cotizacion.estado===7;
}

// ---------------- Guardado ----------------
async function guardarParcial(cot){
	try{
		if (cot.estado !== 7) return;

		sincronizarClienteManual();
		const idCliente = await asegurarClienteParcial();
		const idDireccion = await asegurarDireccion(cot.cliente.direccion);
		recalcularTotales();

		// ---------------- NUEVA ----------------
		if (!cot.id_cotizacion) {
			const { data, error } = await supabase
				.from('cotizaciones')
				.insert({
					fecha_cotizacion: cot.fecha,
					id_estado: 7,
					id_cliente: idCliente || null,
					cliente: cot.cliente.nombre || '',
					direccion: cot.cliente.direccion || '',
					subtotal: cot.totales.subtotal,
					isv: cot.totales.isv,
					total: cot.totales.total
				})
				.select()
				.single();

			if (error) {
				console.error('Error guardando cotización:', error);
				throw error;
			}

			cot.id_cotizacion = data.id_cotizacion;
		}
		// ---------------- EXISTENTE ----------------
		else {
			await supabase
				.from('cotizaciones')
				.update({
					fecha_cotizacion: cot.fecha,

					id_cliente: idCliente,
					cliente: cot.cliente.nombre,
					direccion: cot.cliente.direccion,

					subtotal: cot.totales.subtotal,
					isv: cot.totales.isv,
					total: cot.totales.total
				})
				.eq('id_cotizacion', cot.id_cotizacion);
		}

		// ---------------- DETALLE (por camiones) ----------------
		await guardarDetallePorCamiones(cot.id_cotizacion);

		alert('Cotización guardada');
	} catch(err){
		console.error(err);
		alert('Error guardando cotización');
	}
}

async function guardarDetallePorCamiones(idCotizacion){
	if (!idCotizacion) return;

	// ---------------- sincronizar cotizacion_camiones ----------------
	const { data: dbCamiones = [] } = await supabase
		.from('cotizacion_camiones')
		.select('*')
		.eq('id_cotizacion', idCotizacion);

	const idsBDCam = (dbCamiones || []).map(c => c.id).filter(Boolean);
	const idsFrontendCam = cotizacion.camiones.map(c => c.id).filter(Boolean);

	// eliminar camiones que están en la BD pero no en el frontend (y sus detalles)
	const camAEliminar = idsBDCam.filter(id => !idsFrontendCam.includes(id));
	if (camAEliminar.length) {
		// eliminar detalles asociados
		await supabase.from('cotizacion_detalle').delete().in('id_cotizacion_camion', camAEliminar);
		// eliminar camiones
		await supabase.from('cotizacion_camiones').delete().in('id', camAEliminar);
	}

	// insertar/actualizar camiones frontend
	for (const cam of cotizacion.camiones) {
		if (cam.id) {
			// update
			await supabase.from('cotizacion_camiones').update({ id_camion: cam.id_camion, camion: cam.camion, orden: cam.orden }).eq('id', cam.id);
		} else {
			const { data } = await supabase.from('cotizacion_camiones').insert({ id_cotizacion: idCotizacion, id_camion: cam.id_camion, camion: cam.camion, orden: cam.orden }).select().single();
			cam.id = data.id;
		}

		// ---------------- sincronizar detalle por camión ----------------
		const detallesFrontend = (cam.lineas || []).filter(l => !l.es_camion);

		const { data: detallesBD = [] } = await supabase.from('cotizacion_detalle').select('*').eq('id_cotizacion_camion', cam.id);
		const idsBD = detallesBD.map(d => d.id).filter(Boolean);
		const idsFrontend = detallesFrontend.map(d => d.id).filter(Boolean);

		// eliminar detalles que ya no existen en frontend
		const detallesAEliminar = idsBD.filter(id => !idsFrontend.includes(id));
		if (detallesAEliminar.length) {
			await supabase.from('cotizacion_detalle').delete().in('id', detallesAEliminar);
		}

		// insertar/actualizar detalles frontend
		for (const l of detallesFrontend) {
			const payload = {
				id_cotizacion: idCotizacion,
				id_servicio: l.id_servicio,
				descripcion_servicio: l.descripcion,
				precio_unitario: l.precio_unitario,
				cantidad: l.cantidad,
				total_linea: l.total_linea,
				id_cotizacion_camion: cam.id
			};

			if (l.id && idsBD.includes(l.id)) {
				await supabase.from('cotizacion_detalle').update(payload).eq('id', l.id);
			} else {
				const { data } = await supabase.from('cotizacion_detalle').insert(payload).select().single();
				l.id = data.id;
			}
		}

		// asegurar que exista la línea-camión como detalle (opcional, retro-compatibilidad)
		const camionLineBD = detallesBD.find(d => d.id_servicio === null);
		if (!camionLineBD) {
			// insertar linea camión con id_servicio = null
			await supabase.from('cotizacion_detalle').insert({ id_cotizacion: idCotizacion, id_servicio: null, descripcion_servicio: cam.camion || '', precio_unitario: 0, cantidad: 0, total_linea: 0, id_cotizacion_camion: cam.id });
		} else {
			// actualizar descripcion si cambió
			if (camionLineBD.descripcion_servicio !== (cam.camion || '')) {
				await supabase.from('cotizacion_detalle').update({ descripcion_servicio: cam.camion || '' }).eq('id', camionLineBD.id);
			}
		}
	}
}


// ---------------- Emitir ----------------
async function emitirCotizacion(cot){
	if (cot.estado !== 7) {
		alert('Esta cotización no puede ser emitida');
		return;
	}
	try{
		if(cot.cliente.es_nuevo){
			cot.cliente.dni = String(cot.cliente.dni).trim();
			sincronizarClienteManual();
			determinarTipoCliente();
			if (!cot.cliente.nombre || !cot.cliente.dni) {
				alert('Debe ingresar al menos Nombre y DNI del cliente');
				return;
			}

			const dniDisponible = await validarDNINoDuplicado(cot.cliente.dni);
			if (!dniDisponible) {
				alert('El DNI ingresado ya existe. Seleccione el cliente desde la lista.');
				return;
			}

			const { data, error } = await supabase
			.from('clientes')
			.insert([{
				nombre_legal: cot.cliente.nombre || document.getElementById('inputClienteNombre').value,
				direccion: cot.cliente.direccion || document.getElementById('inputClienteDireccion').value,
				dni: cot.cliente.dni || document.getElementById('inputDNI').value,
				rtn: cot.cliente.rtn || document.getElementById('inputRTN').value,
				estado: 1
			}])
			.select()
			.single();
			if(error) throw error;

			clientes.push({
				dni: data.dni,
				nombre_legal: data.nombre_legal,
				direccion: data.direccion,
				rtn: data.rtn,
				estado: 1
			});

			choiceCliente.setChoices([{
				value: data.dni,
				label: data.nombre_legal,
				selected: true
			}], 'value', 'label', false);

			cot.cliente = {
				id_cliente: data.dni,
				nombre: data.nombre_legal,
				direccion: data.direccion,
				dni: data.dni,
				rtn: data.rtn,
				es_nuevo: false
			};
		}

		await guardarParcial(cot);

		const { error: updErr } = await supabase.from('cotizaciones')
			.update({id_estado:5})
			.eq('id_cotizacion', cot.id_cotizacion);
		if(updErr) throw updErr;

		alert('Cotización emitida');
		await generarPDF(cot);
		window.location.href = 'cotizaciones_historial.html';
	} catch(err){
		console.error(err);
		alert('Error emitiendo cotización');
	}
}

// ---------------- PDF ----------------
async function generarPDF(cot) {
	const { jsPDF } = window.jspdf;
	const doc = new jsPDF('p','mm','letter');
	const margenIzq = 14;
	const margenDer = 14;

	// ---------------- Cargar datos del local ----------------
	const { data, error } = await supabase
		.from('datos')
		.select('*')
		.eq('id', 1)
		.limit(1);

	if (error || !data || data.length === 0) {
		throw new Error('No se encontraron datos del local (tabla datos, id=1)');
	}

	const datosLocal = data[0];

	// ---------------- Logo ----------------
	const img = new Image();
	img.src = '../assets/img/logo.png';
	await new Promise(resolve => img.onload = resolve);

	// Conversión px → mm (170px)
	const logoHeightMm = 30; // 170px ≈ 45mm
	const logoWidthMm = (img.width / img.height) * logoHeightMm;

	// Asegurar que nunca exceda los márgenes
	const maxWidth = doc.internal.pageSize.getWidth() - margenIzq - margenDer;
	const finalLogoWidth = Math.min(logoWidthMm, maxWidth);
	const finalLogoHeight = (finalLogoWidth / logoWidthMm) * logoHeightMm;

	// Centrado horizontal
	const logoX = (doc.internal.pageSize.getWidth() - finalLogoWidth) / 2;

	doc.addImage(
		img,
		'PNG',
		logoX,
		10,
		finalLogoWidth,
		finalLogoHeight
	);

	// ---------------- Datos del local debajo del logo ----------------
	const startY = 10 + logoHeightMm + 5;
	const centerX = doc.internal.pageSize.getWidth()/2;
	doc.setFontSize(11);
	doc.text(datosLocal.direccion || '', centerX, startY, { align: 'center' });
	doc.text(datosLocal.correo || '', centerX, startY + 7, { align: 'center' });
	doc.text(`Cel.: ${datosLocal.telefono || ''}`, centerX, startY + 14, { align: 'center' });
	doc.text(`RTN: ${datosLocal.rtn || ''}`, centerX, startY + 21, { align: 'center' });

	let yActual = startY + 30;

	// ---------------- Mini tabla Cliente / Dirección / Fecha ----------------
	doc.autoTable({
		startY: yActual,
		margin: { left: margenIzq, right: margenDer },
		theme: 'grid',
		tableWidth: 'auto',
		styles: { fontSize: 10, halign: 'left', fillColor: [220,220,220] },
		body: [
			[`Cliente: ${cot.cliente.nombre} | RTN: ${cot.cliente.rtn}`],
			[`Dirección: ${cot.cliente.direccion}`],
			[`Fecha: ${cot.fecha}`]
		],
		columns: [{ dataKey: 'info' }]
	});

	yActual = doc.lastAutoTable.finalY + 8;

	// ---------------- Encabezado COTIZACIÓN ----------------
	doc.setFontSize(14);
	doc.setFont('helvetica','bold');
	doc.text('COTIZACIÓN #'+generarCodigo(cot.id_cotizacion), centerX, yActual, { align: 'center' });
	yActual += 7;

	// ---------------- Detalle de Cotización ----------------
	// Construir lista ordenada: camión, sus servicios, camión2, sus servicios...
	const lineasTotales = [];
	(cot.camiones || []).forEach(cam => {
		// línea camión
		lineasTotales.push({ es_camion: true, descripcion: cam.camion || '', cantidad: 0, precio_unitario: 0, total_linea: 0 });
		// luego sus servicios
		(cam.lineas || []).forEach(l => {
			if (!l.es_camion) lineasTotales.push(l);
		});
	});
	const lineasPorPagina = 12;
	/*const camionesLine = cot.lineas.find(l => l.es_camion);*/

	for(let i=0; i<lineasTotales.length; i+=lineasPorPagina-1){
		const pageLineas = lineasTotales.slice(i, i + lineasPorPagina - 1);
		const body = [];

		pageLineas.forEach(l => {
			if (l.es_camion) {
				body.push([
					{ content: '', styles:{ fontStyle:'bold', halign:'center' } },
					{ content: l.descripcion || '', styles:{ fontStyle:'bold', halign:'center' } },
					{ content: '', styles:{ fontStyle:'bold', halign:'right' } },
					{ content: '', styles:{ fontStyle:'bold', halign:'right' } }
				]);
			} else {
				body.push([
					{ content: (l.cantidad || 0).toLocaleString() , styles:{ halign:'right' } },
					{ content: l.descripcion, styles:{ halign:'left' } },
					{ content: (l.precio_unitario||0).toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 }), styles:{ halign:'right' } },
					{ content: (l.total_linea||0).toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 }), styles:{ halign:'right' } }
				]);
			}
		});

		// Totales solo en la última página
		if(i + (lineasPorPagina-1) >= lineasTotales.length){
			body.push(
				['', '', { content: 'Subtotal', styles: { fontStyle: 'bold', halign: 'right' } },
					{ content: cot.totales.subtotal.toLocaleString(undefined,{minimumFractionDigits:2}), styles: { halign: 'right' } }],
				['', '', { content: '15% ISV', styles: { fontStyle: 'bold', halign: 'right' } },
					{ content: cot.totales.isv.toLocaleString(undefined,{minimumFractionDigits:2}), styles: { halign: 'right' } }],
				['', '', { content: 'Total', styles: { fontStyle: 'bold', halign: 'right' } },
					{ content: cot.totales.total.toLocaleString(undefined,{minimumFractionDigits:2}), styles: { halign: 'right' } }]
			);
		}

		doc.autoTable({
			startY: yActual,
			margin: { left: margenIzq, right: margenDer },
			head: [['Cant.','Descripción','Valor C/U','Valor Total']],
			body: body,
			theme: 'grid',
			styles: { fontSize: 10 },
			headStyles: { fillColor: [220,220,220], halign:'center' }
		});
		yActual = doc.lastAutoTable.finalY + 5;
		
		if(i + (lineasPorPagina-1) >= lineasTotales.length){
			const totalesY = yActual + 5;

			// Total en letras
			yActual = totalesY + 25;
			doc.setFont('helvetica','normal');
			doc.text(`Son: ${numeroALetras(cot.totales.total)} L 00/100`, centerX, yActual, { align:'center' });

			// Línea de firma
			yActual += 5;
			/*doc.line(margenIzq+50, yActual, doc.internal.pageSize.getWidth()-margenIzq-50, yActual);
			doc.text('Firma', centerX, yActual + 7, { align:'center' });*/
			
			const firma = new Image();
			firma.src = '../assets/img/Firma.png';
			await new Promise(resolve => firma.onload = resolve);

			// Conversión px → mm (170px)
			const firmaHeightMm = 34; // 161px ≈ 45mm
			const firmaWidthMm = (firma.width / firma.height) * firmaHeightMm;

			// Asegurar que nunca exceda los márgenes
			const maxWidthFirma = doc.internal.pageSize.getWidth() - margenIzq - margenDer;
			const finalFirmaWidth = Math.min(firmaWidthMm, maxWidthFirma);
			const finalFirmaHeight = (finalFirmaWidth / firmaWidthMm) * firmaHeightMm;

			// Centrado horizontal
			const firmaX = (doc.internal.pageSize.getWidth() - finalFirmaWidth) / 2;

			doc.addImage(
				firma,
				'PNG',
				firmaX,
				yActual,
				finalFirmaWidth,
				finalFirmaHeight
			);
		}

		if(i + (lineasPorPagina-1) < lineasTotales.length){
			doc.addPage();
			yActual = 20; // margen superior para nuevas páginas
		}
	}

	doc.save(`Cotizacion_${cot.id_cotizacion}.pdf`);
}

// ---------------- Función auxiliar para número a letras ----------------
function numeroALetras(num) {
	num = Math.floor(num);

	if (num === 0) return 'CERO';

	const unidades = [
		'', 'UNO', 'DOS', 'TRES', 'CUATRO',
		'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'
	];

	const especiales = [
		'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE',
		'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'
	];

	const decenas = [
		'', '', 'VEINTE', 'TREINTA', 'CUARENTA',
		'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'
	];

	const centenas = [
		'', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS',
		'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'
	];

	function convertirMenorDeMil(n) {
		if (n === 0) return '';
		if (n === 100) return 'CIEN';

		let texto = '';

		const c = Math.floor(n / 100);
		const d = Math.floor((n % 100) / 10);
		const u = n % 10;

		if (c > 0) texto += centenas[c] + ' ';

		if (d === 1) {
			texto += especiales[u];
		} else if (d > 1) {
			texto += decenas[d];
			if (u > 0) texto += ' Y ' + unidades[u];
		} else if (u > 0) {
			texto += unidades[u];
		}

		return texto.trim();
	}

	let resultado = '';

	if (num >= 1000) {
		const miles = Math.floor(num / 1000);
		const resto = num % 1000;

		if (miles === 1) {
			resultado = 'MIL';
		} else {
			resultado = convertirMenorDeMil(miles) + ' MIL';
		}

		if (resto > 0) {
			resultado += ' ' + convertirMenorDeMil(resto);
		}
	} else {
		resultado = convertirMenorDeMil(num);
	}

	return resultado.trim();
}

async function anularCotizacion(){
	if (!cotizacion.id_cotizacion) return;

	if (!confirm('¿Está seguro de anular esta cotización?')) return;

	const { error } = await supabase
		.from('cotizaciones')
		.update({ id_estado: 6 })
		.eq('id_cotizacion', cotizacion.id_cotizacion);

	if (error) {
		alert('Error al anular la cotización');
		return;
	}

	alert('Cotización anulada');
	window.location.href = 'cotizaciones_historial.html';
}

async function asegurarClienteParcial(){
	sincronizarClienteManual();

	const dni = String(cotizacion.cliente.dni || '').trim();
	if (!dni) return null;

	// ¿Existe?
	const { data: existente } = await supabase
		.from('clientes')
		.select('*')
		.eq('dni', dni)
		.limit(1)
		.maybeSingle();

	if (existente) {
		return existente.dni;
	}

	// Crear cliente parcial
	const { data, error } = await supabase
		.from('clientes')
		.insert({
			dni,
			nombre_legal: cotizacion.cliente.nombre,
			direccion: cotizacion.cliente.direccion,
			rtn: cotizacion.cliente.rtn,
			estado: 1
		})
		.select()
		.single();

	if (error) throw error;

	clientes.push(data); // sincronizar frontend
	return data.dni;
}

function generarCodigo(correlativo) {
  const prefijo = "CT-";
  const correlativoFormateado = correlativo.toString().padStart(6, "0");

  return `${prefijo}${correlativoFormateado}`;
}

window.editarCamion = (e) => {
	cotizacion.camion = e.target.value;
};

function initDropdownDirecciones(valorSeleccionado = null) {
	if (choiceDireccion) choiceDireccion.destroy();

	const select = document.getElementById('selectDireccion');
	select.innerHTML = '';

	direcciones.forEach(d => {
		const opt = document.createElement('option');
		opt.value = d.direccion;
		opt.text = d.direccion;
		select.appendChild(opt);
	});

	choiceDireccion = new Choices(select, {
		searchEnabled: true,
		removeItemButton: true,
		duplicateItemsAllowed: false,
		addChoices: true,
		addItemText: value => `Agregar "${value}" (presiona Enter para agregar)`,
		shouldSort: false
	});

	if (valorSeleccionado) {
		choiceDireccion.setChoiceByValue(valorSeleccionado);
	}
}

async function asegurarDireccion(direccionTexto) {
	if (!direccionTexto) return null;

	const { data: existente } = await supabase
		.from('direcciones')
		.select('*')
		.eq('direccion', direccionTexto)
		.limit(1)
		.maybeSingle();

	if (existente) return existente.id;

	const { data, error } = await supabase
		.from('direcciones')
		.insert({
			direccion: direccionTexto,
			estado: 1
		})
		.select()
		.single();

	if (error) throw error;

	direcciones.push(data); // sincroniza frontend
	return data.id;
}

function cambiarServicioEnCamion(event, camIdx, lineIdx) {
	const id_servicio = parseInt(event.target.value);
	const cam = cotizacion.camiones[camIdx];
	if (!cam) return;
	const linea = cam.lineas[lineIdx];
	if (!linea) return;

	const servicio = servicios.find(s => s.id_servicio === id_servicio);
	const precioObj = (preciosPorCamion[cam.id_camion] || []).find(p => p.id_servicio === id_servicio);

	if (!servicio || !precioObj) return;

	linea.id_servicio = id_servicio;
	linea.nombre_servicio = servicio.servicio;
	linea.descripcion = servicio.descripcion || servicio.servicio;
	linea.precio_unitario = precioObj.precio || 0;
	linea.total_linea = redondeoBancario(linea.precio_unitario * (linea.cantidad || 1));

	recalcularTotales();
	renderCamionesUI();
}

// Exponer algunas funciones al scope global para uso en atributos onclick (modulo)
window.agregarCamionSeleccionado = agregarCamionSeleccionado;
window.agregarLineaServicioEnCamion = agregarLineaServicioEnCamion;
window.eliminarCamionPorIndex = eliminarCamionPorIndex;
window.renderCamionesUI = renderCamionesUI;
window.cambiarServicioEnCamion = cambiarServicioEnCamion;
window.cotizacion = cotizacion;
window.redondeoBancario = redondeoBancario;
window.recalcularTotales = recalcularTotales;
window.contarLineasTotales = contarLineasTotales;