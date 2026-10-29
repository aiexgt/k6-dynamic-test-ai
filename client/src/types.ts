export type ValidationType =
  | 'STATUS_CODE'
  | 'NO_GRAPHQL_ERRORS'
  | 'RESPONSE_TIME_UNDER'
  | 'JSON_PATH_EXISTS'
  | 'JSON_PATH_EQUALS'
  | 'JSON_PATH_NOT_EMPTY'
  | 'CONTAINS_STRING';

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
  variables?: Record<string, string>;
  useMockSimulator: boolean;
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
  stage?: string;
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
  id: string;
  category: string;
  variantId: string | null;
  environmentId?: string | null;
  skipped: boolean;
  overrideVariables?: Record<string, any>;
  query?: string;
  endpoint?: string;
  body?: string;
  method?: HttpMethod;
  apiType?: ApiType;
  customHeaders?: Record<string, string>;
  contextMapping?: Record<string, string>;
  customValidations?: CustomValidation[];
}

export interface SavedFlow {
  id: string;
  name: string;
  description?: string;
  steps: FlowStepConfig[];
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
  executionType?: 'FLOW' | 'SINGLE';
  targetName?: string;
  environmentName?: string;
  status: ExecutionStatus;
  orderNumber: string | null;
  totalTimeMs: number;
  failedAtStepId?: string | null;
  failedAtCategory?: string | null;
  failedAtStage?: string | null;
  errorMessage?: string;
  steps: StepExecutionResult[];
  totalTestsPassed?: number;
  totalTestsFailed?: number;
  createdAt?: string;
}

export interface EnvironmentSettings {
  activeEnvironmentId?: string;
  magentoUrl: string;
  magentoRestUrl?: string;
  storeCode?: string;
  customHeaders: Record<string, string>;
  variables?: Record<string, string>;
  useMockSimulator: boolean;
}
