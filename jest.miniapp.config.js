module.exports = {
  testMatch: [
    '<rootDir>/pages/**/__tests__/**/*.test.js',
    '<rootDir>/utils/**/__tests__/**/*.test.js'
  ],
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/server/']
}
