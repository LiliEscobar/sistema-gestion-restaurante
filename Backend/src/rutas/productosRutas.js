import { Router } from 'express';
import {
    actualizarProducto, crearCategoria, crearProducto, listarCategorias, listarProductos, obtenerProducto, reemplazarReceta,
} from '../controladores/productosControlador.js';
import { requerirRol } from '../middleware/autenticacion.js';

// La autenticación se aplica al montar el enrutador en app.js.
// Consulta: cualquier usuario autenticado. Escritura: solo administrador (precio común a todas las sucursales).
const enrutador = Router();
const soloAdmin = requerirRol('admin');

enrutador.get('/', listarProductos);
enrutador.get('/categorias', listarCategorias); // antes de '/:id'
enrutador.post('/categorias', soloAdmin, crearCategoria);
enrutador.post('/', soloAdmin, crearProducto);
enrutador.get('/:id', obtenerProducto);
enrutador.patch('/:id', soloAdmin, actualizarProducto);
enrutador.put('/:id/receta', soloAdmin, reemplazarReceta);

export default enrutador;
