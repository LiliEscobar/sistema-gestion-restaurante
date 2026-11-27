import prisma from '../config/prisma.js';
import { ErrorHttp } from '../utils/ErrorHttp.js';
import { ejecutarTransaccion } from '../utils/transaccion.js';
import { esAdmin } from '../utils/alcanceSucursal.js';
import { booleanoOpcional, enteroPositivo, textoRequerido } from '../utils/validacion.js';

// GET /api/sucursales — para los selectores del frontend.
// ?todas=true incluye las inactivas (solo administrador, para la pantalla de Administración).
export async function listarSucursales(peticion, respuesta) {
    const todas = booleanoOpcional(peticion.query?.todas, 'El filtro todas') && esAdmin(peticion.auth);
    const sucursales = await prisma.sucursal.findMany({ where: todas ? undefined : { activo: true }, orderBy: { nombre: 'asc' } });
    return respuesta.json({ sucursales });
}

// POST /api/sucursales { nombre } — crea la sucursal con existencia 0 de cada insumo activo,
// igual que crearInsumo hace con cada sucursal activa.
export async function crearSucursal(peticion, respuesta) {
    const nombre = textoRequerido(peticion.body?.nombre, 100, 'El nombre');
    const sucursal = await ejecutarTransaccion(async (tx) => {
        if (await tx.sucursal.findUnique({ where: { nombre }, select: { id: true } })) {
            throw new ErrorHttp(409, 'Ya existe una sucursal con ese nombre');
        }
        const creada = await tx.sucursal.create({ data: { nombre } });
        const insumos = await tx.insumo.findMany({ where: { activo: true }, select: { id: true } });
        if (insumos.length) {
            await tx.existenciaSucursal.createMany({ data: insumos.map(({ id }) => ({ sucursalId: creada.id, insumoId: id })) });
        }
        return creada;
    });
    return respuesta.status(201).json({ sucursal });
}

// PATCH /api/sucursales/:id { nombre?, activo? } — la baja es activo = false (no se borran sucursales).
export async function actualizarSucursal(peticion, respuesta) {
    const id = enteroPositivo(peticion.params.id, 'El id de la sucursal');
    const datos = {};
    if (peticion.body?.nombre !== undefined) datos.nombre = textoRequerido(peticion.body.nombre, 100, 'El nombre');
    const activo = booleanoOpcional(peticion.body?.activo, 'El estado activo');
    if (activo !== null) datos.activo = activo;
    if (!Object.keys(datos).length) throw new ErrorHttp(400, 'No hay datos para actualizar');

    const sucursal = await ejecutarTransaccion(async (tx) => {
        const actual = await tx.sucursal.findUnique({ where: { id } });
        if (!actual) throw new ErrorHttp(404, 'La sucursal no existe');
        if (datos.nombre && datos.nombre !== actual.nombre &&
            await tx.sucursal.findUnique({ where: { nombre: datos.nombre }, select: { id: true } })) {
            throw new ErrorHttp(409, 'Ya existe una sucursal con ese nombre');
        }
        if (datos.activo === false && actual.activo) {
            const abiertos = await tx.turnoCaja.count({ where: { sucursalId: id, fechaCierre: null } });
            if (abiertos) throw new ErrorHttp(409, `La sucursal tiene ${abiertos} turno(s) de caja abierto(s); ciérralos antes de desactivarla`);
        }
        return tx.sucursal.update({ where: { id }, data: datos });
    });
    return respuesta.json({ sucursal });
}
