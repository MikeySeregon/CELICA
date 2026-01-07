import { supabase } from './supabase.js';

const form = document.getElementById('formServicio');
const tablaBody = document.querySelector('#tablaServicios tbody');
const btnCancelar = document.getElementById('btnCancelar');

async function listarServicios() {
	const { data, error } = await supabase
		.from('servicios')
		.select('*')
		.order('id_servicio', { ascending: true });

	if (error) return console.error(error);

	tablaBody.innerHTML = '';
	tablaBody.innerHTML = '';
	data.forEach(servicio => {
		let estadoTexto = 'Indeterminado';
		if (servicio.estado === 1) estadoTexto = 'Activo';
		else if (servicio.estado === 2) estadoTexto = 'Inactivo';

		let acciones = `
			<button class="btn btn-sm btn-warning btn-edit" 
					data-id="${servicio.id_servicio}" 
					data-tipo="${servicio.servicio}" 
					data-descripcion="${servicio.descripcion || ''}">Editar</button>
		`;

		if (servicio.estado !== 1) {
			acciones += ` <button class="btn btn-sm btn-success btn-activar" data-id="${servicio.id_servicio}">Activar</button>`;
		}
		if (servicio.estado === 1) {
			acciones += ` <button class="btn btn-sm btn-danger btn-desactivar" data-id="${servicio.id_servicio}">Desactivar</button>`;
		}

		tablaBody.innerHTML += `
			<tr>
				<td>${servicio.id_servicio}</td>
				<td>${servicio.servicio}</td>
				<td>${servicio.descripcion || ''}</td>
				<td>${estadoTexto}</td>
				<td>${acciones}</td>
			</tr>
		`;
	});

	// Agregar eventos a los botones después de renderizar
	document.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', editarServicio));
	document.querySelectorAll('.btn-activar').forEach(btn => btn.addEventListener('click', activarServicio));
	document.querySelectorAll('.btn-desactivar').forEach(btn => btn.addEventListener('click', desactivarServicio));
}

// Función para guardar o actualizar servicio
form.addEventListener('submit', async (e) => {
	e.preventDefault();
	
	const id = document.getElementById('idServicio').value;
	const servicio = document.getElementById('servicio').value;
	const descripcion = document.getElementById('descripcion').value;

	if (id) {
		// Actualizar
		const { error } = await supabase
			.from('servicios')
			.update({ servicio, descripcion })
			.eq('id_servicio', id);
		if (error) return console.error(error);
	} else {
		// Insertar
		const { error } = await supabase
			.from('servicios')
			.insert({ servicio, descripcion });
		if (error) return console.error(error);
	}

	form.reset();
	listarServicios();
});

// Función para editar un servicio
async function editarServicio(e) {
	const btn = e.target;

	document.getElementById('idServicio').value = btn.dataset.id;
	document.getElementById('servicio').value = btn.dataset.tipo;
	document.getElementById('descripcion').value = btn.dataset.descripcion;
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
listarServicios();
