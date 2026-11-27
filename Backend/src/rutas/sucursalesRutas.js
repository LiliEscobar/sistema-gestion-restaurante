import { Router } from 'express';
import { actualizarSucursal, crearSucursal, listarSucursales } from '../controladores/sucursalesControlador.js';
import { requerirRol } from '../middleware/autenticacion.js';

const enrutador = Router();

enrutador.get('/', listarSucursales);
enrutador.post('/', requerirRol('admin'), crearSucursal);
enrutador.patch('/:id', requerirRol('admin'), actualizarSucursal);

export default enrutador;
