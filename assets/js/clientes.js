import { supabase } from './supabase.js';

// Elementos del DOM
const form = document.getElementById('formCliente');
const tablaBody = document.querySelector('#tablaClientes tbody');
const btnCancelar = document.getElementById('btnCancelar');
const formTitulo = document.getElementById('formTitulo');
let tablaClientesDT = null;

let cacheClientes = [];
let filtroEstado = '';

// --- Funciones --- //

// 1. Listar clientes
async function listarClientes() {
	const { data, error } = await supabase
		.from('clientes')
		.select('*');

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudieron cargar los clientes.' });
		return;
	}

	cacheClientes = data || [];
	aplicarFiltro();
}

function aplicarFiltro() {
	const filtrados = filtroEstado
		? cacheClientes.filter(c => String(c.estado) === String(filtroEstado))
		: cacheClientes;
	renderTabla(filtrados);
}

function renderTabla(data) {
	// Destruir la instancia anterior ANTES de tocar el DOM
	if (tablaClientesDT) {
		tablaClientesDT.destroy();
		tablaClientesDT = null;
	}

	tablaBody.innerHTML = '';

	data.forEach(c => {
		tablaBody.innerHTML += `
			<tr>
				<td>${c.dni}</td>
				<td>${c.nombre_legal}</td>
				<td>${c.nombre_comercial || ''}</td>
				<td>${c.rtn || ''}</td>
				<td>${c.telefono || ''}</td>
				<td>${c.email || ''}</td>
				<td>${c.direccion || ''}</td>
				<td>${c.estado === 1 ? '<span class="badge text-bg-success">Activo</span>' : '<span class="badge text-bg-secondary">Inactivo</span>'}</td>
				<td>
					<button class="btn btn-sm btn-warning btnEditar" data-id="${c.dni}">
						<i class="bi bi-pencil"></i> Editar
					</button>
					<button 
						class="btn btn-sm btn-${c.estado === 1 ? 'danger' : 'success'} btnToggleEstado"
						data-id="${c.dni}"
						data-estado="${c.estado}">
						<i class="bi ${c.estado === 1 ? 'bi-x-circle' : 'bi-check-circle'}"></i> ${c.estado === 1 ? 'Desactivar' : 'Activar'}
					</button>
				</td>
			</tr>
		`;
	});

	// Eventos (ANTES de inicializar DataTables, ver nota en servicios.js)
	document.querySelectorAll('.btnEditar').forEach(btn => {
		btn.addEventListener('click', () => cargarCliente(btn.dataset.id));
	});

	document.querySelectorAll('.btnToggleEstado').forEach(btn => {
		btn.addEventListener('click', () => toggleEstado(btn.dataset.id, btn.dataset.estado));
	});

	tablaClientesDT = $('#tablaClientes').DataTable({
		responsive: {
			details: {
				type: 'column'
			}
		},
		columnDefs: [
			{ responsivePriority: 1, targets: 0 }, // DNI
			{ responsivePriority: 2, targets: 1 }, // Nombre legal
			{ responsivePriority: 3, targets: 8 }, // Acciones
			{ targets: 6, visible: false } // Dirección oculta en desktop
		],
		language: {
			search: "Buscar:",
			lengthMenu: "Mostrar _MENU_ registros",
			info: "Mostrando _START_ a _END_ de _TOTAL_ clientes",
			paginate: {
				next: "Siguiente",
				previous: "Anterior"
			},
			zeroRecords: "No se encontraron clientes"
		}
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

// 2. Guardar o actualizar cliente
form.addEventListener('submit', async (e) => {
	e.preventDefault();

	const dni = document.getElementById('dni').value.trim();
	const nombre_legal = document.getElementById('nombre_legal').value.trim();
	const nombre_comercial = document.getElementById('nombre_comercial').value.trim();
	const rtn = document.getElementById('rtn').value.trim();
	const direccion = document.getElementById('direccion').value.trim();
	const telefono = document.getElementById('telefono').value.trim();
	const email = document.getElementById('email').value.trim();

	if (!dni || !nombre_legal) {
		Swal.fire({ icon: 'warning', title: 'Campos incompletos', text: 'DNI y Nombre legal son obligatorios.' });
		return;
	}

	const payload = {
		nombre_legal,
		nombre_comercial,
		rtn,
		direccion,
		telefono,
		email
	};

	const editando = form.dataset.editando === "true";
	let error;

	if (editando) {
		// ACTUALIZAR
		({ error } = await supabase
			.from('clientes')
			.update(payload)
			.eq('dni', dni));
	} else {
		// INSERTAR
		({ error } = await supabase
			.from('clientes')
			.insert([{
				dni,
				...payload,
				estado: 1
			}]));
	}

	if (error) {
		console.error(error);
		if (error.code === '23505') {
			Swal.fire({ icon: 'warning', title: 'DNI ya registrado', text: 'Ya existe un cliente con ese DNI.' });
		} else {
			Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar: ' + error.message });
		}
		return;
	}

	Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: editando ? 'Cliente actualizado' : 'Cliente agregado', showConfirmButton: false, timer: 2200 });

	resetFormulario();
	listarClientes();
});

// 3. Cargar cliente para edición
async function cargarCliente(dni) {
	const { data, error } = await supabase
		.from('clientes')
		.select('*')
		.eq('dni', dni)
		.single();

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo cargar el cliente.' });
		return;
	}

	form.dataset.editando = "true";

	document.getElementById('dni').value = data.dni;
	document.getElementById('dni').readOnly = true;
	document.getElementById('nombre_legal').value = data.nombre_legal;
	document.getElementById('nombre_comercial').value = data.nombre_comercial || '';
	document.getElementById('rtn').value = data.rtn || '';
	document.getElementById('direccion').value = data.direccion || '';
	document.getElementById('telefono').value = data.telefono || '';
	document.getElementById('email').value = data.email || '';
	formTitulo.textContent = 'Editar cliente';
	form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 4. Activar / Desactivar cliente
async function toggleEstado(dni, estadoActual) {
	const activando = estadoActual != 1;

	if (!activando) {
		const confirmar = await Swal.fire({
			title: '¿Desactivar cliente?',
			text: 'No aparecerá disponible para seleccionarlo en cotizaciones nuevas.',
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
		.from('clientes')
		.update({ estado: nuevoEstado })
		.eq('dni', dni);

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo cambiar el estado del cliente.' });
		return;
	}

	Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: activando ? 'Cliente activado' : 'Cliente desactivado', showConfirmButton: false, timer: 2200 });
	listarClientes();
}

// Cancelar edición
function resetFormulario() {
	form.reset();
	form.dataset.editando = "false";
	document.getElementById('dni').readOnly = false;
	formTitulo.textContent = 'Agregar cliente';
}
btnCancelar.addEventListener('click', resetFormulario);

// Inicialización
listarClientes();