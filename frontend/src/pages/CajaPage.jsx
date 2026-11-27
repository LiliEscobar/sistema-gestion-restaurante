import { useCallback, useEffect, useState } from 'react';
import { ApiError, solicitudApi } from '../api.js';
import { puedeElegirSucursal as rolEligeSucursal } from '../permisos.js';

const metodos = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', digital: 'Pago digital', bitcoin: 'Bitcoin' };

function mostrarFechaHora(valor) {
    return new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor));
}

function dinero(valor) {
    return `$${Number(valor ?? 0).toFixed(2)}`;
}

// Contrato: Backend/src/controladores/cajaControlador.js (admin, gerente, cajero).
// Un turno no se edita ni se elimina: se abre, recibe cobros y movimientos, y se cierra con arqueo.
function CajaPage({ usuario }) {
    const eligeSucursal = rolEligeSucursal(usuario);
    const supervisa = usuario?.permisos?.includes('supervisar_caja');
    const [turno, setTurno] = useState(null);
    const [turnos, setTurnos] = useState([]);
    const [sucursales, setSucursales] = useState([]);
    const [sucursalId, setSucursalId] = useState(usuario?.sucursalId ? String(usuario.sucursalId) : '');
    const [fondoInicial, setFondoInicial] = useState('');
    const [tipoMovimiento, setTipoMovimiento] = useState('entrada');
    const [montoMovimiento, setMontoMovimiento] = useState('');
    const [motivo, setMotivo] = useState('');
    const [cobro, setCobro] = useState({ ventaId: '', metodo: 'efectivo', monto: '', referenciaExterna: '' });
    const [ventaCobro, setVentaCobro] = useState(null);
    const [efectivoContado, setEfectivoContado] = useState('');
    const [cierre, setCierre] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState('');
    const [errorTurnos, setErrorTurnos] = useState('');
    const [procesando, setProcesando] = useState(false);
    const [error, setError] = useState('');
    const [mensaje, setMensaje] = useState('');

    const [recarga, setRecarga] = useState(0);

    const cargar = useCallback(() => {
        setCargando(true);
        setErrorCarga('');
        setErrorTurnos('');
        setRecarga((actual) => actual + 1);
    }, []);

    useEffect(() => {
        let activo = true;
        solicitudApi('/caja/turnos/actual')
            .then((respuesta) => { if (activo) setTurno(respuesta.turno); })
            .catch((fallo) => {
                if (!activo) return;
                // 404 = el usuario no tiene turno abierto (estado válido, no es un error).
                if (fallo instanceof ApiError && fallo.status === 404) setTurno(null);
                else setErrorCarga(fallo.message);
            })
            .finally(() => { if (activo) setCargando(false); });
        if (supervisa) {
            solicitudApi('/caja/turnos?limite=20')
                .then((respuesta) => { if (activo) setTurnos(respuesta.turnos); })
                .catch((fallo) => { if (activo) setErrorTurnos(fallo.message); });
        }
        return () => { activo = false; };
    }, [supervisa, recarga]);

    useEffect(() => {
        if (!eligeSucursal) return undefined;
        let activo = true;
        solicitudApi('/sucursales')
            .then((respuesta) => { if (activo) setSucursales(respuesta.sucursales); })
            .catch((fallo) => { if (activo) setError(`No se pudieron cargar las sucursales: ${fallo.message}`); });
        return () => { activo = false; };
    }, [eligeSucursal]);

    async function ejecutar(path, body, textoExito) {
        setProcesando(true);
        setError('');
        setMensaje('');
        try {
            const respuesta = await solicitudApi(path, { method: 'POST', body });
            setMensaje(textoExito);
            cargar();
            return respuesta;
        } catch (fallo) {
            setError(fallo.message);
            return null;
        } finally {
            setProcesando(false);
        }
    }

    async function abrir(event) {
        event.preventDefault();
        setCierre(null);
        const respuesta = await ejecutar('/caja/turnos', {
            fondoInicial,
            ...(sucursalId ? { sucursalId: Number(sucursalId) } : {})
        }, 'Turno abierto.');
        if (respuesta) setFondoInicial('');
    }

    async function registrarMovimiento(event) {
        event.preventDefault();
        const respuesta = await ejecutar(`/caja/turnos/${turno.id}/movimientos`, {
            tipo: tipoMovimiento,
            monto: montoMovimiento,
            motivo: motivo.trim()
        }, 'Movimiento registrado.');
        if (respuesta) {
            setMontoMovimiento('');
            setMotivo('');
        }
    }

    async function consultarVenta() {
        setError('');
        setVentaCobro(null);
        try {
            const respuesta = await solicitudApi(`/ventas/${Number(cobro.ventaId)}`);
            setVentaCobro(respuesta.venta);
            setCobro((actual) => ({ ...actual, monto: Number(respuesta.venta.saldoPendiente).toFixed(2) }));
        } catch (fallo) {
            setError(fallo.message);
        }
    }

    async function cobrarVenta(event) {
        event.preventDefault();
        const respuesta = await ejecutar(`/caja/turnos/${turno.id}/cobros`, {
            ventaId: Number(cobro.ventaId),
            metodo: cobro.metodo,
            monto: cobro.monto,
            ...(cobro.referenciaExterna.trim() ? { referenciaExterna: cobro.referenciaExterna.trim() } : {})
        }, `Cobro de la venta #${cobro.ventaId} registrado.`);
        if (respuesta) {
            setCobro({ ventaId: '', metodo: 'efectivo', monto: '', referenciaExterna: '' });
            setVentaCobro(null);
        }
    }

    async function cerrar(event) {
        event.preventDefault();
        if (!window.confirm('¿Cerrar el turno? Después no podrá registrar cobros ni movimientos.')) return;
        const respuesta = await ejecutar(`/caja/turnos/${turno.id}/cierre`, { efectivoContado }, 'Turno cerrado.');
        if (respuesta) {
            setCierre(respuesta.turno);
            setEfectivoContado('');
        }
    }

    return (
        <>
            <header className="page-heading">
                <div>
                    <h1>Caja</h1>
                    <p>Apertura, cobros, movimientos y cierre del turno de tu usuario.</p>
                </div>
                <button className="secondary-button" type="button" onClick={cargar} disabled={cargando}>Actualizar</button>
            </header>
            {error && <div className="notice is-error" role="alert">{error}</div>}
            {mensaje && <div className="notice" role="status">{mensaje}</div>}
            {cierre && (
                <div className="notice" role="status">
                    Arqueo: esperado {dinero(cierre.efectivoEsperado)} · contado {dinero(cierre.efectivoContado)} · diferencia {dinero(cierre.diferencia)}.
                </div>
            )}
            {cargando ? <p className="loading-state">Consultando caja…</p> :
                errorCarga ? <div className="notice is-error" role="alert">No se pudo consultar tu turno: {errorCarga}</div> :
                !turno ? (
                    <form className="surface-card" onSubmit={abrir}>
                        <h2>Abrir turno</h2>
                        <p className="empty-state">No tienes un turno de caja abierto.</p>
                        <div className="inline-form">
                            {eligeSucursal && <label className="form-field">
                                Sucursal
                                <select required value={sucursalId} onChange={(event) => setSucursalId(event.target.value)}>
                                    <option value="">Selecciona una sucursal</option>
                                    {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}
                                </select>
                            </label>}
                            <label className="form-field">
                                Fondo inicial ($)
                                <input type="number" min="0" max="99999999.99" step="0.01" required value={fondoInicial} onChange={(event) => setFondoInicial(event.target.value)} />
                            </label>
                            <button className="primary-button" type="submit" disabled={procesando || (eligeSucursal && !sucursalId)}>{procesando ? 'Abriendo…' : 'Abrir caja'}</button>
                        </div>
                    </form>
                ) : (
                    <>
                        <section className="stats-grid">
                            <article className="stat-card">
                                <p className="stat-card-label">Turno #{turno.id}</p>
                                <p className="stat-card-value"><span className="status-pill">{turno.abierto ? 'abierto' : 'cerrado'}</span></p>
                                <p className="stat-card-note">{turno.sucursal?.nombre} · abierto {mostrarFechaHora(turno.fechaApertura)}</p>
                            </article>
                            <article className="stat-card">
                                <p className="stat-card-label">Fondo inicial</p>
                                <p className="stat-card-value">{dinero(turno.fondoInicial)}</p>
                            </article>
                            <article className="stat-card">
                                <p className="stat-card-label">Efectivo esperado</p>
                                <p className="stat-card-value">{dinero(turno.resumen?.efectivoEsperadoActual)}</p>
                                <p className="stat-card-note">Fondo + cobros en efectivo + entradas − salidas</p>
                            </article>
                        </section>

                        <section className="surface-card" style={{ marginTop: 16 }}>
                            <h2>Cobros por método</h2>
                            <div className="data-table-wrap">
                                <table className="data-table">
                                    <thead><tr><th>Método</th><th>Cobros</th><th>Total</th></tr></thead>
                                    <tbody>{Object.entries(turno.resumen?.porMetodo || {}).map(([metodo, fila]) => (
                                        <tr key={metodo}><td>{metodos[metodo] || metodo}</td><td>{fila.cobros}</td><td>{dinero(fila.total)}</td></tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        </section>

                        <form className="surface-card" onSubmit={cobrarVenta}>
                            <h2>Cobrar venta pendiente</h2>
                            <div className="inline-form">
                                <label className="form-field">
                                    N.º de venta
                                    <input type="number" min="1" step="1" required value={cobro.ventaId} onChange={(event) => { setCobro({ ...cobro, ventaId: event.target.value }); setVentaCobro(null); }} />
                                </label>
                                <button className="secondary-button" type="button" onClick={consultarVenta} disabled={!cobro.ventaId}>Consultar saldo</button>
                                <label className="form-field">
                                    Método
                                    <select value={cobro.metodo} onChange={(event) => setCobro({ ...cobro, metodo: event.target.value })}>
                                        {Object.entries(metodos).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
                                    </select>
                                </label>
                                <label className="form-field">
                                    Monto ($)
                                    <input type="number" min="0.01" step="0.01" required value={cobro.monto} onChange={(event) => setCobro({ ...cobro, monto: event.target.value })} />
                                </label>
                                {cobro.metodo !== 'efectivo' && (
                                    <label className="form-field">
                                        Referencia externa
                                        <input maxLength="60" value={cobro.referenciaExterna} onChange={(event) => setCobro({ ...cobro, referenciaExterna: event.target.value })} />
                                    </label>
                                )}
                                <button className="primary-button" type="submit" disabled={procesando}>Registrar cobro</button>
                            </div>
                            {ventaCobro && (
                                <p className="form-help">
                                    Venta #{ventaCobro.id} · {ventaCobro.sucursal?.nombre} · total {dinero(ventaCobro.total)} · cobrado {dinero(ventaCobro.cobrado)} · saldo {dinero(ventaCobro.saldoPendiente)}
                                </p>
                            )}
                        </form>

                        <form className="surface-card" onSubmit={registrarMovimiento}>
                            <h2>Registrar movimiento de efectivo</h2>
                            <div className="inline-form">
                                <label className="form-field">
                                    Tipo
                                    <select value={tipoMovimiento} onChange={(event) => setTipoMovimiento(event.target.value)}>
                                        <option value="entrada">Entrada</option>
                                        <option value="salida">Salida</option>
                                    </select>
                                </label>
                                <label className="form-field">
                                    Monto ($)
                                    <input type="number" min="0.01" max="99999999.99" step="0.01" required value={montoMovimiento} onChange={(event) => setMontoMovimiento(event.target.value)} />
                                </label>
                                <label className="form-field">
                                    Motivo
                                    <input maxLength="150" required value={motivo} onChange={(event) => setMotivo(event.target.value)} />
                                </label>
                                <button className="secondary-button" type="submit" disabled={procesando}>Registrar</button>
                            </div>
                        </form>

                        <section className="surface-card">
                            <h2>Movimientos de este turno</h2>
                            {turno.movimientos.length === 0 ? <p className="empty-state">No hay movimientos registrados.</p> : (
                                <div className="data-table-wrap">
                                    <table className="data-table">
                                        <thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Monto</th></tr></thead>
                                        <tbody>
                                            {turno.movimientos.map((movimiento) => (
                                                <tr key={movimiento.id}>
                                                    <td>{mostrarFechaHora(movimiento.fecha)}</td>
                                                    <td>{movimiento.tipo}</td>
                                                    <td>{movimiento.motivo}</td>
                                                    <td>{dinero(movimiento.monto)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>

                        <form className="surface-card" onSubmit={cerrar}>
                            <h2>Cerrar turno</h2>
                            <div className="inline-form">
                                <label className="form-field">
                                    Efectivo contado ($)
                                    <input type="number" min="0" max="99999999.99" step="0.01" required value={efectivoContado} onChange={(event) => setEfectivoContado(event.target.value)} />
                                </label>
                                <button className="danger-button" type="submit" disabled={procesando}>{procesando ? 'Cerrando…' : 'Cerrar caja'}</button>
                            </div>
                        </form>
                    </>
                )}

            {supervisa && (
                <section className="surface-card">
                    <h2>Turnos recientes</h2>
                    {errorTurnos ? <div className="notice is-error" role="alert">No se pudieron cargar los turnos: {errorTurnos}</div> :
                        turnos.length === 0 ? <p className="empty-state">No hay turnos registrados.</p> : (
                            <div className="data-table-wrap">
                                <table className="data-table">
                                    <thead><tr><th>Turno</th><th>Sucursal</th><th>Usuario</th><th>Apertura</th><th>Cierre</th><th>Diferencia</th></tr></thead>
                                    <tbody>{turnos.map((fila) => (
                                        <tr key={fila.id}>
                                            <td>#{fila.id}</td><td>{fila.sucursal?.nombre}</td><td>{fila.usuario?.nombreCompleto}</td>
                                            <td>{mostrarFechaHora(fila.fechaApertura)}</td>
                                            <td>{fila.fechaCierre ? mostrarFechaHora(fila.fechaCierre) : <span className="status-pill">abierto</span>}</td>
                                            <td>{fila.diferencia == null ? '—' : dinero(fila.diferencia)}</td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        )}
                </section>
            )}
        </>
    );
}

export default CajaPage;
