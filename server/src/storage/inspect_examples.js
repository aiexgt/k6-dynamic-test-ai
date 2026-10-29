const fs = require('fs');
const postman = JSON.parse(fs.readFileSync('/Users/aiexgt/Downloads/KCC - GraphQLs - Cart TEST-09102026.postman_collection.json', 'utf8'));

const allExamples = [];
function collectExamples(items, path = '') {
  for (const it of items) {
    const curPath = path ? path + ' > ' + it.name : it.name;
    if (it.response && Array.isArray(it.response)) {
      for (const res of it.response) {
        const origReq = res.originalRequest;
        if (!origReq) continue;
        const query = origReq.body?.graphql?.query || origReq.body?.raw || '';
        const vars = origReq.body?.graphql?.variables || '';
        if (query.trim()) {
          allExamples.push({
            parentReq: it.name,
            parentPath: curPath,
            name: res.name,
            query: query.trim(),
            vars: vars.trim()
          });
        }
      }
    }
    if (it.item) collectExamples(it.item, curPath);
  }
}
collectExamples(postman.item);
console.log('Total examples with query:', allExamples.length);

const byName = new Map();
allExamples.forEach(e => {
  if (!byName.has(e.name)) byName.set(e.name, []);
  byName.get(e.name).push(e);
});

console.log('Distinct example names:', byName.size);
for (const [name, list] of byName.entries()) {
  console.log(`- [${list[0].parentReq}] -> "${name}"`);
}
