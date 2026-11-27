import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import { ErrorHttp } from '../utils/ErrorHttp.js';
import { huellaPassword } from '../utils/sesion.js';

// Verifica el token y vuelve a leer la cuenta en cada petición: una cuenta desactivada,
// una contraseña cambiada o un cambio de rol surten efecto de inmediato.
export async function autenticar(peticion, _respuesta, siguiente) {
    const [esquema, token] = (peticion.get('Authorization') ?? '').split(' ');
    if (esquema !== 'Bearer' || !token) {
        throw new ErrorHttp(401, 'Falta el token de autenticación');
    }

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        throw new ErrorHttp(401, 'La sesión no es válida o expiró');
    }

    const usuario = await prisma.usuario.findUnique({
        where: { id: payload.idUsuario },
        select: { activo: true, passwordHash: true, sucursalId: true, rol: { select: { codigo: true } } },
    });
    const vigente = usuario?.activo && payload.huella === huellaPassword(usuario.passwordHash);
    if (!vigente) {
        throw new ErrorHttp(401, 'La sesión no es válida o expiró');
    }

    peticion.auth = {
        idUsuario: payload.idUsuario,
        rol: usuario.rol.codigo,
        sucursalId: usuario.sucursalId,
    };
    return siguiente();
}

// Mantiene el control por rol de las rutas existentes.
export function requerirRol(...rolesPermitidos) {
    return (peticion, _respuesta, siguiente) => {
        if (!rolesPermitidos.includes(peticion.auth?.rol)) {
            throw new ErrorHttp(403, 'No tienes permiso para realizar esta acción');
        }
        return siguiente();
    };
}