import globals from "globals";

export default [
  {
    files: ["**/*.{js,mjs,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node
      },
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    rules: {
      "no-undef": "error"
    }
  },
  {
    ignores: [".next/**", "node_modules/**", "out/**"]
  }
];
