import { Router } from 'express';
import { iniciarSesion, obtenerSesion } from '../controladores/autenticacionControlador.js';
import { autenticar } from '../middleware/autenticacion.js';
import { limitarLogin } from '../middleware/seguridad.js';

const enrutador = Router();

enrutador.post('/login', limitarLogin, iniciarSesion);
enrutador.get('/sesion', autenticar, obtenerSesion);

export default enrutador;