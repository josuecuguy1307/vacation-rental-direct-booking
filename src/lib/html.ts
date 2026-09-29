/**
 * Escapa texto para interpolarlo dentro de HTML (cuerpo o atributo entre
 * comillas). Todo dato que venga del huésped (nombre, email, mensaje) pasa
 * por aquí antes de entrar a un correo o a una página: sin esto, un nombre
 * como `<a href=…>` se convierte en un link real dentro del correo de la
 * dueña.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
