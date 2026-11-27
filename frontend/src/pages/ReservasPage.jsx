import { useCallback, useEffect, useState } from 'react';
import { solicitudApi } from '../api.js';
import { puedeElegirSucursal as rolEligeSucursal } from '../permisos.js';

const nombresEstado = {
    pendiente: 'Pendiente', confirmada: 'Confirmada', sentada: 'En mesa',
    completada: 'Completada', cancelada: 'Cancelada', no_asistio: 'No asistió'
};
// Mismas transiciones que Backend/src/services/reserva.service.js (el servidor las vuelve a validar).
const acciones = {
    pendiente: [['confirmada', 'Confirmar'], ['sentada', 'Sentar'], ['no_asistio', 'No asistió'], ['cancelada', 'Cancelar']],
    confirmada: [['sentada', 'Sentar'], ['no_asistio', 'No asistió'], ['cancelada', 'Cancelar']],
    sentada: [['completada', 'Completar']]
};
const duraciones = [30, 60, 90, 120, 150, 180, 210, 240];

function mostrarFechaHora(valor) {
    return new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor));
}
function hora(valor) {
    return new Intl.DateTimeFormat('es-SV', { timeStyle: 'short' }).format(new Date(valor));
}
function local(fecha) {
    const p = (n) => String(n).padStart(2, '0');
    return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}T${p(fecha.getHours())}:${p(fecha.getMinutes())}`;
}
function proximaMediaHora() {
    const fecha = new Date();
    fecha.setMinutes(fecha.getMinutes() < 30 ? 30 : 60, 0, 0);
    return local(fecha);
}
const aIso = (valorLocal) => new Date(valorLocal).toISOString();

// Contrato: Backend/src/controladores/reservasControlador.js
// Reservas: admin, gerente y cajero de la sucursal. Mesas: alta, edición y baja para admin y gerente.
// Sin borrado: una reserva se cancela y una mesa se desactiva. Si el servidor responde 503, falta la migración.
function ReservasPage({ permisos = [], usuario }) {
    const puedeVer = permisos.includes('ver_reservas');
    const puedeReservar = permisos.includes('gestionar_reservas');
    const puedeGestionarMesas = permisos.includes('gestionar_mesas');
    const eligeSucursal = rolEligeSucursal(usuario);
    const [sucursales, setSucursales] = useState([]);
    const [sucursalId, setSucursalId] = useState(usuario?.sucursalId ? String(usuario.sucursalId) : '');
    const [mesas, setMesas] = useState([]);
    const [reservas, setReservas] = useState([]);
    const [filtro, setFiltro] = useState({ desde: local(new Date(new Date().setHours(0, 0, 0, 0))), dias: '14', estado: '' });
    const [busqueda, setBusqueda] = useState({ inicio: proximaMediaHora(), duracionMinutos: '90', personas: '2' });
    const [disponibles, setDisponibles] = useState(null);
    const [nueva, setNueva] = useState({ mesaId: '', clienteNombre: '', clienteTelefono: '', notas: '' });
    const [nuevaMesa, setNuevaMesa] = useState({ numero: '', capacidad: '4' });
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
        if (!eligeSucursal) return undefined;
        let activo = true;
        solicitudApi('/sucursales')
            .then((respuesta) => { if (activo) setSucursales(respuesta.sucursales); })
            .catch((fallo) => { if (activo) setError(`No se pudieron cargar las sucursales: ${fallo.message}`); });
        return () => { activo = false; };
    }, [eligeSucursal]);

    useEffect(() => {
        if (!puedeVer) return undefined;
        let activo = true;
        const desde = new Date(filtro.desde);
        const hasta = new Date(desde.getTime() + Number(filtro.dias) * 24 * 60 * 60 * 1000);
        const query = new URLSearchParams({ desde: desde.toISOString(), hasta: hasta.toISOString(), limite: '200' });
        if (eligeSucursal && sucursalId) query.set('sucursalId', sucursalId);
        if (filtro.estado) query.set('estado', filtro.estado);
        Promise.all([
            solicitudApi(`/mesas${eligeSucursal && sucursalId ? `?sucursalId=${sucursalId}` : ''}`),
            solicitudApi(`/reservas?${query}`)
        ]).then(([respuestaMesas, respuestaReservas]) => {
            if (!activo) return;
            setMesas(respuestaMesas.mesas);
            setReservas(respuestaReservas.reservas);
        }).catch((fallo) => {
            if (activo) setErrorCarga(fallo.message);
        }).finally(() => {
            if (activo) setCargando(false);
        });
        return () => { activo = false; };
    }, [puedeVer, eligeSucursal, sucursalId, filtro, recarga]);

    async function operar(path, method, body, textoExito) {
        setProcesando(true);
        setError('');
        setMensaje('');
        try {
            const respuesta = await solicitudApi(path, { method, body });
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

    async function buscar(event) {
        event.preventDefault();
        setError('');
        setDisponibles(null);
        setNueva((actual) => ({ ...actual, mesaId: '' }));
        try {
            const query = new URLSearchParams({ inicio: aIso(busqueda.inicio), duracionMinutos: busqueda.duracionMinutos, personas: busqueda.personas });
            if (eligeSucursal && sucursalId) query.set('sucursalId', sucursalId);
            const respuesta = await solicitudApi(`/reservas/disponibilidad?${query}`);
            setDisponibles(respuesta.mesas);
        } catch (fallo) {
            setError(fallo.message);
        }
    }

    async function reservar(event) {
        event.preventDefault();
        const respuesta = await operar('/reservas', 'POST', {
            ...(eligeSucursal && sucursalId ? { sucursalId: Number(sucursalId) } : {}),
            mesaId: Number(nueva.mesaId),
            clienteNombre: nueva.clienteNombre.trim(),
            clienteTelefono: nueva.clienteTelefono.trim() || null,
            notas: nueva.notas.trim() || null,
            personas: Number(busqueda.personas),
            inicio: aIso(busqueda.inicio),
            duracionMinutos: Number(busqueda.duracionMinutos)
        }, 'Reserva registrada.');
        if (respuesta) {
            setNueva({ mesaId: '', clienteNombre: '', clienteTelefono: '', notas: '' });
            setDisponibles(null);
        }
    }

    function cambiarEstado(reserva, estado) {
        if (['cancelada', 'no_asistio'].includes(estado) &&
            !window.confirm(`¿Marcar la reserva de ${reserva.clienteNombre} como "${nombresEstado[estado]}"? No se puede deshacer.`)) return;
        operar(`/reservas/${reserva.id}/estado`, 'POST', { estado }, `Reserva de ${reserva.clienteNombre}: ${nombresEstado[estado]}.`);
    }

    function reprogramar(reserva) {
        const valor = window.prompt('Nueva fecha y hora (AAAA-MM-DDTHH:MM):', local(new Date(reserva.inicio)));
        if (!valor) return;
        const fecha = new Date(valor);
        if (Number.isNaN(fecha.getTime())) {
            setError('La fecha y hora no es válida. Usa el formato AAAA-MM-DDTHH:MM.');
            return;
        }
        operar(`/reservas/${reserva.id}`, 'PATCH', { inicio: fecha.toISOString() }, 'Reserva reprogramada.');
    }

    async function crearMesa(event) {
        event.preventDefault();
        const ok = await operar('/mesas', 'POST', {
            ...(eligeSucursal && sucursalId ? { sucursalId: Number(sucursalId) } : {}),
            numero: nuevaMesa.numero.trim(),
            capacidad: Number(nuevaMesa.capacidad)
        }, `Mesa ${nuevaMesa.numero.trim()} creada.`);
        if (ok) setNuevaMesa({ numero: '', capacidad: '4' });
    }

    function editarCapacidad(mesa) {
        const valor = window.prompt(`Capacidad de la mesa ${mesa.numero} (1 a 50):`, String(mesa.capacidad));
        if (!valor || Number(valor) === mesa.capacidad) return;
        operar(`/mesas/${mesa.id}`, 'PATCH', { capacidad: Number(valor) }, `Capacidad de la mesa ${mesa.numero} actualizada.`);
    }

    function cambiarEstadoMesa(mesa) {
        if (mesa.activo && !window.confirm(`¿Desactivar la mesa ${mesa.numero}? No se podrá reservar.`)) return;
        operar(`/mesas/${mesa.id}`, 'PATCH', { activo: !mesa.activo }, `Mesa ${mesa.numero} ${mesa.activo ? 'desactivada' : 'reactivada'}.`);
    }

    if (!puedeVer) return <div className="notice is-info">Tu rol no tiene acceso a reservas. Solo administrador, gerente y cajero las gestionan.</div>;

    const faltaSucursal = eligeSucursal && !sucursalId;

    return (
        <>
            <header className="page-heading">
                <div>
                    <h1>Reservas y mesas</h1>
                    <p>Disponibilidad, reservas del período y estado de las mesas.</p>
                </div>
                <button className="secondary-button" type="button" onClick={cargar} disabled={cargando}>Actualizar</button>
            </header>
            {error && <div className="notice is-error" role="alert">{error}</div>}
            {mensaje && <div className="notice" role="status">{mensaje}</div>}

            {eligeSucursal && (
                <label className="form-field" style={{ maxWidth: 360, marginBottom: 16 }}>
                    Sucursal
                    <select value={sucursalId} onChange={(event) => { setSucursalId(event.target.value); setDisponibles(null); cargar(); }}>
                        <option value="">Todas (elige una para reservar)</option>
                        {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}
                    </select>
                </label>
            )}

            {cargando ? <p className="loading-state">Cargando reservas…</p> :
                errorCarga ? <div className="notice is-error" role="alert">No se pudieron cargar las reservas: {errorCarga}</div> : (
                <>
                    {puedeReservar && (
                        <div className="form-grid">
                            <form className="surface-card" onSubmit={buscar}>
                                <h2>Nueva reserva</h2>
                                <div className="form-grid">
                                    <label className="form-field">Fecha y hora<input type="datetime-local" required value={busqueda.inicio} onChange={(event) => { setBusqueda({ ...busqueda, inicio: event.target.value }); setDisponibles(null); }} /></label>
                                    <label className="form-field">Duración<select value={busqueda.duracionMinutos} onChange={(event) => { setBusqueda({ ...busqueda, duracionMinutos: event.target.value }); setDisponibles(null); }}>
                                        {duraciones.map((minutos) => <option key={minutos} value={minutos}>{minutos} min</option>)}
                                    </select></label>
                                    <label className="form-field">Personas<input type="number" min="1" max="50" step="1" required value={busqueda.personas} onChange={(event) => { setBusqueda({ ...busqueda, personas: event.target.value }); setDisponibles(null); }} /></label>
                                </div>
                                {faltaSucursal && <p className="notice is-info">Selecciona la sucursal de la reserva.</p>}
                                <button className="secondary-button" type="submit" disabled={faltaSucursal} style={{ marginTop: 16 }}>Buscar mesas disponibles</button>
                            </form>

                            {disponibles && (
                                <form className="surface-card" onSubmit={reservar}>
                                    <h2>Datos de la reserva</h2>
                                    {disponibles.length === 0 ? (
                                        <p className="empty-state">No hay mesas libres para {busqueda.personas} persona(s) en ese horario. Prueba otra hora o duración.</p>
                                    ) : (
                                        <>
                                            <div className="form-grid">
                                                <label className="form-field">Mesa<select required value={nueva.mesaId} onChange={(event) => setNueva({ ...nueva, mesaId: event.target.value })}>
                                                    <option value="">Selecciona una mesa</option>
                                                    {disponibles.map((mesa) => <option key={mesa.id} value={mesa.id}>Mesa {mesa.numero} · {mesa.capacidad} personas</option>)}
                                                </select></label>
                                                <label className="form-field">Cliente<input maxLength="150" required value={nueva.clienteNombre} onChange={(event) => setNueva({ ...nueva, clienteNombre: event.target.value })} /></label>
                                                <label className="form-field">Teléfono<input maxLength="20" value={nueva.clienteTelefono} onChange={(event) => setNueva({ ...nueva, clienteTelefono: event.target.value })} /></label>
                                                <label className="form-field">Notas<textarea maxLength="300" value={nueva.notas} onChange={(event) => setNueva({ ...nueva, notas: event.target.value })} /></label>
                                            </div>
                                            <button className="primary-button" type="submit" disabled={procesando} style={{ marginTop: 16 }}>{procesando ? 'Reservando…' : 'Reservar'}</button>
                                        </>
                                    )}
                                </form>
                            )}
                        </div>
                    )}

                    <section className="surface-card">
                        <div className="inline-form" style={{ marginBottom: 12 }}>
                            <label className="form-field">Desde<input type="datetime-local" value={filtro.desde} onChange={(event) => { setFiltro({ ...filtro, desde: event.target.value }); cargar(); }} /></label>
                            <label className="form-field">Período<select value={filtro.dias} onChange={(event) => { setFiltro({ ...filtro, dias: event.target.value }); cargar(); }}>
                                <option value="1">1 día</option><option value="7">7 días</option><option value="14">14 días</option><option value="31">31 días</option>
                            </select></label>
                            <label className="form-field">Estado<select value={filtro.estado} onChange={(event) => { setFiltro({ ...filtro, estado: event.target.value }); cargar(); }}>
                                <option value="">Todos</option>
                                {Object.entries(nombresEstado).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
                            </select></label>
                        </div>
                        <h2>Reservas</h2>
                        {reservas.length === 0 ? <p className="empty-state">No hay reservas en el período.</p> : (
                            <div className="data-table-wrap">
                                <table className="data-table">
                                    <thead><tr><th>Fecha</th><th>Mesa</th><th>Cliente</th><th>Personas</th>{eligeSucursal && <th>Sucursal</th>}<th>Estado</th>{puedeReservar && <th>Acciones</th>}</tr></thead>
                                    <tbody>{reservas.map((reserva) => (
                                        <tr key={reserva.id}>
                                            <td>{mostrarFechaHora(reserva.inicio)} – {hora(reserva.fin)}</td>
                                            <td>{reserva.mesa?.numero}</td>
                                            <td>{reserva.clienteNombre}{reserva.clienteTelefono ? ` · ${reserva.clienteTelefono}` : ''}{reserva.notas ? <><br /><small>{reserva.notas}</small></> : null}</td>
                                            <td>{reserva.personas}</td>
                                            {eligeSucursal && <td>{reserva.sucursal?.nombre}</td>}
                                            <td><span className={`status-pill ${['cancelada', 'no_asistio'].includes(reserva.estado) ? 'is-warning' : ''}`}>{nombresEstado[reserva.estado] || reserva.estado}</span></td>
                                            {puedeReservar && <td><div className="page-actions">
                                                {(acciones[reserva.estado] || []).map(([estado, texto]) => (
                                                    <button key={estado} className={['cancelada', 'no_asistio'].includes(estado) ? 'danger-button' : 'secondary-button'} type="button" onClick={() => cambiarEstado(reserva, estado)} disabled={procesando}>{texto}</button>
                                                ))}
                                                {['pendiente', 'confirmada'].includes(reserva.estado) && <button className="secondary-button" type="button" onClick={() => reprogramar(reserva)} disabled={procesando}>Reprogramar</button>}
                                            </div></td>}
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        )}
                    </section>

                    <section className="surface-card">
                        <h2>Mesas</h2>
                        {puedeGestionarMesas && (
                            <form className="inline-form" onSubmit={crearMesa} style={{ marginBottom: 12 }}>
                                <label className="form-field">Número<input maxLength="20" required value={nuevaMesa.numero} onChange={(event) => setNuevaMesa({ ...nuevaMesa, numero: event.target.value })} /></label>
                                <label className="form-field">Capacidad<input type="number" min="1" max="50" step="1" required value={nuevaMesa.capacidad} onChange={(event) => setNuevaMesa({ ...nuevaMesa, capacidad: event.target.value })} /></label>
                                <button className="primary-button" type="submit" disabled={procesando || faltaSucursal}>Agregar mesa</button>
                            </form>
                        )}
                        {mesas.length === 0 ? <p className="empty-state">No hay mesas registradas{puedeGestionarMesas ? '; agrega la primera.' : '.'}</p> : (
                            <div className="data-table-wrap">
                                <table className="data-table">
                                    <thead><tr><th>Mesa</th>{eligeSucursal && <th>Sucursal</th>}<th>Capacidad</th><th>Ahora</th>{puedeGestionarMesas && <th>Acciones</th>}</tr></thead>
                                    <tbody>{mesas.map((mesa) => (
                                        <tr key={mesa.id}>
                                            <td>{mesa.numero}</td>
                                            {eligeSucursal && <td>{mesa.sucursal?.nombre}</td>}
                                            <td>{mesa.capacidad}</td>
                                            <td><span className={`status-pill ${!mesa.activo || mesa.reservaActual ? 'is-warning' : ''}`}>
                                                {!mesa.activo ? 'inactiva' : mesa.reservaActual ? `${nombresEstado[mesa.reservaActual.estado]} · ${mesa.reservaActual.clienteNombre} hasta ${hora(mesa.reservaActual.fin)}` : 'libre'}
                                            </span></td>
                                            {puedeGestionarMesas && <td><div className="page-actions">
                                                <button className="secondary-button" type="button" onClick={() => editarCapacidad(mesa)} disabled={procesando}>Capacidad</button>
                                                <button className={mesa.activo ? 'danger-button' : 'secondary-button'} type="button" onClick={() => cambiarEstadoMesa(mesa)} disabled={procesando}>{mesa.activo ? 'Desactivar' : 'Reactivar'}</button>
                                            </div></td>}
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

export default ReservasPage;
