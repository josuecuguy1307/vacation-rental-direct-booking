import { Icon } from "@/components/Icon";
import { ArrivalGuide } from "@/components/ArrivalGuide";
import { HOWTO, MAPS_URL, NEAR, mapEmbedUrl } from "@/lib/site-data";
import { SITE } from "@/config/site.config";

export function Location() {
  return (
    <section className="section" id="ubicacion">
      <div className="wrap">
        <div className="sec-head reveal">
          <span className="eyebrow">Cómo llegar</span>
          <h2>A pocos minutos del centro de {SITE.cityLabel}</h2>
        </div>
        <div className="loc">
          <div className="loc__map reveal d1">
            {/* Mapa embebido centrado en SITE.mapsQuery (ver mapEmbedUrl en site-data) */}
            <iframe
              src={mapEmbedUrl()}
              title={`Ubicación de ${SITE.name}`}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="loc__info reveal d2">
            <h3>Dónde estamos</h3>
            <p className="lead" style={{ fontSize: "1rem" }}>
              Cualquiera que sea tu motivo para visitar {SITE.cityLabel}, el lugar donde decidas
              quedarte sí importa. Estamos en {SITE.address}.
            </p>
            <ul className="loc__how">
              {HOWTO.map((h, i) => (
                <li key={i}>
                  <span className="ic"><Icon n="car" /></span>
                  <div><b>{h.t}</b> <span className="loc__how-time">· {h.h}</span></div>
                </li>
              ))}
            </ul>
            <div className="loc__near">
              <h4>Atractivos cercanos</h4>
              <div className="loc__chips">
                {NEAR.map((n, i) => (
                  <span key={i}>
                    <Icon n="pin" style={{ width: 14, height: 14, color: "var(--accent)" }} />
                    {n.t} <b>· {n.d}</b>
                  </span>
                ))}
              </div>
            </div>
            <a
              className="btn btn--ghost"
              href={MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginTop: 26 }}
            >
              <Icon n="pin" style={{ width: 17, height: 17 }} /> Ver en Google Maps
            </a>
          </div>
        </div>
        <ArrivalGuide />
      </div>
    </section>
  );
}
