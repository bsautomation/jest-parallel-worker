// Jest setup file to measure hook timings precisely
// Wrap all logic in an IIFE to safely early-return without top-level return
(function() {
  const { performance } = require('perf_hooks');
  const fs = require('fs');
  const path = require('path');

  // Avoid double-patching if setup is loaded multiple times
  if (global.__JEST_PARALLEL_HOOKS_PATCHED__) {
    return; // safe inside IIFE
  }
  global.__JEST_PARALLEL_HOOKS_PATCHED__ = true;

  function now() {
    return performance.now();
  }

  function getStore() {
    if (!global.__JEST_PARALLEL_HOOKS__) {
      // Map: testPath -> hooks aggregate
      global.__JEST_PARALLEL_HOOKS__ = {};
    }
    return global.__JEST_PARALLEL_HOOKS__;
  }

  function getTestPath() {
    try {
      if (global.expect && typeof global.expect.getState === 'function') {
        const st = global.expect.getState();
        if (st && st.testPath) return st.testPath;
      }
    } catch (_e) {}
    return 'unknown';
  }

  function getFileBucket(store, hookType) {
    const testPath = getTestPath();
    if (!store[testPath]) {
      store[testPath] = {
        beforeAll: { count: 0, totalDuration: 0, failedCount: 0, errors: [] },
        beforeEach: { count: 0, totalDuration: 0, failedCount: 0, errors: [] },
        afterAll: { count: 0, totalDuration: 0, failedCount: 0, errors: [] },
        afterEach: { count: 0, totalDuration: 0, failedCount: 0, errors: [] }
      };
    }
    return { bucket: store[testPath][hookType], testPath };
  }

  function wrapHook(original, hookType) {
    if (typeof original !== 'function') return original;
    return function(fn, timeout) {
      if (typeof fn !== 'function') {
        return original(fn, timeout);
      }

      const wrapped = async () => {
        const store = getStore();
        const start = now();
        try {
          const res = fn();
          if (res && typeof res.then === 'function') {
            await res;
          }
          const duration = now() - start;
          const { bucket } = getFileBucket(store, hookType);
          bucket.count += 1;
          bucket.totalDuration += duration;
        } catch (err) {
          const duration = now() - start;
          const { bucket } = getFileBucket(store, hookType);
          bucket.count += 1;
          bucket.totalDuration += duration;
          bucket.failedCount += 1;
          const message = err && err.message ? err.message : String(err);
          bucket.errors.push({ message, time: new Date().toISOString() });
          throw err;
        }
      };

      return original(wrapped, timeout);
    };
  }

  // Patch globals
  if (global.beforeAll) global.beforeAll = wrapHook(global.beforeAll, 'beforeAll');
  if (global.beforeEach) global.beforeEach = wrapHook(global.beforeEach, 'beforeEach');
  if (global.afterAll) global.afterAll = wrapHook(global.afterAll, 'afterAll');
  if (global.afterEach) global.afterEach = wrapHook(global.afterEach, 'afterEach');

  // On process exit, write the aggregated hook timings
  process.on('exit', () => {
    try {
      const store = getStore();
      const outDir = process.env.JEST_PARALLEL_HOOKS_DIR;
      if (outDir) {
        try { fs.mkdirSync(outDir, { recursive: true }); } catch (_e) {}
        for (const testPath of Object.keys(store)) {
          const hooks = store[testPath];
          const outObj = {};
          for (const key of Object.keys(hooks)) {
            const { count, totalDuration, failedCount, errors } = hooks[key];
            outObj[key] = {
              executions: count,
              duration: Math.round(totalDuration),
              status: failedCount > 0 ? 'failed' : (count > 0 ? 'executed' : 'not_found'),
              errors
            };
          }
          const safeName = Buffer.from(testPath).toString('base64url');
          const filePath = path.join(outDir, `${safeName}.json`);
          fs.writeFileSync(filePath, JSON.stringify(outObj), 'utf8');
        }
      } else {
        const out = process.env.JEST_PARALLEL_HOOKS_OUTPUT;
        if (!out) return;
        const flat = {};
        for (const testPath of Object.keys(store)) {
          flat[testPath] = {};
          const hooks = store[testPath];
          for (const key of Object.keys(hooks)) {
            const { count, totalDuration, failedCount, errors } = hooks[key];
            flat[testPath][key] = {
              executions: count,
              duration: Math.round(totalDuration),
              status: failedCount > 0 ? 'failed' : (count > 0 ? 'executed' : 'not_found'),
              errors
            };
          }
        }
        const dir = path.dirname(out);
        try { fs.mkdirSync(dir, { recursive: true }); } catch (_e) {}
        fs.writeFileSync(out, JSON.stringify(flat), 'utf8');
      }
    } catch (_err) {
      // Swallow errors; do not disrupt Jest exit
    }
  });
})();
