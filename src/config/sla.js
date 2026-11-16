// Parámetros únicos del SLA. Cualquier módulo que necesite un plazo o umbral
// del SLA debe leerlo desde aquí (y no escribir números fijos en el código).
//
//   SLA_HORAS_PLAZO             plazo inicial de corrección (RF8)            -> 24
//   SLA_HORAS_UMBRAL_EXTENSION  tiempo restante bajo el cual se puede pedir
//                               la extensión extraordinaria (RNF7)           -> 2
//   SLA_HORAS_EXTENSION         horas que agrega la extensión única (RNF7)  -> 2
//   SLA_HORAS_UMBRAL_CRITICO    tiempo restante bajo el cual la fila se
//                               marca como crítica (RNF6)                    -> 2
const { sla } = require('./env');

module.exports = Object.freeze({ ...sla });
