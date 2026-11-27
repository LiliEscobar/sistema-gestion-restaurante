import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import prisma from './config/prisma.js';
import rutasAutenticacion from './rutas/autenticacionRutas.js';
import rutasProductos from './rutas/productosRutas.js';
import rutasSucursales from './rutas/sucursalesRutas.js';
import rutasVentas from './rutas/ventasRutas.js';
import rutasDocumentos from './rutas/documentosRutas.js';
import rutasClientes from './rutas/clientesRutas.js';
import rutasCaja from './rutas/cajaRutas.js';
import rutasInventario from './rutas/inventarioRutas.js';
import rutasProveedores from './rutas/proveedoresRutas.js';
import rutasCompras from './rutas/comprasRutas.js';
import rutasEmpleados from './rutas/empleadosRutas.js';
import rutasPlanillas from './rutas/planillasRutas.js';
import rutasUsuarios from './rutas/usuariosRutas.js';
import rutasReportes from './rutas/reportesRutas.js';
import { rutasMesas, rutasReservas } from './rutas/reservasRutas.js';
import { autenticar } from './middleware/autenticacion.js';
import { rutaNoEncontrada, manejarErrores } from './middleware/manejoErrores.js';
import { cambiarPassword } from './controladores/autenticacionControlador.js';

const app = express();

app.use(helmet());
// Orígenes permitidos separados por coma. Si el frontend usa otro puerto, cámbialo en .env.
const origenes = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',').map((origen) => origen.trim()).filter(Boolean);
app.use(cors({ origin: origenes }));
app.use(express.json({ limit: '100kb' }));
// Los id de movimientos son BigInt y JSON no los admite: se envían como texto.
app.set('json replacer', (_clave, valor) => (typeof valor === 'bigint' ? valor.toString() : valor));

app.get('/api/health', async (_peticion, respuesta) => {
    try {
        await prisma.$queryRaw`SELECT 1 AS disponible`;
        return respuesta.json({ estado: 'ok', baseDatos: 'conectada' });
    } catch (error) {
        console.error('Fallo la consulta de salud a la base de datos:', error);
        return respuesta.status(503).json({ estado: 'error', baseDatos: 'no disponible' });
    }
});

app.use('/api/auth', rutasAutenticacion);
app.post('/api/cambiar-password', autenticar, cambiarPassword);
app.use('/api/productos', autenticar, rutasProductos);
app.use('/api/sucursales', autenticar, rutasSucursales);
app.use('/api/ventas', autenticar, rutasVentas);
app.use('/api/documentos', autenticar, rutasDocumentos);
app.use('/api/clientes', autenticar, rutasClientes);
app.use('/api/caja', autenticar, rutasCaja);
app.use('/api/inventario', autenticar, rutasInventario);
app.use('/api/proveedores', autenticar, rutasProveedores);
app.use('/api/compras', autenticar, rutasCompras);
app.use('/api/empleados', autenticar, rutasEmpleados);
app.use('/api/planillas', autenticar, rutasPlanillas);
app.use('/api/usuarios', autenticar, rutasUsuarios);
app.use('/api/reportes', autenticar, rutasReportes);
app.use('/api/mesas', autenticar, rutasMesas);
app.use('/api/reservas', autenticar, rutasReservas);

app.use(rutaNoEncontrada);
app.use(manejarErrores);

export default app;