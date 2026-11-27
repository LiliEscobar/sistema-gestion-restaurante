// El backend no guarda ni envía permisos: autoriza por rol con requerirRol() en Backend/src/rutas/*.js
// y limita la sucursal con Backend/src/utils/alcanceSucursal.js. Este mapa refleja esas reglas solo
// para decidir qué mostrar; el servidor sigue siendo quien autoriza cada petición.
//
//  ventas, clientes, documentos, caja ......... admin, gerente, cajero
//  compras, proveedores, empleados, planillas . admin, gerente
//  inventario (consulta) / productos / sucursales: cualquier usuario autenticado
//  inventario (crear, ajustar, mínimos) ....... admin, gerente
//  elegir sucursal en operaciones ............. solo admin (los demás usan la de su usuario)
//  usuarios, sucursales (alta/baja), productos (alta/edición/receta): solo admin
//  reportes ..................................... admin, gerente (gerente: su sucursal)
//  reservas (consultar, crear, cambiar estado) .. admin, gerente, cajero (su sucursal)
//  mesas (alta, edición, baja) .................. admin, gerente

const comunes = ['ver_menu', 'ver_inventario', 'ver_mi_perfil'];
const caja = ['tomar_pedidos', 'ver_ventas', 'operar_caja', 'ver_reservas', 'gestionar_reservas'];
const gestion = [
    'supervisar_caja', // GET /caja/turnos de otros usuarios (verificarAccesoTurno admite rolesGestion)
    'gestionar_inventario',
    'ver_compras', 'registrar_compras', 'ver_proveedores',
    'ver_empleados', 'registrar_empleados',
    'ver_planillas', 'generar_planillas',
    'ver_reportes',
    'gestionar_mesas',
];

const permisosPorRol = {
    admin: [...comunes, ...caja, ...gestion, 'gestionar_sucursales', 'gestionar_usuarios', 'gestionar_productos'],
    gerente: [...comunes, ...caja, ...gestion],
    cajero: [...comunes, ...caja],
    barista: [...comunes],
};

export function permisosDeRol(rol) {
    return permisosPorRol[rol] ?? [];
}

// Solo el administrador indica sucursalId; el backend rechaza (403) a los demás si lo envían distinto.
export function puedeElegirSucursal(usuario) {
    return usuario?.rol === 'admin';
}
