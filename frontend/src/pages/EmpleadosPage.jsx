import { useCallback, useEffect, useState } from 'react';
import { solicitudApi } from '../api.js';
import { puedeElegirSucursal as rolEligeSucursal } from '../permisos.js';
import { useEnfoqueEdicion } from '../enfoque.js';

const cargos = [
    { valor: 'barista', texto: 'Barista' },
    { valor: 'cajero', texto: 'Cajero' },
    { valor: 'gerente', texto: 'Gerente' }
];

const formularioVacio = { codigo: '', nombreCompleto: '', cargo: 'barista', salarioMensual: '', fechaIngreso: '', sucursalId: '' };

function fechaCampo(valor) {
    return valor ? new Date(valor).toISOString().slice(0, 10) : '';
}

function hoy() {
    const ahora = new Date();
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
}

function mostrarFecha(valor) {
    return valor ? new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(valor)) : '—';
}

// Contrato: Backend/src/controladores/empleadosControlador.js (admin, gerente; el gerente solo su sucursal).
// El expediente no se elimina: la baja es PATCH { activo: false, fechaSalida }. El backend no crea cuentas de usuario.
function EmpleadosPage({ permisos = [], usuario }) {
    const puedeVer = permisos.includes('ver_empleados');
    const puedeRegistrar = permisos.includes('registrar_empleados');
    const eligeSucursal = rolEligeSucursal(usuario);
    const [empleados, setEmpleados] = useState([]);
    const [sucursales, setSucursales] = useState([]);
    const [formulario, setFormulario] = useState(formularioVacio);
    const [empleadoEnEdicion, setEmpleadoEnEdicion] = useState(null);
    const [mostrarInactivos, setMostrarInactivos] = useState(false);
    const [cargando, setCargando] = useState(puedeVer);
    const [errorCarga, setErrorCarga] = useState('');
    const [procesando, setProcesando] = useState(false);
    const [error, setError] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [recarga, setRecarga] = useState(0);
    const { formularioRef, listadoRef, volverAlListado } = useEnfoqueEdicion(empleadoEnEdicion?.id, cargando);

    const cargarEmpleados = useCallback(() => {
        setCargando(true);
        setErrorCarga('');
        setRecarga((actual) => actual + 1);
    }, []);

    useEffect(() => {
        if (!puedeVer) return undefined;
        let activo = true;
        solicitudApi(mostrarInactivos ? '/empleados' : '/empleados?activo=true')
            .then((respuesta) => { if (activo) setEmpleados(respuesta.empleados); })
            .catch((fallo) => { if (activo) setErrorCarga(fallo.message); })
            .finally(() => { if (activo) setCargando(false); });
        return () => { activo = false; };
    }, [puedeVer, mostrarInactivos, recarga]);

    useEffect(() => {
        if (!eligeSucursal) return undefined;
        let activo = true;
        solicitudApi('/sucursales')
            .then((respuesta) => { if (activo) setSucursales(respuesta.sucursales); })
            .catch((fallo) => { if (activo) setError(`No se pudieron cargar las sucursales: ${fallo.message}`); });
        return () => { activo = false; };
    }, [eligeSucursal]);

    function cambiarCampo(event) {
        const { name, value } = event.target;
        setFormulario((actual) => ({ ...actual, [name]: value }));
    }

    function cuerpo(parcial) {
        return {
            ...(parcial ? {} : { codigo: formulario.codigo.trim() }),
            nombreCompleto: formulario.nombreCompleto.trim(),
            cargo: formulario.cargo,
            salarioMensual: String(formulario.salarioMensual),
            fechaIngreso: formulario.fechaIngreso,
            ...(eligeSucursal && formulario.sucursalId ? { sucursalId: Number(formulario.sucursalId) } : {})
        };
    }

    async function operar(path, method, body, textoExito) {
        setProcesando(true);
        setError('');
        setMensaje('');
        try {
            await solicitudApi(path, { method, body });
            setMensaje(textoExito);
            cargarEmpleados();
            return true;
        } catch (fallo) {
            setError(fallo.message);
            return false;
        } finally {
            setProcesando(false);
        }
    }

    async function registrar(event) {
        event.preventDefault();
        if (await operar('/empleados', 'POST', cuerpo(false), `Empleado ${formulario.nombreCompleto.trim()} registrado.`)) {
            setFormulario(formularioVacio);
        }
    }

    function abrirEdicion(empleado) {
        setError('');
        setMensaje('');
        setEmpleadoEnEdicion(empleado);
        setFormulario({
            codigo: empleado.codigo,
            nombreCompleto: empleado.nombreCompleto,
            cargo: empleado.cargo,
            salarioMensual: String(empleado.salarioMensual),
            fechaIngreso: fechaCampo(empleado.fechaIngreso),
            sucursalId: String(empleado.sucursalId)
        });
    }

    async function guardarEdicion(event) {
        event.preventDefault();
        if (!empleadoEnEdicion) return;
        const id = empleadoEnEdicion.id;
        if (await operar(`/empleados/${id}`, 'PATCH', cuerpo(true), 'Expediente actualizado.')) {
            setEmpleadoEnEdicion(null);
            setFormulario(formularioVacio);
            volverAlListado(id);
        }
    }

    function cancelarEdicion() {
        const id = empleadoEnEdicion?.id;
        setEmpleadoEnEdicion(null);
        setFormulario(formularioVacio);
        volverAlListado(id);
    }

    async function darDeBaja(empleado) {
        const fechaSalida = window.prompt(`Fecha de salida de ${empleado.nombreCompleto} (AAAA-MM-DD). Su historial se conservará.`, hoy());
        if (!fechaSalida) return;
        await operar(`/empleados/${empleado.id}`, 'PATCH', { activo: false, fechaSalida: fechaSalida.trim() }, `${empleado.nombreCompleto} dado de baja.`);
    }

    const campos = (edicion) => (
        <div className="form-grid">
            <label className="form-field">Código<input name="codigo" maxLength="30" required disabled={edicion} value={formulario.codigo} onChange={cambiarCampo} /></label>
            <label className="form-field">Nombre completo<input name="nombreCompleto" maxLength="150" required value={formulario.nombreCompleto} onChange={cambiarCampo} /></label>
            <label className="form-field">Cargo<select name="cargo" value={formulario.cargo} onChange={cambiarCampo}>
                {cargos.map((cargo) => <option key={cargo.valor} value={cargo.valor}>{cargo.texto}</option>)}
            </select></label>
            {eligeSucursal && (
                <label className="form-field">Sucursal<select name="sucursalId" required value={formulario.sucursalId} onChange={cambiarCampo}>
                    <option value="">Selecciona una sucursal</option>
                    {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}
                </select></label>
            )}
            <label className="form-field">Salario mensual ($)<input name="salarioMensual" type="number" min="0.01" max="99999999.99" step="0.01" required value={formulario.salarioMensual} onChange={cambiarCampo} /></label>
            <label className="form-field">Fecha de ingreso<input name="fechaIngreso" type="date" required value={formulario.fechaIngreso} onChange={cambiarCampo} /></label>
        </div>
    );

    return (
        <>
            <header className="page-heading">
                <div>
                    <h1>Empleados</h1>
                    <p>Expedientes del personal por sucursal.</p>
                </div>
                <button className="secondary-button" type="button" onClick={cargarEmpleados} disabled={cargando || !puedeVer}>Actualizar</button>
            </header>
            {error && <div className="notice is-error" role="alert">{error}</div>}
            {mensaje && <div className="notice" role="status">{mensaje}</div>}

            {puedeRegistrar && !empleadoEnEdicion && (
                <form className="surface-card employee-registration" onSubmit={registrar}>
                    <h2>Registrar empleado</h2>
                    <p className="form-help">
                        {eligeSucursal ? 'Indica la sucursal del empleado.' : 'Se registra en tu sucursal.'} La cuenta de acceso al sistema se gestiona aparte.
                    </p>
                    {campos(false)}
                    <div className="page-actions" style={{ marginTop: 16 }}>
                        <button className="primary-button" type="submit" disabled={procesando}>
                            {procesando ? 'Registrando…' : 'Registrar empleado'}
                        </button>
                    </div>
                </form>
            )}

            {empleadoEnEdicion && (
                <form className="surface-card employee-registration is-editing" onSubmit={guardarEdicion} ref={formularioRef} aria-label={`Editar expediente de ${empleadoEnEdicion.nombreCompleto}`}>
                    <div className="page-heading">
                        <div>
                            <h2>Editar expediente</h2>
                            <p>{empleadoEnEdicion.nombreCompleto} · {empleadoEnEdicion.codigo}</p>
                        </div>
                        <button className="secondary-button" type="button" onClick={cancelarEdicion}>Cancelar edición</button>
                    </div>
                    <p className="notice is-info" role="status">Modo edición: los cambios no se guardan hasta pulsar «Guardar cambios».</p>
                    {campos(true)}
                    <div className="page-actions" style={{ marginTop: 16 }}>
                        <button className="primary-button" type="submit" disabled={procesando}>
                            {procesando ? 'Guardando…' : 'Guardar cambios'}
                        </button>
                    </div>
                </form>
            )}

            {!puedeVer ? (
                <div className="notice is-info">Tu cuenta no tiene acceso a los expedientes de empleados.</div>
            ) : (
                <section className="surface-card" style={{ marginTop: 16 }} ref={listadoRef}>
                    <div className="page-heading">
                        <h2 tabIndex={-1}>{mostrarInactivos ? 'Todo el personal' : 'Personal activo'}</h2>
                        <label><input type="checkbox" checked={mostrarInactivos} onChange={(event) => { setMostrarInactivos(event.target.checked); cargarEmpleados(); }} /> Incluir dados de baja</label>
                    </div>
                    {cargando ? <p className="loading-state" role="status">Cargando empleados…</p> :
                        errorCarga ? <div className="notice is-error" role="alert">No se pudieron cargar los empleados: {errorCarga}</div> :
                        empleados.length === 0 ? <p className="empty-state">No hay empleados registrados.</p> : (
                            <div className="data-table-wrap" tabIndex={0}>
                                <table className="data-table">
                                    <thead>
                                        <tr><th>Empleado</th><th>Código</th><th>Cargo</th><th>Sucursal</th><th>Salario mensual</th><th>Ingreso</th><th>Estado</th>{puedeRegistrar && <th>Acciones</th>}</tr>
                                    </thead>
                                    <tbody>
                                        {empleados.map((empleado) => (
                                            <tr key={empleado.id} data-fila-id={empleado.id} aria-current={empleadoEnEdicion?.id === empleado.id ? 'true' : undefined}>
                                                <td>{empleado.nombreCompleto}</td>
                                                <td>{empleado.codigo}</td>
                                                <td>{empleado.cargo}</td>
                                                <td>{empleado.sucursal?.nombre || '—'}</td>
                                                <td>${Number(empleado.salarioMensual).toFixed(2)}</td>
                                                <td>{mostrarFecha(empleado.fechaIngreso)}</td>
                                                <td><span className={`status-pill ${empleado.activo ? '' : 'is-warning'}`}>{empleado.activo ? 'activo' : `baja ${mostrarFecha(empleado.fechaSalida)}`}</span></td>
                                                {puedeRegistrar && (
                                                    <td>
                                                        {empleado.activo && (
                                                            <div className="page-actions">
                                                                <button className="secondary-button" type="button" onClick={() => abrirEdicion(empleado)} disabled={procesando} data-editar>Editar</button>
                                                                <button className="danger-button" type="button" onClick={() => darDeBaja(empleado)} disabled={procesando}>Dar de baja</button>
                                                            </div>
                                                        )}
                                                    </td>
                                                )}
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

export default EmpleadosPage;
