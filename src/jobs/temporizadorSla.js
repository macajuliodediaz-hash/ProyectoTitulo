// Temporizador SLA (RF9): revisa periódicamente los plazos de corrección vencidos.
// Corre en el servidor: no depende de que un usuario tenga la aplicación abierta.
const slaConfig = require('../config/sla');
const revisionService = require('../services/revisionService');

let enCurso = false;

async function revisar() {
  if (enCurso) return; // evita ejecuciones superpuestas
  enCurso = true;
  try {
    const bloqueados = await revisionService.bloquearVencidos();
    if (bloqueados.length) console.log(`[sla] Documentos bloqueados por plazo vencido: ${bloqueados.join(', ')}`);
  } catch (error) {
    console.error('[sla] Error al revisar los plazos:', error.message);
  } finally {
    enCurso = false;
  }
}

function iniciar() {
  revisar();
  setInterval(revisar, slaConfig.segundosRevisionVencimientos * 1000).unref();
  console.log(`Temporizador SLA activo (revisión cada ${slaConfig.segundosRevisionVencimientos} s).`);
}

module.exports = { iniciar, revisar };
