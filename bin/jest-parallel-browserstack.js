#!/usr/bin/env node

/**
 * BrowserStack-aware CLI wrapper for Jest Parallel Worker
 * Usage: jest-parallel-browserstack [browserstack-options] [jest-parallel-options]
 */

const { Command } = require('commander');
const { BrowserStackIntegration } = require('../src/integrations/browserstack');

const program = new Command();

program
  .name('jest-parallel-browserstack')
  .description('Run Jest Parallel Worker tests with BrowserStack integration')
  .version(require('../package.json').version);

// BrowserStack + Jest Parallel Worker command
program
  .command('run')
  .description('Run tests with BrowserStack integration')
  .option('--testMatch <patterns...>', 'Test file patterns to match')
  .option('--mode <mode>', 'Execution mode (native-parallel, parallel-test, parallel-file, jest-parallel)', 'native-parallel')
  .option('--maxWorkers <number>', 'Maximum number of worker processes', parseInt)
  .option('--timeout <minutes>', 'Timeout in minutes', parseFloat)
  .option('--verbose', 'Verbose output', false)
  .option('--reporter <type>', 'Reporter type (console, html, both)', 'both')
  .option('--browserstackConfig <path>', 'Path to BrowserStack configuration file')
  .option('--buildName <name>', 'BrowserStack build name')
  .option('--projectName <name>', 'BrowserStack project name')
  .option('--local', 'Enable BrowserStack Local testing', false)
  .action(async (options) => {
    try {
      console.log('🚀 Starting Jest Parallel Worker with BrowserStack Integration...\n');
      
      // Separate BrowserStack options from Jest Parallel options
      const browserstackOptions = {
        buildName: options.buildName,
        projectName: options.projectName,
        local: options.local,
        configPath: options.browserstackConfig
      };
      
      const jestParallelOptions = {
        testMatch: options.testMatch,
        mode: options.mode,
        maxWorkers: options.maxWorkers,
        timeout: options.timeout,
        verbose: options.verbose,
        reporter: options.reporter
      };
      
      // Initialize BrowserStack integration
      const browserStackIntegration = new BrowserStackIntegration(browserstackOptions);
      
      // Run tests with BrowserStack
      const result = await browserStackIntegration.runWithBrowserStack(jestParallelOptions);
      
      process.exit(result.exitCode);
      
    } catch (error) {
      console.error('❌ BrowserStack + Jest Parallel Worker execution failed:', error.message);
      process.exit(1);
    }
  });

// Default to run command if no subcommand provided
program.action(async (options) => {
  const runCommand = program.commands.find(cmd => cmd.name() === 'run');
  if (runCommand) {
    await runCommand._actionHandler(options);
  }
});

program.parse();
