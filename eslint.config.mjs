import coreWebVitals from "eslint-config-next/core-web-vitals";

/** Flat ESLint config (Next 16 removed `next lint`; we run eslint directly). */
const config = [
  { ignores: [".next/**", "node_modules/**", "scratch/**", "data/**"] },
  ...coreWebVitals,
];

export default config;
