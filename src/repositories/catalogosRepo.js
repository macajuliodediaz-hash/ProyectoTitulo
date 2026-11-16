// Catálogos paramétricos (estados del documento y tipos de evento).
// Se leen una vez desde la base y quedan en memoria: así el código usa
// nombres legibles ("En Revisión") y nunca ids escritos a mano.
const { pool } = require('../config/db');

let cache = null;

async function cargar() {
  if (cache) return cache;
  const [estados] = await pool.execute('SELECT id_estado, nombre_estado, permite_edicion_autor FROM estados_documento');
  const [eventos] = await pool.execute('SELECT id_tipo_evento, nombre_evento FROM tipos_evento');
  cache = {
    estadosPorNombre: new Map(estados.map((e) => [e.nombre_estado, e])),
    estadosPorId: new Map(estados.map((e) => [e.id_estado, e])),
    eventosPorNombre: new Map(eventos.map((e) => [e.nombre_evento, e.id_tipo_evento])),
  };
  return cache;
}

async function estadoId(nombre) {
  const estado = (await cargar()).estadosPorNombre.get(nombre);
  if (!estado) throw new Error(`Estado de documento desconocido: ${nombre}`);
  return estado.id_estado;
}

async function estadoPorId(id) {
  return (await cargar()).estadosPorId.get(id) || null;
}

async function tipoEventoId(nombre) {
  const id = (await cargar()).eventosPorNombre.get(nombre);
  if (!id) throw new Error(`Tipo de evento desconocido: ${nombre}`);
  return id;
}

const ESTADOS = Object.freeze({
  BORRADOR: 'Borrador',
  EN_REVISION: 'En Revisión',
  APROBADO: 'Aprobado',
  EN_CORRECCION: 'En Corrección',
  BLOQUEADO_SLA: 'Bloqueado_SLA',
});

const EVENTOS = Object.freeze({
  CREACION: 'Creación',
  ENVIO_REVISION: 'Envío a revisión',
  APROBACION: 'Aprobación',
  RECHAZO: 'Rechazo',
  EXTENSION_SLA: 'Extensión SLA',
  BLOQUEO_SLA: 'Bloqueo SLA',
  CAMBIO_CONFIDENCIALIDAD: 'Cambio de confidencialidad',
});

module.exports = { estadoId, estadoPorId, tipoEventoId, ESTADOS, EVENTOS };
