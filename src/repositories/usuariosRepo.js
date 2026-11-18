// Acceso a datos de la tabla usuarios (solo consultas parametrizadas).
const { pool } = require('../config/db');

const SELECT_USUARIO = `
  SELECT u.id_usuario, u.nombre, u.apellido, u.correo, u.activo, u.fecha_creacion, u.ultimo_acceso,
         r.nombre_rol AS rol
    FROM usuarios u
    JOIN roles r ON r.id_rol = u.id_rol`;

async function buscarPorCorreo(correo) {
  const [filas] = await pool.execute(
    `SELECT u.id_usuario, u.nombre, u.apellido, u.correo, u.password_hash, u.activo,
            r.nombre_rol AS rol
       FROM usuarios u
       JOIN roles r ON r.id_rol = u.id_rol
      WHERE u.correo = ?
      LIMIT 1`,
    [correo]
  );
  return filas[0] || null;
}

async function buscarPorId(idUsuario) {
  const [filas] = await pool.execute(`${SELECT_USUARIO} WHERE u.id_usuario = ?`, [idUsuario]);
  return filas[0] || null;
}

async function hashDe(idUsuario) {
  const [filas] = await pool.execute('SELECT password_hash FROM usuarios WHERE id_usuario = ?', [idUsuario]);
  return filas[0] ? filas[0].password_hash : null;
}

async function listar() {
  const [filas] = await pool.execute(
    `${SELECT_USUARIO}
      ORDER BY u.activo DESC, r.nombre_rol, u.nombre, u.apellido`
  );
  return filas;
}

async function registrarAcceso(idUsuario) {
  await pool.execute('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = ?', [idUsuario]);
}

async function buscarIdRol(nombreRol) {
  const [filas] = await pool.execute('SELECT id_rol FROM roles WHERE nombre_rol = ?', [nombreRol]);
  return filas[0] ? filas[0].id_rol : null;
}

async function insertar({ idRol, nombre, apellido, correo, passwordHash }) {
  const [r] = await pool.execute(
    'INSERT INTO usuarios (id_rol, nombre, apellido, correo, password_hash) VALUES (?, ?, ?, ?, ?)',
    [idRol, nombre, apellido, correo, passwordHash]
  );
  return r.insertId;
}

async function actualizar(idUsuario, { idRol, nombre, apellido, correo }) {
  await pool.execute('UPDATE usuarios SET id_rol = ?, nombre = ?, apellido = ?, correo = ? WHERE id_usuario = ?', [
    idRol,
    nombre,
    apellido,
    correo,
    idUsuario,
  ]);
}

async function actualizarNombre(idUsuario, { nombre, apellido }) {
  await pool.execute('UPDATE usuarios SET nombre = ?, apellido = ? WHERE id_usuario = ?', [nombre, apellido, idUsuario]);
}

async function cambiarClave(idUsuario, passwordHash) {
  await pool.execute('UPDATE usuarios SET password_hash = ? WHERE id_usuario = ?', [passwordHash, idUsuario]);
}

async function cambiarEstado(idUsuario, activo) {
  await pool.execute('UPDATE usuarios SET activo = ? WHERE id_usuario = ?', [activo ? 1 : 0, idUsuario]);
}

async function contarAdministradoresActivos() {
  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
      WHERE r.nombre_rol = 'Administrador' AND u.activo = 1`
  );
  return Number(total);
}

/** Usado por el script de cuentas de prueba (npm run seed). */
async function crearOActualizar({ idRol, nombre, apellido, correo, passwordHash }) {
  await pool.execute(
    `INSERT INTO usuarios (id_rol, nombre, apellido, correo, password_hash)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id_rol = VALUES(id_rol), nombre = VALUES(nombre),
       apellido = VALUES(apellido), password_hash = VALUES(password_hash), activo = 1`,
    [idRol, nombre, apellido, correo, passwordHash]
  );
}

module.exports = {
  buscarPorCorreo,
  buscarPorId,
  hashDe,
  listar,
  registrarAcceso,
  buscarIdRol,
  insertar,
  actualizar,
  actualizarNombre,
  cambiarClave,
  cambiarEstado,
  contarAdministradoresActivos,
  crearOActualizar,
};
