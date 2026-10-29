const fs = require('fs');
const path = require('path');

const collectionPath = '/Users/aiexgt/Downloads/KCC - GraphQLs - Cart TEST-09102026.postman_collection.json';
const data = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

const allCollected = [];

function collectItems(items, folderPath = []) {
  for (const item of items) {
    const currentPath = [...folderPath, item.name];
    const folderStr = folderPath.join(' > ');
    const subfolder = folderPath[folderPath.length - 1] || '';

    // 1. Petición principal
    if (item.request) {
      const q = (item.request.body?.graphql?.query || item.request.body?.raw || '').trim();
      const v = (item.request.body?.graphql?.variables || '').trim();
      if (q && !item.name.includes('Cancelacion Orden')) {
        allCollected.push({
          source: 'request',
          name: item.name,
          folder: folderStr,
          subfolder,
          query: q,
          vars: v
        });
      }
    }

    // 2. Ejemplos guardados (response[])
    if (item.response && Array.isArray(item.response)) {
      for (const res of item.response) {
        const origReq = res.originalRequest;
        if (!origReq) continue;
        const q = (origReq.body?.graphql?.query || origReq.body?.raw || '').trim();
        const v = (origReq.body?.graphql?.variables || '').trim();
        if (q && !res.name.includes('Cancelacion Orden')) {
          allCollected.push({
            source: 'example',
            name: res.name,
            folder: folderStr,
            subfolder: item.name,
            query: q,
            vars: v
          });
        }
      }
    }

    if (item.item && Array.isArray(item.item)) {
      collectItems(item.item, currentPath);
    }
  }
}

collectItems(data.item);

function detectCategory(name, query) {
  const lowerName = name.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // 1. Agregar Productos
  if (
    lowerName.includes('agregar productos') ||
    lowerName.includes('update cart') ||
    lowerName.includes('updatecart') ||
    lowerName.includes('remove item') ||
    lowerName.includes('sku random') ||
    lowerQuery.includes('addproductstocart') ||
    lowerQuery.includes('addsimpleproductstocart') ||
    lowerQuery.includes('addconfigurableproductstocart') ||
    lowerQuery.includes('updatecartitems') ||
    lowerQuery.includes('removeitemfromcart')
  ) {
    return 'Agregar Productos';
  }

  // 2. Crear Carrito
  if (
    lowerName.includes('crear carrito') ||
    lowerName.includes('customer token') ||
    lowerName.includes('customer get cartid') ||
    lowerName.includes('merge carts') ||
    lowerQuery.includes('createemptycart') ||
    lowerQuery.includes('generatecustomertoken') ||
    lowerQuery.includes('customercart')
  ) {
    return 'Crear Carrito';
  }

  // 3. Agregar Tipo Envio
  if (
    lowerName.includes('metodo de envio') ||
    lowerName.includes('método de envío') ||
    lowerName.includes('tipo envio') ||
    lowerName.includes('tipo envío') ||
    lowerName.includes('shipping method') ||
    lowerQuery.includes('setshippingmethodsoncart')
  ) {
    return 'Agregar Tipo Envio';
  }

  // 4. Agregar Dirección Envio
  if (
    lowerName.includes('direccion de envio') ||
    lowerName.includes('dirección de envío') ||
    lowerName.includes('shipping address') ||
    lowerQuery.includes('setshippingaddressesoncart')
  ) {
    return 'Agregar Dirección Envio';
  }

  // 5. Agregar Dirección Facturación
  if (
    lowerName.includes('direccion de facturacion') ||
    lowerName.includes('dirección de facturación') ||
    lowerName.includes('sameasshipping') ||
    lowerName.includes('datos de facturacion') ||
    lowerName.includes('billing address') ||
    lowerQuery.includes('setbillingaddressoncart')
  ) {
    return 'Agregar Dirección Facturación';
  }

  // 6. Agregar Método de Pago
  if (
    lowerName.includes('metodos de pago') ||
    lowerName.includes('métodos de pago') ||
    lowerName.includes('metodo de pago') ||
    lowerName.includes('método de pago') ||
    lowerQuery.includes('setpaymentmethodoncart')
  ) {
    return 'Agregar Método de Pago';
  }

  // 7. Agregar Descuentos
  if (
    lowerName.includes('cupon') ||
    lowerName.includes('cupón') ||
    lowerName.includes('tecnocheque') ||
    lowerName.includes('giftcard') ||
    lowerName.includes('puntos') ||
    lowerQuery.includes('applycoupontocart') ||
    lowerQuery.includes('removecouponfromcart')
  ) {
    return 'Agregar Descuentos';
  }

  // 8. Finalizar Carrito
  if (
    lowerName.includes('colocar orden') ||
    lowerName.includes('place order') ||
    lowerName.includes('placeorder') ||
    lowerName.includes('confirmacion orden') ||
    lowerName.includes('confirmación orden') ||
    lowerQuery.includes('placeorder')
  ) {
    return 'Finalizar Carrito';
  }

  // 9. Completar Carrito
  if (
    lowerName.includes('guest email') ||
    lowerName.includes('wedding') ||
    lowerName.includes('originsource') ||
    lowerName.includes('obtener carrito') ||
    lowerQuery.includes('setguestemailoncart')
  ) {
    return 'Completar Carrito';
  }

  return 'Sin Categoría';
}

function detectStage(category) {
  switch (category) {
    case 'Crear Carrito':
      return 'CART_CREATION';
    case 'Agregar Dirección Envio':
      return 'SET_SHIPPING_ADDRESS';
    case 'Agregar Productos':
      return 'ADD_ITEMS';
    case 'Agregar Dirección Facturación':
      return 'SET_BILLING_ADDRESS';
    case 'Agregar Tipo Envio':
      return 'SET_SHIPPING_METHOD';
    case 'Agregar Método de Pago':
      return 'SET_PAYMENT_METHOD';
    case 'Agregar Descuentos':
      return 'APPLY_COUPON';
    case 'Finalizar Carrito':
      return 'PLACE_ORDER';
    default:
      return 'ADD_ITEMS';
  }
}

// Deduplicar por firma exacta de query + variables
const uniqueMap = new Map();
for (const it of allCollected) {
  const cleanQ = it.query.replace(/\r\n/g, '\n').trim();
  const sig = cleanQ.replace(/\s+/g, ' ') + '###' + it.vars.replace(/\s+/g, ' ');
  if (!uniqueMap.has(sig)) {
    uniqueMap.set(sig, {
      ...it,
      query: cleanQ
    });
  }
}

const uniqueList = Array.from(uniqueMap.values());

// Contar nombres base para desambiguar duplicados
const titleCounts = {};
uniqueList.forEach(item => {
  const cleanTitle = item.name.replace(/^[0-9]+\s*-\s*/, '').trim();
  titleCounts[cleanTitle] = (titleCounts[cleanTitle] || 0) + 1;
});

const titleUsedCount = {};
const variants = [];

for (const item of uniqueList) {
  const cleanTitle = item.name.replace(/^[0-9]+\s*-\s*/, '').trim();
  const category = detectCategory(cleanTitle, item.query);
  const stage = detectStage(category);

  let finalName = cleanTitle;
  if (titleCounts[cleanTitle] > 1) {
    titleUsedCount[cleanTitle] = (titleUsedCount[cleanTitle] || 0) + 1;
    finalName = `${cleanTitle} (${item.subfolder || `Opción ${titleUsedCount[cleanTitle]}`})`;
  }

  // Parse variables
  let parsedVariables = {};
  if (item.vars) {
    try {
      parsedVariables = JSON.parse(item.vars);
    } catch {
      parsedVariables = {};
    }
  }

  // Context mappings
  let contextMapping = {};
  let contextOutputs = [];
  if (category === 'Crear Carrito') {
    if (item.query.includes('createEmptyCart')) {
      contextMapping = { cartId: 'createEmptyCart' };
      contextOutputs = ['cartId'];
    } else if (item.query.includes('generateCustomerToken')) {
      contextMapping = { token: 'generateCustomerToken.token' };
      contextOutputs = ['token'];
    } else if (item.query.includes('customerCart')) {
      contextMapping = { cartId: 'customerCart.id' };
      contextOutputs = ['cartId'];
    }
  } else if (category === 'Finalizar Carrito') {
    contextMapping = { orderNumber: 'placeOrder.order.order_number' };
    contextOutputs = ['orderNumber'];
  }

  const variantId = `kcc-${Date.now().toString(36)}-${variants.length + 1}`;
  variants.push({
    id: variantId,
    name: finalName,
    category,
    stage,
    description: `Postman [${item.source}]: ${item.folder}`,
    query: item.query,
    defaultVariables: parsedVariables,
    contextOutputs,
    contextMapping,
    isVirtualOnly: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

const categories = [
  'Crear Carrito',
  'Agregar Dirección Envio',
  'Agregar Productos',
  'Agregar Dirección Facturación',
  'Agregar Tipo Envio',
  'Agregar Método de Pago',
  'Agregar Descuentos',
  'Completar Carrito',
  'Finalizar Carrito',
  'Sin Categoría'
];

const VARIANTS_FILE = path.resolve(__dirname, '../../data/variants.json');
const CATEGORIES_FILE = path.resolve(__dirname, '../../data/categories.json');

fs.writeFileSync(VARIANTS_FILE, JSON.stringify(variants, null, 2), 'utf8');
fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2), 'utf8');

console.log(`Guardadas ${variants.length} variantes (incluyendo Examples y peticiones base).`);
const summary = {};
variants.forEach(v => {
  summary[v.category] = (summary[v.category] || 0) + 1;
});
console.log('Distribución final:', summary);
