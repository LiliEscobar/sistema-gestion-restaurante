import { useEffect, useState } from 'react';
import { solicitudApi } from '../api.js';

const nombresRol = { admin: 'Administrador', gerente: 'Gerente', cajero: 'Cajero', barista: 'Barista' };

// "Mi perfil" muestra la cuenta de usuario con la que se inició sesión (GET /api/auth/sesion).
// No usa /clientes: los clientes son receptores de CCF, no cuentas del sistema, y /clientes/yo
// era capturado por /clientes/:id. El backend no tiene una ruta para editar el propio perfil.
function PerfilPage() {
    const [perfil, setPerfil] = useState(null);
    const [sucursal, setSucursal] = useState('');
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let activo = true;
        solicitudApi('/auth/sesion').then(async ({ usuario }) => {
            if (!activo) return;
            setPerfil(usuario);
            if (usuario.sucursalId != null) {
                try {
                    const { sucursales } = await solicitudApi('/sucursales');
                    const encontrada = sucursales.find((item) => item.id === usuario.sucursalId);
                    if (activo) setSucursal(encontrada?.nombre || `Sucursal #${usuario.sucursalId}`);
                } catch {
                    if (activo) setSucursal(`Sucursal #${usuario.sucursalId}`);
                }
            }
        }).catch((fallo) => {
            if (activo) setError(fallo.message);
        }).finally(() => {
            if (activo) setCargando(false);
        });
        return () => { activo = false; };
    }, []);

    return (
        <>
            <header className="page-heading">
                <div>
                    <h1>Mi perfil</h1>
                    <p>Datos de la cuenta con la que iniciaste sesión.</p>
                </div>
            </header>
            {error && <div className="notice is-error" role="alert">No se pudo cargar tu perfil: {error}</div>}
            {cargando ? <p className="loading-state">Cargando perfil…</p> : perfil && (
                <section className="surface-card">
                    <h2>Cuenta de usuario</h2>
                    <div className="form-grid">
                        <label className="form-field">Nombre<input value={perfil.nombreCompleto || ''} disabled /></label>
                        <label className="form-field">Correo<input value={perfil.correo || ''} disabled /></label>
                        <label className="form-field">Rol<input value={nombresRol[perfil.rol?.codigo] || perfil.rol?.codigo || ''} disabled /></label>
                        <label className="form-field">Sucursal<input value={perfil.sucursalId == null ? 'Acceso general (todas las sucursales)' : sucursal} disabled /></label>
                    </div>
                    <p className="form-help" style={{ marginTop: 16 }}>Para cambiar estos datos contacta al administrador: el servidor aún no permite editarlos desde aquí.</p>
                </section>
            )}
        </>
    );
}

export default PerfilPage;
