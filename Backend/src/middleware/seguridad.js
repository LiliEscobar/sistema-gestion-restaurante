import rateLimit from 'express-rate-limit';

// Máximo 5 intentos fallidos de inicio de sesión por IP cada 15 minutos.
// Los inicios de sesión correctos no cuentan.
export const limitarLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { mensaje: 'Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentarlo.' },
});