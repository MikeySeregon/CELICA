import { supabase } from './supabase.js';
const ESTADOS = {
	EMITIDA: 5,
	ANULADA: 6,
	PARCIAL: 7,
	APROBADA: 8
};

const fmtMoneda = new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL' });

let modalDetalle;

/* =========================
	 Inicialización
========================= */
document.addEventListener('DOMContentLoaded', async () => {
	modalDetalle = new bootstrap.Modal(
		document.getElementById('modalDetalleCotizacion')
	);

	cargarKPIs();
	cargarDatosDashboard();
	cargarActividadReciente();
	await cargarCotizaciones(); // ya carga las tablas de emitidas/parciales internamente
});

async function cargarKPIs() {
  const idsKpi = ['kpiEmitidas', 'kpiAprobadas', 'kpiParciales', 'kpiAnuladas'];
  idsKpi.forEach(id => {
    document.getElementById(id).innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  });

  const [emitidas, aprobadas, parciales, anuladas] = await Promise.all([
    getCount(ESTADOS.EMITIDA),
    getCount(ESTADOS.APROBADA),
    getCount(ESTADOS.PARCIAL),
    getCount(ESTADOS.ANULADA)
  ]);

  document.getElementById('kpiEmitidas').innerText = emitidas;
  document.getElementById('kpiAprobadas').innerText = aprobadas;
  document.getElementById('kpiParciales').innerText = parciales;
  document.getElementById('kpiAnuladas').innerText = anuladas;
}

async function cargarEmitidas() {
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('id_cotizacion, cliente, total')
    .eq('id_estado', ESTADOS.EMITIDA)
    .order('fecha_cotizacion', { ascending: false })
    .limit(5);

  if (error) return console.error(error);

  renderTabla(data, 'tablaEmitidas', 'emitida');
}

async function cargarParciales() {
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('id_cotizacion, cliente, total')
    .eq('id_estado', ESTADOS.PARCIAL)
    .order('fecha_cotizacion', { ascending: false })
    .limit(5);

  if (error) return console.error(error);

  renderTabla(data, 'tablaParciales', 'parcial');
}

async function cargarTablas() {
  await Promise.all([
    cargarEmitidas(),
    cargarParciales()
  ]);
}

async function getCount(estado) {
  const { count, error } = await supabase
    .from('cotizaciones')
    .select('*', { count: 'exact', head: true })
    .eq('id_estado', estado);

  if (error) console.error(error);
  return count || 0;
}

function renderTabla(data, tbodyId, tipo) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';

  if (!data || data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4">
          <div class="empty-state">
            <i class="bi bi-inbox"></i>
            No hay cotizaciones para mostrar
          </div>
        </td>
      </tr>
    `;
    return;
  }

  data.forEach(c => {
    const btnAprobar = tipo === 'emitida'
      ? { icon: 'bi-check-lg', label: 'Aprobar', clase: 'success', accion: `aprobarCotizacion(${c.id_cotizacion}, this)` }
      : null;
    const btnEditar = tipo === 'parcial'
      ? { icon: 'bi-pencil', label: 'Editar', clase: 'warning', accion: `editarCotizacion(${c.id_cotizacion})` }
      : null;

    const itemsExtra = [btnAprobar, btnEditar].filter(Boolean);

    tbody.innerHTML += `
      <tr>
        <td>${c.id_cotizacion}</td>
        <td>${c.cliente ?? ''}</td>
        <td>${fmtMoneda.format(Number(c.total ?? 0))}</td>
        <td>
          <!-- Escritorio: botones completos -->
          <div class="acciones-desktop">
            <button class="btn btn-sm btn-primary" onclick="verDetalle(${c.id_cotizacion})">
              <i class="bi bi-eye"></i> Ver
            </button>
            ${itemsExtra.map(b => `
              <button class="btn btn-sm btn-${b.clase}" onclick="${b.accion}">
                <i class="bi ${b.icon}"></i> ${b.label}
              </button>
            `).join('')}
            <button class="btn btn-sm btn-danger" onclick="anularCotizacion(${c.id_cotizacion}, this)">
              <i class="bi bi-x-lg"></i> Anular
            </button>
          </div>

          <!-- Móvil: menú desplegable compacto -->
          <div class="acciones-mobile dropdown">
            <button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-three-dots-vertical"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><a class="dropdown-item" href="#" onclick="verDetalle(${c.id_cotizacion}); return false;"><i class="bi bi-eye"></i> Ver</a></li>
              ${itemsExtra.map(b => `
                <li><a class="dropdown-item" href="#" onclick="${b.accion}; return false;"><i class="bi ${b.icon}"></i> ${b.label}</a></li>
              `).join('')}
              <li><a class="dropdown-item text-danger" href="#" onclick="anularCotizacion(${c.id_cotizacion}, this); return false;"><i class="bi bi-x-lg"></i> Anular</a></li>
            </ul>
          </div>
        </td>
      </tr>
    `;
  });
}

let chartCotizaciones;
let modoGrafico = 'cantidad'; // 'cantidad' | 'ingresos'
let cacheCotizaciones = [];

async function cargarDatosDashboard() {
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('id_estado, fecha_cotizacion, total');

  if (error) return console.error(error);

  cacheCotizaciones = data || [];
  renderGrafico();
  aplicarComparativoKPIs(cacheCotizaciones);
}

function calcularSeriesMensuales(datos) {
  const cantidadPorMes = {};
  const ingresoPorMes = {};

  datos.forEach(c => {
    if (!c.fecha_cotizacion) return;
    const mes = c.fecha_cotizacion.substring(0, 7);
    cantidadPorMes[mes] = (cantidadPorMes[mes] || 0) + 1;
    if (!(mes in ingresoPorMes)) ingresoPorMes[mes] = 0;
    if (c.id_estado === ESTADOS.APROBADA) {
      ingresoPorMes[mes] += Number(c.total || 0);
    }
  });

  const labels = Object.keys(cantidadPorMes).sort();
  return {
    labels,
    cantidad: labels.map(m => cantidadPorMes[m] || 0),
    ingresos: labels.map(m => ingresoPorMes[m] || 0)
  };
}

function renderGrafico() {
  const serie = calcularSeriesMensuales(cacheCotizaciones);
  const esIngresos = modoGrafico === 'ingresos';

  const datosGrafico = {
    labels: serie.labels,
    datasets: [{
      label: esIngresos ? 'Ingresos (aprobadas)' : 'Cotizaciones por mes',
      data: esIngresos ? serie.ingresos : serie.cantidad,
      backgroundColor: esIngresos ? '#1B8A5A' : '#2C5F8A',
      borderRadius: 6,
      maxBarThickness: 48
    }]
  };

  const opcionesGrafico = {
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => esIngresos ? fmtMoneda.format(ctx.parsed.y) : `${ctx.parsed.y} cotización(es)`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: esIngresos
          ? { callback: v => fmtMoneda.format(v) }
          : { precision: 0 }
      }
    }
  };

  if (chartCotizaciones) {
    chartCotizaciones.data = datosGrafico;
    chartCotizaciones.options = opcionesGrafico;
    chartCotizaciones.update();
  } else {
    chartCotizaciones = new Chart(document.getElementById('chartCotizaciones'), {
      type: 'bar',
      data: datosGrafico,
      options: opcionesGrafico
    });
  }
}

function cambiarModoGrafico(modo) {
  modoGrafico = modo;
  document.getElementById('btnModoCantidad').classList.toggle('active', modo === 'cantidad');
  document.getElementById('btnModoIngresos').classList.toggle('active', modo === 'ingresos');
  document.getElementById('chartTitulo').textContent = modo === 'ingresos'
    ? 'Ingresos mensuales (solo aprobadas)'
    : 'Cotizaciones por mes';
  renderGrafico();
}

document.getElementById('btnModoCantidad').addEventListener('click', () => cambiarModoGrafico('cantidad'));
document.getElementById('btnModoIngresos').addEventListener('click', () => cambiarModoGrafico('ingresos'));

/* =========================
   Comparativo de KPIs (mes actual vs. mes anterior)
========================= */
function aplicarComparativoKPIs(datos) {
  const hoy = new Date();
  const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const inicioMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);

  const fInicioActual = inicioMesActual.toISOString().slice(0, 10);
  const fInicioAnterior = inicioMesAnterior.toISOString().slice(0, 10);

  const contadorActual = {};
  const contadorAnterior = {};

  datos.forEach(c => {
    if (!c.fecha_cotizacion) return;
    if (c.fecha_cotizacion >= fInicioActual) {
      contadorActual[c.id_estado] = (contadorActual[c.id_estado] || 0) + 1;
    } else if (c.fecha_cotizacion >= fInicioAnterior) {
      contadorAnterior[c.id_estado] = (contadorAnterior[c.id_estado] || 0) + 1;
    }
  });

  // masEsBueno: true = subir es positivo (verde), false = subir es negativo (rojo), null = neutral siempre
  mostrarComparativo('kpiEmitidas', contadorActual[ESTADOS.EMITIDA] || 0, contadorAnterior[ESTADOS.EMITIDA] || 0, true);
  mostrarComparativo('kpiAprobadas', contadorActual[ESTADOS.APROBADA] || 0, contadorAnterior[ESTADOS.APROBADA] || 0, true);
  mostrarComparativo('kpiParciales', contadorActual[ESTADOS.PARCIAL] || 0, contadorAnterior[ESTADOS.PARCIAL] || 0, null);
  mostrarComparativo('kpiAnuladas', contadorActual[ESTADOS.ANULADA] || 0, contadorAnterior[ESTADOS.ANULADA] || 0, false);
}

function mostrarComparativo(kpiId, actual, anterior, masEsBueno) {
  const cont = document.getElementById(kpiId + 'Delta');
  if (!cont) return;

  if (actual === 0 && anterior === 0) {
    cont.className = 'kpi-delta kpi-delta-neutral';
    cont.innerHTML = 'Sin movimiento este mes';
    return;
  }

  let texto, direccion;
  if (anterior === 0) {
    direccion = 1;
    texto = `${actual} nueva${actual === 1 ? '' : 's'} este mes`;
  } else {
    const delta = Math.round(((actual - anterior) / anterior) * 100);
    direccion = Math.sign(delta);
    texto = delta === 0 ? 'Igual que el mes anterior' : `${Math.abs(delta)}% vs. mes anterior`;
  }

  let clase = 'kpi-delta-neutral';
  let icono = 'bi-dash';
  if (direccion > 0) {
    icono = 'bi-arrow-up-short';
    clase = masEsBueno === null ? 'kpi-delta-neutral' : (masEsBueno ? 'kpi-delta-up' : 'kpi-delta-down');
  } else if (direccion < 0) {
    icono = 'bi-arrow-down-short';
    clase = masEsBueno === null ? 'kpi-delta-neutral' : (masEsBueno ? 'kpi-delta-down' : 'kpi-delta-up');
  }

  cont.className = `kpi-delta ${clase}`;
  cont.innerHTML = `<i class="bi ${icono}"></i> ${texto}`;
}

/* =========================
   Actividad reciente
========================= */
function tiempoRelativo(fechaISO) {
  if (!fechaISO) return '';
  const segundos = Math.floor((new Date() - new Date(fechaISO)) / 1000);

  if (segundos < 60) return 'hace un momento';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `hace ${dias} día${dias === 1 ? '' : 's'}`;
  const meses = Math.floor(dias / 30);
  return `hace ${meses} mes${meses === 1 ? '' : 'es'}`;
}

async function cargarActividadReciente() {
  const feed = document.getElementById('feedActividad');
  if (!feed) return;

  const { data, error } = await supabase
    .from('cotizaciones')
    .select('id_cotizacion, cliente, id_estado, fecha_actualizacion')
    .order('fecha_actualizacion', { ascending: false })
    .limit(8);

  if (error) {
    console.error(error);
    feed.innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-triangle"></i>No se pudo cargar la actividad</div>`;
    return;
  }

  if (!data || data.length === 0) {
    feed.innerHTML = `<div class="empty-state"><i class="bi bi-clock-history"></i>Sin actividad reciente</div>`;
    return;
  }

  const infoEstado = {
    [ESTADOS.EMITIDA]:  { texto: 'emitida',  icono: 'bi-send-check',      clase: 'primary' },
    [ESTADOS.APROBADA]: { texto: 'aprobada', icono: 'bi-check-circle',    clase: 'success' },
    [ESTADOS.PARCIAL]:  { texto: 'parcial',  icono: 'bi-hourglass-split', clase: 'warning' },
    [ESTADOS.ANULADA]:  { texto: 'anulada',  icono: 'bi-x-circle',        clase: 'danger' }
  };

  feed.innerHTML = data.map(c => {
    const info = infoEstado[c.id_estado] || { texto: 'actualizada', icono: 'bi-arrow-repeat', clase: 'secondary' };
    return `
      <div class="activity-item">
        <div class="activity-icon activity-${info.clase}"><i class="bi ${info.icono}"></i></div>
        <div class="activity-content">
          <div>Cotización <strong>#${c.id_cotizacion}</strong>${c.cliente ? ` de ${c.cliente}` : ''} — ${info.texto}</div>
          <div class="activity-time">${tiempoRelativo(c.fecha_actualizacion)}</div>
        </div>
      </div>
    `;
  }).join('');
}

/* =========================
   Refresco conjunto tras una acción (aprobar/anular)
========================= */
async function refrescarDashboard() {
  await Promise.all([
    cargarKPIs(),
    cargarDatosDashboard(),
    cargarCotizaciones(),
    cargarActividadReciente()
  ]);
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
        document.getElementById('detalleSubtotal').innerText = fmtMoneda.format(Number(cab.subtotal));
        document.getElementById('detalleIsv').innerText = fmtMoneda.format(Number(cab.isv));
        document.getElementById('detalleTotal').innerText = fmtMoneda.format(Number(cab.total));

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
                    <td colspan="5" style="background-color:#f0f0f0; font-weight:bold; text-align:center">${cam.camion}</td>
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
                        <td class="text-center">${l.codigo ?? ''}</td>
                        <td class="text-end">${l.cantidad}</td>
                        <td>&nbsp;&nbsp;&nbsp;${l.descripcion_servicio}</td>
                        <td class="text-end">${fmtMoneda.format(Number(l.precio_unitario))}</td>
                        <td class="text-end">${fmtMoneda.format(Number(l.total_linea))}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            // Cargar líneas especiales (sin camión asociado)
            const { data: especialesBD = [] } = await supabase
                .from('cotizacion_detalle')
                .select('*')
                .eq('id_cotizacion', idCotizacion)
                .is('id_cotizacion_camion', null)
                .in('id_servicio', [100, 101]);

            if (especialesBD && especialesBD.length > 0) {
                especialesBD.forEach(l => {
                    let tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td></td>
                        <td></td>
                        <td style="text-align:center; font-weight:bold">${l.descripcion_servicio}</td>
                        <td></td>
                        <td class="text-end">${fmtMoneda.format(Number(l.total_linea))}</td>
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
                    <td class="text-center">${l.codigo ?? ''}</td>
                    <td class="text-end">${l.cantidad}</td>
                    <td>${l.descripcion_servicio}</td>
                    <td class="text-end">${fmtMoneda.format(Number(l.precio_unitario))}</td>
                    <td class="text-end">${fmtMoneda.format(Number(l.total_linea))}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        modalDetalle.show();
    } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo cargar el detalle de la cotización.' });
    }
};

/* =========================
     Editar cotización
========================= */
window.editarCotizacion = function (idCotizacion) {
    // Redirección directa
    window.location.href = `cotizaciones.html?id=${idCotizacion}&modo=editar`;
};

window.aprobarCotizacion = async function (idCotizacion, btnEl) {
    const confirmar = await Swal.fire({
        title: '¿Aprobar cotización?',
        text: 'Esta acción no se puede deshacer.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, aprobar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#198754'
    });
    if (!confirmar.isConfirmed) return;

    if (btnEl) btnEl.disabled = true;

    try {
        const { error } = await supabase
            .from('cotizaciones')
            .update({ id_estado: 8 })
            .eq('id_cotizacion', idCotizacion);

        if (error) throw error;

        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Cotización aprobada', showConfirmButton: false, timer: 2500 });
        await refrescarDashboard(); // refresca KPIs, gráfico, tablas y actividad
    } catch (err) {
        console.error(err);
        if (btnEl) btnEl.disabled = false;
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo aprobar la cotización.' });
    }
};

window.anularCotizacion = async function (idCotizacion, btnEl) {
    const confirmar = await Swal.fire({
        title: '¿Anular cotización?',
        text: 'Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, anular',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc3545'
    });
    if (!confirmar.isConfirmed) return;

    if (btnEl) btnEl.disabled = true;

    try {
        const { error } = await supabase
            .from('cotizaciones')
            .update({ id_estado: 6 })
            .eq('id_cotizacion', idCotizacion);

        if (error) throw error;

        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Cotización anulada', showConfirmButton: false, timer: 2500 });
        await refrescarDashboard(); // refresca KPIs, gráfico, tablas y actividad
    } catch (err) {
        console.error(err);
        if (btnEl) btnEl.disabled = false;
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo anular la cotización.' });
    }
};

/* =========================
   Cargar listado principal
========================= */
async function cargarCotizaciones() {
  await cargarTablas();
}

/* =========================
   Catálogo de precios (xlsx)
========================= */

// Excel no permite nombres de hoja > 31 caracteres, duplicados, ni : \ / ? * [ ]
function nombreHojaValido(nombre, usados) {
  let limpio = (nombre || 'Camion').replace(/[:\\\/\?\*\[\]]/g, '-').trim().slice(0, 31);
  if (!limpio) limpio = 'Camion';

  let candidato = limpio;
  let contador = 2;
  while (usados.has(candidato)) {
    const sufijo = ` (${contador})`;
    candidato = limpio.slice(0, 31 - sufijo.length) + sufijo;
    contador++;
  }
  usados.add(candidato);
  return candidato;
}

const btnDescargarCatalogo = document.getElementById('btnDescargarCatalogo');
if (btnDescargarCatalogo) {
  btnDescargarCatalogo.addEventListener('click', async () => {
    btnDescargarCatalogo.disabled = true;
    btnDescargarCatalogo.textContent = 'Generando...';

    try {
      const [{ data: camiones, error: errCam }, { data: servicios, error: errServ }, { data: precios, error: errPre }] = await Promise.all([
        supabase.from('camiones').select('*').eq('estado', 1).order('id_camion', { ascending: true }),
        supabase.from('servicios').select('*, categorias(nombre)').eq('estado', 1).order('id_servicio', { ascending: true }),
        supabase.from('precios_servicio').select('*').eq('estado', 1)
      ]);

      if (errCam) throw errCam;
      if (errServ) throw errServ;
      if (errPre) throw errPre;

      // Mapa rápido: "id_camion_id_servicio" -> precio vigente
      const mapaPrecios = {};
      (precios || []).forEach(p => { mapaPrecios[`${p.id_camion}_${p.id_servicio}`] = p; });

      const wb = XLSX.utils.book_new();
      const nombresUsados = new Set();

      (camiones || []).forEach(cam => {
        const filas = (servicios || []).map(s => {
          const precio = mapaPrecios[`${cam.id_camion}_${s.id_servicio}`];
          return {
            'Servicio': s.servicio,
            'Categoría': s.categorias?.nombre || '',
            'Código': precio?.codigo || '-',
            'Precio': precio ? Number(precio.precio) : '-'
          };
        });

        const ws = XLSX.utils.json_to_sheet(filas);
        ws['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 14 }, { wch: 12 }];

        const nombreHoja = nombreHojaValido(cam.camion, nombresUsados);
        XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
      });

      if ((camiones || []).length === 0) {
        Swal.fire({ icon: 'info', title: 'Sin camiones activos', text: 'No hay camiones activos para generar el catálogo.' });
        return;
      }

      const fecha = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `catalogo_precios_${fecha}.xlsx`);
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo generar el catálogo: ' + err.message });
    } finally {
      btnDescargarCatalogo.disabled = false;
      btnDescargarCatalogo.textContent = 'Descargar catálogo de precios';
    }
  });
}