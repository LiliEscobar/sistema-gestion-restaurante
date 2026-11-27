import { Router } from 'express';
import {
    actualizarUsuario, crearUsuario, listarRoles, listarUsuarios, restablecerPassword,
} from '../controladores/usuariosControlador.js';
import { requerirRol } from '../middleware/autenticacion.js';

// Gestión de cuentas: solo administrador.
const enrutador = Router();
enrutador.use(requerirRol('admin'));

enrutador.get('/roles', listarRoles); // antes de '/:id'
enrutador.get('/', listarUsuarios);
enrutador.post('/', crearUsuario);
enrutador.patch('/:id', actualizarUsuario);
enrutador.post('/:id/password', restablecerPassword);

export default enrutador;
