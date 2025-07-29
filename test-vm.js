const vm = require('vm');

// Create a simple expect function
const expect = (actual) => ({
  toBe: (expected) => {
    if (actual !== expected) {
      throw new Error(`Expected ${actual} to be ${expected}`);
    }
    return true;
  }
});

console.log('Creating context...');
const context = {
  console,
  expect,
  global: {}
};
context.global = context;
context.global.expect = expect;

console.log('expect type in context:', typeof context.expect);
console.log('global.expect type in context:', typeof context.global.expect);

const vmContext = vm.createContext(context);

try {
  console.log('Running VM code...');
  const result = vm.runInContext('console.log("In VM:", typeof expect); expect(1).toBe(1); "success";', vmContext);
  console.log('VM result:', result);
} catch (error) {
  console.error('VM test failed:', error.message);
}
