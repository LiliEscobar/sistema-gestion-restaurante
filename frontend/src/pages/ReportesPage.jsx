import { useCallback, useEffect, useState } from 'react';
import { solicitudApi } from '../api.js';
import { puedeElegirSucursal as rolEligeSucursal } from '../permisos.js';

const metodos = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', digital: 'Pago digital', bitcoin: 'Bitcoin' };
const documentos = { consumidor_final: 'Factura', ccf: 'Crédito fiscal' };
const secciones = ['ventas', 'inventario', 'compras', 'caja', 'planillas'];

function dinero(valor) {
    return `$${Number(valor ?? 0).toFixed(2)}`;
}
function mostrarFecha(valor, conHora = false) {
    return new Intl.DateTimeFormat('es-SV', conHora ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(valor));
}
function textoFecha(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function periodoInicial() {
    const hasta = new Date();
    const desde = new Date(hasta);
    desde.setDate(desde.getDate() - 29);
    return { desde: textoFecha(desde), hasta: textoFecha(hasta) };
}

// Contrato: Backend/src/controladores/reportesControlador.js (admin y gerente; gerente solo su sucursal).
// Cada sección se consulta por separado: si una falla, las demás se muestran.
function ReportesPage({ usuario }) {
    const puedeVer = usuario?.permisos?.includes('ver_reportes');
    const eligeSucursal = rolEligeSucursal(usuario);
    const [filtro, setFiltro] = useState(() => ({ ...periodoInicial(), sucursalId: '' }));
    const [aplicado, setAplicado] = useState(filtro);
    const [sucursales, setSucursales] = useState([]);
    const [datos, setDatos] = useState({});
    const [errores, setErrores] = useState({});
    const [cargando, setCargando] = useState(Boolean(puedeVer));

    const consultar = useCallback((event) => {
        event?.preventDefault();
        setCargando(true);
        setErrores({});
        setAplicado({ ...filtro });
    }, [filtro]);

    useEffect(() => {
        if (!eligeSucursal) return undefined;
        let activo = true;
        solicitudApi('/sucursales').then((r) => { if (activo) setSucursales(r.sucursales); }).catch(() => {});
        return () => { activo = false; };
    }, [eligeSucursal]);

    useEffect(() => {
        if (!puedeVer) return undefined;
        let activo = true;
        const query = new URLSearchParams(Object.entries(aplicado).filter(([, valor]) => valor)).toString();
        Promise.all(secciones.map((seccion) => solicitudApi(`/reportes/${seccion}?${query}`)
            .then((respuesta) => [seccion, respuesta, null])
            .catch((fallo) => [seccion, null, fallo.message])
        )).then((resultados) => {
            if (!activo) return;
            setDatos(Object.fromEntries(resultados.map(([seccion, respuesta]) => [seccion, respuesta])));
            setErrores(Object.fromEntries(resultados.filter(([, , fallo]) => fallo).map(([seccion, , fallo]) => [seccion, fallo])));
            setCargando(false);
        });
        return () => { activo = false; };
    }, [puedeVer, aplicado]);

    if (!puedeVer) return <div className="notice is-info">Los reportes están disponibles para administración y gerencia.</div>;

    const tabla = (titulo, seccion, contenido) => (
        <section className="surface-card">
            <h2>{titulo}</h2>
            {cargando ? <p className="loading-state">Cargando…</p> :
                errores[seccion] ? <div className="notice is-error" role="alert">No se pudo cargar: {errores[seccion]}</div> :
                datos[seccion] ? contenido(datos[seccion]) : null}
        </section>
    );
    const vacia = (filas, texto, render) => (filas.length === 0 ? <p className="empty-state">{texto}</p> : render());

    return (
        <>
            <header className="page-heading">
                <div>
                    <h1>Reportes</h1>
                    <p>Resultados del período {aplicado.desde} a {aplicado.hasta}{eligeSucursal ? '' : ' de tu sucursal'}.</p>
                </div>
            </header>
            <form className="surface-card" onSubmit={consultar}>
                <div className="inline-form">
                    <label className="form-field">Desde<input type="date" required value={filtro.desde} onChange={(event) => setFiltro({ ...filtro, desde: event.target.value })} /></label>
                    <label className="form-field">Hasta<input type="date" required value={filtro.hasta} onChange={(event) => setFiltro({ ...filtro, hasta: event.target.value })} /></label>
                    {eligeSucursal && (
                        <label className="form-field">Sucursal<select value={filtro.sucursalId} onChange={(event) => setFiltro({ ...filtro, sucursalId: event.target.value })}>
                            <option value="">Todas</option>
                            {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}
                        </select></label>
                    )}
                    <button className="primary-button" type="submit" disabled={cargando}>Consultar</button>
                </div>
            </form>

            {tabla('Ventas', 'ventas', (r) => (
                <>
                    <section className="stats-grid">
                        <article className="stat-card"><p className="stat-card-label">Ventas</p><p className="stat-card-value">{r.resumen.ventas}</p><p className="stat-card-note">Ticket promedio {dinero(r.resumen.ticketPromedio)}</p></article>
                        <article className="stat-card"><p className="stat-card-label">Total vendido</p><p className="stat-card-value">{dinero(r.resumen.total)}</p><p className="stat-card-note">IVA {dinero(r.resumen.iva)}</p></article>
                        <article className="stat-card"><p className="stat-card-label">Pendiente de cobro</p><p className="stat-card-value">{dinero(r.resumen.pendienteCobro)}</p><p className="stat-card-note">Cobrado {dinero(r.resumen.cobrado)}</p></article>
                    </section>
                    {vacia(r.porProducto, 'No hubo ventas en el período.', () => (
                        <div className="data-table-wrap">
                            <table className="data-table">
                                <thead><tr><th>Producto más vendido</th><th>Unidades</th><th>Importe</th></tr></thead>
                                <tbody>{r.porProducto.map((fila) => <tr key={fila.productoId}><td>{fila.nombre}</td><td>{fila.cantidad}</td><td>{dinero(fila.importe)}</td></tr>)}</tbody>
                            </table>
                        </div>
                    ))}
                    {r.porDia.length > 0 && (
                        <div className="data-table-wrap">
                            <table className="data-table">
                                <thead><tr><th>Día</th><th>Ventas</th><th>Total</th></tr></thead>
                                <tbody>{r.porDia.map((fila) => <tr key={fila.dia}><td>{mostrarFecha(fila.dia)}</td><td>{fila.ventas}</td><td>{dinero(fila.total)}</td></tr>)}</tbody>
                            </table>
                        </div>
                    )}
                    {(r.porMetodo.length > 0 || r.porDocumento.length > 0) && (
                        <div className="form-grid">
                            <div className="data-table-wrap">
                                <table className="data-table">
                                    <thead><tr><th>Método de cobro</th><th>Cobros</th><th>Total</th></tr></thead>
                                    <tbody>{r.porMetodo.map((fila) => <tr key={fila.metodo}><td>{metodos[fila.metodo] || fila.metodo}</td><td>{fila.cobros}</td><td>{dinero(fila.total)}</td></tr>)}</tbody>
                                </table>
                            </div>
                            <div className="data-table-wrap">
                                <table className="data-table">
                                    <thead><tr><th>Documento</th><th>Emitidos</th><th>Total</th></tr></thead>
                                    <tbody>{r.porDocumento.map((fila) => <tr key={fila.tipoDocumento}><td>{documentos[fila.tipoDocumento] || fila.tipoDocumento}</td><td>{fila.documentos}</td><td>{dinero(fila.total)}</td></tr>)}</tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            ))}

            {tabla('Inventario', 'inventario', (r) => (
                <>
                    <p>{r.alertas.length} insumo(s) en o bajo el mínimo, {r.agotados} agotado(s). Movimientos del período: {r.movimientos.map((m) => `${m.tipo} ${m.movimientos}`).join(' · ') || 'ninguno'}.</p>
                    {vacia(r.alertas, 'No hay alertas de stock.', () => (
                        <div className="data-table-wrap">
                            <table className="data-table">
                                <thead><tr><th>Sucursal</th><th>Insumo</th><th>Actual</th><th>Mínimo</th></tr></thead>
                                <tbody>{r.alertas.map((fila) => <tr key={`${fila.sucursalId}-${fila.insumoId}`}><td>{fila.sucursal}</td><td>{fila.insumo}</td><td>{Number(fila.cantidadActual)} {fila.unidad}</td><td>{Number(fila.cantidadMinima)} {fila.unidad}</td></tr>)}</tbody>
                            </table>
                        </div>
                    ))}
                </>
            ))}

            {tabla('Compras y cuentas por pagar', 'compras', (r) => (
                <>
                    <p>{r.resumen.compras} compra(s) en el período por {dinero(r.resumen.total)} (IVA {dinero(r.resumen.iva)}). Saldo pendiente actual: {dinero(r.resumen.saldoPendiente)}.</p>
                    {vacia(r.cuentasPorPagar, 'No hay cuentas por pagar.', () => (
                        <div className="data-table-wrap">
                            <table className="data-table">
                                <thead><tr><th>Proveedor</th><th>Facturas con saldo</th><th>Saldo</th></tr></thead>
                                <tbody>{r.cuentasPorPagar.map((fila) => <tr key={fila.proveedorId}><td>{fila.proveedor}</td><td>{fila.facturas}</td><td>{dinero(fila.saldo)}</td></tr>)}</tbody>
                            </table>
                        </div>
                    ))}
                </>
            ))}

            {tabla('Caja', 'caja', (r) => (
                <>
                    <p>{r.resumen.turnos} turno(s) cerrados · diferencia neta {dinero(r.resumen.diferenciaNeta)} · {r.resumen.conFaltante} con faltante · {r.resumen.conSobrante} con sobrante.</p>
                    {vacia(r.turnos, 'No se cerraron turnos en el período.', () => (
                        <div className="data-table-wrap">
                            <table className="data-table">
                                <thead><tr><th>Turno</th><th>Sucursal</th><th>Usuario</th><th>Cierre</th><th>Esperado</th><th>Contado</th><th>Diferencia</th></tr></thead>
                                <tbody>{r.turnos.map((t) => <tr key={t.id}><td>#{t.id}</td><td>{t.sucursal?.nombre}</td><td>{t.usuario?.nombreCompleto}</td><td>{mostrarFecha(t.fechaCierre, true)}</td><td>{dinero(t.efectivoEsperado)}</td><td>{dinero(t.efectivoContado)}</td><td>{dinero(t.diferencia)}</td></tr>)}</tbody>
                            </table>
                        </div>
                    ))}
                </>
            ))}

            {tabla('Planillas', 'planillas', (r) => vacia(r.planillas, 'No hay planillas en el período.', () => (
                <div className="data-table-wrap">
                    <table className="data-table">
                        <thead><tr><th>Período</th><th>Empleados</th><th>Salarios</th><th>ISSS</th><th>AFP</th><th>Renta</th><th>Neto</th></tr></thead>
                        <tbody>{r.planillas.map((p) => <tr key={p.id}><td>{mostrarFecha(p.periodoInicio)} – {mostrarFecha(p.periodoFin)}</td><td>{p.empleados}</td><td>{dinero(p.salarios)}</td><td>{dinero(p.isss)}</td><td>{dinero(p.afp)}</td><td>{dinero(p.renta)}</td><td>{dinero(p.neto)}</td></tr>)}</tbody>
                    </table>
                </div>
            )))}
        </>
    );
}

export default ReportesPage;
