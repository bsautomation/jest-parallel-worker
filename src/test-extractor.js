const fs = require('fs').promises;
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

/**
 * Extracts all test names (it/test blocks) from a Jest test file
 * @param {string} filePath Path to the test file
 * @param {Object} options Options for extraction
 * @param {string} [options.testNamePattern] Optional regex or tag pattern to filter tests
 * @returns {Promise<string[]>} Array of test names
 */
async function extractTestsFromFile(filePath, options = {}) {
  try {
    // Define Jest test function names
    const testFunctionNames = ['it', 'test'];
    
    // Read file content
    const fileContent = await fs.readFile(filePath, 'utf-8');
    
    // Parse the file with Babel
    const ast = parser.parse(fileContent, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
      errorRecovery: true,
    });
    
    const allTestCases = [];
    
    // Track current describe blocks to build full test names
    const describeBlocks = [];
    
    // Traverse the AST to find it/test function calls and describe blocks
    traverse(ast, {
      // Track entering describe blocks
      CallExpression(path) {
        const callee = path.node.callee;
        const args = path.node.arguments;
        
        // Handle describe blocks to track nesting
        if (
          (callee.type === 'Identifier' && callee.name === 'describe') ||
          (callee.type === 'MemberExpression' && 
           callee.object.name === 'describe' &&
           (callee.property.name === 'only' || callee.property.name === 'skip'))
        ) {
          if (args.length > 0 && args[0].type === 'StringLiteral') {
            describeBlocks.push(args[0].value);
            
            // Process it/test calls inside this describe
            const testCalls = [];
            path.traverse({
              CallExpression(testPath) {
                const testCallee = testPath.node.callee;
                const testArgs = testPath.node.arguments;
                
                if (
                  (testCallee.type === 'Identifier' && (testCallee.name === 'it' || testCallee.name === 'test')) ||
                  (testCallee.type === 'MemberExpression' && 
                   (testCallee.object.name === 'it' || testCallee.object.name === 'test') &&
                   (testCallee.property.name === 'only' || testCallee.property.name === 'skip'))
                ) {
                  if (testArgs.length > 0 && testArgs[0].type === 'StringLiteral') {
                    const fullTestName = [...describeBlocks, testArgs[0].value].join(' ');
                    testCalls.push(fullTestName);
                  }
                }
              }
            });
            
            allTestCases.push(...testCalls);
            describeBlocks.pop();
            
            // Skip processing children since we've already handled them
            path.skip();
          }
        } 
        // Handle top-level it/test calls (not inside a describe)
        else if (
          (callee.type === 'Identifier' && (callee.name === 'it' || callee.name === 'test')) ||
          (callee.type === 'MemberExpression' && 
           (callee.object.name === 'it' || callee.object.name === 'test') &&
           (callee.property.name === 'only' || callee.property.name === 'skip'))
        ) {
          if (args.length > 0 && args[0].type === 'StringLiteral') {
            allTestCases.push(args[0].value);
          }
        }
      }
    });
    
    // If testNamePattern is provided, filter test cases
    if (options.testNamePattern) {
      const pattern = options.testNamePattern;
      console.log(`Filtering tests by pattern: ${pattern}`);
      
      // If it's a tag pattern like @p0, look for it in the test names
      if (pattern.startsWith('@')) {
        console.log(`Looking for tag: ${pattern}`);
        return allTestCases.filter(testName => testName.includes(pattern));
      } else {
        // Otherwise use it as a regular expression
        const regex = new RegExp(pattern);
        return allTestCases.filter(testName => regex.test(testName));
      }
    }
    
    return allTestCases;
  } catch (error) {
    throw new Error(`Failed to extract tests from ${filePath}: ${error.message}`);
  }
}

module.exports = {
  extractTestsFromFile
};