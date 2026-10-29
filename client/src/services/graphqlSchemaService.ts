import {
  GraphQLSchema,
  buildClientSchema,
  parse,
  validate,
  IntrospectionQuery,
  isInputObjectType,
  isObjectType,
  isNonNullType,
  isListType,
  GraphQLType,
  GraphQLNamedType,
  GraphQLInputObjectType
} from 'graphql';
import { api } from '../api';

export interface ValidationDiagnostic {
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
  source: 'syntax' | 'schema' | 'variable';
}

export interface InputFieldInfo {
  name: string;
  typeString: string;
  required: boolean;
  isList: boolean;
  description?: string;
  defaultValue?: any;
}

export interface VariableDefDetail {
  name: string;
  typeString: string;
  required: boolean;
  isList: boolean;
  typeName: string;
  schemaInputFields?: InputFieldInfo[];
}

export interface InputFieldDoc {
  name: string;
  typeString: string;
  required: boolean;
  isList: boolean;
  description?: string;
  defaultValue?: any;
  nestedTypeName?: string;
  nestedFields?: InputFieldDoc[];
}

export interface OperationInputDoc {
  functionName?: string;
  variableName: string;
  typeName: string;
  typeString: string;
  required: boolean;
  isList: boolean;
  description?: string;
  fields: InputFieldDoc[];
}

export interface OperationValidationResult {
  valid: boolean;
  hasSchema: boolean;
  diagnostics: ValidationDiagnostic[];
  variableDefinitions: VariableDefDetail[];
}

// Global cached schema state
let currentSchema: GraphQLSchema | null = null;
let currentSchemaUrl: string = '';
let currentSchemaTypesCount: number = 0;
let lastSyncTime: string = '';

function getBaseNamedType(type: GraphQLType): GraphQLNamedType {
  let curr = type;
  while (isNonNullType(curr) || isListType(curr)) {
    curr = curr.ofType;
  }
  return curr as GraphQLNamedType;
}

function formatTypeString(type: GraphQLType): string {
  if (isNonNullType(type)) {
    return `${formatTypeString(type.ofType)}!`;
  }
  if (isListType(type)) {
    return `[${formatTypeString(type.ofType)}]`;
  }
  return (type as GraphQLNamedType).name;
}

export const GraphQLSchemaService = {
  /**
   * Obtiene el Schema en memoria
   */
  getSchema(): GraphQLSchema | null {
    return currentSchema;
  },

  getSchemaInfo() {
    return {
      hasSchema: currentSchema !== null,
      typesCount: currentSchemaTypesCount,
      url: currentSchemaUrl,
      lastSync: lastSyncTime
    };
  },

  /**
   * Sincroniza el Schema desde el servidor / entorno
   */
  async syncSchema(environmentId?: string, force: boolean = false): Promise<{
    success: boolean;
    typesCount: number;
    error?: string;
    sourceUrl?: string;
  }> {
    try {
      const res = await api.getActiveSchema(environmentId, force);
      if (res.success && res.schema && res.schema.__schema) {
        currentSchema = buildClientSchema(res.schema as IntrospectionQuery);
        currentSchemaTypesCount = res.typesCount || (res.schema.__schema.types ? res.schema.__schema.types.length : 0);
        currentSchemaUrl = res.sourceUrl || '';
        lastSyncTime = res.fetchedAt || new Date().toISOString();

        // Guardar en caché local para persistencia rápida
        try {
          const cacheKey = `gql_schema_${environmentId || 'default'}`;
          localStorage.setItem(cacheKey, JSON.stringify({
            schema: res.schema,
            typesCount: currentSchemaTypesCount,
            sourceUrl: currentSchemaUrl,
            lastSync: lastSyncTime
          }));
        } catch {
          // Ignorar cuota de localStorage si el esquema es muy grande
        }

        return {
          success: true,
          typesCount: currentSchemaTypesCount,
          sourceUrl: currentSchemaUrl
        };
      } else {
        return {
          success: false,
          typesCount: 0,
          error: res.error || 'No se pudo obtener el esquema de introspección'
        };
      }
    } catch (err: any) {
      return {
        success: false,
        typesCount: 0,
        error: err.message || 'Error de red al consultar el esquema'
      };
    }
  },

  /**
   * Carga el esquema desde el almacenamiento local si existe
   */
  loadFromLocalCache(environmentId?: string): boolean {
    if (currentSchema) return true;
    try {
      const cacheKey = `gql_schema_${environmentId || 'default'}`;
      const saved = localStorage.getItem(cacheKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.schema && parsed.schema.__schema) {
          currentSchema = buildClientSchema(parsed.schema as IntrospectionQuery);
          currentSchemaTypesCount = parsed.typesCount || 0;
          currentSchemaUrl = parsed.sourceUrl || '';
          lastSyncTime = parsed.lastSync || '';
          return true;
        }
      }
    } catch {
      // Ignorar errores de parseo
    }
    return false;
  },

  /**
   * Valida la Operación GraphQL y sus Variables JSON contra la estructura y el tipado
   */
  validateOperation(query: string, variablesStr: string): OperationValidationResult {
    const diagnostics: ValidationDiagnostic[] = [];
    const variableDefinitions: VariableDefDetail[] = [];

    if (!query || !query.trim()) {
      return {
        valid: true,
        hasSchema: currentSchema !== null,
        diagnostics: [],
        variableDefinitions: []
      };
    }

    let documentAST: any = null;

    // 1. Validar Sintaxis GraphQL
    try {
      documentAST = parse(query);
    } catch (err: any) {
      const loc = err.locations?.[0];
      diagnostics.push({
        message: err.message.replace(/Syntax Error: GraphQL \(\d+:\d+\) /i, ''),
        line: loc?.line,
        column: loc?.column,
        severity: 'error',
        source: 'syntax'
      });
      return {
        valid: false,
        hasSchema: currentSchema !== null,
        diagnostics,
        variableDefinitions: []
      };
    }

    // 2. Extraer Variable Definitions del AST
    if (documentAST && documentAST.definitions) {
      for (const def of documentAST.definitions) {
        if (def.kind === 'OperationDefinition' && def.variableDefinitions) {
          for (const varDef of def.variableDefinitions) {
            const varName = varDef.variable.name.value;
            const typeStr = formatTypeFromAST(varDef.type);
            const isReq = varDef.type.kind === 'NonNullType';
            const isList = varDef.type.kind === 'ListType' || (isReq && varDef.type.type.kind === 'ListType');
            const rawTypeName = getNamedTypeFromAST(varDef.type);

            let inputFields: InputFieldInfo[] | undefined;
            if (currentSchema) {
              const schemaType = currentSchema.getType(rawTypeName);
              if (schemaType && isInputObjectType(schemaType)) {
                const fields = schemaType.getFields();
                inputFields = Object.values(fields).map(f => ({
                  name: f.name,
                  typeString: formatTypeString(f.type),
                  required: isNonNullType(f.type),
                  isList: isListType(f.type) || (isNonNullType(f.type) && isListType(f.type.ofType)),
                  description: f.description || undefined,
                  defaultValue: f.defaultValue
                }));
              }
            }

            variableDefinitions.push({
              name: varName,
              typeString: typeStr,
              required: isReq,
              isList,
              typeName: rawTypeName,
              schemaInputFields: inputFields
            });
          }
        }
      }
    }

    // 3. Validar contra el Schema si está cargado
    if (currentSchema && documentAST) {
      try {
        const schemaErrors = validate(currentSchema, documentAST);
        for (const err of schemaErrors) {
          const loc = err.locations?.[0];
          diagnostics.push({
            message: err.message,
            line: loc?.line,
            column: loc?.column,
            severity: 'error',
            source: 'schema'
          });
        }
      } catch (err: any) {
        diagnostics.push({
          message: `Error al validar con el esquema: ${err.message}`,
          severity: 'warning',
          source: 'schema'
        });
      }
    }

    // 4. Validar Variables JSON contra las Definiciones y Tipado
    if (variablesStr && variablesStr.trim()) {
      let parsedVars: any = null;
      try {
        const sanitized = variablesStr.replace(/:\s*\{\{([^{}]+)\}\}/g, ': "__TEMPLATE_VAR__"');
        parsedVars = JSON.parse(sanitized);
      } catch (err: any) {
        diagnostics.push({
          message: `Sintaxis JSON inválida en variables: ${err.message}`,
          severity: 'error',
          source: 'variable'
        });
      }

      if (parsedVars && typeof parsedVars === 'object') {
        // A. Revisar variables obligatorias ausentes
        for (const varDef of variableDefinitions) {
          if (varDef.required) {
            const val = parsedVars[varDef.name];
            if (val === undefined || val === null || val === '') {
              diagnostics.push({
                message: `Falta la variable obligatoria "$${varDef.name}" de tipo "${varDef.typeString}".`,
                severity: 'error',
                source: 'variable'
              });
            }
          }
        }

        // B. Revisar si hay variables en el JSON que no están declaradas en la Query
        const declaredNames = new Set(variableDefinitions.map(v => v.name));
        for (const key of Object.keys(parsedVars)) {
          if (!declaredNames.has(key)) {
            diagnostics.push({
              message: `La variable "${key}" está en el JSON pero no está declarada en la operación GraphQL ($${key}).`,
              severity: 'warning',
              source: 'variable'
            });
          }
        }

        // C. Validar tipos de los inputs complejos y escalares
        for (const varDef of variableDefinitions) {
          const val = parsedVars[varDef.name];
          if (val === undefined || val === null || val === '__TEMPLATE_VAR__') continue;

          // Si esperaba lista y no se pasó arreglo
          if (varDef.isList && !Array.isArray(val)) {
            diagnostics.push({
              message: `La variable "$${varDef.name}" debe ser una lista/arreglo [${varDef.typeName}], pero se pasó un valor no-arreglo.`,
              severity: 'error',
              source: 'variable'
            });
            continue;
          }

          // Validación de tipos primitivos escalares a nivel raíz
          if (!varDef.isList && !varDef.schemaInputFields) {
            const rawVal = String(val);
            const isTemplate = rawVal.startsWith('{{') && rawVal.endsWith('}}');
            if (!isTemplate) {
              if ((varDef.typeString.includes('Int') || varDef.typeString.includes('Float')) && typeof val !== 'number') {
                diagnostics.push({
                  message: `La variable "$${varDef.name}" debe ser de tipo numérico (${varDef.typeString}), pero se recibió "${typeof val}".`,
                  severity: 'error',
                  source: 'variable'
                });
              } else if (varDef.typeString.includes('Boolean') && typeof val !== 'boolean') {
                diagnostics.push({
                  message: `La variable "$${varDef.name}" debe ser un booleano (true/false), pero se recibió "${typeof val}".`,
                  severity: 'error',
                  source: 'variable'
                });
              } else if (varDef.typeString.includes('String') && typeof val !== 'string') {
                diagnostics.push({
                  message: `La variable "$${varDef.name}" debe ser de tipo texto (String), pero se recibió "${typeof val}".`,
                  severity: 'error',
                  source: 'variable'
                });
              }
            }
          }

          // Si es un InputObjectType, validar sus campos internos y tipos
          if (varDef.schemaInputFields && varDef.schemaInputFields.length > 0) {
            const itemsToCheck = Array.isArray(val) ? val : [val];
            const allowedFieldsMap = new Map(varDef.schemaInputFields.map(f => [f.name, f]));
            const requiredFields = varDef.schemaInputFields.filter(f => f.required);

            itemsToCheck.forEach((item, idx) => {
              if (item && typeof item === 'object') {
                const prefix = Array.isArray(val) ? `$${varDef.name}[${idx}]` : `$${varDef.name}`;

                // Validar campos requeridos en el input object
                for (const reqField of requiredFields) {
                  if (item[reqField.name] === undefined || item[reqField.name] === null || item[reqField.name] === '') {
                    diagnostics.push({
                      message: `En ${prefix}, falta el campo obligatorio "${reqField.name}" (${reqField.typeString}).`,
                      severity: 'error',
                      source: 'variable'
                    });
                  }
                }

                // Detectar campos desconocidos (datos o keys inválidas) y validar sus tipos
                for (const [k, fieldVal] of Object.entries(item)) {
                  const fieldDef = allowedFieldsMap.get(k);
                  if (!fieldDef) {
                    diagnostics.push({
                      message: `En ${prefix}, el campo "${k}" no existe en el tipo de entrada "${varDef.typeName}".`,
                      severity: 'error',
                      source: 'variable'
                    });
                  } else if (fieldVal !== undefined && fieldVal !== null && fieldVal !== '__TEMPLATE_VAR__') {
                    const rawVal = String(fieldVal);
                    const isTemplate = rawVal.startsWith('{{') && rawVal.endsWith('}}');
                    if (!isTemplate) {
                      if (fieldDef.isList && !Array.isArray(fieldVal)) {
                        diagnostics.push({
                          message: `En ${prefix}.${k}, se esperaba un arreglo (${fieldDef.typeString}), pero se recibió "${typeof fieldVal}".`,
                          severity: 'error',
                          source: 'variable'
                        });
                      } else if ((fieldDef.typeString.includes('Int') || fieldDef.typeString.includes('Float')) && typeof fieldVal !== 'number') {
                        diagnostics.push({
                          message: `En ${prefix}.${k}, se esperaba un número (${fieldDef.typeString}), pero se recibió "${typeof fieldVal}".`,
                          severity: 'error',
                          source: 'variable'
                        });
                      } else if (fieldDef.typeString.includes('Boolean') && typeof fieldVal !== 'boolean') {
                        diagnostics.push({
                          message: `En ${prefix}.${k}, se esperaba un booleano (true/false), pero se recibió "${typeof fieldVal}".`,
                          severity: 'error',
                          source: 'variable'
                        });
                      } else if (fieldDef.typeString.includes('String') && typeof fieldVal !== 'string') {
                        diagnostics.push({
                          message: `En ${prefix}.${k}, se esperaba un texto (String), pero se recibió "${typeof fieldVal}".`,
                          severity: 'error',
                          source: 'variable'
                        });
                      }
                    }
                  }
                }
              }
            });
          }
        }
      }
    } else {
      // Si no se pasaron variables pero la query define variables requeridas
      for (const varDef of variableDefinitions) {
        if (varDef.required) {
          diagnostics.push({
            message: `La operación requiere la variable "$${varDef.name}" (${varDef.typeString}), pero el bloque de variables está vacío.`,
            severity: 'error',
            source: 'variable'
          });
        }
      }
    }

    const hasErrors = diagnostics.some(d => d.severity === 'error');
    return {
      valid: !hasErrors,
      hasSchema: currentSchema !== null,
      diagnostics,
      variableDefinitions
    };
  },

  /**
   * Inspecciona la operación GraphQL y devuelve la lista completa de inputs requeridos
   * con todos sus campos, tipos y estructura anidada.
   */
  getOperationInputs(query: string): OperationInputDoc[] {
    if (!query || !query.trim() || !currentSchema) return [];
    let doc: any = null;
    try {
      doc = parse(query);
    } catch {
      return [];
    }

    const result: OperationInputDoc[] = [];
    const seenVars = new Set<string>();

    for (const def of doc.definitions || []) {
      if (def.kind === 'OperationDefinition') {
        const isMutation = def.operation === 'mutation';
        const rootType = isMutation ? currentSchema.getMutationType() : currentSchema.getQueryType();

        // Identificar funciones raíz llamadas (ej. updateCartItems, addProductsToCart)
        const rootFieldsCalled: Array<{ name: string; args: readonly any[] }> = [];
        if (rootType && isObjectType(rootType) && def.selectionSet?.selections) {
          const rootTypeFields = rootType.getFields();
          for (const sel of def.selectionSet.selections) {
            if (sel.kind === 'Field' && sel.name?.value) {
              const fieldName = sel.name.value;
              const fieldDef = rootTypeFields[fieldName];
              if (fieldDef) {
                rootFieldsCalled.push({ name: fieldName, args: fieldDef.args || [] });
              }
            }
          }
        }

        // 1. A partir de variables declaradas en la operación ($input: UpdateCartItemsWithWarrantyInput!)
        if (def.variableDefinitions) {
          for (const varDef of def.variableDefinitions) {
            const varName = varDef.variable.name.value;
            seenVars.add(varName);
            const typeStr = formatTypeFromAST(varDef.type);
            const rawTypeName = getNamedTypeFromAST(varDef.type);
            const isReq = varDef.type.kind === 'NonNullType';
            const isList = varDef.type.kind === 'ListType' || (isReq && varDef.type.type.kind === 'ListType');

            const schemaType = currentSchema.getType(rawTypeName);
            let fields: InputFieldDoc[] = [];
            let desc: string | undefined = undefined;

            if (schemaType && isInputObjectType(schemaType)) {
              fields = extractInputFields(schemaType);
              desc = schemaType.description || undefined;
            }

            // Buscar función raíz correspondiente
            const matchingFunc = rootFieldsCalled.find(rf =>
              rf.args.some((a: any) => a.name === varName || (a.type && a.type.name === rawTypeName))
            );

            result.push({
              functionName: matchingFunc?.name,
              variableName: varName,
              typeName: rawTypeName,
              typeString: typeStr,
              required: isReq,
              isList,
              description: desc,
              fields
            });
          }
        }

        // 2. A partir de argumentos directos de las funciones raíz (si no se usaron variables $...)
        for (const func of rootFieldsCalled) {
          for (const arg of func.args) {
            if (!seenVars.has(arg.name)) {
              const baseNamed = getBaseNamedType(arg.type);
              const isInputObj = isInputObjectType(baseNamed);
              result.push({
                functionName: func.name,
                variableName: arg.name,
                typeName: baseNamed.name,
                typeString: formatTypeString(arg.type),
                required: isNonNullType(arg.type),
                isList: isListType(arg.type) || (isNonNullType(arg.type) && isListType(arg.type.ofType)),
                description: arg.description || (isInputObj ? (baseNamed as any).description : undefined),
                fields: isInputObj ? extractInputFields(baseNamed as GraphQLInputObjectType) : []
              });
              seenVars.add(arg.name);
            }
          }
        }
      }
    }

    return result;
  },

  /**
   * Genera un JSON de ejemplo listo para usar con las variables de la operación
   */
  generateExampleVariablesJson(inputs: OperationInputDoc[]): string {
    const payload: Record<string, any> = {};

    for (const input of inputs) {
      if (input.fields && input.fields.length > 0) {
        const itemObj = generateExampleObjectFromFields(input.fields);
        payload[input.variableName] = input.isList ? [itemObj] : itemObj;
      } else {
        // Campo escalar suelto
        if (input.variableName.toLowerCase().includes('cartid') || input.variableName.toLowerCase().includes('cart_id')) {
          payload[input.variableName] = '{{cartId}}';
        } else if (input.variableName.toLowerCase().includes('token')) {
          payload[input.variableName] = '{{token}}';
        } else if (input.variableName.toLowerCase().includes('order')) {
          payload[input.variableName] = '{{orderNumber}}';
        } else if (input.typeString.includes('Int') || input.typeString.includes('Float')) {
          payload[input.variableName] = 1;
        } else if (input.typeString.includes('Boolean')) {
          payload[input.variableName] = true;
        } else {
          payload[input.variableName] = '';
        }
      }
    }

    return JSON.stringify(payload, null, 2);
  },

  /**
   * Genera el JSON completo con el tipado exacto de cada campo para todos los inputs
   */
  generateTypedSchemaJson(query: string): string {
    const inputs = this.getOperationInputs(query);
    if (!inputs || inputs.length === 0) return '{}';

    const payload: Record<string, any> = {};

    for (const input of inputs) {
      if (input.fields && input.fields.length > 0) {
        const itemObj = generateTypedFieldsObject(input.fields);
        payload[input.variableName] = input.isList ? [itemObj] : itemObj;
      } else {
        payload[input.variableName] = input.typeString;
      }
    }

    return JSON.stringify(payload, null, 2);
  }
};

// ---------------- Helpers Internos de Introspección ----------------
function generateTypedFieldsObject(fields: InputFieldDoc[]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const f of fields) {
    if (f.nestedFields && f.nestedFields.length > 0) {
      const child = generateTypedFieldsObject(f.nestedFields);
      result[f.name] = f.isList ? [child] : child;
    } else {
      result[f.name] = f.typeString;
    }
  }
  return result;
}
function extractInputFields(type: GraphQLInputObjectType, depth: number = 0): InputFieldDoc[] {
  if (depth > 2) return [];
  const fields = type.getFields();
  return Object.values(fields).map(f => {
    const baseNamed = getBaseNamedType(f.type);
    const isInputObj = isInputObjectType(baseNamed);
    return {
      name: f.name,
      typeString: formatTypeString(f.type),
      required: isNonNullType(f.type),
      isList: isListType(f.type) || (isNonNullType(f.type) && isListType(f.type.ofType)),
      description: f.description || undefined,
      defaultValue: f.defaultValue,
      nestedTypeName: isInputObj ? baseNamed.name : undefined,
      nestedFields: isInputObj ? extractInputFields(baseNamed as GraphQLInputObjectType, depth + 1) : undefined
    };
  });
}

function generateExampleObjectFromFields(fields: InputFieldDoc[]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const f of fields) {
    if (f.nestedFields && f.nestedFields.length > 0) {
      const child = generateExampleObjectFromFields(f.nestedFields);
      result[f.name] = f.isList ? [child] : child;
    } else {
      if (f.name.toLowerCase().includes('cart_id') || f.name.toLowerCase().includes('cartid')) {
        result[f.name] = '{{cartId}}';
      } else if (f.name.toLowerCase().includes('sku')) {
        result[f.name] = 'EJEMPLO-SKU';
      } else if (f.name.toLowerCase().includes('quantity') || f.name.toLowerCase().includes('qty')) {
        result[f.name] = 1;
      } else if (f.name.toLowerCase().includes('item_id') || f.name.toLowerCase().includes('cart_item_id')) {
        result[f.name] = 1;
      } else if (f.typeString.includes('Int') || f.typeString.includes('Float')) {
        result[f.name] = 1;
      } else if (f.typeString.includes('Boolean')) {
        result[f.name] = true;
      } else if (f.isList) {
        result[f.name] = [];
      } else {
        result[f.name] = '';
      }
    }
  }
  return result;
}

// ---------------- Helpers AST ----------------
function formatTypeFromAST(typeNode: any): string {
  if (typeNode.kind === 'NonNullType') {
    return `${formatTypeFromAST(typeNode.type)}!`;
  }
  if (typeNode.kind === 'ListType') {
    return `[${formatTypeFromAST(typeNode.type)}]`;
  }
  return typeNode.name.value;
}

function getNamedTypeFromAST(typeNode: any): string {
  let curr = typeNode;
  while (curr.kind === 'NonNullType' || curr.kind === 'ListType') {
    curr = curr.type;
  }
  return curr.name.value;
}
