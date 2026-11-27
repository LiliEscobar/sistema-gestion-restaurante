import { useCallback, useEffect, useState } from 'react';
import { solicitudApi } from '../api.js';

function mostrarFecha(valor) {
    return new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(valor));
}

function dinero(valor) {
    return `$${Number(valor ?? 0).toFixed(2)}`;
}

function periodoActual() {
    const ahora = new Date();
    return { anio: ahora.getFullYear(), mes: ahora.getMonth() + 1, quincena: ahora.getDate() <= 15 ? 1 : 2 };
}

// Contrato: Backend/src/controladores/planillasControlador.js (admin, gerente).
// Generar la misma quincena dos veces no duplica. Una planilla generada no se edita ni se elimina,
// y el backend no registra el pago de planillas.
function PlanillasPage({ permisos = [] }) {
    const puedeVer = permisos.includes('ver_planillas');
    const puedeGenerar = permisos.includes('generar_planillas');
    const [planillas, setPlanillas] = useState([]);
    const [detalle, setDetalle] = useState(null);
    const [periodo, setPeriodo] = useState(periodoActual);
    const [simulacion, setSimulacion] = useState({ salarioMensual: '', quincena: 1 });
    const [resultadoSimulacion, setResultadoSimulacion] = useState(null);
    const [excluidos, setExcluidos] = useState([]);
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
        solicitudApi('/planillas')
            .then((respuesta) => { if (activo) setPlanillas(respuesta.planillas); })
            .catch((fallo) => { if (activo) setErrorCarga(fallo.message); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [puedeVer, recarga]);

    async function generar(event) {
        event.preventDefault();
        setProcesando(true);
        setError('');
        setMensaje('');
        setExcluidos([]);
        try {
            const respuesta = await solicitudApi('/planillas', {
                method: 'POST',
                body: { anio: Number(periodo.anio), mes: Number(periodo.mes), quincena: Number(periodo.quincena) }
            });
            setMensaje(respuesta.nuevos
                ? `Planilla generada: ${respuesta.nuevos} empleado(s) nuevos en el período.`
                : 'La planilla de ese período ya existía; no se agregaron empleados nuevos.');
            setExcluidos(respuesta.excluidos || []);
            setDetalle(respuesta.planilla);
            cargar();
        } catch (fallo) {
            setError(fallo.message);
            setExcluidos(fallo.data?.detalle?.excluidos || []);
        } finally {
            setProcesando(false);
        }
    }

    async function verDetalle(planilla) {
        setError('');
        try {
            const respuesta = await solicitudApi(`/planillas/${planilla.id}`);
            setDetalle(respuesta.planilla);
        } catch (fallo) {
            setError(fallo.message);
        }
    }

    async function simular(event) {
        event.preventDefault();
        setError('');
        setResultadoSimulacion(null);
        try {
            const respuesta = await solicitudApi('/planillas/simulacion', {
                method: 'POST',
                body: { salarioMensual: String(simulacion.salarioMensual), quincena: Number(simulacion.quincena) }
            });
            setResultadoSimulacion(respuesta);
        } catch (fallo) {
            setError(fallo.message);
        }
    }

    return (
        <>
            <header className="page-heading">
                <div>
                    <h1>Planillas</h1>
                    <p>Consulta períodos generados y calcula una quincena desde los salarios activos.</p>
                </div>
                <button className="secondary-button" type="button" onClick={cargar} disabled={cargando || !puedeVer}>Actualizar</button>
            </header>
            {error && <div className="notice is-error" role="alert">{error}</div>}
            {mensaje && <div className="notice" role="status">{mensaje}</div>}
            {excluidos.length > 0 && (
                <div className="notice is-info">
                    Excluidos: {excluidos.map((item) => `${item.nombre} (${item.motivo})`).join('; ')}.
                </div>
            )}

            {puedeGenerar && (
                <div className="form-grid">
                    <form className="surface-card" onSubmit={generar}>
                        <h2>Generar quincena</h2>
                        <div className="inline-form">
                            <label className="form-field">Año<input type="number" min="2000" max="2100" required value={periodo.anio} onChange={(event) => setPeriodo({ ...periodo, anio: event.target.value })} /></label>
                            <label className="form-field">Mes<input type="number" min="1" max="12" required value={periodo.mes} onChange={(event) => setPeriodo({ ...periodo, mes: event.target.value })} /></label>
                            <label className="form-field">Quincena<select value={periodo.quincena} onChange={(event) => setPeriodo({ ...periodo, quincena: event.target.value })}>
                                <option value={1}>1 (días 1–15)</option><option value={2}>2 (16–fin de mes)</option>
                            </select></label>
                            <button className="primary-button" type="submit" disabled={procesando}>
                                {procesando ? 'Generando…' : 'Generar planilla'}
                            </button>
                        </div>
                    </form>
                    <form className="surface-card" onSubmit={simular}>
                        <h2>Simular descuentos</h2>
                        <p className="form-help">Calcula ISSS, AFP y renta sin guardar nada.</p>
                        <div className="inline-form">
                            <label className="form-field">Salario mensual ($)<input type="number" min="0.01" step="0.01" required value={simulacion.salarioMensual} onChange={(event) => setSimulacion({ ...simulacion, salarioMensual: event.target.value })} /></label>
                            <label className="form-field">Quincena<select value={simulacion.quincena} onChange={(event) => setSimulacion({ ...simulacion, quincena: event.target.value })}>
                                <option value={1}>1</option><option value={2}>2</option>
                            </select></label>
                            <button className="secondary-button" type="submit">Simular</button>
                        </div>
                        {resultadoSimulacion && (
                            <p className="form-help">
                                Bruto {dinero(resultadoSimulacion.salario_bruto)} · ISSS {dinero(resultadoSimulacion.descuento_isss)} ·
                                AFP {dinero(resultadoSimulacion.descuento_afp)} · Renta {dinero(resultadoSimulacion.descuento_renta)} ·
                                Neto {dinero(resultadoSimulacion.salario_neto)}
                            </p>
                        )}
                    </form>
                </div>
            )}

            {detalle && (
                <section className="surface-card" style={{ marginTop: 16 }}>
                    <div className="page-heading">
                        <div>
                            <h2>Boletas {mostrarFecha(detalle.periodoInicio)} – {mostrarFecha(detalle.periodoFin)}</h2>
                            <p>{detalle.totales.empleados} empleado(s) · neto {dinero(detalle.totales.neto)}</p>
                        </div>
                        <button className="secondary-button" type="button" onClick={() => setDetalle(null)}>Cerrar</button>
                    </div>
                    {detalle.detalles.length === 0 ? <p className="empty-state">La planilla no tiene boletas.</p> : (
                        <div className="data-table-wrap" tabIndex={0}>
                            <table className="data-table">
                                <thead><tr><th>Empleado</th><th>Cargo</th><th>Sucursal</th><th>Salario quincena</th><th>ISSS</th><th>AFP</th><th>Renta</th><th>Neto</th></tr></thead>
                                <tbody>{detalle.detalles.map((fila) => (
                                    <tr key={fila.empleadoId}>
                                        <td>{fila.empleado.nombreCompleto}</td><td>{fila.empleado.cargo}</td><td>{fila.empleado.sucursal?.nombre}</td>
                                        <td>{dinero(fila.salarioPeriodo)}</td><td>{dinero(fila.isss)}</td><td>{dinero(fila.afp)}</td><td>{dinero(fila.renta)}</td><td>{dinero(fila.neto)}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            {!puedeVer ? (
                <div className="notice is-info">Tu cuenta no tiene acceso a las planillas.</div>
            ) : (
                <section className="surface-card" style={{ marginTop: 16 }}>
                    <h2>Períodos registrados</h2>
                    {cargando ? <p className="loading-state" role="status">Cargando planillas…</p> :
                        errorCarga ? <div className="notice is-error" role="alert">No se pudieron cargar las planillas: {errorCarga}</div> :
                        planillas.length === 0 ? <p className="empty-state">Todavía no hay planillas registradas.</p> : (
                        <div className="data-table-wrap" tabIndex={0}>
                            <table className="data-table">
                                <thead>
                                    <tr><th>Período</th><th>Empleados</th><th>Salarios</th><th>ISSS</th><th>AFP</th><th>Renta</th><th>Total neto</th><th>Acciones</th></tr>
                                </thead>
                                <tbody>
                                    {planillas.map((planilla) => (
                                        <tr key={planilla.id}>
                                            <td>{mostrarFecha(planilla.periodoInicio)} – {mostrarFecha(planilla.periodoFin)}</td>
                                            <td>{planilla.totales.empleados}</td>
                                            <td>{dinero(planilla.totales.salarios)}</td>
                                            <td>{dinero(planilla.totales.isss)}</td>
                                            <td>{dinero(planilla.totales.afp)}</td>
                                            <td>{dinero(planilla.totales.renta)}</td>
                                            <td>{dinero(planilla.totales.neto)}</td>
                                            <td><button className="secondary-button" type="button" onClick={() => verDetalle(planilla)}>Ver boletas</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}
        </>
    );
}

export default PlanillasPage;
