const fs = require('fs');

const collectionPath = '/Users/aiexgt/Downloads/KCC - GraphQLs - Cart TEST-09102026.postman_collection.json';
const data = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

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
        request: item.request
      });
    }
  }
  return result;
}

const reqs = extractItems(data.item);
console.log('Total:', reqs.length);

const mutationTypes = {};

for (const r of reqs) {
  const query = r.request.body?.graphql?.query || r.request.body?.raw || '';
  // Match mutation name or query name
  const match = query.match(/(mutation|query)\s+([A-Za-z0-9_]+)/) || query.match(/{\s*([A-Za-z0-9_]+)/);
  const opName = match ? match[2] || match[1] : 'unknown';
  
  // Detect standard magento mutations inside query
  const magentoOps = [];
  const patterns = [
    'createEmptyCart', 'customerCart', 'generateCustomerToken', 'revokeCustomerToken',
    'addSimpleProductsToCart', 'addProductsToCart', 'addConfigurableProductsToCart', 'addVirtualProductsToCart', 'updateCartItems', 'removeItemFromCart',
    'setShippingAddressesOnCart', 'setShippingMethodsOnCart',
    'setBillingAddressOnCart', 'applyCouponToCart', 'removeCouponFromCart',
    'setPaymentMethodOnCart', 'setPaymentMethodAndPlaceOrder', 'placeOrder',
    'products', 'cart'
  ];

  for (const p of patterns) {
    if (query.includes(p)) magentoOps.push(p);
  }

  const key = magentoOps.join('+') || opName;
  if (!mutationTypes[key]) mutationTypes[key] = [];
  mutationTypes[key].push({ name: r.name, folder: r.folder, querySnippet: query.substring(0, 150) });
}

console.log('Operations detected:');
for (const [op, list] of Object.entries(mutationTypes)) {
  console.log(`\n🔹 [${op}] (${list.length} peticiones)`);
  list.slice(0, 4).forEach(x => console.log(`   - "${x.name}" (${x.folder})`));
}
