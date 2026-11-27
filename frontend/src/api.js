import { permisosDeRol } from './permisos.js';

const claveSesion = 'origenes-sesion';
const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
    constructor(message, status, data = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

export async function solicitudApi(path, { method = 'GET', body } = {}) {
    const token = leerSesion()?.token;
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    let response;
    try {
        response = await fetch(`${apiBase}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    } catch {
        throw new ApiError('No se pudo conectar con el servidor. Comprueba que el backend esté iniciado.', 0);
    }

    const texto = await response.text();
    let datos = null;
    if (texto) {
        try {
            datos = JSON.parse(texto);
        } catch {
            throw new ApiError('El servidor devolvió una respuesta que no es JSON válida.', response.status);
        }
    }

    if (!response.ok) {
        if (response.status === 401 && !['/auth/login', '/cambiar-password'].includes(path)) {
            borrarSesion();
            window.dispatchEvent(new Event('origen:sesion-expirada'));
        }
        throw new ApiError(datos?.mensaje || 'La solicitud no se pudo completar.', response.status, datos);
    }
    return datos;
}

export function leerSesion() {
    try {
        const contenido = sessionStorage.getItem(claveSesion);
        if (!contenido) return null;
        const sesion = JSON.parse(contenido);
        if (typeof sesion?.token !== 'string' || !sesion.usuario) {
            borrarSesion();
            return null;
        }
        // Los permisos guardados no se confían: una sesión creada por una versión anterior
        // traía permisos: [] y ocultaba las pantallas. Se recalculan siempre desde el rol.
        const rol = typeof sesion.usuario.rol === 'string' ? sesion.usuario.rol : sesion.usuario.rol?.codigo;
        return { ...sesion, usuario: { ...sesion.usuario, rol, permisos: permisosDeRol(rol) } };
    } catch {
        borrarSesion();
        return null;
    }
}

export function guardarSesion(sesion) {
    const usuario = sesion.usuario;
    const rol = typeof usuario.rol === 'string' ? usuario.rol : usuario.rol?.codigo;
    const normalizada = {
        ...sesion,
        usuario: {
            ...usuario,
            nombre_completo: usuario.nombreCompleto ?? usuario.nombre_completo,
            rol,
            // El backend autoriza por rol y no envía permisos; se derivan de sus reglas (ver permisos.js).
            permisos: permisosDeRol(rol),
            sucursal: usuario.sucursal ?? (usuario.sucursalId == null ? null : `Sucursal #${usuario.sucursalId}`),
        },
    };
    sessionStorage.setItem(claveSesion, JSON.stringify(normalizada));
    return normalizada;
}

export function borrarSesion() {
    sessionStorage.removeItem(claveSesion);
}
