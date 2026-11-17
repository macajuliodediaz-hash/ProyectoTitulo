// Punto de entrada: verifica la base de datos y levanta el servidor.
const config = require('./config/env');
const { pool } = require('./config/db');
const app = require('./app');
const { limpiarTemporales } = require('./config/archivos');
const temporizadorSla = require('./jobs/temporizadorSla');

async function iniciar() {
  try {
    await pool.query('SELECT 1');
    console.log(`Conectado a MySQL (${config.db.host}/${config.db.database}).`);
  } catch (error) {
    console.error('No se pudo conectar a MySQL. Revisa los datos DB_* de tu archivo .env.');
    console.error(`Detalle: ${error.code || error.message}`);
    process.exit(1);
  }

  // Limpieza de imágenes temporales de vistas previas abandonadas (al iniciar y cada 6 horas)
  limpiarTemporales();
  setInterval(limpiarTemporales, 6 * 60 * 60 * 1000).unref();

  // Bloqueo automático de documentos con el plazo de corrección vencido (RF9)
  temporizadorSla.iniciar();

  app.listen(config.puerto, () => {
    console.log(`ArgusNexus disponible en http://localhost:${config.puerto}`);
  });
}

iniciar();
