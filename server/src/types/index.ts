export type Stage =
  | 'CART_CREATION'
  | 'ADD_ITEMS'
  | 'SET_SHIPPING_ADDRESS'
  | 'SET_SHIPPING_METHOD'
  | 'SET_BILLING_ADDRESS'
  | 'APPLY_COUPON'
  | 'SET_PAYMENT_METHOD'
  | 'PLACE_ORDER';

export interface ItemVersion {
  id: string;
  entityType: 'FLOW' | 'VARIANT' | 'CATEGORIES';
  entityId: string;
  versionNumber: number;
  snapshot: any;
  createdBy?: string;
  createdByName?: string;
  changeSummary?: string;
  createdAt: string;
}

export type ValidationType =
  | 'STATUS_CODE'
  | 'NO_GRAPHQL_ERRORS'
  | 'RESPONSE_TIME_UNDER'
  | 'JSON_PATH_EXISTS'
  | 'JSON_PATH_EQUALS'
  | 'JSON_PATH_NOT_EMPTY'
  | 'CONTAINS_STRING';

export interface CustomValidation {
  id: string;
  name: string;
  type: ValidationType;
  targetPath?: string;
  expectedValue?: string;
  enabled: boolean;
}

export type GlobalTestType =
  | 'STATUS_CODE_200'
  | 'NO_GRAPHQL_ERRORS'
  | 'MAX_RESPONSE_TIME'
  | 'HAS_DATA'
  | 'JSON_CONTENT_TYPE';

export interface GlobalTestConfig {
  id: string;
  name: string;
  description: string;
  type: GlobalTestType;
  enabled: boolean;
  threshold?: number;
  graphql?: boolean;
  rest?: boolean;
}

export interface VariantMetric {
  variantId: string;
  variantName: string;
  category: string;
  apiType: 'GRAPHQL' | 'REST';
  totalRuns: number;
  totalTimeMs: number;
  avgResponseTimeMs: number;
  successRuns: number;
  failedRuns: number;
  successRate: number;
  lastExecutedAt: string;
  lastResponseTimeMs: number;
  lastStatus: 'SUCCESS' | 'FAILED';
}

export interface TestResult {
  id: string;
  name: string;
  source: 'GLOBAL' | 'CUSTOM';
  passed: boolean;
  message: string;
  actual?: any;
  expected?: any;
}

export interface Environment {
  id: string;
  name: string;
  magentoUrl: string; // GraphQL Endpoint
  magentoRestUrl?: string; // REST API Endpoint
  storeCode?: string;
  customHeaders: Record<string, any>;
  graphqlHeaders?: Record<string, string>;
  restHeaders?: Record<string, string>;
  variables?: Record<string, string>;
  useMockSimulator: boolean;
  isProtected?: boolean;
  securityCode?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ApiType = 'GRAPHQL' | 'REST';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarColor?: string;
  role?: 'DEVELOPER' | 'ADMIN';
  adminKey?: string;
}

export interface Variant {
  id: string;
  name: string;
  category: string;
  stage?: Stage;
  description?: string;
  apiType?: ApiType;
  method?: HttpMethod;
  endpoint?: string;
  body?: string;
  query: string;
  defaultVariables: Record<string, any>;
  variables?: Record<string, any>;
  contextOutputs: string[];
  contextMapping?: Record<string, string>;
  customHeaders?: Record<string, string>;
  disabledHeaders?: string[];
  customUrl?: string; // Link / URL personalizado directo para esta variante
  environmentOverrides?: Record<string, string>;
  environmentId?: string | null;
  customValidations?: CustomValidation[];
  isVirtualOnly?: boolean;
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletedByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlowStepConfig {
  id: string; // Identificador único por paso en el flujo dinámico
  category: string;
  variantId: string | null;
  environmentId?: string | null;
  skipped: boolean;
  sleepMs?: number; // Pausa / Sleep tras este paso antes de la siguiente petición (en ms)
  overrideVariables?: Record<string, any>;
  query?: string;
  endpoint?: string;
  body?: string;
  method?: HttpMethod;
  apiType?: ApiType;
  customHeaders?: Record<string, string>;
  disabledHeaders?: string[];
  flowCustomHeaders?: Record<string, string>;
  flowDisabledHeaders?: string[];
  customUrl?: string; // Link / URL personalizado para este paso
  debugMode?: boolean; // Activa modo debugger Xdebug (?XDEBUG_SESSION_START=PHPSTORM)
  contextMapping?: Record<string, string>;
  customValidations?: CustomValidation[];
}

export interface CsvDataset {
  name?: string;
  headers: string[];
  rows: Record<string, any>[];
  rawCsv?: string;
}

export interface SavedFlow {
  id: string;
  name: string;
  description?: string;
  steps: FlowStepConfig[];
  defaultDelayMs?: number; // Pausa / Delay global por defecto entre pasos (en ms)
  dataset?: CsvDataset;
  customHeaders?: Record<string, string>; // Cabeceras personalizadas para todo el flujo
  disabledHeaders?: string[]; // Cabeceras canceladas/desactivadas para todo el flujo
  isLocked?: boolean;
  lockedBy?: string;
  lockedByName?: string;
  lockedAt?: string;
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletedByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlowSet {
  id: string;
  name: string;
  description?: string;
  flowIds: string[];
  delayBetweenFlowsMs?: number;
  stopOnFailure?: boolean;
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoadTestConfig {
  vus: number; // Concurrencia de usuarios
  mode: 'ITERATIONS' | 'DURATION';
  iterationsPerVu?: number;
  durationSeconds?: number;
  rampUpSeconds?: number;
  thinkTimeMs?: number;
}

export interface LoadTestMetrics {
  vus: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  durationMs: number;
  rps: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

export interface ExecutionContext {
  cartId: string | null;
  token: string | null;
  orderNumber: string | null;
  variables: Record<string, any>;
  logs: string[];
}

export interface StepExecutionResult {
  stepId?: string;
  category: string;
  stage?: string;
  variantId: string;
  variantName: string;
  durationMs: number;
  status: number;
  skipped?: boolean;
  requestPayload?: {
    url?: string;
    method?: string;
    query?: string;
    body?: string;
    variables?: Record<string, any>;
    headers?: Record<string, string>;
  };
  responsePreview?: any;
  errors?: any[];
  testResults?: TestResult[];
  extractedVariables?: Record<string, any>;
}

export type ExecutionStatus = 'SUCCESS' | 'FAILED' | 'TESTS_FAILED';

export interface FlowExecutionResponse {
  id?: string;
  executionType?: 'FLOW' | 'SINGLE' | 'SUITE' | 'LOAD_TEST';
  targetName?: string;
  environmentName?: string;
  status: ExecutionStatus;
  orderNumber: string | null;
  totalTimeMs: number;
  failedAtStepId?: string | null;
  failedAtCategory?: string | null;
  failedAtStage?: Stage | null;
  errorMessage?: string;
  steps: StepExecutionResult[];
  totalTestsPassed?: number;
  totalTestsFailed?: number;
  suiteId?: string;
  suiteName?: string;
  flowRuns?: FlowExecutionResponse[];
  loadTestMetrics?: LoadTestMetrics;
  createdAt?: string;
}

export interface EnvironmentSettings {
  activeEnvironmentId?: string;
  magentoUrl: string;
  magentoRestUrl?: string;
  storeCode?: string;
  customHeaders: Record<string, string>;
  graphqlHeaders?: Record<string, string>;
  restHeaders?: Record<string, string>;
  variables?: Record<string, string>;
  useMockSimulator: boolean;
  debugMode?: boolean; // Modo Debugger Xdebug
}
