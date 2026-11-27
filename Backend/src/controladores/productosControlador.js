import prisma from '../config/prisma.js';
import { ErrorHttp } from '../utils/ErrorHttp.js';
import { ejecutarTransaccion } from '../utils/transaccion.js';
import { esAdmin } from '../utils/alcanceSucursal.js';
import {
    arreglo, booleanoOpcional, decimal, enteroPositivo, opcion, textoOpcional, textoRequerido,
} from '../utils/validacion.js';

const tipos = ['elaborado', 'reventa'];

// GET /api/productos — activos. ?todos=true incluye inactivos (solo administrador, para gestionar el menú).
export async function listarProductos(peticion, respuesta) {
    const todos = booleanoOpcional(peticion.query?.todos, 'El filtro todos') && esAdmin(peticion.auth);
    const productos = await prisma.producto.findMany({
        where: todos ? undefined : { activo: true, categoria: { activo: true } },
        select: {
            id: true,
            codigo: true,
            nombre: true,
            descripcion: true,
            tipo: true,
            precioVenta: true,
            activo: true,
            insumoReventaId: true,
            categoria: { select: { id: true, nombre: true } },
        },
        orderBy: [{ categoria: { nombre: 'asc' } }, { nombre: 'asc' }, { id: 'asc' }],
    });

    return respuesta.json({ productos });
}

// GET /api/productos/:id — incluye la receta (insumos que descuenta cada porción).
export async function obtenerProducto(peticion, respuesta) {
    const producto = await prisma.producto.findUnique({
        where: { id: enteroPositivo(peticion.params.id, 'El id del producto') },
        include: {
            categoria: { select: { id: true, nombre: true } },
            insumoReventa: { select: { id: true, codigo: true, nombre: true, unidadBase: true } },
            recetas: { include: { insumo: { select: { id: true, codigo: true, nombre: true, unidadBase: true } } } },
        },
    });
    if (!producto) throw new ErrorHttp(404, 'El producto no existe');
    return respuesta.json({ producto });
}

// ----- Categorías -----

// GET /api/productos/categorias
export async function listarCategorias(_peticion, respuesta) {
    const categorias = await prisma.categoria.findMany({ orderBy: { nombre: 'asc' } });
    return respuesta.json({ categorias });
}

// POST /api/productos/categorias { nombre }
export async function crearCategoria(peticion, respuesta) {
    const nombre = textoRequerido(peticion.body?.nombre, 100, 'El nombre');
    if (await prisma.categoria.findUnique({ where: { nombre }, select: { id: true } })) {
        throw new ErrorHttp(409, 'Ya existe una categoría con ese nombre');
    }
    const categoria = await prisma.categoria.create({ data: { nombre } });
    return respuesta.status(201).json({ categoria });
}

// ----- Escritura de productos (solo administrador: el precio es común a todas las sucursales) -----

async function categoriaActiva(tx, valor) {
    const categoriaId = enteroPositivo(valor, 'La categoría');
    const categoria = await tx.categoria.findUnique({ where: { id: categoriaId }, select: { activo: true } });
    if (!categoria?.activo) throw new ErrorHttp(400, 'La categoría no existe o está inactiva');
    return categoriaId;
}

// Un producto de reventa descuenta 1 unidad de su insumo (venta.service.js): debe ser activo y por unidad.
async function insumoReventaValido(tx, valor) {
    const insumoId = enteroPositivo(valor, 'El insumo de reventa');
    const insumo = await tx.insumo.findUnique({ where: { id: insumoId }, select: { activo: true, unidadBase: true } });
    if (!insumo?.activo || insumo.unidadBase !== 'unidad') {
        throw new ErrorHttp(400, 'El insumo de reventa debe existir, estar activo y medirse por unidad');
    }
    return insumoId;
}

// Valida la receta: al menos un insumo activo, sin repetir, con cantidad > 0 (hasta 3 decimales).
async function lineasReceta(tx, lineas) {
    const receta = arreglo(lineas, 'La receta', { minimo: 1, maximo: 50 }).map((linea, indice) => ({
        insumoId: enteroPositivo(linea?.insumoId, `El insumo de la línea ${indice + 1}`),
        cantidad: decimal(linea?.cantidad, `La cantidad de la línea ${indice + 1}`, { decimales: 3 }),
    }));
    if (new Set(receta.map((l) => l.insumoId)).size !== receta.length) {
        throw new ErrorHttp(400, 'Cada insumo debe aparecer una sola vez en la receta');
    }
    const activos = await tx.insumo.count({ where: { id: { in: receta.map((l) => l.insumoId) }, activo: true } });
    if (activos !== receta.length) throw new ErrorHttp(400, 'Uno o más insumos de la receta no existen o están inactivos');
    return receta;
}

// POST /api/productos { codigo, nombre, descripcion?, categoriaId, tipo, precioVenta, insumoReventaId? | receta? }
export async function crearProducto(peticion, respuesta) {
    const cuerpo = peticion.body ?? {};
    const tipo = opcion(cuerpo.tipo, tipos, 'El tipo');
    const datos = {
        codigo: textoRequerido(cuerpo.codigo, 30, 'El código'),
        nombre: textoRequerido(cuerpo.nombre, 150, 'El nombre'),
        descripcion: textoOpcional(cuerpo.descripcion, 500, 'La descripción'),
        precioVenta: decimal(cuerpo.precioVenta, 'El precio de venta', { permiteCero: true }),
        tipo,
    };

    const id = await ejecutarTransaccion(async (tx) => {
        if (await tx.producto.findUnique({ where: { codigo: datos.codigo }, select: { id: true } })) {
            throw new ErrorHttp(409, 'Ya existe un producto con ese código');
        }
        datos.categoriaId = await categoriaActiva(tx, cuerpo.categoriaId);
        if (tipo === 'reventa') {
            datos.insumoReventaId = await insumoReventaValido(tx, cuerpo.insumoReventaId);
            return (await tx.producto.create({ data: datos })).id;
        }
        // Sin receta un elaborado no se puede vender (venta.service.js), por eso se exige al crear.
        const receta = await lineasReceta(tx, cuerpo.receta);
        const producto = await tx.producto.create({ data: datos });
        await tx.receta.createMany({ data: receta.map((linea) => ({ ...linea, productoId: producto.id, tipoProducto: 'elaborado' })) });
        return producto.id;
    });
    peticion.params.id = String(id);
    respuesta.status(201);
    return obtenerProducto(peticion, respuesta);
}

// Reemplaza la receta de un elaborado. Se llama dentro de la transacción del llamador: si algo falla
// después, el reemplazo se revierte junto con lo demás.
async function escribirReceta(tx, productoId, receta) {
    await tx.receta.deleteMany({ where: { productoId } });
    await tx.receta.createMany({ data: receta.map((linea) => ({ ...linea, productoId, tipoProducto: 'elaborado' })) });
}

// PATCH /api/productos/:id { nombre?, descripcion?, categoriaId?, precioVenta?, activo?, insumoReventaId?, receta? }
// Datos del producto y receta (opcional, solo elaborados) se guardan en UNA transacción: primero se
// valida todo y luego se escribe; si cualquier paso falla, ni el producto ni la receta cambian.
// El tipo no cambia: lo atan la restricción SQL y la relación de recetas. El precio nuevo solo
// afecta ventas futuras (detalles_venta guarda el precio histórico).
export async function actualizarProducto(peticion, respuesta) {
    const id = enteroPositivo(peticion.params.id, 'El id del producto');
    const cuerpo = peticion.body ?? {};
    if (cuerpo.tipo !== undefined) throw new ErrorHttp(400, 'El tipo de un producto no se puede cambiar');

    await ejecutarTransaccion(async (tx) => {
        const actual = await tx.producto.findUnique({ where: { id }, select: { tipo: true } });
        if (!actual) throw new ErrorHttp(404, 'El producto no existe');
        const datos = {};
        if (cuerpo.nombre !== undefined) datos.nombre = textoRequerido(cuerpo.nombre, 150, 'El nombre');
        if (cuerpo.descripcion !== undefined) datos.descripcion = textoOpcional(cuerpo.descripcion, 500, 'La descripción');
        if (cuerpo.precioVenta !== undefined) datos.precioVenta = decimal(cuerpo.precioVenta, 'El precio de venta', { permiteCero: true });
        if (cuerpo.categoriaId !== undefined) datos.categoriaId = await categoriaActiva(tx, cuerpo.categoriaId);
        if (cuerpo.insumoReventaId !== undefined) {
            if (actual.tipo !== 'reventa') throw new ErrorHttp(400, 'Solo los productos de reventa tienen insumo de reventa');
            datos.insumoReventaId = await insumoReventaValido(tx, cuerpo.insumoReventaId);
        }
        const activo = booleanoOpcional(cuerpo.activo, 'El estado activo');
        if (activo !== null) datos.activo = activo;
        let receta = null;
        if (cuerpo.receta !== undefined) {
            if (actual.tipo !== 'elaborado') throw new ErrorHttp(400, 'Solo los productos elaborados tienen receta');
            receta = await lineasReceta(tx, cuerpo.receta);
        }
        if (!Object.keys(datos).length && !receta) throw new ErrorHttp(400, 'No hay datos para actualizar');

        if (Object.keys(datos).length) await tx.producto.update({ where: { id }, data: datos });
        if (receta) await escribirReceta(tx, id, receta);
    });
    return obtenerProducto(peticion, respuesta);
}

// PUT /api/productos/:id/receta { receta: [{ insumoId, cantidad }] } — reemplaza solo la receta de un elaborado.
// Se conserva por compatibilidad; la pantalla usa PATCH con receta para guardar todo junto.
// Las ventas ya registradas no cambian: sus salidas de inventario quedaron en movimientos_inventario.
export async function reemplazarReceta(peticion, respuesta) {
    const id = enteroPositivo(peticion.params.id, 'El id del producto');
    await ejecutarTransaccion(async (tx) => {
        const actual = await tx.producto.findUnique({ where: { id }, select: { tipo: true } });
        if (!actual) throw new ErrorHttp(404, 'El producto no existe');
        if (actual.tipo !== 'elaborado') throw new ErrorHttp(400, 'Solo los productos elaborados tienen receta');
        await escribirReceta(tx, id, await lineasReceta(tx, peticion.body?.receta));
    });
    return obtenerProducto(peticion, respuesta);
}
