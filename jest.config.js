/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  // src/config.ts transitively imports the React tree (utils barrel →
  // offscreenPlanRenderer → Isoflow), so even pure-logic tests need a DOM.
  testEnvironment: "jsdom",
  modulePaths: ['node_modules', '<rootDir>'],
  // `dist/` holds built .d.ts copies of the test files — no tests inside.
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    // src/config.ts pulls in src/utils → React components, which import
    // stylesheets and inline SVG assets. Jest transforms neither; webpack
    // handles them via style-loader / asset-modules. Stub them out.
    '\\.(css|less|scss|sass)$': '<rootDir>/src/__mocks__/styleMock.js',
    '\\.(svg|png|jpg|jpeg|gif|webp)$': '<rootDir>/src/__mocks__/fileMock.js'
  }
};
