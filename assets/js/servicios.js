import { supabase } from './supabase.js';

const form = document.getElementById('formServicio');
const tablaBody = document.querySelector('#tablaServicios tbody');
const btnCancelar = document.getElementById('btnCancelar');
const inputCodigo = document.getElementById('codigoServicio');
const selectCategoria = document.getElementById('idCategoria');
const filtroCategoria = document.getElementById('filtroCategoria');
const formTitulo = document.getElementById('formTitulo');
const btnDescargarPlantillaServicios = document.getElementById('btnDescargarPlantillaServicios');
const btnProcesarPlantillaServicios = document.getElementById('btnProcesarPlantillaServicios');
const inputArchivoServicios = document.getElementById('inputArchivoServicios');
const resultadoPlantillaServicios = document.getElementById('resultadoPlantillaServicios');
let tablaServiciosDT = null;

let cacheServicios = [];
let filtroEstado = '';
let filtroCategoriaActiva = '';

let cacheCategoriasDisponibles = [];

async function listarCategorias() {
	const { data, error } = await supabase
		.from('categorias')
		.select('*')
		.eq('estado', 1)
		.order('nombre', { ascending: true });

	if (error) return console.error(error);

	cacheCategoriasDisponibles = data || [];
	selectCategoria.innerHTML = '<option value="">Sin categoría</option>';
	filtroCategoria.innerHTML = '<option value="">Todas las categorías</option>';
	data.forEach(cat => {
		selectCategoria.innerHTML += `<option value="${cat.id_categoria}">${cat.codigo} - ${cat.nombre}</option>`;
		filtroCategoria.innerHTML += `<option value="${cat.id_categoria}">${cat.codigo} - ${cat.nombre}</option>`;
	});
}

async function listarServicios() {
	const { data, error } = await supabase
		.from('servicios')
		.select('*, categorias(id_categoria, codigo, nombre)')
		.order('id_servicio', { ascending: true });

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudieron cargar los servicios.' });
		return;
	}

	cacheServicios = data || [];
	aplicarFiltros();
}

function aplicarFiltros() {
	const filtrados = cacheServicios.filter(s => {
		const pasaEstado = filtroEstado ? String(s.estado) === String(filtroEstado) : true;
		const pasaCategoria = filtroCategoriaActiva ? String(s.id_categoria) === String(filtroCategoriaActiva) : true;
		return pasaEstado && pasaCategoria;
	});
	renderTabla(filtrados);
}

function renderTabla(data) {
	// Destruir la instancia anterior ANTES de tocar el DOM
	if (tablaServiciosDT) {
		tablaServiciosDT.destroy();
		tablaServiciosDT = null;
	}

	tablaBody.innerHTML = '';

	data.forEach(servicio => {
		const badgeEstado = servicio.estado === 1
			? '<span class="badge text-bg-success">Activo</span>'
			: '<span class="badge text-bg-secondary">Inactivo</span>';

		let acciones = `
			<button class="btn btn-sm btn-warning btn-edit" 
					data-id="${servicio.id_servicio}" 
					data-tipo="${servicio.servicio}" 
					data-codigo="${servicio.codigo || ''}" 
					data-id-categoria="${servicio.id_categoria || ''}" 
					data-descripcion="${servicio.descripcion || ''}">
				<i class="bi bi-pencil"></i> Editar
			</button>
		`;

		if (servicio.estado !== 1) {
			acciones += ` <button class="btn btn-sm btn-success btn-activar" data-id="${servicio.id_servicio}"><i class="bi bi-check-circle"></i> Activar</button>`;
		} else {
			acciones += ` <button class="btn btn-sm btn-danger btn-desactivar" data-id="${servicio.id_servicio}"><i class="bi bi-x-circle"></i> Desactivar</button>`;
		}

		tablaBody.innerHTML += `
			<tr>
				<td>${servicio.id_servicio}</td>
				<td>${servicio.servicio}</td>
				<td>${servicio.codigo || ''}</td>
				<td>${servicio.categorias?.nombre || ''}</td>
				<td>${servicio.descripcion || ''}</td>
				<td>${badgeEstado}</td>
				<td>${acciones}</td>
			</tr>
		`;
	});

	tablaServiciosDT = $('#tablaServicios').DataTable({
		responsive: {
			details: {
				type: 'column'
			}
		},
		columnDefs: [
			{ responsivePriority: 1, targets: 0 }, // ID
			{ responsivePriority: 2, targets: 1 }, // Servicio
			{ responsivePriority: 3, targets: 5 }, // Estado
			{ responsivePriority: 1, targets: 6 }, // Acciones
		],
		language: {
			search: "Buscar:",
			lengthMenu: "Mostrar _MENU_ registros",
			info: "Mostrando _START_ a _END_ de _TOTAL_ servicios",
			paginate: {
				next: "Siguiente",
				previous: "Anterior"
			},
			zeroRecords: "No se encontraron servicios"
		}
	});

	// Listeners directos por botón (no delegación): así "e.currentTarget" siempre
	// es el <button>, aunque el clic caiga sobre el ícono de adentro.
	document.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', editarServicio));
	document.querySelectorAll('.btn-activar').forEach(btn => btn.addEventListener('click', activarServicio));
	document.querySelectorAll('.btn-desactivar').forEach(btn => btn.addEventListener('click', desactivarServicio));
}

// Wiring de los filtros
document.querySelectorAll('.filtro-estado').forEach(btn => {
	btn.addEventListener('click', () => {
		filtroEstado = btn.dataset.estado;
		document.querySelectorAll('.filtro-estado').forEach(b => b.classList.remove('active'));
		btn.classList.add('active');
		aplicarFiltros();
	});
});

filtroCategoria.addEventListener('change', () => {
	filtroCategoriaActiva = filtroCategoria.value;
	aplicarFiltros();
});

// Función para guardar o actualizar servicio
form.addEventListener('submit', async (e) => {
	e.preventDefault();

	const id = document.getElementById('idServicio').value;
	const servicio = document.getElementById('servicio').value.trim();
	const descripcion = document.getElementById('descripcion').value.trim();
	const codigo = inputCodigo.value.trim().toUpperCase() || null;
	const id_categoria = selectCategoria.value || null;

	if (!servicio) {
		Swal.fire({ icon: 'warning', title: 'Campo requerido', text: 'Debe ingresar el nombre del servicio.' });
		return;
	}

	let error;
	if (id) {
		({ error } = await supabase
			.from('servicios')
			.update({ servicio, descripcion, codigo, id_categoria })
			.eq('id_servicio', id));
	} else {
		({ error } = await supabase
			.from('servicios')
			.insert({ servicio, descripcion, codigo, id_categoria }));
	}

	if (error) return manejarErrorGuardado(error);

	Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: id ? 'Servicio actualizado' : 'Servicio agregado', showConfirmButton: false, timer: 2200 });

	resetFormulario();
	listarServicios();
});

function manejarErrorGuardado(error) {
	console.error(error);
	if (error.code === '23505') {
		Swal.fire({ icon: 'warning', title: 'Código en uso', text: 'Ese código ya está en uso por otro servicio activo. Use un código distinto.' });
	} else {
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar: ' + error.message });
	}
}

// Función para editar un servicio
function editarServicio(e) {
	const btn = e.currentTarget;

	document.getElementById('idServicio').value = btn.dataset.id;
	document.getElementById('servicio').value = btn.dataset.tipo;
	document.getElementById('descripcion').value = btn.dataset.descripcion;
	inputCodigo.value = btn.dataset.codigo || '';
	selectCategoria.value = btn.dataset.idCategoria || '';
	formTitulo.textContent = 'Editar servicio';
	form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Función para activar/desactivar
async function activarServicio(e) {
	const id = e.currentTarget.dataset.id;
	const { error } = await supabase
		.from('servicios')
		.update({ estado: 1 })
		.eq('id_servicio', id);

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo activar el servicio.' });
		return;
	}

	Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Servicio activado', showConfirmButton: false, timer: 2200 });
	listarServicios();
}

async function desactivarServicio(e) {
	const id = e.currentTarget.dataset.id;

	const confirmar = await Swal.fire({
		title: '¿Desactivar servicio?',
		text: 'Ya no aparecerá disponible para asignarle precios ni para agregarlo a cotizaciones nuevas.',
		icon: 'warning',
		showCancelButton: true,
		confirmButtonText: 'Sí, desactivar',
		cancelButtonText: 'Cancelar',
		confirmButtonColor: '#dc3545'
	});
	if (!confirmar.isConfirmed) return;

	const { error } = await supabase
		.from('servicios')
		.update({ estado: 2 })
		.eq('id_servicio', id);

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo desactivar el servicio.' });
		return;
	}

	Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Servicio desactivado', showConfirmButton: false, timer: 2200 });
	listarServicios();
}

// Botón cancelar
function resetFormulario() {
	form.reset();
	document.getElementById('idServicio').value = '';
	formTitulo.textContent = 'Agregar servicio';
}
btnCancelar.addEventListener('click', resetFormulario);

// --- Carga masiva de servicios (solo inserta, no actualiza) --- //

btnDescargarPlantillaServicios.addEventListener('click', () => {
	const wb = XLSX.utils.book_new();

	// Hoja de referencia: categorías válidas (no es un dropdown nativo, solo guía)
	const filasCategorias = cacheCategoriasDisponibles.map(c => ({
		'Código de categoría': c.codigo,
		'Nombre': c.nombre
	}));
	const wsInfo = XLSX.utils.aoa_to_sheet([
		['Instrucciones'],
		['- Si el nombre del servicio ya existe, se actualiza su código, categoría y descripción.'],
		['- Si el nombre no existe, se crea un servicio nuevo.'],
		['- Puedes agregar tantas filas como necesites.'],
		['- El campo "Servicio" es obligatorio; el resto son opcionales.'],
		['- Si un nombre se repite dentro del mismo archivo, solo se procesa la primera aparición.'],
		['- En "Código de categoría" usa exactamente uno de los códigos listados abajo. Si no coincide con ninguno, el servicio se guarda sin categoría.'],
		[],
		['Categorías válidas:']
	]);
	XLSX.utils.sheet_add_json(wsInfo, filasCategorias, { origin: 'A9' });
	wsInfo['!cols'] = [{ wch: 60 }, { wch: 30 }];
	XLSX.utils.book_append_sheet(wb, wsInfo, 'Info');

	// Hoja de datos a llenar
	const wsServicios = XLSX.utils.json_to_sheet([{
		'Servicio': '',
		'Código': '',
		'Código de categoría': '',
		'Descripción': ''
	}]);
	wsServicios['!cols'] = [{ wch: 35 }, { wch: 14 }, { wch: 18 }, { wch: 40 }];
	XLSX.utils.book_append_sheet(wb, wsServicios, 'Servicios');

	XLSX.writeFile(wb, 'plantilla_servicios.xlsx');
	Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Plantilla descargada', showConfirmButton: false, timer: 2200 });
});

btnProcesarPlantillaServicios.addEventListener('click', async () => {
	const archivo = inputArchivoServicios.files[0];
	if (!archivo) {
		Swal.fire({ icon: 'warning', title: 'Falta el archivo', text: 'Selecciona un archivo de plantilla (.xlsx).' });
		return;
	}

	resultadoPlantillaServicios.innerHTML = '<em>Procesando...</em>';

	let filas;
	try {
		const buffer = await archivo.arrayBuffer();
		const wb = XLSX.read(buffer, { type: 'array' });
		const hoja = wb.Sheets['Servicios'] || wb.Sheets[wb.SheetNames[0]];
		filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });
	} catch (err) {
		resultadoPlantillaServicios.innerHTML = `<span class="text-danger">No se pudo leer el archivo: ${err.message}</span>`;
		return;
	}

	// Nombres ya existentes (para actualizar en vez de duplicar)
	const { data: existentes, error: errExistentes } = await supabase
		.from('servicios')
		.select('id_servicio, servicio');

	if (errExistentes) {
		resultadoPlantillaServicios.innerHTML = `<span class="text-danger">No se pudo verificar servicios existentes: ${errExistentes.message}</span>`;
		return;
	}

	const mapaExistentes = new Map((existentes || []).map(s => [s.servicio.trim().toLowerCase(), s.id_servicio]));
	const nombresEnEsteArchivo = new Set();

	let insertados = 0, actualizados = 0, omitidos = 0;
	const advertencias = [];
	const errores = [];

	for (const fila of filas) {
		const nombre = String(fila['Servicio'] ?? '').trim();

		// Fila sin nombre = no hay nada que crear, se omite sin marcarlo como error
		if (!nombre) {
			omitidos++;
			continue;
		}

		const nombreNormalizado = nombre.toLowerCase();

		if (nombresEnEsteArchivo.has(nombreNormalizado)) {
			advertencias.push(`"${nombre}": está repetido dentro del mismo archivo, solo se procesó la primera aparición.`);
			omitidos++;
			continue;
		}
		nombresEnEsteArchivo.add(nombreNormalizado);

		const codigo = String(fila['Código'] ?? '').trim().toUpperCase() || null;
		const descripcion = String(fila['Descripción'] ?? '').trim() || null;
		const codigoCategoriaTexto = String(fila['Código de categoría'] ?? '').trim();

		let id_categoria = null;
		if (codigoCategoriaTexto) {
			const categoria = cacheCategoriasDisponibles.find(c => c.codigo.toLowerCase() === codigoCategoriaTexto.toLowerCase());
			if (categoria) {
				id_categoria = categoria.id_categoria;
			} else {
				advertencias.push(`"${nombre}": el código de categoría "${codigoCategoriaTexto}" no coincide con ninguna categoría activa, se guardó sin categoría.`);
			}
		}

		const idExistente = mapaExistentes.get(nombreNormalizado);

		if (idExistente) {
			// Ya existe un servicio con ese nombre: actualizar código, categoría y descripción
			const { error } = await supabase
				.from('servicios')
				.update({ codigo, id_categoria, descripcion })
				.eq('id_servicio', idExistente);

			if (error) {
				if (error.code === '23505') {
					errores.push(`"${nombre}": el código "${codigo}" ya está en uso por otro servicio activo.`);
				} else {
					errores.push(`"${nombre}": ${error.message}`);
				}
			} else {
				actualizados++;
			}
			continue;
		}

		const { error } = await supabase
			.from('servicios')
			.insert({ servicio: nombre, codigo, id_categoria, descripcion });

		if (error) {
			if (error.code === '23505') {
				errores.push(`"${nombre}": el código "${codigo}" ya está en uso por otro servicio activo.`);
			} else {
				errores.push(`"${nombre}": ${error.message}`);
			}
		} else {
			insertados++;
		}
	}

	let resumen = `<div class="alert alert-info">Procesado: ${insertados} nuevo(s), ${actualizados} actualizado(s), ${omitidos} omitido(s).</div>`;
	if (advertencias.length) {
		resumen += `<div class="alert alert-warning"><strong>${advertencias.length} advertencia(s):</strong><ul class="mb-0">${advertencias.map(a => `<li>${a}</li>`).join('')}</ul></div>`;
	}
	if (errores.length) {
		resumen += `<div class="alert alert-danger"><strong>${errores.length} error(es):</strong><ul class="mb-0">${errores.map(e => `<li>${e}</li>`).join('')}</ul></div>`;
	}
	resultadoPlantillaServicios.innerHTML = resumen;

	inputArchivoServicios.value = '';
	listarServicios();

	if (errores.length === 0) {
		Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Plantilla procesada', showConfirmButton: false, timer: 2500 });
	}
});

// Inicializar listado
listarCategorias();
listarServicios();