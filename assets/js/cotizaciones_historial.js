import { supabase } from './supabase.js';

let tabla;
let modalDetalle;

/* =========================
	 Inicialización
========================= */
document.addEventListener('DOMContentLoaded', async () => {
	modalDetalle = new bootstrap.Modal(
		document.getElementById('modalDetalleCotizacion')
	);

	await cargarCotizaciones();
});

/* =========================
	 Cargar listado principal
========================= */
async function cargarCotizaciones() {
	const { data, error } = await supabase
		.from('cotizaciones')
		.select(`
			id_cotizacion,
			fecha_cotizacion,
			cliente,
			total,
			id_estado
		`)
		.order('fecha_cotizacion', { ascending: false });

	if (error) {
		console.error(error);
		alert('Error cargando cotizaciones');
		return;
	}

	renderTabla(data);
}

/* =========================
	 Render DataTable
========================= */
function renderTabla(cotizaciones) {
	const tbody = document.querySelector('#tablaCotizaciones tbody');
	tbody.innerHTML = '';

	cotizaciones.forEach(c => {
		const tr = document.createElement('tr');

		tr.innerHTML = `
			<td>${generarCodigo(c.id_cotizacion)}</td>
			<td>${c.cliente}</td>
			<td>${c.fecha_cotizacion}</td>
			<td>${badgeEstado(c.id_estado)}</td>
			<td>${Number(c.total).toFixed(2)}</td>
			<td>
				<button class="btn btn-sm btn-info me-1"
					onclick="verDetalle(${c.id_cotizacion})">
					Ver
				</button>
				${
					c.id_estado === 7
					? `<button class="btn btn-sm btn-warning"
						onclick="editarCotizacion(${c.id_cotizacion})">
						Editar
						 </button>`
					: ''
				}
				${
					c.id_estado === 5
					? `
					<button class="btn btn-sm btn-danger me-1"
						onclick="generarPDFHistorial(${c.id_cotizacion})">
						PDF
					</button>
					<button class="btn btn-sm btn-success"
						onclick="aprobarCotizacion(${c.id_cotizacion})">
						Aprobar
					</button>
					`
					: ''
				}
				${
					c.id_estado === 8
					? `
					<button class="btn btn-sm btn-danger me-1"
						onclick="generarPDFHistorial(${c.id_cotizacion})">
						PDF
					</button>
					`
					: ''
				}
			</td>
		`;

		tbody.appendChild(tr);
	});

	if (tabla) {
		tabla.destroy();
	}

	tabla = new DataTable('#tablaCotizaciones', {
		responsive: true,
		order: [[0, 'desc']],
		language: {
			search: 'Buscar:',
			lengthMenu: 'Mostrar _MENU_ registros',
			info: 'Mostrando _START_ a _END_ de _TOTAL_',
			paginate: {
				first: 'Primero',
				last: 'Último',
				next: 'Siguiente',
				previous: 'Anterior'
			},
			zeroRecords: 'No se encontraron registros'
		}
	});
}

/* =========================
	 Estado (badge)
========================= */
function badgeEstado(id) {
	switch (id) {
		case 7:
			return `<span class="badge bg-warning text-dark">Parcial</span>`;
		case 6:
			return `<span class="badge bg-danger">Anulada</span>`;
		case 5:
			return `<span class="badge bg-success">Emitida</span>`;
		case 8:
			return `<span class="badge bg-primary">Aprobada</span>`;
		default:
			return `<span class="badge bg-secondary">Desconocido</span>`;
	}
}

/* =========================
	 Ver detalle (modal)
========================= */
window.verDetalle = async function (idCotizacion) {
	try {
		// Cabecera
		const { data: cab, error: errCab } = await supabase
			.from('cotizaciones')
			.select('*')
			.eq('id_cotizacion', idCotizacion)
			.single();

		if (errCab) throw errCab;

		document.getElementById('detalleCliente').innerText = cab.cliente;
		document.getElementById('detalleFecha').innerText = cab.fecha_cotizacion;
		document.getElementById('detalleSubtotal').innerText = Number(cab.subtotal).toFixed(2);
		document.getElementById('detalleIsv').innerText = Number(cab.isv).toFixed(2);
		document.getElementById('detalleTotal').innerText = Number(cab.total).toFixed(2);

		const tbody = document.getElementById('detalleLineas');
		tbody.innerHTML = '';

		// Intentar cargar como multi-camiones
		const { data: camiones = [] } = await supabase
			.from('cotizacion_camiones')
			.select('*')
			.eq('id_cotizacion', idCotizacion)
			.order('orden', { ascending: true });

		if (camiones && camiones.length > 0) {
			// Mostrar múltiples camiones
			for (const cam of camiones) {
				// Línea del camión
				let tr = document.createElement('tr');
				tr.innerHTML = `
					<td colspan="4" style="background-color:#f0f0f0; font-weight:bold; text-align:center">${cam.camion}</td>
				`;
				tbody.appendChild(tr);

				// Servicios del camión
				const { data: det = [] } = await supabase
					.from('cotizacion_detalle')
					.select('*')
					.eq('id_cotizacion_camion', cam.id);

				det.forEach(l => {
					if (l.id_servicio === null) return; // Saltar línea-camión
					tr = document.createElement('tr');
					tr.innerHTML = `
						<td class="text-end">${l.cantidad}</td>
						<td>&nbsp;&nbsp;&nbsp;${l.descripcion_servicio}</td>
						<td class="text-end">${Number(l.precio_unitario).toFixed(2)}</td>
						<td class="text-end">${Number(l.total_linea).toFixed(2)}</td>
					`;
					tbody.appendChild(tr);
				});
			}
		} else {
			// Fallback: cargar como formato antiguo (compatibilidad)
			const { data: det, error: errDet } = await supabase
				.from('cotizacion_detalle')
				.select('*')
				.eq('id_cotizacion', idCotizacion);

			if (errDet) throw errDet;

			det.forEach(l => {
				const tr = document.createElement('tr');
				tr.innerHTML = `
					<td class="text-end">${l.cantidad}</td>
					<td>${l.descripcion_servicio}</td>
					<td class="text-end">${Number(l.precio_unitario).toFixed(2)}</td>
					<td class="text-end">${Number(l.total_linea).toFixed(2)}</td>
				`;
				tbody.appendChild(tr);
			});
		}

		modalDetalle.show();
	} catch (err) {
		console.error(err);
		alert('Error cargando detalle de la cotización');
	}
};

/* =========================
	 Editar cotización
========================= */
window.editarCotizacion = function (idCotizacion) {
	// Redirección directa
	window.location.href = `cotizaciones.html?id=${idCotizacion}&modo=editar`;
};

window.aprobarCotizacion = async function (idCotizacion) {
	const confirmar = confirm('¿Desea aprobar esta cotización? Esta acción no se puede deshacer.');
	if (!confirmar) return;

	try {
		const { error } = await supabase
			.from('cotizaciones')
			.update({ id_estado: 8 })
			.eq('id_cotizacion', idCotizacion);

		if (error) throw error;

		alert('Cotización aprobada correctamente');
		await cargarCotizaciones(); // refresca tabla
	} catch (err) {
		console.error(err);
		alert('Error aprobando la cotización');
	}
};

/* =========================
	 Generar PDF
========================= */
window.generarPDFHistorial = async function (idCotizacion) {
	try {
		// ================= Cabecera =================
		const { data: cab, error: errCab } = await supabase
			.from('cotizaciones')
			.select('*,cliente:clientes(nombre,rtn)')
			.eq('id_cotizacion', idCotizacion)
			.single();

		if (errCab) throw errCab;

		// ================= Intentar cargar como multi-camiones =================
		const { data: camionesDB = [] } = await supabase
			.from('cotizacion_camiones')
			.select('*')
			.eq('id_cotizacion', idCotizacion)
			.order('orden', { ascending: true });

		let cot = {
			id_cotizacion: cab.id_cotizacion,
			fecha: cab.fecha_cotizacion,
			cliente: {
				nombre: cab.cliente.nombre,
				direccion: cab.direccion,
				rtn: cab.cliente.rtn
			},
			camiones: [],
			totales: {
				subtotal: Number(cab.subtotal || 0),
				isv: Number(cab.isv || 0),
				total: Number(cab.total || 0)
			}
		};

		if (camionesDB && camionesDB.length > 0) {
			// Cargar como multi-camiones
			for (const camBD of camionesDB) {
				const { data: det = [] } = await supabase
					.from('cotizacion_detalle')
					.select('*')
					.eq('id_cotizacion_camion', camBD.id)
					.not('id_servicio', 'is', null);

				const lineas = [
					{
						id_linea: `cam_${camBD.id}`,
						id: null,
						id_servicio: null,
						descripcion: camBD.camion || '',
						precio_unitario: 0,
						cantidad: 0,
						total_linea: 0,
						es_camion: true
					},
					...det.map(d => ({
						id_linea: `det_${d.id}`,
						id: d.id,
						id_servicio: d.id_servicio,
						descripcion: d.descripcion_servicio || '',
						precio_unitario: Number(d.precio_unitario || 0),
						cantidad: Number(d.cantidad || 0),
						total_linea: Number(d.total_linea || 0),
						es_camion: false
					}))
				];

				cot.camiones.push({
					id: camBD.id,
					id_camion: camBD.id_camion,
					camion: camBD.camion,
					orden: camBD.orden,
					lineas: lineas
				});
			}
		} else {
			// Fallback: cargar detalle antiguo (compatibilidad)
			const { data: det = [] } = await supabase
				.from('cotizacion_detalle')
				.select('*')
				.eq('id_cotizacion', idCotizacion);

			if (!det || det.length === 0) {
				throw new Error('La cotización no tiene líneas de detalle');
			}

			const lineas = [
				{
					id_linea: 'cam_legacy',
					id: null,
					id_servicio: null,
					descripcion: cab.camion || 'CAMIÓN NO DEFINIDO',
					precio_unitario: 0,
					cantidad: 0,
					total_linea: 0,
					es_camion: true
				},
				...det.map(d => ({
					id_linea: `det_${d.id}`,
					id: d.id,
					id_servicio: d.id_servicio,
					descripcion: d.descripcion_servicio || '',
					precio_unitario: Number(d.precio_unitario || 0),
					cantidad: Number(d.cantidad || 0),
					total_linea: Number(d.total_linea || 0),
					es_camion: false
				}))
			];

			cot.camiones.push({
				id: null,
				id_camion: cab.id_camion,
				camion: cab.camion,
				orden: 1,
				lineas: lineas
			});
		}

		await generarPDF(cot);

	} catch (err) {
		console.error(err);
		alert(err.message || 'Error generando el PDF');
	}
};

async function generarPDF(cot) {
	const { jsPDF } = window.jspdf;
	const doc = new jsPDF('p','mm','letter');
	const margenIzq = 14;
	const margenDer = 14;

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
	const logoHeightMm = 30; // 170px ≈ 45mm
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
			[`Cliente: ${cot.cliente.nombre} | RTN: ${cot.cliente.rtn}`],
			[`Dirección: ${cot.cliente.direccion}`],
			[`Fecha: ${cot.fecha}`]
		],
		columns: [{ dataKey: 'info' }]
	});

	yActual = doc.lastAutoTable.finalY + 5;

	// ---------------- Encabezado COTIZACIÓN ----------------
	doc.setFontSize(14);
	doc.setFont('helvetica','bold');
	doc.text('COTIZACIÓN #'+generarCodigo(cot.id_cotizacion), centerX, yActual, { align: 'center' });
	yActual += 7;

	// ---------------- Detalle de Cotización ----------------
	// Construir lista ordenada: camión, sus servicios, camión2, sus servicios...
	const lineasTotales = [];
	(cot.camiones || []).forEach(cam => {
		// línea camión
		lineasTotales.push({ es_camion: true, descripcion: cam.camion || '', cantidad: 0, precio_unitario: 0, total_linea: 0 });
		// luego sus servicios
		(cam.lineas || []).forEach(l => {
			if (!l.es_camion) lineasTotales.push(l);
		});
	});
	const lineasPorPagina = 12;

	for(let i=0; i<lineasTotales.length; i+=lineasPorPagina-1){
		const pageLineas = lineasTotales.slice(i, i + lineasPorPagina - 1);
		const body = [];

		pageLineas.forEach(l => {
			if (l.es_camion) {
				body.push([
					{ content: '', styles:{ fontStyle:'bold', halign:'center' } },
					{ content: l.descripcion || '', styles:{ fontStyle:'bold', halign:'center' } },
					{ content: '', styles:{ fontStyle:'bold', halign:'right' } },
					{ content: '', styles:{ fontStyle:'bold', halign:'right' } }
				]);
			} else {
				body.push([
					{ content: (l.cantidad || 0).toLocaleString() , styles:{ halign:'right' } },
					{ content: l.descripcion, styles:{ halign:'left' } },
					{ content: (l.precio_unitario||0).toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 }), styles:{ halign:'right' } },
					{ content: (l.total_linea||0).toLocaleString(undefined, { minimumFractionDigits:2, maximumFractionDigits:2 }), styles:{ halign:'right' } }
				]);
			}
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

			// Total en letras
			yActual = totalesY + 25;
			doc.setFont('helvetica','normal');
			doc.text(`Son: ${numeroALetras(cot.totales.total)} L 00/100`, centerX, yActual, { align:'center' });

			// Línea de firma
			yActual += 5;
			/*doc.line(margenIzq+50, yActual, doc.internal.pageSize.getWidth()-margenIzq-50, yActual);
			doc.text('Firma', centerX, yActual + 7, { align:'center' });*/
			
			const firma = new Image();
			firma.src = '../assets/img/Firma.png';
			await new Promise(resolve => firma.onload = resolve);

			// Conversión px → mm (170px)
			const firmaHeightMm = 34; // 161px ≈ 45mm
			const firmaWidthMm = (firma.width / firma.height) * firmaHeightMm;

			// Asegurar que nunca exceda los márgenes
			const maxWidthFirma = doc.internal.pageSize.getWidth() - margenIzq - margenDer;
			const finalFirmaWidth = Math.min(firmaWidthMm, maxWidthFirma);
			const finalFirmaHeight = (finalFirmaWidth / firmaWidthMm) * firmaHeightMm;

			// Centrado horizontal
			const firmaX = (doc.internal.pageSize.getWidth() - finalFirmaWidth) / 2;

			doc.addImage(
				firma,
				'PNG',
				firmaX,
				yActual,
				finalFirmaWidth,
				finalFirmaHeight
			);
		}

		if(i + (lineasPorPagina-1) < lineasTotales.length){
			doc.addPage();
			yActual = 20; // margen superior para nuevas páginas
		}
	}

	doc.save(`Cotizacion_${cot.id_cotizacion}.pdf`);
}

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

function generarCodigo(correlativo) {
  const prefijo = "CT-";
  const correlativoFormateado = correlativo.toString().padStart(6, "0");

  return `${prefijo}${correlativoFormateado}`;
}