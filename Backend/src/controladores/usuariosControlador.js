import bcrypt from 'bcryptjs';
import prisma from '../config/prisma.js';
import { ErrorHttp } from '../utils/ErrorHttp.js';
import { ejecutarTransaccion } from '../utils/transaccion.js';
import { booleanoOpcional, enteroOpcional, enteroPositivo, textoRequerido } from '../utils/validacion.js';

// Cuentas de acceso al sistema. Solo el administrador las gestiona (ver usuariosRutas.js).
// No hay borrado: la baja es activo = false (las ventas y turnos referencian al usuario).

const seleccion = {
    id: true, nombreCompleto: true, correo: true, activo: true, creadoEn: true, sucursalId: true,
    rol: { select: { id: true, codigo: true, nombre: true } },
    sucursal: { select: { id: true, nombre: true } },
};

function correoValido(valor) {
    const correo = textoRequerido(valor, 150, 'El correo').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ErrorHttp(400, 'El correo no tiene un formato válido');
    return correo;
}

function passwordValida(valor) {
    if (typeof valor !== 'string' || valor.length < 8 || valor.length > 72) {
        throw new ErrorHttp(400, 'La contraseña debe tener entre 8 y 72 caracteres');
    }
    return valor;
}

async function rolPorCodigo(tx, codigo) {
    const rol = await tx.rol.findUnique({ where: { codigo: textoRequerido(codigo, 30, 'El rol') } });
    if (!rol) throw new ErrorHttp(400, 'El rol no existe');
    return rol;
}

// Los roles distintos de admin operan siempre en su sucursal (alcanceSucursal.js), así que la necesitan.
async function validarSucursal(tx, codigoRol, sucursalId) {
    if (sucursalId === null) {
        if (codigoRol !== 'admin') throw new ErrorHttp(400, 'Los roles distintos de administrador requieren una sucursal');
        return;
    }
    const sucursal = await tx.sucursal.findUnique({ where: { id: sucursalId }, select: { activo: true } });
    if (!sucursal?.activo) throw new ErrorHttp(400, 'La sucursal no existe o está inactiva');
}

// GET /api/usuarios/roles
export async function listarRoles(_peticion, respuesta) {
    const roles = await prisma.rol.findMany({ orderBy: { id: 'asc' } });
    return respuesta.json({ roles });
}

// GET /api/usuarios?sucursalId=&rol=&activo=
export async function listarUsuarios(peticion, respuesta) {
    const activo = booleanoOpcional(peticion.query.activo, 'El filtro activo');
    const sucursalId = enteroOpcional(peticion.query.sucursalId, 'La sucursal');
    const usuarios = await prisma.usuario.findMany({
        where: {
            activo: activo ?? undefined,
            sucursalId: sucursalId ?? undefined,
            rol: peticion.query.rol ? { codigo: String(peticion.query.rol) } : undefined,
        },
        select: seleccion,
        orderBy: { nombreCompleto: 'asc' },
    });
    return respuesta.json({ usuarios });
}

// POST /api/usuarios { nombreCompleto, correo, password, rol, sucursalId }
export async function crearUsuario(peticion, respuesta) {
    const cuerpo = peticion.body ?? {};
    const nombreCompleto = textoRequerido(cuerpo.nombreCompleto, 150, 'El nombre completo');
    const correo = correoValido(cuerpo.correo);
    const password = passwordValida(cuerpo.password);
    const sucursalId = enteroOpcional(cuerpo.sucursalId, 'La sucursal');

    const usuario = await ejecutarTransaccion(async (tx) => {
        const rol = await rolPorCodigo(tx, cuerpo.rol);
        await validarSucursal(tx, rol.codigo, sucursalId);
        if (await tx.usuario.findUnique({ where: { correo }, select: { id: true } })) {
            throw new ErrorHttp(409, 'Ya existe un usuario con ese correo');
        }
        return tx.usuario.create({
            data: { nombreCompleto, correo, passwordHash: await bcrypt.hash(password, 10), rolId: rol.id, sucursalId },
            select: seleccion,
        });
    });
    return respuesta.status(201).json({ usuario });
}

// PATCH /api/usuarios/:id { nombreCompleto?, rol?, sucursalId?, activo? }
export async function actualizarUsuario(peticion, respuesta) {
    const id = enteroPositivo(peticion.params.id, 'El id del usuario');
    const cuerpo = peticion.body ?? {};
    const propio = id === peticion.auth.idUsuario;

    const usuario = await ejecutarTransaccion(async (tx) => {
        const actual = await tx.usuario.findUnique({ where: { id }, include: { rol: true } });
        if (!actual) throw new ErrorHttp(404, 'El usuario no existe');

        const datos = {};
        if (cuerpo.nombreCompleto !== undefined) datos.nombreCompleto = textoRequerido(cuerpo.nombreCompleto, 150, 'El nombre completo');
        let codigoRol = actual.rol.codigo;
        if (cuerpo.rol !== undefined && cuerpo.rol !== actual.rol.codigo) {
            if (propio) throw new ErrorHttp(409, 'No puedes cambiar tu propio rol');
            const rol = await rolPorCodigo(tx, cuerpo.rol);
            datos.rolId = rol.id;
            codigoRol = rol.codigo;
        }
        let sucursalId = actual.sucursalId;
        if (cuerpo.sucursalId !== undefined) {
            sucursalId = enteroOpcional(cuerpo.sucursalId, 'La sucursal');
            datos.sucursalId = sucursalId;
        }
        const activo = booleanoOpcional(cuerpo.activo, 'El estado activo');
        if (activo !== null) {
            if (propio && !activo) throw new ErrorHttp(409, 'No puedes desactivar tu propia cuenta');
            datos.activo = activo;
        }
        if (!Object.keys(datos).length) throw new ErrorHttp(400, 'No hay datos para actualizar');
        if (datos.rolId !== undefined || datos.sucursalId !== undefined) await validarSucursal(tx, codigoRol, sucursalId);

        // Siempre debe quedar al menos un administrador activo.
        const dejaDeSerAdmin = actual.rol.codigo === 'admin' && actual.activo && (codigoRol !== 'admin' || datos.activo === false);
        if (dejaDeSerAdmin) {
            const otros = await tx.usuario.count({ where: { id: { not: id }, activo: true, rol: { codigo: 'admin' } } });
            if (!otros) throw new ErrorHttp(409, 'Debe quedar al menos un administrador activo');
        }
        return tx.usuario.update({ where: { id }, data: datos, select: seleccion });
    });
    return respuesta.json({ usuario });
}

// POST /api/usuarios/:id/password { password } — restablecimiento por el administrador.
export async function restablecerPassword(peticion, respuesta) {
    const id = enteroPositivo(peticion.params.id, 'El id del usuario');
    const password = passwordValida(peticion.body?.password);
    const existe = await prisma.usuario.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw new ErrorHttp(404, 'El usuario no existe');
    await prisma.usuario.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    return respuesta.json({ mensaje: 'Contraseña restablecida' });
}
