import { supabase } from './supabase.js';

// Elementos del DOM
const form = document.getElementById('formDireccion');
const tablaBody = document.querySelector('#tablaDirecciones tbody');
const btnCancelar = document.getElementById('btnCancelar');
const formTitulo = document.getElementById('formTitulo');
let tablaDireccionesDT = null;

let cacheDirecciones = [];
let filtroEstado = '';

// --- Funciones --- //

// 1. Listar direcciones
async function listarDirecciones() {
	const { data, error } = await supabase
		.from('direcciones')
		.select('*');

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudieron cargar las direcciones.' });
		return;
	}

	cacheDirecciones = data || [];
	aplicarFiltro();
}

function aplicarFiltro() {
	const filtradas = filtroEstado
		? cacheDirecciones.filter(d => String(d.estado) === String(filtroEstado))
		: cacheDirecciones;
	renderTabla(filtradas);
}

function renderTabla(data) {
	// Destruir la instancia anterior ANTES de tocar el DOM
	if (tablaDireccionesDT) {
		tablaDireccionesDT.destroy();
		tablaDireccionesDT = null;
	}

	tablaBody.innerHTML = '';

	data.forEach(c => {
		tablaBody.innerHTML += `
			<tr>
				<td>${c.id}</td>
				<td>${c.direccion}</td>
				<td>${c.estado === 1 ? '<span class="badge text-bg-success">Activo</span>' : '<span class="badge text-bg-secondary">Inactivo</span>'}</td>
				<td>
					<button class="btn btn-sm btn-warning btnEditar" data-id="${c.id}">
						<i class="bi bi-pencil"></i> Editar
					</button>
					<button 
						class="btn btn-sm btn-${c.estado === 1 ? 'danger' : 'success'} btnToggleEstado"
						data-id="${c.id}"
						data-estado="${c.estado}">
						<i class="bi ${c.estado === 1 ? 'bi-x-circle' : 'bi-check-circle'}"></i> ${c.estado === 1 ? 'Desactivar' : 'Activar'}
					</button>
				</td>
			</tr>
		`;
	});

	tablaDireccionesDT = $('#tablaDirecciones').DataTable({
		responsive: {
			details: {
				type: 'column'
			}
		},
		columnDefs: [
			{ responsivePriority: 1, targets: 0 }, // ID
			{ responsivePriority: 2, targets: 1 }, // Dirección
			{ responsivePriority: 3, targets: 3 } // Acciones
		],
		language: {
			search: "Buscar:",
			lengthMenu: "Mostrar _MENU_ registros",
			info: "Mostrando _START_ a _END_ de _TOTAL_ direcciones",
			paginate: {
				next: "Siguiente",
				previous: "Anterior"
			},
			zeroRecords: "No se encontraron direcciones"
		}
	});

	// Eventos
	document.querySelectorAll('.btnEditar').forEach(btn => {
		btn.addEventListener('click', () => cargarDireccion(btn.dataset.id));
	});

	document.querySelectorAll('.btnToggleEstado').forEach(btn => {
		btn.addEventListener('click', () => toggleEstado(btn.dataset.id, btn.dataset.estado));
	});
}

// Wiring del filtro
document.querySelectorAll('.filtro-estado').forEach(btn => {
	btn.addEventListener('click', () => {
		filtroEstado = btn.dataset.estado;
		document.querySelectorAll('.filtro-estado').forEach(b => b.classList.remove('active'));
		btn.classList.add('active');
		aplicarFiltro();
	});
});

// 2. Guardar o actualizar dirección
form.addEventListener('submit', async (e) => {
	e.preventDefault();

	const id = document.getElementById('id_direccion').value;
	const direccion = document.getElementById('direccion').value.trim();

	if (!direccion) {
		Swal.fire({ icon: 'warning', title: 'Campo requerido', text: 'Debe ingresar una dirección.' });
		return;
	}

	const payload = { direccion };
	const editando = form.dataset.editando === "true";
	let error;

	if (editando) {
		// ACTUALIZAR
		({ error } = await supabase
			.from('direcciones')
			.update(payload)
			.eq('id', id));
	} else {
		// INSERTAR
		({ error } = await supabase
			.from('direcciones')
			.insert([{ ...payload, estado: 1 }]));
	}

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar: ' + error.message });
		return;
	}

	Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: editando ? 'Dirección actualizada' : 'Dirección agregada', showConfirmButton: false, timer: 2200 });

	resetFormulario();
	listarDirecciones();
});

// 3. Cargar dirección para edición
async function cargarDireccion(id) {
	const { data, error } = await supabase
		.from('direcciones')
		.select('*')
		.eq('id', id)
		.single();

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo cargar la dirección.' });
		return;
	}

	form.dataset.editando = "true";

	document.getElementById('id_direccion').value = data.id;
	document.getElementById('id_direccion').readOnly = true;
	document.getElementById('direccion').value = data.direccion;
	formTitulo.textContent = 'Editar dirección';
	form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 4. Activar / Desactivar dirección
async function toggleEstado(id, estadoActual) {
	const activando = estadoActual != 1;

	if (!activando) {
		const confirmar = await Swal.fire({
			title: '¿Desactivar dirección?',
			text: 'No aparecerá disponible para seleccionarla en cotizaciones nuevas.',
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
		.from('direcciones')
		.update({ estado: nuevoEstado })
		.eq('id', id);

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo cambiar el estado de la dirección.' });
		return;
	}

	Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: activando ? 'Dirección activada' : 'Dirección desactivada', showConfirmButton: false, timer: 2200 });
	listarDirecciones();
}

// Cancelar edición
function resetFormulario() {
	form.reset();
	form.dataset.editando = "false";
	document.getElementById('id_direccion').readOnly = false;
	formTitulo.textContent = 'Agregar dirección';
}
btnCancelar.addEventListener('click', resetFormulario);

// Inicialización
listarDirecciones();
