#!/usr/bin/env node

// Jest Parallel Worker Troubleshooting Tool
// This script helps diagnose issues when running jest-parallel in other repositories

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

async function checkEnvironment() {
  console.log('🔍 Jest Parallel Worker - Environment Diagnostic\n');
  
  // Check working directory
  console.log(`📁 Working Directory: ${process.cwd()}`);
  
  // Check if package.json exists
  try {
    const packageJson = await fs.readFile('package.json', 'utf8');
    const pkg = JSON.parse(packageJson);
    console.log(`📦 Project: ${pkg.name} (${pkg.version})`);
    
    // Check for Jest dependencies
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const jestDeps = Object.keys(allDeps).filter(dep => dep.includes('jest'));
    console.log(`🧪 Jest Dependencies: ${jestDeps.length > 0 ? jestDeps.join(', ') : 'None found'}`);
    
    // Check for Jest config
    if (pkg.jest) {
      console.log(`⚙️ Jest Config (package.json): Found`);
    } else {
      const jestConfigFiles = ['jest.config.js', 'jest.config.json', 'jest.config.ts'];
      let configFound = false;
      for (const configFile of jestConfigFiles) {
        try {
          await fs.access(configFile);
          console.log(`⚙️ Jest Config: ${configFile}`);
          configFound = true;
          break;
        } catch {}
      }
      if (!configFound) {
        console.log(`⚙️ Jest Config: Not found`);
      }
    }
  } catch (error) {
    console.log(`❌ package.json: Not found or invalid (${error.message})`);
  }
  
  // Check if npx jest works
  console.log('\n🧪 Testing Jest availability...');
  try {
    const result = await runCommand('npx', ['jest', '--version']);
    console.log(`✅ Jest Version: ${result.stdout.trim()}`);
  } catch (error) {
    console.log(`❌ Jest: Not available (${error.message})`);
    
    // Try global jest
    try {
      const result = await runCommand('jest', ['--version']);
      console.log(`✅ Global Jest Version: ${result.stdout.trim()}`);
    } catch {
      console.log(`❌ Global Jest: Not available`);
    }
  }
  
  // Check Node.js version
  console.log(`🟢 Node.js Version: ${process.version}`);
  
  // Check test files
  console.log('\n📄 Test Files:');
  try {
    const files = await findTestFiles();
    if (files.length > 0) {
      files.slice(0, 5).forEach(file => console.log(`  - ${file}`));
      if (files.length > 5) {
        console.log(`  ... and ${files.length - 5} more`);
      }
    } else {
      console.log('  No test files found');
    }
  } catch (error) {
    console.log(`  Error finding test files: ${error.message}`);
  }
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { 
      stdio: 'pipe',
      env: process.env // Inherit all environment variables including PROFILE
    });
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
    
    child.on('error', reject);
  });
}

async function findTestFiles() {
  const { glob } = require('glob');
  return glob('**/*.test.{js,ts,jsx,tsx}', { 
    ignore: ['node_modules/**', 'dist/**', 'build/**'] 
  });
}

async function testJestExecution(testFile) {
  if (!testFile) {
    console.log('\n❌ No test file provided for execution test');
    return;
  }
  
  console.log(`\n🧪 Testing Jest execution with: ${testFile}`);
  
  try {
    const result = await runCommand('npx', [
      'jest', 
      '--testMatch', `**/${path.basename(testFile)}`,
      '--verbose',
      '--no-coverage',
      '--passWithNoTests=false'
    ]);
    
    console.log('✅ Jest execution successful');
    console.log('📊 Output:');
    console.log(result.stderr.split('\n').slice(0, 10).map(line => `  ${line}`).join('\n'));
    
  } catch (error) {
    console.log('❌ Jest execution failed');
    console.log('📊 Error output:');
    console.log(error.message.split('\n').slice(0, 10).map(line => `  ${line}`).join('\n'));
  }
}

async function checkEnvironmentVariables() {
  console.log('\n🌍 Environment Variables Check...');
  
  // Common environment variables that Jest configs often depend on
  const commonEnvVars = ['NODE_ENV', 'PROFILE', 'ENV', 'ENVIRONMENT', 'CONFIG_ENV'];
  const presentVars = [];
  const missingVars = [];
  
  for (const envVar of commonEnvVars) {
    if (process.env[envVar]) {
      presentVars.push(`${envVar}=${process.env[envVar]}`);
    } else {
      missingVars.push(envVar);
    }
  }
  
  if (presentVars.length > 0) {
    console.log(`✅ Found environment variables: ${presentVars.join(', ')}`);
  }
  
  if (missingVars.length > 0) {
    console.log(`⚠️  Missing common environment variables: ${missingVars.join(', ')}`);
    console.log('   Note: If your Jest config depends on these, you may need to set them');
    console.log('   Example: PROFILE=prod npx jest-parallel ...');
  }
  
  // Check for Jest-specific environment variables
  const jestEnvVars = Object.keys(process.env).filter(key => key.startsWith('JEST_'));
  if (jestEnvVars.length > 0) {
    console.log(`🧪 Jest environment variables: ${jestEnvVars.join(', ')}`);
  }
}

async function main() {
  const workingDir = process.argv[2];
  const testFile = process.argv[3];
  
  // Change to the specified directory if provided
  if (workingDir && workingDir.startsWith('/')) {
    try {
      process.chdir(workingDir);
      console.log(`🔄 Changed working directory to: ${workingDir}\n`);
    } catch (error) {
      console.log(`❌ Failed to change directory to ${workingDir}: ${error.message}\n`);
      return;
    }
  }
  
  await checkEnvironment();
  await checkEnvironmentVariables();
  
  if (testFile) {
    await testJestExecution(testFile);
  } else {
    console.log('\n💡 Usage: node troubleshoot.js [working-directory] [test-file-path]');
    console.log('   Example: node troubleshoot.js /path/to/your/repo your-test.js');
    console.log('   This will also test Jest execution with the provided test file');
  }
  
  console.log('\n📋 Common Issues and Solutions:');
  console.log('1. Jest not found: Install jest as a dependency (npm install --save-dev jest)');
  console.log('2. No tests found: Check test file patterns and Jest configuration');
  console.log('3. Module resolution: Ensure all dependencies are installed');
  console.log('4. Configuration: Check jest.config.js or package.json jest settings');
  console.log('5. Environment variables: Set required variables (e.g., PROFILE=prod)');
  console.log('6. Working directory: Run jest-parallel from the project root');
}

// Handle the case where glob is not available
async function installGlobIfNeeded() {
  try {
    require('glob');
  } catch (error) {
    console.log('Installing glob dependency for diagnostics...');
    await runCommand('npm', ['install', 'glob']);
  }
}

if (require.main === module) {
  installGlobIfNeeded()
    .then(() => main())
    .catch(error => {
      console.error('❌ Diagnostic failed:', error.message);
      process.exit(1);
    });
}

module.exports = { checkEnvironment, testJestExecution };
