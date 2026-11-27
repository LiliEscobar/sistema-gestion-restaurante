import { useEffect, useMemo, useRef, useState } from 'react';
import { solicitudApi } from '../src/api.js';
import { fotoProducto, iconoCategoria, iconoProducto } from '../src/fotosProductos.js';
import IconoMenu from '../src/iconosMenu.jsx';

// Catálogo por secciones (categorías reales de GET /api/productos) con consulta de receta
// (GET /api/productos/:id) y existencias de la sucursal (GET /api/inventario/existencias).
// No crea pedidos: quien lo usa decide qué hacer al elegir un producto (onElegir).
const TODOS = 'todos';

function dinero(valor) {
    return `$${Number(valor ?? 0).toFixed(2)}`;
}

function numeroTexto(valor) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero.toLocaleString('es-SV', { maximumFractionDigits: 3 }) : String(valor);
}

function cantidadConUnidad(valor, unidad) {
    const numero = Number(valor);
    const texto = numeroTexto(valor);
    if (unidad === 'unidad') return `${texto} ${numero === 1 ? 'unidad' : 'unidades'}`;
    return `${texto} ${unidad || ''}`.trim();
}

function normalizar(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function plural(n, uno, varios) {
    return `${n} ${n === 1 ? uno : varios}`;
}

// Foto real si el producto tiene una asignada; si no (o si falla), su ilustración SVG.
function Foto({ codigo, icono, className }) {
    const src = codigo ? fotoProducto(codigo) : undefined;
    const [fallida, setFallida] = useState('');
    if (!src || fallida === src) {
        return (
            <span className={`${className} is-ilustracion`} aria-hidden="true">
                <IconoMenu nombre={icono} />
            </span>
        );
    }
    return (
        <span className={className} aria-hidden="true">
            <img src={src} alt="" loading="lazy" onError={() => setFallida(src)} />
        </span>
    );
}

export default function CatalogoMenu({ productos = [], sucursalId, nombreSucursal, seleccionadoId, onElegir, textoElegir = 'Elegir' }) {
    const [seccion, setSeccion] = useState(null);
    const [busqueda, setBusqueda] = useState('');
    const [detalleId, setDetalleId] = useState(null);
    const [recetas, setRecetas] = useState({});
    const [existencias, setExistencias] = useState({});
    const panelRef = useRef(null);
    const origenRef = useRef(null);
    const listadoRef = useRef(null);

    const categorias = useMemo(() => {
        const mapa = new Map();
        for (const producto of productos) {
            const id = producto.categoria?.id ?? 'sin-categoria';
            if (!mapa.has(id)) mapa.set(id, { id, nombre: producto.categoria?.nombre || 'Sin categoría', productos: [] });
            mapa.get(id).productos.push(producto);
        }
        return [...mapa.values()];
    }, [productos]);

    const termino = normalizar(busqueda.trim());
    const enSecciones = seccion === null && !termino;
    const categoriaActual = categorias.find((categoria) => categoria.id === seccion);
    const base = seccion === null || seccion === TODOS ? productos : categoriaActual?.productos ?? [];
    const visibles = termino
        ? base.filter((producto) => normalizar(`${producto.nombre} ${producto.codigo} ${producto.categoria?.nombre}`).includes(termino))
        : base;
    const tituloListado = categoriaActual?.nombre || (seccion === TODOS ? 'Todos los productos' : 'Resultados de búsqueda');
    const detalle = productos.find((producto) => producto.id === detalleId);

    useEffect(() => {
        if (detalleId == null) return;
        panelRef.current?.scrollIntoView({ block: 'nearest' });
        panelRef.current?.focus({ preventScroll: true });
    }, [detalleId]);

    function entrar(id) {
        setSeccion(id);
        setDetalleId(null);
        requestAnimationFrame(() => listadoRef.current?.focus());
    }

    function volverASecciones() {
        setSeccion(null);
        setBusqueda('');
        setDetalleId(null);
    }

    function cargarReceta(id, forzar = false) {
        if (!forzar && recetas[id]?.estado === 'ok') return;
        setRecetas((actual) => ({ ...actual, [id]: { estado: 'cargando' } }));
        solicitudApi(`/productos/${id}`)
            .then((respuesta) => setRecetas((actual) => ({ ...actual, [id]: { estado: 'ok', producto: respuesta.producto } })))
            .catch((fallo) => setRecetas((actual) => ({ ...actual, [id]: { estado: 'error', error: fallo.message } })));
    }

    // Existencias de la sucursal elegida: se piden al abrir un detalle y de nuevo si cambia la sucursal.
    // Solo se escribe estado al resolver la petición; «sin entrada» significa «consultando».
    const claveSucursal = sucursalId ? String(sucursalId) : '';
    const pendientes = useRef(new Set());
    useEffect(() => {
        if (detalleId == null || !claveSucursal || existencias[claveSucursal] || pendientes.current.has(claveSucursal)) return;
        const clave = claveSucursal;
        pendientes.current.add(clave);
        solicitudApi(`/inventario/existencias?sucursalId=${encodeURIComponent(clave)}`)
            .then((respuesta) => setExistencias((actual) => ({ ...actual, [clave]: { estado: 'ok', filas: respuesta.existencias } })))
            .catch((fallo) => setExistencias((actual) => ({ ...actual, [clave]: { estado: 'error', error: fallo.message } })))
            .finally(() => pendientes.current.delete(clave));
    }, [detalleId, claveSucursal, existencias]);

    function reintentarExistencias() {
        setExistencias((actual) => {
            const copia = { ...actual };
            delete copia[claveSucursal];
            return copia;
        });
    }

    function abrirDetalle(producto, boton) {
        origenRef.current = boton;
        setDetalleId(producto.id);
        cargarReceta(producto.id);
    }

    function cerrarDetalle() {
        setDetalleId(null);
        origenRef.current?.focus();
    }

    const stock = claveSucursal ? existencias[claveSucursal] : null;
    const textoSucursal = nombreSucursal || 'la sucursal';

    function celdaExistencia(insumoId, unidad) {
        if (!stock || stock.estado === 'cargando') return <span className="catalogo-tenue">Consultando…</span>;
        if (stock.estado === 'error') return <span className="catalogo-tenue">No disponible</span>;
        const fila = stock.filas.find((item) => item.insumoId === insumoId);
        if (!fila) return <span className="catalogo-tenue">Sin registro</span>;
        const bajo = fila.bajoMinimo;
        return (
            <span className={bajo ? 'catalogo-stock is-bajo' : 'catalogo-stock'}>
                {cantidadConUnidad(fila.cantidadActual, unidad)}{bajo && ' · bajo mínimo'}
            </span>
        );
    }

    function panelDetalle() {
        if (!detalle) return null;
        const estado = recetas[detalle.id];
        const datos = estado?.producto;
        const elaborado = detalle.tipo === 'elaborado';
        return (
            <section className="catalogo-detalle" ref={panelRef} tabIndex={-1} aria-labelledby="catalogo-detalle-titulo">
                <div className="catalogo-detalle-cabecera">
                    <Foto codigo={detalle.codigo} icono={iconoProducto(detalle.codigo, detalle.categoria?.nombre)} className="catalogo-detalle-foto" />
                    <div>
                        <p className="catalogo-etiqueta">{detalle.categoria?.nombre} · {elaborado ? 'Elaborado' : 'Reventa'}</p>
                        <h3 id="catalogo-detalle-titulo">{detalle.nombre}</h3>
                        <p className="catalogo-precio">{dinero(detalle.precioVenta)}</p>
                        {detalle.descripcion && <p className="catalogo-tenue">{detalle.descripcion}</p>}
                    </div>
                </div>

                {(!estado || estado.estado === 'cargando') && <p className="loading-state" role="status">Cargando {elaborado ? 'receta' : 'información'}…</p>}
                {estado?.estado === 'error' && (
                    <div className="notice is-error" role="alert">
                        No se pudo cargar {elaborado ? 'la receta' : 'la información'}: {estado.error}{' '}
                        <button className="secondary-button" type="button" onClick={() => cargarReceta(detalle.id, true)}>Reintentar</button>
                    </div>
                )}

                {datos && elaborado && (datos.recetas.length === 0 ? (
                    <p className="empty-state">Este producto no tiene receta registrada.</p>
                ) : (
                    <>
                        <h4>Receta por porción</h4>
                        <div className="data-table-wrap catalogo-receta-tabla" tabIndex={0}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Ingrediente</th>
                                        <th scope="col">Cantidad por porción</th>
                                        {sucursalId && <th scope="col">Existencia en {textoSucursal}</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {datos.recetas.map((linea) => (
                                        <tr key={linea.insumoId}>
                                            <td>{linea.insumo.nombre}</td>
                                            <td>{cantidadConUnidad(linea.cantidad, linea.insumo.unidadBase)}</td>
                                            {sucursalId && <td>{celdaExistencia(linea.insumoId, linea.insumo.unidadBase)}</td>}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* En pantallas angostas la misma información se presenta por ingrediente (CSS alterna tabla y lista). */}
                        <ul className="catalogo-receta-lista">
                            {datos.recetas.map((linea) => (
                                <li key={linea.insumoId}>
                                    <strong>{linea.insumo.nombre}</strong>
                                    <dl>
                                        <div><dt>Cantidad</dt><dd>{numeroTexto(linea.cantidad)}</dd></div>
                                        <div><dt>Unidad</dt><dd>{linea.insumo.unidadBase}</dd></div>
                                        {sucursalId && <div className="is-existencia"><dt>Existencia en {textoSucursal}</dt><dd>{celdaExistencia(linea.insumoId, linea.insumo.unidadBase)}</dd></div>}
                                    </dl>
                                </li>
                            ))}
                        </ul>
                    </>
                ))}

                {datos && !elaborado && (
                    <div className="catalogo-reventa">
                        <h4>Producto de reventa</h4>
                        <p>
                            Se vende tal como se compra, sin receta. Cada unidad vendida descuenta 1 unidad de{' '}
                            <strong>{datos.insumoReventa?.nombre || 'su insumo de reventa'}</strong>.
                        </p>
                        {sucursalId && datos.insumoReventa && (
                            <p>Existencia en {textoSucursal}: {celdaExistencia(datos.insumoReventa.id, datos.insumoReventa.unidadBase)}</p>
                        )}
                    </div>
                )}

                {datos && (
                    <p className="form-help">
                        {elaborado ? 'La receta es la misma en todas las sucursales. ' : ''}
                        {sucursalId
                            ? `Las existencias son las actuales de ${textoSucursal}; el stock se valida al registrar la venta.`
                            : 'Elige una sucursal para ver sus existencias; también puedes consultarlas en Inventario.'}
                    </p>
                )}
                {datos && sucursalId && stock?.estado === 'error' && (
                    <div className="notice is-info" role="status">
                        No se pudieron consultar las existencias: {stock.error}{' '}
                        <button className="secondary-button" type="button" onClick={reintentarExistencias}>Reintentar</button>
                    </div>
                )}
                <div className="catalogo-acciones">
                    {onElegir && (
                        <button className="primary-button" type="button" onClick={() => onElegir(detalle)}>
                            {seleccionadoId === detalle.id ? 'Elegido' : textoElegir}
                        </button>
                    )}
                    <button className="secondary-button" type="button" onClick={cerrarDetalle}>Cerrar</button>
                </div>
            </section>
        );
    }

    if (productos.length === 0) return <p className="empty-state">No hay productos activos en el catálogo.</p>;

    return (
        <div className="catalogo">
            <div className="catalogo-barra">
                <label className="form-field catalogo-busqueda">
                    Buscar producto
                    <input
                        type="search"
                        value={busqueda}
                        placeholder="Nombre, código o sección"
                        onChange={(event) => { setBusqueda(event.target.value); setDetalleId(null); }}
                    />
                </label>
                {!enSecciones && (
                    <button className="secondary-button" type="button" onClick={volverASecciones}>← Volver a secciones</button>
                )}
            </div>

            {enSecciones ? (
                <ul className="catalogo-secciones" aria-label="Secciones del menú">
                    <li>
                        <button type="button" className="catalogo-seccion is-todos" onClick={() => entrar(TODOS)}>
                            <Foto icono="todos" className="catalogo-seccion-foto" />
                            <span className="catalogo-seccion-texto">
                                <strong>Todos</strong>
                                <span>{plural(productos.length, 'producto', 'productos')}</span>
                            </span>
                        </button>
                    </li>
                    {categorias.map((categoria) => (
                        <li key={categoria.id}>
                            <button type="button" className="catalogo-seccion" onClick={() => entrar(categoria.id)}>
                                <Foto icono={iconoCategoria(categoria.nombre)} className="catalogo-seccion-foto" />
                                <span className="catalogo-seccion-texto">
                                    <strong>{categoria.nombre}</strong>
                                    <span>{plural(categoria.productos.length, 'producto', 'productos')}</span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <>
                    <h3 className="catalogo-titulo" ref={listadoRef} tabIndex={-1}>
                        {tituloListado} <span className="catalogo-tenue">· {plural(visibles.length, 'producto', 'productos')}</span>
                    </h3>
                    {panelDetalle()}
                    {visibles.length === 0 ? (
                        <p className="empty-state">Ningún producto coincide con «{busqueda.trim()}».</p>
                    ) : (
                        <ul className="catalogo-productos" aria-label={tituloListado}>
                            {visibles.map((producto) => {
                                const elegido = seleccionadoId === producto.id;
                                return (
                                    <li key={producto.id} className={elegido ? 'catalogo-producto is-elegido' : 'catalogo-producto'} data-producto-id={producto.id}>
                                        <Foto codigo={producto.codigo} icono={iconoProducto(producto.codigo, producto.categoria?.nombre)} className="catalogo-producto-foto" />
                                        <div className="catalogo-producto-cuerpo">
                                            <p className="catalogo-etiqueta">{seccion === null || seccion === TODOS ? producto.categoria?.nombre : producto.tipo === 'elaborado' ? 'Elaborado' : 'Reventa'}</p>
                                            <h4>{producto.nombre}</h4>
                                            <p className="catalogo-precio">{dinero(producto.precioVenta)}</p>
                                        </div>
                                        <div className="catalogo-acciones">
                                            {onElegir && (
                                                <button className="primary-button" type="button" aria-pressed={elegido} onClick={() => onElegir(producto)}>
                                                    {elegido ? 'Elegido' : textoElegir}
                                                </button>
                                            )}
                                            <button
                                                className="secondary-button"
                                                type="button"
                                                aria-label={`${producto.tipo === 'elaborado' ? 'Ver receta' : 'Ver detalle'} de ${producto.nombre}`}
                                                onClick={(event) => abrirDetalle(producto, event.currentTarget)}
                                            >
                                                {producto.tipo === 'elaborado' ? 'Ver receta' : 'Ver detalle'}
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </>
            )}
        </div>
    );
}
