const { TestParser } = require('../src/core/parser');
const { Logger } = require('../src/utils/logger');
const path = require('path');
const fs = require('fs').promises;

describe('TestParser', () => {
  let parser;
  let logger;
  let tempTestFile;

  beforeAll(async () => {
    logger = new Logger(false, true); // silent mode for tests
    parser = new TestParser(logger);
    
    // Create a temporary test file
    tempTestFile = path.join(__dirname, 'temp-test.js');
    const testContent = `
describe('Test Suite', () => {
  beforeAll(() => {});
  afterAll(() => {});
  
  it('should test something', () => {
    expect(true).toBe(true);
  });
  
  it('should test another thing', () => {
    expect(false).toBe(false);
  });
});

it('standalone test', () => {
  expect(1).toBe(1);
});
`;
    await fs.writeFile(tempTestFile, testContent);
  });

  afterAll(async () => {
    // Clean up temp file
    try {
      await fs.unlink(tempTestFile);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should find test files with glob pattern', async () => {
    const files = await parser.findTestFiles('examples/**/*.test.js');
    expect(files.length).toBeGreaterThan(0);
    expect(files.some(file => file.includes('math.test.js'))).toBe(true);
  });

  it('should parse test file and extract tests', async () => {
    const parsed = await parser.parseTestFile(tempTestFile);
    
    expect(parsed.filePath).toBe(tempTestFile);
    expect(parsed.fileName).toBe('temp-test.js');
    expect(parsed.tests).toHaveLength(3);
    expect(parsed.hasBeforeAll).toBe(true);
    expect(parsed.hasAfterAll).toBe(true);
    
    const testNames = parsed.tests.map(t => t.name);
    expect(testNames).toContain('should test something');
    expect(testNames).toContain('should test another thing');
    expect(testNames).toContain('standalone test');
  });

  it('should parse multiple test files', async () => {
    const testFiles = await parser.findTestFiles('examples/**/*.test.js');
    const parsedFiles = await parser.parseAllTestFiles(testFiles);
    
    expect(parsedFiles.length).toBe(testFiles.length);
    expect(parsedFiles.every(file => file.tests.length > 0)).toBe(true);
  });

  it('should handle parsing errors gracefully', async () => {
    const nonExistentFile = '/path/to/nonexistent/file.js';
    
    await expect(parser.parseTestFile(nonExistentFile)).rejects.toThrow();
  });
});
