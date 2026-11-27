import { useCallback, useEffect, useState } from 'react';
import { solicitudApi } from '../api.js';
import { puedeElegirSucursal as rolEligeSucursal } from '../permisos.js';

const unidades = [
    { valor: 'g', texto: 'Gramos (g)' },
    { valor: 'ml', texto: 'Mililitros (ml)' },
    { valor: 'unidad', texto: 'Unidad' }
];

function cantidad(valor, unidad) {
    return `${Number(valor).toLocaleString('es-SV', { maximumFractionDigits: 3 })} ${unidad || ''}`.trim();
}

// Contrato: Backend/src/controladores/inventarioControlador.js
// Consulta: cualquier usuario autenticado. Crear insumos y ajustar: admin y gerente.
function InventarioPage({ permisos = [], usuario }) {
    const puedeVer = permisos.includes('ver_inventario');
    const puedeGestionar = permisos.includes('gestionar_inventario');
    const eligeSucursal = rolEligeSucursal(usuario);
    const [existencias, setExistencias] = useState([]);
    const [alertas, setAlertas] = useState([]);
    const [movimientos, setMovimientos] = useState([]);
    const [insumos, setInsumos] = useState([]);
    const [sucursales, setSucursales] = useState([]);
    const [sucursalId, setSucursalId] = useState('');
    const [nuevoInsumo, setNuevoInsumo] = useState({ codigo: '', nombre: '', unidadBase: 'g', cantidadMinima: '0' });
    const [ajuste, setAjuste] = useState({ insumoId: '', sentido: 'disminuir', cantidad: '', motivo: '' });
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
        const query = sucursalId ? `?sucursalId=${sucursalId}` : '';
        Promise.all([
            solicitudApi(`/inventario/existencias${query}`),
            solicitudApi(`/inventario/alertas${query}`),
            solicitudApi(`/inventario/movimientos${query ? `${query}&` : '?'}limite=50`),
            puedeGestionar ? solicitudApi('/inventario/insumos?activo=true') : Promise.resolve({ insumos: [] })
        ]).then(([respuestaExistencias, respuestaAlertas, respuestaMovimientos, respuestaInsumos]) => {
            if (!activo) return;
            setExistencias(respuestaExistencias.existencias);
            setAlertas(respuestaAlertas.alertas);
            setMovimientos(respuestaMovimientos.movimientos);
            setInsumos(respuestaInsumos.insumos);
        }).catch((fallo) => {
            if (activo) setErrorCarga(fallo.message);
        }).finally(() => {
            if (activo) setCargando(false);
        });
        return () => { activo = false; };
    }, [puedeVer, puedeGestionar, sucursalId, recarga]);

    useEffect(() => {
        if (!eligeSucursal) return undefined;
        let activo = true;
        solicitudApi('/sucursales')
            .then((respuesta) => { if (activo) setSucursales(respuesta.sucursales); })
            .catch((fallo) => { if (activo) setError(`No se pudieron cargar las sucursales: ${fallo.message}`); });
        return () => { activo = false; };
    }, [eligeSucursal]);

    async function crearInsumo(event) {
        event.preventDefault();
        setProcesando(true);
        setError('');
        setMensaje('');
        try {
            const respuesta = await solicitudApi('/inventario/insumos', {
                method: 'POST',
                body: {
                    codigo: nuevoInsumo.codigo.trim(),
                    nombre: nuevoInsumo.nombre.trim(),
                    unidadBase: nuevoInsumo.unidadBase,
                    cantidadMinima: nuevoInsumo.cantidadMinima || '0'
                }
            });
            setMensaje(`Insumo ${respuesta.insumo.nombre} creado con existencia 0 en cada sucursal activa.`);
            setNuevoInsumo({ codigo: '', nombre: '', unidadBase: 'g', cantidadMinima: '0' });
            cargar();
        } catch (fallo) {
            setError(fallo.message);
        } finally {
            setProcesando(false);
        }
    }

    async function ajustar(event) {
        event.preventDefault();
        setProcesando(true);
        setError('');
        setMensaje('');
        try {
            const valor = String(ajuste.cantidad).trim();
            await solicitudApi('/inventario/ajustes', {
                method: 'POST',
                body: {
                    insumoId: Number(ajuste.insumoId),
                    cantidadCambio: ajuste.sentido === 'disminuir' ? `-${valor}` : valor,
                    motivo: ajuste.motivo.trim(),
                    ...(sucursalId ? { sucursalId: Number(sucursalId) } : {})
                }
            });
            setMensaje('Ajuste registrado.');
            setAjuste({ ...ajuste, cantidad: '', motivo: '' });
            cargar();
        } catch (fallo) {
            setError(fallo.message);
        } finally {
            setProcesando(false);
        }
    }

    // El administrador sin sucursal asignada debe indicar en cuál ajusta (sucursalOperacion en el backend).
    const faltaSucursalAjuste = eligeSucursal && !sucursalId && !usuario?.sucursalId;

    return (
        <>
            <header className="page-heading">
                <div>
                    <h1>Inventario</h1>
                    <p>Existencias, ajustes y movimientos por sucursal.</p>
                </div>
                <button className="secondary-button" type="button" onClick={cargar} disabled={cargando || !puedeVer}>Actualizar</button>
            </header>
            {error && <div className="notice is-error" role="alert">{error}</div>}
            {mensaje && <div className="notice" role="status">{mensaje}</div>}
            {eligeSucursal && (
                <label className="form-field" style={{ maxWidth: 360, marginBottom: 16 }}>
                    Sucursal para consultar y ajustar
                    <select value={sucursalId} onChange={(event) => { setSucursalId(event.target.value); cargar(); }}>
                        <option value="">Todas las sucursales</option>
                        {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}
                    </select>
                </label>
            )}
            {puedeGestionar && (
                <div className="form-grid">
                    <form className="surface-card" onSubmit={crearInsumo}>
                        <h2>Nuevo insumo</h2>
                        <div className="form-grid">
                            <label className="form-field">Código<input maxLength="30" required value={nuevoInsumo.codigo} onChange={(event) => setNuevoInsumo({ ...nuevoInsumo, codigo: event.target.value })} /></label>
                            <label className="form-field">Nombre<input maxLength="120" required value={nuevoInsumo.nombre} onChange={(event) => setNuevoInsumo({ ...nuevoInsumo, nombre: event.target.value })} /></label>
                            <label className="form-field">Unidad base<select value={nuevoInsumo.unidadBase} onChange={(event) => setNuevoInsumo({ ...nuevoInsumo, unidadBase: event.target.value })}>
                                {unidades.map((unidad) => <option key={unidad.valor} value={unidad.valor}>{unidad.texto}</option>)}
                            </select></label>
                            <label className="form-field">Cantidad mínima<input type="number" min="0" step="0.001" value={nuevoInsumo.cantidadMinima} onChange={(event) => setNuevoInsumo({ ...nuevoInsumo, cantidadMinima: event.target.value })} /></label>
                        </div>
                        <button className="primary-button" type="submit" disabled={procesando} style={{ marginTop: 16 }}>Crear insumo</button>
                    </form>

                    <form className="surface-card" onSubmit={ajustar}>
                        <h2>Ajustar existencias</h2>
                        <p className="form-help">Para merma, daño o corrección por conteo físico. Las entradas por compra se registran en Compras.</p>
                        <div className="form-grid">
                            <label className="form-field">Insumo<select required value={ajuste.insumoId} onChange={(event) => setAjuste({ ...ajuste, insumoId: event.target.value })}>
                                <option value="">Selecciona un insumo</option>
                                {insumos.map((insumo) => <option key={insumo.id} value={insumo.id}>{insumo.nombre} · {insumo.unidadBase}</option>)}
                            </select></label>
                            <label className="form-field">Tipo<select value={ajuste.sentido} onChange={(event) => setAjuste({ ...ajuste, sentido: event.target.value })}>
                                <option value="disminuir">Disminuir (merma o daño)</option>
                                <option value="aumentar">Aumentar (corrección)</option>
                            </select></label>
                            <label className="form-field">Cantidad<input type="number" min="0.001" step="0.001" required value={ajuste.cantidad} onChange={(event) => setAjuste({ ...ajuste, cantidad: event.target.value })} /></label>
                            <label className="form-field">Motivo<input maxLength="150" required value={ajuste.motivo} onChange={(event) => setAjuste({ ...ajuste, motivo: event.target.value })} /></label>
                        </div>
                        {faltaSucursalAjuste && <p className="notice is-info">Selecciona una sucursal para registrar el ajuste.</p>}
                        <button className="secondary-button" type="submit" disabled={procesando || !insumos.length || faltaSucursalAjuste} style={{ marginTop: 16 }}>Aplicar ajuste</button>
                    </form>
                </div>
            )}
            {!puedeVer ? (
                <div className="notice is-info">Tu cuenta no tiene acceso a la consulta de inventario.</div>
            ) : cargando ? (
                <p className="loading-state" role="status">Cargando inventario…</p>
            ) : errorCarga ? (
                <div className="notice is-error" role="alert">No se pudo cargar el inventario: {errorCarga}</div>
            ) : (
                <>
                    <section className="stats-grid">
                        <article className="stat-card"><p className="stat-card-label">Existencias registradas</p><p className="stat-card-value">{existencias.length}</p></article>
                        <article className="stat-card"><p className="stat-card-label">Alertas de stock</p><p className="stat-card-value">{alertas.length}</p></article>
                        <article className="stat-card"><p className="stat-card-label">Agotados</p><p className="stat-card-value">{existencias.filter((fila) => Number(fila.cantidadActual) <= 0).length}</p></article>
                    </section>
                    <section className="surface-card">
                        <h2>Alertas de stock</h2>
                        {alertas.length === 0 ? <p className="empty-state">No hay insumos en o bajo el mínimo.</p> : (
                            <div className="data-table-wrap" tabIndex={0}>
                                <table className="data-table">
                                    <thead><tr><th>Sucursal</th><th>Insumo</th><th>Stock actual</th><th>Mínimo</th><th>Estado</th></tr></thead>
                                    <tbody>{alertas.map((alerta) => (
                                        <tr key={`${alerta.sucursalId}-${alerta.insumoId}`}>
                                            <td>{alerta.sucursal}</td><td>{alerta.insumo}</td><td>{cantidad(alerta.cantidadActual, alerta.unidad)}</td><td>{cantidad(alerta.cantidadMinima, alerta.unidad)}</td>
                                            <td><span className={`status-pill ${Number(alerta.cantidadActual) <= 0 ? 'is-danger' : 'is-warning'}`}>{Number(alerta.cantidadActual) <= 0 ? 'AGOTADO' : 'STOCK BAJO'}</span></td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        )}
                    </section>
                    <section className="surface-card">
                        <h2>Existencias</h2>
                        {existencias.length === 0 ? <p className="empty-state">No hay existencias de insumos activos.</p> : (
                            <div className="data-table-wrap" tabIndex={0}>
                                <table className="data-table">
                                    <thead><tr><th>Sucursal</th><th>Código</th><th>Insumo</th><th>Stock actual</th><th>Stock mínimo</th><th>Estado</th></tr></thead>
                                    <tbody>{existencias.map((fila) => (
                                        <tr key={`${fila.sucursalId}-${fila.insumoId}`}>
                                            <td>{fila.sucursal.nombre}</td><td>{fila.insumo.codigo}</td><td>{fila.insumo.nombre}</td>
                                            <td>{cantidad(fila.cantidadActual, fila.insumo.unidadBase)}</td><td>{cantidad(fila.cantidadMinima, fila.insumo.unidadBase)}</td>
                                            <td><span className={`status-pill ${Number(fila.cantidadActual) <= 0 ? 'is-danger' : fila.bajoMinimo ? 'is-warning' : ''}`}>{Number(fila.cantidadActual) <= 0 ? 'AGOTADO' : fila.bajoMinimo ? 'STOCK BAJO' : 'OK'}</span></td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        )}
                    </section>
                    <section className="surface-card">
                        <h2>Movimientos recientes</h2>
                        {movimientos.length === 0 ? <p className="empty-state">No hay movimientos registrados.</p> : (
                            <div className="data-table-wrap" tabIndex={0}>
                                <table className="data-table">
                                    <thead><tr><th>Fecha</th><th>Insumo</th><th>Tipo</th><th>Cambio</th><th>Motivo</th></tr></thead>
                                    <tbody>{movimientos.map((movimiento) => (
                                        <tr key={movimiento.id}>
                                            <td>{new Intl.DateTimeFormat('es-SV', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(movimiento.fecha))}</td>
                                            <td>{movimiento.existencia?.insumo?.nombre || '—'}</td><td>{movimiento.tipo}</td>
                                            <td>{cantidad(movimiento.cantidadCambio, movimiento.existencia?.insumo?.unidadBase)}</td><td>{movimiento.motivo}</td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}
        </>
    );
}

export default InventarioPage;
