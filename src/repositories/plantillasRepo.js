// Acceso a datos de plantillas y plantilla_secciones (consultas parametrizadas).
// Las funciones que reciben "conn" se ejecutan dentro de una transacción.
const { pool } = require('../config/db');

async function listar({ soloActivas = false, idCliente = null } = {}) {
  const condiciones = [];
  const valores = [];
  if (soloActivas) condiciones.push('p.activa = 1');
  if (idCliente) {
    condiciones.push('p.id_cliente = ?');
    valores.push(idCliente);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const [filas] = await pool.execute(
    `SELECT p.id_plantilla, p.nombre_plantilla, p.activa, p.fecha_creacion,
            c.id_cliente, c.nombre_cliente,
            (SELECT COUNT(*) FROM plantilla_secciones s WHERE s.id_plantilla = p.id_plantilla) AS total_secciones,
            (SELECT COUNT(*) FROM documentos d WHERE d.id_plantilla = p.id_plantilla) AS total_documentos
       FROM plantillas p
       JOIN clientes c ON c.id_cliente = p.id_cliente
       ${where}
      ORDER BY c.nombre_cliente, p.nombre_plantilla`,
    valores
  );
  return filas;
}

async function buscarPorId(idPlantilla) {
  const [filas] = await pool.execute(
    `SELECT p.id_plantilla, p.id_cliente, p.nombre_plantilla, p.activa, c.nombre_cliente,
            (c.logo_ruta IS NOT NULL) AS cliente_tiene_logo,
            (SELECT COUNT(*) FROM documentos d WHERE d.id_plantilla = p.id_plantilla) AS total_documentos
       FROM plantillas p
       JOIN clientes c ON c.id_cliente = p.id_cliente
      WHERE p.id_plantilla = ?`,
    [idPlantilla]
  );
  if (!filas[0]) return null;
  const plantilla = filas[0];
  plantilla.secciones = await listarSecciones(idPlantilla);
  return plantilla;
}

async function listarSecciones(idPlantilla, conn = pool) {
  const [filas] = await conn.execute(
    `SELECT s.id_seccion, s.nombre_seccion, s.orden, s.es_obligatoria, s.permite_imagenes,
            (SELECT COUNT(*) FROM contenido_documento cd WHERE cd.id_seccion = s.id_seccion) AS usos
       FROM plantilla_secciones s
      WHERE s.id_plantilla = ?
      ORDER BY s.orden`,
    [idPlantilla]
  );
  return filas;
}

async function insertar(conn, { idCliente, idUsuarioCreador, nombre }) {
  const [resultado] = await conn.execute(
    'INSERT INTO plantillas (id_cliente, id_usuario_creador, nombre_plantilla) VALUES (?, ?, ?)',
    [idCliente, idUsuarioCreador, nombre]
  );
  return resultado.insertId;
}

async function actualizar(conn, idPlantilla, { idCliente, nombre }) {
  await conn.execute('UPDATE plantillas SET id_cliente = ?, nombre_plantilla = ? WHERE id_plantilla = ?', [
    idCliente,
    nombre,
    idPlantilla,
  ]);
}

async function cambiarEstado(idPlantilla, activa) {
  const [resultado] = await pool.execute('UPDATE plantillas SET activa = ? WHERE id_plantilla = ?', [
    activa ? 1 : 0,
    idPlantilla,
  ]);
  return resultado.affectedRows > 0;
}

async function insertarSeccion(conn, idPlantilla, seccion, orden) {
  await conn.execute(
    `INSERT INTO plantilla_secciones (id_plantilla, nombre_seccion, orden, es_obligatoria, permite_imagenes)
     VALUES (?, ?, ?, ?, ?)`,
    [idPlantilla, seccion.nombre, orden, seccion.obligatoria ? 1 : 0, seccion.permiteImagenes ? 1 : 0]
  );
}

async function actualizarSeccion(conn, idSeccion, seccion, orden) {
  await conn.execute(
    `UPDATE plantilla_secciones
        SET nombre_seccion = ?, orden = ?, es_obligatoria = ?, permite_imagenes = ?
      WHERE id_seccion = ?`,
    [seccion.nombre, orden, seccion.obligatoria ? 1 : 0, seccion.permiteImagenes ? 1 : 0, idSeccion]
  );
}

// Mueve temporalmente el orden de todas las secciones para poder reordenarlas
// sin chocar con la restricción UNIQUE (id_plantilla, orden).
async function desplazarOrdenes(conn, idPlantilla) {
  await conn.execute('UPDATE plantilla_secciones SET orden = orden + 1000 WHERE id_plantilla = ?', [idPlantilla]);
}

async function eliminarSeccion(conn, idSeccion) {
  await conn.execute('DELETE FROM plantilla_secciones WHERE id_seccion = ?', [idSeccion]);
}

async function eliminar(conn, idPlantilla) {
  await conn.execute('DELETE FROM plantilla_secciones WHERE id_plantilla = ?', [idPlantilla]);
  await conn.execute('DELETE FROM plantillas WHERE id_plantilla = ?', [idPlantilla]);
}

module.exports = {
  listar,
  buscarPorId,
  listarSecciones,
  insertar,
  actualizar,
  cambiarEstado,
  insertarSeccion,
  actualizarSeccion,
  desplazarOrdenes,
  eliminarSeccion,
  eliminar,
};
