import { supabase } from './supabase.js';

// Elementos del DOM
const selectCamionEl = document.getElementById('selectCamion');
const selectServicioEl = document.getElementById('selectServicio');
const inputCodigo = document.getElementById('inputCodigo');
const inputPrecio = document.getElementById('inputPrecio');
const fechaInicio = document.getElementById('fechaInicio');
const fechaFin = document.getElementById('fechaFin');
const btnGuardarPrecio = document.getElementById('btnGuardarPrecio');
const tablaPreciosBody = document.querySelector('#tablaPrecios tbody');
const btnDescargarPlantilla = document.getElementById('btnDescargarPlantilla');
const btnProcesarPlantilla = document.getElementById('btnProcesarPlantilla');
const inputArchivoPlantilla = document.getElementById('inputArchivoPlantilla');
const resultadoPlantilla = document.getElementById('resultadoPlantilla');

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
let ultimoCodigoSugerido = '';

// Sugiere un código (servicio-categoria-camión) sin sobrescribir texto que el usuario haya escrito a mano
async function sugerirCodigo() {
	const id_camion = selectCamion.getValue(true);
	const id_servicio = selectServicio.getValue(true);
	if (!id_camion || !id_servicio) return;

	const { data: servicio, error } = await supabase
		.from('servicios')
		.select('codigo, categorias(codigo)')
		.eq('id_servicio', id_servicio)
		.single();

	if (error || !servicio) return;

	const codServicio = servicio.codigo || '';
	const codCategoria = servicio.categorias?.codigo || '';
	const codCamion = String(id_camion).padStart(2, '0');
	const sugerido = [codServicio, codCategoria, codCamion].filter(Boolean).join('-');

	// Solo autocompletar si el campo está vacío o todavía tiene la última sugerencia
	// (así no se pisa un código que el usuario ya haya editado a mano)
	if (!inputCodigo.value || inputCodigo.value === ultimoCodigoSugerido) {
		inputCodigo.value = sugerido;
		ultimoCodigoSugerido = sugerido;
	}
}

// Cargar camiones activos
async function cargarCamiones() {
	const { data, error } = await supabase
		.from('camiones')
		.select('*')
		.eq('estado', 1);

	if (error) return console.error(error);

	camiones = data;
	const choicesData = data.map(c => ({ value: c.id_camion, label: c.camion }));
	selectCamion.setChoices(choicesData, 'value', 'label', true);
}

async function cargarServicios() {
	const { data, error } = await supabase
		.from('servicios')
		.select('*')
		.eq('estado', 1);

	if (error) return console.error(error);

	servicios = data;
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
			<td>${p.codigo ?? ''}</td>
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
	const codigo = inputCodigo.value.trim();
	const precio = parseFloat(inputPrecio.value);
	const inicio = fechaInicio.value;
	const fin = fechaFin.value;

	if (!id_camion || !id_servicio || !codigo || !precio || !inicio || !fin) {
		alert('Complete todos los campos, incluyendo el código');
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
		.insert([{ id_camion, id_servicio, codigo, precio, estado: 1, fecha_inicio: inicio, fecha_fin: fin }]);

	if (error) {
		if (error.code === '23505') {
			alert('Ese código ya está en uso por otro servicio activo. Use un código distinto.');
		} else {
			alert('Error al guardar: ' + error.message);
		}
	} else {
		listarPrecios(id_camion);
		inputCodigo.value = '';
		ultimoCodigoSugerido = '';
		inputPrecio.value = '';
		fechaInicio.value = '';
		fechaFin.value = '';
	}
});

// --- Plantilla masiva (descarga/carga) --- //

// Interpreta una celda de fecha del Excel, sin importar si llegó como Date, número serial o texto
function interpretarFechaExcel(valor) {
	if (valor === '' || valor === null || valor === undefined) return null;

	if (valor instanceof Date) {
		if (isNaN(valor.getTime())) return null;
		const y = valor.getFullYear();
		const m = String(valor.getMonth() + 1).padStart(2, '0');
		const d = String(valor.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	if (typeof valor === 'number') {
		const f = XLSX.SSF.parse_date_code(valor);
		if (!f) return null;
		return `${f.y}-${String(f.m).padStart(2, '0')}-${String(f.d).padStart(2, '0')}`;
	}

	if (typeof valor === 'string') {
		const v = valor.trim();
		if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; // Ya viene en formato YYYY-MM-DD
		const partes = v.split(/[\/\-]/);
		if (partes.length === 3) {
			const [a, b, c] = partes;
			if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`; // YYYY-MM-DD
			if (c.length === 4) return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`; // DD-MM-YYYY o DD/MM/YYYY
		}
		return null;
	}

	return null;
}

// Descargar plantilla con todos los servicios activos para el camión seleccionado
btnDescargarPlantilla.addEventListener('click', async () => {
	const id_camion = selectCamion.getValue(true);
	if (!id_camion) return alert('Seleccione un camión primero');

	const camionInfo = camiones.find(c => c.id_camion == id_camion);

	const { data: serviciosActivos, error: errServ } = await supabase
		.from('servicios')
		.select('*')
		.eq('estado', 1)
		.order('id_servicio', { ascending: true });
	if (errServ) return alert('Error al cargar servicios: ' + errServ.message);

	// Precargar código/precio/fechas si el camión ya tiene un precio vigente para ese servicio
	const { data: preciosActuales, error: errPrecios } = await supabase
		.from('precios_servicio')
		.select('*')
		.eq('id_camion', id_camion)
		.eq('estado', 1);
	if (errPrecios) return alert('Error al cargar precios actuales: ' + errPrecios.message);

	const mapaPrecios = {};
	(preciosActuales || []).forEach(p => { mapaPrecios[p.id_servicio] = p; });

	const filas = serviciosActivos.map(s => {
		const actual = mapaPrecios[s.id_servicio];
		return {
			'ID Servicio': s.id_servicio,
			'Servicio': s.servicio,
			'Código': actual?.codigo || '',
			'Precio': actual?.precio ?? '',
			'Fecha Inicio': actual?.fecha_inicio || '',
			'Fecha Fin': actual?.fecha_fin || ''
		};
	});

	const wb = XLSX.utils.book_new();

	const wsInfo = XLSX.utils.aoa_to_sheet([
		['Camión', camionInfo?.camion || ''],
		['ID Camión', id_camion],
		['Generado', new Date().toLocaleString('es-HN')]
	]);
	XLSX.utils.book_append_sheet(wb, wsInfo, 'Info');

	const wsPrecios = XLSX.utils.json_to_sheet(filas);
	wsPrecios['!cols'] = [{ wch: 12 }, { wch: 35 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
	XLSX.utils.book_append_sheet(wb, wsPrecios, 'Precios');

	const nombreCamion = (camionInfo?.camion || `camion_${id_camion}`).replace(/[^a-z0-9]+/gi, '_');
	XLSX.writeFile(wb, `plantilla_precios_${nombreCamion}.xlsx`);
});

// Subir y procesar la plantilla llenada
btnProcesarPlantilla.addEventListener('click', async () => {
	const id_camion = selectCamion.getValue(true);
	if (!id_camion) return alert('Seleccione un camión primero');

	const archivo = inputArchivoPlantilla.files[0];
	if (!archivo) return alert('Seleccione un archivo de plantilla (.xlsx)');

	resultadoPlantilla.innerHTML = '<em>Procesando...</em>';

	let filas;
	try {
		const buffer = await archivo.arrayBuffer();
		const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
		const hoja = wb.Sheets['Precios'] || wb.Sheets[wb.SheetNames[0]];
		filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });
	} catch (err) {
		resultadoPlantilla.innerHTML = `<span class="text-danger">No se pudo leer el archivo: ${err.message}</span>`;
		return;
	}

	let insertados = 0, actualizados = 0, omitidos = 0;
	const errores = [];

	for (const fila of filas) {
		const id_servicio = fila['ID Servicio'];
		const nombreServicio = fila['Servicio'] || `ID ${id_servicio}`;
		const codigo = String(fila['Código'] ?? '').trim();
		const precioRaw = fila['Precio'];

		// Fila sin precio = no se ingresa ese servicio, se omite sin marcarlo como error
		if (precioRaw === '' || precioRaw === null || precioRaw === undefined) {
			omitidos++;
			continue;
		}

		if (!id_servicio) {
			errores.push(`Fila con servicio "${nombreServicio}": falta el ID Servicio, se omitió`);
			omitidos++;
			continue;
		}

		const precio = parseFloat(precioRaw);
		if (isNaN(precio) || precio < 0) {
			errores.push(`${nombreServicio}: precio inválido, se omitió`);
			omitidos++;
			continue;
		}

		if (!codigo) {
			errores.push(`${nombreServicio}: falta el código, se omitió`);
			omitidos++;
			continue;
		}

		const fecha_inicio = interpretarFechaExcel(fila['Fecha Inicio']);
		const fecha_fin = interpretarFechaExcel(fila['Fecha Fin']);
		if (!fecha_inicio || !fecha_fin) {
			errores.push(`${nombreServicio}: fecha inicio/fin inválida o vacía, se omitió`);
			omitidos++;
			continue;
		}
		if (fecha_inicio > fecha_fin) {
			errores.push(`${nombreServicio}: la fecha de inicio es mayor que la de fin, se omitió`);
			omitidos++;
			continue;
		}

		// ¿Ya hay un precio vigente para este camión+servicio? Si sí, se actualiza; si no, se inserta
		const { data: vigente, error: errBusqueda } = await supabase
			.from('precios_servicio')
			.select('id_precio')
			.eq('id_camion', id_camion)
			.eq('id_servicio', id_servicio)
			.eq('estado', 1)
			.maybeSingle();

		if (errBusqueda) {
			errores.push(`${nombreServicio}: error al verificar precio vigente (${errBusqueda.message})`);
			continue;
		}

		if (vigente) {
			const { error } = await supabase
				.from('precios_servicio')
				.update({ codigo, precio, fecha_inicio, fecha_fin })
				.eq('id_precio', vigente.id_precio);

			if (error) {
				errores.push(`${nombreServicio}: ${error.code === '23505' ? 'código duplicado (' + codigo + ')' : error.message}`);
			} else {
				actualizados++;
			}
		} else {
			const { error } = await supabase
				.from('precios_servicio')
				.insert([{ id_camion, id_servicio, codigo, precio, estado: 1, fecha_inicio, fecha_fin }]);

			if (error) {
				errores.push(`${nombreServicio}: ${error.code === '23505' ? 'código duplicado (' + codigo + ')' : error.message}`);
			} else {
				insertados++;
			}
		}
	}

	let resumen = `<div class="alert alert-info">Procesado: ${insertados} nuevo(s), ${actualizados} actualizado(s), ${omitidos} omitido(s) sin precio.</div>`;
	if (errores.length) {
		resumen += `<div class="alert alert-warning"><strong>${errores.length} fila(s) con problemas:</strong><ul class="mb-0">${errores.map(e => `<li>${e}</li>`).join('')}</ul></div>`;
	}
	resultadoPlantilla.innerHTML = resumen;

	inputArchivoPlantilla.value = '';
	listarPrecios(id_camion);
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
	inputCodigo.value = data.codigo ?? '';
	inputPrecio.value = data.precio;
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
selectCamionEl.addEventListener('change', sugerirCodigo);
selectServicioEl.addEventListener('change', sugerirCodigo);

// Inicializar
cargarCamiones().then(() => listarPrecios(selectCamion.getValue(true)));
cargarServicios();
