// Acceso a datos de documentos, su contenido, imágenes y auditoría.
// Las funciones que reciben "conn" se ejecutan dentro de una transacción.
const { pool } = require('../config/db');

const SELECT_DOCUMENTO = `
  SELECT d.id_documento, d.codigo_documento, d.titulo, d.es_confidencial,
         d.fecha_creacion, d.fecha_actualizacion,
         d.id_plantilla, p.nombre_plantilla,
         c.id_cliente, c.nombre_cliente, (c.logo_ruta IS NOT NULL) AS cliente_tiene_logo,
         d.id_estado, e.nombre_estado, e.permite_edicion_autor,
         d.id_autor, CONCAT(u.nombre, ' ', u.apellido) AS autor,
         (SELECT COUNT(*) FROM historial_sla h WHERE h.id_documento = d.id_documento) AS revision,
         -- Corrección abierta (SLA vigente); la fecha límite se calcula, no se almacena (3FN)
         hs.id_sla AS sla_id, hs.num_iteracion AS sla_iteracion, hs.motivo_correccion AS sla_motivo,
         (hs.fecha_extension IS NOT NULL) AS sla_extension_usada,
         DATE_ADD(hs.fecha_inicio, INTERVAL (hs.horas_plazo + hs.horas_extension) HOUR) AS sla_fecha_limite,
         TIMESTAMPDIFF(SECOND, NOW(), DATE_ADD(hs.fecha_inicio, INTERVAL (hs.horas_plazo + hs.horas_extension) HOUR))
           AS sla_segundos_restantes
    FROM documentos d
    JOIN plantillas p        ON p.id_plantilla = d.id_plantilla
    JOIN clientes c          ON c.id_cliente = p.id_cliente
    JOIN estados_documento e ON e.id_estado = d.id_estado
    JOIN usuarios u          ON u.id_usuario = d.id_autor
    LEFT JOIN historial_sla hs ON hs.id_documento = d.id_documento AND hs.fecha_cierre IS NULL`;

async function buscarPorId(idDocumento, conn = pool) {
  const [filas] = await conn.execute(`${SELECT_DOCUMENTO} WHERE d.id_documento = ?`, [idDocumento]);
  return filas[0] || null;
}

/** Bloquea la fila del documento hasta el fin de la transacción (evita cambios simultáneos). */
async function bloquearParaActualizar(conn, idDocumento) {
  const [filas] = await conn.execute(
    `SELECT d.id_documento, d.codigo_documento, d.titulo, d.es_confidencial, d.id_autor, d.id_estado,
            d.id_plantilla, e.nombre_estado, e.permite_edicion_autor
       FROM documentos d JOIN estados_documento e ON e.id_estado = d.id_estado
      WHERE d.id_documento = ? FOR UPDATE`,
    [idDocumento]
  );
  return filas[0] || null;
}

async function listarDelAutor(idAutor) {
  const [filas] = await pool.execute(`${SELECT_DOCUMENTO} WHERE d.id_autor = ? ORDER BY d.fecha_actualizacion DESC`, [
    idAutor,
  ]);
  return filas;
}

/** Documentos que no son borradores (para el Administrador), opcionalmente filtrados por estado. */
async function listarParaRevision(nombreEstado = null) {
  const filtro = nombreEstado ? 'AND e.nombre_estado = ?' : '';
  const [filas] = await pool.execute(
    `${SELECT_DOCUMENTO} WHERE e.nombre_estado <> 'Borrador' ${filtro}
      ORDER BY (e.nombre_estado = 'En Revisión') DESC, d.fecha_actualizacion DESC`,
    nombreEstado ? [nombreEstado] : []
  );
  return filas;
}

/**
 * Buscador avanzado (RF10). Todos los filtros son opcionales y se combinan (AND).
 * soloVisiblesPara: id del usuario del perfil Equipo (ve sus documentos y los aprobados
 * de otros, nunca los confidenciales); null para el Administrador (ve todo).
 */
async function buscar({ texto, idCliente, estado, desde, hasta, confidencial, soloVisiblesPara }, limite = 200) {
  const condiciones = [];
  const valores = [];
  if (texto) {
    const patron = `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    condiciones.push('(d.titulo LIKE ? OR d.codigo_documento LIKE ?)');
    valores.push(patron, patron);
  }
  if (idCliente) {
    condiciones.push('c.id_cliente = ?');
    valores.push(idCliente);
  }
  if (estado) {
    condiciones.push('e.nombre_estado = ?');
    valores.push(estado);
  }
  if (desde) {
    condiciones.push('d.fecha_creacion >= ?');
    valores.push(`${desde} 00:00:00`);
  }
  if (hasta) {
    condiciones.push('d.fecha_creacion < DATE_ADD(?, INTERVAL 1 DAY)');
    valores.push(hasta);
  }
  if (confidencial !== null && confidencial !== undefined) {
    condiciones.push('d.es_confidencial = ?');
    valores.push(confidencial ? 1 : 0);
  }
  if (soloVisiblesPara) {
    condiciones.push("d.es_confidencial = 0 AND (d.id_autor = ? OR e.nombre_estado = 'Aprobado')");
    valores.push(soloVisiblesPara);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const [filas] = await pool.execute(
    `${SELECT_DOCUMENTO} ${where} ORDER BY d.fecha_actualizacion DESC LIMIT ${Number(limite) | 0}`,
    valores
  );
  return filas;
}

async function contarPorEstado() {
  const [filas] = await pool.execute(
    `SELECT e.nombre_estado, COUNT(d.id_documento) AS total
       FROM estados_documento e LEFT JOIN documentos d ON d.id_estado = e.id_estado
      GROUP BY e.id_estado, e.nombre_estado`
  );
  return Object.fromEntries(filas.map((f) => [f.nombre_estado, Number(f.total)]));
}

async function cambiarConfidencialidad(conn, idDocumento, valor) {
  await conn.execute('UPDATE documentos SET es_confidencial = ? WHERE id_documento = ?', [valor ? 1 : 0, idDocumento]);
}

async function listarContenido(idDocumento) {
  const [secciones] = await pool.execute(
    `SELECT s.id_seccion, s.nombre_seccion, s.orden, s.es_obligatoria, s.permite_imagenes,
            cd.id_contenido, cd.texto_ingresado
       FROM documentos d
       JOIN plantilla_secciones s ON s.id_plantilla = d.id_plantilla
       LEFT JOIN contenido_documento cd ON cd.id_documento = d.id_documento AND cd.id_seccion = s.id_seccion
      WHERE d.id_documento = ?
      ORDER BY s.orden`,
    [idDocumento]
  );
  const [imagenes] = await pool.execute(
    `SELECT i.id_imagen, i.nombre_archivo, cd.id_seccion
       FROM imagenes_documento i
       JOIN contenido_documento cd ON cd.id_contenido = i.id_contenido
      WHERE cd.id_documento = ?
      ORDER BY i.id_imagen`,
    [idDocumento]
  );
  return secciones.map((s) => ({ ...s, imagenes: imagenes.filter((i) => i.id_seccion === s.id_seccion) }));
}

async function siguienteCodigo(conn, anio) {
  const prefijo = `DOC-${anio}-`;
  const [filas] = await conn.execute(
    `SELECT codigo_documento FROM documentos
      WHERE codigo_documento LIKE ? ORDER BY codigo_documento DESC LIMIT 1 FOR UPDATE`,
    [`${prefijo}%`]
  );
  const ultimo = filas[0] ? Number(filas[0].codigo_documento.slice(prefijo.length)) : 0;
  return `${prefijo}${String(ultimo + 1).padStart(4, '0')}`;
}

async function insertar(conn, { codigo, idPlantilla, idEstado, idAutor, titulo }) {
  const [r] = await conn.execute(
    `INSERT INTO documentos (codigo_documento, id_plantilla, id_estado, id_autor, titulo)
     VALUES (?, ?, ?, ?, ?)`,
    [codigo, idPlantilla, idEstado, idAutor, titulo]
  );
  return r.insertId;
}

async function actualizarTitulo(conn, idDocumento, titulo) {
  await conn.execute('UPDATE documentos SET titulo = ?, fecha_actualizacion = NOW() WHERE id_documento = ?', [
    titulo,
    idDocumento,
  ]);
}

async function cambiarEstado(conn, idDocumento, idEstado) {
  await conn.execute('UPDATE documentos SET id_estado = ?, fecha_actualizacion = NOW() WHERE id_documento = ?', [
    idEstado,
    idDocumento,
  ]);
}

/** Inserta o actualiza el texto de una sección y devuelve el id del contenido. */
async function guardarContenido(conn, idDocumento, idSeccion, texto) {
  await conn.execute(
    `INSERT INTO contenido_documento (id_documento, id_seccion, texto_ingresado) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE texto_ingresado = VALUES(texto_ingresado)`,
    [idDocumento, idSeccion, texto]
  );
  const [filas] = await conn.execute(
    'SELECT id_contenido FROM contenido_documento WHERE id_documento = ? AND id_seccion = ?',
    [idDocumento, idSeccion]
  );
  return filas[0].id_contenido;
}

async function insertarImagen(conn, idContenido, nombreArchivo, ruta) {
  await conn.execute('INSERT INTO imagenes_documento (id_contenido, nombre_archivo, ruta_imagen) VALUES (?, ?, ?)', [
    idContenido,
    nombreArchivo,
    ruta,
  ]);
}

async function imagenesDelDocumento(conn, idDocumento) {
  const [filas] = await conn.execute(
    `SELECT i.id_imagen, i.ruta_imagen, cd.id_seccion
       FROM imagenes_documento i JOIN contenido_documento cd ON cd.id_contenido = i.id_contenido
      WHERE cd.id_documento = ?`,
    [idDocumento]
  );
  return filas;
}

async function eliminarImagen(conn, idImagen) {
  await conn.execute('DELETE FROM imagenes_documento WHERE id_imagen = ?', [idImagen]);
}

async function buscarImagen(idImagen) {
  const [filas] = await pool.execute(
    `SELECT i.id_imagen, i.ruta_imagen, cd.id_documento
       FROM imagenes_documento i JOIN contenido_documento cd ON cd.id_contenido = i.id_contenido
      WHERE i.id_imagen = ?`,
    [idImagen]
  );
  return filas[0] || null;
}

async function registrarAuditoria(conn, { idDocumento, idUsuario, idTipoEvento, idEstadoResultante, detalle }) {
  const [r] = await conn.execute(
    `INSERT INTO auditoria_eventos (id_documento, id_usuario, id_tipo_evento, id_estado_resultante, detalle)
     VALUES (?, ?, ?, ?, ?)`,
    [idDocumento, idUsuario, idTipoEvento, idEstadoResultante, detalle || null]
  );
  return r.insertId;
}

module.exports = {
  buscarPorId,
  bloquearParaActualizar,
  listarDelAutor,
  listarContenido,
  siguienteCodigo,
  insertar,
  actualizarTitulo,
  cambiarEstado,
  guardarContenido,
  insertarImagen,
  imagenesDelDocumento,
  eliminarImagen,
  buscarImagen,
  registrarAuditoria,
  listarParaRevision,
  buscar,
  contarPorEstado,
  cambiarConfidencialidad,
};
