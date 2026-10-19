module.exports = {
  preset: 'jest-expo', testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: ['node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@react-navigation/.*|react-native-.*|@spndrr/.*))'],
  moduleNameMapper: { '^@spndrr/finance-core$': '<rootDir>/../../packages/finance-core/src/index.ts' },
};
