import { useCallback, useEffect, useState } from 'react';
import { solicitudApi } from '../api.js';
import { useEnfoqueEdicion } from '../enfoque.js';
import CatalogoMenu from '../../components/catalogo-menu.jsx';
import { puedeElegirSucursal } from '../permisos.js';

const vacio = { codigo: '', nombre: '', descripcion: '', categoriaId: '', tipo: 'elaborado', precioVenta: '', insumoReventaId: '' };
const lineaVacia = { insumoId: '', cantidad: '' };

// Contrato: Backend/src/controladores/productosControlador.js
// Consulta: cualquier usuario autenticado. Alta, edición, receta y baja: solo administrador.
// Reglas del esquema: un elaborado necesita receta; uno de reventa, un insumo activo por unidad;
// el tipo no cambia; la baja es activo = false. Los modificadores no existen en el esquema.
function ProductosPage({ permisos = [], usuario }) {
    const puedeVer = permisos.includes('ver_menu');
    const puedeGestionar = permisos.includes('gestionar_productos');
    const [productos, setProductos] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [insumos, setInsumos] = useState([]);
    const [detalle, setDetalle] = useState(null);
    const [formulario, setFormulario] = useState(vacio);
    const [receta, setReceta] = useState([lineaVacia]);
    const [enEdicion, setEnEdicion] = useState(null);
    const [nuevaCategoria, setNuevaCategoria] = useState('');
    const [cargando, setCargando] = useState(puedeVer);
    const [errorCarga, setErrorCarga] = useState('');
    const [procesando, setProcesando] = useState(false);
    const [error, setError] = useState('');
    const [mensaje, setMensaje] = useState('');
    const [recarga, setRecarga] = useState(0);
    // Consulta de existencias en la carta: el administrador elige sucursal; el resto usa la suya.
    const eligeSucursal = puedeElegirSucursal(usuario);
    const [sucursales, setSucursales] = useState([]);
    const [errorSucursales, setErrorSucursales] = useState('');
    const [sucursalConsulta, setSucursalConsulta] = useState('');
    const { formularioRef, listadoRef, volverAlListado } = useEnfoqueEdicion(enEdicion?.id, cargando);

    const cargar = useCallback(() => {
        setCargando(true);
        setErrorCarga('');
        setRecarga((actual) => actual + 1);
    }, []);

    useEffect(() => {
        if (!eligeSucursal || !puedeVer) return undefined;
        let activo = true;
        solicitudApi('/sucursales')
            .then((respuesta) => { if (activo) setSucursales(respuesta.sucursales); })
            .catch((fallo) => { if (activo) setErrorSucursales(fallo.message); });
        return () => { activo = false; };
    }, [eligeSucursal, puedeVer]);

    useEffect(() => {
        if (!puedeVer) return undefined;
        let activo = true;
        Promise.all([
            solicitudApi(puedeGestionar ? '/productos?todos=true' : '/productos'),
            puedeGestionar ? solicitudApi('/productos/categorias') : Promise.resolve({ categorias: [] }),
            puedeGestionar ? solicitudApi('/inventario/insumos?activo=true') : Promise.resolve({ insumos: [] })
        ]).then(([respuestaProductos, respuestaCategorias, respuestaInsumos]) => {
            if (!activo) return;
            setProductos(respuestaProductos.productos);
            setCategorias(respuestaCategorias.categorias);
            setInsumos(respuestaInsumos.insumos);
        }).catch((fallo) => {
            if (activo) setErrorCarga(fallo.message);
        }).finally(() => {
            if (activo) setCargando(false);
        });
        return () => { activo = false; };
    }, [puedeVer, puedeGestionar, recarga]);

    async function operar(path, method, body, textoExito) {
        setProcesando(true);
        setError('');
        setMensaje('');
        try {
            const respuesta = await solicitudApi(path, { method, body });
            setMensaje(textoExito);
            cargar();
            return respuesta ?? true;
        } catch (fallo) {
            setError(fallo.message);
            return null;
        } finally {
            setProcesando(false);
        }
    }

    async function verDetalle(item) {
        setError('');
        try {
            const respuesta = await solicitudApi(`/productos/${item.id}`);
            setDetalle(respuesta.producto);
            return respuesta.producto;
        } catch (fallo) {
            setError(fallo.message);
            return null;
        }
    }

    const cambiar = (event) => setFormulario((actual) => ({ ...actual, [event.target.name]: event.target.value }));
    const recetaBody = () => receta.map((linea) => ({ insumoId: Number(linea.insumoId), cantidad: String(linea.cantidad) }));
    const limpiar = () => { setEnEdicion(null); setFormulario(vacio); setReceta([lineaVacia]); };
    const cancelarEdicion = () => { const id = enEdicion?.id; limpiar(); volverAlListado(id); };

    async function guardar(event) {
        event.preventDefault();
        if (!enEdicion) {
            const body = {
                codigo: formulario.codigo.trim(),
                nombre: formulario.nombre.trim(),
                descripcion: formulario.descripcion.trim() || null,
                categoriaId: Number(formulario.categoriaId),
                tipo: formulario.tipo,
                precioVenta: String(formulario.precioVenta),
                ...(formulario.tipo === 'reventa' ? { insumoReventaId: Number(formulario.insumoReventaId) } : { receta: recetaBody() })
            };
            if (await operar('/productos', 'POST', body, `Producto ${body.nombre} creado.`)) limpiar();
            return;
        }
        // Producto y receta viajan en una sola petición y el backend los guarda en una transacción:
        // si la receta es inválida, el producto tampoco cambia.
        const id = enEdicion.id;
        const elaborado = enEdicion.tipo === 'elaborado';
        const ok = await operar(`/productos/${id}`, 'PATCH', {
            nombre: formulario.nombre.trim(),
            descripcion: formulario.descripcion.trim() || null,
            categoriaId: Number(formulario.categoriaId),
            precioVenta: String(formulario.precioVenta),
            ...(elaborado ? { receta: recetaBody() } : { insumoReventaId: Number(formulario.insumoReventaId) })
        }, elaborado ? 'Producto y receta actualizados.' : 'Producto actualizado.');
        if (ok) {
            limpiar();
            volverAlListado(id);
        }
    }

    async function editar(item) {
        const producto = await verDetalle(item);
        if (!producto) return;
        setDetalle(null);
        setEnEdicion(producto);
        setFormulario({
            codigo: producto.codigo, nombre: producto.nombre, descripcion: producto.descripcion || '',
            categoriaId: String(producto.categoriaId), tipo: producto.tipo, precioVenta: String(producto.precioVenta),
            insumoReventaId: producto.insumoReventaId ? String(producto.insumoReventaId) : ''
        });
        setReceta(producto.recetas.length
            ? producto.recetas.map((linea) => ({ insumoId: String(linea.insumoId), cantidad: String(linea.cantidad) }))
            : [lineaVacia]);
    }

    function cambiarEstado(item) {
        if (item.activo && !window.confirm(`¿Desactivar ${item.nombre}? Dejará de aparecer en Ventas; su historial se conserva.`)) return;
        operar(`/productos/${item.id}`, 'PATCH', { activo: !item.activo }, `Producto ${item.activo ? 'desactivado' : 'reactivado'}.`);
    }

    async function crearCategoria(event) {
        event.preventDefault();
        if (await operar('/productos/categorias', 'POST', { nombre: nuevaCategoria.trim() }, `Categoría ${nuevaCategoria.trim()} creada.`)) setNuevaCategoria('');
    }

    const tipoActual = enEdicion ? enEdicion.tipo : formulario.tipo;
    const insumosUnidad = insumos.filter((insumo) => insumo.unidadBase === 'unidad');
    const categoriasActivas = categorias.filter((categoria) => categoria.activo);

    return (
        <>
            <header className="page-heading">
                <div>
                    <h1>Menú y productos</h1>
                    <p>{puedeGestionar ? 'Administra productos, recetas y categorías del menú.' : 'Consulta el menú activo y la receta de cada producto.'}</p>
                </div>
                <button className="secondary-button" type="button" onClick={cargar} disabled={cargando || !puedeVer}>Actualizar</button>
            </header>
            {error && <div className="notice is-error" role="alert">{error}</div>}
            {mensaje && <div className="notice" role="status">{mensaje}</div>}

            {puedeGestionar && !cargando && !errorCarga && (
                <div className="form-grid">
                    <form className={`surface-card${enEdicion ? ' is-editing' : ''}`} onSubmit={guardar} ref={formularioRef} aria-label={enEdicion ? `Editar ${enEdicion.codigo}` : 'Nuevo producto'}>
                        <div className="page-heading">
                            <h2>{enEdicion ? `Editar ${enEdicion.codigo}` : 'Nuevo producto'}</h2>
                            {enEdicion && <button className="secondary-button" type="button" onClick={cancelarEdicion}>Cancelar edición</button>}
                        </div>
                        {enEdicion && <p className="notice is-info" role="status">Modo edición: {enEdicion.nombre}. Los datos{enEdicion.tipo === 'elaborado' ? ' y la receta' : ''} se guardan juntos al pulsar «Guardar producto».</p>}
                        <div className="form-grid">
                            <label className="form-field">Código<input name="codigo" maxLength="30" required disabled={Boolean(enEdicion)} value={formulario.codigo} onChange={cambiar} /></label>
                            <label className="form-field">Nombre<input name="nombre" maxLength="150" required value={formulario.nombre} onChange={cambiar} /></label>
                            <label className="form-field">Categoría<select name="categoriaId" required value={formulario.categoriaId} onChange={cambiar}>
                                <option value="">{categoriasActivas.length ? 'Selecciona una categoría' : 'Crea primero una categoría'}</option>
                                {categoriasActivas.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>)}
                            </select></label>
                            <label className="form-field">Precio con IVA ($)<input name="precioVenta" type="number" min="0" step="0.01" required value={formulario.precioVenta} onChange={cambiar} /></label>
                            <label className="form-field">Tipo<select name="tipo" value={tipoActual} onChange={cambiar} disabled={Boolean(enEdicion)}>
                                <option value="elaborado">Elaborado (con receta)</option>
                                <option value="reventa">Reventa (1 unidad de un insumo)</option>
                            </select></label>
                            <label className="form-field">Descripción<textarea name="descripcion" maxLength="500" value={formulario.descripcion} onChange={cambiar} /></label>
                            {tipoActual === 'reventa' && (
                                <label className="form-field">Insumo que se descuenta<select name="insumoReventaId" required value={formulario.insumoReventaId} onChange={cambiar}>
                                    <option value="">{insumosUnidad.length ? 'Selecciona un insumo' : 'No hay insumos activos por unidad'}</option>
                                    {insumosUnidad.map((insumo) => <option key={insumo.id} value={insumo.id}>{insumo.nombre} ({insumo.codigo})</option>)}
                                </select></label>
                            )}
                        </div>
                        {tipoActual === 'elaborado' && (
                            <div style={{ marginTop: 16 }}>
                                <h3>Receta por porción</h3>
                                {receta.map((linea, indice) => (
                                    <div className="inline-form" key={indice} style={{ marginBottom: 10 }}>
                                        <label className="form-field">Insumo<select required value={linea.insumoId} onChange={(event) => setReceta((actual) => actual.map((item, i) => (i === indice ? { ...item, insumoId: event.target.value } : item)))}>
                                            <option value="">Selecciona un insumo</option>
                                            {insumos.map((insumo) => <option key={insumo.id} value={insumo.id}>{insumo.nombre} · {insumo.unidadBase}</option>)}
                                        </select></label>
                                        <label className="form-field">Cantidad<input type="number" min="0.001" step="0.001" required value={linea.cantidad} onChange={(event) => setReceta((actual) => actual.map((item, i) => (i === indice ? { ...item, cantidad: event.target.value } : item)))} /></label>
                                        <button className="danger-button" type="button" disabled={receta.length === 1} onClick={() => setReceta((actual) => actual.filter((_, i) => i !== indice))}>Quitar</button>
                                    </div>
                                ))}
                                <button className="secondary-button" type="button" onClick={() => setReceta((actual) => [...actual, lineaVacia])}>Agregar insumo</button>
                            </div>
                        )}
                        <div className="page-actions" style={{ marginTop: 16 }}>
                            <button className="primary-button" type="submit" disabled={procesando || !categoriasActivas.length}>{procesando ? 'Guardando…' : enEdicion ? 'Guardar producto' : 'Crear producto'}</button>
                        </div>
                    </form>

                    <form className="surface-card" onSubmit={crearCategoria}>
                        <h2>Nueva categoría</h2>
                        <div className="form-grid">
                            <label className="form-field">Nombre<input maxLength="100" required value={nuevaCategoria} onChange={(event) => setNuevaCategoria(event.target.value)} /></label>
                        </div>
                        <button className="secondary-button" type="submit" disabled={procesando} style={{ marginTop: 16 }}>Crear categoría</button>
                        <p className="form-help" style={{ marginTop: 16 }}>Modificadores (extras con precio): no existen en el esquema actual; requieren una migración.</p>
                    </form>
                </div>
            )}

            {detalle && (
                <section className="surface-card">
                    <div className="page-heading">
                        <div>
                            <h2>{detalle.nombre}</h2>
                            <p>{detalle.codigo} · {detalle.categoria?.nombre} · ${Number(detalle.precioVenta).toFixed(2)}</p>
                        </div>
                        <button className="secondary-button" type="button" onClick={() => setDetalle(null)}>Cerrar</button>
                    </div>
                    {detalle.tipo === 'reventa' ? (
                        <p>Producto de reventa: descuenta 1 unidad de {detalle.insumoReventa ? `${detalle.insumoReventa.nombre} (${detalle.insumoReventa.codigo})` : 'un insumo no configurado'}.</p>
                    ) : detalle.recetas.length === 0 ? (
                        <p className="empty-state">Este producto no tiene receta registrada.</p>
                    ) : (
                        <div className="data-table-wrap" tabIndex={0}>
                            <table className="data-table">
                                <thead><tr><th>Insumo</th><th>Cantidad por porción</th></tr></thead>
                                <tbody>{detalle.recetas.map((linea) => (
                                    <tr key={linea.insumoId}>
                                        <td>{linea.insumo.nombre}</td>
                                        <td>{Number(linea.cantidad).toLocaleString('es-SV', { maximumFractionDigits: 3 })} {linea.insumo.unidadBase}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}

            {puedeVer && !cargando && !errorCarga && (
                <section className="surface-card" style={{ marginTop: 16 }} aria-labelledby="carta-secciones">
                    <h2 id="carta-secciones">Carta por secciones</h2>
                    <p className="form-help">Consulta los productos activos por sección y la receta de cada uno.</p>
                    {eligeSucursal && (
                        <label className="form-field catalogo-sucursal">
                            Sucursal para consultar existencias
                            <select value={sucursalConsulta} onChange={(event) => setSucursalConsulta(event.target.value)} disabled={Boolean(errorSucursales)}>
                                <option value="">Elige una sucursal</option>
                                {sucursales.map((sucursal) => <option key={sucursal.id} value={sucursal.id}>{sucursal.nombre}</option>)}
                            </select>
                        </label>
                    )}
                    {errorSucursales && <div className="notice is-info" role="status">No se pudieron cargar las sucursales: {errorSucursales}. Las recetas siguen disponibles.</div>}
                    <CatalogoMenu
                        productos={productos.filter((producto) => producto.activo !== false)}
                        sucursalId={eligeSucursal ? sucursalConsulta : usuario?.sucursalId ?? ''}
                        nombreSucursal={eligeSucursal ? sucursales.find((s) => String(s.id) === sucursalConsulta)?.nombre : undefined}
                    />
                </section>
            )}

            {!puedeVer ? (
                <div className="notice is-info">Tu cuenta no tiene acceso a la consulta del menú.</div>
            ) : (
                <section className="surface-card" style={{ marginTop: 16 }} ref={listadoRef}>
                    <h2 tabIndex={-1}>{puedeGestionar ? 'Productos' : 'Productos activos'}</h2>
                    {cargando ? <p className="loading-state" role="status">Cargando menú…</p> :
                        errorCarga ? <div className="notice is-error" role="alert">No se pudo cargar el menú: {errorCarga}</div> :
                        productos.length === 0 ? <p className="empty-state">No hay productos registrados.</p> : (
                            <div className="data-table-wrap" tabIndex={0}>
                                <table className="data-table">
                                    <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th>Precio</th><th>Tipo</th>{puedeGestionar && <th>Estado</th>}<th>Acciones</th></tr></thead>
                                    <tbody>
                                        {productos.map((item) => (
                                            <tr key={item.id} data-fila-id={item.id} aria-current={enEdicion?.id === item.id ? 'true' : undefined}>
                                                <td>{item.codigo}</td>
                                                <td>{item.nombre}</td>
                                                <td>{item.categoria?.nombre || '—'}</td>
                                                <td>${Number(item.precioVenta).toFixed(2)}</td>
                                                <td>{item.tipo === 'reventa' ? 'Reventa' : 'Preparación'}</td>
                                                {puedeGestionar && <td><span className={`status-pill ${item.activo ? '' : 'is-warning'}`}>{item.activo ? 'activo' : 'inactivo'}</span></td>}
                                                <td><div className="page-actions">
                                                    <button className="secondary-button" type="button" onClick={() => verDetalle(item)} disabled={procesando}>Ver receta</button>
                                                    {puedeGestionar && <button className="secondary-button" type="button" onClick={() => editar(item)} disabled={procesando} data-editar>Editar</button>}
                                                    {puedeGestionar && <button className={item.activo ? 'danger-button' : 'secondary-button'} type="button" onClick={() => cambiarEstado(item)} disabled={procesando}>{item.activo ? 'Desactivar' : 'Reactivar'}</button>}
                                                </div></td>
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

export default ProductosPage;
