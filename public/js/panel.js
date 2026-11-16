// Comportamiento común de las interfaces con sesión:
// menú según el rol, datos del usuario, cierre de sesión y utilidades compartidas.
(function () {
  const MENUS = {
    Administrador: [
      { id: 'dashboard', texto: 'Dashboard', url: '/admin' },
      { id: 'revision', texto: 'Revisión', url: '#' },
      { id: 'plantillas', texto: 'Plantillas', url: '/admin/plantillas' },
      { id: 'clientes', texto: 'Clientes', url: '/admin/clientes' },
      { id: 'documentos', texto: 'Documentos', url: '#' },
      { id: 'usuarios', texto: 'Usuarios', url: '#' },
    ],
    Equipo: [
      { id: 'tareas', texto: 'Mis tareas', url: '/equipo' },
      { id: 'nuevo', texto: 'Nuevo documento', url: '/equipo/nuevo' },
      { id: 'repositorio', texto: 'Repositorio', url: '#' },
      { id: 'perfil', texto: 'Mi perfil', url: '#' },
    ],
  };

  // ---------- Utilidades compartidas por las páginas ----------
  async function api(url, opciones = {}) {
    const esFormulario = opciones.body instanceof FormData;
    const respuesta = await fetch(url, {
      ...opciones,
      headers: esFormulario ? opciones.headers : { 'Content-Type': 'application/json', ...(opciones.headers || {}) },
    });
    if (respuesta.status === 401) {
      window.location.assign('/');
      throw new Error('Tu sesión expiró. Ingresa nuevamente.');
    }
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw new Error(datos.error || 'Ocurrió un error inesperado.');
    return datos;
  }

  function elemento(etiqueta, clase, texto) {
    const el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    if (texto !== undefined && texto !== null) el.textContent = texto;
    return el;
  }

  function formatoFecha(valor, conHora = true) {
    if (!valor) return '';
    const fecha = new Date(valor);
    const opciones = conHora
      ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: 'long', year: 'numeric' };
    return fecha.toLocaleString('es-CL', opciones);
  }

  const CLASES_ESTADO = {
    Borrador: 'insignia-borrador',
    'En Revisión': 'insignia-revision',
    Aprobado: 'insignia-ok',
    'En Corrección': 'insignia-correccion',
    Bloqueado_SLA: 'insignia-bloqueado',
  };

  function insigniaEstado(nombreEstado) {
    const texto = nombreEstado === 'Bloqueado_SLA' ? 'Bloqueado (SLA)' : nombreEstado;
    return elemento('span', `insignia ${CLASES_ESTADO[nombreEstado] || ''}`, texto);
  }

  function mostrarAviso(contenedor, texto, tipo = 'exito') {
    contenedor.textContent = texto;
    contenedor.className = `aviso visible aviso-${tipo}`;
    clearTimeout(contenedor._temporizador);
    if (tipo === 'exito') contenedor._temporizador = setTimeout(() => contenedor.classList.remove('visible'), 6000);
  }

  // ---------- Menú y usuario ----------
  function dibujarMenu(rol) {
    const nav = document.getElementById('menu');
    if (!nav || !MENUS[rol]) return;
    const actual = document.body.dataset.menu;
    nav.replaceChildren(
      ...MENUS[rol].map((item) => {
        const enlace = elemento('a', item.url === '#' ? 'pendiente' : '', item.texto);
        enlace.href = item.url;
        if (item.id === actual) enlace.setAttribute('aria-current', 'page');
        if (item.url === '#') enlace.title = 'Disponible próximamente';
        return enlace;
      })
    );
  }

  const sesion = (async () => {
    const respuesta = await fetch('/api/sesion');
    if (respuesta.status === 401) {
      window.location.assign('/');
      return new Promise(() => {}); // la página se está redirigiendo
    }
    const { usuario } = await respuesta.json();
    document.getElementById('usuario-nombre').textContent = `${usuario.nombre} ${usuario.apellido}`;
    document.getElementById('usuario-rol').textContent = usuario.rol;
    dibujarMenu(usuario.rol);
    return usuario;
  })();

  document.getElementById('boton-salir').addEventListener('click', async (evento) => {
    evento.currentTarget.disabled = true;
    try {
      await fetch('/api/logout', { method: 'POST' });
    } finally {
      window.location.assign('/');
    }
  });

  window.ArgusNexus = { api, elemento, formatoFecha, insigniaEstado, mostrarAviso, sesion };
})();
