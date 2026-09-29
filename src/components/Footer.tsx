"use client";

import { Icon } from "@/components/Icon";
import { CB, NAV } from "@/lib/site-data";
import { useContact, waHref } from "@/components/ContactContext";
import { SITE } from "@/config/site.config";

export function Footer() {
  const c = useContact();
  return (
    <footer className="footer" id="contacto">
      <div className="wrap">
        <div className="footer__top">
          <div className="footer__brand">
            <a
              href="#top"
              onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              aria-label="Volver al inicio"
            >
              <img src="/assets/logo-cream.png" alt={SITE.name} />
            </a>
            <p>
              {SITE.tagline}
            </p>
            <div className="footer__social">
              <a href={waHref(c.whatsapp)} target="_blank" rel="noopener" aria-label="WhatsApp"><Icon n="whatsapp" /></a>
              {CB.instagram && <a href={`https://www.instagram.com/${CB.instagram}/`} target="_blank" rel="noopener" aria-label="Instagram"><Icon n="instagram" /></a>}
              {CB.facebook && <a href={CB.facebook} target="_blank" rel="noopener" aria-label="Facebook"><Icon n="facebook" /></a>}
            </div>
          </div>
          <div className="footer__col">
            <h5>Explorar</h5>
            {NAV.map(([t, h]) => (
              <a key={h} href={h}>{t}</a>
            ))}
            <a href="/reservar">Reservar</a>
          </div>
          <div className="footer__col">
            <h5>Contacto</h5>
            <a href={waHref(c.whatsapp)} target="_blank" rel="noopener">WhatsApp {c.whatsappShow}</a>
            {CB.instagram && <a href={`https://www.instagram.com/${CB.instagram}/`} target="_blank" rel="noopener">@{CB.instagram}</a>}
            <a href={`mailto:${CB.email}`}>{CB.email}</a>
            <p>{SITE.location}</p>
          </div>
        </div>
        <div className="footer__bottom">
          <span>© {new Date().getFullYear()} {SITE.name}. Todos los derechos reservados.</span>
          {/* TODO etapa 2: páginas reales de términos/privacidad */}
          <span style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <a href="/politicas#cancelacion">Políticas y seguridad</a>
            <a href="#">Términos</a>
            <a href="#">Privacidad</a>
          </span>
        </div>
      </div>
    </footer>
  );
}

export function WhatsAppFloat() {
  const c = useContact();
  return (
    <a
      className="wa-float"
      href={waHref(c.whatsapp, c.waMsg)}
      target="_blank"
      rel="noopener"
      aria-label="Escríbenos por WhatsApp"
    >
      <Icon n="whatsapp" />
      <span className="wa-float__label">Escríbenos</span>
    </a>
  );
}
