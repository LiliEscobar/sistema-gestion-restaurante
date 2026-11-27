import { Router } from 'express';
import {
    reporteCaja, reporteCompras, reporteInventario, reportePlanillas, reporteVentas,
} from '../controladores/reportesControlador.js';
import { requerirRol } from '../middleware/autenticacion.js';

// Solo lectura. El gerente ve únicamente su sucursal (filtroSucursal en el controlador).
const enrutador = Router();
enrutador.use(requerirRol('admin', 'gerente'));

enrutador.get('/ventas', reporteVentas);
enrutador.get('/inventario', reporteInventario);
enrutador.get('/compras', reporteCompras);
enrutador.get('/caja', reporteCaja);
enrutador.get('/planillas', reportePlanillas);

export default enrutador;
