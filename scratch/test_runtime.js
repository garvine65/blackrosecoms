const fs = require('fs');
const path = require('path');

// Mock browser environment
const dom = {
  listeners: {},
  addEventListener(evt, fn) {
    if (!this.listeners[evt]) this.listeners[evt] = [];
    this.listeners[evt].push(fn);
  }
};

global.window = global;
global.document = {
  addEventListener: (evt, fn) => dom.addEventListener(evt, fn),
  createElement: (tag) => ({
    tagName: tag,
    textContent: '',
    innerHTML: '',
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {},
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => ({
      querySelectorAll: () => [],
      querySelector: () => null,
      appendChild() {},
      dataset: {}
    })
  }),
  getElementById: (id) => {
    return {
      id,
      textContent: '',
      innerHTML: '',
      value: '',
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {},
      appendChild() {},
      setAttribute() {},
      removeAttribute() {}
    };
  },
  querySelector: (sel) => {
    return {
      textContent: '',
      innerHTML: '',
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener() {},
      appendChild() {}
    };
  },
  querySelectorAll: () => []
};
global.localStorage = { getItem: () => null, setItem: () => null };
global.sessionStorage = { getItem: () => null, setItem: () => null };
global.SUPABASE_URL = 'https://example.supabase.co';
global.SUPABASE_ANON_KEY = 'anon';

try {
  const code = fs.readFileSync(path.join(__dirname, '../black-rose-eval/script.js'), 'utf-8');
  eval(code);
  console.log('script.js loaded successfully without syntax or load errors!');

  // Test star click simulation
  const clickListeners = dom.listeners['click'] || [];
  console.log(`Found ${clickListeners.length} click listener(s) registered on document.`);
  
  let painted = false;
  const mockContainer = {
    dataset: { metric: 'quality' },
    querySelectorAll: (sel) => {
      return [1,2,3,4,5].map(v => ({
        dataset: { val: v },
        classList: {
          toggle: (cls, state) => {
            if (cls === 'filled' && state) painted = true;
          }
        }
      }));
    },
    querySelector: () => ({ textContent: '' })
  };

  const mockStarBtn = {
    dataset: { val: 4 },
    closest: (sel) => {
      if (sel === '.star-btn') return mockStarBtn;
      if (sel === '.stars') return mockContainer;
      return null;
    }
  };

  const mockEvent = {
    target: mockStarBtn,
    preventDefault: () => {}
  };

  clickListeners.forEach(fn => fn(mockEvent));
  console.log('Simulated click on 4-star Quality of Work.');
  console.log('ratings object state:', JSON.stringify(ratings));
  console.log('Stars painted?', painted);

} catch (err) {
  console.error('ERROR during script.js execution:', err);
}
