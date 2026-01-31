import { supabase } from './supabase.js';

// Elementos del DOM
const form = document.getElementById('formDireccion');
const tablaBody = document.querySelector('#tablaDirecciones tbody');
const btnCancelar = document.getElementById('btnCancelar');
let tablaDireccionesDT = null;


// --- Funciones --- //

// 1. Listar direcciones
async function listarDirecciones() {
    const { data, error } = await supabase
        .from('direcciones')
        .select('*');

    if (error) return console.error(error);

    // Destruir DataTable si existe
    if (tablaDireccionesDT) {
        tablaDireccionesDT.destroy();
    }

    tablaBody.innerHTML = '';

        data.forEach(c => {
        tablaBody.innerHTML += `
            <tr>
                <td>${c.id}</td>
                <td>${c.direccion}</td>
                <td>${c.estado === 1 ? 'Activo' : 'Inactivo'}</td>
                <td>
                    <button class="btn btn-sm btn-warning btnEditar" data-id="${c.id}">
                        Editar
                    </button>
                    <button 
                        class="btn btn-sm btn-${c.estado === 1 ? 'danger' : 'success'} btnToggleEstado"
                        data-id="${c.id}"
                        data-estado="${c.estado}">
                        ${c.estado === 1 ? 'Desactivar' : 'Activar'}
                    </button>
                </td>
            </tr>
        `;
    });

    tablaDireccionesDT = $('#tablaDirecciones').DataTable({
        responsive: {
            details: {
                type: 'column'
            }
        },
        columnDefs: [
            { responsivePriority: 1, targets: 0 }, // DNI
            { responsivePriority: 2, targets: 1 }, // Dirección
            { responsivePriority: 3, targets: 3 } // Acciones
            /*{ targets: 6, visible: false } // Dirección oculta en desktop*/
        ],
        language: {
            search: "Buscar:",
            lengthMenu: "Mostrar _MENU_ registros",
            info: "Mostrando _START_ a _END_ de _TOTAL_ clientes",
            paginate: {
                next: "Siguiente",
                previous: "Anterior"
            },
            zeroRecords: "No se encontraron clientes"
        }
    });

    // Eventos
    document.querySelectorAll('.btnEditar').forEach(btn => {
        btn.addEventListener('click', () => cargarDirecciones(btn.dataset.id));
    });

    document.querySelectorAll('.btnToggleEstado').forEach(btn => {
        btn.addEventListener('click', () => toggleEstado(btn.dataset.id, btn.dataset.estado));
    });
}

// 2. Guardar o actualizar cliente
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('id_direccion').value;
    const direccion = document.getElementById('direccion').value;

    const payload = {
        direccion
    };

    if (form.dataset.editando === "true") {
        // ACTUALIZAR
        const { error } = await supabase
            .from('direcciones')
            .update(payload)
            .eq('id', id);

        if (error) return console.error(error);

    } else {
        // INSERTAR
        const { error } = await supabase
            .from('direcciones')
            .insert([{
                ...payload,
                estado: 1
            }]);

        if (error) return console.error(error);
    }

    form.reset();
    form.dataset.editando = "false";
    document.getElementById('id_direccion').readOnly = false;
    listarDirecciones();
});

// 3. Cargar cliente para edición
async function cargarDirecciones(id) {
    const { data, error } = await supabase
        .from('direcciones')
        .select('*')
        .eq('id', id)
        .single();

    if (error) return console.error(error);

    form.dataset.editando = "true";

    document.getElementById('id_direccion').value = data.id;
    document.getElementById('id_direccion').readOnly = true;
    document.getElementById('direccion').value = data.direccion;
}

// 4. Activar / Desactivar cliente
async function toggleEstado(id, estadoActual) {
    const nuevoEstado = estadoActual == 1 ? 2 : 1;

    const { error } = await supabase
        .from('direcciones')
        .update({ estado: nuevoEstado })
        .eq('id', id);

    if (error) return console.error(error);

    listarDirecciones();
}

// Cancelar edición
btnCancelar.addEventListener('click', () => {
    form.reset();
    form.dataset.editando = "false";
    document.getElementById('id').readOnly = false;
});

// Inicialización
listarDirecciones();
