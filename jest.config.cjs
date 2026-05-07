/** @type {import("jest").Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testTimeout: 300_000,
  forceExit: true,
  verbose: true,
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json", diagnostics: false }],
    "^.+\\.js$": "babel-jest",
  },
  transformIgnorePatterns: ["/node_modules/(?!@noble/)"],
  moduleNameMapper: {
    "^@noble/curves/nist$": "<rootDir>/node_modules/@noble/curves/nist.js",
  },
}
