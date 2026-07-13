import { supabase } from './supabase.js';

// Elementos del DOM
const form = document.getElementById('formCategoria');
const tablaBody = document.querySelector('#tablaCategorias tbody');
const btnCancelar = document.getElementById('btnCancelar');
const inputCodigo = document.getElementById('codigo');
const inputNombre = document.getElementById('nombre');
const inputDescripcion = document.getElementById('descripcion');
const formTitulo = document.getElementById('formTitulo');
let tablaCategoriasDT = null;

let cacheCategorias = [];
let filtroEstado = '';

// 1. Listar categorías
async function listarCategorias() {
	const { data, error } = await supabase
		.from('categorias')
		.select('*')
		.order('id_categoria', { ascending: true });

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudieron cargar las categorías.' });
		return;
	}

	cacheCategorias = data || [];
	aplicarFiltro();
}

function aplicarFiltro() {
	const filtradas = filtroEstado
		? cacheCategorias.filter(c => String(c.estado) === String(filtroEstado))
		: cacheCategorias;
	renderTabla(filtradas);
}

function renderTabla(data) {
	// Destruir la instancia anterior ANTES de tocar el DOM
	if (tablaCategoriasDT) {
		tablaCategoriasDT.destroy();
		tablaCategoriasDT = null;
	}

	tablaBody.innerHTML = '';
	data.forEach(c => {
		tablaBody.innerHTML += `
			<tr>
				<td>${c.id_categoria}</td>
				<td>${c.codigo}</td>
				<td>${c.nombre}</td>
				<td>${c.descripcion || ''}</td>
				<td>${c.estado === 1 ? '<span class="badge text-bg-success">Activo</span>' : '<span class="badge text-bg-secondary">Inactivo</span>'}</td>
				<td>
					<button class="btn btn-sm btn-warning btnEditar" data-id="${c.id_categoria}">
						<i class="bi bi-pencil"></i> Editar
					</button>
					<button class="btn btn-sm btn-${c.estado === 1 ? 'danger' : 'success'} btnToggleEstado" data-id="${c.id_categoria}" data-estado="${c.estado}">
						<i class="bi ${c.estado === 1 ? 'bi-x-circle' : 'bi-check-circle'}"></i> ${c.estado === 1 ? 'Desactivar' : 'Activar'}
					</button>
				</td>
			</tr>
		`;
	});

	// Listeners ANTES de inicializar DataTables (ver nota en servicios.js)
	document.querySelectorAll('.btnEditar').forEach(btn => {
		btn.addEventListener('click', () => cargarCategoria(btn.dataset.id));
	});

	document.querySelectorAll('.btnToggleEstado').forEach(btn => {
		btn.addEventListener('click', () => toggleEstado(btn.dataset.id, btn.dataset.estado));
	});

	tablaCategoriasDT = $('#tablaCategorias').DataTable({
		responsive: {
			details: {
				type: 'column'
			}
		},
		columnDefs: [
			{ responsivePriority: 1, targets: 0 },
			{ responsivePriority: 2, targets: 1 },
			{ responsivePriority: 5, targets: 5 },
		],
		language: {
			search: "Buscar:",
			lengthMenu: "Mostrar _MENU_ registros",
			info: "Mostrando _START_ a _END_ de _TOTAL_ categorías",
			paginate: {
				next: "Siguiente",
				previous: "Anterior"
			},
			zeroRecords: "No se encontraron categorías"
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

// 2. Guardar o actualizar categoría
form.addEventListener('submit', async (e) => {
	e.preventDefault();

	const id_categoria = document.getElementById('id_categoria').value;
	const codigo = inputCodigo.value.trim().toUpperCase();
	const nombre = inputNombre.value.trim();
	const descripcion = inputDescripcion.value.trim();

	if (!codigo || !nombre) {
		Swal.fire({ icon: 'warning', title: 'Campos incompletos', text: 'Código y nombre son requeridos.' });
		return;
	}

	if (!/^[A-Za-z0-9]{1,10}$/.test(codigo)) {
		Swal.fire({ icon: 'warning', title: 'Código inválido', text: 'El código debe ser alfanumérico, de máximo 10 caracteres.' });
		return;
	}

	let error;
	if (id_categoria) {
		// Actualizar
		({ error } = await supabase
			.from('categorias')
			.update({ codigo, nombre, descripcion })
			.eq('id_categoria', id_categoria));
	} else {
		// Insertar
		({ error } = await supabase
			.from('categorias')
			.insert([{ codigo, nombre, descripcion, estado: 1 }]));
	}

	if (error) {
		console.error(error);
		if (error.code === '23505') {
			Swal.fire({ icon: 'warning', title: 'Código en uso', text: 'Ese código ya está en uso por otra categoría activa. Use un código distinto.' });
		} else {
			Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar: ' + error.message });
		}
		return;
	}

	Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: id_categoria ? 'Categoría actualizada' : 'Categoría agregada', showConfirmButton: false, timer: 2200 });

	resetFormulario();
	listarCategorias();
});

// 3. Cargar categoría para edición
async function cargarCategoria(id) {
	const { data, error } = await supabase
		.from('categorias')
		.select('*')
		.eq('id_categoria', id)
		.single();

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo cargar la categoría.' });
		return;
	}

	document.getElementById('id_categoria').value = data.id_categoria;
	inputCodigo.value = data.codigo;
	inputNombre.value = data.nombre;
	inputDescripcion.value = data.descripcion || '';
	formTitulo.textContent = 'Editar categoría';
	form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 4. Activar/Desactivar
async function toggleEstado(id, estadoActual) {
	const activando = estadoActual != 1;

	if (!activando) {
		const confirmar = await Swal.fire({
			title: '¿Desactivar categoría?',
			text: 'Los servicios que ya la tienen asignada no se ven afectados, pero dejará de estar disponible para asignar a servicios nuevos.',
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
		.from('categorias')
		.update({ estado: nuevoEstado })
		.eq('id_categoria', id);

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo cambiar el estado de la categoría.' });
		return;
	}

	Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: activando ? 'Categoría activada' : 'Categoría desactivada', showConfirmButton: false, timer: 2200 });
	listarCategorias();
}

// Cancelar edición
function resetFormulario() {
	form.reset();
	document.getElementById('id_categoria').value = '';
	formTitulo.textContent = 'Agregar categoría';
}
btnCancelar.addEventListener('click', resetFormulario);

// Inicialización
listarCategorias();