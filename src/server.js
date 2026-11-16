// Punto de entrada: verifica la base de datos y levanta el servidor.
const config = require('./config/env');
const { pool } = require('./config/db');
const app = require('./app');

async function iniciar() {
  try {
    await pool.query('SELECT 1');
    console.log(`Conectado a MySQL (${config.db.host}/${config.db.database}).`);
  } catch (error) {
    console.error('No se pudo conectar a MySQL. Revisa los datos DB_* de tu archivo .env.');
    console.error(`Detalle: ${error.code || error.message}`);
    process.exit(1);
  }

  app.listen(config.puerto, () => {
    console.log(`ArgusNexus disponible en http://localhost:${config.puerto}`);
  });
}

iniciar();
