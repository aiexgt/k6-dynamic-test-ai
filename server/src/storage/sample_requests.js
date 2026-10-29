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

// Sample one from each category
const namesToSample = [
  'Crear carrito anonimo',
  'Agregar direccion de envio',
  'Agregar productos 1p',
  'Agregar direccion de facturacion SameAsShipping',
  'Agregar metodo de envio 1p',
  'Agregar metodos de pago',
  'Colocar Orden Contado',
  'Colocar Orden Cuotas'
];

for (const name of namesToSample) {
  const found = reqs.find(r => r.name === name);
  if (found) {
    console.log(`\n=================== [${found.name}] ===================`);
    console.log('Query:');
    console.log(found.request.body?.graphql?.query || found.request.body?.raw);
    console.log('Variables:');
    console.log(found.request.body?.graphql?.variables);
  }
}
