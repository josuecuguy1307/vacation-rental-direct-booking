/**
 * Reading REQUIRED environment variables.
 *
 * There are never default values: if a variable is missing, an error is thrown that
 * says which one it is, what it is for and what to do. The sample values in
 * `.env.example` (TU_…_AQUI, i.e. "YOUR_…_HERE") count as "not configured".
 */

const PLACEHOLDER = /^(TU_.*_AQUI|CAMBIA_ESTO.*|changeme|xxx+)$/i;

export class MissingEnvError extends Error {
  constructor(name: string, hint?: string) {
    super(
      `Missing environment variable ${name}.` +
        (hint ? ` ${hint}` : "") +
        ` Copy .env.example to .env.local and fill in your own values (see README, "Step-by-step setup").`
    );
    this.name = "MissingEnvError";
  }
}

/** The value of `name`, or throws MissingEnvError if it is missing, empty or a placeholder. */
export function requireEnv(name: string, hint?: string): string {
  const v = process.env[name]?.trim();
  if (!v || PLACEHOLDER.test(v)) throw new MissingEnvError(name, hint);
  return v;
}

/** The value of `name`, or undefined (truly optional variables). A placeholder counts as absent. */
export function optionalEnv(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && !PLACEHOLDER.test(v) ? v : undefined;
}

/** Public URL of the site, without a trailing "/". Used to build links in emails and messages. */
export function siteBaseUrl(): string {
  return requireEnv(
    "NEXT_PUBLIC_BASE_URL",
    'It is the public URL of your site (e.g. "https://your-domain.com"; locally "http://localhost:3000").'
  ).replace(/\/+$/, "");
}
