import { useCallback, useEffect, useState } from 'react';
import { solicitudApi } from '../api.js';

// Alcance de cada rol según las rutas del backend (requerirRol). Los roles son fijos: crear uno nuevo
// no le daría acceso a nada sin cambiar el código del servidor, por eso aquí solo se consultan.
const alcances = {
    admin: 'Todo el sistema y todas las sucursales; único que gestiona usuarios, sucursales y menú.',
    gerente: 'Ventas, caja, inventario, compras, empleados, planillas y reportes de su sucursal.',
    cajero: 'Ventas, caja (su propio turno) y consulta de menú e inventario de su sucursal.',
    barista: 'Consulta de menú e inventario de su sucursal.'
};

// Contrato: Backend/src/controladores/sucursalesControlador.js (escritura solo administrador)
// y GET /api/usuarios/roles. La baja de una sucursal es activo = false; no se borran.
function AdministracionPage({ permisos = [] }) {
    const puedeVer = permisos.includes('gestionar_sucursales');
    const [sucursales, setSucursales] = useState([]);
    const [roles, setRoles] = useState([]);
    const [nombre, setNombre] = useState('');
    const [cargando, setCargando] = useState(puedeVer);
    const [errorCarga, setErrorCarga] = useState('');
    const [procesando, setProcesando] = useState(false);
    const [error, setError] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [recarga, setRecarga] = useState(0);

    const cargar = useCallback(() => {
        setCargando(true);
        setErrorCarga('');
        setRecarga((actual) => actual + 1);
    }, []);

    useEffect(() => {
        if (!puedeVer) return undefined;
        let activo = true;
        Promise.all([solicitudApi('/sucursales?todas=true'), solicitudApi('/usuarios/roles')])
            .then(([respuestaSucursales, respuestaRoles]) => {
                if (!activo) return;
                setSucursales(respuestaSucursales.sucursales);
                setRoles(respuestaRoles.roles);
            })
            .catch((fallo) => { if (activo) setErrorCarga(fallo.message); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [puedeVer, recarga]);

    async function operar(path, method, body, textoExito) {
        setProcesando(true);
        setError('');
        setMensaje('');
        try {
            await solicitudApi(path, { method, body });
            setMensaje(textoExito);
            cargar();
            return true;
        } catch (fallo) {
            setError(fallo.message);
            return false;
        } finally {
            setProcesando(false);
        }
    }

    async function crear(event) {
        event.preventDefault();
        if (await operar('/sucursales', 'POST', { nombre: nombre.trim() }, `Sucursal ${nombre.trim()} creada con existencias en 0 de cada insumo activo.`)) setNombre('');
    }

    function renombrar(sucursal) {
        const nuevo = window.prompt('Nuevo nombre de la sucursal:', sucursal.nombre);
        if (!nuevo || nuevo.trim() === sucursal.nombre) return;
        operar(`/sucursales/${sucursal.id}`, 'PATCH', { nombre: nuevo.trim() }, 'Sucursal renombrada.');
    }

    function cambiarEstado(sucursal) {
        const texto = sucursal.activo
            ? `¿Desactivar ${sucursal.nombre}? No podrá abrir turnos de caja ni aparecerá en los selectores.`
            : `¿Reactivar ${sucursal.nombre}?`;
        if (!window.confirm(texto)) return;
        operar(`/sucursales/${sucursal.id}`, 'PATCH', { activo: !sucursal.activo }, `Sucursal ${sucursal.activo ? 'desactivada' : 'reactivada'}.`);
    }

    if (!puedeVer) return <div className="notice is-info">Tu cuenta no tiene acceso a la administración.</div>;

    return (
        <>
            <header className="page-heading">
                <div>
                    <h1>Administración</h1>
                    <p>Sucursales y roles del sistema.</p>
                </div>
                <button className="secondary-button" type="button" onClick={cargar} disabled={cargando}>Actualizar</button>
            </header>
            {error && <div className="notice is-error" role="alert">{error}</div>}
            {mensaje && <div className="notice" role="status">{mensaje}</div>}

            <form className="surface-card" onSubmit={crear}>
                <h2>Nueva sucursal</h2>
                <div className="inline-form">
                    <label className="form-field">Nombre<input maxLength="100" required value={nombre} onChange={(event) => setNombre(event.target.value)} /></label>
                    <button className="primary-button" type="submit" disabled={procesando}>Crear sucursal</button>
                </div>
            </form>

            {cargando ? <p className="loading-state" role="status">Cargando administración…</p> :
                errorCarga ? <div className="notice is-error" role="alert">No se pudo cargar la administración: {errorCarga}</div> : (
                <>
                    <section className="surface-card">
                        <h2>Sucursales</h2>
                        {sucursales.length === 0 ? <p className="empty-state">No hay sucursales registradas.</p> : (
                            <div className="data-table-wrap" tabIndex={0}>
                                <table className="data-table">
                                    <thead><tr><th>ID</th><th>Nombre</th><th>Estado</th><th>Acciones</th></tr></thead>
                                    <tbody>{sucursales.map((sucursal) => (
                                        <tr key={sucursal.id}>
                                            <td>{sucursal.id}</td><td>{sucursal.nombre}</td>
                                            <td><span className={`status-pill ${sucursal.activo ? '' : 'is-warning'}`}>{sucursal.activo ? 'activa' : 'inactiva'}</span></td>
                                            <td><div className="page-actions">
                                                <button className="secondary-button" type="button" onClick={() => renombrar(sucursal)} disabled={procesando}>Renombrar</button>
                                                <button className={sucursal.activo ? 'danger-button' : 'secondary-button'} type="button" onClick={() => cambiarEstado(sucursal)} disabled={procesando}>
                                                    {sucursal.activo ? 'Desactivar' : 'Reactivar'}
                                                </button>
                                            </div></td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        )}
                    </section>
                    <section className="surface-card">
                        <h2>Roles</h2>
                        <p className="form-help">Los permisos de cada rol están definidos en el servidor. Asigna el rol de cada cuenta en Usuarios.</p>
                        <div className="data-table-wrap" tabIndex={0}>
                            <table className="data-table">
                                <thead><tr><th>Código</th><th>Rol</th><th>Alcance</th></tr></thead>
                                <tbody>{roles.map((rol) => (
                                    <tr key={rol.id}><td>{rol.codigo}</td><td>{rol.nombre}</td><td>{alcances[rol.codigo] || 'Sin permisos asignados en el servidor.'}</td></tr>
                                ))}</tbody>
                            </table>
                        </div>
                    </section>
                </>
            )}
        </>
    );
}

export default AdministracionPage;
