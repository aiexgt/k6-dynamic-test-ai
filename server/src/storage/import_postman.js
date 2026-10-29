const fs = require('fs');
const path = require('path');

const collectionPath = '/Users/aiexgt/Downloads/KCC - GraphQLs - Cart TEST-09102026.postman_collection.json';
const data = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

const VARIANTS_FILE = path.resolve(__dirname, '../../data/variants.json');
const FLOWS_FILE = path.resolve(__dirname, '../../data/flows.json');

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

function detectStage(name, query) {
  const lowerName = name.toLowerCase();
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.includes('createemptycart') || lowerQuery.includes('generatecustomertoken') || lowerQuery.includes('customercart') || lowerName.includes('crear carrito') || lowerName.includes('customer token')) {
    return 'CART_CREATION';
  }
  if (lowerQuery.includes('setshippingaddressesoncart') || lowerName.includes('direccion de envio')) {
    return 'SET_SHIPPING_ADDRESS';
  }
  if (lowerQuery.includes('setshippingmethodsoncart') || lowerName.includes('metodo de envio')) {
    return 'SET_SHIPPING_METHOD';
  }
  if (lowerQuery.includes('setbillingaddressoncart') || lowerName.includes('direccion de facturacion') || lowerName.includes('billing')) {
    return 'SET_BILLING_ADDRESS';
  }
  if (lowerQuery.includes('applycoupontocart') || lowerQuery.includes('removecouponfromcart') || lowerName.includes('cupon')) {
    return 'APPLY_COUPON';
  }
  if (lowerQuery.includes('setpaymentmethodoncart') || lowerName.includes('metodo de pago') || lowerName.includes('metodos de pago')) {
    return 'SET_PAYMENT_METHOD';
  }
  if (lowerQuery.includes('placeorder') || lowerQuery.includes('confirmorder') || lowerName.includes('colocar orden') || lowerName.includes('confirmacion orden')) {
    return 'PLACE_ORDER';
  }
  if (lowerQuery.includes('addproductstocart') || lowerQuery.includes('addsimpleproductstocart') || lowerQuery.includes('updatecartitems') || lowerQuery.includes('removeitemfromcart') || lowerName.includes('agregar productos') || lowerName.includes('update cart') || lowerName.includes('tecnocheque') || lowerName.includes('giftcard')) {
    return 'ADD_ITEMS';
  }
  return 'ADD_ITEMS';
}

// Cargar variantes actuales
let existingVariants = [];
if (fs.existsSync(VARIANTS_FILE)) {
  try {
    existingVariants = JSON.parse(fs.readFileSync(VARIANTS_FILE, 'utf8'));
  } catch (e) {
    existingVariants = [];
  }
}

const importedVariants = [];
const seenQueries = new Map();

for (const req of reqs) {
  const rawQuery = req.request.body?.graphql?.query || req.request.body?.raw || '';
  if (!rawQuery.trim() || rawQuery.includes('products(\r\n                    search: " "') || req.name.includes('Obtener Sku Random') || req.name.includes('Obtener carrito') || req.name.includes('Cancelacion Orden')) {
    continue; // Omitir helpers como Sku Random o consultas read-only
  }

  const stage = detectStage(req.name, rawQuery);
  const cleanQuery = rawQuery.replace(/\r\n/g, '\n').trim();

  // Parse variables
  let parsedVariables = {};
  const rawVars = req.request.body?.graphql?.variables;
  if (rawVars) {
    try {
      parsedVariables = JSON.parse(rawVars);
    } catch {
      parsedVariables = {};
    }
  }

  // Deduplicate identical queries across different folders
  const querySignature = cleanQuery.replace(/\s+/g, ' ');
  if (seenQueries.has(querySignature)) {
    continue;
  }
  seenQueries.set(querySignature, true);

  // Define contextMapping
  let contextMapping = {};
  let contextOutputs = [];
  if (stage === 'CART_CREATION') {
    if (cleanQuery.includes('createEmptyCart')) {
      contextMapping = { cartId: 'createEmptyCart' };
      contextOutputs = ['cartId'];
    } else if (cleanQuery.includes('generateCustomerToken')) {
      contextMapping = { token: 'generateCustomerToken.token' };
      contextOutputs = ['token'];
    } else if (cleanQuery.includes('customerCart')) {
      contextMapping = { cartId: 'customerCart.id' };
      contextOutputs = ['cartId'];
    }
  } else if (stage === 'PLACE_ORDER') {
    contextMapping = { orderNumber: 'placeOrder.order.order_number' };
    contextOutputs = ['orderNumber'];
  }

  const variantId = `kcc-${stage.toLowerCase()}-${importedVariants.length + 1}`;
  const variant = {
    id: variantId,
    name: `KCC: ${req.name}`,
    stage,
    description: `Importada de Postman: ${req.folder} > ${req.name}`,
    query: cleanQuery,
    defaultVariables: parsedVariables,
    contextOutputs,
    contextMapping,
    isVirtualOnly: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  importedVariants.push(variant);
}

console.log(`Variantes extraídas de Postman: ${importedVariants.length}`);

// Merge con existentes evitando duplicados por nombre
const allVariants = [...existingVariants];
for (const imp of importedVariants) {
  const existingIdx = allVariants.findIndex(v => v.name === imp.name && v.stage === imp.stage);
  if (existingIdx >= 0) {
    allVariants[existingIdx] = imp;
  } else {
    allVariants.push(imp);
  }
}

fs.writeFileSync(VARIANTS_FILE, JSON.stringify(allVariants, null, 2), 'utf8');
console.log(`Total variantes guardadas en ${VARIANTS_FILE}: ${allVariants.length}`);

// Generar Recetas / Flujos específicos basados en las carpetas de Postman
const kccFlows = [
  {
    id: 'flow-kcc-anonimo-contado',
    name: 'KCC: Carrito Anónimo (Pago Contado)',
    description: 'Flujo completo de Kosmos con productos 1P, envío tablerate, facturación sameAsShipping y pago distelsa_payment contado.',
    steps: [
      { stage: 'CART_CREATION', variantId: allVariants.find(v => v.name.includes('Crear carrito anonimo'))?.id || null, skipped: false },
      { stage: 'ADD_ITEMS', variantId: allVariants.find(v => v.name.includes('Agregar productos 1p'))?.id || null, skipped: false },
      { stage: 'SET_SHIPPING_ADDRESS', variantId: allVariants.find(v => v.name.includes('Agregar direccion de envio'))?.id || null, skipped: false },
      { stage: 'SET_SHIPPING_METHOD', variantId: allVariants.find(v => v.name.includes('Agregar metodo de envio 1p'))?.id || null, skipped: false },
      { stage: 'SET_BILLING_ADDRESS', variantId: allVariants.find(v => v.name.includes('facturacion SameAsShipping'))?.id || null, skipped: false },
      { stage: 'APPLY_COUPON', variantId: null, skipped: true },
      { stage: 'SET_PAYMENT_METHOD', variantId: allVariants.find(v => v.name.includes('Agregar metodos de pago'))?.id || null, skipped: false },
      { stage: 'PLACE_ORDER', variantId: allVariants.find(v => v.name.includes('Colocar Orden Contado'))?.id || null, skipped: false }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'flow-kcc-anonimo-cuotas',
    name: 'KCC: Carrito Anónimo (10 Cuotas)',
    description: 'Flujo de Kosmos con productos 1P, envío tablerate y orden con plan de 10 cuotas en distelsa_payment.',
    steps: [
      { stage: 'CART_CREATION', variantId: allVariants.find(v => v.name.includes('Crear carrito anonimo'))?.id || null, skipped: false },
      { stage: 'ADD_ITEMS', variantId: allVariants.find(v => v.name.includes('Agregar productos 1p'))?.id || null, skipped: false },
      { stage: 'SET_SHIPPING_ADDRESS', variantId: allVariants.find(v => v.name.includes('Agregar direccion de envio'))?.id || null, skipped: false },
      { stage: 'SET_SHIPPING_METHOD', variantId: allVariants.find(v => v.name.includes('Agregar metodo de envio 1p'))?.id || null, skipped: false },
      { stage: 'SET_BILLING_ADDRESS', variantId: allVariants.find(v => v.name.includes('facturacion SameAsShipping'))?.id || null, skipped: false },
      { stage: 'APPLY_COUPON', variantId: null, skipped: true },
      { stage: 'SET_PAYMENT_METHOD', variantId: allVariants.find(v => v.name.includes('Agregar metodos de pago'))?.id || null, skipped: false },
      { stage: 'PLACE_ORDER', variantId: allVariants.find(v => v.name.includes('Colocar Orden Cuotas'))?.id || null, skipped: false }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'flow-kcc-cupones-puntos',
    name: 'KCC: Carrito con Cupones Puntos',
    description: 'Flujo que incluye la mutación de cupones de puntos de Kosmos antes del pago.',
    steps: [
      { stage: 'CART_CREATION', variantId: allVariants.find(v => v.name.includes('Crear carrito anonimo'))?.id || null, skipped: false },
      { stage: 'ADD_ITEMS', variantId: allVariants.find(v => v.name.includes('Agregar productos 1p'))?.id || null, skipped: false },
      { stage: 'SET_SHIPPING_ADDRESS', variantId: allVariants.find(v => v.name.includes('Agregar direccion de envio'))?.id || null, skipped: false },
      { stage: 'SET_SHIPPING_METHOD', variantId: allVariants.find(v => v.name.includes('Agregar metodo de envio 1p'))?.id || null, skipped: false },
      { stage: 'SET_BILLING_ADDRESS', variantId: allVariants.find(v => v.name.includes('facturacion SameAsShipping'))?.id || null, skipped: false },
      { stage: 'APPLY_COUPON', variantId: allVariants.find(v => v.name.includes('Agregar Cupones Puntos'))?.id || null, skipped: false },
      { stage: 'SET_PAYMENT_METHOD', variantId: allVariants.find(v => v.name.includes('Agregar metodos de pago'))?.id || null, skipped: false },
      { stage: 'PLACE_ORDER', variantId: allVariants.find(v => v.name.includes('Colocar Orden Contado'))?.id || null, skipped: false }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

let existingFlows = [];
if (fs.existsSync(FLOWS_FILE)) {
  try {
    existingFlows = JSON.parse(fs.readFileSync(FLOWS_FILE, 'utf8'));
  } catch (e) {
    existingFlows = [];
  }
}

for (const kf of kccFlows) {
  const idx = existingFlows.findIndex(f => f.id === kf.id);
  if (idx >= 0) existingFlows[idx] = kf;
  else existingFlows.unshift(kf);
}

fs.writeFileSync(FLOWS_FILE, JSON.stringify(existingFlows, null, 2), 'utf8');
console.log(`Recetas KCC guardadas en ${FLOWS_FILE}: ${existingFlows.length}`);
