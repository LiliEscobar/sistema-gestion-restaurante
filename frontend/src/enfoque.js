import { useEffect, useRef, useState } from 'react';

// Patrón de edición en línea: el formulario está arriba de la página y el botón "Editar" en una fila
// del listado. Sin esto el formulario se abre fuera de la vista y parece que no pasó nada.
//
// Uso:
//   const { formularioRef, listadoRef, volverAlListado } = useEnfoqueEdicion(claveEdicion, cargando);
//   <form ref={formularioRef}> … <section ref={listadoRef}><h2 tabIndex={-1}> … <tr data-fila-id={id}>
//   … <button data-editar> (botón al que vuelve el foco; si no hay, el primero de la fila)
//   Al cancelar o guardar: volverAlListado(id).

const campos = 'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])';

// Desplazamiento instantáneo: el suave ('smooth') no se pudo verificar de forma fiable y, si no avanza,
// el formulario quedaría fuera de la vista aunque tenga el foco.
function comportamiento() {
    return 'auto';
}

export function useEnfoqueEdicion(claveEdicion, cargando) {
    const formularioRef = useRef(null);
    const listadoRef = useRef(null);
    const [destino, setDestino] = useState(null);
    const atendido = useRef(null);

    // Al entrar en edición (o cambiar de registro): llevar la vista al formulario y enfocar el primer campo.
    useEffect(() => {
        const formulario = formularioRef.current;
        if (claveEdicion == null || !formulario) return;
        formulario.scrollIntoView({ behavior: comportamiento(), block: 'start' });
        formulario.querySelector(campos)?.focus({ preventScroll: true });
    }, [claveEdicion]);

    // Al cancelar o guardar: cuando el listado terminó de (re)cargar, enfocar la fila o el título del listado.
    useEffect(() => {
        if (!destino || cargando || atendido.current === destino) return;
        atendido.current = destino;
        const listado = listadoRef.current;
        const fila = destino.id == null ? null : listado?.querySelector(`[data-fila-id="${destino.id}"]`);
        const elemento = fila?.querySelector('button[data-editar]') ?? fila?.querySelector('button') ?? listado?.querySelector('h2');
        if (!elemento) return;
        elemento.scrollIntoView({ behavior: comportamiento(), block: 'center' });
        elemento.focus({ preventScroll: true });
    }, [destino, cargando]);

    return {
        formularioRef,
        listadoRef,
        volverAlListado: (id) => setDestino({ id }),
    };
}
