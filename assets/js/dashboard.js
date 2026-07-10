import { supabase } from './supabase.js';
const ESTADOS = {
	EMITIDA: 5,
	ANULADA: 6,
	PARCIAL: 7,
	APROBADA: 8
};

document.addEventListener('DOMContentLoaded', () => {
	cargarKPIs();
	cargarTablas();
	cargarGrafico();
});

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

async function cargarKPIs() {
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

  data.forEach(c => {
    tbody.innerHTML += `
      <tr>
        <td>${c.id_cotizacion}</td>
        <td>${c.cliente ?? ''}</td>
        <td>${Number(c.total ?? 0).toFixed(2)}</td>
        <td>
          <button class="btn btn-sm btn-primary"
            onclick="verDetalle(${c.id_cotizacion})">Ver</button>

          ${tipo === 'emitida' ? `
            <button class="btn btn-sm btn-success"
              onclick="aprobarCotizacion(${c.id_cotizacion})">Aprobar</button>
          ` : ''}

          ${tipo === 'parcial' ? `
            <button class="btn btn-sm btn-warning"
              onclick="editarCotizacion(${c.id_cotizacion})">Editar</button>
          ` : ''}

          <button class="btn btn-sm btn-danger"
            onclick="anularCotizacion(${c.id_cotizacion})">Anular</button>
        </td>
      </tr>
    `;
  });
}

async function cargarGrafico() {
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('fecha_cotizacion');

  if (error) return console.error(error);

  const agrupado = {};

  data.forEach(c => {
    if (!c.fecha_cotizacion) return;

    const mes = c.fecha_cotizacion.substring(0, 7);
    agrupado[mes] = (agrupado[mes] || 0) + 1;
  });

  const labels = Object.keys(agrupado).sort();
  const values = labels.map(l => agrupado[l]);

  new Chart(document.getElementById('chartCotizaciones'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Cotizaciones por mes',
        data: values
      }]
    }
  });
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
                        <td style="text-align:center; font-weight:bold">${l.descripcion_servicio}</td>
                        <td></td>
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

window.anularCotizacion = async function (idCotizacion) {
    const confirmar = confirm('¿Desea anular esta cotización? Esta acción no se puede deshacer.');
    if (!confirmar) return;

    try {
        const { error } = await supabase
            .from('cotizaciones')
            .update({ id_estado: 6 })
            .eq('id_cotizacion', idCotizacion);

        if (error) throw error;

        alert('Cotización anulada correctamente');
        await cargarCotizaciones(); // refresca tabla
    } catch (err) {
        console.error(err);
        alert('Error aprobando la cotización');
    }
};

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