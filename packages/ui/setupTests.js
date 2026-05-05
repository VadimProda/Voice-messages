require("@testing-library/jest-dom");

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = jest.fn();
}

if (!URL.createObjectURL) {
  URL.createObjectURL = jest.fn(() => "blob:test-url");
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = jest.fn();
}
