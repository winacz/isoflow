declare module '*.svg' {
  /** Webpack `asset/inline` → data-URI string (see webpack/*.config.js). */
  const src: string;
  export default src;
}
