import { supabase } from './supabase.js';

// Elementos del DOM
const selectCamionEl = document.getElementById('selectCamion');
const selectServicioEl = document.getElementById('selectServicio');
const inputPrecio = document.getElementById('inputPrecio');
const fechaInicio = document.getElementById('fechaInicio');
const fechaFin = document.getElementById('fechaFin');
const btnGuardarPrecio = document.getElementById('btnGuardarPrecio');
const tablaPreciosBody = document.querySelector('#tablaPrecios tbody');

const selectCamion = new Choices(selectCamionEl, {
	searchEnabled: true,
	itemSelectText: '',
	placeholderValue: 'Seleccione un camión',
	shouldSort: false,
});

const selectServicio = new Choices(selectServicioEl, {
	searchEnabled: true,
	itemSelectText: '',
	placeholderValue: 'Seleccione un servicio',
	shouldSort: false,
});

let camiones = [];
let servicios = [];

// Cargar camiones activos
async function cargarCamiones() {
	const { data, error } = await supabase
		.from('camiones')
		.select('*')
		.eq('estado', 1);

	if (error) return console.error(error);

	const choicesData = data.map(c => ({ value: c.id_camion, label: c.camion }));
	selectCamion.setChoices(choicesData, 'value', 'label', true);
}

async function cargarServicios() {
	const { data, error } = await supabase
		.from('servicios')
		.select('*')
		.eq('estado', 1);

	if (error) return console.error(error);

	const choicesData = data.map(s => ({ value: s.id_servicio, label: s.servicio }));
	selectServicio.setChoices(choicesData, 'value', 'label', true);
}


// Listar precios asignados a un camión
async function listarPrecios(camionId) {
	if (!camionId) return tablaPreciosBody.innerHTML = '';
	const { data } = await supabase
		.from('precios_servicio')
		.select('*, servicios(servicio)')
		.eq('id_camion', camionId);
	
	tablaPreciosBody.innerHTML = data.map(p => `
		<tr>
			<td>${p.servicios.servicio}</td>
			<td>${new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL' }).format(p.precio)}</td>
			<td>${p.fecha_inicio}</td>
			<td>${p.fecha_fin}</td>
			<td>${p.estado == 1 ? 'Activo' : 'Inactivo'}</td>
			<td>
				<button class="btn btn-sm btn-warning" onclick="toggleEstado(${p.id_precio}, ${p.estado})">
					${p.estado == 1 ? 'Desactivar' : 'Activar'}
				</button>
				<button class="btn btn-sm btn-secondary" onclick="modificarPrecio(${p.id_precio})">Modificar</button>
			</td>
		</tr>
	`).join('');
}

// Guardar precio
btnGuardarPrecio.addEventListener('click', async () => {
	const id_camion = selectCamion.getValue(true);
	const id_servicio = selectServicio.getValue(true);
	const precio = parseFloat(inputPrecio.value);
	const inicio = fechaInicio.value;
	const fin = fechaFin.value;

	if (!id_camion || !id_servicio || !precio || !inicio || !fin) {
		alert('Complete todos los campos');
		return;
	}

	if (inicio > fin) {
		alert('La fecha de inicio no puede ser mayor que la de fin');
		return;
	}

	// Validar solapamiento de fechas
	const { data: solapados } = await supabase
		.from('precios_servicio')
		.select('*')
		.eq('id_camion', id_camion)
		.eq('id_servicio', id_servicio)
		.eq('estado', 1)
		.or(`fecha_inicio.lte.${fin},fecha_fin.gte.${inicio}`);

	if (solapados.length > 0) {
		alert('Ya existe un precio activo en ese rango de fechas');
		return;
	}

	// Insertar precio
	const { error } = await supabase
		.from('precios_servicio')
		.insert([{ id_camion, id_servicio, precio, estado: 1, fecha_inicio: inicio, fecha_fin: fin }]);

	if (error) {
		alert('Error al guardar: ' + error.message);
	} else {
		listarPrecios(id_camion);
		inputPrecio.value = '';
		fechaInicio.value = '';
		fechaFin.value = '';
	}
});

// Activar/Desactivar precio
window.toggleEstado = async (id, estadoActual) => {
	const nuevoEstado = estadoActual == 1 ? 2 : 1;
	await supabase
		.from('precios_servicio')
		.update({ estado: nuevoEstado })
		.eq('id_precio', id);
	listarPrecios(selectCamion.value);
}

window.modificarPrecio = async (id) => {
	const { data } = await supabase
		.from('precios_servicio')
		.select('*')
		.eq('id_precio', id)
		.single();

	// Copiar valores al formulario
	selectCamion.setChoiceByValue(data.id_camion);
	selectServicio.setChoiceByValue(data.id_servicio);
	inputPrecio.value = new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL' }).format(data.precio);
	fechaInicio.value = data.fecha_inicio;
	fechaFin.value = data.fecha_fin;

	// Opcional: desactivar automáticamente el precio viejo
	if (data.estado == 1) {
		await supabase.from('precios_servicio').update({ estado: 2 }).eq('id_precio', id);
		listarPrecios(selectCamion.value);
	}
};

// Eventos
selectCamionEl.addEventListener('change', () => listarPrecios(selectCamion.getValue(true)));

// Inicializar
cargarCamiones().then(() => listarPrecios(selectCamion.getValue(true)));
cargarServicios();
