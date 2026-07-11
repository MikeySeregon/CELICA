import { supabase } from './supabase.js';

// Elementos del DOM
const form = document.getElementById('formCategoria');
const tablaBody = document.querySelector('#tablaCategorias tbody');
const btnCancelar = document.getElementById('btnCancelar');
const inputCodigo = document.getElementById('codigo');
const inputNombre = document.getElementById('nombre');
const inputDescripcion = document.getElementById('descripcion');
let tablaCategoriasDT = null;

// 1. Listar categorías
async function listarCategorias() {
	const { data, error } = await supabase
		.from('categorias')
		.select('*')
		.order('id_categoria', { ascending: true });

	if (error) return console.error(error);

	if (tablaCategoriasDT) {
		tablaCategoriasDT.destroy();
	}

	tablaBody.innerHTML = '';
	data.forEach(c => {
		tablaBody.innerHTML += `
			<tr>
				<td>${c.id_categoria}</td>
				<td>${c.codigo}</td>
				<td>${c.nombre}</td>
				<td>${c.descripcion || ''}</td>
				<td>${c.estado === 1 ? 'Activo' : 'Inactivo'}</td>
				<td>
					<button class="btn btn-sm btn-warning btnEditar" data-id="${c.id_categoria}">Editar</button>
					<button class="btn btn-sm btn-${c.estado === 1 ? 'danger' : 'success'} btnToggleEstado" data-id="${c.id_categoria}" data-estado="${c.estado}">
						${c.estado === 1 ? 'Desactivar' : 'Activar'}
					</button>
				</td>
			</tr>
		`;
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

	document.querySelectorAll('.btnEditar').forEach(btn => {
		btn.addEventListener('click', () => cargarCategoria(btn.dataset.id));
	});

	document.querySelectorAll('.btnToggleEstado').forEach(btn => {
		btn.addEventListener('click', () => toggleEstado(btn.dataset.id, btn.dataset.estado));
	});
}

// 2. Guardar o actualizar categoría
form.addEventListener('submit', async (e) => {
	e.preventDefault();

	const id_categoria = document.getElementById('id_categoria').value;
	const codigo = inputCodigo.value.trim().toUpperCase();
	const nombre = inputNombre.value.trim();
	const descripcion = inputDescripcion.value.trim();

	if (!codigo || !nombre) {
		alert('Código y nombre son requeridos');
		return;
	}

	if (!/^[A-Za-z0-9]{1,10}$/.test(codigo)) {
		alert('El código debe ser alfanumérico, de máximo 10 caracteres');
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
		if (error.code === '23505') {
			alert('Ese código ya está en uso por otra categoría activa. Use un código distinto.');
		} else {
			alert('Error al guardar: ' + error.message);
		}
		return;
	}

	form.reset();
	document.getElementById('id_categoria').value = '';
	listarCategorias();
});

// 3. Cargar categoría para edición
async function cargarCategoria(id) {
	const { data, error } = await supabase
		.from('categorias')
		.select('*')
		.eq('id_categoria', id)
		.single();

	if (error) return console.error(error);

	document.getElementById('id_categoria').value = data.id_categoria;
	inputCodigo.value = data.codigo;
	inputNombre.value = data.nombre;
	inputDescripcion.value = data.descripcion || '';
}

// 4. Activar/Desactivar
async function toggleEstado(id, estadoActual) {
	const nuevoEstado = estadoActual == 1 ? 2 : 1;
	const { error } = await supabase
		.from('categorias')
		.update({ estado: nuevoEstado })
		.eq('id_categoria', id);

	if (error) return console.error(error);
	listarCategorias();
}

// Cancelar edición
btnCancelar.addEventListener('click', () => {
	form.reset();
	document.getElementById('id_categoria').value = '';
});

// Inicialización
listarCategorias();
