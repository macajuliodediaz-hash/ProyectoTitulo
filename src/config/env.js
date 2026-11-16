// Carga y valida las variables de entorno (archivo .env).
// Todo valor configurable del sistema se lee desde aquí, nunca escrito en el código.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

function requerida(nombre) {
  const valor = process.env[nombre];
  if (valor === undefined || valor === '') {
    throw new Error(`Falta la variable de entorno ${nombre}. Revisa tu archivo .env (usa .env.example como guía).`);
  }
  return valor;
}

function numero(nombre, porDefecto) {
  const valor = process.env[nombre];
  if (valor === undefined || valor === '') return porDefecto;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`La variable ${nombre} debe ser un número mayor o igual a 0 (valor actual: "${valor}").`);
  }
  return n;
}

const produccion = process.env.NODE_ENV === 'production';

module.exports = {
  produccion,
  puerto: numero('PORT', 3000),

  db: {
    host: requerida('DB_HOST'),
    port: numero('DB_PORT', 3306),
    user: requerida('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: requerida('DB_NAME'),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  },

  sesion: {
    secreto: requerida('SESSION_SECRET'),
    horasDuracion: numero('SESSION_HORAS', 8),
  },

  // Parámetros del SLA (observación 2: un único lugar configurable en el servidor)
  sla: {
    horasPlazo: numero('SLA_HORAS_PLAZO', 24),
    horasUmbralExtension: numero('SLA_HORAS_UMBRAL_EXTENSION', 2),
    horasExtension: numero('SLA_HORAS_EXTENSION', 2),
    horasUmbralCritico: numero('SLA_HORAS_UMBRAL_CRITICO', 2),
  },
};
