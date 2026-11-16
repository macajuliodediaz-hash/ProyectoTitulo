-- =====================================================================
-- ArgusNexus - Sistema web de gestión y estandarización documental
-- Cliente: GEN BackOffice | Proyecto de título (Iplacex) | Motor: MySQL (InnoDB)
-- Modelo relacional en Tercera Forma Normal (3FN) - 14 tablas
-- Fecha de diseño: 04/11/2026
-- =====================================================================
CREATE DATABASE IF NOT EXISTS argusnexus
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE argusnexus;
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS metricas_mensuales;
DROP TABLE IF EXISTS notificaciones;
DROP TABLE IF EXISTS auditoria_eventos;
DROP TABLE IF EXISTS tipos_evento;
DROP TABLE IF EXISTS historial_sla;
DROP TABLE IF EXISTS imagenes_documento;
DROP TABLE IF EXISTS contenido_documento;
DROP TABLE IF EXISTS documentos;
DROP TABLE IF EXISTS estados_documento;
DROP TABLE IF EXISTS plantilla_secciones;
DROP TABLE IF EXISTS plantillas;
DROP TABLE IF EXISTS clientes;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS roles;
SET FOREIGN_KEY_CHECKS = 1;
-- Catálogo de perfiles de usuario del sistema (Administrador y Equipo).
CREATE TABLE roles (
  id_rol                 INT NOT NULL AUTO_INCREMENT,
  nombre_rol             VARCHAR(30) NOT NULL,
  descripcion            VARCHAR(120) NOT NULL,
  PRIMARY KEY (id_rol),
  CONSTRAINT uq_roles_nombre_rol UNIQUE (nombre_rol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Cuentas de usuario con credenciales cifradas y rol asignado.
CREATE TABLE usuarios (
  id_usuario             INT NOT NULL AUTO_INCREMENT,
  id_rol                 INT NOT NULL,
  nombre                 VARCHAR(50) NOT NULL,
  apellido               VARCHAR(50) NOT NULL,
  correo                 VARCHAR(100) NOT NULL,
  password_hash          VARCHAR(255) NOT NULL,
  activo                 TINYINT(1) NOT NULL DEFAULT 1,
  fecha_creacion         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_acceso          DATETIME NULL,
  PRIMARY KEY (id_usuario),
  CONSTRAINT uq_usuarios_correo UNIQUE (correo),
  INDEX ix_usuarios_rol (id_rol),
  CONSTRAINT fk_usuarios_id_rol FOREIGN KEY (id_rol) REFERENCES roles (id_rol) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Organizaciones cliente de GEN BackOffice para las cuales se generan documentos.
CREATE TABLE clientes (
  id_cliente             INT NOT NULL AUTO_INCREMENT,
  nombre_cliente         VARCHAR(100) NOT NULL,
  activo                 TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id_cliente),
  CONSTRAINT uq_clientes_nombre_cliente UNIQUE (nombre_cliente)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Formatos documentales estructurados, definidos por el Administrador para cada cliente.
CREATE TABLE plantillas (
  id_plantilla           INT NOT NULL AUTO_INCREMENT,
  id_cliente             INT NOT NULL,
  id_usuario_creador     INT NOT NULL,
  nombre_plantilla       VARCHAR(100) NOT NULL,
  activa                 TINYINT(1) NOT NULL DEFAULT 1,
  fecha_creacion         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_plantilla),
  CONSTRAINT uq_plantilla_cliente_nombre UNIQUE (id_cliente, nombre_plantilla),
  INDEX ix_plantillas_usuario (id_usuario_creador),
  CONSTRAINT fk_plantillas_id_cliente FOREIGN KEY (id_cliente) REFERENCES clientes (id_cliente) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_plantillas_id_usuario_creador FOREIGN KEY (id_usuario_creador) REFERENCES usuarios (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Secciones ordenadas que componen cada plantilla; definen los campos del formulario dinámico.
CREATE TABLE plantilla_secciones (
  id_seccion             INT NOT NULL AUTO_INCREMENT,
  id_plantilla           INT NOT NULL,
  nombre_seccion         VARCHAR(80) NOT NULL,
  orden                  SMALLINT NOT NULL,
  es_obligatoria         TINYINT(1) NOT NULL DEFAULT 1,
  permite_imagenes       TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id_seccion),
  CONSTRAINT uq_seccion_plantilla_orden UNIQUE (id_plantilla, orden),
  CONSTRAINT fk_plantilla_secciones_id_plantilla FOREIGN KEY (id_plantilla) REFERENCES plantillas (id_plantilla) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Estados paramétricos del flujo de trabajo de un documento.
CREATE TABLE estados_documento (
  id_estado              INT NOT NULL AUTO_INCREMENT,
  nombre_estado          VARCHAR(30) NOT NULL,
  permite_edicion_autor  TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id_estado),
  CONSTRAINT uq_estados_documento_nombre_estado UNIQUE (nombre_estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Entidad transaccional principal: metadatos de cada documento generado por el equipo.
CREATE TABLE documentos (
  id_documento           INT NOT NULL AUTO_INCREMENT,
  codigo_documento       VARCHAR(20) NOT NULL,
  id_plantilla           INT NOT NULL,
  id_estado              INT NOT NULL,
  id_autor               INT NOT NULL,
  titulo                 VARCHAR(150) NOT NULL,
  fecha_creacion         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  es_confidencial        TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id_documento),
  CONSTRAINT uq_documentos_codigo_documento UNIQUE (codigo_documento),
  INDEX ix_documentos_plantilla (id_plantilla),
  INDEX ix_documentos_estado (id_estado),
  INDEX ix_documentos_autor (id_autor),
  INDEX ix_documentos_fecha (fecha_creacion),
  INDEX ix_documentos_confidencial (es_confidencial),
  CONSTRAINT fk_documentos_id_plantilla FOREIGN KEY (id_plantilla) REFERENCES plantillas (id_plantilla) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_documentos_id_estado FOREIGN KEY (id_estado) REFERENCES estados_documento (id_estado) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_documentos_id_autor FOREIGN KEY (id_autor) REFERENCES usuarios (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Texto ingresado en cada sección de un documento; aísla los datos pesados de la entidad padre.
CREATE TABLE contenido_documento (
  id_contenido           INT NOT NULL AUTO_INCREMENT,
  id_documento           INT NOT NULL,
  id_seccion             INT NOT NULL,
  texto_ingresado        TEXT NULL,
  PRIMARY KEY (id_contenido),
  CONSTRAINT uq_contenido_doc_seccion UNIQUE (id_documento, id_seccion),
  INDEX ix_contenido_seccion (id_seccion),
  CONSTRAINT fk_contenido_documento_id_documento FOREIGN KEY (id_documento) REFERENCES documentos (id_documento) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_contenido_documento_id_seccion FOREIGN KEY (id_seccion) REFERENCES plantilla_secciones (id_seccion) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Imágenes adjuntas a una sección de un documento (una sección puede tener varias).
CREATE TABLE imagenes_documento (
  id_imagen              INT NOT NULL AUTO_INCREMENT,
  id_contenido           INT NOT NULL,
  nombre_archivo         VARCHAR(150) NOT NULL,
  ruta_imagen            VARCHAR(255) NOT NULL,
  fecha_carga            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_imagen),
  INDEX ix_imagenes_contenido (id_contenido),
  CONSTRAINT fk_imagenes_documento_id_contenido FOREIGN KEY (id_contenido) REFERENCES contenido_documento (id_contenido) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Registro de cada devolución a corrección: plazo SLA, extensión única e iteración del documento.
CREATE TABLE historial_sla (
  id_sla                 INT NOT NULL AUTO_INCREMENT,
  id_documento           INT NOT NULL,
  id_revisor             INT NOT NULL,
  num_iteracion          INT NOT NULL,
  motivo_correccion      VARCHAR(255) NOT NULL,
  fecha_inicio           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  horas_plazo            SMALLINT NOT NULL DEFAULT 24,
  fecha_extension        DATETIME NULL,
  horas_extension        SMALLINT NOT NULL DEFAULT 0,
  fecha_cierre           DATETIME NULL,
  PRIMARY KEY (id_sla),
  CONSTRAINT uq_sla_doc_iteracion UNIQUE (id_documento, num_iteracion),
  INDEX ix_sla_revisor (id_revisor),
  INDEX ix_sla_inicio (fecha_inicio),
  CONSTRAINT fk_historial_sla_id_documento FOREIGN KEY (id_documento) REFERENCES documentos (id_documento) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_historial_sla_id_revisor FOREIGN KEY (id_revisor) REFERENCES usuarios (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Catálogo de tipos de evento auditables.
CREATE TABLE tipos_evento (
  id_tipo_evento         INT NOT NULL AUTO_INCREMENT,
  nombre_evento          VARCHAR(40) NOT NULL,
  PRIMARY KEY (id_tipo_evento),
  CONSTRAINT uq_tipos_evento_nombre_evento UNIQUE (nombre_evento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Bitácora de auditoría: cada cambio de estado genera un registro que no se modifica ni elimina.
CREATE TABLE auditoria_eventos (
  id_evento              BIGINT NOT NULL AUTO_INCREMENT,
  id_documento           INT NOT NULL,
  id_usuario             INT NULL,
  id_tipo_evento         INT NOT NULL,
  id_estado_resultante   INT NULL,
  fecha_evento           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  detalle                VARCHAR(255) NULL,
  PRIMARY KEY (id_evento),
  INDEX ix_auditoria_documento (id_documento),
  INDEX ix_auditoria_usuario (id_usuario),
  INDEX ix_auditoria_tipo (id_tipo_evento),
  INDEX ix_auditoria_fecha (fecha_evento),
  CONSTRAINT fk_auditoria_eventos_id_documento FOREIGN KEY (id_documento) REFERENCES documentos (id_documento) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_auditoria_eventos_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_auditoria_eventos_id_tipo_evento FOREIGN KEY (id_tipo_evento) REFERENCES tipos_evento (id_tipo_evento) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_auditoria_eventos_id_estado_resultante FOREIGN KEY (id_estado_resultante) REFERENCES estados_documento (id_estado) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Avisos generados por el sistema (documento devuelto, SLA próximo a vencer, documento bloqueado).
CREATE TABLE notificaciones (
  id_notificacion        INT NOT NULL AUTO_INCREMENT,
  id_usuario             INT NOT NULL,
  id_documento           INT NOT NULL,
  mensaje                VARCHAR(255) NOT NULL,
  fecha_envio            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  leida                  TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id_notificacion),
  INDEX ix_notif_usuario (id_usuario, leida),
  INDEX ix_notif_documento (id_documento),
  CONSTRAINT fk_notificaciones_id_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_notificaciones_id_documento FOREIGN KEY (id_documento) REFERENCES documentos (id_documento) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Indicadores consolidados por cliente y mes, calculados por lote para aliviar el Dashboard.
CREATE TABLE metricas_mensuales (
  id_metrica             INT NOT NULL AUTO_INCREMENT,
  id_cliente             INT NOT NULL,
  anio                   SMALLINT NOT NULL,
  mes                    TINYINT NOT NULL,
  total_emitidos         INT NOT NULL DEFAULT 0,
  total_rechazados       INT NOT NULL DEFAULT 0,
  sla_cumplidos          INT NOT NULL DEFAULT 0,
  sla_incumplidos        INT NOT NULL DEFAULT 0,
  fecha_calculo          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_metrica),
  CONSTRAINT uq_metrica_cliente_periodo UNIQUE (id_cliente, anio, mes),
  CONSTRAINT fk_metricas_mensuales_id_cliente FOREIGN KEY (id_cliente) REFERENCES clientes (id_cliente) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Datos paramétricos iniciales (catálogos)
INSERT INTO roles (nombre_rol, descripcion) VALUES
  ('Administrador', 'Revisa, aprueba o rechaza documentos; gestiona plantillas, confidencialidad y métricas'),
  ('Equipo', 'Genera documentos, gestiona correcciones y consulta el repositorio general');
INSERT INTO estados_documento (nombre_estado, permite_edicion_autor) VALUES
  ('Borrador', 1),
  ('En Revisión', 0),
  ('Aprobado', 0),
  ('En Corrección', 1),
  ('Bloqueado_SLA', 0);
INSERT INTO tipos_evento (nombre_evento) VALUES
  ('Creación'),
  ('Envío a revisión'),
  ('Aprobación'),
  ('Rechazo'),
  ('Extensión SLA'),
  ('Bloqueo SLA'),
  ('Cambio de confidencialidad');
