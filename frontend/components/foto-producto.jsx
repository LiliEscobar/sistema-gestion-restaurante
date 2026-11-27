import { useState } from 'react';
import { fotoProducto, iconoProducto } from '../src/fotosProductos.js';
import IconoMenu from '../src/iconosMenu.jsx';

// Miniatura (detalle de venta): foto asignada o, si no hay o falla, la ilustración del producto.
export default function FotoProducto({ codigo, categoria }) {
    const foto = fotoProducto(codigo);
    const [fotoFallida, setFotoFallida] = useState('');

    return (
        <span className="product-thumbnail" aria-hidden="true">
            {foto && foto !== fotoFallida ? (
                <img src={foto} alt="" width="56" height="56" onError={() => setFotoFallida(foto)} />
            ) : (
                <IconoMenu nombre={iconoProducto(codigo, categoria)} className="product-thumbnail-icono" />
            )}
        </span>
    );
}
