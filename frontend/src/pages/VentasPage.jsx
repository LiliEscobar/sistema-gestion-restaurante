import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, solicitudApi } from '../api.js';
import { puedeElegirSucursal as rolEligeSucursal } from '../permisos.js';

const metodosPago = [
    { valor: 'efectivo', texto: 'Efectivo' },
    { valor: 'tarjeta', texto: 'Tarjeta' },
    { valor: 'digital', texto: 'Pago digital' },
    { valor: 'bitcoin', texto: 'Bitcoin' }
];

const tiposDocumento = { consumidor_final: 'Factura', ccf: 'Crédito fiscal' };

function fechaHora(valor) {
    return new Intl.DateTimeFormat('es-SV', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor));
}

// Contrato: Backend/src/controladores/ventasControlador.js (admin, gerente, cajero).
// POST /api/ventas registra venta + inventario + documento + cobros en una transacción.
// Una venta registrada no se edita ni se elimina; los estados de cocina no existen en el backend.
function VentasPage({ permisos = [], usuario }) {
    const puedeRegistrar = permisos.includes('tomar_pedidos');
    const puedeVerVentas = permisos.includes('ver_ventas');
    const puedeVerMenu = permisos.includes('ver_menu');
    const eligeSucursal = rolEligeSucursal(usuario);
    const [productos, setProductos] = useState([]);
    const [ventas, setVentas] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [sucursales, setSucursales] = useState([]);
    const [turno, setTurno] = useState(null);
    const [sucursalId, setSucursalId] = useState(usuario?.sucursalId ? String(usuario.sucursalId) : '');
    const [productoId, setProductoId] = useState('');
    const [cantidad, setCantidad] = useState(1);
    const [carrito, setCarrito] = useState([]);
    const [tipoDocumento, setTipoDocumento] = useState('consumidor_final');
    const [clienteId, setClienteId] = useState('');
    const [cobrarAhora, setCobrarAhora] = useState(true);
    const [metodoPago, setMetodoPago] = useState('efectivo');
    const [referenciaExterna, setReferenciaExterna] = useState('');
    const [cargando, setCargando] = useState(puedeRegistrar && puedeVerMenu);
    const [errorCarga, setErrorCarga] = useState('');
    const [avisos, setAvisos] = useState([]);
    const [cargandoVentas, setCargandoVentas] = useState(puedeVerVentas);
    const [errorVentas, setErrorVentas] = useState('');
    const [procesando, setProcesando] = useState(false);
    const [error, setError] = useState('');
    const [confirmacion, setConfirmacion] = useState(null);

    const [recargaVentas, setRecargaVentas] = useState(0);

    const cargarVentas = useCallback(() => {
        setCargandoVentas(true);
        setErrorVentas('');
        setRecargaVentas((actual) => actual + 1);
    }, []);

    useEffect(() => {
        if (!puedeVerVentas) return undefined;
        let activo = true;
        solicitudApi('/ventas?limite=50')
            .then((respuesta) => { if (activo) setVentas(respuesta.ventas); })
            .catch((fallo) => { if (activo) setErrorVentas(fallo.message); })
            .finally(() => { if (activo) setCargandoVentas(false); });
        return () => { activo = false; };
    }, [puedeVerVentas, recargaVentas]);

    useEffect(() => {
        if (!puedeRegistrar || !puedeVerMenu) return undefined;
        let activo = true;
        // Solo el menú es indispensable. Clientes, turno y sucursales fallan por separado y avisan,
        // sin ocultar el formulario de venta.
        const avisar = (texto) => { if (activo) setAvisos((actuales) => [...actuales, texto]); };
        Promise.all([
            solicitudApi('/productos'),
            solicitudApi('/clientes?activo=true&limite=200').then((r) => r.clientes).catch((fallo) => {
                avisar(`No se pudieron cargar los clientes para crédito fiscal: ${fallo.message}`);
                return [];
            }),
            // 404 significa que el usuario no tiene turno abierto: la venta se registra sin cobro.
            solicitudApi('/caja/turnos/actual').then((r) => r.turno).catch((fallo) => {
                if (!(fallo instanceof ApiError && fallo.status === 404)) {
                    avisar(`No se pudo consultar tu turno de caja (${fallo.message}); la venta quedará sin cobrar.`);
                }
                return null;
            }),
            eligeSucursal
                ? solicitudApi('/sucursales').then((r) => r.sucursales).catch((fallo) => {
                    avisar(`No se pudieron cargar las sucursales: ${fallo.message}`);
                    return [];
                })
                : Promise.resolve([])
        ]).then(([respuestaProductos, listaClientes, turnoActual, listaSucursales]) => {
            if (!activo) return;
            setProductos(respuestaProductos.productos);
            setClientes(listaClientes.filter((cliente) => cliente.aptoCcf));
            setTurno(turnoActual);
            setSucursales(listaSucursales);
        }).catch((fallo) => {
            if (activo) setErrorCarga(fallo.message);
        }).finally(() => {
            if (activo) setCargando(false);
        });
        return () => { activo = false; };
    }, [puedeRegistrar, puedeVerMenu, eligeSucursal]);

    const total = useMemo(() => carrito.reduce(
        (suma, item) => suma + Math.round(Number(item.precioVenta) * 100) * item.cantidad,
        0
    ) / 100, [carrito]);

    // El cobro va al turno abierto, que pertenece a una sucursal: la venta debe ser de esa misma sucursal.
    const cobrar = Boolean(turno) && cobrarAhora;
    const sucursalVenta = cobrar ? String(turno.sucursalId) : sucursalId;

    function agregarProducto(event) {
        event.preventDefault();
        const producto = productos.find((item) => item.id === Number(productoId));
        if (!producto) {
            setError('Selecciona un producto del menú.');
            return;
        }
        if (!Number.isInteger(Number(cantidad)) || Number(cantidad) < 1 || Number(cantidad) > 999) {
            setError('La cantidad debe ser un número entero entre 1 y 999.');
            return;
        }

        setCarrito((actual) => {
            const existente = actual.find((item) => item.id === producto.id);
            if (existente) {
                return actual.map((item) => item.id === producto.id
                    ? { ...item, cantidad: item.cantidad + Number(cantidad) }
                    : item);
            }
            return [...actual, { ...producto, cantidad: Number(cantidad) }];
        });
        setProductoId('');
        setCantidad(1);
        setError('');
        setConfirmacion(null);
    }

    async function registrarVenta(event) {
        event.preventDefault();
        if (carrito.length === 0) {
            setError('Agrega al menos un producto a la venta.');
            return;
        }
        if (tipoDocumento === 'ccf' && !clienteId) {
            setError('El crédito fiscal requiere un cliente con razón social, NIT y NRC.');
            return;
        }

        setProcesando(true);
        setError('');
        setConfirmacion(null);
        try {
            const respuesta = await solicitudApi('/ventas', {
                method: 'POST',
                body: {
                    ...(sucursalVenta ? { sucursalId: Number(sucursalVenta) } : {}),
                    tipoDocumento,
                    ...(tipoDocumento === 'ccf' ? { clienteId: Number(clienteId) } : {}),
                    lineas: carrito.map((item) => ({ productoId: item.id, cantidad: item.cantidad })),
                    ...(cobrar ? {
                        turnoId: turno.id,
                        pagos: [{
                            metodo: metodoPago,
                            monto: total.toFixed(2),
                            ...(referenciaExterna.trim() ? { referenciaExterna: referenciaExterna.trim() } : {})
                        }]
                    } : {})
                }
            });
            setConfirmacion(respuesta.venta);
            setCarrito([]);
            setReferenciaExterna('');
            cargarVentas();
        } catch (fallo) {
            setError(fallo instanceof ApiError ? fallo.message : 'No se pudo registrar la venta.');
        } finally {
            setProcesando(false);
        }
    }

    const faltaSucursal = eligeSucursal && !sucursalVenta;

    return (
        <>
            <header className="page-heading">
                <div>
                    <h1>Ventas</h1>
                    <p>Registra la venta, el pago y el descuento de inventario en una sola operación.</p>
                </div>
            </header>
            {error && <div className="notice is-error" role="alert">{error}</div>}
            {confirmacion && (
                <div className="notice" role="status">
                    Venta #{confirmacion.id} registrada por ${Number(confirmacion.total).toFixed(2)}
                    {confirmacion.documento && ` · ${tiposDocumento[confirmacion.documento.tipoDocumento] || confirmacion.documento.tipoDocumento} ${confirmacion.documento.correlativo ?? ''}`}
                    {Number(confirmacion.saldoPendiente) > 0 && ` · Saldo pendiente $${Number(confirmacion.saldoPendiente).toFixed(2)} (cóbralo desde Caja).`}
                </div>
            )}

            {!puedeRegistrar && !puedeVerVentas && (
                <div className="notice is-info" role="status">
                    Tu rol ({usuario?.rol || 'sin rol'}) no tiene acceso a ventas. Solo administrador, gerente y cajero pueden registrarlas o consultarlas.
                </div>
            )}
            {avisos.map((aviso) => <div className="notice is-info" role="status" key={aviso}>{aviso}</div>)}

            {puedeRegistrar && !puedeVerMenu && (
                <div className="notice is-error" role="alert">
                    Tu cuenta puede registrar ventas, pero no tiene acceso al menú.
                </div>
            )}

            {puedeRegistrar && puedeVerMenu && (cargando ? <p className="loading-state">Cargando menú…</p> :
                errorCarga ? <div className="notice is-error" role="alert">No se pudo preparar el registro de ventas: {errorCarga}</div> : (
                <>
                    <section className="surface-card">
                        <h2>Agregar productos</h2>
                        {productos.length === 0 ? (
                            <p className="empty-state">No hay productos activos para vender.</p>
                        ) : (
                            <form className="inline-form" onSubmit={agregarProducto}>
                                <label className="form-field">
                                    Producto
                                    <select required value={productoId} onChange={(event) => setProductoId(event.target.value)}>
                                        <option value="">Selecciona un producto</option>
                                        {productos.map((producto) => (
                                            <option key={producto.id} value={producto.id}>
                                                {producto.nombre} · ${Number(producto.precioVenta).toFixed(2)}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="form-field" style={{ maxWidth: 130 }}>
                                    Cantidad
                                    <input min="1" max="999" step="1" type="number" value={cantidad} onChange={(event) => setCantidad(event.target.value)} />
                                </label>
                                <button className="secondary-button" type="submit">Agregar</button>
                            </form>
                        )}
                    </section>

                    <form onSubmit={registrarVenta}>
                        <section className="surface-card">
                            <h2>Detalle de venta</h2>
                            {carrito.length === 0 ? <p className="empty-state">Todavía no hay productos en esta venta.</p> : (
                                <ul className="cart-list">
                                    {carrito.map((item) => (
                                        <li className="cart-row" key={item.id}>
                                            <span><strong>{item.nombre}</strong><br />${Number(item.precioVenta).toFixed(2)} por unidad</span>
                                            <input
                                                aria-label={`Cantidad de ${item.nombre}`}
                                                min="1"
                                                max="999"
                                                step="1"
                                                type="number"
                                                value={item.cantidad}
                                                onChange={(event) => {
                                                    const next = Number(event.target.value);
                                                    if (!Number.isInteger(next) || next < 1) return;
                                                    setCarrito((actual) => actual.map((producto) =>
                                                        producto.id === item.id ? { ...producto, cantidad: next } : producto
                                                    ));
                                                }}
                                            />
                                            <button
                                                className="danger-button"
                                                type="button"
                                                aria-label={`Quitar ${item.nombre}`}
                                                onClick={() => setCarrito((actual) => actual.filter((producto) => producto.id !== item.id))}
                                            >
                                                Quitar
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="sales-total">
                                <span>Total</span>
                                <strong>${total.toFixed(2)}</strong>
                            </div>
                            <div className="form-grid sales-options">
                                {eligeSucursal && (
                                    <label className="form-field">
                                        Sucursal
                                        <select required value={sucursalVenta} disabled={cobrar} onChange={(event) => setSucursalId(event.target.value)}>
                                            <option value="">Selecciona una sucursal</option>
                                            {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}
                                            {sucursalVenta && !sucursales.some((sucursal) => String(sucursal.id) === sucursalVenta) && (
                                                <option value={sucursalVenta}>{(cobrar && turno.sucursal?.nombre) || `Sucursal #${sucursalVenta}`}</option>
                                            )}
                                        </select>
                                    </label>
                                )}
                                <label className="form-field">
                                    Documento
                                    <select value={tipoDocumento} onChange={(event) => setTipoDocumento(event.target.value)}>
                                        <option value="consumidor_final">Factura (consumidor final)</option>
                                        <option value="ccf">Crédito fiscal</option>
                                    </select>
                                </label>
                                {tipoDocumento === 'ccf' && (
                                    <label className="form-field">
                                        Cliente (CCF)
                                        <select required value={clienteId} onChange={(event) => setClienteId(event.target.value)}>
                                            <option value="">{clientes.length ? 'Selecciona un cliente' : 'No hay clientes aptos para CCF'}</option>
                                            {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.razonSocial} · NIT {cliente.nit}</option>)}
                                        </select>
                                    </label>
                                )}
                                {turno ? (
                                    <>
                                        <label className="form-field sales-pending-option">
                                            <span>Pago</span>
                                            <span><input type="checkbox" checked={cobrarAhora} onChange={(event) => setCobrarAhora(event.target.checked)} /> Cobrar ahora en mi turno de caja ({turno.sucursal?.nombre})</span>
                                        </label>
                                        {cobrarAhora && (
                                            <>
                                                <label className="form-field">
                                                    Método de pago
                                                    <select value={metodoPago} onChange={(event) => setMetodoPago(event.target.value)}>
                                                        {metodosPago.map((metodo) => <option key={metodo.valor} value={metodo.valor}>{metodo.texto}</option>)}
                                                    </select>
                                                </label>
                                                {metodoPago !== 'efectivo' && (
                                                    <label className="form-field">
                                                        Referencia externa
                                                        <input maxLength="60" value={referenciaExterna} onChange={(event) => setReferenciaExterna(event.target.value)} />
                                                    </label>
                                                )}
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <p className="notice is-info">No tienes un turno de caja abierto: la venta quedará pendiente de cobro. Abre un turno en Caja para cobrar.</p>
                                )}
                            </div>
                            <div className="sales-submit">
                                {carrito.length === 0 && <span className="form-help">Agrega al menos un producto para registrar la venta. </span>}
                                {faltaSucursal && <span className="form-help">Selecciona la sucursal de la venta. </span>}
                                <button className="primary-button" type="submit" disabled={procesando || carrito.length === 0 || faltaSucursal}>
                                    {procesando ? 'Registrando…' : 'Registrar venta'}
                                </button>
                            </div>
                        </section>
                    </form>
                </>
            ))}

            {puedeVerVentas && (
                <section className="surface-card">
                    <div className="page-heading">
                        <h2>Ventas recientes</h2>
                        <button className="secondary-button" type="button" onClick={cargarVentas} disabled={cargandoVentas}>Actualizar</button>
                    </div>
                    {cargandoVentas ? <p className="loading-state">Cargando ventas…</p> :
                        errorVentas ? <div className="notice is-error" role="alert">No se pudieron cargar las ventas: {errorVentas}</div> :
                        ventas.length === 0 ? <p className="empty-state">No hay ventas registradas.</p> : (
                            <div className="data-table-wrap">
                                <table className="data-table">
                                    <thead><tr><th>Fecha</th><th>Venta</th><th>Documento</th><th>Sucursal</th><th>Atendió</th><th>Líneas</th><th>Total</th></tr></thead>
                                    <tbody>
                                        {ventas.map((venta) => {
                                            const documento = venta.documentos?.[0];
                                            return (
                                                <tr key={venta.id}>
                                                    <td>{fechaHora(venta.fecha)}</td>
                                                    <td>#{venta.id}</td>
                                                    <td>{documento ? `${tiposDocumento[documento.tipoDocumento] || documento.tipoDocumento} ${documento.correlativo ?? ''}` : '—'}</td>
                                                    <td>{venta.sucursal?.nombre || '—'}</td>
                                                    <td>{venta.usuario?.nombreCompleto || '—'}</td>
                                                    <td>{venta._count?.detalles ?? '—'}</td>
                                                    <td>${Number(venta.total).toFixed(2)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                </section>
            )}
        </>
    );
}

export default VentasPage;
