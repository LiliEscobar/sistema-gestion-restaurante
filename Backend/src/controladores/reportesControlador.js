import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { ErrorHttp } from '../utils/ErrorHttp.js';
import { filtroSucursal } from '../utils/alcanceSucursal.js';
import { fecha } from '../utils/validacion.js';

// Reportes de solo lectura sobre los datos registrados. Admin ve todas las sucursales (o una);
// gerente solo la suya (filtroSucursal). Período: ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD (por defecto 30 días).

const cero = new Prisma.Decimal(0);
const unDia = 24 * 60 * 60 * 1000;

function textoFecha(d) {
    return d.toISOString().slice(0, 10);
}

function leerPeriodo(query) {
    const hoy = new Date(`${textoFecha(new Date())}T00:00:00.000Z`);
    const hasta = query.hasta ? fecha(query.hasta, 'La fecha hasta') : hoy;
    const desde = query.desde ? fecha(query.desde, 'La fecha desde') : new Date(hasta.getTime() - 29 * unDia);
    if (desde > hasta) throw new ErrorHttp(400, 'La fecha desde no puede ser posterior a la fecha hasta');
    if (hasta - desde > 366 * unDia) throw new ErrorHttp(400, 'El período del reporte no puede superar un año');
    // Igual que rangoFechas: incluye todo el día "hasta".
    return { desde, finExclusivo: new Date(hasta.getTime() + unDia), texto: { desde: textoFecha(desde), hasta: textoFecha(hasta) } };
}

function contexto(peticion) {
    const periodo = leerPeriodo(peticion.query);
    const sucursalId = filtroSucursal(peticion.auth, peticion.query.sucursalId);
    return { ...periodo, sucursalId, rango: { gte: periodo.desde, lt: periodo.finExclusivo } };
}

const sumaDe = (filas, campo) => filas.reduce((suma, fila) => suma.plus(fila[campo] ?? 0), cero);

// GET /api/reportes/ventas
export async function reporteVentas(peticion, respuesta) {
    const { rango, sucursalId, desde, finExclusivo, texto } = contexto(peticion);
    const whereVenta = { fecha: rango, sucursalId };
    const filtroSql = sucursalId ? Prisma.sql`AND v.sucursal_id = ${sucursalId}` : Prisma.empty;

    const [resumen, cobrado, porDia, porProducto, porMetodo, porDocumento] = await Promise.all([
        prisma.venta.aggregate({ where: whereVenta, _count: { _all: true }, _sum: { total: true, subtotal: true, iva: true } }),
        prisma.cobroVenta.aggregate({ where: { venta: whereVenta }, _sum: { monto: true } }),
        prisma.$queryRaw`
            SELECT CONVERT(char(10), CAST(v.fecha AS date), 23) AS dia, COUNT(*) AS ventas, SUM(v.total) AS total
            FROM dbo.ventas v
            WHERE v.fecha >= ${desde} AND v.fecha < ${finExclusivo} ${filtroSql}
            GROUP BY CAST(v.fecha AS date)
            ORDER BY dia`,
        prisma.$queryRaw`
            SELECT TOP 10 p.id AS productoId, p.codigo, p.nombre,
                   SUM(d.cantidad) AS cantidad, SUM(d.cantidad * d.precio_unitario) AS importe
            FROM dbo.detalles_venta d
            JOIN dbo.ventas v ON v.id = d.venta_id
            JOIN dbo.productos p ON p.id = d.producto_id
            WHERE v.fecha >= ${desde} AND v.fecha < ${finExclusivo} ${filtroSql}
            GROUP BY p.id, p.codigo, p.nombre
            ORDER BY importe DESC`,
        prisma.cobroVenta.groupBy({ by: ['metodo'], where: { fecha: rango, sucursalId }, _sum: { monto: true }, _count: { _all: true } }),
        prisma.documentoVenta.groupBy({ by: ['tipoDocumento'], where: { fecha: rango, sucursalId }, _sum: { total: true }, _count: { _all: true } }),
    ]);

    const total = resumen._sum.total ?? cero;
    return respuesta.json({
        periodo: texto,
        resumen: {
            ventas: resumen._count._all,
            total,
            subtotal: resumen._sum.subtotal ?? cero,
            iva: resumen._sum.iva ?? cero,
            cobrado: cobrado._sum.monto ?? cero,
            pendienteCobro: total.minus(cobrado._sum.monto ?? cero),
            ticketPromedio: resumen._count._all ? total.div(resumen._count._all).toDecimalPlaces(2) : cero,
        },
        porDia,
        porProducto,
        porMetodo: porMetodo.map((fila) => ({ metodo: fila.metodo, cobros: fila._count._all, total: fila._sum.monto ?? cero })),
        porDocumento: porDocumento.map((fila) => ({ tipoDocumento: fila.tipoDocumento, documentos: fila._count._all, total: fila._sum.total ?? cero })),
    });
}

// GET /api/reportes/inventario — alertas actuales (vista v_reporte_alertas_stock) y movimientos del período.
export async function reporteInventario(peticion, respuesta) {
    const { rango, sucursalId, texto } = contexto(peticion);
    const filtro = sucursalId ? Prisma.sql`WHERE sucursal_id = ${sucursalId}` : Prisma.empty;
    const [alertas, movimientos] = await Promise.all([
        prisma.$queryRaw`
            SELECT sucursal_id AS sucursalId, sucursal, insumo_id AS insumoId, insumo, unidad,
                   cantidad_actual AS cantidadActual, cantidad_minima AS cantidadMinima
            FROM dbo.v_reporte_alertas_stock ${filtro}
            ORDER BY sucursal, insumo`,
        prisma.movimientoInventario.groupBy({ by: ['tipo'], where: { fecha: rango, sucursalId }, _count: { _all: true } }),
    ]);
    return respuesta.json({
        periodo: texto,
        alertas,
        agotados: alertas.filter((fila) => Number(fila.cantidadActual) <= 0).length,
        movimientos: movimientos.map((fila) => ({ tipo: fila.tipo, movimientos: fila._count._all })),
    });
}

// GET /api/reportes/compras — compras del período y cuentas por pagar actuales por proveedor.
export async function reporteCompras(peticion, respuesta) {
    const { rango, sucursalId, texto } = contexto(peticion);
    const [periodo, pendientes] = await Promise.all([
        prisma.compra.aggregate({ where: { fecha: rango, sucursalId }, _count: { _all: true }, _sum: { subtotal: true, iva: true, total: true } }),
        prisma.compra.findMany({
            where: { sucursalId },
            select: { total: true, proveedor: { select: { id: true, nombre: true } }, pagos: { select: { monto: true } } },
        }),
    ]);
    const porProveedor = new Map();
    for (const compra of pendientes) {
        const saldo = compra.total.minus(sumaDe(compra.pagos, 'monto'));
        if (saldo.lte(0)) continue;
        const fila = porProveedor.get(compra.proveedor.id) ?? { proveedorId: compra.proveedor.id, proveedor: compra.proveedor.nombre, facturas: 0, saldo: cero };
        fila.facturas += 1;
        fila.saldo = fila.saldo.plus(saldo);
        porProveedor.set(compra.proveedor.id, fila);
    }
    const cuentasPorPagar = [...porProveedor.values()].sort((a, b) => b.saldo.cmp(a.saldo));
    return respuesta.json({
        periodo: texto,
        resumen: {
            compras: periodo._count._all,
            subtotal: periodo._sum.subtotal ?? cero,
            iva: periodo._sum.iva ?? cero,
            total: periodo._sum.total ?? cero,
            saldoPendiente: sumaDe(cuentasPorPagar, 'saldo'),
        },
        cuentasPorPagar,
    });
}

// GET /api/reportes/caja — turnos cerrados en el período con su arqueo.
export async function reporteCaja(peticion, respuesta) {
    const { rango, sucursalId, texto } = contexto(peticion);
    const turnos = await prisma.turnoCaja.findMany({
        where: { fechaCierre: rango, sucursalId },
        select: {
            id: true, fechaApertura: true, fechaCierre: true, fondoInicial: true, efectivoEsperado: true,
            efectivoContado: true, diferencia: true, totalTarjeta: true, totalDigital: true, totalBitcoin: true,
            sucursal: { select: { nombre: true } }, usuario: { select: { nombreCompleto: true } },
        },
        orderBy: { fechaCierre: 'desc' },
        take: 200,
    });
    return respuesta.json({
        periodo: texto,
        resumen: {
            turnos: turnos.length,
            diferenciaNeta: sumaDe(turnos, 'diferencia'),
            conFaltante: turnos.filter((t) => t.diferencia?.lt(0)).length,
            conSobrante: turnos.filter((t) => t.diferencia?.gt(0)).length,
        },
        turnos,
    });
}

// GET /api/reportes/planillas — totales por quincena con inicio en el período.
export async function reportePlanillas(peticion, respuesta) {
    const { rango, sucursalId, texto } = contexto(peticion);
    const filas = await prisma.detallePlanilla.groupBy({
        by: ['planillaId'],
        where: { planilla: { periodoInicio: rango }, empleado: sucursalId ? { sucursalId } : undefined },
        _count: { _all: true },
        _sum: { salarioPeriodo: true, isss: true, afp: true, renta: true, neto: true },
    });
    const planillas = await prisma.planilla.findMany({
        where: { id: { in: filas.map((f) => f.planillaId) } },
        select: { id: true, periodoInicio: true, periodoFin: true },
        orderBy: { periodoInicio: 'desc' },
    });
    const porId = new Map(filas.map((f) => [f.planillaId, f]));
    return respuesta.json({
        periodo: texto,
        planillas: planillas.map((p) => {
            const f = porId.get(p.id);
            return { ...p, empleados: f._count._all, salarios: f._sum.salarioPeriodo, isss: f._sum.isss, afp: f._sum.afp, renta: f._sum.renta, neto: f._sum.neto };
        }),
    });
}
