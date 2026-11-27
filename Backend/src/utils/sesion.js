import { createHash } from 'node:crypto';

// Huella del hash de la contraseña. Cambia cuando cambia la contraseña, así que invalida los tokens anteriores.
export function huellaPassword(passwordHash) {
    return createHash('sha256').update(passwordHash).digest('hex').slice(0, 32);
}