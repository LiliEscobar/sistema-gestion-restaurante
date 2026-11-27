import 'dotenv/config';
import app from './app.js';
import prisma from './config/prisma.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres en Backend/.env');
}

const puerto = Number(process.env.PORT ?? 3000);

async function arrancar() {
    await prisma.$connect();
    app.listen(puerto, (error) => {
        if (error) {
            console.error(`No se pudo usar el puerto ${puerto}:`, error.message);
            process.exit(1);
        }
        console.log(`API escuchando en http://localhost:${puerto}`);
    });
}

arrancar().catch(async (error) => {
    console.error('No se pudo arrancar el servidor:', error);
    await prisma.$disconnect();
    process.exitCode = 1;
});