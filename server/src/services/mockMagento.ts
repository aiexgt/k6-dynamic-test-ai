import { Request, Response } from 'express';

let orderCounter = 1000;

export async function executeMockGraphQL(queryStr: string, variables: any = {}): Promise<{ status: number; data?: any; errors?: any[] }> {
  // Simulate realistic network / processing delay (60ms - 180ms)
  const simulatedDelay = Math.floor(Math.random() * 120) + 60;
  await new Promise(resolve => setTimeout(resolve, simulatedDelay));

  // 1. createEmptyCart
  if (queryStr.includes('createEmptyCart')) {
    const generatedCartId = 'mock_cart_' + Math.random().toString(36).substring(2, 10);
    return {
      status: 200,
      data: {
        createEmptyCart: generatedCartId
      }
    };
  }

  // 1b. generateCustomerToken
  if (queryStr.includes('generateCustomerToken')) {
    return {
      status: 200,
      data: {
        generateCustomerToken: {
          token: 'mock_jwt_customer_token_' + Math.random().toString(36).substring(2, 12)
        }
      }
    };
  }

  // 2. addSimpleProductsToCart
  if (queryStr.includes('addSimpleProductsToCart')) {
    const sku = variables?.sku || variables?.cart_items?.[0]?.data?.sku || '24-MB01';
    const qty = variables?.quantity || variables?.cart_items?.[0]?.data?.quantity || 1;
    return {
      status: 200,
      data: {
        addSimpleProductsToCart: {
          cart: {
            total_quantity: qty,
            items: [
              {
                id: 'item_101',
                product: {
                  sku,
                  name: `Product ${sku}`
                },
                quantity: qty
              }
            ],
            prices: {
              grand_total: {
                value: 45.0 * qty,
                currency: 'USD'
              }
            }
          }
        }
      }
    };
  }

  // 2b. addConfigurableProductsToCart
  if (queryStr.includes('addConfigurableProductsToCart')) {
    const qty = variables?.quantity || 1;
    return {
      status: 200,
      data: {
        addConfigurableProductsToCart: {
          cart: {
            total_quantity: qty,
            items: [
              {
                id: 'item_102',
                quantity: qty,
                configurable_options: [
                  { option_label: 'Size', value_label: 'M' },
                  { option_label: 'Color', value_label: 'Blue' }
                ]
              }
            ],
            prices: {
              grand_total: {
                value: 65.0 * qty,
                currency: 'USD'
              }
            }
          }
        }
      }
    };
  }

  // 2c. addVirtualProductsToCart
  if (queryStr.includes('addVirtualProductsToCart')) {
    const sku = variables?.sku || 'VIRTUAL-GIFT-CARD-50';
    return {
      status: 200,
      data: {
        addVirtualProductsToCart: {
          cart: {
            total_quantity: 1,
            is_virtual: true,
            items: [
              {
                id: 'item_103',
                product: {
                  sku,
                  name: 'Digital Gift Card'
                }
              }
            ]
          }
        }
      }
    };
  }

  // 3. setShippingAddressesOnCart
  if (queryStr.includes('setShippingAddressesOnCart')) {
    const street = variables?.street || ['123 Main St'];
    return {
      status: 200,
      data: {
        setShippingAddressesOnCart: {
          cart: {
            shipping_addresses: [
              {
                firstname: variables?.firstname || 'Test',
                lastname: variables?.lastname || 'Customer',
                street: Array.isArray(street) ? street : [street],
                city: variables?.city || 'Guatemala',
                available_shipping_methods: [
                  {
                    carrier_code: 'flatrate',
                    method_code: 'flatrate',
                    carrier_title: 'Fixed Delivery',
                    method_title: 'Standard',
                    amount: { value: 5.0, currency: 'USD' }
                  },
                  {
                    carrier_code: 'tablerate',
                    method_code: 'bestway',
                    carrier_title: 'Express Delivery',
                    method_title: 'Next Day',
                    amount: { value: 15.0, currency: 'USD' }
                  }
                ]
              }
            ]
          }
        }
      }
    };
  }

  // 4. setShippingMethodsOnCart
  if (queryStr.includes('setShippingMethodsOnCart')) {
    const carrier = variables?.carrierCode || 'flatrate';
    const method = variables?.methodCode || 'flatrate';
    return {
      status: 200,
      data: {
        setShippingMethodsOnCart: {
          cart: {
            shipping_addresses: [
              {
                selected_shipping_method: {
                  carrier_code: carrier,
                  method_code: method,
                  carrier_title: carrier.toUpperCase(),
                  amount: { value: 5.0, currency: 'USD' }
                }
              }
            ],
            prices: {
              grand_total: {
                value: 50.0,
                currency: 'USD'
              }
            }
          }
        }
      }
    };
  }

  // 5. setBillingAddressOnCart
  if (queryStr.includes('setBillingAddressOnCart')) {
    return {
      status: 200,
      data: {
        setBillingAddressOnCart: {
          cart: {
            billing_address: {
              firstname: variables?.firstname || 'Test',
              lastname: variables?.lastname || 'Customer',
              street: variables?.street || ['123 Main St'],
              city: variables?.city || 'Guatemala'
            }
          }
        }
      }
    };
  }

  // 6. applyCouponToCart
  if (queryStr.includes('applyCouponToCart')) {
    const couponCode = variables?.couponCode || 'WELCOME10';
    return {
      status: 200,
      data: {
        applyCouponToCart: {
          cart: {
            applied_coupons: [{ code: couponCode }],
            prices: {
              grand_total: { value: 45.0, currency: 'USD' },
              discounts: [{ amount: { value: 5.0 }, label: `Discount (${couponCode})` }]
            }
          }
        }
      }
    };
  }

  // 7. setPaymentMethodOnCart
  if (queryStr.includes('setPaymentMethodOnCart')) {
    const code = variables?.paymentMethod || 'checkmo';
    return {
      status: 200,
      data: {
        setPaymentMethodOnCart: {
          cart: {
            selected_payment_method: {
              code,
              title: code === 'checkmo' ? 'Check / Money Order' : 'Credit / Debit Card'
            }
          }
        }
      }
    };
  }

  // 8. placeOrder
  if (queryStr.includes('placeOrder')) {
    orderCounter += 1;
    const orderNum = '0000' + orderCounter;
    return {
      status: 200,
      data: {
        placeOrder: {
          order: {
            order_number: orderNum
          }
        }
      }
    };
  }

  return {
    status: 200,
    data: {
      message: 'GraphQL operation executed successfully'
    }
  };
}

export async function handleMockMagentoGraphQL(req: Request, res: Response) {
  const { query, variables } = req.body || {};
  const queryStr = typeof query === 'string' ? query : '';
  const result = await executeMockGraphQL(queryStr, variables);
  return res.status(result.status).json(result);
}
