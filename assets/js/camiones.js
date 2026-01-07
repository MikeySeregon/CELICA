import { supabase } from './supabase.js';

// Elementos del DOM
const form = document.getElementById('formCamion');
const tablaBody = document.querySelector('#tablaCamiones tbody');
const btnCancelar = document.getElementById('btnCancelar');
const selectTipo = document.getElementById('id_tipo');

// --- Funciones --- //

// 1. Listar tipos de camión para el select
async function listarTiposCamion() {
	const { data, error } = await supabase
		.from('tipos_camion')
		.select('*')
		.eq('estado', 1); // Solo activos

	if (error) return console.error(error);

	selectTipo.innerHTML = '<option value="">Seleccione tipo</option>';
	data.forEach(tipo => {
		selectTipo.innerHTML += `<option value="${tipo.id_tipo}">${tipo.tipo}</option>`;
	});
}

// 2. Listar camiones
async function listarCamiones() {
	const { data, error } = await supabase
		.from('camiones')
		.select('id_camion, camion, estado, id_tipo, tipos_camion(tipo)');

	if (error) return console.error(error);

	tablaBody.innerHTML = '';
	data.forEach(c => {
		tablaBody.innerHTML += `
			<tr>
				<td>${c.id_camion}</td>
				<td>${c.tipos_camion?.tipo || ''}</td>
				<td>${c.camion}</td>
				<td>${c.estado === 1 ? 'Activo' : 'Inactivo'}</td>
				<td>
					<button class="btn btn-sm btn-warning btnEditar" data-id="${c.id_camion}">Editar</button>
					<button class="btn btn-sm btn-${c.estado === 1 ? 'danger' : 'success'} btnToggleEstado" data-id="${c.id_camion}" data-estado="${c.estado}">
						${c.estado === 1 ? 'Desactivar' : 'Activar'}
					</button>
				</td>
			</tr>
		`;
	});

	// Asignar eventos
	document.querySelectorAll('.btnEditar').forEach(btn => {
		btn.addEventListener('click', () => cargarCamion(btn.dataset.id));
	});

	document.querySelectorAll('.btnToggleEstado').forEach(btn => {
		btn.addEventListener('click', () => toggleEstado(btn.dataset.id, btn.dataset.estado));
	});
}

// 3. Guardar o actualizar camión
form.addEventListener('submit', async (e) => {
	e.preventDefault();
	const id_camion = document.getElementById('id_camion').value;
	const id_tipo = selectTipo.value;
	const camion = document.getElementById('camion').value;

	if (!id_tipo || !camion) return alert('Todos los campos son requeridos.');

	if (id_camion) {
		// Actualizar
		const { error } = await supabase
			.from('camiones')
			.update({ id_tipo, camion })
			.eq('id_camion', id_camion);

		if (error) return console.error(error);
	} else {
		// Insertar
		const { error } = await supabase
			.from('camiones')
			.insert([{ id_tipo, camion, estado: 1 }]);

		if (error) return console.error(error);
	}

	form.reset();
	listarCamiones();
});

// 4. Cargar camión para edición
async function cargarCamion(id) {
	const { data, error } = await supabase
		.from('camiones')
		.select('*')
		.eq('id_camion', id)
		.single();

	if (error) return console.error(error);

	document.getElementById('id_camion').value = data.id_camion;
	selectTipo.value = data.id_tipo;
	document.getElementById('camion').value = data.camion;
}

// 5. Activar/Desactivar
async function toggleEstado(id, estadoActual) {
	const nuevoEstado = estadoActual == 1 ? 2 : 1;
	const { error } = await supabase
		.from('camiones')
		.update({ estado: nuevoEstado })
		.eq('id_camion', id);

	if (error) return console.error(error);
	listarCamiones();
}

// Cancelar edición
btnCancelar.addEventListener('click', () => {
	form.reset();
});

// Inicialización
listarTiposCamion();
listarCamiones();
