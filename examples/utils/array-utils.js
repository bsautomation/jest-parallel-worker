// Array utility functions for testing
function pushElement(arr, element) {
  const newArray = [...arr];
  newArray.push(element);
  return newArray;
}

function popElement(arr) {
  const newArray = [...arr];
  const element = newArray.pop();
  return { array: newArray, element };
}

function getArrayLength(arr) {
  return arr.length;
}

function mapArray(arr, fn) {
  return arr.map(fn);
}

function filterArray(arr, fn) {
  return arr.filter(fn);
}

module.exports = {
  pushElement,
  popElement,
  getArrayLength,
  mapArray,
  filterArray
};
