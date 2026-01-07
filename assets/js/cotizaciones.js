import { supabase } from './supabase.js';
const { jsPDF } = window.jspdf; // ya lo hacías correctamente en generarPDF()
const doc = new jsPDF();

// Datos de ejemplo (puedes reemplazar con consultas reales)
let clientes = [];
let camiones = [];
let servicios = [];
let preciosServicios = [];

// Cotización inicial
let cotizacion = {
	id_cotizacion: null,
	fecha: new Date().toISOString().slice(0, 10),
	estado: 7, // Parcial
	id_camion: null,
	cliente: { id_cliente: null, nombre: '', direccion: '', dni: null, rtn: null, es_nuevo: false },
	lineas: [],
	totales: { subtotal: 0, isv: 0, total: 0 }
};

// Choices.js
const choiceCliente = new Choices('#selectCliente', {searchEnabled:true, removeItemButton:true});
const choiceCamion = new Choices('#selectCamion', {searchEnabled:true});

function initDropdowns() {
	choiceCliente.setChoices(clientes.map(c => ({ value: c.dni, label: c.nombre_legal })), 'value', 'label', false);
	choiceCamion.setChoices(camiones.map(c => ({ value: c.id_camion, label: c.camion })), 'value', 'label', false);
}

// ---------------- Eventos ----------------
document.addEventListener('DOMContentLoaded', async () => {
	document.getElementById('fechaCotizacion').value = cotizacion.fecha;

	await cargarDatos();
	initDropdowns();
	actualizarTabla();

	document.getElementById('btnAgregarLinea').addEventListener('click', agregarLineaServicio);
	document.getElementById('btnClienteManual').addEventListener('click', clienteManual);
	document.getElementById('btnGuardar').addEventListener('click', () => guardarParcial(cotizacion));
	document.getElementById('btnEmitir').addEventListener('click', () => emitirCotizacion(cotizacion));
	document.getElementById('selectCamion').addEventListener('change', seleccionarCamion);
	document.getElementById('selectCliente').addEventListener('change', seleccionarCliente);
});


// ---------------- Funciones ----------------

async function cargarDatos() {
	// Clientes activos
	const { data: clientesData, error: errClientes } = await supabase
		.from('clientes')
		.select('*')
		.eq('estado', 1);
	if (errClientes) console.error(errClientes);
	else clientes = clientesData;

	// Camiones activos
	const { data: camionesData, error: errCamiones } = await supabase
		.from('camiones')
		.select('*')
		.eq('estado', 1);
	if (errCamiones) console.error(errCamiones);
	else camiones = camionesData;

	// Servicios
	const { data: serviciosData, error: errServicios } = await supabase
		.from('servicios')
		.select('*')
		.eq('estado', 1);
	if (errServicios) console.error(errServicios);
	else servicios = serviciosData;

	// Precios de servicios activos
	const hoy = new Date().toISOString().slice(0, 10);
	const { data: preciosData, error: errPrecios } = await supabase
		.from('precios_servicio')
		.select('*')
		.eq('estado', 1)
		.lte('fecha_inicio', hoy)
		.gte('fecha_fin', hoy);
	if (errPrecios) console.error(errPrecios);
	else preciosServicios = preciosData || [];
}

async function cargarPreciosCamion(id_camion) {
	const hoy = new Date().toISOString().slice(0, 10);

	const { data, error } = await supabase
		.from('precios_servicio')
		.select('*')
		.eq('id_camion', id_camion)
		.eq('estado', 1)
		.lte('fecha_inicio', hoy)
		.gte('fecha_fin', hoy);

	if (error) {
		console.error(error);
		preciosServicios = [];
	} else {
		preciosServicios = data; // Guardamos precios vigentes
	}
}

function obtenerPrecioServicio(id_linea, id_servicio){
	const p = preciosServicios.find(p => p.id_servicio === id_servicio);
	return p ? p.precio : 0;
}

function obtenerServiciosDisponibles(id_linea) {
	const idCamion = cotizacion.id_camion;
	if (!idCamion) return [];

	// Filtrar por camión y que tengan precio activo
	let disponibles = preciosServicios.filter(p => p.id_camion === idCamion);

	// Mapear a objeto completo de servicio con precio
	disponibles = disponibles.map(p => {
		const s = servicios.find(s => s.id_servicio === p.id_servicio);
		return s ? { ...s, precio: p.precio } : null;
	}).filter(Boolean);

	// Evitar duplicados
	disponibles = disponibles.filter(s => 
		!cotizacion.lineas.some(l => l.id_servicio === s.id_servicio && l.id_linea !== id_linea)
	);

	return disponibles;
}

async function seleccionarCamion(event){
	const id = parseInt(event.target.value);
	const hayServicios = cotizacion.lineas.some(l=>!l.es_camion);
	if(cotizacion.id_camion && hayServicios){
		alert('Ya seleccionaste un camión y hay servicios ingresados. No se puede cambiar.');
		event.target.value = cotizacion.id_camion;
		return;
	}
	cotizacion.id_camion = id;
	await cargarPreciosCamion(id);
	const lineaCamion = cotizacion.lineas.find(l=>l.es_camion);
	if(lineaCamion){
		lineaCamion.descripcion = getSelectedText(event.target);
	} else {
		agregarLineaCamion();
		document.getElementById('btnAgregarLinea').disabled = false;
	}
	actualizarTabla();
}

function agregarLineaCamion() {
	const linea = {
		id_linea: crypto.randomUUID(),
		id_servicio: null,
		nombre_servicio:'Camión',
		descripcion:getSelectedText(document.getElementById('selectCamion')),
		precio_unitario:0,
		cantidad:0,
		total_linea:0,
		es_camion:true
	};
	cotizacion.lineas.push(linea);
	recalcularTotales();
	actualizarTabla();
}

function getSelectedText(selectElement) {
	var selectedIndex = selectElement.selectedIndex;
	var selectedOption = selectElement.options[selectedIndex];
	return selectedOption.text || selectedOption.textContent;
}

function agregarLineaServicio() {
	const serviciosEnLinea = cotizacion.lineas
		.filter(l => !l.es_camion)
		.map(l => l.id_servicio);

	const serviciosDisponibles = servicios.filter(s =>
		preciosServicios.some(p => p.id_servicio === s.id_servicio && p.id_camion === cotizacion.id_camion) &&
		!serviciosEnLinea.includes(s.id_servicio)
	);

	if (serviciosDisponibles.length === 0) {
		alert('No hay más servicios disponibles para este camión');
		return;
	}

	const servicio = serviciosDisponibles[0];
	const precio = obtenerPrecioServicio(cotizacion.id_camion, servicio.id_servicio);

	const linea = {
		id_linea: crypto.randomUUID(),
		id_servicio: servicio.id_servicio,
		nombre_servicio: servicio.servicio,
		descripcion: servicio.descripcion || servicio.servicio,
		precio_unitario: precio,
		cantidad: 1,
		total_linea: redondeoBancario(precio * 1),
		es_camion: false
	};

	cotizacion.lineas.push(linea);
	recalcularTotales();
	actualizarTabla();
}

function clienteManual() {
	cotizacion.cliente.es_nuevo = true;
	document.getElementById('inputClienteNombre').value = '';
	document.getElementById('inputClienteDireccion').value = '';
	document.getElementById('inputDNI').value = '';
	document.getElementById('inputRTN').value = '';
	document.getElementById('selectCliente').disabled = true;
}

function seleccionarCliente(event) {
	const dni = event.target.value;
	const c = clientes.find(x => String(x.dni) === String(dni));
	if (c) {
		cotizacion.cliente = {
			id_cliente: c.dni,
			nombre: c.nombre_legal,
			direccion: c.direccion,
			dni: c.dni,
			rtn: c.rtn,
			es_nuevo: false
		};
		document.getElementById('inputClienteNombre').value = c.nombre_legal;
		document.getElementById('inputClienteDireccion').value = c.direccion;
		document.getElementById('inputDNI').value = c.dni;
		document.getElementById('inputRTN').value = c.rtn;
	}
}

function actualizarTabla() {
	const tbody = document.querySelector('#tablaLineas tbody');
	tbody.innerHTML = '';

	cotizacion.lineas.forEach((l, i) => {
		const tr = document.createElement('tr');

		if (l.es_camion) {
			tr.innerHTML = `
				<td>${i+1}</td>
				<td>${l.nombre_servicio}</td>
				<td><input type="text" class="form-control" value="${l.descripcion}" readonly disabled></td>
				<td>-</td>
				<td>-</td>
				<td>-</td>
				<td></td>
			`;
		} else {
			tr.innerHTML = `
				<td>${i+1}</td>
				<td>${generarDropdownServicio(l.id_linea, l.id_servicio)}</td>
				<td><input type="text" class="form-control" value="${l.descripcion}" ${!esEditable() ? 'readonly' : ''} data-id="${l.id_linea}" onchange="editarDescripcion(event)"></td>
				<td><input type="number" class="form-control" value="${l.cantidad || 1}" min="1" ${!esEditable() ? 'readonly' : ''} data-id="${l.id_linea}" onchange="editarCantidad(event)"></td>
				<td><input type="number" class="form-control" value="${l.precio_unitario || 0}" min="0" step="0.01" ${!esEditable() ? 'readonly' : ''} data-id="${l.id_linea}" onchange="editarPrecio(event)"></td>
				<td>${l.total_linea.toFixed(2)}</td>
				<td>${esEditable() ? `<button class="btn btn-danger btn-sm" onclick="eliminarLinea('${l.id_linea}')">Eliminar</button>` : ''}</td>
			`;
		}

		tbody.appendChild(tr);
	});

	cotizacion.lineas.forEach(l => {
		if (!l.es_camion && esEditable()) {
			const select = document.getElementById(`servicio_${l.id_linea}`);
			if (select) {
				if (select.choicesInstance) select.choicesInstance.destroy();

				const choices = new Choices(select, {
					searchEnabled: true,
					placeholder: true,
					placeholderValue: 'Seleccione una opción',
					removeItemButton: false,
					shouldSort: false
				});

				select.choicesInstance = choices;

				select.addEventListener('change', cambiarServicioLinea);
			}
		}
	});

	// Totales
	document.getElementById('subtotal').innerText = cotizacion.totales.subtotal.toFixed(2);
	document.getElementById('isv').innerText = cotizacion.totales.isv.toFixed(2);
	document.getElementById('total').innerText = cotizacion.totales.total.toFixed(2);
}

function generarDropdownServicio(id_linea, id_servicio_seleccionado) {
	const disponibles = obtenerServiciosDisponibles(id_linea);
	const select = document.createElement('select');
	select.className = 'form-select';
	select.id = `servicio_${id_linea}`;
	select.dataset.id = id_linea;

	const placeholder = document.createElement('option');
	placeholder.value = '';
	placeholder.text = 'Seleccione una opción';
	placeholder.disabled = true;
	placeholder.selected = true;
	select.appendChild(placeholder);

	disponibles.forEach(s => {
		const option = document.createElement('option');
		option.value = s.id_servicio;
		option.text = s.servicio;
		if (s.id_servicio === id_servicio_seleccionado) option.selected = true;
		select.appendChild(option);
	});

	return select.outerHTML;
}

function cambiarServicioLinea(event) {
	const id_linea = event.target.dataset.id;
	const id_servicio = parseInt(event.target.value);
	const linea = cotizacion.lineas.find(l => l.id_linea === id_linea);
	if (!linea) return;

	const servicio = servicios.find(s => s.id_servicio === id_servicio);
	const precioObj = preciosServicios.find(p => p.id_servicio === id_servicio && p.id_camion === cotizacion.id_camion);

	if (!servicio || !precioObj) return;

	linea.id_servicio = id_servicio;
	linea.nombre_servicio = servicio.servicio;
	linea.descripcion = servicio.descripcion || servicio.servicio;
	linea.precio_unitario = precioObj.precio || 0;
	linea.total_linea = redondeoBancario(linea.precio_unitario * (linea.cantidad || 1));

	recalcularTotales();
	actualizarTabla(); // actualiza todos los selects para evitar duplicados
}

function sincronizarClienteManual() {
	if (!cotizacion.cliente.es_nuevo) return;

	cotizacion.cliente.nombre = document.getElementById('inputClienteNombre').value.trim();
	cotizacion.cliente.direccion = document.getElementById('inputClienteDireccion').value.trim();
	cotizacion.cliente.dni = document.getElementById('inputDNI').value.trim();
	cotizacion.cliente.rtn = document.getElementById('inputRTN').value.trim();
}

async function validarDNINoDuplicado(dni) {
	if (!dni) return true;

	const { data, error } = await supabase
		.from('clientes')
		.select('dni')
		.eq('dni', dni)
		.limit(1);

	if (error) {
		console.error(error);
		throw new Error('Error validando DNI');
	}

	return data.length === 0; // true = no existe
}

function determinarTipoCliente() {
	const dniInput = document.getElementById('inputDNI').value.trim();
	cotizacion.cliente.es_nuevo = !!dniInput && !cotizacion.cliente.id_cliente;
}

window.editarDescripcion = (e) => {
	const id = e.target.dataset.id;
	const l = cotizacion.lineas.find(x => x.id_linea === id);
	l.descripcion = e.target.value;
};

window.editarCantidad = (e) => {
	const id = e.target.dataset.id;
	const l = cotizacion.lineas.find(x => x.id_linea === id);
	l.cantidad = parseInt(e.target.value) || 0;
	l.total_linea = redondeoBancario(l.cantidad * (l.precio_unitario || 0));
	recalcularTotales();
	actualizarTabla();
};

window.editarPrecio = (e) => {
	const id = e.target.dataset.id;
	const l = cotizacion.lineas.find(x => x.id_linea === id);
	l.precio_unitario = parseFloat(e.target.value) || 0;
	l.total_linea = redondeoBancario(l.cantidad * l.precio_unitario);
	recalcularTotales();
	actualizarTabla();
};

window.eliminarLinea = (id) => {
	cotizacion.lineas = cotizacion.lineas.filter(x => x.id_linea !== id);
	recalcularTotales();
	actualizarTabla();
};

function recalcularTotales(){
	let subtotal = cotizacion.lineas.reduce((acc,l)=>acc+l.total_linea,0);
	subtotal = redondeoBancario(subtotal);
	const isv = redondeoBancario(subtotal*0.15);
	cotizacion.totales.subtotal = subtotal;
	cotizacion.totales.isv = isv;
	cotizacion.totales.total = redondeoBancario(subtotal+isv);
}

function redondeoBancario(valor){
	return Math.round(valor*100)/100;
}

function esEditable(){
	return cotizacion.estado===7;
}

// ---------------- Guardado ----------------
async function guardarParcial(cot){
	try{
		sincronizarClienteManual();
		if(!cot.id_cotizacion){
			const { data, error } = await supabase.from('cotizaciones').insert([{
				fecha_cotizacion: cot.fecha,
				cliente: cot.cliente.nombre,
				direccion: cot.cliente.direccion,
				subtotal: cot.totales.subtotal,
				isv: cot.totales.isv,
				total: cot.totales.total,
				id_estado: 7,
				id_camion: cot.id_camion
			}]).select().single();
			if(error) throw error;
			cot.id_cotizacion = data.id_cotizacion;
		}

		const lineasData = cot.lineas.map(l=>({
			id_cotizacion: cot.id_cotizacion,
			id_servicio: l.id_servicio,
			descripcion_servicio: l.descripcion,
			precio_unitario: l.precio_unitario,
			cantidad: l.cantidad,
			total_linea: l.total_linea
		}));

		await supabase
		.from('cotizacion_detalle')
		.delete()
		.eq('id_cotizacion', cot.id_cotizacion);

		const { error: detErr } = await supabase.from('cotizacion_detalle').insert(lineasData);
		if(detErr) throw detErr;
		alert('Cotización guardada parcialmente');
	} catch(err){
		console.error(err);
		alert('Error guardando cotización parcial');
	}
}

// ---------------- Emitir ----------------
async function emitirCotizacion(cot){
	try{
		if(cot.cliente.es_nuevo){
			cot.cliente.dni = String(cot.cliente.dni).trim();
			sincronizarClienteManual();
			determinarTipoCliente();
			if (!cot.cliente.nombre || !cot.cliente.dni) {
				alert('Debe ingresar al menos Nombre y DNI del cliente');
				return;
			}

			const dniDisponible = await validarDNINoDuplicado(cot.cliente.dni);
			if (!dniDisponible) {
				alert('El DNI ingresado ya existe. Seleccione el cliente desde la lista.');
				return;
			}

			const { data, error } = await supabase
			.from('clientes')
			.insert([{
				nombre_legal: cot.cliente.nombre || document.getElementById('inputClienteNombre').value,
				direccion: cot.cliente.direccion || document.getElementById('inputClienteDireccion').value,
				dni: cot.cliente.dni || document.getElementById('inputDNI').value,
				rtn: cot.cliente.rtn || document.getElementById('inputRTN').value,
				estado: 1
			}])
			.select()
			.single();
			if(error) throw error;

			clientes.push({
				dni: data.dni,
				nombre_legal: data.nombre_legal,
				direccion: data.direccion,
				rtn: data.rtn,
				estado: 1
			});

			choiceCliente.setChoices([{
				value: data.dni,
				label: data.nombre_legal,
				selected: true
			}], 'value', 'label', false);

			cot.cliente = {
				id_cliente: data.dni,
				nombre: data.nombre_legal,
				direccion: data.direccion,
				dni: data.dni,
				rtn: data.rtn,
				es_nuevo: false
			};
		}

		await guardarParcial(cot);

		const { error: updErr } = await supabase.from('cotizaciones')
			.update({id_estado:5})
			.eq('id_cotizacion', cot.id_cotizacion);
		if(updErr) throw updErr;

		alert('Cotización emitida');
		generarPDF(cot);
	} catch(err){
		console.error(err);
		alert('Error emitiendo cotización');
	}
}

// ---------------- PDF ----------------
async function generarPDF(cot) {
	const { jsPDF } = window.jspdf;
	const doc = new jsPDF('p','mm','letter');
	const margenIzq = 14;
	const margenDer = 14;
	const anchoMax = doc.internal.pageSize.getWidth() - margenIzq - margenDer;
	const anchoPagina = anchoMax;

	// ---------------- Cargar datos del local ----------------
	const { data, error } = await supabase
		.from('datos')
		.select('*')
		.eq('id', 1)
		.limit(1);

	if (error || !data || data.length === 0) {
		throw new Error('No se encontraron datos del local (tabla datos, id=1)');
	}

	const datosLocal = data[0];

	// ---------------- Logo ----------------
	const img = new Image();
	img.src = '../assets/img/logo.png';
	await new Promise(resolve => img.onload = resolve);

	// Conversión px → mm (170px)
	const logoHeightMm = 45; // 170px ≈ 45mm
	const logoWidthMm = (img.width / img.height) * logoHeightMm;

	// Asegurar que nunca exceda los márgenes
	const maxWidth = doc.internal.pageSize.getWidth() - margenIzq - margenDer;
	const finalLogoWidth = Math.min(logoWidthMm, maxWidth);
	const finalLogoHeight = (finalLogoWidth / logoWidthMm) * logoHeightMm;

	// Centrado horizontal
	const logoX = (doc.internal.pageSize.getWidth() - finalLogoWidth) / 2;

	doc.addImage(
		img,
		'PNG',
		logoX,
		10,
		finalLogoWidth,
		finalLogoHeight
	);

	// ---------------- Datos del local debajo del logo ----------------
	const startY = 10 + logoHeightMm + 5;
	const centerX = doc.internal.pageSize.getWidth()/2;
	doc.setFontSize(11);
	doc.text(datosLocal.direccion || '', centerX, startY, { align: 'center' });
	doc.text(datosLocal.correo || '', centerX, startY + 7, { align: 'center' });
	doc.text(`Cel.: ${datosLocal.telefono || ''}`, centerX, startY + 14, { align: 'center' });
	doc.text(`RTN: ${datosLocal.rtn || ''}`, centerX, startY + 21, { align: 'center' });

	let yActual = startY + 30;

	// ---------------- Mini tabla Cliente / Dirección / Fecha ----------------
	doc.autoTable({
		startY: yActual,
		margin: { left: margenIzq, right: margenDer },
		theme: 'grid',
		tableWidth: 'auto',
		styles: { fontSize: 10, halign: 'left', fillColor: [220,220,220] },
		body: [
			[`Cliente: ${cot.cliente.nombre}`],
			[`Dirección: ${cot.cliente.direccion}`],
			[`Fecha: ${cot.fecha}`]
		],
		columns: [{ dataKey: 'info' }]
	});

	yActual = doc.lastAutoTable.finalY + 8;

	// ---------------- Encabezado COTIZACIÓN ----------------
	doc.setFontSize(14);
	doc.setFont('helvetica','bold');
	doc.text('COTIZACIÓN', centerX, yActual, { align: 'center' });
	yActual += 7;

	// ---------------- Detalle de Cotización ----------------
	const lineasTotales = cot.lineas.filter(l => l.id_servicio !== null || l.es_camion);
	const lineasPorPagina = 12;
	const camionesLine = cot.lineas.find(l => l.es_camion);

	for(let i=0; i<lineasTotales.length; i+=lineasPorPagina-1){
		const pageLineas = lineasTotales.slice(i, i + lineasPorPagina - 1);
		const body = [];

		// Primera fila: camión centrado en descripción
		body.push([
			{ content: '', styles:{ fontStyle:'bold', halign:'center' } },
			{ content: camionesLine.descripcion, styles:{ fontStyle:'bold', halign:'center' } },
			{ content: '', styles:{ fontStyle:'bold', halign:'right' } },
			{ content: '', styles:{ fontStyle:'bold', halign:'right' } }
		]);

		pageLineas.forEach(l => {
			if(l.es_camion) return; // ya agregada
			body.push([
				{ content: l.cantidad.toLocaleString() || '0', styles:{ halign:'right' } },
				{ content: l.descripcion, styles:{ halign:'left' } },
				{ content: l.precio_unitario.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 }), styles:{ halign:'right' } },
				{ content: l.total_linea.toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 }), styles:{ halign:'right' } }
			]);
		});

		// Totales solo en la última página
		if(i + (lineasPorPagina-1) >= lineasTotales.length){
			body.push(
				['', '', { content: 'Subtotal', styles: { fontStyle: 'bold', halign: 'right' } },
					{ content: cot.totales.subtotal.toLocaleString(undefined,{minimumFractionDigits:2}), styles: { halign: 'right' } }],
				['', '', { content: '15% ISV', styles: { fontStyle: 'bold', halign: 'right' } },
					{ content: cot.totales.isv.toLocaleString(undefined,{minimumFractionDigits:2}), styles: { halign: 'right' } }],
				['', '', { content: 'Total', styles: { fontStyle: 'bold', halign: 'right' } },
					{ content: cot.totales.total.toLocaleString(undefined,{minimumFractionDigits:2}), styles: { halign: 'right' } }]
			);
		}

		doc.autoTable({
			startY: yActual,
			margin: { left: margenIzq, right: margenDer },
			head: [['Cant.','Descripción','Valor C/U','Valor Total']],
			body: body,
			theme: 'grid',
			styles: { fontSize: 10 },
			headStyles: { fillColor: [220,220,220], halign:'center' }
		});
		yActual = doc.lastAutoTable.finalY + 5;
		
		if(i + (lineasPorPagina-1) >= lineasTotales.length){
			const totalesY = yActual + 5;
			const labelX = margenIzq + 110;
			const valorX = margenIzq + 150;

			// Total en letras
			yActual = totalesY + 25;
			doc.setFont('helvetica','normal');
			doc.text(`Son: ${numeroALetras(cot.totales.total)} L 00/100`, centerX, yActual, { align:'center' });

			// Línea de firma
			yActual += 20;
			doc.line(margenIzq+50, yActual, doc.internal.pageSize.getWidth()-margenIzq-50, yActual);
			doc.text('Firma', centerX, yActual + 7, { align:'center' });
		}

		if(i + (lineasPorPagina-1) < lineasTotales.length){
			doc.addPage();
			yActual = 20; // margen superior para nuevas páginas
		}
	}

	doc.save(`Cotizacion_${cot.id_cotizacion}.pdf`);
}

// ---------------- Función auxiliar para número a letras ----------------
function numeroALetras(num) {
	num = Math.floor(num);

	if (num === 0) return 'CERO';

	const unidades = [
		'', 'UNO', 'DOS', 'TRES', 'CUATRO',
		'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'
	];

	const especiales = [
		'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE',
		'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'
	];

	const decenas = [
		'', '', 'VEINTE', 'TREINTA', 'CUARENTA',
		'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'
	];

	const centenas = [
		'', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS',
		'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'
	];

	function convertirMenorDeMil(n) {
		if (n === 0) return '';
		if (n === 100) return 'CIEN';

		let texto = '';

		const c = Math.floor(n / 100);
		const d = Math.floor((n % 100) / 10);
		const u = n % 10;

		if (c > 0) texto += centenas[c] + ' ';

		if (d === 1) {
			texto += especiales[u];
		} else if (d > 1) {
			texto += decenas[d];
			if (u > 0) texto += ' Y ' + unidades[u];
		} else if (u > 0) {
			texto += unidades[u];
		}

		return texto.trim();
	}

	let resultado = '';

	if (num >= 1000) {
		const miles = Math.floor(num / 1000);
		const resto = num % 1000;

		if (miles === 1) {
			resultado = 'MIL';
		} else {
			resultado = convertirMenorDeMil(miles) + ' MIL';
		}

		if (resto > 0) {
			resultado += ' ' + convertirMenorDeMil(resto);
		}
	} else {
		resultado = convertirMenorDeMil(num);
	}

	return resultado.trim();
}

function obtenerPaginas(cot){
	const paginas = [];
	const lineasPorPagina = 12;
	for(let i=0; i<cot.lineas.length; i+=lineasPorPagina){
		paginas.push(cot.lineas.slice(i,i+lineasPorPagina));
	}
	return paginas;
}
