// Dashboard del Administrador (RF6): estado de almacenamiento, documentos pendientes,
// SLA críticos y métricas de correcciones. Se mide el tiempo de respuesta (RNF3: ≤ 3 s).
const fs = require('fs');
const path = require('path');
const slaConfig = require('../config/sla');
const archivos = require('../config/archivos');
const documentosRepo = require('../repositories/documentosRepo');
const metricasRepo = require('../repositories/metricasRepo');

/** Espacio usado por las imágenes en disco (bytes). */
async function bytesEnDisco(carpeta) {
  let total = 0;
  let entradas = [];
  try {
    entradas = await fs.promises.readdir(carpeta, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entradas) {
    const ruta = path.join(carpeta, e.name);
    if (e.isDirectory()) total += await bytesEnDisco(ruta);
    else if (e.isFile()) total += (await fs.promises.stat(ruta)).size;
  }
  return total;
}

async function obtener() {
  const inicio = process.hrtime.bigint();
  const [porEstado, criticos, porCliente, tendencia, actividad, almacenamiento, bytes] = await Promise.all([
    documentosRepo.contarPorEstado(),
    metricasRepo.slaCriticos(slaConfig.horasUmbralCritico * 3600),
    metricasRepo.mesActualPorCliente(),
    metricasRepo.tendencia(),
    metricasRepo.actividadReciente(8),
    metricasRepo.almacenamiento(),
    bytesEnDisco(archivos.CARPETA_DOCUMENTOS),
  ]);
  const milisegundos = Number(process.hrtime.bigint() - inicio) / 1e6;
  return {
    porEstado,
    slaCriticos: criticos,
    metricasPorCliente: porCliente,
    tendencia,
    actividad,
    almacenamiento: { ...almacenamiento, megabytes: Math.round((bytes / (1024 * 1024)) * 100) / 100 },
    umbralCriticoHoras: slaConfig.horasUmbralCritico,
    tiempoRespuestaMs: Math.round(milisegundos),
  };
}

module.exports = { obtener };
