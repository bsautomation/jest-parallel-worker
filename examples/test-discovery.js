#!/usr/bin/env node

// Quick test script to verify test discovery is working
const { TestDiscovery } = require('../src/discovery');
const path = require('path');

async function testDiscovery() {
  console.log('🔍 Testing AST-based test discovery...\n');

  const testFiles = [
    path.join(__dirname, 'simple.test.js'),
    path.join(__dirname, 'special-cases.test.js'),
    path.join(__dirname, 'comprehensive.test.js')
  ];

  for (const file of testFiles) {
    console.log(`📁 Processing: ${path.basename(file)}`);
    
    try {
      const tests = await TestDiscovery.extractTestsFromFile(file);
      console.log(`  ✅ Found ${tests.length} tests`);
      
      // Show first few tests
      tests.slice(0, 3).forEach(test => {
        const flags = [];
        if (test.skip) flags.push('SKIP');
        if (test.only) flags.push('ONLY');
        const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
        
        console.log(`    • ${test.fullName}${flagStr}`);
      });
      
      if (tests.length > 3) {
        console.log(`    ... and ${tests.length - 3} more`);
      }
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      
      // Try fallback
      try {
        console.log('  🔄 Trying regex fallback...');
        const tests = await TestDiscovery.extractTestsWithRegex(file);
        console.log(`  ✅ Fallback found ${tests.length} tests`);
      } catch (fallbackError) {
        console.log(`  ❌ Fallback failed: ${fallbackError.message}`);
      }
    }
    
    console.log('');
  }

  // Test the main discovery function
  console.log('🧪 Testing main discovery function...');
  try {
    const allTests = await TestDiscovery.discoverTests(testFiles);
    console.log(`✅ Total tests discovered: ${allTests.length}`);
    
    const skipped = allTests.filter(t => t.skip).length;
    const focused = allTests.filter(t => t.only).length;
    const normal = allTests.length - skipped - focused;
    
    console.log(`  • Normal tests: ${normal}`);
    console.log(`  • Skipped tests: ${skipped}`);
    console.log(`  • Focused tests: ${focused}`);
    
  } catch (error) {
    console.error(`❌ Discovery failed: ${error.message}`);
  }
}

testDiscovery().catch(console.error);