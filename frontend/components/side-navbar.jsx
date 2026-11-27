import { useEffect, useRef } from 'react';

function SideNavbar({ items, selected, onSelect, abierta, onClose }) {
    const cerrarRef = useRef(null);

    useEffect(() => {
        if (abierta) cerrarRef.current?.focus();
    }, [abierta]);

    function manejarTeclado(event) {
        if (!abierta || !cerrarRef.current?.getClientRects().length) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
        }
        if (event.key !== 'Tab') return;
        const botones = event.currentTarget.querySelectorAll('button');
        const primero = botones[0];
        const ultimo = botones[botones.length - 1];
        if (event.shiftKey && event.target === primero) {
            event.preventDefault();
            ultimo.focus();
        } else if (!event.shiftKey && event.target === ultimo) {
            event.preventDefault();
            primero.focus();
        }
    }

    return (
        <>
            {abierta && (
                <button
                    className="workspace-overlay"
                    type="button"
                    aria-label="Cerrar menú"
                    tabIndex={-1}
                    onClick={onClose}
                />
            )}
            <aside id="workspace-sidebar" className={`workspace-sidebar ${abierta ? 'is-open' : ''}`} onKeyDown={manejarTeclado}>
                <div className="workspace-brand">
                    <img src="/brand/origenes-logo.png" alt="Orígenes SV" />
                    <button className="workspace-menu-close" type="button" ref={cerrarRef} aria-label="Cerrar menú de navegación" onClick={onClose}>
                        <span aria-hidden="true">×</span>
                    </button>
                </div>
                <nav aria-label="Navegación principal">
                    <ul className="workspace-nav">
                        {items.map(({ id, name, icon }) => (
                            <li key={id}>
                                <button
                                    className={selected === id ? 'is-active' : ''}
                                    type="button"
                                    aria-current={selected === id ? 'page' : undefined}
                                    onClick={() => {
                                        onSelect(id);
                                        onClose();
                                    }}
                                >
                                    <img src={icon} alt="" className="workspace-nav-icon" />
                                    <span>{name}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </nav>
            </aside>
        </>
    );
}

export default SideNavbar;
