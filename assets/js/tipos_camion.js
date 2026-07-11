import { supabase } from './supabase.js'

// Elementos del DOM
const form = document.getElementById('formTipoCamion');
const tablaBody = document.querySelector('#tablaTiposCamion tbody');
const btnCancelar = document.getElementById('btnCancelar');
const formTitulo = document.getElementById('formTitulo');

let cacheTipos = [];
let filtroEstado = '';

// Listar tipos de camión
async function listarTiposCamion() {
	const { data, error } = await supabase
		.from('tipos_camion')
		.select('*')
		.order('id_tipo', { ascending: true });

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudieron cargar los tipos de camión.' });
		return;
	}

	cacheTipos = data || [];
	aplicarFiltro();
}

function aplicarFiltro() {
	const filtrados = filtroEstado
		? cacheTipos.filter(t => String(t.estado) === String(filtroEstado))
		: cacheTipos;
	renderTabla(filtrados);
}

function renderTabla(data) {
	tablaBody.innerHTML = '';

	if (data.length === 0) {
		tablaBody.innerHTML = `
			<tr>
				<td colspan="5">
					<div class="empty-state">
						<i class="bi bi-truck-flatbed"></i>
						No hay tipos de camión que coincidan con el filtro
					</div>
				</td>
			</tr>
		`;
		return;
	}

	data.forEach(tipo => {
		const badgeEstado = tipo.estado === 1
			? '<span class="badge text-bg-success">Activo</span>'
			: '<span class="badge text-bg-secondary">Inactivo</span>';

		let acciones = `
			<button class="btn btn-sm btn-warning btn-edit" 
					data-id="${tipo.id_tipo}" 
					data-tipo="${tipo.tipo}" 
					data-descripcion="${tipo.descripcion || ''}">
				<i class="bi bi-pencil"></i> Editar
			</button>
		`;

		if (tipo.estado !== 1) {
			acciones += ` <button class="btn btn-sm btn-success btn-activar" data-id="${tipo.id_tipo}"><i class="bi bi-check-circle"></i> Activar</button>`;
		} else {
			acciones += ` <button class="btn btn-sm btn-danger btn-desactivar" data-id="${tipo.id_tipo}"><i class="bi bi-x-circle"></i> Desactivar</button>`;
		}

		tablaBody.innerHTML += `
			<tr>
				<td>${tipo.id_tipo}</td>
				<td>${tipo.tipo}</td>
				<td>${tipo.descripcion || ''}</td>
				<td>${badgeEstado}</td>
				<td>${acciones}</td>
			</tr>
		`;
	});

	document.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', editarTipoCamion));
	document.querySelectorAll('.btn-activar').forEach(btn => btn.addEventListener('click', activarTipoCamion));
	document.querySelectorAll('.btn-desactivar').forEach(btn => btn.addEventListener('click', desactivarTipoCamion));
}

// Wiring del filtro
document.querySelectorAll('.filtro-estado').forEach(btn => {
	btn.addEventListener('click', () => {
		filtroEstado = btn.dataset.estado;
		document.querySelectorAll('.filtro-estado').forEach(b => b.classList.remove('active'));
		btn.classList.add('active');
		aplicarFiltro();
	});
});

// Crear o actualizar
form.addEventListener('submit', async (e) => {
	e.preventDefault();
	const id = document.getElementById('id_tipo').value;
	const tipo = document.getElementById('tipo').value.trim();
	const descripcion = document.getElementById('descripcion').value.trim();

	if (!tipo) {
		Swal.fire({ icon: 'warning', title: 'Campo requerido', text: 'Debe ingresar un tipo de camión.' });
		return;
	}

	// Aviso no bloqueante de posible duplicado
	const posibleDuplicado = cacheTipos.find(t =>
		t.tipo.trim().toLowerCase() === tipo.toLowerCase() &&
		t.estado === 1 &&
		String(t.id_tipo) !== String(id)
	);
	if (posibleDuplicado) {
		const confirmar = await Swal.fire({
			icon: 'warning',
			title: 'Tipo similar encontrado',
			text: `Ya existe un tipo activo llamado "${posibleDuplicado.tipo}". ¿Deseas guardar de todas formas?`,
			showCancelButton: true,
			confirmButtonText: 'Guardar de todas formas',
			cancelButtonText: 'Cancelar'
		});
		if (!confirmar.isConfirmed) return;
	}

	let error;
	if (id) {
		({ error } = await supabase
			.from('tipos_camion')
			.update({ tipo, descripcion })
			.eq('id_tipo', id));
	} else {
		({ error } = await supabase
			.from('tipos_camion')
			.insert({ tipo, descripcion, estado: 1 }));
	}

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar: ' + error.message });
		return;
	}

	Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: id ? 'Tipo actualizado' : 'Tipo agregado', showConfirmButton: false, timer: 2200 });

	resetFormulario();
	listarTiposCamion();
});

// Editar
function editarTipoCamion(e) {
	const btn = e.currentTarget;
	document.getElementById('id_tipo').value = btn.dataset.id;
	document.getElementById('tipo').value = btn.dataset.tipo;
	document.getElementById('descripcion').value = btn.dataset.descripcion;
	formTitulo.textContent = 'Editar tipo de camión';
	form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Activar
async function activarTipoCamion(e) {
	const id = e.currentTarget.dataset.id;
	const { error } = await supabase
		.from('tipos_camion')
		.update({ estado: 1 })
		.eq('id_tipo', id);

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo activar el tipo de camión.' });
		return;
	}

	Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Tipo activado', showConfirmButton: false, timer: 2200 });
	listarTiposCamion();
}

// Desactivar (con confirmación, ya que afecta camiones y precios asociados)
async function desactivarTipoCamion(e) {
	const id = e.currentTarget.dataset.id;

	const confirmar = await Swal.fire({
		title: '¿Desactivar tipo de camión?',
		text: 'Los camiones de este tipo seguirán existiendo, pero este tipo ya no aparecerá disponible para nuevos camiones.',
		icon: 'warning',
		showCancelButton: true,
		confirmButtonText: 'Sí, desactivar',
		cancelButtonText: 'Cancelar',
		confirmButtonColor: '#dc3545'
	});
	if (!confirmar.isConfirmed) return;

	const { error } = await supabase
		.from('tipos_camion')
		.update({ estado: 2 })
		.eq('id_tipo', id);

	if (error) {
		console.error(error);
		Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo desactivar el tipo de camión.' });
		return;
	}

	Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Tipo desactivado', showConfirmButton: false, timer: 2200 });
	listarTiposCamion();
}

// Cancelar / limpiar formulario
function resetFormulario() {
	form.reset();
	document.getElementById('id_tipo').value = '';
	formTitulo.textContent = 'Agregar tipo de camión';
}
btnCancelar.addEventListener('click', resetFormulario);

// Inicializar
listarTiposCamion();
