// Test the transformation logic directly
const fs = require('fs');
const path = require('path');

function transformTestsToConcurrent(content) {
  // Transform regular test() and it() calls to test.concurrent() and it.concurrent()
  // This regex handles various whitespace and formatting scenarios
  
  let transformed = content;
  
  // Transform test() calls
  transformed = transformed.replace(
    /(\s*)(test|it)\s*\(\s*(['"`][^'"`]*['"`]\s*,\s*)/g,
    '$1$2.concurrent($3'
  );
  
  // Handle cases where test() is already concurrent (avoid double transformation)
  transformed = transformed.replace(
    /(test|it)\.concurrent\.concurrent\(/g,
    '$1.concurrent('
  );
  
  // Add a comment to indicate transformation
  const header = `// This file has been automatically transformed by jest-parallel-worker for intra-file parallelism\n// All test() and it() calls have been converted to test.concurrent() and it.concurrent()\n\n`;
  
  return header + transformed;
}

// Test the transformation
const testFile = path.join(__dirname, 'examples', 'hooks-validation.test.js');
const originalContent = fs.readFileSync(testFile, 'utf8');
const transformedContent = transformTestsToConcurrent(originalContent);

console.log('=== ORIGINAL ===');
console.log(originalContent);
console.log('\n=== TRANSFORMED ===');
console.log(transformedContent);

// Test Jest with the transformed content
const tempFile = path.join(__dirname, 'tests', `test-transform-${Date.now()}.test.js`);

fs.writeFileSync(tempFile, transformedContent);

console.log(`\n=== TEMP FILE WRITTEN TO: ${tempFile} ===`);

// Run Jest on the temp file to check if it works
const { spawn } = require('child_process');

console.log('\n=== RUNNING JEST ON TRANSFORMED FILE ===');

const jestArgs = [
  tempFile,
  '--verbose',
  '--maxConcurrency', '4'
];

const worker = spawn('npx', ['jest', ...jestArgs], {
  stdio: 'inherit',
  cwd: process.cwd()
});

worker.on('close', (code) => {
  console.log(`\n=== JEST FINISHED WITH CODE: ${code} ===`);
  
  // Clean up
  try {
    fs.unlinkSync(tempFile);
    console.log('Temp file cleaned up');
  } catch (err) {
    console.error('Failed to clean up temp file:', err.message);
  }
});
