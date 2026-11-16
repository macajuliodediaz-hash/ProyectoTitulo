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
         (SELECT COUNT(*) FROM historial_sla h WHERE h.id_documento = d.id_documento) AS revision
    FROM documentos d
    JOIN plantillas p        ON p.id_plantilla = d.id_plantilla
    JOIN clientes c          ON c.id_cliente = p.id_cliente
    JOIN estados_documento e ON e.id_estado = d.id_estado
    JOIN usuarios u          ON u.id_usuario = d.id_autor`;

async function buscarPorId(idDocumento, conn = pool) {
  const [filas] = await conn.execute(`${SELECT_DOCUMENTO} WHERE d.id_documento = ?`, [idDocumento]);
  return filas[0] || null;
}

/** Bloquea la fila del documento hasta el fin de la transacción (evita cambios simultáneos). */
async function bloquearParaActualizar(conn, idDocumento) {
  const [filas] = await conn.execute(
    `SELECT d.id_documento, d.id_autor, d.id_estado, d.id_plantilla, e.nombre_estado, e.permite_edicion_autor
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

async function cerrarSlaAbierto(conn, idDocumento) {
  await conn.execute('UPDATE historial_sla SET fecha_cierre = NOW() WHERE id_documento = ? AND fecha_cierre IS NULL', [
    idDocumento,
  ]);
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
  cerrarSlaAbierto,
};
