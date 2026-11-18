// Instala (o reinstala) las tablas de ArgusNexus en la base de datos indicada en .env.
// Pensado para el hosting, donde la base se crea desde el panel del proveedor y su
// nombre es distinto de "argusnexus": por eso se omiten CREATE DATABASE y USE.
//
// Uso:
//   npm run instalar-bd -- --confirmar              crea las 14 tablas y los catálogos
//   npm run instalar-bd -- --confirmar --reglas     además: vista SLA y triggers de auditoría
//
// ATENCIÓN: el script de esquema empieza con DROP TABLE, así que BORRA los datos existentes.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../src/config/env');

const argumentos = process.argv.slice(2);
const CARPETA = path.join(__dirname, '..', 'database');

/** Quita las líneas de comentario (--) del inicio de una sentencia. */
function sinComentariosIniciales(sentencia) {
  return sentencia.replace(/^(\s*--[^\n]*\n)+/, '').trim();
}

/**
 * Divide un script SQL en sentencias, respetando los bloques DELIMITER de los triggers.
 * Omite las sentencias CREATE DATABASE y USE completas (aunque ocupen varias líneas),
 * porque en el hosting la base ya existe y tiene otro nombre.
 */
function sentencias(sql) {
  const resultado = [];
  let delimitador = ';';
  let actual = '';
  const agregar = (texto) => {
    const sentencia = sinComentariosIniciales(texto);
    if (!sentencia) return; // solo comentarios
    if (/^(CREATE\s+DATABASE|USE)\b/i.test(sentencia)) return; // la base la crea el hosting
    resultado.push(sentencia);
  };
  for (const linea of sql.split(/\r?\n/)) {
    const cambio = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(linea);
    if (cambio) {
      delimitador = cambio[1];
      continue;
    }
    actual += `${linea}\n`;
    if (actual.trimEnd().endsWith(delimitador)) {
      agregar(actual.trimEnd().slice(0, -delimitador.length));
      actual = '';
    }
  }
  if (actual.trim()) agregar(actual);
  return resultado;
}

async function ejecutar(conexion, archivo, { tolerante = false } = {}) {
  const lista = sentencias(fs.readFileSync(path.join(CARPETA, archivo), 'utf8'));
  let ok = 0;
  for (const s of lista) {
    // Las consultas de ejemplo (SELECT) del script de reglas no se ejecutan
    if (/^(--[^\n]*\n\s*)*SELECT\b/i.test(s)) continue;
    try {
      await conexion.query(s);
      ok += 1;
    } catch (error) {
      if (!tolerante) throw error;
      console.warn(`  Aviso (${archivo}): ${error.code} ${error.sqlMessage || error.message}`);
    }
  }
  console.log(`  ${archivo}: ${ok} sentencias ejecutadas`);
}

async function main() {
  if (!argumentos.includes('--confirmar')) {
    console.log('Este script BORRA y vuelve a crear todas las tablas de ArgusNexus en:');
    console.log(`  ${db.user}@${db.host}/${db.database}`);
    console.log('Si estás seguro, ejecútalo así:  npm run instalar-bd -- --confirmar');
    return;
  }
  const conexion = await mysql.createConnection({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    ssl: db.ssl,
    charset: 'utf8mb4',
  });
  try {
    console.log(`Instalando en ${db.host}/${db.database}…`);
    await ejecutar(conexion, 'argusnexus_schema.sql');
    if (argumentos.includes('--reglas')) {
      // Los triggers requieren el privilegio TRIGGER; si el hosting no lo da, el sistema
      // igual funciona: las mismas reglas las aplica el backend dentro de transacciones.
      await ejecutar(conexion, 'argusnexus_reglas_opcionales.sql', { tolerante: true });
    }
    const [tablas] = await conexion.query('SHOW TABLES');
    console.log(`Listo: ${tablas.length} tablas. Ahora crea las cuentas con:  npm run seed`);
  } finally {
    await conexion.end();
  }
}

main().catch((error) => {
  console.error(`Error: ${error.sqlMessage || error.message}`);
  process.exitCode = 1;
});
