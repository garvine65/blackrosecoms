const fs = require('fs');
const vm = require('vm');

global.SUPABASE_URL = "http://localhost";
global.SUPABASE_ANON_KEY = "test";
const mockElem = { addEventListener: () => {}, querySelectorAll: () => [], querySelector: () => mockElem, style: {} };
global.document = {
  addEventListener: () => {},
  querySelector: () => mockElem,
  querySelectorAll: () => [],
  getElementById: () => mockElem,
  body: { appendChild: () => {} }
};
global.window = global;
global.location = { pathname: '/' };
global.supabase = {
  createClient: () => ({
    auth: { onAuthStateChange: () => {}, getSession: async () => ({ data: {} }) },
    from: () => ({ select: () => ({ data: [] }), upsert: () => ({}), delete: () => ({}) }),
    channel: () => ({ on: () => ({ subscribe: () => {} }) })
  })
};
global.localStorage = { getItem: () => null, setItem: () => {} };

const code = fs.readFileSync('artifact-clone/app.js', 'utf8');
vm.runInThisContext(code);

console.log("\n=== CHECKLIST TEMPLATES PREFILLING VERIFICATION ===");
const testClients = ['ADH', 'AMM Law', 'BRC Consultancy', 'Briq Consultancy', 'Ultimate', 'Multiplier'];
testClients.forEach(client => {
  const cl = clCreateFromTemplate(client, '2026-08');
  const totalItems = cl.sections.reduce((acc, s) => acc + s.items.length, 0);
  console.log(`Company: ${client.padEnd(18)} | Template: ${cl.templateName.padEnd(38)} | Sections: ${String(cl.sections.length).padStart(2)} | Tasks: ${totalItems}`);
});
