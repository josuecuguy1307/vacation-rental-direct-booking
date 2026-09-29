import type { CSSProperties, ReactNode } from "react";

/* Iconos de línea 24x24 del diseño original */
const FILLED = new Set(["star", "whatsapp", "instagram", "facebook", "check"]);

const PATHS: Record<string, ReactNode> = {
  pin: (<><path d="M12 21s7-6.3 7-11.5A7 7 0 0 0 5 9.5C5 14.7 12 21 12 21Z"/><circle cx="12" cy="9.3" r="2.4"/></>),
  pool: (<><path d="M3 18c1.6 0 1.6-1.2 3.2-1.2S7.8 18 9.4 18s1.6-1.2 3.2-1.2S14.2 18 15.8 18s1.6-1.2 3.2-1.2S20.6 18 22 18"/><path d="M3 13c1.6 0 1.6-1.2 3.2-1.2S7.8 13 9.4 13s1.6-1.2 3.2-1.2S14.2 13 15.8 13s1.6-1.2 3.2-1.2S20.6 13 22 13"/><path d="M7 11V5.5A1.5 1.5 0 0 1 8.5 4M16 11V5.5A1.5 1.5 0 0 0 14.5 4"/></>),
  jacuzzi: (<><path d="M4 11h16v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-4Z"/><path d="M8 11V6a2 2 0 0 1 2-2"/><path d="M12 4v.01M15 5v.01M9 5v.01"/><path d="M7 22l.5-1M12 22l.5-1M17 22l.5-1"/></>),
  flame: (<><path d="M12 3c.5 3-2 4-2 7a2 2 0 0 0 4 0c0-.8-.3-1.4-.3-1.4S16 11 16 14a4 4 0 0 1-8 0c0-4 4-5 4-11Z"/></>),
  snow: (<><path d="M12 2v20M4 6l16 12M20 6 4 18"/><path d="M12 6 9 4m3 2 3-2M12 18l-3 2m3-2 3 2M4.5 12l-2 1m2-1-2-1M19.5 12l2 1m-2-1 2-1"/></>),
  bed: (<><path d="M3 18v-9m0 9h18m0 0v-5a3 3 0 0 0-3-3H3m4 3h8"/><path d="M21 18v2M3 18v2"/></>),
  bath: (<><path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3Z"/><path d="M6 12V6a2 2 0 0 1 2-2c1 0 1.5.6 1.8 1"/><circle cx="9" cy="6" r="1"/><path d="M7 22l.6-1M17 22l-.6-1"/></>),
  users: (<><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5M21 20a6 6 0 0 0-4-5.6"/></>),
  wifi: (<><path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0"/><path d="M2 9a15 15 0 0 1 20 0"/><circle cx="12" cy="18.5" r="1"/></>),
  car: (<><path d="M5 17h14M6 17v2M18 17v2"/><path d="M4 13l1.5-4.2A2 2 0 0 1 7.4 7.5h9.2a2 2 0 0 1 1.9 1.3L20 13"/><rect x="3" y="13" width="18" height="4" rx="1.2"/><circle cx="7.5" cy="17" r=".4"/><circle cx="16.5" cy="17" r=".4"/></>),
  kitchen: (<><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 9h16M8 5v2M12 5v2"/><circle cx="9" cy="15" r="2"/><path d="M15 13v4"/></>),
  mountain: (<><path d="M3 19h18L14 7l-3.2 5L9 9l-6 10Z"/><circle cx="16" cy="6" r="1.4"/></>),
  volley: (<><circle cx="12" cy="12" r="9"/><path d="M12 3c3 3 4.2 7.3 3 12M12 3c-4 1.4-7 4.8-8 9M5.3 7.2c4.2 1 9.2.8 13.6-1.2M3.2 13.2c3-2 8.2-3 13.2.4M9.2 20.7c1.4-4 4.4-7.2 9-8.2"/></>),
  sofa: (<><path d="M5 10V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/><path d="M3 11a2 2 0 0 1 2 2v3h14v-3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v5H1v-5a2 2 0 0 1 2-2Z"/><path d="M6 19v2M18 19v2"/></>),
  soccer: (<><circle cx="12" cy="12" r="9"/><path d="M12 7.6l2.7 1.9-1 3.2H10.3l-1-3.2L12 7.6Z"/><path d="M12 7.6V3.2M14.7 9.5l3.2-1.1M13.7 12.7l1.9 2.8M10.3 12.7l-1.9 2.8M9.3 9.5 6.1 8.4"/></>),
  projector: (<><rect x="3" y="8" width="18" height="9" rx="2"/><circle cx="14.5" cy="12.5" r="3"/><path d="M6.5 12.5h.01M7.5 8V6.2h5.5V8"/><path d="M7 17l-1 3M17 17l1 3"/></>),
  cart: (<><circle cx="9" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/><path d="M3 4h2l2.2 11.1a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.5-1.2L20.5 8H6"/></>),
  check: (<path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>),
  shield: (<><path d="M12 3l7 3v5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3Z"/><path d="M9 12l2 2 4-4"/></>),
  lock: (<><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></>),
  star: (<path d="M12 2.5l2.9 6 6.6.7-4.9 4.5 1.4 6.5L12 16.9 6 20.2l1.4-6.5L2.5 9.2l6.6-.7 2.9-6Z" fill="currentColor"/>),
  sparkles: (<><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z"/></>),
  coffee: (<><path d="M4 8h13v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z"/><path d="M17 9h2.2a2.2 2.2 0 0 1 0 4.4H17"/><path d="M7 4.5c.4.5.4 1 0 1.6M10.5 4.5c.4.5.4 1 0 1.6M14 21H7"/></>),
  grill: (<><path d="M5 5h14l-1.5 6H6.5L5 5Z"/><path d="M8 11l-1.5 6M16 11l1.5 6M12 11v6"/><path d="M7 5l-1-2M17 5l1-2"/></>),
  route: (<><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 6h7a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7"/></>),
  clock: (<><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></>),
  paw: (<><circle cx="8.4" cy="6.8" r="1.8"/><circle cx="15.6" cy="6.8" r="1.8"/><circle cx="4.9" cy="11.2" r="1.6"/><circle cx="19.1" cy="11.2" r="1.6"/><path d="M12 11c2.7 0 5.1 2.3 5.1 4.8 0 1.8-1.4 3-3.1 3-.8 0-1.3-.3-2-.3s-1.2.3-2 .3c-1.7 0-3.1-1.2-3.1-3 0-2.5 2.4-4.8 5.1-4.8Z"/></>),
  plane: (<><path d="M10 3.5c.7-.7 1.6-.7 1.8.3l1 4.7 6-3.4c.9-.5 1.9.6 1.3 1.4l-4 5.2.9 5.5c.1.7-.7 1.2-1.2.6l-2-2.2-2.6 3.4c-.4.5-1.2.3-1.3-.4l-.6-4.2-4-1.2c-.7-.2-.8-1 0-1.4l5.2-2.6L10 3.5Z"/></>),
  whatsapp: (<path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.02ZM12.05 20.1a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.36c0-4.54 3.7-8.23 8.24-8.23a8.2 8.2 0 0 1 8.23 8.24c0 4.54-3.7 8.22-8.23 8.22Zm4.5-6.16c-.25-.12-1.46-.72-1.69-.8-.23-.09-.39-.12-.56.12-.16.25-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.04-.38-1.99-1.22-.73-.66-1.23-1.46-1.37-1.71-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07s.89 2.4 1.01 2.56c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.46-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z" fill="currentColor" stroke="none"/>),
  instagram: (<><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="17" cy="7" r="1.1" fill="currentColor" stroke="none"/></>),
  facebook: (<path d="M14 9h2.5V6H14c-2 0-3.2 1.2-3.2 3.3V11H8.5v3h2.3v8h3v-8h2.4l.5-3h-2.9V9.7c0-.5.3-.7.8-.7Z" fill="currentColor" stroke="none"/>),
  mail: (<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></>),
  phone: (<path d="M5 4h3l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5V21a2 2 0 0 1-2 2A16 16 0 0 1 4 6a2 2 0 0 1 1-2Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>),
  leaf: (<><path d="M4 20C3 12 8 5 20 4c1 9-4 15-13 15a5 5 0 0 1-3-1Z"/><path d="M4 20S6 13 14 9"/></>),
  arrow: (<path d="M5 12h14m-6-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>),
};

export function Icon({ n, className, style }: { n: string; className?: string; style?: CSSProperties }) {
  const filled = FILLED.has(n);
  const common = filled
    ? {}
    : { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} {...common} aria-hidden="true">
      {PATHS[n]}
    </svg>
  );
}
