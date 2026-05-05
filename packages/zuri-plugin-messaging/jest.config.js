const path = require("path");

module.exports = {
  rootDir: ".",
  testEnvironment: "jsdom",
  moduleFileExtensions: ["js", "jsx", "json"],
  setupFilesAfterEnv: ["<rootDir>/../ui/setupTests.js"],
  moduleNameMapper: {
    "\\.(css|scss|sass)$": "identity-obj-proxy",
    "\\.(gif|jpe?g|png|svg|webp)$": "<rootDir>/../ui/test/fileMock.js",
    "^~/(.*)$": "<rootDir>/../ui/src/$1",
    "^@assets/(.*)$": "<rootDir>/../ui/src/assets/$1"
  },
  transform: {
    "^.+\\.[jt]sx?$": [
      "babel-jest",
      {
        configFile: path.join(__dirname, "..", "ui", "babel.config.json")
      }
    ]
  },
  testMatch: ["<rootDir>/src/**/*.test.[jt]s?(x)"]
};
