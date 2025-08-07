#!/usr/bin/env node

const { Command } = require('commander');
const { JestParallelSDK } = require('../src/index');
const { ConfigLoader } = require('../src/config');
const chalk = require('chalk');

const program = new Command();

program
  .name('jest-parallel')
  .description('Run Jest tests in parallel at test level')
  .version(require('../package.json').version);

// Environment check command
program
  .command('check')
  .description('Check if the environment is ready for jest-parallel')
  .action(async (options) => {
    console.log(chalk.blue('🔍 Jest Parallel Worker - Environment Check\n'));
    
    try {
      const fs = require('fs').promises;
      
      // Basic environment check
      console.log(`📁 Working Directory: ${process.cwd()}`);
      console.log(`🟢 Node.js Version: ${process.version}`);
      
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
      
      // Test SDK loading
      console.log('\n🔧 Testing SDK...');
      const sdk = new JestParallelSDK();
      console.log(`✅ SDK loaded successfully`);
      console.log(`📋 Available modes: ${JestParallelSDK.getModes().join(', ')}`);
      
      console.log(chalk.green('\n✅ Environment check completed successfully!'));
      
    } catch (error) {
      console.error(chalk.red('❌ Environment check failed:'), error.message);
      process.exit(1);
    }
  });

// Main run command
program
  .command('run')
  .description('Run tests in parallel')
  .option('--testMatch <patterns...>', 'Test file patterns to match', ['tests/**/*.test.js'])
  .option('--mode <mode>', 'Execution mode', 'native-parallel')
  .option('--maxWorkers <number>', 'Maximum number of worker processes', parseInt)
  .option('--timeout <milliseconds>', 'Timeout in milliseconds', parseInt)
  .option('--forceConcurrent', 'Force concurrent execution', false)
  .option('--verbose', 'Verbose output', false)
  .option('--outputDir <dir>', 'Output directory for reports', 'reports')
  .option('--reporter <type>', 'Reporter type (console, html, both)', 'both')
  .option('--config <path>', 'Path to configuration file')
  .action(async (options) => {
    try {
      // Load configuration from file
      const fileConfig = ConfigLoader.loadConfig(options.config);
      
      // Merge configurations (CLI options override file config)
      const finalConfig = ConfigLoader.mergeConfigs(options, fileConfig);
      
      // Validate configuration
      const errors = ConfigLoader.validateConfig(finalConfig);
      if (errors.length > 0) {
        console.error(chalk.red('❌ Configuration errors:'));
        errors.forEach(error => console.error(chalk.red(`  - ${error}`)));
        process.exit(1);
      }

      console.log(chalk.blue('🚀 Starting Jest Parallel Execution...\n'));
      
      if (finalConfig.verbose) {
        console.log(chalk.gray('Configuration:'));
        console.log(chalk.gray(JSON.stringify(finalConfig, null, 2)));
        console.log();
      }
      
      const sdk = new JestParallelSDK(finalConfig);
      const results = await sdk.run();
      
      const { summary } = results;
      const passed = summary.passed || 0;
      const failed = summary.failed || 0;
      const skipped = summary.skipped || 0;
      const total = summary.totalTests || 0;
      
      console.log(chalk.green(`\n✅ Tests completed: ${passed}/${total} passed`));
      if (failed > 0) console.log(chalk.red(`❌ Failed: ${failed}`));
      if (skipped > 0) console.log(chalk.yellow(`⏭️ Skipped: ${skipped}`));
      
      if (summary.timeSaved) {
        console.log(chalk.blue(`⚡ Time saved: ${summary.timeSaved}ms (${summary.timeSavedPercentage?.toFixed(1)}%)`));
      }
      
      // Exit with appropriate code
      process.exit(failed > 0 ? 1 : 0);
      
    } catch (error) {
      console.error(chalk.red('❌ Jest Parallel execution failed:'), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Handle backward compatibility - if no subcommand provided, treat as 'run'
program.action(async (options) => {
  const runCommand = program.commands.find(cmd => cmd.name() === 'run');
  if (runCommand) {
    await runCommand._actionHandler(options);
  }
});

// Parse command line arguments
program.parse();
