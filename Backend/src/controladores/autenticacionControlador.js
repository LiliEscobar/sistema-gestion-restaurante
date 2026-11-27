import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import { ErrorHttp } from '../utils/ErrorHttp.js';
import { huellaPassword } from '../utils/sesion.js';

export async function iniciarSesion(peticion, respuesta) {
    const { correo, password } = peticion.body ?? {};
    if (typeof correo !== 'string' || !correo.trim() || typeof password !== 'string' || !password) {
        throw new ErrorHttp(400, 'El correo y la contraseña son obligatorios');
    }

    const usuario = await prisma.usuario.findUnique({
        where: { correo: correo.trim().toLowerCase() },
        include: { rol: true }
    });
    const credencialesValidas = usuario?.activo &&
        await bcrypt.compare(password, usuario.passwordHash);
    if (!credencialesValidas) {
        throw new ErrorHttp(401, 'Credenciales incorrectas');
    }

    const token = jwt.sign(
        { idUsuario: usuario.id, huella: huellaPassword(usuario.passwordHash) },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRA_EN ?? '8h' }
    );
    return respuesta.json({
        mensaje: 'Inicio de sesión exitoso',
        token,
        usuario: {
            id: usuario.id,
            nombreCompleto: usuario.nombreCompleto,
            correo: usuario.correo,
            rol: usuario.rol.codigo,
            sucursalId: usuario.sucursalId
        }
    });
}

export async function obtenerSesion(peticion, respuesta) {
    const usuario = await prisma.usuario.findUnique({
        where: { id: peticion.auth.idUsuario },
        select: { id: true, nombreCompleto: true, correo: true, sucursalId: true, rol: { select: { codigo: true } } }
    });
    if (!usuario) throw new ErrorHttp(404, 'Usuario no encontrado');
    return respuesta.json({ usuario });
}

// POST /api/cambiar-password — al cambiarla, las sesiones anteriores dejan de valer y hay que entrar de nuevo.
export async function cambiarPassword(peticion, respuesta) {
    const actual = peticion.body?.password_actual;
    const nueva = peticion.body?.password_nueva;
    if (typeof actual !== 'string' || !actual) {
        throw new ErrorHttp(400, 'Escribe tu contraseña actual');
    }
    if (typeof nueva !== 'string' || nueva.length < 8 || nueva.length > 72) {
        throw new ErrorHttp(400, 'La contraseña nueva debe tener entre 8 y 72 caracteres');
    }
    if (nueva === actual) {
        throw new ErrorHttp(400, 'La contraseña nueva debe ser distinta a la actual');
    }

    const usuario = await prisma.usuario.findUnique({
        where: { id: peticion.auth.idUsuario },
        select: { passwordHash: true }
    });
    if (!usuario || !(await bcrypt.compare(actual, usuario.passwordHash))) {
        throw new ErrorHttp(400, 'La contraseña actual no es correcta');
    }

    await prisma.usuario.update({
        where: { id: peticion.auth.idUsuario },
        data: { passwordHash: await bcrypt.hash(nueva, 10) }
    });
    return respuesta.json({ mensaje: 'Contraseña actualizada. Inicia sesión de nuevo.' });
}