const fs = require('fs');

const collectionPath = '/Users/aiexgt/Downloads/KCC - GraphQLs - Cart TEST-09102026.postman_collection.json';
const data = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

console.log('Collection Name:', data.info.name);

function extractItems(items, folderPath = []) {
  let result = [];
  for (const item of items) {
    const currentPath = [...folderPath, item.name];
    if (item.item && Array.isArray(item.item)) {
      result = result.concat(extractItems(item.item, currentPath));
    } else if (item.request) {
      result.push({
        path: currentPath.join(' > '),
        folder: folderPath.join(' > '),
        name: item.name,
        method: item.request.method,
        hasGraphQL: !!item.request.body?.graphql,
        query: item.request.body?.graphql?.query || item.request.body?.raw || '',
        variables: item.request.body?.graphql?.variables || ''
      });
    }
  }
  return result;
}

const allRequests = extractItems(data.item);
console.log('Total Requests:', allRequests.length);

const summary = {};
for (const req of allRequests) {
  if (!summary[req.folder]) summary[req.folder] = [];
  summary[req.folder].push(req.name);
}

console.log('\n--- Folders and Requests ---');
for (const [folder, reqs] of Object.entries(summary)) {
  console.log(`\n📁 ${folder} (${reqs.length})`);
  reqs.slice(0, 8).forEach(r => console.log(`   - ${r}`));
  if (reqs.length > 8) console.log(`   ... and ${reqs.length - 8} more`);
}
