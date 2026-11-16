// Error de negocio con código HTTP y mensaje apto para mostrar al usuario.
class ErrorNegocio extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

module.exports = { ErrorNegocio };
