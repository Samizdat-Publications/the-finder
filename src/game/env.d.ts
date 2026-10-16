// The one Vite flag the game reads (import.meta.env.DEV). Declared by hand so the project does not need
// vite/client's wildcard module types, which would clash with src/checked/raw.d.ts.
interface ImportMeta {
  readonly env: { readonly DEV: boolean };
}
