const path = require("path");

module.exports = {
  rootDir: ".",
  testEnvironment: "jsdom",
  moduleFileExtensions: ["js", "jsx", "json"],
  setupFilesAfterEnv: ["<rootDir>/setupTests.js"],
  moduleNameMapper: {
    "^!style-loader!css-loader!.*$": "identity-obj-proxy",
    "\\.(css|scss|sass)$": "identity-obj-proxy",
    "\\.(gif|jpe?g|png|svg|webp)$": "<rootDir>/test/fileMock.js",
    "^~/(.*)$": "<rootDir>/src/$1",
    "^@assets/(.*)$": "<rootDir>/src/assets/$1"
  },
  transform: {
    "^.+\\.[jt]sx?$": [
      "babel-jest",
      {
        configFile: path.join(__dirname, "babel.config.json")
      }
    ]
  },
  testMatch: ["<rootDir>/src/**/*.test.[jt]s?(x)"]
};
