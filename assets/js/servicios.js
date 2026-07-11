import { supabase } from './supabase.js';

const form = document.getElementById('formServicio');
const tablaBody = document.querySelector('#tablaServicios tbody');
const btnCancelar = document.getElementById('btnCancelar');
const inputCodigo = document.getElementById('codigoServicio');
const selectCategoria = document.getElementById('idCategoria');
let tablaServiciosDT = null;

async function listarCategorias() {
	const { data, error } = await supabase
		.from('categorias')
		.select('*')
		.eq('estado', 1);

	if (error) return console.error(error);

	selectCategoria.innerHTML = '<option value="">Sin categoría</option>';
	data.forEach(cat => {
		selectCategoria.innerHTML += `<option value="${cat.id_categoria}">${cat.codigo} - ${cat.nombre}</option>`;
	});
}

async function listarServicios() {
	const { data, error } = await supabase
		.from('servicios')
		.select('*, categorias(id_categoria, codigo, nombre)')
		.order('id_servicio', { ascending: true });

	if (error) return console.error(error);

	if (tablaServiciosDT) {
		tablaServiciosDT.destroy();
	}

	/*tablaBody.innerHTML = '';*/
	let html = '';
	data.forEach(servicio => {
		let estadoTexto = 'Indeterminado';
		if (servicio.estado === 1) estadoTexto = 'Activo';
		else if (servicio.estado === 2) estadoTexto = 'Inactivo';

		let acciones = `
			<button class="btn btn-sm btn-warning btn-edit" 
					data-id="${servicio.id_servicio}" 
					data-tipo="${servicio.servicio}" 
					data-codigo="${servicio.codigo || ''}" 
					data-id-categoria="${servicio.id_categoria || ''}" 
					data-descripcion="${servicio.descripcion || ''}">Editar</button>
		`;

		if (servicio.estado !== 1) {
			acciones += ` <button class="btn btn-sm btn-success btn-activar" data-id="${servicio.id_servicio}">Activar</button>`;
		}
		if (servicio.estado === 1) {
			acciones += ` <button class="btn btn-sm btn-danger btn-desactivar" data-id="${servicio.id_servicio}">Desactivar</button>`;
		}

		html += `
			<tr>
				<td>${servicio.id_servicio}</td>
				<td>${servicio.servicio}</td>
				<td>${servicio.codigo || ''}</td>
				<td>${servicio.categorias?.nombre || ''}</td>
				<td>${servicio.descripcion || ''}</td>
				<td>${estadoTexto}</td>
				<td>${acciones}</td>
			</tr>
		`;
	});
	tablaBody.innerHTML = html;

	tablaServiciosDT = $('#tablaServicios').DataTable({
		responsive: {
			details: {
				type: 'column'
			}
		},
		columnDefs: [
			{ responsivePriority: 1, targets: 0 }, // 
			{ responsivePriority: 2, targets: 1 }, // 
			/*{ responsivePriority: 3, targets: 2 }, //*/
			/*{ responsivePriority: 4, targets: 3 }, //*/
			{ responsivePriority: 5, targets: 6 }, // 
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

	// Agregar eventos a los botones después de renderizar
	tablaBody.addEventListener('click', (e) => {
		const btn = e.target;

		if (btn.classList.contains('btn-edit')) {
			editarServicio(e);
		}

		if (btn.classList.contains('btn-activar')) {
			activarServicio(e);
		}

		if (btn.classList.contains('btn-desactivar')) {
			desactivarServicio(e);
		}
	});
}

// Función para guardar o actualizar servicio
form.addEventListener('submit', async (e) => {
	e.preventDefault();
	
	const id = document.getElementById('idServicio').value;
	const servicio = document.getElementById('servicio').value;
	const descripcion = document.getElementById('descripcion').value;
	const codigo = inputCodigo.value.trim().toUpperCase() || null;
	const id_categoria = selectCategoria.value || null;

	if (id) {
		// Actualizar
		const { error } = await supabase
			.from('servicios')
			.update({ servicio, descripcion, codigo, id_categoria })
			.eq('id_servicio', id);
		if (error) return manejarErrorGuardado(error);
	} else {
		// Insertar
		const { error } = await supabase
			.from('servicios')
			.insert({ servicio, descripcion, codigo, id_categoria });
		if (error) return manejarErrorGuardado(error);
	}

	form.reset();
	listarServicios();
});

function manejarErrorGuardado(error) {
	if (error.code === '23505') {
		alert('Ese código ya está en uso por otro servicio activo. Use un código distinto.');
	} else {
		console.error(error);
		alert('Error al guardar: ' + error.message);
	}
}

// Función para editar un servicio
async function editarServicio(e) {
	const btn = e.target;

	document.getElementById('idServicio').value = btn.dataset.id;
	document.getElementById('servicio').value = btn.dataset.tipo;
	document.getElementById('descripcion').value = btn.dataset.descripcion;
	inputCodigo.value = btn.dataset.codigo || '';
	selectCategoria.value = btn.dataset.idCategoria || '';
};

// Función para activar/desactivar
async function activarServicio(e) {
	const id = e.target.dataset.id;
	const { error } = await supabase
		.from('servicios')
		.update({ estado: 1 })
		.eq('id_servicio', id);
	if (error) return console.error(error);
	listarServicios();
}

async function desactivarServicio(e) {
	const id = e.target.dataset.id;
	const { error } = await supabase
		.from('servicios')
		.update({ estado: 2 })
		.eq('id_servicio', id);
	if (error) return console.error(error);
	listarServicios();
}

// Botón cancelar
btnCancelar.addEventListener('click', () => form.reset());

// Inicializar listado
listarCategorias();
listarServicios();
