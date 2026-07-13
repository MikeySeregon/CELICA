import { supabase } from './supabase.js';

const form = document.getElementById('formServicio');
const tablaBody = document.querySelector('#tablaServicios tbody');
const btnCancelar = document.getElementById('btnCancelar');
const inputCodigo = document.getElementById('codigoServicio');
const selectCategoria = document.getElementById('idCategoria');
const filtroCategoria = document.getElementById('filtroCategoria');
const formTitulo = document.getElementById('formTitulo');
let tablaServiciosDT = null;

let cacheServicios = [];
let filtroEstado = '';
let filtroCategoriaActiva = '';

async function listarCategorias() {
	const { data, error } = await supabase
		.from('categorias')
		.select('*')
		.eq('estado', 1)
		.order('nombre', { ascending: true });

	if (error) return console.error(error);

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

	// Listeners directos por botón (no delegación): así "e.currentTarget" siempre
	// es el <button>, aunque el clic caiga sobre el ícono de adentro.
	// IMPORTANTE: esto va ANTES de inicializar DataTables. Si se hace después,
	// DataTables ya paginó y solo la página 1 sigue en el DOM -- los botones
	// de las demás páginas se quedarían sin listener.
	document.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', editarServicio));
	document.querySelectorAll('.btn-activar').forEach(btn => btn.addEventListener('click', activarServicio));
	document.querySelectorAll('.btn-desactivar').forEach(btn => btn.addEventListener('click', desactivarServicio));

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

// Inicializar listado
listarCategorias();
listarServicios();