// String utility functions for testing
function concatenate(...strings) {
  return strings.join('');
}

function toUpperCase(str) {
  return str.toUpperCase();
}

function toLowerCase(str) {
  return str.toLowerCase();
}

function getLength(str) {
  return str.length;
}

async function asyncStringOperation(value, delay = 100) {
  return new Promise(resolve => {
    setTimeout(() => resolve(value), delay);
  });
}

module.exports = {
  concatenate,
  toUpperCase,
  toLowerCase,
  getLength,
  asyncStringOperation
};
