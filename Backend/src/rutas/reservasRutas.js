import { Router } from 'express';
import {
    actualizarMesa, actualizarReserva, cambiarEstadoReserva, consultarDisponibilidad, crearMesa, crearReserva,
    listarMesas, listarReservas,
} from '../controladores/reservasControlador.js';
import { requerirRol } from '../middleware/autenticacion.js';

const migracion = '20261127180000_reservas_mesas';

// Mientras la migración no esté aplicada, las tablas mesas/reservas no existen. Importar estas rutas no
// consulta la base, así que el servidor y los demás módulos arrancan igual; aquí ese error concreto se
// devuelve como 503 con un mensaje claro en lugar de un 500 genérico.
function tablaFaltante(error) {
    const texto = `${error?.message ?? ''} ${error?.meta?.message ?? ''} ${error?.cause?.message ?? ''}`;
    return error?.code === 'P2021' || /Invalid object name '(dbo\.)?(mesas|reservas)'/i.test(texto);
}
function sinMigracion(error, _peticion, respuesta, siguiente) {
    if (!tablaFaltante(error)) return siguiente(error);
    return respuesta.status(503).json({ mensaje: `El módulo de reservas no está disponible: falta aplicar la migración ${migracion}.` });
}

const atencion = requerirRol('admin', 'gerente', 'cajero');
const gestion = requerirRol('admin', 'gerente');

// Mesas: consulta para atención; alta, edición y baja para admin y gerente (su sucursal).
export const rutasMesas = Router();
rutasMesas.get('/', atencion, listarMesas);
rutasMesas.post('/', gestion, crearMesa);
rutasMesas.patch('/:id', gestion, actualizarMesa);
rutasMesas.use(sinMigracion);

// Reservas: admin, gerente y cajero de la sucursal. Sin borrado: se cancela con estado.
export const rutasReservas = Router();
rutasReservas.use(atencion);
rutasReservas.get('/disponibilidad', consultarDisponibilidad); // antes de '/:id'
rutasReservas.get('/', listarReservas);
rutasReservas.post('/', crearReserva);
rutasReservas.patch('/:id', actualizarReserva);
rutasReservas.post('/:id/estado', cambiarEstadoReserva);
rutasReservas.use(sinMigracion);
