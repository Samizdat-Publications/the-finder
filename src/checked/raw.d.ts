// Vite's ?raw suffix imports a file as a string.
declare module '*?raw' {
  const text: string;
  export default text;
}

// Stylesheets are imported for their side effect only.
declare module '*.css';
