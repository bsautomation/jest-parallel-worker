const { spawn } = require('child_process');
const path = require('path');

describe('Hook Behavior Validation', () => {
  const jestParallelPath = path.join(__dirname, '..', 'bin', 'jest-parallel.js');

  it('should verify jest-parallel mode enables concurrent test execution', (done) => {
    const child = spawn('node', [
      jestParallelPath,
      '--mode=jest-parallel',
      '--maxWorkers=4',
      '--testMatch=examples/concurrent-timing.test.js',
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
        console.log('Jest Parallel Concurrent Test Output:', stdout);
        if (stderr) console.log('Jest Parallel Concurrent Test Stderr:', stderr);

        // Check that all tests passed
        expect(code).toBe(0);

        // Should show 5 total tests passed
        expect(stdout).toContain('Total Tests: 5');
        expect(stdout).toContain('Passed: 5');
        expect(stdout).toContain('Failed: 0');
        
        // Should show Jest with internal parallelism
        expect(stdout).toContain('Starting Jest with internal parallelism');
        
        // Total execution time should be reasonable (less than 4 seconds for concurrent execution)
        // Note: We use a relaxed threshold because of Jest startup overhead
        const durationMatch = stdout.match(/Total Duration: ([\d.]+)s/);
        if (durationMatch) {
          const duration = parseFloat(durationMatch[1]);
          expect(duration).toBeLessThan(4); // Should be much faster than 5+ seconds sequential
        }

        done();
      } catch (error) {
        done(error);
      }
    });

    // Set a timeout
    setTimeout(() => {
      child.kill();
      done(new Error('Test timeout'));
    }, 15000);
  }, 20000);

  it('should verify beforeAll runs once per file in jest-parallel mode', (done) => {
    const child = spawn('node', [
      jestParallelPath,
      '--mode=jest-parallel',
      '--maxWorkers=2',
      '--testMatch=examples/hooks*.test.js',
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

        // Verify the output contains expected hook behavior logs
        expect(stdout).toContain('beforeAll executed #1');
        expect(stdout).toContain('[FILE2] beforeAll executed #1');
        
        // Verify no duplicate beforeAll executions
        const beforeAllMatches = stdout.match(/beforeAll executed #1/g) || [];
        expect(beforeAllMatches.length).toBeGreaterThanOrEqual(2); // One per file
        
        // Should not see beforeAll executed #2 (indicating it ran more than once per file)
        expect(stdout).not.toContain('beforeAll executed #2');
        expect(stdout).not.toContain('[FILE2] beforeAll executed #2');

        done();
      } catch (error) {
        done(error);
      }
    });

    // Set a timeout
    setTimeout(() => {
      child.kill();
      done(new Error('Test timeout'));
    }, 30000);
  }, 35000);

  it('should verify beforeAll runs once per file in parallel-file mode', (done) => {
    const child = spawn('node', [
      jestParallelPath,
      '--mode=parallel-file',
      '--maxWorkers=2',
      '--testMatch=examples/hooks*.test.js',
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

        // Verify the output contains expected hook behavior logs
        expect(stdout).toContain('beforeAll executed #1');
        expect(stdout).toContain('[FILE2] beforeAll executed #1');
        
        // Should not see beforeAll executed #2 (indicating it ran more than once per file)
        expect(stdout).not.toContain('beforeAll executed #2');
        expect(stdout).not.toContain('[FILE2] beforeAll executed #2');

        done();
      } catch (error) {
        done(error);
      }
    });

    // Set a timeout
    setTimeout(() => {
      child.kill();
      done(new Error('Test timeout'));
    }, 30000);
  }, 35000);

  it('should verify beforeAll runs once per file in parallel-test mode', (done) => {
    const child = spawn('node', [
      jestParallelPath,
      '--mode=parallel-test',
      '--maxWorkers=2',
      '--testMatch=examples/hooks*.test.js',
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
        console.log('Parallel Test Output:', stdout);
        if (stderr) console.log('Parallel Test Stderr:', stderr);

        // Check that all tests passed
        expect(code).toBe(0);

        // Verify the output contains expected hook behavior logs
        expect(stdout).toContain('beforeAll executed #1');
        expect(stdout).toContain('[FILE2] beforeAll executed #1');
        
        // Should not see beforeAll executed #2 (indicating it ran more than once per file)
        expect(stdout).not.toContain('beforeAll executed #2');
        expect(stdout).not.toContain('[FILE2] beforeAll executed #2');

        done();
      } catch (error) {
        done(error);
      }
    });

    // Set a timeout
    setTimeout(() => {
      child.kill();
      done(new Error('Test timeout'));
    }, 30000);
  }, 35000);

  it('should verify consistent hook behavior across all modes', async () => {
    const modes = ['parallel-test', 'parallel-file', 'jest-parallel'];
    const results = {};

    for (const mode of modes) {
      const result = await new Promise((resolve) => {
        const child = spawn('node', [
          jestParallelPath,
          `--mode=${mode}`,
          '--maxWorkers=2',
          '--testMatch=examples/hooks*.test.js'
        ], {
          cwd: path.join(__dirname, '..'),
          stdio: 'pipe'
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => stdout += data.toString());
        child.stderr.on('data', (data) => stderr += data.toString());

        child.on('close', (code) => {
          resolve({ code, stdout, stderr, mode });
        });

        // Timeout for individual test
        setTimeout(() => {
          child.kill();
          resolve({ code: -1, stdout, stderr, mode });
        }, 25000);
      });

      results[mode] = result;

      // Each mode should pass
      expect(result.code).toBe(0);

      // Each mode should show consistent hook behavior
      expect(result.stdout).toContain('beforeAll executed #1');
      expect(result.stdout).not.toContain('beforeAll executed #2');
    }

    // All modes should have passed
    console.log('All modes tested successfully:', Object.keys(results));
  }, 90000);
});
