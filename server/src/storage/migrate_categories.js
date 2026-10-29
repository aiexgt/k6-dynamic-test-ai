const fs = require('fs');
const path = require('path');

const VARIANTS_FILE = path.resolve(__dirname, '../../data/variants.json');

const STAGE_TO_CATEGORY = {
  CART_CREATION: 'Carrito',
  ADD_ITEMS: 'Productos / Items',
  SET_SHIPPING_ADDRESS: 'Dirección de Envío',
  SET_SHIPPING_METHOD: 'Método de Envío',
  SET_BILLING_ADDRESS: 'Facturación',
  APPLY_COUPON: 'Cupones',
  SET_PAYMENT_METHOD: 'Método de Pago',
  PLACE_ORDER: 'Colocar Orden'
};

const variants = JSON.parse(fs.readFileSync(VARIANTS_FILE, 'utf8'));

for (const v of variants) {
  if (!v.category) {
    v.category = STAGE_TO_CATEGORY[v.stage] || v.stage || 'General';
  }
}

fs.writeFileSync(VARIANTS_FILE, JSON.stringify(variants, null, 2), 'utf8');
console.log(`Migradas ${variants.length} variantes con categorias.`);
