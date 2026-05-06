/** Transpile ESM-only deps (e.g. `@noble/*`) when Jest pulls them in from `node_modules`. */
module.exports = {
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
}
