// Representación visual del catálogo, centralizada por código estable de producto.
// Una foto solo se asigna al plato que realmente muestra; el resto usa una ilustración SVG local
// (src/iconosMenu.jsx). Un producto nuevo sin entrada aquí usa el ícono de su categoría.
const directorio = `${import.meta.env.BASE_URL}images/productos/`;

export const fotoInicio = `${directorio}hamburguesa-fondo-negro.png`;

const porCodigo = {
    'REV-AGUA-500-ML': { icono: 'botella' },
    'REV-GASEOSA-355-ML': { icono: 'lata' },
    'BEB-LATTE-GRANDE': { icono: 'taza' },
    'BEB-LIMONADA-NATURAL': { icono: 'vasoLimon' },
    'BEB-LIMONADA-HIERBABUENA': { icono: 'limonHojas' },
    'BEB-NARANJADA-NATURAL': { icono: 'naranjaVaso' },
    'ENT-CHAMPINONES-AJILLO': { icono: 'champinones' },
    'ENT-ENSALADA-ORIGENES': { icono: 'ensalada' },
    'ENT-PAN-AJO': { icono: 'pan', foto: 'pan-ajo-vertical.png' },
    'ENT-PAN-AJO-GRATINADO': { icono: 'panGratinado' },
    'HAM-CLASICA': { icono: 'hamburguesa' },
    'HAM-CON-QUESO': { icono: 'hamburguesaQueso', foto: 'hamburguesa-madera.png' },
    'HAM-POLLO': { icono: 'hamburguesaPollo' },
    'PRI-LOMO-CERDO-PARRILLA': { icono: 'lomo' },
    'PRI-PESCADO-PLANCHA': { icono: 'pescado' },
    'PRI-POLLO-PARRILLA': { icono: 'pollo' },
    'PRI-POLLO-AJILLO': { icono: 'polloAjillo' },
};

function normalizar(texto) {
    return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Ícono por categoría (también alternativa para productos sin entrada propia).
export function iconoCategoria(nombre) {
    const n = normalizar(nombre);
    if (n.includes('envasad')) return 'bebidasEnvasadas';
    if (n.includes('bebida')) return 'bebidasPreparadas';
    if (n.includes('hamburgues')) return 'hamburguesa';
    if (n.includes('entrada')) return 'entradas';
    if (n.includes('plato') || n.includes('principal')) return 'platos';
    return 'platos';
}

export function fotoProducto(codigo) {
    const archivo = porCodigo[codigo]?.foto;
    return archivo ? `${directorio}${archivo}` : undefined;
}

export function iconoProducto(codigo, categoria) {
    return porCodigo[codigo]?.icono || iconoCategoria(categoria);
}
