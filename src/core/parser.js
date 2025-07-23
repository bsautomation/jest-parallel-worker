const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');

class TestParser {
  constructor(logger) {
    this.logger = logger;
  }

  async findTestFiles(testMatch) {
    this.logger.debug(`Finding test files with pattern: ${testMatch}`);
    
    try {
      let files;
      
      // Handle array of specific files
      if (Array.isArray(testMatch)) {
        files = testMatch.map(file => path.resolve(file));
        // Filter out files that don't exist
        const existingFiles = [];
        for (const file of files) {
          try {
            await fs.access(file);
            existingFiles.push(file);
          } catch (error) {
            this.logger.warn(`Test file not found: ${file}`);
          }
        }
        files = existingFiles;
      } else {
        // Handle glob pattern
        files = await glob(testMatch, { 
          ignore: ['**/node_modules/**'],
          absolute: true 
        });
      }
      
      this.logger.info(`Found ${files.length} test files`);
      return files;
    } catch (error) {
      this.logger.error('Error finding test files:', error.message);
      throw error;
    }
  }

  async parseTestFile(filePath) {
    this.logger.debug(`Parsing test file: ${filePath}`);
    
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const tests = this._extractTests(content, filePath);
      
      this.logger.debug(`Found ${tests.length} tests in ${path.basename(filePath)}`);
      return {
        filePath,
        fileName: path.basename(filePath),
        tests,
        hasBeforeAll: this._hasHook(content, 'beforeAll'),
        hasAfterAll: this._hasHook(content, 'afterAll'),
        hasBeforeEach: this._hasHook(content, 'beforeEach'),
        hasAfterEach: this._hasHook(content, 'afterEach')
      };
    } catch (error) {
      this.logger.error(`Error parsing test file ${filePath}:`, error.message);
      throw error;
    }
  }

  _extractTests(content, filePath) {
    const tests = [];
    const lines = content.split('\n');
    
    // Enhanced regex to find test cases and identify skipped tests
    const testRegex = /(?:it|test)(?:\.skip|\.concurrent|\.only)?\s*\(\s*['"`]([^'"`]+)['"`]/g;
    const describeRegex = /describe(?:\.skip|\.only)?\s*\(\s*['"`]([^'"`]+)['"`]/g;
    
    let match;
    let currentDescribe = null;
    let lineNumber = 0;
    
    // Also track commented out tests
    const commentedTestRegex = /^\s*\/\/.*(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    
    for (const line of lines) {
      lineNumber++;
      
      // Check for describe blocks (including skipped ones)
      describeRegex.lastIndex = 0; // Reset regex
      const describeMatch = describeRegex.exec(line);
      if (describeMatch) {
        currentDescribe = describeMatch[1];
        continue;
      }
      
      // Check for test cases (including variations)
      testRegex.lastIndex = 0; // Reset regex
      const testMatch = testRegex.exec(line);
      if (testMatch) {
        const isSkipped = line.includes('.skip') || line.includes('it.skip') || line.includes('test.skip');
        const isOnly = line.includes('.only');
        const isConcurrent = line.includes('.concurrent');
        
        tests.push({
          name: testMatch[1],
          describe: currentDescribe,
          fullName: currentDescribe ? `${currentDescribe} ${testMatch[1]}` : testMatch[1],
          filePath,
          lineNumber,
          isSkipped,
          isOnly,
          isConcurrent,
          type: isSkipped ? 'skip' : (isOnly ? 'only' : (isConcurrent ? 'concurrent' : 'normal')),
          id: `${filePath}:${lineNumber}:${testMatch[1]}`
        });
        continue;
      }
      
      // Check for commented out tests (won't execute but might be counted)
      commentedTestRegex.lastIndex = 0; // Reset regex
      const commentedMatch = commentedTestRegex.exec(line);
      if (commentedMatch) {
        this.logger.debug(`Found commented test at line ${lineNumber}: ${commentedMatch[1]}`);
        // Don't add commented tests to the count since they won't execute
      }
    }
    
    // Log the distribution of test types for debugging
    const normalTests = tests.filter(t => t.type === 'normal').length;
    const skippedTests = tests.filter(t => t.type === 'skip').length;
    const onlyTests = tests.filter(t => t.type === 'only').length;
    const concurrentTests = tests.filter(t => t.type === 'concurrent').length;
    
    this.logger.debug(`Test breakdown for ${path.basename(filePath)}: ${normalTests} normal, ${skippedTests} skipped, ${onlyTests} only, ${concurrentTests} concurrent`);
    
    return tests;
  }

  _hasHook(content, hookName) {
    const regex = new RegExp(`\\b${hookName}\\s*\\(`, 'g');
    return regex.test(content);
  }

  async parseAllTestFiles(testFiles) {
    this.logger.info(`Parsing ${testFiles.length} test files...`);
    
    const parsedFiles = [];
    for (let i = 0; i < testFiles.length; i++) {
      const file = testFiles[i];
      try {
        const parsed = await this.parseTestFile(file);
        parsedFiles.push(parsed);
        this.logger.progress(i + 1, testFiles.length, `Parsed ${path.basename(file)}`);
      } catch (error) {
        this.logger.warn(`Failed to parse ${file}:`, error.message);
      }
    }
    
    const totalTests = parsedFiles.reduce((sum, file) => sum + file.tests.length, 0);
    this.logger.success(`Parsed ${parsedFiles.length} files with ${totalTests} total tests`);
    
    return parsedFiles;
  }
}

module.exports = { TestParser };
