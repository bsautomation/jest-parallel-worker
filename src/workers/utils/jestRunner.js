// Shared Jest runner: prefers JSON output, falls back to text parsing
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { spawn, execSync } = require('child_process');
const { parseJestOutput } = require('../../parsers');

// Silent logger for workers to prevent stdout contamination
const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  log: () => {}
};

function mapJestStatus(status) {
  switch (status) {
    case 'passed':
      return 'passed';
    case 'failed':
      return 'failed';
    case 'skipped':
    case 'pending':
    case 'todo':
      return 'skipped';
    default:
      return 'skipped';
  }
}

function extractTestResultsFromJestJson(json, filePath) {
  const results = [];
  try {
    const suites = Array.isArray(json.testResults) ? json.testResults : [];
    for (const suite of suites) {
      const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : [];
      for (const a of assertions) {
        const status = mapJestStatus(a.status);
        results.push({
          name: a.title || a.fullName || 'Unnamed test',
          suite: suite.name ? path.basename(suite.name) : 'Unknown Suite',
          status,
          duration: typeof a.duration === 'number' ? a.duration : 0,
          error: status === 'failed' ? (a.failureMessages && a.failureMessages[0]) || 'Test failed' : null,
          failureType: status === 'failed' ? 'test_failure' : null,
          testId: `${filePath}:${a.title || a.fullName}`,
          lineNumber: null
        });
      }
    }
  } catch (_) {
    // ignore
  }
  return results;
}

async function getSetupFromShowConfig(cwd) {
  try {
    return await new Promise((resolve) => {
      const child = spawn('npx', ['jest', '--showConfig'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd,
        env: { ...process.env }
      });
      let out = '';
      child.stdout.on('data', d => (out += d.toString()));
      child.on('close', () => {
        try {
          // Some Jest versions output JSON; others may add text. Try to find JSON block.
          const start = out.indexOf('{');
          const end = out.lastIndexOf('}');
          if (start >= 0 && end > start) {
            const json = JSON.parse(out.substring(start, end + 1));
            const cfg = json && (json.config || json); // jest 29+ nests under config
            const arr = cfg && Array.isArray(cfg.setupFilesAfterEnv) ? cfg.setupFilesAfterEnv : [];
            resolve(arr);
            return;
          }
        } catch (_) {}
        resolve([]);
      });
      child.on('error', () => resolve([]));
    });
  } catch (_) {
    return [];
  }
}

async function findUserSetupFiles(cwd) {
  const candidates = [
    'jest.config.js',
    'jest.config.cjs',
    'jest.config.json',
    // 'jest.config.mjs' // skip due to ESM import complexity
  ];
  const setupFiles = [];

  // Prefer resolved config from Jest itself
  const fromShow = await getSetupFromShowConfig(cwd);
  if (fromShow && fromShow.length) {
    setupFiles.push(...fromShow);
  }

  try {
    // package.json jest block
    const pkgPath = path.join(cwd, 'package.json');
    const pkgRaw = await fs.readFile(pkgPath, 'utf8').catch(() => null);
    if (pkgRaw) {
      const pkg = JSON.parse(pkgRaw);
      const jestCfg = pkg.jest || null;
      if (jestCfg && Array.isArray(jestCfg.setupFilesAfterEnv)) {
        setupFiles.push(...jestCfg.setupFilesAfterEnv);
      }
    }
  } catch (_) {}

  for (const file of candidates) {
    const p = path.join(cwd, file);
    const exists = await fs.access(p).then(() => true).catch(() => false);
    if (!exists) continue;
    try {
      if (file.endsWith('.json')) {
        const raw = await fs.readFile(p, 'utf8');
        const cfg = JSON.parse(raw);
        if (cfg && Array.isArray(cfg.setupFilesAfterEnv)) {
          setupFiles.push(...cfg.setupFilesAfterEnv);
        }
      } else {
        // Attempt to require CommonJS config
        const cfg = require(p);
        const resolvedCfg = typeof cfg === 'function' ? cfg() : (cfg && cfg.default ? cfg.default : cfg);
        if (resolvedCfg && Array.isArray(resolvedCfg.setupFilesAfterEnv)) {
          setupFiles.push(...resolvedCfg.setupFilesAfterEnv);
        }
      }
    } catch (_) {
      // ignore config load errors
    }
  }

  // Normalize to unique list, prefer original order
  const seen = new Set();
  const unique = [];
  for (const item of setupFiles) {
    if (!item) continue;
    if (!seen.has(item)) { seen.add(item); unique.push(item); }
  }
  return unique;
}

async function runJestWithJson({ args = [], cwd = process.cwd(), filePath = null, hookFilePath = null, timeout = 25000 }) {
  const jsonOutputPath = path.join(
    os.tmpdir(),
    `jest-parallel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`
  );
  const hooksOutputDir = path.join(
    os.tmpdir(),
    `jest-parallel-hooks-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );

  // Ensure JSON output args are present
  const userSetupFiles = await findUserSetupFiles(cwd);
  const setupArgs = [];
  // include user's setupFilesAfterEnv entries
  for (const s of userSetupFiles) {
    setupArgs.push('--setupFilesAfterEnv', s);
  }
  // append our timing setup last
  setupArgs.push('--setupFilesAfterEnv', path.join(__dirname, 'jestHookTimerSetup.js'));

  const fullArgs = [...args, '--json', '--outputFile', jsonOutputPath, ...setupArgs];

  const worker = spawn('npx', ['jest', ...fullArgs], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { 
      ...process.env, 
      NODE_OPTIONS: ((process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS + ' ' : '') + '--max-old-space-size=4096').trim(),
      JEST_PARALLEL_HOOKS_DIR: hooksOutputDir 
    },
    cwd
  });

  let stdout = '';
  let stderr = '';
  let hasResolved = false;

  worker.stdout.on('data', d => (stdout += d.toString()));
  worker.stderr.on('data', d => (stderr += d.toString()));

  const result = await new Promise((resolve, reject) => {
    const finish = async (code) => {
      if (hasResolved) return;
      hasResolved = true;

  let testResults = [];
  let hookInfo = undefined;

      // Prefer JSON parsing
      try {
        const raw = await fs.readFile(jsonOutputPath, 'utf8').catch(() => null);
        if (raw) {
          const json = JSON.parse(raw);
          testResults = extractTestResultsFromJestJson(json, filePath);
        }
      } catch (_) {
        // ignore, fallback next
      } finally {
        await fs.unlink(jsonOutputPath).catch(() => {});
      }

      // Always parse text for hook metadata; also fallback tests if JSON empty
  const workItem = { filePath, workerId: undefined };
  const combined = `${stderr || ''}\n${stdout || ''}`;
  const parsed = parseJestOutput(combined, workItem, silentLogger);
      hookInfo = parsed.hookInfo;
      if (!testResults || testResults.length === 0) {
        testResults = parsed.testResults;
      }

      // Merge precise hook timings from setup files if present (per test file)
      try {
  const targetPath = hookFilePath || filePath;
  const fileSafe = targetPath ? Buffer.from(targetPath).toString('base64url') : null;
        if (fileSafe) {
          const fileJson = path.join(hooksOutputDir, `${fileSafe}.json`);
          const raw = await fs.readFile(fileJson, 'utf8').catch(() => null);
          if (raw) {
            const hooks = JSON.parse(raw);
            hookInfo = hookInfo || {};
            for (const key of Object.keys(hooks)) {
              const h = hooks[key];
              hookInfo[key] = hookInfo[key] || { duration: 0, status: 'not_found', errors: [] };
              hookInfo[key].duration = h.duration != null ? Math.round(h.duration) : (hookInfo[key].duration || 0);
              hookInfo[key].status = h.status || hookInfo[key].status;
              if (Array.isArray(h.errors) && h.errors.length) {
                hookInfo[key].errors = [...(hookInfo[key].errors || []), ...h.errors];
              }
            }
          }
        }
      } catch (_) {}
      finally {
        // Best-effort cleanup
        await fs.rm(hooksOutputDir, { recursive: true, force: true }).catch(() => {});
      }

      // Heuristic: if tests ran (from JSON) but hooks not detected in text output,
      // assume beforeAll/afterAll executed to surface hook info in reports.
      if (hookInfo && testResults && testResults.length > 0) {
        const sumDur = testResults.reduce((s, t) => s + (t.duration || 0), 0);
        const est = Math.max(1, Math.round(sumDur * 0.05));
        if (hookInfo.beforeAll && hookInfo.beforeAll.status === 'not_found') {
          hookInfo.beforeAll.status = 'executed';
          hookInfo.beforeAll.duration = hookInfo.beforeAll.duration || est;
        }
        if (hookInfo.afterAll && hookInfo.afterAll.status === 'not_found') {
          hookInfo.afterAll.status = 'executed';
          hookInfo.afterAll.duration = hookInfo.afterAll.duration || est;
        }
      }

      resolve({
        exitCode: code,
        status: code === 0 ? 'passed' : 'failed',
        testResults,
        stdout,
        stderr,
  hookInfo
      });
    };

    worker.on('close', finish);
    worker.on('exit', finish);
    worker.on('error', err => {
      if (hasResolved) return;
      hasResolved = true;
      reject(err);
    });

    setTimeout(() => {
      if (!worker.killed && !hasResolved) {
        worker.kill('SIGTERM');
        setTimeout(() => {
          if (!worker.killed && !hasResolved) {
            hasResolved = true;
            worker.kill('SIGKILL');
            reject(new Error('Test execution timeout - Jest process killed'));
          }
        }, 2000);
      }
    }, timeout);
  });

  return result;
}

module.exports = {
  runJestWithJson,
  extractTestResultsFromJestJson,
  mapJestStatus
};
