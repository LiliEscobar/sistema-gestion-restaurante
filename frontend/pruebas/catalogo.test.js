import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let vite;
let recursos;
let CatalogoMenu;
let FotoProducto;

before(async () => {
    vite = await createServer({ appType: 'custom', server: { middlewareMode: true, watch: null, ws: false } });
    recursos = await vite.ssrLoadModule('/src/fotosProductos.js');
    ({ default: CatalogoMenu } = await vite.ssrLoadModule('/components/catalogo-menu.jsx'));
    ({ default: FotoProducto } = await vite.ssrLoadModule('/components/foto-producto.jsx'));
});

after(async () => {
    await vite?.close();
});

test('las fotos del menú corresponden a códigos concretos y existen como PNG', async () => {
    const { fotoInicio, fotoProducto } = recursos;
    assert.equal(fotoProducto('HAM-CON-QUESO'), '/images/productos/hamburguesa-madera.png');
    assert.equal(fotoProducto('ENT-PAN-AJO'), '/images/productos/pan-ajo-vertical.png');
    assert.equal(fotoProducto('HAM-CLASICA'), undefined);
    assert.equal(fotoProducto('BEB-LIMONADA-NATURAL'), undefined);

    const firmaPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    for (const ruta of [fotoInicio, fotoProducto('HAM-CON-QUESO'), fotoProducto('ENT-PAN-AJO')]) {
        const imagen = await readFile(new URL(`../public${ruta}`, import.meta.url));
        assert.deepEqual(imagen.subarray(0, firmaPng.length), firmaPng);
    }
});

test('la miniatura usa una ilustración local si el producto carece de foto', () => {
    assert.equal(recursos.iconoProducto('HAM-CLASICA', 'Hamburguesas'), 'hamburguesa');
    assert.equal(recursos.iconoProducto('SIN-REGISTRO', 'Bebidas envasadas'), 'bebidasEnvasadas');
    const imagen = renderToStaticMarkup(createElement(FotoProducto, { codigo: 'HAM-CON-QUESO' }));
    assert.match(imagen, /<img[^>]+hamburguesa-madera\.png/);
    const alternativa = renderToStaticMarkup(createElement(FotoProducto, { codigo: 'HAM-CLASICA' }));
    assert.match(alternativa, /<svg[^>]+product-thumbnail-icono/);
    assert.doesNotMatch(alternativa, /<img\b/);
});

test('el catálogo presenta las categorías de los productos recibidos y su estado vacío', () => {
    const productos = [
        { id: 1, nombre: 'Hamburguesa con queso', categoria: { id: 1, nombre: 'Hamburguesas' } },
        { id: 2, nombre: 'Pan al ajo', categoria: { id: 2, nombre: 'Entradas' } },
    ];
    const catalogo = renderToStaticMarkup(createElement(CatalogoMenu, { productos }));
    assert.match(catalogo, /Secciones del menú/);
    assert.match(catalogo, /Hamburguesas/);
    assert.match(catalogo, /Entradas/);
    assert.match(catalogo, /2 productos/);
    const vacio = renderToStaticMarkup(createElement(CatalogoMenu));
    assert.match(vacio, /No hay productos activos en el catálogo/);
});
