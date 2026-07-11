import { supabase } from './supabase.js';

// Elementos del DOM
const form = document.getElementById('formCamion');
const tablaBody = document.querySelector('#tablaCamiones tbody');
const btnCancelar = document.getElementById('btnCancelar');
const selectTipo = document.getElementById('id_tipo');
const filtroTipo = document.getElementById('filtroTipo');
const formTitulo = document.getElementById('formTitulo');
let tablaCamionesDT = null;

let cacheCamiones = [];
let filtroEstado = '';
let filtroTipoActivo = '';

// --- Funciones --- //

// 1. Listar tipos de camión (para el select del formulario y el filtro)
async function listarTiposCamion() {
	const { data, error } = await supabase
		.from('tipos_camion')
		.select('*')
		.eq('estado', 1); // Solo activos

	if (error) return console.error(error);

	selectTipo.innerHTML = '<option value="">Seleccione tipo</option>';
	filtroTipo.innerHTML = '<option value="">Todos los tipos</option>';
	data.forEach(tipo => {
		selectTipo.innerHTML += `<option value="${tipo.id_tipo}">${tipo.tipo}</option>`;
		filtroTipo.innerHTML += `<option value="${tipo.id_tipo}">${tipo.tipo}</option>`;
	});
}

// 2. Listar camiones
async function listarCamiones() {
	const { data, error } = await supabase
		.from('camiones')
		.select('id_camion, camion, estado, id_tipo, tipos_camion(tipo)');

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudieron cargar los camiones.' });
		return;
	}

	cacheCamiones = data || [];
	aplicarFiltros();
}

// 2.1 Filtros por estado y tipo
function aplicarFiltros() {
	const filtradas = cacheCamiones.filter(c => {
		const pasaEstado = filtroEstado ? String(c.estado) === String(filtroEstado) : true;
		const pasaTipo = filtroTipoActivo ? String(c.id_tipo) === String(filtroTipoActivo) : true;
		return pasaEstado && pasaTipo;
	});
	renderTabla(filtradas);
}

function renderTabla(data) {
	// Destruir la instancia anterior ANTES de tocar el DOM, para que la
	// paginación/filtro de DataTables no quede desincronizada.
	if (tablaCamionesDT) {
		tablaCamionesDT.destroy();
		tablaCamionesDT = null;
	}

	tablaBody.innerHTML = '';

	data.forEach(c => {
		tablaBody.innerHTML += `
			<tr>
				<td>${c.id_camion}</td>
				<td>${c.tipos_camion?.tipo || ''}</td>
				<td>${c.camion}</td>
				<td>${c.estado === 1 ? '<span class="badge text-bg-success">Activo</span>' : '<span class="badge text-bg-secondary">Inactivo</span>'}</td>
				<td>
					<button class="btn btn-sm btn-warning btnEditar" data-id="${c.id_camion}">
						<i class="bi bi-pencil"></i> Editar
					</button>
					<button class="btn btn-sm btn-${c.estado === 1 ? 'danger' : 'success'} btnToggleEstado" data-id="${c.id_camion}" data-estado="${c.estado}">
						<i class="bi ${c.estado === 1 ? 'bi-x-circle' : 'bi-check-circle'}"></i> ${c.estado === 1 ? 'Desactivar' : 'Activar'}
					</button>
				</td>
			</tr>
		`;
	});

	tablaCamionesDT = $('#tablaCamiones').DataTable({
		responsive: {
			details: {
				type: 'column'
			}
		},
		columnDefs: [
			{ responsivePriority: 1, targets: 0 }, // ID
			{ responsivePriority: 2, targets: 2 }, // Camión
			{ responsivePriority: 3, targets: 3 }, // Estado
			{ responsivePriority: 1, targets: 4 }, // Acciones
		],
		language: {
			search: "Buscar:",
			lengthMenu: "Mostrar _MENU_ registros",
			info: "Mostrando _START_ a _END_ de _TOTAL_ camiones",
			paginate: {
				next: "Siguiente",
				previous: "Anterior"
			},
			zeroRecords: "No se encontraron camiones"
		}
	});

	// Asignar eventos
	document.querySelectorAll('.btnEditar').forEach(btn => {
		btn.addEventListener('click', () => cargarCamion(btn.dataset.id));
	});

	document.querySelectorAll('.btnToggleEstado').forEach(btn => {
		btn.addEventListener('click', () => toggleEstado(btn.dataset.id, btn.dataset.estado));
	});
}

// 2.2 Wiring de los filtros
document.querySelectorAll('.filtro-estado').forEach(btn => {
	btn.addEventListener('click', () => {
		filtroEstado = btn.dataset.estado;
		document.querySelectorAll('.filtro-estado').forEach(b => b.classList.remove('active'));
		btn.classList.add('active');
		aplicarFiltros();
	});
});

filtroTipo.addEventListener('change', () => {
	filtroTipoActivo = filtroTipo.value;
	aplicarFiltros();
});

// 3. Guardar o actualizar camión
form.addEventListener('submit', async (e) => {
	e.preventDefault();
	const id_camion = document.getElementById('id_camion').value;
	const id_tipo = selectTipo.value;
	const camion = document.getElementById('camion').value.trim();

	if (!id_tipo || !camion) {
		Swal.fire({ icon: 'warning', title: 'Campos incompletos', text: 'Todos los campos son requeridos.' });
		return;
	}

	// Aviso no bloqueante de posible duplicado (mismo nombre en un camión activo distinto)
	const posibleDuplicado = cacheCamiones.find(c =>
		c.camion.trim().toLowerCase() === camion.toLowerCase() &&
		c.estado === 1 &&
		String(c.id_camion) !== String(id_camion)
	);
	if (posibleDuplicado) {
		const confirmar = await Swal.fire({
			icon: 'warning',
			title: 'Nombre similar encontrado',
			text: `Ya existe un camión activo llamado "${posibleDuplicado.camion}". ¿Deseas guardar de todas formas?`,
			showCancelButton: true,
			confirmButtonText: 'Guardar de todas formas',
			cancelButtonText: 'Cancelar'
		});
		if (!confirmar.isConfirmed) return;
	}

	let error;
	if (id_camion) {
		({ error } = await supabase
			.from('camiones')
			.update({ id_tipo, camion })
			.eq('id_camion', id_camion));
	} else {
		({ error } = await supabase
			.from('camiones')
			.insert([{ id_tipo, camion, estado: 1 }]));
	}

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar el camión: ' + error.message });
		return;
	}

	Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: id_camion ? 'Camión actualizado' : 'Camión agregado', showConfirmButton: false, timer: 2200 });

	resetFormulario();
	listarCamiones();
});

// 4. Cargar camión para edición
async function cargarCamion(id) {
	const { data, error } = await supabase
		.from('camiones')
		.select('*')
		.eq('id_camion', id)
		.single();

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo cargar el camión.' });
		return;
	}

	document.getElementById('id_camion').value = data.id_camion;
	selectTipo.value = data.id_tipo;
	document.getElementById('camion').value = data.camion;
	formTitulo.textContent = 'Editar camión';
	form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 5. Activar/Desactivar
async function toggleEstado(id, estadoActual) {
	const activando = estadoActual != 1;

	if (!activando) {
		const confirmar = await Swal.fire({
			title: '¿Desactivar camión?',
			text: 'No podrá seleccionarse en nuevas cotizaciones ni al asignar precios.',
			icon: 'warning',
			showCancelButton: true,
			confirmButtonText: 'Sí, desactivar',
			cancelButtonText: 'Cancelar',
			confirmButtonColor: '#dc3545'
		});
		if (!confirmar.isConfirmed) return;
	}

	const nuevoEstado = activando ? 1 : 2;
	const { error } = await supabase
		.from('camiones')
		.update({ estado: nuevoEstado })
		.eq('id_camion', id);

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo cambiar el estado del camión.' });
		return;
	}

	Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: activando ? 'Camión activado' : 'Camión desactivado', showConfirmButton: false, timer: 2200 });
	listarCamiones();
}

// Cancelar edición
function resetFormulario() {
	form.reset();
	document.getElementById('id_camion').value = '';
	formTitulo.textContent = 'Agregar camión';
}
btnCancelar.addEventListener('click', resetFormulario);

// Inicialización
listarTiposCamion();
listarCamiones();