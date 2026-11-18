# ArgusNexus

Sistema web de gestión y estandarización documental para **GEN BackOffice**.
Proyecto de Título — Analista Programador (Iplacex), 2026.

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | HTML5, CSS puro (responsive, sin frameworks) y JavaScript |
| Backend | Node.js con Express |
| Base de datos | MySQL 8 (InnoDB, modelo relacional en 3FN, 14 tablas) |
| Acceso a datos | mysql2 con consultas parametrizadas y transacciones |
| Seguridad | Contraseñas con bcrypt, sesiones con cookie `httpOnly`, control de rol en el servidor |

## Estructura

```
argusnexus/
├── database/            scripts SQL (esquema y reglas opcionales)
├── public/              HTML, CSS y JavaScript del cliente (acceso público)
├── scripts/             utilidades (creación de cuentas de prueba)
├── src/
│   ├── config/          variables de entorno, conexión MySQL y parámetros SLA
│   ├── middlewares/     validación de sesión y rol
│   ├── routes/          rutas por módulo
│   ├── services/        reglas de negocio
│   ├── repositories/    consultas SQL parametrizadas
│   ├── jobs/            tareas programadas (temporizador SLA)
│   └── views/           páginas protegidas por rol
└── uploads/             imágenes cargadas (fuera de las rutas públicas)
```

## Instalación local

1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Crear la base de datos ejecutando en MySQL Workbench:
   - `database/argusnexus_schema.sql` (obligatorio)
   - `database/argusnexus_reglas_opcionales.sql` (vista SLA y triggers de auditoría)
   - Si la base se creó antes del 16-11-2026: `database/migraciones/001_logo_clientes.sql`
3. Copiar `.env.example` como `.env` y completar los valores (`DB_PASSWORD`, `SESSION_SECRET` y las claves de prueba).
4. Crear las cuentas de prueba de ambos perfiles:
   ```bash
   npm run seed
   ```
5. Cargar los datos de demostración (clientes ficticios y las 5 plantillas base):
   ```bash
   npm run demo
   ```
6. Iniciar el servidor:
   ```bash
   npm start
   ```
   Abrir <http://localhost:3000>.

## Despliegue (alwaysdata, plan gratuito)

1. Crear la cuenta en [alwaysdata.com](https://www.alwaysdata.com) con el plan **Free**.
2. **Bases de datos → MySQL**: crear una base (por ejemplo `argusnexus_db`) y anotar el servidor
   (`mysql-usuario.alwaysdata.net`), el usuario y la contraseña.
3. **Acceso remoto → SSH**: activar el acceso y conectarse; luego clonar el repositorio:
   ```bash
   git clone https://github.com/macajuliodediaz-hash/ProyectoTitulo.git argusnexus
   cd argusnexus && npm install --omit=dev
   ```
4. Crear el archivo `.env` en el servidor (a partir de `.env.example`) con `NODE_ENV=production`,
   los datos `DB_*` del paso 2, un `SESSION_SECRET` nuevo y las claves de las cuentas de prueba.
5. Instalar la base y las cuentas:
   ```bash
   npm run instalar-bd -- --confirmar --reglas
   npm run seed
   npm run demo
   ```
6. **Web → Sitios**: crear un sitio de tipo **Node.js** con el comando `node src/server.js` y como
   directorio de trabajo la carpeta del proyecto. La app escucha en las variables `IP` y `PORT`
   que entrega alwaysdata.
7. Abrir `https://usuario.alwaysdata.net`.

## Perfiles

| Perfil | Interfaz | Funciones principales |
|---|---|---|
| Administrador | `/admin` | Dashboard, revisión, plantillas, usuarios, confidencialidad |
| Equipo | `/equipo` | Generar documentos, corregir, consultar el repositorio |

## Plantillas base

Las 5 plantillas de demostración se definieron analizando la estructura (no el contenido)
de informes reales emitidos por GEN BackOffice. Todos los datos de demostración son ficticios.

| Plantilla | Uso |
|---|---|
| Informe de diagnóstico en terreno | Visitas a faena: hallazgos, impacto y matriz de acciones |
| Informe de inspección y hallazgos | Bodega, inventario y auditorías |
| Informe ejecutivo financiero | Desempeño del período, costos y comparativos |
| Informe técnico-normativo | Marco legal, análisis y plan de intervención |
| Manual | Guías de uso y matrices de referencia |

## Parámetros del SLA

Los plazos del SLA son configurables desde `.env` y se leen solo desde `src/config/sla.js`:

| Variable | Valor | Requerimiento |
|---|---|---|
| `SLA_HORAS_PLAZO` | 24 | RF8: plazo de corrección |
| `SLA_HORAS_UMBRAL_EXTENSION` | 2 | RNF7: tiempo restante para poder pedir la extensión |
| `SLA_HORAS_EXTENSION` | 2 | RNF7: horas que agrega la extensión única |
| `SLA_HORAS_UMBRAL_CRITICO` | 2 | RNF6: tiempo restante para marcar la fila como crítica |
| `SLA_SEGUNDOS_REVISION` | 60 | RF9: frecuencia con que el servidor revisa los plazos vencidos |

## Estado de avance

- [x] Base de datos (14 tablas, 3FN)
- [x] Ingreso con credenciales cifradas y redirección por rol (RF1)
- [x] Gestión de clientes con logo para el encabezado de los documentos
- [x] Gestión de plantillas por cliente: crear, editar, reordenar secciones, dar de baja y eliminar (RF5)
- [x] Generador documental: formulario dinámico por plantilla, imágenes por sección y vista previa obligatoria validada en el servidor (RF2, RF3)
- [x] Documentos en hojas tamaño carta con el formato de GEN BackOffice (portada, control documental, encabezado con logos, pie con número de página) e impresión / PDF
- [x] Gestión de cuentas (Administrador) y Mi perfil, con política de contraseñas y bloqueo inmediato de cuentas desactivadas
- [x] Envío a revisión con bloqueo de edición y registro de auditoría (RF4, RNF8)
- [x] Revisión del Administrador: aprobar, devolver a corrección con motivo, rehabilitar bloqueados y confidencialidad (RF7, RNF4)
- [x] SLA: plazo de 24 h por corrección, extensión única de 2 h, filas críticas en rojo y bloqueo automático por tarea programada (RF8, RF9, RNF6, RNF7)
- [x] Notificaciones y bitácora de auditoría en cada cambio de estado (RNF8)
- [x] Dashboard con contadores, almacenamiento, plazos críticos y métricas mensuales por lote (RF6, RNF3)
- [x] Buscador avanzado por texto, fechas, cliente, estado y confidencialidad (RF10)
- [ ] Despliegue en hosting
