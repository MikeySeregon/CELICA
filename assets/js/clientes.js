import { supabase } from './supabase.js';

// Elementos del DOM
const form = document.getElementById('formCliente');
const tablaBody = document.querySelector('#tablaClientes tbody');
const btnCancelar = document.getElementById('btnCancelar');
let tablaClientesDT = null;


// --- Funciones --- //

// 1. Listar clientes
async function listarClientes() {
	const { data, error } = await supabase
		.from('clientes')
		.select('*');

	if (error) return console.error(error);

	// Destruir DataTable si existe
	if (tablaClientesDT) {
		tablaClientesDT.destroy();
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
				<td>${c.estado === 1 ? 'Activo' : 'Inactivo'}</td>
				<td>
					<button class="btn btn-sm btn-warning btnEditar" data-id="${c.dni}">
						Editar
					</button>
					<button 
						class="btn btn-sm btn-${c.estado === 1 ? 'danger' : 'success'} btnToggleEstado"
						data-id="${c.dni}"
						data-estado="${c.estado}">
						${c.estado === 1 ? 'Desactivar' : 'Activar'}
					</button>
				</td>
			</tr>
		`;
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

	// Eventos
	document.querySelectorAll('.btnEditar').forEach(btn => {
		btn.addEventListener('click', () => cargarCliente(btn.dataset.id));
	});

	document.querySelectorAll('.btnToggleEstado').forEach(btn => {
		btn.addEventListener('click', () => toggleEstado(btn.dataset.id, btn.dataset.estado));
	});
}

// 2. Guardar o actualizar cliente
form.addEventListener('submit', async (e) => {
	e.preventDefault();

	const dni = document.getElementById('dni').value;
	const nombre_legal = document.getElementById('nombre_legal').value;
	const nombre_comercial = document.getElementById('nombre_comercial').value;
	const rtn = document.getElementById('rtn').value;
	const direccion = document.getElementById('direccion').value;
	const telefono = document.getElementById('telefono').value;
	const email = document.getElementById('email').value;

	if (!dni || !nombre_legal) {
		return alert('DNI y Nombre legal son obligatorios.');
	}

	const payload = {
		nombre_legal,
		nombre_comercial,
		rtn,
		direccion,
		telefono,
		email
	};

	if (form.dataset.editando === "true") {
		// ACTUALIZAR
		const { error } = await supabase
			.from('clientes')
			.update(payload)
			.eq('dni', dni);

		if (error) return console.error(error);

	} else {
		// INSERTAR
		const { error } = await supabase
			.from('clientes')
			.insert([{
				dni,
				...payload,
				estado: 1
			}]);

		if (error) return console.error(error);
	}

	form.reset();
	form.dataset.editando = "false";
	document.getElementById('dni').readOnly = false;
	listarClientes();
});

// 3. Cargar cliente para edición
async function cargarCliente(dni) {
	const { data, error } = await supabase
		.from('clientes')
		.select('*')
		.eq('dni', dni)
		.single();

	if (error) return console.error(error);

	form.dataset.editando = "true";

	document.getElementById('dni').value = data.dni;
	document.getElementById('dni').readOnly = true;
	document.getElementById('nombre_legal').value = data.nombre_legal;
	document.getElementById('nombre_comercial').value = data.nombre_comercial || '';
	document.getElementById('rtn').value = data.rtn || '';
	document.getElementById('direccion').value = data.direccion || '';
	document.getElementById('telefono').value = data.telefono || '';
	document.getElementById('email').value = data.email || '';
}

// 4. Activar / Desactivar cliente
async function toggleEstado(dni, estadoActual) {
	const nuevoEstado = estadoActual == 1 ? 2 : 1;

	const { error } = await supabase
		.from('clientes')
		.update({ estado: nuevoEstado })
		.eq('dni', dni);

	if (error) return console.error(error);

	listarClientes();
}

// Cancelar edición
btnCancelar.addEventListener('click', () => {
	form.reset();
	form.dataset.editando = "false";
	document.getElementById('dni').readOnly = false;
});

// Inicialización
listarClientes();
