import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://filydfpcxictckxwqyyk.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpbHlkZnBjeGljdGNreHdxeXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2NTIwMjgsImV4cCI6MjA4MzIyODAyOH0.ybW8gwNh1ngRZDlikebUxFh4mPHraIWVBKMTfCzS8No'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

class MiHeader extends HTMLElement {
	connectedCallback() {
		this.innerHTML = `
		<nav class="navbar navbar-expand-lg navbar-dark bg-dark">
			<div class="container-fluid">
				<a class="navbar-brand" href="#">CELICA</a>
				<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNavDropdown" aria-controls="navbarNavDropdown" aria-expanded="false" aria-label="Toggle navigation">
					<span class="navbar-toggler-icon"></span>
				</button>
				<div class="collapse navbar-collapse" id="navbarNavDropdown">
					<ul class="navbar-nav me-auto">
						<li class="nav-item">
							<a class="nav-link" href="dashboard.html">Inicio</a>
						</li>
						<li class="nav-item dropdown">
							<a class="nav-link dropdown-toggle" href="#" id="cotizacionesDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
								Cotizaciones
							</a>
							<ul class="dropdown-menu" aria-labelledby="cotizacionesDropdown">
								<li><a class="dropdown-item" href="cotizaciones.html">Nueva Cotización</a></li>
								<li><a class="dropdown-item" href="cotizaciones_historial.html">Historial de Cotizaciones</a></li>
							</ul>
						</li>
						<li class="nav-item dropdown">
							<a class="nav-link dropdown-toggle" href="#" id="camionesDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
								Camiones
							</a>
							<ul class="dropdown-menu" aria-labelledby="camionesDropdown">
								<li><a class="dropdown-item" href="camiones.html">Listado de Camiones</a></li>
								<li><a class="dropdown-item" href="tipos_camion.html">Tipos de Camión</a></li>
							</ul>
						</li>
						<li class="nav-item dropdown">
							<a class="nav-link dropdown-toggle" href="#" id="serviciosDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
								Servicios
							</a>
							<ul class="dropdown-menu" aria-labelledby="serviciosDropdown">
								<li><a class="dropdown-item" href="servicios.html">Listado de Servicios</a></li>
								<li><a class="dropdown-item" href="precio_servicio.html">Precios por Servicio</a></li>
							</ul>
						</li>
						<li class="nav-item">
							<a class="nav-link" href="clientes.html">Clientes</a>
						</li>
					</ul>
					<button id="btn-logout" class="btn btn-outline-light btn-sm">
						Salir
					</button>
				</div>
			</div>
		</nav>`;
	}
}

class MiFooter extends HTMLElement
{
	connectedCallback(){
		this.innerHTML = ``;
	}
}

customElements.define('mi-header', MiHeader);
customElements.define('mi-footer', MiFooter);