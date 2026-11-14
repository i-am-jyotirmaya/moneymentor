module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/.maestro/", "/e2e-artifacts/"],
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
};
