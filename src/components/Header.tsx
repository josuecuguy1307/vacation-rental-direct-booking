"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/site-data";
import { useContact, waHref } from "@/components/ContactContext";
import { SITE } from "@/config/site.config";

/* Header compartido. En el home flota transparente sobre el hero; en las
   demás páginas (sin hero oscuro detrás) va siempre sólido. */
export function Header({ solid = false }: { solid?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  const c = useContact();

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <>
      <header className={"header" + (solid || scrolled ? " scrolled" : "")}>
        <Link className="header__logo" href="/" aria-label={`${SITE.name}`} onClick={() => setMenu(false)}>
          <img src="/assets/logo-white.png" alt={`${SITE.name}`} />
        </Link>
        <nav className="header__nav">
          {NAV.map(([t, h]) => (
            <Link key={h} href={h} className={pathname === h ? "on" : ""}>{t}</Link>
          ))}
        </nav>
        <div className="header__cta">
          <a className="header__phone" href={waHref(c.whatsapp)} target="_blank" rel="noopener">
            {c.whatsappShow}
          </a>
          <Link className="btn btn--primary" href="/reservar" style={{ padding: "12px 22px" }}>
            Reservar
          </Link>
          <button className="burger" aria-label="Menú" onClick={() => setMenu(true)}>
            <span></span><span></span><span></span>
          </button>
        </div>
      </header>
      <div className={"mobile-menu" + (menu ? " open" : "")}>
        <button className="close" onClick={() => setMenu(false)} aria-label="Cerrar">×</button>
        {NAV.map(([t, h]) => (
          <Link key={h} href={h} onClick={() => setMenu(false)}>{t}</Link>
        ))}
        <Link href="/reservar" onClick={() => setMenu(false)}>Reservar</Link>
      </div>
    </>
  );
}
