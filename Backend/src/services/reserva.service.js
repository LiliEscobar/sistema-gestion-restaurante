import { ErrorHttp } from '../utils/ErrorHttp.js';

// Reglas de reservas. Se llaman dentro de ejecutarTransaccion (Serializable).
//
// Evitar reservas simultáneas: SQL Server no tiene restricciones de exclusión por rango y Prisma no
// puede expresarlas. Se usa el mismo mecanismo que caja.service.js y compra.service.js con Prisma 7 +
// adapter-mssql: bloquear la fila de la mesa con UPDLOCK, HOLDLOCK. Dos reservas de la misma mesa se
// procesan de a una; la segunda espera y luego ve la primera al comprobar el solapamiento. Un interbloqueo
// o conflicto de serialización llega como P2034 y manejoErrores lo devuelve como 409 (reintentar).

export const reglasReserva = Object.freeze({
    duracionPorDefecto: 90,
    duracionMinima: 30,
    duracionMaxima: 240,
    anticipacionMaximaDias: 60,
    toleranciaPasadoMinutos: 15, // permite registrar a quien llega sin reserva o con unos minutos de atraso
});

export const estadosActivos = Object.freeze(['pendiente', 'confirmada', 'sentada']);
export const estados = Object.freeze([...estadosActivos, 'completada', 'cancelada', 'no_asistio']);

// Transiciones permitidas. completada, cancelada y no_asistio son finales (la reserva no se borra).
const transiciones = {
    pendiente: ['confirmada', 'sentada', 'cancelada', 'no_asistio'],
    confirmada: ['sentada', 'cancelada', 'no_asistio'],
    sentada: ['completada'],
    completada: [],
    cancelada: [],
    no_asistio: [],
};

const minuto = 60 * 1000;

export function fechaHora(valor, etiqueta) {
    const fecha = typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(valor) ? new Date(valor) : null;
    if (!fecha || Number.isNaN(fecha.getTime())) {
        throw new ErrorHttp(400, `${etiqueta} debe ser una fecha y hora ISO 8601 (AAAA-MM-DDTHH:MM)`);
    }
    return fecha;
}

export function duracion(valor) {
    if (valor === undefined || valor === null || valor === '') return reglasReserva.duracionPorDefecto;
    const minutos = Number(valor);
    if (!Number.isInteger(minutos) || minutos < reglasReserva.duracionMinima || minutos > reglasReserva.duracionMaxima) {
        throw new ErrorHttp(400, `La duración debe ser de ${reglasReserva.duracionMinima} a ${reglasReserva.duracionMaxima} minutos`);
    }
    return minutos;
}

// Valida el horario de una reserva nueva o reprogramada y devuelve [inicio, fin).
export function intervalo(inicio, minutos, ahora = new Date()) {
    if (inicio.getTime() < ahora.getTime() - reglasReserva.toleranciaPasadoMinutos * minuto) {
        throw new ErrorHttp(400, 'No se puede reservar en una fecha u hora pasada');
    }
    if (inicio.getTime() > ahora.getTime() + reglasReserva.anticipacionMaximaDias * 24 * 60 * minuto) {
        throw new ErrorHttp(400, `Solo se reserva con hasta ${reglasReserva.anticipacionMaximaDias} días de anticipación`);
    }
    return { inicio, fin: new Date(inicio.getTime() + minutos * minuto) };
}

// Bloquea la mesa hasta el fin de la transacción y valida que pueda recibir la reserva.
export async function bloquearMesa(tx, mesaId, { sucursalId, personas }) {
    const [mesa] = await tx.$queryRaw`
        SELECT m.id, m.sucursal_id AS sucursalId, m.numero, m.capacidad, m.activo, s.activo AS sucursalActiva
        FROM dbo.mesas m WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.sucursales s ON s.id = m.sucursal_id
        WHERE m.id = ${mesaId}
    `;
    if (!mesa) throw new ErrorHttp(404, 'La mesa no existe');
    if (mesa.sucursalId !== sucursalId) throw new ErrorHttp(403, 'La mesa pertenece a otra sucursal');
    if (!mesa.activo || !mesa.sucursalActiva) throw new ErrorHttp(409, 'La mesa o su sucursal están inactivas');
    if (personas > mesa.capacidad) {
        throw new ErrorHttp(409, `La mesa ${mesa.numero} admite ${mesa.capacidad} persona(s); la reserva es para ${personas}`);
    }
    return mesa;
}

// Dos intervalos [a, b) y [c, d) se solapan si a < d y c < b. Las reservas finales no ocupan la mesa.
export async function exigirDisponible(tx, { mesaId, inicio, fin, excluirId = null }) {
    const choque = await tx.reserva.findFirst({
        where: {
            mesaId,
            estado: { in: [...estadosActivos] },
            inicio: { lt: fin },
            fin: { gt: inicio },
            id: excluirId ? { not: excluirId } : undefined,
        },
        select: { id: true, inicio: true, fin: true, clienteNombre: true },
        orderBy: { inicio: 'asc' },
    });
    if (choque) {
        throw new ErrorHttp(409, 'La mesa ya tiene una reserva en ese horario', {
            reservaId: choque.id, inicio: choque.inicio, fin: choque.fin,
        });
    }
}

export async function registrarReserva(tx, datos) {
    await bloquearMesa(tx, datos.mesaId, datos);
    await exigirDisponible(tx, datos);
    return tx.reserva.create({ data: datos });
}

export function exigirTransicion(actual, nuevo, { inicio }, ahora = new Date()) {
    if (!transiciones[actual]?.includes(nuevo)) {
        throw new ErrorHttp(409, `No se puede pasar una reserva de "${actual}" a "${nuevo}"`);
    }
    if (nuevo === 'no_asistio' && ahora < inicio) {
        throw new ErrorHttp(409, 'Solo se marca "no asistió" después de la hora de la reserva');
    }
}
