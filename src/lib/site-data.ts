/* ============================================================
   Datos del sitio. La identidad (nombre, contacto, ubicación) vive en
   src/config/site.config.ts; aquí queda el CONTENIDO editable (tour,
   amenidades, textos) — todo con ejemplos genéricos que debes reemplazar.
   Los precios, límites de huéspedes y demás reglas de negocio NO están
   aquí: viven en la base (tabla `properties`, ver supabase/seed.sql).
   ============================================================ */

import { SITE } from "@/config/site.config";

export const CB = {
  nombre: SITE.name,
  lugar: SITE.location,
  tagline: SITE.tagline,
  whatsapp: SITE.whatsapp,
  whatsappShow: SITE.whatsappDisplay,
  waMsg: SITE.whatsappMessage,
  instagram: SITE.instagram,
  facebook: SITE.facebook,
  email: SITE.email,
  direccion: SITE.address,
  // respaldo del formulario de reserva (los reales vienen de la base)
  precioNoche: SITE.fallback.nightlyPrice,
  limpieza: SITE.fallback.cleaningFee,
  anticipoPct: SITE.fallback.depositPct,
  minNoches: SITE.fallback.minNights,
  huespedesIncluidos: SITE.fallback.includedGuests,
  extraPorNoche: SITE.fallback.extraGuestPerNight,
  maxHuespedes: SITE.fallback.maxGuests,
};

export const MAPS_URL = SITE.mapsUrl;

export const MAP = { lat: SITE.lat, lng: SITE.lng, zoom: SITE.zoom };

export const mapEmbedUrl = () =>
  `https://maps.google.com/maps?q=${encodeURIComponent(SITE.mapsQuery)}&z=15&output=embed&hl=es`;

export const waLink = (msg?: string) =>
  `https://wa.me/${CB.whatsapp}?text=${encodeURIComponent(msg || CB.waMsg)}`;

/* Navegación por PÁGINAS (cada sección en su propia pantalla) */
export const NAV: Array<[string, string]> = [
  ['Inicio', '/'], ['La casa', '/la-casa'], ['Galería', '/galeria'],
  ['Ubicación', '/ubicacion'],
];

/* ── Slider del hero (Etapa 13): las mejores fotos, rotan cada ~5s ── */
export const HERO_SLIDES = [
  { src: '/assets/photos/casa-frente.jpg',         alt: `${SITE.name}: fachada` },
  { src: '/assets/tour/alberca.avif',              alt: 'Piscina temperada y áreas exteriores' },
  { src: '/assets/photos/casa-piscina-social.jpg', alt: 'Áreas sociales junto a la piscina' },
  { src: '/assets/tour/exterior.avif',             alt: `Exteriores de ${SITE.name}` },
  { src: '/assets/tour/jardin.avif',               alt: 'Jardín y áreas verdes' },
  { src: '/assets/photos/celebracion.jpg',         alt: 'Celebraciones en familia' },
];

/* ── Recorrido fotográfico (Etapa 13, estilo Airbnb) ──────────────
   Cada espacio lleva su línea de detalles separados por " · " bajo el
   título (addendum del cliente). EDITABLE: cambia textos/orden aquí. */
export type TourSpace = {
  slug: string;
  label: string;
  photo: string;
  details: string[];   // [] = sin descripción (Exterior, Fotos adicionales)
};

export const TOUR: TourSpace[] = [
  { slug: 'sala',        label: 'Sala',            photo: '/assets/tour/sala.avif',
    details: ['Aire acondicionado', 'TV', 'Sofás'] },
  { slug: 'cocina',      label: 'Cocina',          photo: '/assets/tour/cocina.avif',
    details: ['Copas de vino', 'Estufa', 'Refrigerador', 'Microondas', 'Cafetera', 'Utensilios de cocina'] },
  { slug: 'comedor',     label: 'Comedor',         photo: '/assets/tour/comedor.avif',
    details: ['Aire acondicionado', 'Copas de vino', 'Mesa de comedor'] },
  { slug: 'recamara-1',  label: 'Recámara 1',      photo: '/assets/tour/recamara-1.avif',
    details: ['Cama de dos plazas'] },
  { slug: 'recamara-2',  label: 'Recámara 2',      photo: '/assets/tour/recamara-2.avif',
    details: ['Cama Queen Size'] },
  { slug: 'recamara-3',  label: 'Recámara 3',      photo: '/assets/tour/recamara-3.avif',
    details: ['Cama de dos plazas', 'Sofá cama'] },
  { slug: 'bano-1',      label: 'Baño completo 1', photo: '/assets/tour/bano-1.avif',
    details: ['Acondicionador', 'Agua caliente', 'Bidé', 'Jabón corporal', 'Secadora de pelo', 'Shampoo'] },
  { slug: 'bano-2',      label: 'Baño completo 2', photo: '/assets/tour/bano-2.avif',
    details: ['Acondicionador', 'Agua caliente', 'Bidé', 'Jabón corporal', 'Secadora de pelo', 'Shampoo'] },
  { slug: 'bano-3',      label: 'Baño completo 3', photo: '/assets/tour/bano-3.avif',
    details: ['Agua caliente', 'Bidé'] },
  { slug: 'jardin',      label: 'Jardín',          photo: '/assets/tour/jardin.avif',
    details: ['Patio', 'Muebles exteriores', 'Parrilla'] },
  { slug: 'lavado',      label: 'Área de lavado',  photo: '/assets/tour/lavado.avif',
    details: ['Lavadora', 'Secadora', 'Plancha'] },
  { slug: 'exterior',    label: 'Exterior',        photo: '/assets/tour/exterior.avif',
    details: [] },
  { slug: 'alberca',     label: 'Piscina',         photo: '/assets/tour/alberca.avif',
    details: ['Camastros', 'Agua caliente', 'Alberca', 'Cocina exterior', 'Comedor al aire libre', 'Frigobar'] },
  { slug: 'adicionales', label: 'Fotos adicionales', photo: '/assets/tour/adicionales.avif',
    details: [] },
];

/* ── "El alojamiento" — texto de ejemplo: reemplázalo por el de tu propiedad ── */
export const ALOJAMIENTO = {
  titulo: 'Casa familiar para tus escapadas',
  intro: 'Describe aquí tu propiedad en dos o tres frases: dónde está, para cuántas personas es y qué la hace especial. Este texto es un ejemplo; edítalo en src/lib/site-data.ts.',
  secciones: [
    {
      t: 'El alojamiento',
      p: 'Cuenta qué incluye la casa: número de habitaciones, capacidad, cocina, áreas sociales, piscina, jardín, etc. Este párrafo es solo un ejemplo.',
    },
    {
      t: 'Acceso para huéspedes',
      p: 'Explica qué áreas pueden usar los huéspedes durante su estadía y cualquier norma de uso.',
    },
    {
      t: 'Otros aspectos destacables',
      p: 'Menciona condiciones especiales: mínimo de huéspedes, mínimo de noches, mascotas, horarios, etc.',
    },
  ],
};

/* ── "Dónde vas a dormir" (Etapa 13) — camas según el addendum ───── */
export const DORMITORIOS = [
  { label: 'Recámara 1', camas: 'Cama de dos plazas',             photo: '/assets/tour/recamara-1.avif' },
  { label: 'Recámara 2', camas: 'Cama Queen Size',                photo: '/assets/tour/recamara-2.avif' },
  { label: 'Recámara 3', camas: 'Cama de dos plazas · Sofá cama', photo: '/assets/tour/recamara-3.avif' },
];

/* ── Modal "Lo que ofrece este lugar" (addendum E13) ───────────────
   Réplica de las categorías/items de Airbnb, en este orden. `sub` =
   subtexto gris; `off` = "No incluidos" (tachado gris al final).
   EDITABLE: este es EL archivo de contenido — no tocar componentes. */
export type AmenityItem = { t: string; ic?: string; sub?: string; off?: boolean };

export const AMENITY_GROUPS: Array<{ cat: string; items: AmenityItem[] }> = [
  { cat: 'Baño', items: [
    { t: 'Secadora de pelo', ic: 'bath' },
    { t: 'Shampoo', ic: 'bath' },
    { t: 'Acondicionador', ic: 'bath' },
    { t: 'Jabón corporal', ic: 'bath' },
    { t: 'Bidé', ic: 'bath' },
    { t: 'Regadera exterior', ic: 'bath' },
  ]},
  { cat: 'Habitación y lavandería', items: [
    { t: 'Lavadora', ic: 'sparkles' },
    { t: 'Secadora', ic: 'sparkles' },
    { t: 'Plancha', ic: 'sparkles' },
  ]},
  { cat: 'Entretenimiento', items: [
    { t: 'TV', ic: 'projector' },
  ]},
  { cat: 'Calefacción y refrigeración', items: [
    { t: 'Aire acondicionado', ic: 'snow' },
  ]},
  { cat: 'Seguridad en el hogar', items: [
    { t: 'Cámaras de seguridad exteriores en la propiedad', ic: 'shield',
      sub: 'Indica aquí dónde están instaladas (ejemplo).' },
    { t: 'Extinguidor de incendios', ic: 'flame' },
    { t: 'Botiquín', ic: 'check' },
  ]},
  { cat: 'Internet y oficina', items: [
    { t: 'Wifi', ic: 'wifi' },
  ]},
  { cat: 'Cocina y comedor', items: [
    { t: 'Cocina', ic: 'kitchen', sub: 'Cocina disponible para el uso de los huéspedes' },
    { t: 'Refrigerador', ic: 'kitchen' },
    { t: 'Microondas', ic: 'kitchen' },
    { t: 'Artículos básicos de cocina', ic: 'cart', sub: 'Ollas y sartenes, aceite, sal y pimienta' },
    { t: 'Platos y cubiertos', ic: 'cart', sub: 'Platos hondos, palillos chinos, platos, tazas, etc.' },
    { t: 'Frigobar', ic: 'kitchen' },
    { t: 'Congelador', ic: 'kitchen' },
    { t: 'Estufa', ic: 'kitchen' },
    { t: 'Horno', ic: 'kitchen' },
    { t: 'Jarra eléctrica', ic: 'coffee' },
    { t: 'Cafetera', ic: 'coffee' },
    { t: 'Copas de vino', ic: 'coffee' },
    { t: 'Licuadora', ic: 'kitchen' },
    { t: 'Utensilios para hacer parrillada', ic: 'grill', sub: 'Parrilla, carbón, palillos de bambú/hierro, etc.' },
    { t: 'Mesa de comedor', ic: 'kitchen' },
    { t: 'Café', ic: 'coffee' },
    { t: 'Panificadora', ic: 'kitchen' },
  ]},
  { cat: 'Exterior', items: [
    { t: 'Patio', ic: 'mountain', sub: 'Un espacio abierto en la propiedad generalmente cubierto de pasto' },
    { t: 'Muebles exteriores', ic: 'sofa' },
    { t: 'Comedor al aire libre', ic: 'kitchen' },
    { t: 'Cocina exterior', ic: 'flame' },
    { t: 'Parrilla', ic: 'grill' },
    { t: 'Camastros', ic: 'pool' },
  ]},
  { cat: 'Estacionamiento e instalaciones', items: [
    { t: 'Estacionamiento gratuito en las instalaciones', ic: 'car' },
    { t: 'Piscina temperada', ic: 'pool' },
    { t: 'Hidromasaje / Jacuzzi', ic: 'jacuzzi' },
  ]},
  { cat: 'Servicios', items: [
    { t: 'Se admiten mascotas', ic: 'paw', sub: 'Los animales de asistencia siempre están permitidos' },
    { t: 'Llegada autónoma', ic: 'route' },
    { t: 'Cerradura con código', ic: 'lock', sub: 'Entra al alojamiento de manera independiente gracias a un código en la puerta' },
  ]},
  { cat: 'No incluidos', items: [
    { t: 'Servicios básicos', ic: 'check', off: true },
    { t: 'Detector de humo', ic: 'flame', off: true,
      sub: 'Es posible que este lugar no tenga un detector de humo. Si tienes alguna pregunta, comunícate con el anfitrión.' },
    { t: 'Detector de monóxido de carbono', ic: 'shield', off: true,
      sub: 'Es posible que este lugar no tenga un detector de monóxido de carbono. Si tienes alguna pregunta, comunícate con el anfitrión.' },
    { t: 'Calefacción', ic: 'snow', off: true },
  ]},
];

export const STATS = [
  { n: '3',  l: 'Habitaciones' },
  { n: '8',  l: 'Huéspedes' },
  { n: '10', l: 'Min. al centro' },
  { n: '45', l: 'Min. al aeropuerto' },
];

/* Vista RESUMIDA del home: ~10 amenidades destacadas (addendum E13).
   El listado COMPLETO vive en AMENITY_GROUPS (modal "Lo que ofrece"). */
export const AMENITIES = [
  { ic: 'kitchen',   t: 'Cocina',                  d: 'Completamente equipada para cocinar en casa.' },
  { ic: 'car',       t: 'Estacionamiento gratuito', d: 'En las instalaciones, para varios autos.' },
  { ic: 'jacuzzi',   t: 'Jacuzzi',                 d: 'Hidromasaje de agua caliente al aire libre.' },
  { ic: 'projector', t: 'TV',                      d: 'TV en sala y TV en la zona de barbecue.' },
  { ic: 'wifi',      t: 'Wifi',                    d: 'Conexión en toda la casa.' },
  { ic: 'pool',      t: 'Piscina temperada',       d: 'Agua temperada rodeada de naturaleza.' },
  { ic: 'paw',       t: 'Se admiten mascotas',     d: 'Tu mascota es bienvenida — avísanos al reservar.' },
  { ic: 'shield',    t: 'Cámaras de seguridad exteriores', d: 'En accesos y exteriores de la propiedad.' },
  { ic: 'snow',      t: 'Aire acondicionado',      d: 'Climatización en las habitaciones.' },
  { ic: 'lock',      t: 'Llegada autónoma',        d: 'Entra con un código en la puerta.' },
  { ic: 'sparkles',  t: 'Lavadora',                d: 'Lavadora disponible durante tu estadía.' },
  { ic: 'sparkles',  t: 'Secadora',                d: 'Secadora de ropa en la lavandería interna.' },
];

// Fallback estático del catálogo de snacks: lo usa la página /snacks cuando la
// API no responde. La fuente real son los addons con category='snack' (seed.sql).
export const SNACKS = [
  { t: 'Snack de ejemplo 1', price: 2.50, img: '/assets/snacks/nutella.webp' },
  { t: 'Snack de ejemplo 2', price: 1.50, img: '/assets/snacks/pringles.jpg' },
  { t: 'Snack de ejemplo 3', price: 2.00, img: '/assets/snacks/popcorn.webp' },
  { t: 'Snack de ejemplo 4', price: 1.25, img: '/assets/snacks/kars.webp' },
  { t: 'Snack de ejemplo 5', price: 1.25, img: '/assets/snacks/kind.png' },
  { t: 'Snack de ejemplo 6', price: 1.50, img: '/assets/snacks/maruchan.jpg' },
  { t: 'Snack de ejemplo 7', price: 1.00, img: '/assets/snacks/belvita.webp' },
  { t: 'Dulces surtidos', price: 2.50, img: null },
  { t: 'Caramelos', price: 0.50, img: null },
];

/* Pasos para llegar en auto (ejemplos): un texto corto por paso. */
export const ARRIVAL_STEPS: string[] = [
  'Toma la vía principal en dirección a la ciudad (ejemplo).',
  'Reconoce la entrada por una referencia visible: un letrero, un portón, etc.',
  'Sigue hasta el fondo y gira a la izquierda.',
  'La casa queda a unos 200 metros, a tu derecha. Escríbenos si necesitas ayuda.',
];

/* Cómo llegar: solo origen + tiempo (ejemplos). */
export const HOWTO = [
  { t: 'Desde la ciudad A', h: '1 h' },
  { t: 'Desde la ciudad B', h: '2 h' },
  { t: 'Desde la capital',  h: '4 h' },
];

/* Lugares cercanos (ejemplos). */
export const NEAR = [
  { t: 'Parque principal', d: '12 min' },
  { t: 'Cascada de ejemplo', d: '40 min' },
  { t: 'Malecón', d: '10 min' },
  { t: 'Mirador de ejemplo', d: '35 min' },
  { t: 'Centro comercial', d: '15 min' },
  { t: 'Iglesia del centro', d: '20 min' },
];
