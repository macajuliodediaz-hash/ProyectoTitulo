// Cálculo por lote de metricas_mensuales (RNF3): el Dashboard lee la instantánea
// en vez de recorrer toda la auditoría en cada consulta.
const metricasRepo = require('../repositories/metricasRepo');

const CADA_MINUTOS = 15;

async function recalcular() {
  try {
    await metricasRepo.recalcular(6);
  } catch (error) {
    console.error('[métricas] Error al recalcular:', error.message);
  }
}

function iniciar() {
  recalcular();
  setInterval(recalcular, CADA_MINUTOS * 60 * 1000).unref();
  console.log(`Cálculo de métricas activo (cada ${CADA_MINUTOS} min).`);
}

module.exports = { iniciar, recalcular };
