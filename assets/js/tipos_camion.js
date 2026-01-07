import { supabase } from './supabase.js'

// 2. Elementos del DOM
const form = document.getElementById('formTipoCamion');
const tablaBody = document.querySelector('#tablaTiposCamion tbody');
const btnCancelar = document.getElementById('btnCancelar');

// 3. Función para listar tipos de camión
async function listarTiposCamion() {
	const { data, error } = await supabase
		.from('tipos_camion')
		.select('*')
		.order('id_tipo', { ascending: true });
	
	if (error) {
		console.error(error);
		return;
	}

	tablaBody.innerHTML = '';
	data.forEach(tipo => {
		let estadoTexto = 'Indeterminado';
		if (tipo.estado === 1) estadoTexto = 'Activo';
		else if (tipo.estado === 2) estadoTexto = 'Inactivo';

		let acciones = `
			<button class="btn btn-sm btn-warning btn-edit" 
					data-id="${tipo.id_tipo}" 
					data-tipo="${tipo.tipo}" 
					data-descripcion="${tipo.descripcion || ''}">Editar</button>
		`;

		if (tipo.estado !== 1) {
			acciones += ` <button class="btn btn-sm btn-success btn-activar" data-id="${tipo.id_tipo}">Activar</button>`;
		}
		if (tipo.estado === 1) {
			acciones += ` <button class="btn btn-sm btn-danger btn-desactivar" data-id="${tipo.id_tipo}">Desactivar</button>`;
		}

		tablaBody.innerHTML += `
			<tr>
				<td>${tipo.id_tipo}</td>
				<td>${tipo.tipo}</td>
				<td>${tipo.descripcion || ''}</td>
				<td>${estadoTexto}</td>
				<td>${acciones}</td>
			</tr>
		`;
	});

	// Agregar eventos a los botones después de renderizar
	document.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', editarTipoCamion));
	document.querySelectorAll('.btn-activar').forEach(btn => btn.addEventListener('click', activarTipoCamion));
	document.querySelectorAll('.btn-desactivar').forEach(btn => btn.addEventListener('click', desactivarTipoCamion));
}

// 4. Función para crear o actualizar
form.addEventListener('submit', async (e) => {
	e.preventDefault();
	const id = document.getElementById('id_tipo').value;
	const tipo = document.getElementById('tipo').value.trim();
	const descripcion = document.getElementById('descripcion').value.trim();

	if (!tipo) return alert('Debe ingresar un tipo de camión.');

	if (id) {
		// Actualizar
		const { error } = await supabase
			.from('tipos_camion')
			.update({ tipo, descripcion })
			.eq('id_tipo', id);
		if (error) return console.error(error);
	} else {
		// Crear
		const { error } = await supabase
			.from('tipos_camion')
			.insert({ tipo, descripcion, estado: 1 });
		if (error) return console.error(error);
	}

	form.reset();
	document.getElementById('id_tipo').value = '';
	listarTiposCamion();
});

// 5. Función para editar
function editarTipoCamion(e) {
	const btn = e.target;
	document.getElementById('id_tipo').value = btn.dataset.id;
	document.getElementById('tipo').value = btn.dataset.tipo;
	document.getElementById('descripcion').value = btn.dataset.descripcion;
}

// 6. Función para eliminar (estado = 2)
/*async function eliminarTipoCamion(e) {
	const id = e.target.dataset.id;
	if (!confirm('¿Está seguro de eliminar este tipo de camión?')) return;

	const { error } = await supabase
		.from('tipos_camion')
		.update({ estado: 2 })
		.eq('id_tipo', id);

	if (error) return console.error(error);
	listarTiposCamion();
}*/

// 7. Funciones para activar/desactivar
async function activarTipoCamion(e) {
	const id = e.target.dataset.id;
	const { error } = await supabase
		.from('tipos_camion')
		.update({ estado: 1 })
		.eq('id_tipo', id);
	if (error) return console.error(error);
	listarTiposCamion();
}

async function desactivarTipoCamion(e) {
	const id = e.target.dataset.id;
	const { error } = await supabase
		.from('tipos_camion')
		.update({ estado: 2 })
		.eq('id_tipo', id);
	if (error) return console.error(error);
	listarTiposCamion();
}

// 8. Botón cancelar
btnCancelar.addEventListener('click', () => {
	form.reset();
	document.getElementById('id_tipo').value = '';
});

// 9. Inicializar listado
listarTiposCamion();
