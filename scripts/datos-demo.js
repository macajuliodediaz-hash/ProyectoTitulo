// Carga datos de demostración FICTICIOS: clientes y las 5 plantillas base.
// Las estructuras de las plantillas se definieron a partir del análisis de los
// informes emitidos por GEN BackOffice (solo su estructura, sin contenido real).
// Se puede ejecutar varias veces: lo que ya existe no se duplica.
// Uso: npm run demo   (requiere haber ejecutado antes: npm run seed)
const { pool, enTransaccion } = require('../src/config/db');

const CLIENTES = ['Minera Cordillera Norte SpA', 'Constructora Austral Ltda.', 'Transportes Altiplano SpA'];

// [nombre de la sección, obligatoria, permite imágenes]
const PLANTILLAS = [
  {
    nombre: 'Informe de diagnóstico en terreno',
    secciones: [
      ['Objetivo, contexto y alcance de la visita', 1, 0],
      ['Marco normativo aplicable', 1, 0],
      ['Hallazgos', 1, 1],
      ['Evaluación de impacto (contractual, económico y legal)', 1, 0],
      ['Matriz de acciones correctivas', 1, 0],
      ['Detalle de las soluciones propuestas', 0, 0],
    ],
  },
  {
    nombre: 'Informe de inspección y hallazgos',
    secciones: [
      ['Resumen ejecutivo', 1, 0],
      ['Objetivo, alcance y metodología', 1, 0],
      ['Situación actual', 1, 1],
      ['Hallazgos', 1, 1],
      ['Soluciones y recomendaciones', 1, 0],
      ['Hoja de ruta y próximos pasos', 0, 0],
      ['Conclusión', 1, 0],
    ],
  },
  {
    nombre: 'Informe ejecutivo financiero',
    secciones: [
      ['Propósito del documento', 1, 0],
      ['Desempeño general del período', 1, 0],
      ['Estructura de costos', 1, 1],
      ['Comparativo entre períodos', 1, 1],
      ['Recomendaciones', 1, 0],
      ['Conclusiones', 1, 0],
    ],
  },
  {
    nombre: 'Informe técnico-normativo',
    secciones: [
      ['Finalidad y resumen', 1, 0],
      ['Marco regulatorio y legal', 1, 0],
      ['Análisis', 1, 0],
      ['Estrategia o plan de intervención', 1, 0],
      ['Roles y responsabilidades', 0, 0],
      ['Conclusiones y recomendaciones', 1, 0],
    ],
  },
  {
    nombre: 'Manual',
    secciones: [
      ['Propósito y alcance', 1, 0],
      ['Organización del contenido', 1, 0],
      ['Marco normativo', 0, 0],
      ['Guía de uso', 1, 1],
      ['Limitaciones y próximos pasos', 0, 0],
      ['Glosario y anexos', 0, 0],
    ],
  },
];

async function main() {
  const correoAdmin = (process.env.SEED_ADMIN_CORREO || '').trim().toLowerCase();
  const [admins] = await pool.execute('SELECT id_usuario FROM usuarios WHERE correo = ?', [correoAdmin]);
  if (!admins[0]) throw new Error('No existe la cuenta de administrador. Ejecuta primero: npm run seed');
  const idAdmin = admins[0].id_usuario;

  for (const nombreCliente of CLIENTES) {
    await pool.execute('INSERT IGNORE INTO clientes (nombre_cliente) VALUES (?)', [nombreCliente]);
  }
  console.log(`Clientes listos: ${CLIENTES.length}`);

  // Las 5 plantillas base se asignan al primer cliente; los demás quedan para crear plantillas desde la pantalla.
  const [[cliente]] = await pool.execute('SELECT id_cliente FROM clientes WHERE nombre_cliente = ?', [CLIENTES[0]]);

  let creadas = 0;
  for (const plantilla of PLANTILLAS) {
    const [existe] = await pool.execute(
      'SELECT 1 FROM plantillas WHERE id_cliente = ? AND nombre_plantilla = ?',
      [cliente.id_cliente, plantilla.nombre]
    );
    if (existe.length) continue;

    await enTransaccion(async (conn) => {
      const [r] = await conn.execute(
        'INSERT INTO plantillas (id_cliente, id_usuario_creador, nombre_plantilla) VALUES (?, ?, ?)',
        [cliente.id_cliente, idAdmin, plantilla.nombre]
      );
      for (const [i, [nombre, obligatoria, imagenes]] of plantilla.secciones.entries()) {
        await conn.execute(
          `INSERT INTO plantilla_secciones (id_plantilla, nombre_seccion, orden, es_obligatoria, permite_imagenes)
           VALUES (?, ?, ?, ?, ?)`,
          [r.insertId, nombre, i + 1, obligatoria, imagenes]
        );
      }
    });
    creadas += 1;
  }
  console.log(`Plantillas nuevas: ${creadas} (ya existían: ${PLANTILLAS.length - creadas})`);
}

main()
  .catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
