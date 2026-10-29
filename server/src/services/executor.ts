import { performance } from 'perf_hooks';
import { Database } from '../storage/db';
import { executeMockGraphQL } from './mockMagento';
import {
  FlowStepConfig,
  ExecutionContext,
  FlowExecutionResponse,
  StepExecutionResult,
  EnvironmentSettings,
  TestResult,
  GlobalTestConfig,
  CustomValidation,
  Variant,
  ExecutionStatus
} from '../types';

export function resolveJsonPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const cleanPath = path
    .trim()
    .replace(/^res\./, '')
    .replace(/^data\./, '')
    .replace(/\[(\w+)\]/g, '.$1'); // Support array index notation: items[0] -> items.0
  const parts = cleanPath.split('.').filter(Boolean);

  // 1. Direct path search
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      current = undefined;
      break;
    }
    current = current[part];
  }
  if (current !== undefined) return current;

  // 2. Fallback: If path omitted the GraphQL root operation name (e.g. 'cart.items[0].id' instead of 'addProductsToCart.cart.items[0].id')
  if (typeof obj === 'object' && obj !== null && parts.length > 0) {
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        let sub = obj[key];
        for (const part of parts) {
          if (sub === null || sub === undefined) {
            sub = undefined;
            break;
          }
          sub = sub[part];
        }
        if (sub !== undefined) return sub;
      }
    }
  }

  return undefined;
}

function interpolateString(template: string, vars: Record<string, any>): string {
  if (!template) return '';
  return template.replace(/\{\{([^{}]+)\}\}/g, (match, key) => {
    const trimmed = key.trim();
    if (vars[trimmed] !== undefined && vars[trimmed] !== null) {
      return String(vars[trimmed]);
    }
    // Case-insensitive fallback
    const lowerKey = trimmed.toLowerCase();
    for (const [k, v] of Object.entries(vars)) {
      if (k.toLowerCase() === lowerKey && v !== undefined && v !== null) {
        return String(v);
      }
    }
    return match;
  });
}

function interpolateVariables(varsObj: any, contextVars: Record<string, any>): any {
  if (!varsObj) return varsObj;
  try {
    const stringified = JSON.stringify(varsObj);
    const replaced = interpolateString(stringified, contextVars);
    return JSON.parse(replaced);
  } catch {
    return varsObj;
  }
}

export class FlowExecutionService {
  /**
   * Ejecuta validaciones globales y personalizadas
   */
  private static evaluateTests(
    globalTests: GlobalTestConfig[],
    customValidations: CustomValidation[] | undefined,
    status: number,
    durationMs: number,
    responseData: any,
    responseErrors: any[] | undefined,
    rawResponseBody: string,
    contextVars?: Record<string, any>
  ): TestResult[] {
    const results: TestResult[] = [];

    // 1. Pruebas Globales
    for (const gt of globalTests) {
      if (!gt.enabled) continue;

      let passed = false;
      let message = '';
      let actual: any = undefined;
      let expected: any = undefined;

      switch (gt.type) {
        case 'STATUS_CODE_200':
          passed = status === 200;
          actual = status;
          expected = 200;
          message = passed ? 'Código HTTP es 200 OK' : `Esperado 200, recibido HTTP ${status}`;
          break;

        case 'NO_GRAPHQL_ERRORS':
          passed = !responseErrors || responseErrors.length === 0;
          actual = responseErrors ? `${responseErrors.length} errores` : '0 errores';
          expected = 'Sin errores';
          message = passed
            ? 'Respuesta sin errores GraphQL'
            : `Contiene ${responseErrors?.length} error(es): ${responseErrors?.[0]?.message || ''}`;
          break;

        case 'MAX_RESPONSE_TIME':
          const threshold = gt.threshold || 2000;
          passed = durationMs <= threshold;
          actual = `${durationMs} ms`;
          expected = `<= ${threshold} ms`;
          message = passed
            ? `Latencia ${durationMs}ms dentro del límite (${threshold}ms)`
            : `Latencia ${durationMs}ms superó el límite de ${threshold}ms`;
          break;

        case 'HAS_DATA':
          passed = responseData !== null && responseData !== undefined && Object.keys(responseData).length > 0;
          actual = responseData ? 'Presente' : 'Vacío o Nulo';
          expected = 'Presente';
          message = passed ? 'Cuerpo data presente' : 'El campo data está ausente o vacío';
          break;

        case 'JSON_CONTENT_TYPE':
          passed = true; // Si llegó aquí, fue parseado correctamente como JSON
          actual = 'application/json';
          expected = 'application/json';
          message = 'Respuesta es un JSON válido';
          break;
      }

      results.push({
        id: gt.id,
        name: gt.name,
        source: 'GLOBAL',
        passed,
        message,
        actual,
        expected
      });
    }

    // 2. Validaciones Personalizadas de la Variante
    if (customValidations && Array.isArray(customValidations)) {
      for (const cv of customValidations) {
        if (!cv.enabled) continue;

        let passed = false;
        let message = '';
        let actual: any = undefined;
        let expected: any = cv.expectedValue;

        switch (cv.type) {
          case 'STATUS_CODE':
            const expStatus = Number(cv.expectedValue || 200);
            passed = status === expStatus;
            actual = status;
            expected = expStatus;
            message = passed
              ? `${cv.name}: Status HTTP ${status}`
              : `${cv.name}: Esperado ${expStatus}, recibido ${status}`;
            break;

          case 'NO_GRAPHQL_ERRORS':
            passed = !responseErrors || responseErrors.length === 0;
            actual = responseErrors ? `${responseErrors.length} errores` : '0 errores';
            message = passed ? `${cv.name}: Sin errores` : `${cv.name}: Errores presentes`;
            break;

          case 'RESPONSE_TIME_UNDER':
            const maxMs = Number(cv.expectedValue || 1000);
            passed = durationMs < maxMs;
            actual = `${durationMs} ms`;
            expected = `< ${maxMs} ms`;
            message = passed
              ? `${cv.name}: ${durationMs}ms < ${maxMs}ms`
              : `${cv.name}: ${durationMs}ms superó ${maxMs}ms`;
            break;

          case 'JSON_PATH_EXISTS':
            if (cv.targetPath) {
              const val = resolveJsonPath(responseData, cv.targetPath);
              passed = val !== undefined && val !== null;
              actual = passed ? (typeof val === 'object' ? JSON.stringify(val) : String(val)) : 'no encontrado';
              expected = 'Existe y no nulo';
              const displayVal = actual.length > 40 ? actual.substring(0, 40) + '...' : actual;
              message = passed
                ? `${cv.name}: [${cv.targetPath}] existe (${displayVal})`
                : `${cv.name}: [${cv.targetPath}] no existe o es nulo`;
            }
            break;

          case 'JSON_PATH_EQUALS':
            if (cv.targetPath) {
              const val = resolveJsonPath(responseData, cv.targetPath);
              actual = val !== undefined && val !== null ? (typeof val === 'object' ? JSON.stringify(val) : String(val)) : 'no encontrado';
              const expectedInterpolated = contextVars ? interpolateString(cv.expectedValue || '', contextVars) : cv.expectedValue || '';
              passed = String(val ?? '').trim() === String(expectedInterpolated).trim();
              expected = expectedInterpolated;
              message = passed
                ? `${cv.name}: [${cv.targetPath}] coincide con "${expectedInterpolated}"`
                : `${cv.name}: [${cv.targetPath}] = "${actual}", esperado "${expectedInterpolated}"`;
            }
            break;

          case 'JSON_PATH_NOT_EMPTY':
            if (cv.targetPath) {
              const val = resolveJsonPath(responseData, cv.targetPath);
              const isArray = Array.isArray(val);
              const isObject = typeof val === 'object' && val !== null && !isArray;
              const isEmpty =
                val === undefined ||
                val === null ||
                (typeof val === 'string' && val.trim() === '') ||
                (isArray && val.length === 0) ||
                (isObject && Object.keys(val).length === 0);
              passed = !isEmpty;
              actual = passed ? (typeof val === 'object' ? JSON.stringify(val) : String(val)) : 'vacío o no encontrado';
              expected = 'No vacío';
              message = passed
                ? `${cv.name}: [${cv.targetPath}] tiene valor`
                : `${cv.name}: [${cv.targetPath}] está vacío o no existe`;
            }
            break;

          case 'CONTAINS_STRING':
            if (cv.expectedValue) {
              passed = rawResponseBody.includes(cv.expectedValue);
              message = passed
                ? `${cv.name}: Texto "${cv.expectedValue}" encontrado`
                : `${cv.name}: Texto "${cv.expectedValue}" no encontrado`;
            }
            break;
        }

        results.push({
          id: cv.id,
          name: cv.name || 'Validación',
          source: 'CUSTOM',
          passed,
          message,
          actual,
          expected
        });
      }
    }

    return results;
  }

  /**
   * Ejecuta un paso individual preservando y mutando el ExecutionContext
   */
  static async executeStepInternal(
    step: FlowStepConfig,
    context: ExecutionContext,
    settings: EnvironmentSettings
  ): Promise<{ stepResult: StepExecutionResult; hasError: boolean; errorMessage?: string }> {
    if (step.skipped || !step.variantId) {
      return {
        stepResult: {
          stepId: step.id,
          category: step.category,
          variantId: step.variantId || 'skipped',
          variantName: 'Paso omitido',
          durationMs: 0,
          status: 200,
          skipped: true,
          testResults: []
        },
        hasError: false
      };
    }

    let variant = step.variantId ? Database.getVariantById(step.variantId) : null;
    if (!variant) {
      if (step.query || step.endpoint || step.body) {
        variant = {
          id: step.variantId || 'ad-hoc-variant',
          name: 'Petición en Tiempo Real',
          category: step.category || 'Tester',
          query: step.query || '',
          endpoint: step.endpoint || '',
          body: step.body || '',
          method: step.method || 'POST',
          apiType: step.apiType || 'GRAPHQL',
          defaultVariables: step.overrideVariables || {},
          variables: {},
          contextOutputs: [],
          customValidations: step.customValidations || [],
          customHeaders: step.customHeaders || {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      } else {
        const err = `Variante no encontrada: ${step.variantId}`;
        return {
          stepResult: {
            stepId: step.id,
            category: step.category,
            variantId: step.variantId,
            variantName: 'Desconocida',
            durationMs: 0,
            status: 404,
            errors: [{ message: err }],
            testResults: [
              {
                id: 'err-404',
                name: 'Variante encontrada',
                source: 'GLOBAL',
                passed: false,
                message: err
              }
            ]
          },
          hasError: true,
          errorMessage: err
        };
      }
    }

    // 0. Resolver si la variante o el paso tienen un Environment específico asignado
    const targetEnvId = step.environmentId !== undefined ? step.environmentId : variant.environmentId;
    const globalSettings = Database.getSettings();
    const activeEnvId = targetEnvId || settings.activeEnvironmentId || globalSettings.activeEnvironmentId;
    const activeEnv = activeEnvId ? Database.getEnvironmentById(activeEnvId) : null;

    let effectiveSettings: EnvironmentSettings = { ...globalSettings, ...settings };
    if (activeEnv) {
      effectiveSettings = {
        ...effectiveSettings,
        activeEnvironmentId: activeEnv.id,
        magentoUrl: activeEnv.magentoUrl || effectiveSettings.magentoUrl,
        magentoRestUrl: activeEnv.magentoRestUrl || effectiveSettings.magentoRestUrl,
        useMockSimulator: activeEnv.useMockSimulator !== undefined ? activeEnv.useMockSimulator : effectiveSettings.useMockSimulator,
        variables: { ...(activeEnv.variables || {}), ...(effectiveSettings.variables || {}) },
        customHeaders: { ...(activeEnv.customHeaders || {}), ...(effectiveSettings.customHeaders || {}) }
      };
    }

    // 1. Obtener variables del Environment efectivo
    const envVars: Record<string, any> = {
      ...(activeEnv?.variables || {}),
      ...(effectiveSettings.variables || {})
    };

    // 2. Resolver valores unificados de variables clave buscando en contexto y environment
    const findVarValue = (...keys: string[]): string => {
      // 1. Priorizar contexto de ejecución
      for (const k of keys) {
        if (context[k as keyof ExecutionContext]) {
          return String(context[k as keyof ExecutionContext]);
        }
        if (context.variables && context.variables[k]) {
          return String(context.variables[k]);
        }
      }
      // 2. Buscar en variables del Environment efectivo
      for (const k of keys) {
        if (envVars[k]) return String(envVars[k]);
      }
      // 3. Búsqueda insensible a mayúsculas/minúsculas en envVars
      for (const target of keys) {
        const lower = target.toLowerCase().replace(/[-_]/g, '');
        for (const [ek, ev] of Object.entries(envVars)) {
          if (ek.toLowerCase().replace(/[-_]/g, '') === lower && ev) {
            return String(ev);
          }
        }
      }
      return '';
    };

    const resolvedCartId = findVarValue('cartId', 'CartId', 'cart_id');
    const resolvedToken = findVarValue('customerToken', 'token', 'customer_token', 'AuthToken', 'authToken');
    const resolvedOrderNumber = findVarValue('orderNumber', 'order_number');

    // Poblar en context si venían vacíos pero existen en el environment
    if (!context.cartId && resolvedCartId) context.cartId = resolvedCartId;
    if (!context.token && resolvedToken) context.token = resolvedToken;
    if (!context.orderNumber && resolvedOrderNumber) context.orderNumber = resolvedOrderNumber;

    // 3. Mezclar con variables del ExecutionContext y armonizar variantes de nombres
    const allContextVars: Record<string, any> = {
      ...envVars,
      ...(context.variables || {})
    };

    if (resolvedCartId) {
      allContextVars.CartId = resolvedCartId;
      allContextVars.cartId = resolvedCartId;
      allContextVars.cart_id = resolvedCartId;
    }
    if (resolvedToken) {
      allContextVars.token = resolvedToken;
      allContextVars.customerToken = resolvedToken;
      allContextVars.customer_token = resolvedToken;
      allContextVars.AuthToken = resolvedToken;
    }
    if (resolvedOrderNumber) {
      allContextVars.orderNumber = resolvedOrderNumber;
      allContextVars.order_number = resolvedOrderNumber;
    }

    // 4. Sobreescritura de variables del environment definida en la variante
    if (variant.environmentOverrides && typeof variant.environmentOverrides === 'object') {
      for (const [ovKey, ovVal] of Object.entries(variant.environmentOverrides)) {
        if (ovVal !== undefined && ovVal !== null && ovVal !== '') {
          allContextVars[ovKey] = ovVal;
        }
      }
    }

    // 5. Variables de la variante + override variables del paso
    const rawVariables: Record<string, any> = {
      ...(variant.variables || {}),
      ...(variant.defaultVariables || {}),
      ...(step.overrideVariables || {})
    };

    // 6. Interpolación dinámica {{varName}} en query, variables y headers (admite override de query en tiempo real)
    const effectiveQuery = step.query !== undefined ? step.query : variant.query;
    let processedQuery = interpolateString(effectiveQuery, allContextVars);
    let processedVariables = interpolateVariables(rawVariables, allContextVars);

    // Asegurar compatibilidad para CartId en variables de GraphQL
    if (resolvedCartId) {
      if ('cartId' in processedVariables) processedVariables.cartId = resolvedCartId;
      if ('cart_id' in processedVariables) processedVariables.cart_id = resolvedCartId;
      if ('CartId' in processedVariables) processedVariables.CartId = resolvedCartId;
    }

    // Headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (effectiveSettings.customHeaders && typeof effectiveSettings.customHeaders === 'object') {
      for (const [key, value] of Object.entries(effectiveSettings.customHeaders)) {
        if (value !== undefined && value !== null) {
          headers[key] = interpolateString(String(value), allContextVars);
        }
      }
    }

    // Inyectar Authorization Bearer token si está disponible
    if (resolvedToken) {
      headers['Authorization'] = `Bearer ${resolvedToken}`;
    }

    // Cabeceras específicas de la variante y sobrescrituras en tiempo real
    const mergedCustomHeaders = {
      ...(variant.customHeaders || {}),
      ...(step.customHeaders || {})
    };
    for (const [key, value] of Object.entries(mergedCustomHeaders)) {
      if (value !== undefined && value !== null) {
        headers[key] = interpolateString(String(value), allContextVars);
      }
    }

    // Determinar si es REST API o GraphQL
    const isRest = (step.apiType || variant.apiType) === 'REST';
    const restMethod = ((step.method || variant.method) || 'POST').toUpperCase();
    const effectiveEndpoint = step.endpoint !== undefined ? step.endpoint : variant.endpoint;

    // Determinar URL de destino según API (GraphQL vs REST) y el environment activo/asignado
    const baseApiUrl = isRest
      ? (effectiveSettings.magentoRestUrl || effectiveSettings.magentoUrl)
      : effectiveSettings.magentoUrl;

    let targetUrl = baseApiUrl;
    if (isRest && effectiveEndpoint) {
      let interpolatedEndpoint = interpolateString(effectiveEndpoint.trim(), allContextVars);
      if (/^https?:\/\//i.test(interpolatedEndpoint)) {
        targetUrl = interpolatedEndpoint;
      } else {
        const baseUrl = baseApiUrl.replace(/\/graphql\/?$/i, '').replace(/\/+$/, '');
        if (!interpolatedEndpoint.startsWith('/')) {
          interpolatedEndpoint = '/' + interpolatedEndpoint;
        }
        targetUrl = baseUrl + interpolatedEndpoint;
      }
    }

    // Preparar Body para REST
    let processedBody: string | undefined = undefined;
    if (isRest) {
      if (restMethod !== 'GET' && restMethod !== 'HEAD') {
        const rawBodyText = step.body !== undefined ? step.body : (variant.body || variant.query || '');
        processedBody = interpolateString(rawBodyText, allContextVars);
      }
    }

    const requestPayload = {
      url: targetUrl,
      method: isRest ? restMethod : 'POST',
      query: isRest ? undefined : processedQuery,
      body: isRest ? processedBody : undefined,
      variables: isRest ? undefined : processedVariables,
      headers
    };

    const stepStart = performance.now();
    let status = 200;
    let responseData: any = null;
    let responseErrors: any[] | undefined = undefined;
    let rawResponseBody = '';

    const isMockMode =
      effectiveSettings.useMockSimulator ||
      !targetUrl ||
      targetUrl.includes('/api/mock/');

    try {
      if (isMockMode) {
        if (isRest) {
          status = 200;
          responseData = { message: 'Mock REST response', endpoint: targetUrl, method: restMethod };
          rawResponseBody = JSON.stringify(responseData);
        } else {
          const mockRes = await executeMockGraphQL(processedQuery, processedVariables);
          status = mockRes.status;
          responseData = mockRes.data;
          responseErrors = mockRes.errors;
          rawResponseBody = JSON.stringify(mockRes);
        }
      } else {
        const fetchOptions: RequestInit = {
          method: isRest ? restMethod : 'POST',
          headers,
          body: isRest
            ? (restMethod !== 'GET' && restMethod !== 'HEAD' ? (processedBody || '{}') : undefined)
            : JSON.stringify({
                query: processedQuery,
                variables: processedVariables
              })
        };

        const response = await fetch(targetUrl, fetchOptions);

        status = response.status;
        const text = await response.text();
        rawResponseBody = text;

        try {
          const json = JSON.parse(text);
          if (!response.ok) {
            responseErrors = [
              { message: `HTTP Error ${response.status}: ${response.statusText}`, detail: json }
            ];
          } else if (!isRest && json && json.errors && json.errors.length > 0) {
            responseErrors = json.errors;
          } else {
            responseData = isRest ? json : (json ? json.data : null);
          }
        } catch {
          if (!response.ok) {
            responseErrors = [{ message: `HTTP Error ${response.status}: ${text}` }];
          } else {
            responseData = text;
          }
        }
      }
    } catch (err: any) {
      status = 500;
      const cause = err?.cause ? (err.cause.message || err.cause.code || String(err.cause)) : '';
      const detailedMessage = cause ? `${err.message} (${cause})` : (err.message || 'Error de conexión');
      responseErrors = [{ message: detailedMessage }];
      rawResponseBody = JSON.stringify({ error: detailedMessage });
    }

    const durationMs = Math.round(performance.now() - stepStart);
    const extractedVariables: Record<string, any> = {};

    // Extracción de datos hacia variables y context
    if (responseData) {
      const effectiveMapping = step.contextMapping || variant.contextMapping;
      const envIdToUpdate =
        effectiveSettings.activeEnvironmentId ||
        settings.activeEnvironmentId ||
        Database.getSettings().activeEnvironmentId ||
        Database.getEnvironments()[0]?.id;

      // 1. Mapeo Explícito definido en la variante o el paso
      if (effectiveMapping && typeof effectiveMapping === 'object') {
        for (const [targetKey, jsonPath] of Object.entries(effectiveMapping)) {
          const extracted = resolveJsonPath(responseData, jsonPath);
          if (extracted !== undefined && extracted !== null) {
            extractedVariables[targetKey] = extracted;
            context.variables[targetKey] = extracted;

            const lower = targetKey.toLowerCase().replace(/[-_]/g, '');
            if (lower === 'cartid') {
              context.cartId = String(extracted);
              context.logs.push(`cartId: ${context.cartId}`);
            } else if (lower === 'token' || lower === 'customertoken') {
              context.token = String(extracted);
              context.logs.push(`token extraído`);
            } else if (lower === 'ordernumber') {
              context.orderNumber = String(extracted);
              context.logs.push(`order: ${context.orderNumber}`);
            }

            // Actualizar en el entorno efectivo (persistido en DB)
            if (envIdToUpdate) {
              Database.updateEnvironmentVariable(envIdToUpdate, targetKey, String(extracted));
            }
          }
        }
      }

      // 2. Extractor Heurístico por defecto para cartId (Crear Carrito, customerCart, cart.id)
      let newlyExtractedCartId: string | null = null;
      if (typeof responseData.createEmptyCart === 'string') {
        newlyExtractedCartId = responseData.createEmptyCart;
      } else if (responseData.customerCart?.id) {
        newlyExtractedCartId = String(responseData.customerCart.id);
      } else if (responseData.cart?.id) {
        newlyExtractedCartId = String(responseData.cart.id);
      }

      if (newlyExtractedCartId) {
        context.cartId = newlyExtractedCartId;
        extractedVariables.CartId = newlyExtractedCartId;
        extractedVariables.cartId = newlyExtractedCartId;
        context.variables.CartId = newlyExtractedCartId;
        context.variables.cartId = newlyExtractedCartId;
        if (envIdToUpdate) {
          Database.updateEnvironmentVariable(envIdToUpdate, 'CartId', newlyExtractedCartId);
          Database.updateEnvironmentVariable(envIdToUpdate, 'cartId', newlyExtractedCartId);
        }
      }

      // 3. Extractor Heurístico por defecto para token (generateCustomerToken)
      let newlyExtractedToken: string | null = null;
      if (responseData.generateCustomerToken?.token) {
        newlyExtractedToken = String(responseData.generateCustomerToken.token);
      } else if (typeof responseData.token === 'string') {
        newlyExtractedToken = responseData.token;
      }

      if (newlyExtractedToken) {
        context.token = newlyExtractedToken;
        extractedVariables.customerToken = newlyExtractedToken;
        extractedVariables.token = newlyExtractedToken;
        context.variables.customerToken = newlyExtractedToken;
        context.variables.token = newlyExtractedToken;
        if (envIdToUpdate) {
          Database.updateEnvironmentVariable(envIdToUpdate, 'customerToken', newlyExtractedToken);
          Database.updateEnvironmentVariable(envIdToUpdate, 'token', newlyExtractedToken);
        }
      }

      // 4. Extractor Heurístico por defecto para orderNumber (placeOrder)
      let newlyExtractedOrderNumber: string | null = null;
      if (responseData.placeOrder?.order?.order_number) {
        newlyExtractedOrderNumber = String(responseData.placeOrder.order.order_number);
      } else if (responseData.placeOrder?.order_number) {
        newlyExtractedOrderNumber = String(responseData.placeOrder.order_number);
      } else if (responseData.order?.order_number) {
        newlyExtractedOrderNumber = String(responseData.order.order_number);
      }

      if (newlyExtractedOrderNumber) {
        context.orderNumber = newlyExtractedOrderNumber;
        extractedVariables.orderNumber = newlyExtractedOrderNumber;
        context.variables.orderNumber = newlyExtractedOrderNumber;
        if (envIdToUpdate) {
          Database.updateEnvironmentVariable(envIdToUpdate, 'orderNumber', newlyExtractedOrderNumber);
        }
      }

      // 5. Soporte para contextOutputs declarados
      if (variant.contextOutputs && Array.isArray(variant.contextOutputs)) {
        for (const outKey of variant.contextOutputs) {
          if (!extractedVariables[outKey] && responseData[outKey] !== undefined) {
            const val = String(responseData[outKey]);
            extractedVariables[outKey] = val;
            context.variables[outKey] = val;
            if (envIdToUpdate) {
              Database.updateEnvironmentVariable(envIdToUpdate, outKey, val);
            }
          }
        }
      }
    }

    // Evaluación de Pruebas Globales y Personalizadas (Requirement 3 & 4)
    const globalTests = Database.getGlobalTests();
    const effectiveValidations = step.customValidations !== undefined ? step.customValidations : variant.customValidations;
    const testResults = this.evaluateTests(
      globalTests,
      effectiveValidations,
      status,
      durationMs,
      responseData,
      responseErrors,
      rawResponseBody,
      {
        ...context.variables,
        cartId: context.cartId,
        CartId: context.cartId,
        orderNumber: context.orderNumber,
        customerToken: context.token
      }
    );

    const hasFailedTests = testResults.some(t => !t.passed);
    const hasError = !!(responseErrors && responseErrors.length > 0) || status >= 400 || hasFailedTests;
    const errorMessage = responseErrors
      ? responseErrors.map((e: any) => e.message).join(' | ')
      : hasFailedTests
      ? `Fallaron pruebas de validación: ${testResults.filter(t => !t.passed).map(t => t.name).join(', ')}`
      : undefined;

    const stepResult: StepExecutionResult = {
      stepId: step.id,
      category: step.category,
      variantId: variant.id,
      variantName: variant.name,
      durationMs,
      status,
      requestPayload,
      responsePreview: responseData || responseErrors,
      errors: responseErrors,
      testResults,
      extractedVariables
    };

    return { stepResult, hasError, errorMessage };
  }

  /**
   * Ejecuta un paso individual y registra la ejecución en el historial de métricas
   */
  static async executeSingleStep(
    step: FlowStepConfig,
    currentContext?: Partial<ExecutionContext>,
    customSettings?: Partial<EnvironmentSettings>,
    recordHistory: boolean = true
  ): Promise<{
    stepResult: StepExecutionResult;
    updatedContext: ExecutionContext;
    status: ExecutionStatus;
  }> {
    const storedSettings = Database.getSettings();
    const settings: EnvironmentSettings = { ...storedSettings, ...customSettings };

    const context: ExecutionContext = {
      cartId: currentContext?.cartId || null,
      token: currentContext?.token || null,
      orderNumber: currentContext?.orderNumber || null,
      variables: currentContext?.variables || {},
      logs: currentContext?.logs || []
    };

    const { stepResult, hasError, errorMessage } = await this.executeStepInternal(step, context, settings);

    const testsPassed = stepResult.testResults?.filter(t => t.passed).length || 0;
    const testsFailed = stepResult.testResults?.filter(t => !t.passed).length || 0;
    const singleStatus: ExecutionStatus = hasError ? 'FAILED' : testsFailed > 0 ? 'TESTS_FAILED' : 'SUCCESS';

    if (recordHistory) {
      // Registrar en Historial como petición individual (Requirement 6)
      const activeEnv = settings.activeEnvironmentId
        ? Database.getEnvironmentById(settings.activeEnvironmentId)
        : null;

      const historyRecord: FlowExecutionResponse = {
        id: 'run-single-' + Date.now().toString(36),
        executionType: 'SINGLE',
        targetName: stepResult.variantName,
        environmentName: activeEnv?.name || 'Por defecto',
        status: singleStatus,
        orderNumber: context.orderNumber,
        totalTimeMs: stepResult.durationMs,
        failedAtCategory: hasError ? step.category : null,
        errorMessage,
        steps: [stepResult],
        totalTestsPassed: testsPassed,
        totalTestsFailed: testsFailed,
        createdAt: new Date().toISOString()
      };

      Database.addHistoryEntry(historyRecord);
    }

    return {
      stepResult,
      updatedContext: context,
      status: singleStatus
    };
  }

  /**
   * Registra un flujo completado en el historial unificado (executionType: FLOW)
   */
  static recordCompletedFlow(data: {
    flowName: string;
    status: ExecutionStatus;
    orderNumber?: string | null;
    totalTimeMs: number;
    failedAtCategory?: string | null;
    errorMessage?: string;
    steps: StepExecutionResult[];
    customSettings?: Partial<EnvironmentSettings>;
  }): FlowExecutionResponse {
    const storedSettings = Database.getSettings();
    const settings: EnvironmentSettings = { ...storedSettings, ...data.customSettings };
    const activeEnv = settings.activeEnvironmentId
      ? Database.getEnvironmentById(settings.activeEnvironmentId)
      : null;

    let totalTestsPassed = 0;
    let totalTestsFailed = 0;
    for (const sr of data.steps) {
      if (sr.testResults) {
        totalTestsPassed += sr.testResults.filter(t => t.passed).length;
        totalTestsFailed += sr.testResults.filter(t => !t.passed).length;
      }
    }

    const effectiveStatus: ExecutionStatus =
      data.status === 'FAILED'
        ? 'FAILED'
        : totalTestsFailed > 0
        ? 'TESTS_FAILED'
        : 'SUCCESS';

    const flowRecord: FlowExecutionResponse = {
      id: 'run-flow-' + Date.now().toString(36),
      executionType: 'FLOW',
      targetName: data.flowName || 'Flujo Dinámico',
      environmentName: activeEnv?.name || 'Por defecto',
      status: effectiveStatus,
      orderNumber: data.orderNumber || null,
      totalTimeMs: data.totalTimeMs,
      failedAtCategory: data.failedAtCategory || null,
      errorMessage: data.errorMessage,
      steps: data.steps,
      totalTestsPassed,
      totalTestsFailed,
      createdAt: new Date().toISOString()
    };

    Database.addHistoryEntry(flowRecord);
    return flowRecord;
  }

  /**
   * Ejecuta un flujo completo y registra la ejecución en el historial de métricas
   */
  static async executeFlow(
    steps: FlowStepConfig[],
    flowName: string = 'Flujo Dinámico',
    customSettings?: Partial<EnvironmentSettings>
  ): Promise<FlowExecutionResponse> {
    const overallStart = performance.now();
    const storedSettings = Database.getSettings();
    const settings: EnvironmentSettings = { ...storedSettings, ...customSettings };

    const activeEnv = settings.activeEnvironmentId
      ? Database.getEnvironmentById(settings.activeEnvironmentId)
      : null;

    const context: ExecutionContext = {
      cartId: null,
      token: null,
      orderNumber: null,
      variables: {},
      logs: []
    };

    const stepResults: StepExecutionResult[] = [];
    let failedAtStepId: string | null = null;
    let failedAtCategory: string | null = null;
    let errorMessage: string | undefined = undefined;

    for (const step of steps) {
      const { stepResult, hasError, errorMessage: stepErr } = await this.executeStepInternal(
        step,
        context,
        settings
      );

      stepResults.push(stepResult);

      if (hasError) {
        failedAtStepId = step.id;
        failedAtCategory = step.category;
        errorMessage = stepErr;
        break;
      }
    }

    const totalTimeMs = Math.round(performance.now() - overallStart);

    let totalTestsPassed = 0;
    let totalTestsFailed = 0;
    for (const sr of stepResults) {
      if (sr.testResults) {
        totalTestsPassed += sr.testResults.filter(t => t.passed).length;
        totalTestsFailed += sr.testResults.filter(t => !t.passed).length;
      }
    }

    const finalStatus: ExecutionStatus = failedAtStepId
      ? 'FAILED'
      : totalTestsFailed > 0
      ? 'TESTS_FAILED'
      : 'SUCCESS';

    const result: FlowExecutionResponse = {
      id: 'run-flow-' + Date.now().toString(36),
      executionType: 'FLOW',
      targetName: flowName,
      environmentName: activeEnv?.name || 'Por defecto',
      status: finalStatus,
      orderNumber: context.orderNumber,
      totalTimeMs,
      failedAtStepId,
      failedAtCategory,
      errorMessage,
      steps: stepResults,
      totalTestsPassed,
      totalTestsFailed,
      createdAt: new Date().toISOString()
    };

    Database.addHistoryEntry(result);
    return result;
  }
}
