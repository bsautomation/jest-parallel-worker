#!/usr/bin/env node

// Quick demo script to verify the package is working
const { spawn } = require('child_process');
const path = require('path');

async function runDemo() {
  console.log('🎬 Jest Parallel Worker - Quick Demo');
  console.log('====================================\n');

  // Check if the basic files exist
  const fs = require('fs');
  const requiredFiles = [
    'src/index.js',
    'src/cli.js', 
    'src/worker.js',
    'src/discovery.js'
  ];

  console.log('📁 Checking required files...');
  for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
      console.log(`  ✅ ${file}`);
    } else {
      console.log(`  ❌ ${file} - MISSING!`);
      return;
    }
  }

  console.log('\n📊 Running a quick test with 2 workers...\n');

  return new Promise((resolve, reject) => {
    const child = spawn('node', [
      'src/cli.js',
      '--workers', '2',
      '--testMatch', '**/examples/simple.test.js',
      '--verbose'
    ], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    child.on('close', (code) => {
      console.log(`\n🎯 Demo completed with exit code: ${code}`);
      
      if (code === 0) {
        console.log('✅ Success! The Jest Parallel Worker is working correctly.');
        console.log('\n🚀 Enhanced Features Demonstrated:');
        console.log('  ✓ PID isolation across worker processes');
        console.log('  ✓ Memory consumption tracking');
        console.log('  ✓ Performance metrics and parallel speedup');
        console.log('  ✓ Comprehensive test results analysis');
        console.log('\n🧪 Next steps:');
        console.log('  1. Run: npm run test:examples (comprehensive analysis)');
        console.log('  2. Run: npm run test:memory (memory tracking demo)');
        console.log('  3. Run: npm run test:pid (PID isolation demo)');
        console.log('  4. Try: npx jest-parallel --help');
        console.log('  5. Test: npx jest-parallel --workers 4 --verbose');
      } else {
        console.log('❌ Demo failed. Check the error messages above.');
      }
      
      resolve(code);
    });

    child.on('error', (error) => {
      console.error('💥 Error running demo:', error);
      reject(error);
    });
  });
}

// Run the demo
runDemo().catch(console.error);