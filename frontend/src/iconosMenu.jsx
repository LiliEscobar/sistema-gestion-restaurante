// Ilustraciones SVG locales del catálogo (sin librerías ni recursos externos).
// Lienzo común 120×90 (4:3) para ocupar el espacio de foto. Clases de color en workspace-oscuro.css:
//  t = trazo crema · d = dorado · s = dorado suave · l = líquido · o = óxido · n = naranja · q = crema sólida · h = hoja
const Mesa = () => <path className="t m" d="M16 84h88" />;

const Bollo = ({ y = 0 }) => (
    <g transform={`translate(0 ${y})`}>
        <path className="d" d="M28 44c0-16 14-26 32-26s32 10 32 26z" />
        <path className="q" d="M46 28l3 1M58 24l3 1M70 28l3 1M52 34l3 1M66 34l3 1" />
    </g>
);

const BaseBollo = () => <path className="d" d="M28 68h64v4c0 5-4 8-9 8H37c-5 0-9-3-9-8z" />;

function Hamburguesa({ variante }) {
    return (
        <>
            <Bollo />
            <path className="h" d="M24 46c4 4 8-2 12 2s8-2 12 2 8-2 12 2 8-2 12 2 8-2 12 2 8-2 12 0v4H24z" />
            {variante === 'pollo'
                ? <path className="d" d="M27 54h66c3 0 4 3 3 6l-2 4H26l-2-4c-1-3 0-6 3-6z" />
                : <rect className="o" x="25" y="54" width="70" height="11" rx="5" />}
            {variante === 'pollo' && <path className="t" d="M36 59l4-3M50 60l4-3M64 59l4-3M78 60l4-3" />}
            {variante === 'queso' && <path className="n" d="M26 53h68l-8 7-6-4-8 9-6-6-10 7-6-7-8 6-6-5z" />}
            <BaseBollo />
            <Mesa />
        </>
    );
}

function Botella({ x = 0, y = 0, k = 1 }) {
    return (
        <g transform={`translate(${x} ${y}) scale(${k})`}>
            <rect className="o" x="52" y="6" width="16" height="8" rx="2" />
            <path className="s" d="M53 14h14v8c0 4 9 8 9 16v38c0 3-2 5-5 5H49c-3 0-5-2-5-5V38c0-8 9-12 9-16z" />
            <rect className="d" x="44" y="46" width="32" height="15" />
            <path className="t" d="M50 70q5-3 10 0t10 0M50 40h20" />
        </g>
    );
}

function Lata({ x = 0, y = 0, k = 1 }) {
    return (
        <g transform={`translate(${x} ${y}) scale(${k})`}>
            <path className="s" d="M42 18h36v58c0 3-2 5-5 5H47c-3 0-5-2-5-5z" />
            <ellipse className="t" cx="60" cy="18" rx="18" ry="4" />
            <rect className="o" x="42" y="36" width="36" height="26" />
            <path className="q" d="M48 49c6-8 18 8 24 0" />
            <path className="t" d="M56 16h8" />
        </g>
    );
}

function Vaso({ liquido = 'l' }) {
    return (
        <>
            <path className={liquido} d="M41 34h38l-4.4 44H45.4z" />
            <path className="t" d="M37 14h46l-6.6 66H43.6z" />
            <path className="t" d="M47 46h8v8h-8zM60 56h8v8h-8z" />
        </>
    );
}

function Limon({ cx, cy, r }) {
    return (
        <g>
            <circle className="d" cx={cx} cy={cy} r={r} />
            <circle className="t" cx={cx} cy={cy} r={r * 0.72} />
            <path className="t" d={`M${cx} ${cy - r * 0.72}V${cy + r * 0.72}M${cx - r * 0.72} ${cy}H${cx + r * 0.72}M${cx - r * 0.5} ${cy - r * 0.5}l${r} ${r}M${cx + r * 0.5} ${cy - r * 0.5}l${-r} ${r}`} />
        </g>
    );
}

const Hoja = ({ d, nervio }) => (
    <g>
        <path className="h" d={d} />
        <path className="t fino" d={nervio} />
    </g>
);

function Pan({ gratinado }) {
    return (
        <>
            <path className="d" d="M24 76V50c-6-2-8-8-6-14 3-8 12-12 22-12h40c10 0 19 4 22 12 2 6 0 12-6 14v26z" />
            <path className="s" d="M32 72V48c-5-2-6-6-4-10 2-4 8-7 14-7h36c6 0 12 3 14 7 2 4 1 8-4 10v24z" />
            {gratinado
                ? <path className="n" d="M30 40c6-6 18-8 30-8s24 2 30 8l-2 8-4-4-3 10-5-8-5 12-5-10-6 9-5-11-5 8-4-9-4 5z" />
                : <path className="o" d="M42 44l3 2M56 40l3 2M70 46l3 2M48 56l3 2M64 54l3 2M80 52l3 2M44 66l3 2M60 64l3 2M76 64l3 2" />}
            <Mesa />
        </>
    );
}

function Muslo({ x = 0, y = 0, k = 1 }) {
    return (
        <g transform={`translate(${x} ${y}) scale(${k})`}>
            <path className="d" d="M30 36c8-16 32-18 44-6 10 10 8 26-4 34-8 5-18 4-24 0l-10 10c2 4-1 8-5 7-1 4-6 5-8 2s0-7 4-7c-1-4 3-7 7-5l10-10c-6-6-17-14-14-25z" />
            <path className="o" d="M44 34l10 6M52 28l12 8M46 46l10 6" />
        </g>
    );
}

const Plato = () => (
    <>
        <ellipse className="s" cx="60" cy="66" rx="46" ry="14" />
        <ellipse className="t" cx="60" cy="64" rx="32" ry="8" />
    </>
);

const Ajo = ({ x, y }) => (
    <g transform={`translate(${x} ${y})`}>
        <path className="q" d="M0 0c-8 2-12 10-8 16 3 4 13 4 16 0 4-6 0-14-8-16zM0 0v-6" />
        <path className="t fino" d="M0 2v14M-5 4c-1 4-1 8 1 12M5 4c1 4 1 8-1 12" />
    </g>
);

const dibujos = {
    botella: () => <><Botella /><Mesa /></>,
    lata: () => <><Lata /><Mesa /></>,
    taza: () => (
        <>
            <path className="t" d="M48 8c-4 4 4 6 0 10M60 6c-4 4 4 6 0 10M72 8c-4 4 4 6 0 10" />
            <path className="s" d="M30 30h52v18c0 13-10 24-23 24h-6c-13 0-23-11-23-24z" />
            <path className="t" d="M82 36h6c6 0 10 4 10 10s-4 10-10 10h-8" />
            <ellipse className="d" cx="56" cy="30" rx="26" ry="5" />
            <path className="o" d="M56 34c-6-3-6-7-2-7 1 0 2 1 2 2 0-1 1-2 2-2 4 0 4 4-2 7z" />
            <ellipse className="t" cx="58" cy="80" rx="40" ry="5" />
        </>
    ),
    vasoLimon: () => (
        <>
            <path className="o-trazo" d="M64 40L76 4" />
            <Vaso />
            <Limon cx={82} cy={18} r={12} />
            <Mesa />
        </>
    ),
    limonHojas: () => (
        <>
            <Hoja d="M58 30c4-14 18-22 32-20-2 14-16 24-32 20z" nervio="M60 28c8-6 16-12 26-16" />
            <Hoja d="M56 30c-8-12-22-16-34-10 6 12 20 16 34 10z" nervio="M54 28c-8-4-18-6-28-6" />
            <ellipse className="d" cx="48" cy="56" rx="26" ry="20" />
            <path className="t" d="M24 52c-2 4-2 8 0 10M72 52c2 4 2 8 0 10" />
            <Limon cx={84} cy={62} r={15} />
            <Mesa />
        </>
    ),
    naranjaVaso: () => (
        <g>
            <g transform="translate(18 0)"><Vaso liquido="n-suave" /></g>
            <circle className="n" cx="36" cy="60" r="22" />
            <path className="t" d="M28 50c3-4 7-5 10-5" />
            <Hoja d="M36 38c2-8 10-12 18-10-2 8-10 12-18 10z" nervio="M38 37c4-3 8-6 14-8" />
            <Mesa />
        </g>
    ),
    champinones: () => (
        <>
            <path className="s" d="M36 58h14v18c0 3-3 5-7 5s-7-2-7-5z" />
            <path className="d" d="M18 58c0-16 11-26 25-26s25 10 25 26z" />
            <path className="s" d="M70 52h12v22c0 3-3 5-6 5s-6-2-6-5z" />
            <path className="d" d="M56 52c0-13 9-22 20-22s20 9 20 22z" />
            <path className="o" d="M30 46l4-2M44 40l4 2M54 48l3-2M70 40l3-2M82 42l4 2M74 48l3 1" />
            <Ajo x={100} y={62} />
            <Mesa />
        </>
    ),
    ensalada: () => (
        <>
            <Hoja d="M34 46c-6-14 2-24 14-26 2 14-4 22-14 26z" nervio="M36 44c2-8 6-16 10-22" />
            <Hoja d="M52 44c0-16 10-24 22-22-2 14-10 22-22 22z" nervio="M54 42c4-8 10-14 18-18" />
            <Hoja d="M70 46c4-12 16-18 26-14-4 12-14 16-26 14z" nervio="M72 44c6-4 14-8 22-10" />
            <circle className="o" cx="46" cy="44" r="6" />
            <circle className="o" cx="78" cy="42" r="5" />
            <circle className="q" cx="62" cy="42" r="4" />
            <path className="s" d="M20 46h80c0 18-18 30-40 30S20 64 20 46z" />
            <path className="t" d="M44 80h32" />
            <Mesa />
        </>
    ),
    pan: () => <Pan />,
    panGratinado: () => <Pan gratinado />,
    hamburguesa: () => <Hamburguesa />,
    hamburguesaQueso: () => <Hamburguesa variante="queso" />,
    hamburguesaPollo: () => <Hamburguesa variante="pollo" />,
    lomo: () => (
        <>
            <path className="t" d="M18 78h84M26 72l-6 10M46 72l-6 10M66 72l-6 10M86 72l-6 10M100 72l-6 10" />
            <path className="o" d="M24 46c0-12 14-20 36-20s38 8 38 20-14 22-38 22-36-8-36-22z" />
            <path className="q" d="M24 46c0 10 12 20 36 22-18-4-28-12-28-22 0-8 8-14 22-18-18 2-30 8-30 18z" />
            <path className="d" d="M46 36l-8 14M62 34l-10 20M78 36l-10 20M90 42l-6 12" />
        </>
    ),
    pescado: () => (
        <>
            <Plato />
            <path className="s" d="M24 50c10-16 34-22 54-12l18-10c-2 8-2 16 0 26l-18-10c-20 12-44 8-54 6z" />
            <circle className="o" cx="36" cy="46" r="2.5" />
            <path className="t" d="M44 40c3 4 3 10 0 14M58 38l-6 8M66 38l-6 8" />
            <Limon cx={88} cy={66} r={8} />
        </>
    ),
    pollo: () => (
        <>
            <path className="t" d="M18 80h84M28 74l-6 10M48 74l-6 10M68 74l-6 10M88 74l-6 10" />
            <Muslo x={8} y={-2} />
        </>
    ),
    polloAjillo: () => (
        <>
            <Plato />
            <Muslo x={-6} y={-6} k={0.95} />
            <Ajo x={86} y={44} />
            <Ajo x={98} y={52} />
        </>
    ),
    // Categorías
    todos: () => (
        <>
            <path className="s" d="M60 22c-10-6-24-8-38-6v58c14-2 28 0 38 6z" />
            <path className="s" d="M60 22c10-6 24-8 38-6v58c-14-2-28 0-38 6z" />
            <path className="t" d="M30 30c8-1 16 0 22 3M30 40c8-1 16 0 22 3M30 50c8-1 16 0 22 3M68 33c6-3 14-4 22-3M68 43c6-3 14-4 22-3M68 53c6-3 14-4 22-3" />
            <path className="o" d="M84 14h8v20l-4-4-4 4z" />
            <path className="t" d="M60 22v58" />
        </>
    ),
    entradas: () => (
        <>
            <Plato />
            <path className="d" d="M30 60c0-8 6-12 14-12h6c6 0 8 4 6 8l-2 4z" />
            <path className="s" d="M66 62h8v-6h-8z" />
            <path className="d" d="M60 58c0-10 6-16 14-16s14 6 14 16z" />
            <circle className="o" cx="88" cy="60" r="5" />
            <path className="t" d="M40 34l6 20M80 30l-4 14" />
        </>
    ),
    platos: () => (
        <>
            <path className="s" d="M26 64c0-20 16-34 34-34s34 14 34 34z" />
            <path className="d" d="M56 30c0-4 2-6 4-6s4 2 4 6" />
            <path className="t" d="M38 52c4-8 10-12 16-14" />
            <path className="t" d="M18 68h84" />
            <path className="t" d="M10 40v14M6 40v8c0 4 2 6 4 6s4-2 4-6v-8M10 54v26M110 40c-4 4-4 12 0 16v24" />
            <Mesa />
        </>
    ),
    bebidasPreparadas: () => (
        <>
            <path className="o-trazo" d="M64 40L76 4" />
            <Vaso />
            <Hoja d="M78 26c2-8 10-12 18-10-2 8-10 12-18 10z" nervio="M80 25c4-3 8-6 14-8" />
            <Limon cx={34} cy={70} r={10} />
            <Mesa />
        </>
    ),
    bebidasEnvasadas: () => (
        <>
            <Botella x={-14} y={4} k={0.92} />
            <Lata x={34} y={16} k={0.78} />
            <Mesa />
        </>
    ),
};

export default function IconoMenu({ nombre, className = '' }) {
    const Dibujo = dibujos[nombre] || dibujos.platos;
    return (
        <svg className={`icono-menu ${className}`.trim()} viewBox="0 0 120 90" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
            <Dibujo />
        </svg>
    );
}

