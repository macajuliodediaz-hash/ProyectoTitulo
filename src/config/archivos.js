// Carga de imágenes (RF2). Las imágenes se guardan en /uploads, FUERA de /public,
// y solo se entregan por una ruta que valida el permiso del usuario (RNF4).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const RAIZ_UPLOADS = path.join(__dirname, '..', '..', 'uploads');
const CARPETA_TEMPORAL = path.join(RAIZ_UPLOADS, 'tmp');
const CARPETA_DOCUMENTOS = path.join(RAIZ_UPLOADS, 'documentos');
const CARPETA_CLIENTES = path.join(RAIZ_UPLOADS, 'clientes');

const LIMITES = Object.freeze({
  bytesPorImagen: 5 * 1024 * 1024, // 5 MB
  imagenesPorSeccion: 5,
  imagenesPorEnvio: 40,
});

// Tipos aceptados, verificados por su firma binaria (no solo por la extensión).
const TIPOS = {
  jpg: { mime: 'image/jpeg', firma: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { mime: 'image/png', firma: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  webp: { mime: 'image/webp', firma: (b) => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' },
};

fs.mkdirSync(CARPETA_TEMPORAL, { recursive: true });
fs.mkdirSync(CARPETA_DOCUMENTOS, { recursive: true });
fs.mkdirSync(CARPETA_CLIENTES, { recursive: true });

const subida = multer({
  storage: multer.diskStorage({
    destination: CARPETA_TEMPORAL,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex')),
  }),
  limits: { fileSize: LIMITES.bytesPorImagen, files: LIMITES.imagenesPorEnvio, fields: 20, fieldSize: 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

/** Devuelve la extensión real (jpg/png/webp) leyendo los primeros bytes, o null si no es una imagen válida. */
function detectarTipo(rutaArchivo) {
  const fd = fs.openSync(rutaArchivo, 'r');
  try {
    const cabecera = Buffer.alloc(12);
    fs.readSync(fd, cabecera, 0, 12, 0);
    return Object.keys(TIPOS).find((ext) => TIPOS[ext].firma(cabecera)) || null;
  } finally {
    fs.closeSync(fd);
  }
}

function mimeDeRuta(ruta) {
  const ext = path.extname(ruta).slice(1).toLowerCase();
  return TIPOS[ext] ? TIPOS[ext].mime : 'application/octet-stream';
}

function borrarSilencioso(ruta) {
  fs.rm(ruta, { force: true }, () => {});
}

/** Borra archivos temporales con más de un día de antigüedad (previsualizaciones abandonadas). */
function limpiarTemporales() {
  const limite = Date.now() - 24 * 60 * 60 * 1000;
  for (const nombre of fs.readdirSync(CARPETA_TEMPORAL)) {
    const ruta = path.join(CARPETA_TEMPORAL, nombre);
    try {
      if (fs.statSync(ruta).mtimeMs < limite) fs.rmSync(ruta, { force: true });
    } catch {
      /* el archivo ya no existe */
    }
  }
}

module.exports = {
  RAIZ_UPLOADS,
  CARPETA_TEMPORAL,
  CARPETA_DOCUMENTOS,
  CARPETA_CLIENTES,
  LIMITES,
  subida,
  detectarTipo,
  mimeDeRuta,
  borrarSilencioso,
  limpiarTemporales,
};
