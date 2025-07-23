// Math utility functions for testing
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

function multiply(a, b) {
  return a * b;
}

function divide(a, b) {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}

async function asyncCalculation(value, delay = 100) {
  return new Promise(resolve => {
    setTimeout(() => resolve(value), delay);
  });
}

module.exports = {
  add,
  subtract,
  multiply,
  divide,
  asyncCalculation
};
