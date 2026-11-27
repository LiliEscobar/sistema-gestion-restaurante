import { useCallback, useEffect, useState } from 'react';
import { solicitudApi } from '../api.js';
import { useEnfoqueEdicion } from '../enfoque.js';

const vacio = { nombreCompleto: '', correo: '', password: '', confirmacion: '', rol: 'cajero', sucursalId: '' };

// Contrato: Backend/src/controladores/usuariosControlador.js (solo administrador).
// Sin borrado: la baja es activo = false. El backend impide desactivarse a sí mismo,
// cambiar el propio rol y dejar el sistema sin administradores activos.
function UsuariosPage({ usuarioActual, permisos = [] }) {
    const puedeGestionar = permisos.includes('gestionar_usuarios');
    const [usuarios, setUsuarios] = useState([]);
    const [roles, setRoles] = useState([]);
    const [sucursales, setSucursales] = useState([]);
    const [filtros, setFiltros] = useState({ sucursalId: '', rol: '', activo: 'true' });
    const [formulario, setFormulario] = useState(vacio);
    const [enEdicion, setEnEdicion] = useState(null);
    const [cargando, setCargando] = useState(puedeGestionar);
    const [errorCarga, setErrorCarga] = useState('');
    const [procesando, setProcesando] = useState(false);
    const [error, setError] = useState('');
    const [errorFormulario, setErrorFormulario] = useState('');
    const [errorCatalogos, setErrorCatalogos] = useState('');
    const [cargandoCatalogos, setCargandoCatalogos] = useState(puedeGestionar);
    const [mensaje, setMensaje] = useState('');
    const [recarga, setRecarga] = useState(0);
    const { formularioRef, listadoRef, volverAlListado } = useEnfoqueEdicion(enEdicion?.id, cargando);

    const cargar = useCallback(() => {
        setCargando(true);
        setErrorCarga('');
        setRecarga((actual) => actual + 1);
    }, []);

    useEffect(() => {
        if (!puedeGestionar) return undefined;
        let activo = true;
        const query = new URLSearchParams(Object.entries(filtros).filter(([, valor]) => valor)).toString();
        solicitudApi(`/usuarios${query ? `?${query}` : ''}`)
            .then((respuesta) => { if (activo) setUsuarios(respuesta.usuarios); })
            .catch((fallo) => { if (activo) setErrorCarga(fallo.message); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [puedeGestionar, filtros, recarga]);

    // Roles y sucursales alimentan el formulario: se cargan aparte para que un fallo del listado
    // no deje el alta deshabilitada sin explicación.
    useEffect(() => {
        if (!puedeGestionar) return undefined;
        let activo = true;
        Promise.all([solicitudApi('/usuarios/roles'), solicitudApi('/sucursales')])
            .then(([respuestaRoles, respuestaSucursales]) => {
                if (!activo) return;
                setRoles(respuestaRoles.roles);
                setSucursales(respuestaSucursales.sucursales);
            })
            .catch((fallo) => { if (activo) setErrorCatalogos(fallo.message); })
            .finally(() => { if (activo) setCargandoCatalogos(false); });
        return () => { activo = false; };
    }, [puedeGestionar]);

    async function operar(path, method, body, textoExito, { desdeFormulario = false } = {}) {
        setProcesando(true);
        setError('');
        setErrorFormulario('');
        setMensaje('');
        try {
            const respuesta = await solicitudApi(path, { method, body });
            setMensaje(typeof textoExito === 'function' ? textoExito(respuesta) : textoExito);
            cargar();
            return respuesta ?? {};
        } catch (fallo) {
            (desdeFormulario ? setErrorFormulario : setError)(fallo.message);
            return null;
        } finally {
            setProcesando(false);
        }
    }

    const cambiar = (event) => setFormulario((actual) => ({ ...actual, [event.target.name]: event.target.value }));
    const sucursalBody = () => (formulario.sucursalId ? Number(formulario.sucursalId) : null);

    // Validación previa con mensajes concretos; el backend vuelve a validar todo.
    function validarAlta() {
        if (!formulario.nombreCompleto.trim()) return 'Escribe el nombre completo.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formulario.correo.trim())) return 'Escribe un correo válido, por ejemplo nombre@origenes.sv.';
        if (formulario.password.length < 8 || formulario.password.length > 72) return 'La contraseña inicial debe tener entre 8 y 72 caracteres.';
        if (formulario.password !== formulario.confirmacion) return 'La confirmación no coincide con la contraseña.';
        if (!roles.some((rol) => rol.codigo === formulario.rol)) return 'Selecciona un rol.';
        if (formulario.rol !== 'admin' && !formulario.sucursalId) return 'Los roles distintos de administrador requieren una sucursal.';
        return '';
    }

    async function crear(event) {
        event.preventDefault();
        const invalido = validarAlta();
        if (invalido) {
            setErrorFormulario(invalido);
            return;
        }
        const respuesta = await operar('/usuarios', 'POST', {
            nombreCompleto: formulario.nombreCompleto.trim(),
            correo: formulario.correo.trim().toLowerCase(),
            password: formulario.password,
            rol: formulario.rol,
            sucursalId: sucursalBody()
        }, ({ usuario }) => {
            const visible = (!filtros.sucursalId || String(usuario.sucursalId) === filtros.sucursalId)
                && (!filtros.rol || usuario.rol?.codigo === filtros.rol) && filtros.activo !== 'false';
            return `Usuario ${usuario.correo} creado.${visible ? '' : ' No aparece en el listado por los filtros actuales.'}`;
        }, { desdeFormulario: true });
        if (respuesta) {
            setFormulario(vacio);
            volverAlListado(respuesta.usuario?.id);
        }
    }

    async function guardarEdicion(event) {
        event.preventDefault();
        const id = enEdicion.id;
        const ok = await operar(`/usuarios/${id}`, 'PATCH', {
            nombreCompleto: formulario.nombreCompleto.trim(),
            rol: formulario.rol,
            sucursalId: sucursalBody()
        }, 'Usuario actualizado.', { desdeFormulario: true });
        if (ok) {
            setEnEdicion(null);
            setFormulario(vacio);
            volverAlListado(id);
        }
    }

    function editar(usuario) {
        setEnEdicion(usuario);
        setError('');
        setErrorFormulario('');
        setMensaje('');
        setFormulario({ ...vacio, nombreCompleto: usuario.nombreCompleto, correo: usuario.correo, rol: usuario.rol.codigo, sucursalId: usuario.sucursalId ? String(usuario.sucursalId) : '' });
    }

    function cancelarEdicion() {
        const id = enEdicion?.id;
        setEnEdicion(null);
        setFormulario(vacio);
        setErrorFormulario('');
        volverAlListado(id);
    }

    function cambiarEstado(usuario) {
        const accion = usuario.activo ? 'desactivar' : 'reactivar';
        if (!window.confirm(`¿${accion[0].toUpperCase() + accion.slice(1)} la cuenta de ${usuario.nombreCompleto}?`)) return;
        operar(`/usuarios/${usuario.id}`, 'PATCH', { activo: !usuario.activo }, `Cuenta ${usuario.activo ? 'desactivada' : 'reactivada'}.`);
    }

    function restablecer(usuario) {
        const password = window.prompt(`Nueva contraseña para ${usuario.correo} (8 a 72 caracteres):`);
        if (!password) return;
        operar(`/usuarios/${usuario.id}/password`, 'POST', { password }, `Contraseña de ${usuario.correo} restablecida.`);
    }

    const sinSucursal = formulario.rol !== 'admin' && !formulario.sucursalId;

    const campos = (
        <div className="form-grid">
            <label className="form-field">Nombre completo<input name="nombreCompleto" maxLength="150" required value={formulario.nombreCompleto} onChange={cambiar} /></label>
            <label className="form-field">Correo<input name="correo" type="email" maxLength="150" required disabled={Boolean(enEdicion)} value={formulario.correo} onChange={cambiar} /></label>
            {!enEdicion && <label className="form-field">Contraseña inicial<input name="password" type="password" minLength="8" maxLength="72" required autoComplete="new-password" value={formulario.password} onChange={cambiar} /></label>}
            {!enEdicion && <label className="form-field">Confirmar contraseña<input name="confirmacion" type="password" minLength="8" maxLength="72" required autoComplete="new-password" value={formulario.confirmacion} onChange={cambiar} /></label>}
            <label className="form-field">Rol<select name="rol" value={formulario.rol} onChange={cambiar} disabled={enEdicion?.id === usuarioActual?.id}>
                {roles.map((rol) => <option key={rol.id} value={rol.codigo}>{rol.nombre}</option>)}
            </select></label>
            <label className="form-field">Sucursal<select name="sucursalId" value={formulario.sucursalId} onChange={cambiar} required={formulario.rol !== 'admin'}>
                <option value="">{formulario.rol === 'admin' ? 'Acceso general (todas)' : 'Selecciona una sucursal'}</option>
                {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}
            </select></label>
        </div>
    );

    if (!puedeGestionar) {
        return <div className="notice is-info">Solo el administrador gestiona las cuentas de usuario.</div>;
    }

    return (
        <>
            <header className="page-heading">
                <div>
                    <h1>Usuarios</h1>
                    <p>Cuentas de acceso al sistema, su rol y su sucursal.</p>
                </div>
                <button className="secondary-button" type="button" onClick={cargar} disabled={cargando}>Actualizar</button>
            </header>
            {error && <div className="notice is-error" role="alert">{error}</div>}
            {mensaje && <div className="notice" role="status">{mensaje}</div>}

            <form className={`surface-card${enEdicion ? ' is-editing' : ''}`} onSubmit={enEdicion ? guardarEdicion : crear} ref={formularioRef} noValidate aria-label={enEdicion ? `Editar ${enEdicion.correo}` : 'Nuevo usuario'}>
                <div className="page-heading">
                    <h2>{enEdicion ? `Editar ${enEdicion.correo}` : 'Nuevo usuario'}</h2>
                    {enEdicion && <button className="secondary-button" type="button" onClick={cancelarEdicion}>Cancelar edición</button>}
                </div>
                {enEdicion && <p className="notice is-info" role="status">Modo edición: los cambios no se guardan hasta pulsar «Guardar cambios». El correo no se puede cambiar.</p>}
                {errorFormulario && <div className="notice is-error" role="alert">{errorFormulario}</div>}
                {cargandoCatalogos ? <p className="loading-state" role="status">Cargando roles y sucursales…</p> :
                    errorCatalogos ? <div className="notice is-error" role="alert">No se pudieron cargar roles y sucursales: {errorCatalogos}. Recarga la página para reintentar.</div> : campos}
                {!cargandoCatalogos && !errorCatalogos && sinSucursal && <p className="form-help">Los roles distintos de administrador operan en una sucursal: selecciónala.</p>}
                <button className="primary-button" type="submit" disabled={procesando || cargandoCatalogos || Boolean(errorCatalogos) || !roles.length} style={{ marginTop: 16 }}>
                    {procesando ? 'Guardando…' : enEdicion ? 'Guardar cambios' : 'Crear usuario'}
                </button>
            </form>

            <section className="surface-card" ref={listadoRef}>
                <h2 tabIndex={-1}>Cuentas</h2>
                <div className="inline-form" style={{ marginBottom: 12 }}>
                    <label className="form-field">Sucursal<select value={filtros.sucursalId} onChange={(event) => { setFiltros({ ...filtros, sucursalId: event.target.value }); cargar(); }}>
                        <option value="">Todas</option>
                        {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}
                    </select></label>
                    <label className="form-field">Rol<select value={filtros.rol} onChange={(event) => { setFiltros({ ...filtros, rol: event.target.value }); cargar(); }}>
                        <option value="">Todos</option>
                        {roles.map((rol) => <option key={rol.id} value={rol.codigo}>{rol.nombre}</option>)}
                    </select></label>
                    <label className="form-field">Estado<select value={filtros.activo} onChange={(event) => { setFiltros({ ...filtros, activo: event.target.value }); cargar(); }}>
                        <option value="true">Activos</option><option value="false">Inactivos</option><option value="">Todos</option>
                    </select></label>
                </div>
                {cargando ? <p className="loading-state" role="status">Cargando usuarios…</p> :
                    errorCarga ? <div className="notice is-error" role="alert">No se pudieron cargar los usuarios: {errorCarga}</div> :
                    usuarios.length === 0 ? <p className="empty-state">No hay usuarios con estos filtros.</p> : (
                        <div className="data-table-wrap" tabIndex={0}>
                            <table className="data-table">
                                <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Sucursal</th><th>Estado</th><th>Acciones</th></tr></thead>
                                <tbody>{usuarios.map((usuario) => (
                                    <tr key={usuario.id} data-fila-id={usuario.id} aria-current={enEdicion?.id === usuario.id ? 'true' : undefined}>
                                        <td>{usuario.nombreCompleto}</td>
                                        <td>{usuario.correo}</td>
                                        <td>{usuario.rol.nombre}</td>
                                        <td>{usuario.sucursal?.nombre || 'Acceso general'}</td>
                                        <td><span className={`status-pill ${usuario.activo ? '' : 'is-warning'}`}>{usuario.activo ? 'activo' : 'inactivo'}</span></td>
                                        <td><div className="page-actions">
                                            <button className="secondary-button" type="button" onClick={() => editar(usuario)} disabled={procesando} data-editar>Editar</button>
                                            <button className="secondary-button" type="button" onClick={() => restablecer(usuario)} disabled={procesando}>Contraseña</button>
                                            {usuario.id !== usuarioActual?.id && (
                                                <button className={usuario.activo ? 'danger-button' : 'secondary-button'} type="button" onClick={() => cambiarEstado(usuario)} disabled={procesando}>
                                                    {usuario.activo ? 'Desactivar' : 'Reactivar'}
                                                </button>
                                            )}
                                        </div></td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
            </section>
        </>
    );
}

export default UsuariosPage;
