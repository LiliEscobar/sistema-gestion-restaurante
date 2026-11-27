import { useCallback, useEffect, useState } from 'react';
import { solicitudApi } from '../api.js';
import { puedeElegirSucursal as rolEligeSucursal } from '../permisos.js';

const metodosPago = ['Transferencia', 'Efectivo', 'Cheque', 'Tarjeta'];

function dinero(valor) {
    return `$${Number(valor ?? 0).toFixed(2)}`;
}

// Contrato: Backend/src/controladores/comprasControlador.js (admin, gerente).
// La compra suma inventario y deja el saldo como cuenta por pagar; no se edita ni elimina.
// El IVA (13 %) lo calcula el backend sobre cantidad × costo unitario.
function ComprasPage({ permisos = [], usuario }) {
    const puedeVerCompras = permisos.includes('ver_compras');
    const puedeRegistrar = permisos.includes('registrar_compras');
    const puedeVerProveedores = permisos.includes('ver_proveedores');
    const eligeSucursal = rolEligeSucursal(usuario);
    const [compras, setCompras] = useState([]);
    const [proveedores, setProveedores] = useState([]);
    const [insumos, setInsumos] = useState([]);
    const [sucursales, setSucursales] = useState([]);
    const [sucursalId, setSucursalId] = useState(usuario?.sucursalId ? String(usuario.sucursalId) : '');
    const [detalle, setDetalle] = useState({ insumoId: '', cantidad: '', costoUnitario: '' });
    const [formulario, setFormulario] = useState({ proveedorId: '', numeroFactura: '', metodoPago: 'Transferencia', montoPagado: '' });
    const [nuevoProveedor, setNuevoProveedor] = useState({ codigo: '', nombre: '' });
    const [pago, setPago] = useState({ compraId: '', metodo: 'Transferencia', monto: '' });
    const [cargando, setCargando] = useState(true);
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
        let activo = true;
        const query = sucursalId ? `?sucursalId=${sucursalId}` : '';
        Promise.all([
            puedeVerCompras ? solicitudApi(`/compras${query}`) : Promise.resolve({ compras: [] }),
            puedeVerProveedores ? solicitudApi('/proveedores') : Promise.resolve({ proveedores: [] }),
            puedeRegistrar ? solicitudApi('/inventario/insumos?activo=true') : Promise.resolve({ insumos: [] }),
            eligeSucursal ? solicitudApi('/sucursales') : Promise.resolve({ sucursales: [] })
        ]).then(([respuestaCompras, respuestaProveedores, respuestaInsumos, respuestaSucursales]) => {
            if (!activo) return;
            setCompras(respuestaCompras.compras);
            setProveedores(respuestaProveedores.proveedores);
            setInsumos(respuestaInsumos.insumos);
            setSucursales(respuestaSucursales.sucursales);
        }).catch((fallo) => {
            if (activo) setErrorCarga(fallo.message);
        }).finally(() => {
            if (activo) setCargando(false);
        });
        return () => { activo = false; };
    }, [puedeVerCompras, puedeVerProveedores, puedeRegistrar, eligeSucursal, sucursalId, recarga]);

    async function enviar(path, body, textoExito) {
        setProcesando(true);
        setError('');
        setMensaje('');
        try {
            const respuesta = await solicitudApi(path, { method: 'POST', body });
            setMensaje(textoExito(respuesta));
            cargar();
            return true;
        } catch (fallo) {
            setError(fallo.message);
            return false;
        } finally {
            setProcesando(false);
        }
    }

    async function registrarCompra(event) {
        event.preventDefault();
        const monto = String(formulario.montoPagado).trim();
        const ok = await enviar('/compras', {
            ...(sucursalId ? { sucursalId: Number(sucursalId) } : {}),
            proveedorId: Number(formulario.proveedorId),
            numeroFactura: formulario.numeroFactura.trim(),
            detalles: [{
                insumoId: Number(detalle.insumoId),
                cantidad: String(detalle.cantidad),
                costoUnitario: String(detalle.costoUnitario)
            }],
            pagos: monto && Number(monto) > 0 ? [{ metodo: formulario.metodoPago, monto }] : []
        }, ({ compra }) => `Compra ${compra.numeroFactura} registrada: total ${dinero(compra.total)}, saldo ${dinero(compra.saldo)}.`);
        if (ok) {
            setFormulario({ ...formulario, numeroFactura: '', montoPagado: '' });
            setDetalle({ insumoId: '', cantidad: '', costoUnitario: '' });
        }
    }

    async function registrarProveedor(event) {
        event.preventDefault();
        const ok = await enviar('/proveedores', {
            codigo: nuevoProveedor.codigo.trim(),
            nombre: nuevoProveedor.nombre.trim()
        }, ({ proveedor }) => `Proveedor ${proveedor.nombre} registrado.`);
        if (ok) setNuevoProveedor({ codigo: '', nombre: '' });
    }

    async function registrarPago(event) {
        event.preventDefault();
        const ok = await enviar(`/compras/${Number(pago.compraId)}/pagos`, {
            metodo: pago.metodo,
            monto: String(pago.monto)
        }, () => 'Abono registrado.');
        if (ok) setPago({ compraId: '', metodo: pago.metodo, monto: '' });
    }

    const pendientes = compras.filter((compra) => Number(compra.saldo) > 0);
    const proveedoresActivos = proveedores.filter((proveedor) => proveedor.activo);
    const faltaSucursal = eligeSucursal && !sucursalId;

    return (
        <>
            <header className="page-heading">
                <div>
                    <h1>Compras y proveedores</h1>
                    <p>Registra facturas de proveedor; cada compra suma inventario y deja su saldo por pagar.</p>
                </div>
                <button className="secondary-button" type="button" onClick={cargar} disabled={cargando}>Actualizar</button>
            </header>
            {error && <div className="notice is-error" role="alert">{error}</div>}
            {mensaje && <div className="notice" role="status">{mensaje}</div>}

            {eligeSucursal && (
                <label className="form-field" style={{ maxWidth: 360, marginBottom: 16 }}>
                    Sucursal
                    <select value={sucursalId} onChange={(event) => { setSucursalId(event.target.value); cargar(); }}>
                        <option value="">Todas (elige una para registrar)</option>
                        {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}
                    </select>
                </label>
            )}

            {cargando ? <p className="loading-state" role="status">Cargando compras…</p> :
                errorCarga ? <div className="notice is-error" role="alert">No se pudieron cargar los datos de compras: {errorCarga}</div> : (
                <>
                    {puedeRegistrar && (
                        <form className="surface-card" onSubmit={registrarCompra}>
                            <h2>Registrar compra</h2>
                            {proveedoresActivos.length === 0 && <p className="notice is-info">Registra primero un proveedor activo.</p>}
                            <div className="form-grid">
                                <label className="form-field">Proveedor<select required value={formulario.proveedorId} onChange={(event) => setFormulario({ ...formulario, proveedorId: event.target.value })}>
                                    <option value="">Selecciona un proveedor</option>
                                    {proveedoresActivos.map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
                                </select></label>
                                <label className="form-field">Número de factura<input maxLength="50" required value={formulario.numeroFactura} onChange={(event) => setFormulario({ ...formulario, numeroFactura: event.target.value })} /></label>
                                <label className="form-field">Insumo<select required value={detalle.insumoId} onChange={(event) => setDetalle({ ...detalle, insumoId: event.target.value })}>
                                    <option value="">Selecciona un insumo</option>
                                    {insumos.map((insumo) => <option key={insumo.id} value={insumo.id}>{insumo.nombre} · {insumo.unidadBase}</option>)}
                                </select></label>
                                <label className="form-field">Cantidad (unidad base)<input type="number" min="0.001" step="0.001" required value={detalle.cantidad} onChange={(event) => setDetalle({ ...detalle, cantidad: event.target.value })} /></label>
                                <label className="form-field">Costo unitario sin IVA ($)<input type="number" min="0" step="0.000001" required value={detalle.costoUnitario} onChange={(event) => setDetalle({ ...detalle, costoUnitario: event.target.value })} /></label>
                                <label className="form-field">Pago inicial ($)<input type="number" min="0" step="0.01" value={formulario.montoPagado} onChange={(event) => setFormulario({ ...formulario, montoPagado: event.target.value })} /></label>
                                <label className="form-field">Método de pago<select value={formulario.metodoPago} onChange={(event) => setFormulario({ ...formulario, metodoPago: event.target.value })}>
                                    {metodosPago.map((metodo) => <option key={metodo}>{metodo}</option>)}
                                </select></label>
                            </div>
                            {faltaSucursal && <p className="notice is-info">Selecciona la sucursal que recibe la compra.</p>}
                            <button className="primary-button" type="submit" disabled={procesando || faltaSucursal || !proveedoresActivos.length || !insumos.length} style={{ marginTop: 16 }}>{procesando ? 'Registrando…' : 'Registrar factura'}</button>
                        </form>
                    )}

                    {puedeRegistrar && (
                        <form className="surface-card" onSubmit={registrarProveedor}>
                            <h2>Registrar proveedor</h2>
                            <div className="form-grid">
                                <label className="form-field">Código<input maxLength="30" required value={nuevoProveedor.codigo} onChange={(event) => setNuevoProveedor({ ...nuevoProveedor, codigo: event.target.value })} /></label>
                                <label className="form-field">Nombre<input maxLength="150" required value={nuevoProveedor.nombre} onChange={(event) => setNuevoProveedor({ ...nuevoProveedor, nombre: event.target.value })} /></label>
                            </div>
                            <button className="secondary-button" type="submit" disabled={procesando} style={{ marginTop: 16 }}>Guardar proveedor</button>
                        </form>
                    )}

                    {puedeRegistrar && puedeVerCompras && (
                        <form className="surface-card" onSubmit={registrarPago}>
                            <h2>Abonar a cuenta por pagar</h2>
                            {pendientes.length === 0 ? <p className="empty-state">No hay compras con saldo pendiente.</p> : (
                                <div className="inline-form">
                                    <label className="form-field">Compra<select required value={pago.compraId} onChange={(event) => setPago({ ...pago, compraId: event.target.value })}>
                                        <option value="">Selecciona una compra</option>
                                        {pendientes.map((compra) => <option key={compra.id} value={compra.id}>{compra.numeroFactura} · {compra.proveedor?.nombre} · saldo {dinero(compra.saldo)}</option>)}
                                    </select></label>
                                    <label className="form-field">Método<select value={pago.metodo} onChange={(event) => setPago({ ...pago, metodo: event.target.value })}>
                                        {metodosPago.map((metodo) => <option key={metodo}>{metodo}</option>)}
                                    </select></label>
                                    <label className="form-field">Monto ($)<input type="number" min="0.01" step="0.01" required value={pago.monto} onChange={(event) => setPago({ ...pago, monto: event.target.value })} /></label>
                                    <button className="secondary-button" type="submit" disabled={procesando}>Registrar abono</button>
                                </div>
                            )}
                        </form>
                    )}

                    {puedeVerCompras && (
                        <section className="surface-card">
                            <h2>Facturas recientes</h2>
                            {compras.length === 0 ? <p className="empty-state">No hay compras registradas.</p> : (
                                <div className="data-table-wrap" tabIndex={0}>
                                    <table className="data-table">
                                        <thead><tr><th>Factura</th><th>Proveedor</th><th>Sucursal</th><th>Fecha</th><th>Total</th><th>Pagado</th><th>Saldo</th></tr></thead>
                                        <tbody>
                                            {compras.map((compra) => (
                                                <tr key={compra.id}>
                                                    <td>{compra.numeroFactura}</td>
                                                    <td>{compra.proveedor?.nombre}</td>
                                                    <td>{compra.sucursal?.nombre}</td>
                                                    <td>{new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium' }).format(new Date(compra.fecha))}</td>
                                                    <td>{dinero(compra.total)}</td>
                                                    <td>{dinero(compra.pagado)}</td>
                                                    <td><span className={`status-pill ${Number(compra.saldo) > 0 ? 'is-warning' : ''}`}>{dinero(compra.saldo)}</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    )}

                    {puedeVerProveedores && (
                        <section className="surface-card">
                            <h2>Proveedores</h2>
                            {proveedores.length === 0 ? <p className="empty-state">No hay proveedores registrados.</p> : (
                                <div className="data-table-wrap" tabIndex={0}>
                                    <table className="data-table">
                                        <thead><tr><th>Código</th><th>Nombre</th><th>Estado</th></tr></thead>
                                        <tbody>{proveedores.map((proveedor) => (
                                            <tr key={proveedor.id}><td>{proveedor.codigo}</td><td>{proveedor.nombre}</td><td><span className="status-pill">{proveedor.activo ? 'activo' : 'inactivo'}</span></td></tr>
                                        ))}</tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    )}
                </>
            )}
        </>
    );
}

export default ComprasPage;
