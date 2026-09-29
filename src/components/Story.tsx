import { SITE } from "@/config/site.config";
export function Story() {
  return (
    <section className="section" id="historia">
      <div className="wrap story">
        <div className="story__media reveal">
          <img src="/assets/photos/casa-angulo.jpg" alt={`Arquitectura de ${SITE.name}`} />
          <div className="tagchip"><b>{SITE.cityLabel}</b><small>{SITE.location}</small></div>
        </div>
        <div className="story__body">
          <span className="eyebrow reveal">Sobre {SITE.name}</span>
          <h2 className="reveal d1">No fue solo abrir una puerta…</h2>
          <p className="lead reveal d2">Fue darle vida a un lugar pensado para compartir, descansar y disfrutar.</p>
          <p className="reveal d2">
            Es un espacio donde el diseño, la naturaleza y la tranquilidad se encuentran.
            Un refugio de descanso para tu familia y tus amigos.
          </p>
          <div className="story__sign reveal d3">
            <span className="line"></span>
            <span>Bienvenidos a {SITE.name}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
