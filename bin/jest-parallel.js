#!/usr/bin/env node

const { program } = require('commander');
const { JestParallelRunner } = require('../src/index');
const { Logger } = require('../src/utils/logger');

// Check command for environment verification
program
  .command('check')
  .description('Check if the environment is ready for jest-parallel')
  .option('--test-file <file>', 'Test with a specific test file')
  .action(async (options) => {
    console.log('🔍 Jest Parallel Worker - Environment Check\n');
    
    try {
      const { spawn } = require('child_process');
      const fs = require('fs').promises;
      const path = require('path');
      
      // Basic environment check
      console.log(`📁 Working Directory: ${process.cwd()}`);
      console.log(`🟢 Node.js Version: ${process.version}`);
      
      // Check environment variables
      const commonEnvVars = ['NODE_ENV', 'PROFILE', 'ENV', 'ENVIRONMENT', 'CONFIG_ENV'];
      const presentVars = commonEnvVars.filter(envVar => process.env[envVar]);
      if (presentVars.length > 0) {
        console.log(`🌍 Environment Variables: ${presentVars.map(v => `${v}=${process.env[v]}`).join(', ')}`);
      } else {
        console.log(`⚠️  Environment Variables: None of the common ones found (${commonEnvVars.join(', ')})`);
        console.log('   Note: If your Jest config depends on these, set them before running jest-parallel');
      }
      
      // Check package.json
      try {
        const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
        console.log(`📦 Project: ${pkg.name}`);
        
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const jestDeps = Object.keys(deps).filter(dep => dep.includes('jest'));
        console.log(`🧪 Jest Dependencies: ${jestDeps.length > 0 ? jestDeps.join(', ') : 'None found'}`);
      } catch {
        console.log('❌ package.json not found');
      }
      
      // Check Jest
      try {
        const jestVersion = await new Promise((resolve, reject) => {
          const child = spawn('npx', ['jest', '--version'], { stdio: 'pipe' });
          let output = '';
          child.stdout.on('data', data => output += data.toString());
          child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error('Jest not found')));
          child.on('error', reject);
        });
        console.log(`✅ Jest Version: ${jestVersion}`);
      } catch {
        console.log('❌ Jest not available. Install with: npm install --save-dev jest');
        return;
      }
      
      // Test with compatibility file if no specific file provided
      const testFile = options.testFile || path.join(__dirname, '..', 'compatibility-test.js');
      
      if (options.testFile) {
        console.log(`\n🧪 Testing with your file: ${testFile}`);
      } else {
        console.log(`\n🧪 Testing with compatibility test file`);
      }
      
      // Run a quick jest-parallel test
      const runner = new JestParallelRunner({
        mode: 'jest-parallel',
        testMatch: [testFile],
        timeout: 10000,
        maxWorkers: 1,
        reporter: 'console',
        forceConcurrent: true,
        logger: new Logger(false, false)
      });
      
      const results = await runner.run();
      
      if (results.passed > 0) {
        console.log('✅ jest-parallel is working correctly!');
        console.log(`   Executed ${results.passed} tests successfully`);
      } else {
        console.log('❌ jest-parallel test failed');
        console.log('   Check your Jest configuration and test files');
      }
      
    } catch (error) {
      console.log(`❌ Environment check failed: ${error.message}`);
      console.log('\n💡 Try running the troubleshoot script: node troubleshoot.js');
    }
  });

program
  .name('jest-parallel')
  .description('Jest wrapper for parallel test execution at test level with true intra-file parallelism')
  .version('1.0.0')
  .argument('[testFiles...]', 'Specific test files to run')
  .option('-m, --mode <mode>', 'Execution mode: parallel-test, parallel-file, jest-parallel, native-parallel', 'parallel-test')
  .option('-t, --testMatch <pattern>', 'Test file pattern to match', 'tests/**/*.test.js')
  .option('--timeout <ms>', 'Test timeout in milliseconds', '30000')
  .option('--maxWorkers <number>', 'Maximum number of worker processes', '4')
  .option('--reporter <type>', 'Reporter type: console, html, both', 'both')
  .option('--outputDir <dir>', 'Output directory for reports', './reports')
  .option('--forceConcurrent', 'Transform regular test()/it() calls to test.concurrent() for true test-level parallelism', false)
  .option('--no-intra-file-parallelism', 'Disable intra-file parallelism for native-parallel mode (run tests within each file sequentially)')
  .option('--custom-runner', 'Use custom test runner for true intra-file parallelism (experimental)', false)
  .option('--runner-concurrency <number>', 'Max concurrency for custom runner', '4')
  .option('--verbose', 'Enable verbose logging', false)
  .option('--silent', 'Suppress all output except errors', false)
  .action(async (testFiles, options) => {
    const logger = new Logger(options.verbose, options.silent);
    
    try {
      // If specific test files are provided, use them instead of the pattern
      const testMatch = testFiles.length > 0 ? `${options.testMatch} ${testFiles}` : options.testMatch;
      
      // Debug the options to see what's being passed
      if (options.verbose) {
        console.log('CLI Options:', {
          intraFileParallelism: options.intraFileParallelism,
          customRunner: options.customRunner,
          runnerConcurrency: options.runnerConcurrency,
          mode: options.mode
        });
      }
      
      const runner = new JestParallelRunner({
        mode: options.mode,
        testMatch: testMatch,
        timeout: parseInt(options.timeout),
        maxWorkers: parseInt(options.maxWorkers),
        reporter: options.reporter,
        outputDir: options.outputDir,
        forceConcurrent: options.forceConcurrent,
        intraFileParallelism: options.intraFileParallelism, // Commander.js handles the --no- prefix correctly
        customRunner: options.customRunner,
        runnerConcurrency: parseInt(options.runnerConcurrency),
        logger
      });
      
      const results = await runner.run();
      
      if (results.failed > 0) {
        process.exit(1);
      }
    } catch (error) {
      logger.error('Failed to run tests:', error.message);
      process.exit(1);
    }
  });

program.parse();
