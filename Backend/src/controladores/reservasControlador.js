import prisma from '../config/prisma.js';
import { ErrorHttp } from '../utils/ErrorHttp.js';
import { ejecutarTransaccion } from '../utils/transaccion.js';
import { filtroSucursal, sucursalOperacion, verificarSucursal } from '../utils/alcanceSucursal.js';
import {
    booleanoOpcional, enteroOpcional, enteroPositivo, limite, opcion, textoOpcional, textoRequerido,
} from '../utils/validacion.js';
import {
    bloquearMesa, duracion, estados, estadosActivos, exigirDisponible, exigirTransicion, fechaHora, intervalo, registrarReserva,
} from '../services/reserva.service.js';

const incluirReserva = {
    mesa: { select: { id: true, numero: true, capacidad: true } },
    sucursal: { select: { id: true, nombre: true } },
    usuario: { select: { id: true, nombreCompleto: true } },
};

function personas(valor) {
    const cantidad = enteroPositivo(valor, 'La cantidad de personas');
    if (cantidad > 50) throw new ErrorHttp(400, 'La cantidad de personas admite como máximo 50');
    return cantidad;
}

function capacidad(valor) {
    const cantidad = enteroPositivo(valor, 'La capacidad');
    if (cantidad > 50) throw new ErrorHttp(400, 'La capacidad admite como máximo 50');
    return cantidad;
}

function telefono(valor) {
    const texto = textoOpcional(valor, 20, 'El teléfono');
    if (texto && !/^[\d\s+()-]+$/.test(texto)) throw new ErrorHttp(400, 'El teléfono solo admite dígitos, espacios y + ( ) -');
    return texto;
}

// ----- Mesas -----

// GET /api/mesas?sucursalId=&activo=
export async function listarMesas(peticion, respuesta) {
    const activo = booleanoOpcional(peticion.query.activo, 'El filtro activo');
    const ahora = new Date();
    const mesas = await prisma.mesa.findMany({
        where: { sucursalId: filtroSucursal(peticion.auth, peticion.query.sucursalId), activo: activo ?? undefined },
        include: {
            sucursal: { select: { nombre: true } },
            // Reserva que ocupa la mesa ahora (estado sentada o en curso), para mostrar su estado.
            reservas: {
                where: { estado: { in: [...estadosActivos] }, inicio: { lte: ahora }, fin: { gt: ahora } },
                select: { id: true, estado: true, clienteNombre: true, fin: true },
                take: 1,
            },
        },
        orderBy: [{ sucursalId: 'asc' }, { numero: 'asc' }],
    });
    return respuesta.json({
        mesas: mesas.map(({ reservas, ...mesa }) => ({ ...mesa, reservaActual: reservas[0] ?? null })),
    });
}

// POST /api/mesas { sucursalId?, numero, capacidad }
export async function crearMesa(peticion, respuesta) {
    const cuerpo = peticion.body ?? {};
    const sucursalId = sucursalOperacion(peticion.auth, cuerpo.sucursalId);
    const numero = textoRequerido(cuerpo.numero, 20, 'El número de mesa');
    const datos = { sucursalId, numero, capacidad: capacidad(cuerpo.capacidad) };
    const mesa = await ejecutarTransaccion(async (tx) => {
        const sucursal = await tx.sucursal.findUnique({ where: { id: sucursalId }, select: { activo: true } });
        if (!sucursal?.activo) throw new ErrorHttp(400, 'La sucursal no existe o está inactiva');
        if (await tx.mesa.findUnique({ where: { sucursalId_numero: { sucursalId, numero } }, select: { id: true } })) {
            throw new ErrorHttp(409, `Ya existe la mesa ${numero} en esta sucursal`);
        }
        return tx.mesa.create({ data: datos });
    });
    return respuesta.status(201).json({ mesa });
}

// PATCH /api/mesas/:id { numero?, capacidad?, activo? } — la baja es activo = false.
export async function actualizarMesa(peticion, respuesta) {
    const id = enteroPositivo(peticion.params.id, 'El id de la mesa');
    const cuerpo = peticion.body ?? {};
    const mesa = await ejecutarTransaccion(async (tx) => {
        const actual = await tx.mesa.findUnique({ where: { id } });
        if (!actual) throw new ErrorHttp(404, 'La mesa no existe');
        verificarSucursal(peticion.auth, actual.sucursalId);

        const datos = {};
        if (cuerpo.numero !== undefined) datos.numero = textoRequerido(cuerpo.numero, 20, 'El número de mesa');
        if (cuerpo.capacidad !== undefined) datos.capacidad = capacidad(cuerpo.capacidad);
        const activo = booleanoOpcional(cuerpo.activo, 'El estado activo');
        if (activo !== null) datos.activo = activo;
        if (!Object.keys(datos).length) throw new ErrorHttp(400, 'No hay datos para actualizar');

        if (datos.numero && datos.numero !== actual.numero &&
            await tx.mesa.findUnique({ where: { sucursalId_numero: { sucursalId: actual.sucursalId, numero: datos.numero } }, select: { id: true } })) {
            throw new ErrorHttp(409, `Ya existe la mesa ${datos.numero} en esta sucursal`);
        }
        // Las reservas futuras activas deben seguir siendo válidas.
        const futuras = { mesaId: id, estado: { in: [...estadosActivos] }, fin: { gt: new Date() } };
        if (datos.activo === false && await tx.reserva.count({ where: futuras })) {
            throw new ErrorHttp(409, 'La mesa tiene reservas activas pendientes; cancélalas o muévelas antes de desactivarla');
        }
        if (datos.capacidad !== undefined && await tx.reserva.count({ where: { ...futuras, personas: { gt: datos.capacidad } } })) {
            throw new ErrorHttp(409, 'Hay reservas activas con más personas que la nueva capacidad');
        }
        return tx.mesa.update({ where: { id }, data: datos });
    });
    return respuesta.json({ mesa });
}

// ----- Reservas -----

// GET /api/reservas?sucursalId=&desde=&hasta=&estado=&mesaId= (desde/hasta: fecha y hora ISO)
export async function listarReservas(peticion, respuesta) {
    const { query } = peticion;
    const desde = query.desde ? fechaHora(query.desde, 'La fecha desde') : new Date(new Date().setHours(0, 0, 0, 0));
    const hasta = query.hasta ? fechaHora(query.hasta, 'La fecha hasta') : new Date(desde.getTime() + 14 * 24 * 60 * 60 * 1000);
    if (hasta <= desde) throw new ErrorHttp(400, 'La fecha hasta debe ser posterior a la fecha desde');
    const reservas = await prisma.reserva.findMany({
        where: {
            sucursalId: filtroSucursal(peticion.auth, query.sucursalId),
            mesaId: enteroOpcional(query.mesaId, 'La mesa') ?? undefined,
            estado: query.estado ? opcion(query.estado, estados, 'El estado') : undefined,
            inicio: { lt: hasta },
            fin: { gt: desde },
        },
        include: incluirReserva,
        orderBy: { inicio: 'asc' },
        take: limite(query.limite, 100, 200),
    });
    return respuesta.json({ reservas });
}

// GET /api/reservas/disponibilidad?sucursalId=&inicio=&duracionMinutos=&personas=
// Consulta informativa (sin bloqueo): la garantía contra choques está en el registro.
export async function consultarDisponibilidad(peticion, respuesta) {
    const { query } = peticion;
    const sucursalId = sucursalOperacion(peticion.auth, query.sucursalId);
    const { inicio, fin } = intervalo(fechaHora(query.inicio, 'El inicio'), duracion(query.duracionMinutos));
    const cantidad = personas(query.personas);
    const mesas = await prisma.mesa.findMany({
        where: {
            sucursalId,
            activo: true,
            capacidad: { gte: cantidad },
            reservas: { none: { estado: { in: [...estadosActivos] }, inicio: { lt: fin }, fin: { gt: inicio } } },
        },
        orderBy: [{ capacidad: 'asc' }, { numero: 'asc' }],
    });
    return respuesta.json({ inicio, fin, personas: cantidad, mesas });
}

// POST /api/reservas { sucursalId?, mesaId, clienteNombre, clienteTelefono?, personas, inicio, duracionMinutos?, notas? }
export async function crearReserva(peticion, respuesta) {
    const cuerpo = peticion.body ?? {};
    const sucursalId = sucursalOperacion(peticion.auth, cuerpo.sucursalId);
    const datos = {
        sucursalId,
        mesaId: enteroPositivo(cuerpo.mesaId, 'La mesa'),
        usuarioId: peticion.auth.idUsuario,
        clienteNombre: textoRequerido(cuerpo.clienteNombre, 150, 'El nombre del cliente'),
        clienteTelefono: telefono(cuerpo.clienteTelefono),
        personas: personas(cuerpo.personas),
        notas: textoOpcional(cuerpo.notas, 300, 'Las notas'),
        ...intervalo(fechaHora(cuerpo.inicio, 'El inicio'), duracion(cuerpo.duracionMinutos)),
    };
    const { id } = await ejecutarTransaccion((tx) => registrarReserva(tx, datos));
    const reserva = await prisma.reserva.findUnique({ where: { id }, include: incluirReserva });
    return respuesta.status(201).location(`/api/reservas/${id}`).json({ reserva });
}

async function reservaAutorizada(tx, peticion) {
    const id = enteroPositivo(peticion.params.id, 'El id de la reserva');
    const reserva = await tx.reserva.findUnique({ where: { id } });
    if (!reserva) throw new ErrorHttp(404, 'La reserva no existe');
    verificarSucursal(peticion.auth, reserva.sucursalId);
    return reserva;
}

// PATCH /api/reservas/:id { mesaId?, inicio?, duracionMinutos?, personas?, clienteNombre?, clienteTelefono?, notas? }
// Solo reservas pendientes o confirmadas. La sucursal no cambia.
export async function actualizarReserva(peticion, respuesta) {
    const cuerpo = peticion.body ?? {};
    const id = await ejecutarTransaccion(async (tx) => {
        const actual = await reservaAutorizada(tx, peticion);
        if (!['pendiente', 'confirmada'].includes(actual.estado)) {
            throw new ErrorHttp(409, `Una reserva "${actual.estado}" ya no se puede modificar`);
        }
        const datos = {};
        if (cuerpo.clienteNombre !== undefined) datos.clienteNombre = textoRequerido(cuerpo.clienteNombre, 150, 'El nombre del cliente');
        if (cuerpo.clienteTelefono !== undefined) datos.clienteTelefono = telefono(cuerpo.clienteTelefono);
        if (cuerpo.notas !== undefined) datos.notas = textoOpcional(cuerpo.notas, 300, 'Las notas');
        if (cuerpo.personas !== undefined) datos.personas = personas(cuerpo.personas);
        if (cuerpo.mesaId !== undefined) datos.mesaId = enteroPositivo(cuerpo.mesaId, 'La mesa');
        if (cuerpo.inicio !== undefined || cuerpo.duracionMinutos !== undefined) {
            const minutosActuales = Math.round((actual.fin - actual.inicio) / 60000);
            const inicio = cuerpo.inicio !== undefined ? fechaHora(cuerpo.inicio, 'El inicio') : actual.inicio;
            Object.assign(datos, intervalo(inicio, cuerpo.duracionMinutos !== undefined ? duracion(cuerpo.duracionMinutos) : minutosActuales));
        }
        if (!Object.keys(datos).length) throw new ErrorHttp(400, 'No hay datos para actualizar');

        // Si cambia mesa, horario o personas, se vuelve a bloquear la mesa destino y a comprobar choques.
        if (datos.mesaId !== undefined || datos.inicio !== undefined || datos.personas !== undefined) {
            const mesaId = datos.mesaId ?? actual.mesaId;
            await bloquearMesa(tx, mesaId, { sucursalId: actual.sucursalId, personas: datos.personas ?? actual.personas });
            await exigirDisponible(tx, { mesaId, inicio: datos.inicio ?? actual.inicio, fin: datos.fin ?? actual.fin, excluirId: actual.id });
        }
        await tx.reserva.update({ where: { id: actual.id }, data: datos });
        return actual.id;
    });
    const reserva = await prisma.reserva.findUnique({ where: { id }, include: incluirReserva });
    return respuesta.json({ reserva });
}

// POST /api/reservas/:id/estado { estado } — confirmar, sentar, completar, cancelar o marcar no asistió.
export async function cambiarEstadoReserva(peticion, respuesta) {
    const estado = opcion(peticion.body?.estado, estados, 'El estado');
    const id = await ejecutarTransaccion(async (tx) => {
        const actual = await reservaAutorizada(tx, peticion);
        exigirTransicion(actual.estado, estado, actual);
        await tx.reserva.update({ where: { id: actual.id }, data: { estado } });
        return actual.id;
    });
    const reserva = await prisma.reserva.findUnique({ where: { id }, include: incluirReserva });
    return respuesta.json({ reserva });
}
