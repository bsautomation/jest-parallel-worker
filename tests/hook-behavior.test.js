const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

describe('Hook Behavior Tests', () => {
  const testDir = path.join(__dirname, '..', 'test-temp');
  const hookTestFiles = [
    'hook-test-1.js',
    'hook-test-2.js', 
    'hook-test-3.js'
  ];

  beforeAll(() => {
    // Create temporary test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create test files with beforeAll hooks that write to files
    hookTestFiles.forEach((fileName, index) => {
      const fileNumber = index + 1;
      const testContent = `
const fs = require('fs');
const path = require('path');

let beforeAllCounter = 0;
let beforeEachCounter = 0;

describe('Hook Test File ${fileNumber}', () => {
  beforeAll(() => {
    beforeAllCounter++;
    const logFile = path.join(__dirname, 'hook-log-${fileNumber}.txt');
    const logEntry = \`beforeAll-\${fileNumber}-\${beforeAllCounter}-\${Date.now()}\\n\`;
    fs.appendFileSync(logFile, logEntry);
    console.log(\`[FILE${fileNumber}] beforeAll executed #\${beforeAllCounter}\`);
    return new Promise(resolve => setTimeout(resolve, 50));
  });

  beforeEach(() => {
    beforeEachCounter++;
    console.log(\`[FILE${fileNumber}] beforeEach executed #\${beforeEachCounter}\`);
  });

  afterAll(() => {
    const logFile = path.join(__dirname, 'hook-log-${fileNumber}.txt');
    const logEntry = \`afterAll-\${fileNumber}-\${Date.now()}\\n\`;
    fs.appendFileSync(logFile, logEntry);
    console.log(\`[FILE${fileNumber}] afterAll executed\`);
  });

  it('should verify beforeAll counter in file ${fileNumber} - test 1', () => {
    expect(beforeAllCounter).toBe(1);
    expect(beforeEachCounter).toBe(1);
  });

  it('should verify beforeAll counter in file ${fileNumber} - test 2', () => {
    expect(beforeAllCounter).toBe(1); // Should still be 1
    expect(beforeEachCounter).toBe(2);
  });

  it('should verify beforeAll counter in file ${fileNumber} - test 3', () => {
    expect(beforeAllCounter).toBe(1); // Should still be 1
    expect(beforeEachCounter).toBe(3);
  });

  it('should verify beforeAll counter in file ${fileNumber} - test 4', () => {
    expect(beforeAllCounter).toBe(1); // Should still be 1
    expect(beforeEachCounter).toBe(4);
  });
});
`;
      fs.writeFileSync(path.join(testDir, fileName), testContent);
    });
  });

  afterAll(() => {
    // Clean up temporary files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should run beforeAll hooks exactly once per file in jest-parallel mode', (done) => {
    const jestParallelPath = path.join(__dirname, '..', 'bin', 'jest-parallel.js');
    
    const child = spawn('node', [
      jestParallelPath,
      '--mode=jest-parallel',
      '--maxWorkers=3',
      '--testMatch=test-temp/**/*.js',
      '--verbose'
    ], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe'
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
      try {
        console.log('Jest Parallel Output:', stdout);
        if (stderr) console.log('Jest Parallel Stderr:', stderr);

        // Check that all tests passed
        expect(code).toBe(0);

        // Verify hook log files were created and contain correct entries
        hookTestFiles.forEach((fileName, index) => {
          const fileNumber = index + 1;
          const logFile = path.join(testDir, `hook-log-${fileNumber}.txt`);
          
          expect(fs.existsSync(logFile)).toBe(true);
          
          const logContent = fs.readFileSync(logFile, 'utf8');
          const lines = logContent.trim().split('\n').filter(line => line);
          
          // Should have exactly one beforeAll entry and one afterAll entry
          const beforeAllEntries = lines.filter(line => line.startsWith('beforeAll'));
          const afterAllEntries = lines.filter(line => line.startsWith('afterAll'));
          
          expect(beforeAllEntries.length).toBe(1);
          expect(afterAllEntries.length).toBe(1);
          
          // Verify the beforeAll entry format
          expect(beforeAllEntries[0]).toMatch(/^beforeAll-\d+-1-\d+$/);
        });

        done();
      } catch (error) {
        done(error);
      }
    });

    // Set a timeout for the test
    setTimeout(() => {
      child.kill();
      done(new Error('Test timeout'));
    }, 30000);
  }, 35000);

  it('should run beforeAll hooks exactly once per file in parallel-file mode', (done) => {
    const jestParallelPath = path.join(__dirname, '..', 'bin', 'jest-parallel.js');
    
    // Clean up any existing log files
    hookTestFiles.forEach((fileName, index) => {
      const fileNumber = index + 1;
      const logFile = path.join(testDir, `hook-log-${fileNumber}.txt`);
      if (fs.existsSync(logFile)) {
        fs.unlinkSync(logFile);
      }
    });

    const child = spawn('node', [
      jestParallelPath,
      '--mode=parallel-file',
      '--maxWorkers=3',
      '--testMatch=test-temp/**/*.js',
      '--verbose'
    ], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe'
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
      try {
        console.log('Parallel File Output:', stdout);
        if (stderr) console.log('Parallel File Stderr:', stderr);

        // Check that all tests passed
        expect(code).toBe(0);

        // Verify hook log files were created and contain correct entries
        hookTestFiles.forEach((fileName, index) => {
          const fileNumber = index + 1;
          const logFile = path.join(testDir, `hook-log-${fileNumber}.txt`);
          
          expect(fs.existsSync(logFile)).toBe(true);
          
          const logContent = fs.readFileSync(logFile, 'utf8');
          const lines = logContent.trim().split('\n').filter(line => line);
          
          // Should have exactly one beforeAll entry and one afterAll entry
          const beforeAllEntries = lines.filter(line => line.startsWith('beforeAll'));
          const afterAllEntries = lines.filter(line => line.startsWith('afterAll'));
          
          expect(beforeAllEntries.length).toBe(1);
          expect(afterAllEntries.length).toBe(1);
          
          // Verify the beforeAll entry shows counter = 1
          expect(beforeAllEntries[0]).toMatch(/^beforeAll-\d+-1-\d+$/);
        });

        done();
      } catch (error) {
        done(error);
      }
    });

    // Set a timeout for the test
    setTimeout(() => {
      child.kill();
      done(new Error('Test timeout'));
    }, 30000);
  }, 35000);

  it('should verify beforeAll behavior consistency across different modes', async () => {
    // This test verifies that beforeAll hooks behave consistently
    // regardless of the parallel execution mode
    
    const modes = ['jest-parallel', 'parallel-file'];
    const results = {};

    for (const mode of modes) {
      // Clean up log files before each mode test
      hookTestFiles.forEach((fileName, index) => {
        const fileNumber = index + 1;
        const logFile = path.join(testDir, `hook-log-${fileNumber}.txt`);
        if (fs.existsSync(logFile)) {
          fs.unlinkSync(logFile);
        }
      });

      const jestParallelPath = path.join(__dirname, '..', 'bin', 'jest-parallel.js');
      
      const result = await new Promise((resolve) => {
        const child = spawn('node', [
          jestParallelPath,
          `--mode=${mode}`,
          '--maxWorkers=2',
          '--testMatch=test-temp/**/*.js'
        ], {
          cwd: path.join(__dirname, '..'),
          stdio: 'pipe'
        });

        let stdout = '';
        child.stdout.on('data', (data) => stdout += data.toString());
        child.on('close', (code) => resolve({ code, stdout }));
      });

      results[mode] = result;

      // Verify each mode produces the same hook behavior
      hookTestFiles.forEach((fileName, index) => {
        const fileNumber = index + 1;
        const logFile = path.join(testDir, `hook-log-${fileNumber}.txt`);
        
        if (fs.existsSync(logFile)) {
          const logContent = fs.readFileSync(logFile, 'utf8');
          const lines = logContent.trim().split('\n').filter(line => line);
          
          const beforeAllEntries = lines.filter(line => line.startsWith('beforeAll'));
          expect(beforeAllEntries.length).toBe(1);
        }
      });
    }

    // All modes should have passed
    Object.values(results).forEach(result => {
      expect(result.code).toBe(0);
    });
  }, 60000);
});
