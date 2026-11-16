// Crea (o actualiza) una cuenta de prueba por cada perfil: Administrador y Equipo.
// Los datos se leen del archivo .env (variables SEED_*), nunca escritos en el código.
// Uso: npm run seed
const { pool } = require('../src/config/db');
const usuariosRepo = require('../src/repositories/usuariosRepo');
const { ROLES, hashClave } = require('../src/services/authService');

const cuentas = [
  {
    rol: ROLES.ADMIN,
    nombre: 'Admin',
    apellido: 'ArgusNexus',
    correo: process.env.SEED_ADMIN_CORREO,
    clave: process.env.SEED_ADMIN_CLAVE,
  },
  {
    rol: ROLES.EQUIPO,
    nombre: 'Equipo',
    apellido: 'ArgusNexus',
    correo: process.env.SEED_EQUIPO_CORREO,
    clave: process.env.SEED_EQUIPO_CLAVE,
  },
];

async function main() {
  for (const cuenta of cuentas) {
    if (!cuenta.correo || !cuenta.clave) {
      throw new Error(`Faltan SEED_*_CORREO o SEED_*_CLAVE para el perfil ${cuenta.rol} en el archivo .env.`);
    }
    if (cuenta.clave.length < 8) {
      throw new Error(`La contraseña de prueba del perfil ${cuenta.rol} debe tener al menos 8 caracteres.`);
    }
    const idRol = await usuariosRepo.buscarIdRol(cuenta.rol);
    if (!idRol) {
      throw new Error(`No existe el rol "${cuenta.rol}". Ejecuta primero database/argusnexus_schema.sql.`);
    }
    await usuariosRepo.crearOActualizar({
      idRol,
      nombre: cuenta.nombre,
      apellido: cuenta.apellido,
      correo: cuenta.correo.trim().toLowerCase(),
      passwordHash: await hashClave(cuenta.clave),
    });
    console.log(`Cuenta lista: ${cuenta.correo} (${cuenta.rol})`);
  }
}

main()
  .catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
