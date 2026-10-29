import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Pool } from 'pg';
import {
  Variant,
  SavedFlow,
  FlowExecutionResponse,
  EnvironmentSettings,
  Environment,
  GlobalTestConfig,
  UserProfile,
  ItemVersion
} from '../types';

const DATA_DIR = path.resolve(__dirname, '../../data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFile<T>(filename: string, defaultValue: T): T {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf-8');
    return defaultValue;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (err) {
    console.error(`Error reading ${filename}, resetting to default:`, err);
    return defaultValue;
  }
}

function writeJsonFile<T>(filename: string, data: T): void {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export const DEFAULT_GLOBAL_TESTS: GlobalTestConfig[] = [
  {
    id: 'test-status-200',
    name: 'Status Code HTTP 200',
    description: 'Verifica que la petición responda con código HTTP 200 OK',
    type: 'STATUS_CODE_200',
    enabled: true
  },
  {
    id: 'test-no-graphql-errors',
    name: 'Sin Errores GraphQL',
    description: 'Valida que la respuesta no contenga bloque de errores en errors[]',
    type: 'NO_GRAPHQL_ERRORS',
    enabled: true
  },
  {
    id: 'test-max-response-time',
    name: 'Tiempo de Respuesta Máximo',
    description: 'Comprueba que la latencia no supere el umbral máximo de tolerancia (ms)',
    type: 'MAX_RESPONSE_TIME',
    threshold: 2000,
    enabled: true
  },
  {
    id: 'test-has-data',
    name: 'Cuerpo con data válido',
    description: 'Verifica que la respuesta contenga el objeto data de GraphQL no nulo',
    type: 'HAS_DATA',
    enabled: true
  },
  {
    id: 'test-json-content-type',
    name: 'Content-Type JSON',
    description: 'Asegura que las cabeceras o cuerpo correspondan a formato JSON válido',
    type: 'JSON_CONTENT_TYPE',
    enabled: false
  }
];

const DEFAULT_ENVIRONMENTS: Environment[] = [
  {
    id: 'env-local-kosmos',
    name: 'Local Kosmos',
    magentoUrl: 'https://app.kosmos.test/graphql',
    magentoRestUrl: 'https://app.kosmos.test/rest/V1',
    customHeaders: {
      'Content-Type': 'application/json',
      'AuthToken': 'TU_AUTH_TOKEN_AQUI',
      'X-Client-Type': '1'
    },
    variables: {
      CartId: '',
      sku: 'MD2',
      quantity: '1',
      customerToken: ''
    },
    useMockSimulator: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'env-mock-sim',
    name: 'Simulador Mock',
    magentoUrl: 'http://localhost:4000/api/mock/graphql',
    magentoRestUrl: 'http://localhost:4000/api/mock/rest',
    customHeaders: {
      'Content-Type': 'application/json'
    },
    variables: {
      CartId: 'cart-mock-123',
      sku: 'MOCK-SKU-1',
      quantity: '1'
    },
    useMockSimulator: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'env-staging-kcc',
    name: 'Staging KCC',
    magentoUrl: 'https://staging.kosmos.test/graphql',
    magentoRestUrl: 'https://staging.kosmos.test/rest/V1',
    customHeaders: {
      'Content-Type': 'application/json'
    },
    variables: {
      CartId: '',
      sku: 'MD2',
      quantity: '1'
    },
    useMockSimulator: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// Dual-Database Pools:
// 1. sharedPgPool: Shared / Central DB (Categories, Variants, Flows)
// 2. localPgPool: Local Docker DB (Environments, Settings, History, Local Tests)
let sharedPgPool: Pool | null = null;
let isSharedPgConnected = false;

let localPgPool: Pool | null = null;
let isLocalPgConnected = false;

function maskDbUrl(rawUrl?: string): string {
  if (!rawUrl) return 'Archivos locales (JSON fallback)';
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.protocol}//${parsed.username ? parsed.username + ':***@' : ''}${parsed.host}${parsed.pathname}`;
  } catch {
    return 'URL configurada';
  }
}

export class Database {
  // In-memory cache for ultra-fast, zero-latency synchronous access
  private static variantsCache: Variant[] = [];
  private static variantsLoaded = false;
  private static categoriesCache: string[] = [];
  private static categoriesLoaded = false;
  private static environmentsCache: Environment[] = [];
  private static environmentsLoaded = false;
  private static flowsCache: SavedFlow[] = [];
  private static flowsLoaded = false;
  private static settingsCache: EnvironmentSettings | null = null;
  private static historyCache: FlowExecutionResponse[] = [];
  private static historyLoaded = false;
  private static globalTestsCache: GlobalTestConfig[] = [];
  private static globalTestsLoaded = false;
  private static versionsCache: ItemVersion[] = [];
  private static versionsLoaded = false;

  /**
   * Initializes the dual-database architecture (Shared DB for flows/variants + Local DB for environments/secrets)
   */
  static async init(): Promise<void> {
    ensureDataDir();

    // 1. Load initial cache from JSON files
    this.variantsCache = readJsonFile<Variant[]>('variants.json', []);
    this.variantsLoaded = true;
    this.categoriesCache = readJsonFile<string[]>('categories.json', [
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
    ]);
    this.categoriesLoaded = true;
    const defaultEnvs = readJsonFile<Environment[]>('environments.example.json', DEFAULT_ENVIRONMENTS);
    this.environmentsCache = readJsonFile<Environment[]>('environments.json', defaultEnvs);
    this.environmentsLoaded = true;
    this.flowsCache = readJsonFile<SavedFlow[]>('flows.json', []);
    this.flowsLoaded = true;
    this.historyCache = readJsonFile<FlowExecutionResponse[]>('history.json', []);
    this.historyLoaded = true;
    this.globalTestsCache = readJsonFile<GlobalTestConfig[]>('global_tests.json', DEFAULT_GLOBAL_TESTS);
    this.globalTestsLoaded = true;
    this.versionsCache = readJsonFile<ItemVersion[]>('versions.json', []);
    this.versionsLoaded = true;

    const defaultEnv = this.environmentsCache[0] || DEFAULT_ENVIRONMENTS[0];
    this.settingsCache = readJsonFile<EnvironmentSettings>('settings.json', {
      activeEnvironmentId: defaultEnv.id,
      magentoUrl: defaultEnv.magentoUrl,
      magentoRestUrl: defaultEnv.magentoRestUrl || '',
      storeCode: defaultEnv.storeCode,
      customHeaders: defaultEnv.customHeaders,
      variables: defaultEnv.variables || {},
      useMockSimulator: defaultEnv.useMockSimulator
    });

    const localDbUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
    const sharedDbUrl = process.env.SHARED_DATABASE_URL || process.env.DATABASE_URL;

    // Connect Local DB (Docker PostgreSQL)
    if (localDbUrl) {
      try {
        console.log('🐘 [DB Local] Conectando a PostgreSQL Local...');
        localPgPool = new Pool({
          connectionString: localDbUrl,
          connectionTimeoutMillis: 5000
        });
        await localPgPool.query('SELECT 1');
        isLocalPgConnected = true;
        console.log('✅ [DB Local] PostgreSQL Local conectado.');
        await this.runLocalPgMigrations();
      } catch (err: any) {
        console.error('⚠️ [DB Local] Error conectando a PostgreSQL Local:', err.message);
        isLocalPgConnected = false;
      }
    } else {
      console.log('📦 [DB Local] Almacenamiento local en disco (/data)');
    }

    // Connect Shared DB (Remote Central DB or Shared instance)
    if (sharedDbUrl) {
      if (sharedDbUrl === localDbUrl && localPgPool && isLocalPgConnected) {
        sharedPgPool = localPgPool;
        isSharedPgConnected = true;
        console.log('🔗 [DB Central] Usando base de datos unificada compartida en Docker.');
        await this.runSharedPgMigrations();
      } else {
        try {
          console.log('🌐 [DB Central] Conectando a base de datos central compartida...');
          sharedPgPool = new Pool({
            connectionString: sharedDbUrl,
            connectionTimeoutMillis: 5000
          });
          await sharedPgPool.query('SELECT 1');
          isSharedPgConnected = true;
          console.log('✅ [DB Central] Conexión compartida establecida exitosamente.');
          await this.runSharedPgMigrations();
        } catch (err: any) {
          console.error('⚠️ [DB Central] No se pudo conectar a la DB Central compartida, usando fallback local:', err.message);
          sharedPgPool = localPgPool;
          isSharedPgConnected = isLocalPgConnected;
        }
      }
    }

    // Seed & Sync
    await this.seedPgFromCache();
    await this.syncCacheFromPg();
  }

  /**
   * Returns connection status of both databases
   */
  static getDatabaseStatus() {
    const localDbUrl = process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;
    const sharedDbUrl = process.env.SHARED_DATABASE_URL || process.env.DATABASE_URL;
    const isSharedRemote = !!process.env.SHARED_DATABASE_URL && process.env.SHARED_DATABASE_URL !== localDbUrl;

    return {
      shared: {
        name: isSharedRemote ? 'Base de Datos Central (Remota)' : 'Base de Datos Compartida (Docker)',
        scope: 'Flujos, Variantes y Categorías (Equipo)',
        connected: isSharedPgConnected,
        isRemote: isSharedRemote,
        urlMasked: maskDbUrl(sharedDbUrl)
      },
      local: {
        name: 'Base de Datos Local (Docker)',
        scope: 'Entornos, Credenciales, Tokens e Historial (Privado)',
        connected: isLocalPgConnected,
        urlMasked: maskDbUrl(localDbUrl)
      }
    };
  }

  private static async runSharedPgMigrations(): Promise<void> {
    if (!sharedPgPool || !isSharedPgConnected) return;

    await sharedPgPool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        name VARCHAR(255) PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS variants (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(255) NOT NULL,
        stage VARCHAR(100),
        description TEXT,
        query TEXT NOT NULL,
        default_variables JSONB,
        context_outputs JSONB,
        context_mapping JSONB,
        environment_overrides JSONB DEFAULT '{}'::jsonb,
        custom_validations JSONB DEFAULT '[]'::jsonb,
        is_virtual_only BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE variants ADD COLUMN IF NOT EXISTS environment_overrides JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE variants ADD COLUMN IF NOT EXISTS custom_validations JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE variants ADD COLUMN IF NOT EXISTS custom_headers JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE variants ADD COLUMN IF NOT EXISTS api_type VARCHAR(20) DEFAULT 'GRAPHQL';
      ALTER TABLE variants ADD COLUMN IF NOT EXISTS method VARCHAR(10) DEFAULT 'POST';
      ALTER TABLE variants ADD COLUMN IF NOT EXISTS endpoint TEXT;
      ALTER TABLE variants ADD COLUMN IF NOT EXISTS body TEXT;
      ALTER TABLE variants ADD COLUMN IF NOT EXISTS environment_id VARCHAR(255);
      
      -- Authorship & Soft delete for variants
      ALTER TABLE variants ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
      ALTER TABLE variants ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255);
      ALTER TABLE variants ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);
      ALTER TABLE variants ADD COLUMN IF NOT EXISTS updated_by_name VARCHAR(255);
      ALTER TABLE variants ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
      ALTER TABLE variants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE variants ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);
      ALTER TABLE variants ADD COLUMN IF NOT EXISTS deleted_by_name VARCHAR(255);

      CREATE TABLE IF NOT EXISTS flows (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        steps JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Locking, Authorship & Soft delete for flows
      ALTER TABLE flows ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;
      ALTER TABLE flows ADD COLUMN IF NOT EXISTS locked_by VARCHAR(255);
      ALTER TABLE flows ADD COLUMN IF NOT EXISTS locked_by_name VARCHAR(255);
      ALTER TABLE flows ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
      ALTER TABLE flows ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
      ALTER TABLE flows ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255);
      ALTER TABLE flows ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);
      ALTER TABLE flows ADD COLUMN IF NOT EXISTS updated_by_name VARCHAR(255);
      ALTER TABLE flows ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
      ALTER TABLE flows ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE flows ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);
      ALTER TABLE flows ADD COLUMN IF NOT EXISTS deleted_by_name VARCHAR(255);

      -- Central Role & Security Configuration (Authoritative in Remote Shared DB)
      CREATE TABLE IF NOT EXISTS shared_team_members (
        email VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'DEVELOPER',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS shared_system_config (
        config_key VARCHAR(100) PRIMARY KEY,
        config_value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Item Versions for Flows, Variants, and Categories
      CREATE TABLE IF NOT EXISTS item_versions (
        id VARCHAR(255) PRIMARY KEY,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(255) NOT NULL,
        version_number INT NOT NULL,
        snapshot JSONB NOT NULL,
        created_by VARCHAR(255),
        created_by_name VARCHAR(255),
        change_summary TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_item_versions_entity ON item_versions(entity_type, entity_id, version_number DESC);
    `);

    // Ensure default master admin pin is seeded if not present
    const defaultMasterHash = crypto.createHash('sha256').update('admin_flowrunner_2026').digest('hex');
    await sharedPgPool.query(`
      INSERT INTO shared_system_config (config_key, config_value, updated_at)
      VALUES ('admin_master_pin_hash', $1, NOW())
      ON CONFLICT (config_key) DO NOTHING
    `, [defaultMasterHash]);

    console.log('🧱 [DB Central] Tablas de Flujos, Variantes, Categorías y Seguridad Central migradas.');
  }

  private static async runLocalPgMigrations(): Promise<void> {
    if (!localPgPool || !isLocalPgConnected) return;

    await localPgPool.query(`
      CREATE TABLE IF NOT EXISTS environments (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        magento_url TEXT NOT NULL,
        magento_rest_url TEXT,
        store_code VARCHAR(100),
        custom_headers JSONB,
        variables JSONB DEFAULT '{}'::jsonb,
        use_mock_simulator BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      ALTER TABLE environments ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE environments ADD COLUMN IF NOT EXISTS magento_rest_url TEXT;

      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        data JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS history (
        id SERIAL PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS global_tests (
        id VARCHAR(100) PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('🧱 [DB Local] Tablas de Entornos, Secretos e Historial migradas.');
  }

  private static async seedPgFromCache(): Promise<void> {
    // Seed Central DB (Categories, Variants, Flows)
    if (sharedPgPool && isSharedPgConnected) {
      const catRes = await sharedPgPool.query('SELECT COUNT(*) FROM categories');
      if (parseInt(catRes.rows[0].count) === 0 && this.categoriesCache.length > 0) {
        console.log(`🌱 Sembrando ${this.categoriesCache.length} categorías en DB Central...`);
        for (const cat of this.categoriesCache) {
          await sharedPgPool.query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [cat]);
        }
      }

      const varRes = await sharedPgPool.query('SELECT COUNT(*) FROM variants');
      if (parseInt(varRes.rows[0].count) === 0 && this.variantsCache.length > 0) {
        console.log(`🌱 Sembrando ${this.variantsCache.length} variantes en DB Central...`);
        for (const v of this.variantsCache) {
          await this.insertVariantPg(sharedPgPool, v);
        }
      }

      const flowRes = await sharedPgPool.query('SELECT COUNT(*) FROM flows');
      if (parseInt(flowRes.rows[0].count) === 0 && this.flowsCache.length > 0) {
        console.log(`🌱 Sembrando ${this.flowsCache.length} flujos en DB Central...`);
        for (const f of this.flowsCache) {
          await this.insertFlowPg(sharedPgPool, f);
        }
      }
    }

    // Seed Local DB (Environments, Global Tests)
    if (localPgPool && isLocalPgConnected) {
      const envRes = await localPgPool.query('SELECT COUNT(*) FROM environments');
      if (parseInt(envRes.rows[0].count) === 0 && this.environmentsCache.length > 0) {
        console.log(`🌱 Sembrando ${this.environmentsCache.length} entornos en DB Local...`);
        for (const e of this.environmentsCache) {
          await localPgPool.query(
            `INSERT INTO environments (id, name, magento_url, magento_rest_url, store_code, custom_headers, variables, use_mock_simulator, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO NOTHING`,
            [
              e.id,
              e.name,
              e.magentoUrl,
              e.magentoRestUrl || '',
              e.storeCode || '',
              JSON.stringify(e.customHeaders || {}),
              JSON.stringify(e.variables || {}),
              !!e.useMockSimulator,
              e.createdAt || new Date().toISOString(),
              e.updatedAt || new Date().toISOString()
            ]
          );
        }
      }

      const testRes = await localPgPool.query('SELECT COUNT(*) FROM global_tests');
      if (parseInt(testRes.rows[0].count) === 0 && this.globalTestsCache.length > 0) {
        for (const t of this.globalTestsCache) {
          await localPgPool.query(
            `INSERT INTO global_tests (id, data, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (id) DO NOTHING`,
            [t.id, JSON.stringify(t)]
          );
        }
      }
    }
  }

  private static async syncCacheFromPg(): Promise<void> {
    // Sync from Shared DB (Categories, Variants, Flows)
    if (sharedPgPool && isSharedPgConnected) {
      try {
        const catRes = await sharedPgPool.query('SELECT name FROM categories ORDER BY created_at ASC');
        if (catRes.rows.length > 0) {
          this.categoriesCache = catRes.rows.map(r => r.name);
        }
        this.categoriesLoaded = true;

        const varRes = await sharedPgPool.query('SELECT * FROM variants ORDER BY created_at ASC');
        this.variantsCache = varRes.rows.map(r => ({
          id: r.id,
          name: r.name,
          category: r.category,
          stage: r.stage,
          description: r.description,
          apiType: (r.api_type as any) || 'GRAPHQL',
          method: (r.method as any) || 'POST',
          endpoint: r.endpoint || '',
          body: r.body || '',
          query: r.query || '',
          defaultVariables: r.default_variables,
          contextOutputs: r.context_outputs,
          contextMapping: r.context_mapping,
          customHeaders: r.custom_headers || {},
          environmentOverrides: r.environment_overrides || {},
          environmentId: r.environment_id || null,
          customValidations: r.custom_validations || [],
          isVirtualOnly: r.is_virtual_only,
          createdBy: r.created_by,
          createdByName: r.created_by_name,
          updatedBy: r.updated_by,
          updatedByName: r.updated_by_name,
          isDeleted: !!r.is_deleted,
          deletedAt: r.deleted_at?.toISOString?.() || r.deleted_at,
          deletedBy: r.deleted_by,
          deletedByName: r.deleted_by_name,
          createdAt: r.created_at?.toISOString?.() || r.created_at,
          updatedAt: r.updated_at?.toISOString?.() || r.updated_at
        }));
        this.variantsLoaded = true;

        const flowRes = await sharedPgPool.query('SELECT * FROM flows ORDER BY created_at ASC');
        this.flowsCache = flowRes.rows.map(r => ({
          id: r.id,
          name: r.name,
          description: r.description,
          steps: r.steps,
          isLocked: !!r.is_locked,
          lockedBy: r.locked_by,
          lockedByName: r.locked_by_name,
          lockedAt: r.locked_at?.toISOString?.() || r.locked_at,
          createdBy: r.created_by,
          createdByName: r.created_by_name,
          updatedBy: r.updated_by,
          updatedByName: r.updated_by_name,
          isDeleted: !!r.is_deleted,
          deletedAt: r.deleted_at?.toISOString?.() || r.deleted_at,
          deletedBy: r.deleted_by,
          deletedByName: r.deleted_by_name,
          createdAt: r.created_at?.toISOString?.() || r.created_at,
          updatedAt: r.updated_at?.toISOString?.() || r.updated_at
        }));
        this.flowsLoaded = true;
      } catch (err: any) {
        console.error('Error sincronizando desde DB Central:', err.message);
      }
    }

    // Sync from Local DB (Environments, Settings, Global Tests)
    if (localPgPool && isLocalPgConnected) {
      try {
        const envRes = await localPgPool.query('SELECT * FROM environments ORDER BY created_at ASC');
        if (envRes.rows.length > 0) {
          this.environmentsCache = envRes.rows.map(r => ({
            id: r.id,
            name: r.name,
            magentoUrl: r.magento_url,
            magentoRestUrl: r.magento_rest_url || '',
            storeCode: r.store_code,
            customHeaders: r.custom_headers,
            variables: r.variables || {},
            useMockSimulator: r.use_mock_simulator,
            createdAt: r.created_at?.toISOString?.() || r.created_at,
            updatedAt: r.updated_at?.toISOString?.() || r.updated_at
          }));
        }
        this.environmentsLoaded = true;

        const testRes = await localPgPool.query('SELECT data FROM global_tests ORDER BY id ASC');
        if (testRes.rows.length > 0) {
          this.globalTestsCache = testRes.rows.map(r => r.data);
        }
        this.globalTestsLoaded = true;
      } catch (err: any) {
        console.error('Error sincronizando desde DB Local:', err.message);
      }
    }

    console.log('🔄 Datos sincronizados y listos.');
  }

  // --- VARIANTS CRUD & SOFT DELETE ---
  static getVariants(includeDeleted = false): Variant[] {
    if (!this.variantsLoaded) {
      this.variantsCache = readJsonFile<Variant[]>('variants.json', []);
      this.variantsLoaded = true;
    }
    if (includeDeleted) return this.variantsCache;
    return this.variantsCache.filter(v => !v.isDeleted);
  }

  static saveVariants(variants: Variant[]): void {
    this.variantsCache = variants;
    this.variantsLoaded = true;
    writeJsonFile('variants.json', variants);
  }

  static getVariantById(id: string): Variant | undefined {
    return this.variantsCache.find(v => v.id === id);
  }

  static upsertVariant(variant: Variant, user?: Partial<UserProfile>, changeSummary?: string): Variant {
    const variants = this.variantsCache;
    const index = variants.findIndex(v => v.id === variant.id);
    const now = new Date().toISOString();
    let finalVar: Variant;
    const isNew = index < 0;

    if (!isNew) {
      finalVar = {
        ...variant,
        updatedAt: now,
        updatedBy: user?.email || variant.updatedBy,
        updatedByName: user?.name || variant.updatedByName
      };
      variants[index] = finalVar;
    } else {
      finalVar = {
        ...variant,
        createdAt: now,
        updatedAt: now,
        createdBy: user?.email || variant.createdBy,
        createdByName: user?.name || variant.createdByName,
        updatedBy: user?.email || variant.updatedBy,
        updatedByName: user?.name || variant.updatedByName
      };
      variants.push(finalVar);
    }
    this.saveVariants(variants);

    if (sharedPgPool && isSharedPgConnected) {
      this.insertVariantPg(sharedPgPool, finalVar).catch(e => {
        console.error('Error guardando variante en PG:', e.message);
      });
    }

    // Record version snapshot
    this.recordVersion(
      'VARIANT',
      finalVar.id,
      finalVar,
      user,
      changeSummary || (isNew ? 'Creación inicial de variante' : 'Actualización de variante')
    );

    return finalVar;
  }

  private static async insertVariantPg(pool: Pool, v: Variant): Promise<void> {
    await pool.query(
      `INSERT INTO variants (
        id, name, category, stage, description, query, default_variables,
        context_outputs, context_mapping, environment_overrides, custom_validations,
        custom_headers, is_virtual_only, api_type, method, endpoint, body, environment_id,
        created_by, created_by_name, updated_by, updated_by_name,
        is_deleted, deleted_at, deleted_by, deleted_by_name,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
      ON CONFLICT (id) DO UPDATE SET
        name = $2, category = $3, stage = $4, description = $5, query = $6,
        default_variables = $7, context_outputs = $8, context_mapping = $9, environment_overrides = $10,
        custom_validations = $11, custom_headers = $12, is_virtual_only = $13, api_type = $14, method = $15,
        endpoint = $16, body = $17, environment_id = $18,
        updated_by = $21, updated_by_name = $22,
        is_deleted = $23, deleted_at = $24, deleted_by = $25, deleted_by_name = $26,
        updated_at = $28`,
      [
        v.id,
        v.name,
        v.category,
        v.stage || null,
        v.description || '',
        v.query || '',
        JSON.stringify(v.defaultVariables || {}),
        JSON.stringify(v.contextOutputs || []),
        JSON.stringify(v.contextMapping || {}),
        JSON.stringify(v.environmentOverrides || {}),
        JSON.stringify(v.customValidations || []),
        JSON.stringify(v.customHeaders || {}),
        !!v.isVirtualOnly,
        v.apiType || 'GRAPHQL',
        v.method || 'POST',
        v.endpoint || '',
        v.body || '',
        v.environmentId || null,
        v.createdBy || null,
        v.createdByName || null,
        v.updatedBy || null,
        v.updatedByName || null,
        !!v.isDeleted,
        v.deletedAt || null,
        v.deletedBy || null,
        v.deletedByName || null,
        v.createdAt,
        v.updatedAt
      ]
    );
  }

  /**
   * Soft-delete: Moves variant to trash
   */
  static softDeleteVariant(id: string, user?: Partial<UserProfile>): boolean {
    const v = this.getVariantById(id);
    if (!v) return false;
    v.isDeleted = true;
    v.deletedAt = new Date().toISOString();
    v.deletedBy = user?.email || undefined;
    v.deletedByName = user?.name || undefined;
    this.upsertVariant(v);
    return true;
  }

  /**
   * Restore variant from trash
   */
  static restoreVariant(id: string): Variant | undefined {
    const v = this.getVariantById(id);
    if (!v) return undefined;
    v.isDeleted = false;
    v.deletedAt = undefined;
    v.deletedBy = undefined;
    v.deletedByName = undefined;
    this.upsertVariant(v);
    return v;
  }

  /**
   * Hard-delete variant permanently
   */
  static purgeVariant(id: string): boolean {
    const filtered = this.variantsCache.filter(v => v.id !== id);
    if (filtered.length !== this.variantsCache.length) {
      this.saveVariants(filtered);
      if (sharedPgPool && isSharedPgConnected) {
        sharedPgPool.query('DELETE FROM variants WHERE id = $1', [id]).catch(console.error);
      }
      return true;
    }
    return false;
  }

  // --- CATEGORIES ---
  static getCategories(): string[] {
    if (this.categoriesLoaded) return this.categoriesCache;
    this.categoriesCache = readJsonFile<string[]>('categories.json', [
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
    ]);
    this.categoriesLoaded = true;
    return this.categoriesCache;
  }

  static addCategory(name: string, user?: Partial<UserProfile>): string[] {
    const clean = name.trim();
    if (!clean) return this.getCategories();
    const categories = this.getCategories();
    if (!categories.includes(clean)) {
      categories.push(clean);
      this.categoriesCache = categories;
      writeJsonFile('categories.json', categories);

      if (sharedPgPool && isSharedPgConnected) {
        sharedPgPool.query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [clean]).catch(e => {
          console.error('Error insertando categoría en PG:', e.message);
        });
      }

      this.recordVersion('CATEGORIES', 'all_categories', categories, user, `Categoría agregada: "${clean}"`);
    }
    return categories;
  }

  static renameCategory(oldName: string, newName: string, user?: Partial<UserProfile>): boolean {
    const cleanOld = oldName.trim();
    const cleanNew = newName.trim();
    if (!cleanOld || !cleanNew) return false;

    // Update categories
    const categories = this.getCategories().map(c => (c === cleanOld ? cleanNew : c));
    this.categoriesCache = Array.from(new Set(categories));
    writeJsonFile('categories.json', this.categoriesCache);

    // Update variants
    const variants = this.variantsCache;
    let updatedAny = false;
    for (const v of variants) {
      if (v.category === cleanOld) {
        v.category = cleanNew;
        v.updatedAt = new Date().toISOString();
        updatedAny = true;
      }
    }
    if (updatedAny) {
      this.saveVariants(variants);
    }

    if (sharedPgPool && isSharedPgConnected) {
      sharedPgPool.query('UPDATE categories SET name = $1 WHERE name = $2', [cleanNew, cleanOld]).catch(console.error);
      sharedPgPool.query('UPDATE variants SET category = $1 WHERE category = $2', [cleanNew, cleanOld]).catch(console.error);
    }

    this.recordVersion('CATEGORIES', 'all_categories', this.categoriesCache, user, `Categoría renombrada: "${cleanOld}" ➔ "${cleanNew}"`);

    return true;
  }

  static deleteCategory(name: string, user?: Partial<UserProfile>): boolean {
    const clean = name.trim();
    if (!clean || clean === 'Sin Categoría') return false;

    const variants = this.variantsCache;
    let updatedAny = false;
    for (const v of variants) {
      if (v.category === clean) {
        v.category = 'Sin Categoría';
        v.updatedAt = new Date().toISOString();
        updatedAny = true;
      }
    }
    if (updatedAny) {
      this.saveVariants(variants);
    }

    let categories = this.getCategories().filter(c => c !== clean);
    if (!categories.includes('Sin Categoría')) {
      categories.push('Sin Categoría');
    }
    this.categoriesCache = Array.from(new Set(categories));
    writeJsonFile('categories.json', this.categoriesCache);

    if (sharedPgPool && isSharedPgConnected) {
      sharedPgPool.query('DELETE FROM categories WHERE name = $1', [clean]).catch(console.error);
      sharedPgPool.query("UPDATE variants SET category = 'Sin Categoría' WHERE category = $1", [clean]).catch(console.error);
    }

    this.recordVersion('CATEGORIES', 'all_categories', this.categoriesCache, user, `Categoría eliminada: "${clean}"`);

    return true;
  }

  // --- FLOWS CRUD, LOCKING & SOFT DELETE ---
  static getFlows(includeDeleted = false): SavedFlow[] {
    if (!this.flowsLoaded) {
      this.flowsCache = readJsonFile<SavedFlow[]>('flows.json', []);
      this.flowsLoaded = true;
    }
    if (includeDeleted) return this.flowsCache;
    return this.flowsCache.filter(f => !f.isDeleted);
  }

  static saveFlows(flows: SavedFlow[]): void {
    this.flowsCache = flows;
    this.flowsLoaded = true;
    writeJsonFile('flows.json', flows);
  }

  static getFlowById(id: string): SavedFlow | undefined {
    return this.flowsCache.find(f => f.id === id);
  }

  static upsertFlow(flow: SavedFlow, user?: Partial<UserProfile>, changeSummary?: string): SavedFlow {
    const flows = this.flowsCache;
    const index = flows.findIndex(f => f.id === flow.id);
    const now = new Date().toISOString();
    let finalFlow: SavedFlow;
    const isNew = index < 0;

    if (!isNew) {
      finalFlow = {
        ...flow,
        updatedAt: now,
        updatedBy: user?.email || flow.updatedBy,
        updatedByName: user?.name || flow.updatedByName
      };
      flows[index] = finalFlow;
    } else {
      finalFlow = {
        ...flow,
        createdAt: now,
        updatedAt: now,
        createdBy: user?.email || flow.createdBy,
        createdByName: user?.name || flow.createdByName,
        updatedBy: user?.email || flow.updatedBy,
        updatedByName: user?.name || flow.updatedByName
      };
      flows.push(finalFlow);
    }
    this.saveFlows(flows);

    if (sharedPgPool && isSharedPgConnected) {
      this.insertFlowPg(sharedPgPool, finalFlow).catch(console.error);
    }

    // Record version snapshot
    this.recordVersion(
      'FLOW',
      finalFlow.id,
      finalFlow,
      user,
      changeSummary || (isNew ? `Flujo creado (${finalFlow.steps?.length || 0} pasos)` : `Flujo guardado (${finalFlow.steps?.length || 0} pasos)`)
    );

    return finalFlow;
  }

  private static async insertFlowPg(pool: Pool, f: SavedFlow): Promise<void> {
    await pool.query(
      `INSERT INTO flows (
        id, name, description, steps,
        is_locked, locked_by, locked_by_name, locked_at,
        created_by, created_by_name, updated_by, updated_by_name,
        is_deleted, deleted_at, deleted_by, deleted_by_name,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (id) DO UPDATE SET
        name = $2, description = $3, steps = $4,
        is_locked = $5, locked_by = $6, locked_by_name = $7, locked_at = $8,
        updated_by = $11, updated_by_name = $12,
        is_deleted = $13, deleted_at = $14, deleted_by = $15, deleted_by_name = $16,
        updated_at = $18`,
      [
        f.id,
        f.name,
        f.description || '',
        JSON.stringify(f.steps || []),
        !!f.isLocked,
        f.lockedBy || null,
        f.lockedByName || null,
        f.lockedAt || null,
        f.createdBy || null,
        f.createdByName || null,
        f.updatedBy || null,
        f.updatedByName || null,
        !!f.isDeleted,
        f.deletedAt || null,
        f.deletedBy || null,
        f.deletedByName || null,
        f.createdAt,
        f.updatedAt
      ]
    );
  }

  /**
   * Lock a master flow so others cannot edit or delete it accidentally
   */
  static lockFlow(id: string, user: { name: string; email: string }): SavedFlow | null {
    const flow = this.getFlowById(id);
    if (!flow) return null;
    flow.isLocked = true;
    flow.lockedBy = user.email;
    flow.lockedByName = user.name;
    flow.lockedAt = new Date().toISOString();
    return this.upsertFlow(flow, user, `Marcado como bloqueado por ${user.name}`);
  }

  /**
   * Unlock a master flow (anyone can unlock)
   */
  static unlockFlow(id: string, user?: { name?: string; email?: string }): SavedFlow | null {
    const flow = this.getFlowById(id);
    if (!flow) return null;
    flow.isLocked = false;
    flow.lockedBy = undefined;
    flow.lockedByName = undefined;
    flow.lockedAt = undefined;
    return this.upsertFlow(flow, user, `Desbloqueado por ${user?.name || 'desarrollador'}`);
  }

  /**
   * Soft-delete: Moves flow to trash
   */
  static softDeleteFlow(id: string, user?: Partial<UserProfile>): boolean {
    const flow = this.getFlowById(id);
    if (!flow) return false;
    flow.isDeleted = true;
    flow.deletedAt = new Date().toISOString();
    flow.deletedBy = user?.email || undefined;
    flow.deletedByName = user?.name || undefined;
    this.upsertFlow(flow);
    return true;
  }

  /**
   * Restore flow from trash
   */
  static restoreFlow(id: string): SavedFlow | undefined {
    const flow = this.getFlowById(id);
    if (!flow) return undefined;
    flow.isDeleted = false;
    flow.deletedAt = undefined;
    flow.deletedBy = undefined;
    flow.deletedByName = undefined;
    this.upsertFlow(flow);
    return flow;
  }

  /**
   * Hard-delete flow permanently
   */
  static purgeFlow(id: string): boolean {
    const filtered = this.flowsCache.filter(f => f.id !== id);
    if (filtered.length !== this.flowsCache.length) {
      this.saveFlows(filtered);
      if (sharedPgPool && isSharedPgConnected) {
        sharedPgPool.query('DELETE FROM flows WHERE id = $1', [id]).catch(console.error);
      }
      return true;
    }
    return false;
  }

  // --- TRASH BIN (SOFT DELETED ITEMS) ---
  static getTrash(): { flows: SavedFlow[]; variants: Variant[] } {
    return {
      flows: this.flowsCache.filter(f => f.isDeleted),
      variants: this.variantsCache.filter(v => v.isDeleted)
    };
  }

  // --- ENVIRONMENTS (LOCAL DB) ---
  static getEnvironments(): Environment[] {
    if (this.environmentsLoaded) return this.environmentsCache;
    const defaultEnvs = readJsonFile<Environment[]>('environments.example.json', DEFAULT_ENVIRONMENTS);
    this.environmentsCache = readJsonFile<Environment[]>('environments.json', defaultEnvs);
    this.environmentsLoaded = true;
    return this.environmentsCache;
  }

  static saveEnvironments(envs: Environment[]): void {
    this.environmentsCache = envs;
    this.environmentsLoaded = true;
    writeJsonFile('environments.json', envs);
  }

  static getEnvironmentById(id: string): Environment | undefined {
    return this.getEnvironments().find(e => e.id === id);
  }

  static upsertEnvironment(env: Environment): Environment {
    const envs = this.getEnvironments();
    const index = envs.findIndex(e => e.id === env.id);
    const now = new Date().toISOString();
    let finalEnv: Environment;
    if (index >= 0) {
      finalEnv = { ...env, updatedAt: now };
      envs[index] = finalEnv;
    } else {
      finalEnv = { ...env, createdAt: now, updatedAt: now };
      envs.push(finalEnv);
    }

    // Sincronizar nuevas claves de variables y headers hacia los demás entornos
    const newVarKeys = Object.keys(finalEnv.variables || {});
    const newHeaderKeys = Object.keys(finalEnv.customHeaders || {});

    for (const otherEnv of envs) {
      if (otherEnv.id === finalEnv.id) continue;
      let modifiedOther = false;

      const otherVars = { ...(otherEnv.variables || {}) };
      for (const vk of newVarKeys) {
        if (!(vk in otherVars)) {
          otherVars[vk] = '';
          modifiedOther = true;
        }
      }

      const otherHeaders = { ...(otherEnv.customHeaders || {}) };
      for (const hk of newHeaderKeys) {
        if (!(hk in otherHeaders)) {
          otherHeaders[hk] = '';
          modifiedOther = true;
        }
      }

      if (modifiedOther) {
        otherEnv.variables = otherVars;
        otherEnv.customHeaders = otherHeaders;
        otherEnv.updatedAt = now;

        if (localPgPool && isLocalPgConnected) {
          localPgPool.query(
            `UPDATE environments SET variables = $1, custom_headers = $2, updated_at = $3 WHERE id = $4`,
            [JSON.stringify(otherVars), JSON.stringify(otherHeaders), now, otherEnv.id]
          ).catch(console.error);
        }
      }
    }

    this.saveEnvironments(envs);

    if (localPgPool && isLocalPgConnected) {
      localPgPool.query(
        `INSERT INTO environments (id, name, magento_url, magento_rest_url, store_code, custom_headers, variables, use_mock_simulator, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           name = $2, magento_url = $3, magento_rest_url = $4, store_code = $5, custom_headers = $6, variables = $7, use_mock_simulator = $8, updated_at = $10`,
        [
          finalEnv.id,
          finalEnv.name,
          finalEnv.magentoUrl,
          finalEnv.magentoRestUrl || '',
          finalEnv.storeCode || '',
          JSON.stringify(finalEnv.customHeaders || {}),
          JSON.stringify(finalEnv.variables || {}),
          !!finalEnv.useMockSimulator,
          finalEnv.createdAt,
          finalEnv.updatedAt
        ]
      ).catch(console.error);
    }

    return finalEnv;
  }

  static deleteEnvironment(id: string): boolean {
    const envs = this.getEnvironments();
    const filtered = envs.filter(e => e.id !== id);
    if (filtered.length !== envs.length) {
      this.saveEnvironments(filtered);
      if (localPgPool && isLocalPgConnected) {
        localPgPool.query('DELETE FROM environments WHERE id = $1', [id]).catch(console.error);
      }
      return true;
    }
    return false;
  }

  static updateEnvironmentVariable(envId: string, varKey: string, varValue: string): void {
    const env = this.getEnvironmentById(envId);
    if (!env) return;
    const currentVars = { ...(env.variables || {}) };
    currentVars[varKey] = varValue;

    const lowerKey = varKey.toLowerCase().replace(/[-_]/g, '');
    if (lowerKey === 'cartid') {
      currentVars['CartId'] = varValue;
      currentVars['cartId'] = varValue;
      currentVars['cart_id'] = varValue;
    } else if (lowerKey === 'customertoken' || lowerKey === 'token' || lowerKey === 'authtoken') {
      currentVars['customerToken'] = varValue;
      currentVars['token'] = varValue;
      currentVars['customer_token'] = varValue;
      currentVars['AuthToken'] = varValue;
    } else if (lowerKey === 'ordernumber') {
      currentVars['orderNumber'] = varValue;
      currentVars['order_number'] = varValue;
    }

    this.upsertEnvironment({ ...env, variables: currentVars });
    if (this.settingsCache && this.settingsCache.activeEnvironmentId === envId) {
      this.settingsCache.variables = currentVars;
    }
  }

  // --- SETTINGS (LOCAL DB) ---
  static getSettings(): EnvironmentSettings {
    const envs = this.getEnvironments();
    const defaultEnv = envs[0] || DEFAULT_ENVIRONMENTS[0];
    if (!this.settingsCache) {
      this.settingsCache = readJsonFile<EnvironmentSettings>('settings.json', {
        activeEnvironmentId: defaultEnv.id,
        magentoUrl: defaultEnv.magentoUrl,
        storeCode: defaultEnv.storeCode,
        customHeaders: defaultEnv.customHeaders,
        variables: defaultEnv.variables || {},
        useMockSimulator: defaultEnv.useMockSimulator
      });
    }

    const targetId = this.settingsCache.activeEnvironmentId || defaultEnv.id;
    const activeEnv = this.getEnvironmentById(targetId) || defaultEnv;
    if (activeEnv) {
      this.settingsCache.activeEnvironmentId = activeEnv.id;
      this.settingsCache.magentoUrl = activeEnv.magentoUrl;
      this.settingsCache.magentoRestUrl = activeEnv.magentoRestUrl || '';
      this.settingsCache.useMockSimulator = activeEnv.useMockSimulator;
      this.settingsCache.customHeaders = activeEnv.customHeaders;
      this.settingsCache.variables = activeEnv.variables || {};
    }

    return this.settingsCache;
  }

  static saveSettings(settings: EnvironmentSettings): void {
    this.settingsCache = settings;
    writeJsonFile('settings.json', settings);

    if (localPgPool && isLocalPgConnected) {
      localPgPool.query(
        `INSERT INTO settings (key, data) VALUES ('environment', $1)
         ON CONFLICT (key) DO UPDATE SET data = $1`,
        [JSON.stringify(settings)]
      ).catch(console.error);
    }
  }

  // --- GLOBAL TESTS (LOCAL DB) ---
  static getGlobalTests(): GlobalTestConfig[] {
    if (this.globalTestsLoaded) return this.globalTestsCache;
    this.globalTestsCache = readJsonFile<GlobalTestConfig[]>('global_tests.json', DEFAULT_GLOBAL_TESTS);
    this.globalTestsLoaded = true;
    this.versionsCache = readJsonFile<ItemVersion[]>('versions.json', []);
    this.versionsLoaded = true;
    return this.globalTestsCache;
  }

  static saveGlobalTests(tests: GlobalTestConfig[]): void {
    this.globalTestsCache = tests;
    this.globalTestsLoaded = true;
    writeJsonFile('global_tests.json', tests);

    if (localPgPool && isLocalPgConnected) {
      for (const t of tests) {
        localPgPool.query(
          `INSERT INTO global_tests (id, data, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (id) DO UPDATE SET data = $2, updated_at = NOW()`,
          [t.id, JSON.stringify(t)]
        ).catch(console.error);
      }
    }
  }

  // --- BENCHMARK HISTORY (LOCAL DB) ---
  static getHistory(): FlowExecutionResponse[] {
    if (this.historyLoaded) return this.historyCache;
    this.historyCache = readJsonFile<FlowExecutionResponse[]>('history.json', []);
    this.historyLoaded = true;
    return this.historyCache;
  }

  static addHistoryEntry(entry: FlowExecutionResponse): void {
    const history = this.getHistory();
    history.unshift(entry);
    if (history.length > 200) history.length = 200;
    this.historyCache = history;
    this.historyLoaded = true;
    writeJsonFile('history.json', history);

    if (localPgPool && isLocalPgConnected) {
      localPgPool.query('INSERT INTO history (data) VALUES ($1)', [JSON.stringify(entry)]).catch(console.error);
    }
  }

  static clearHistory(): void {
    this.historyCache = [];
    this.historyLoaded = true;
    writeJsonFile('history.json', []);

    if (localPgPool && isLocalPgConnected) {
      localPgPool.query('TRUNCATE TABLE history').catch(console.error);
    }
  }

  // --- CENTRAL ONLINE AUTH & PERMISSIONS ---

  /**
   * Checks the user's role directly in the central online database.
   * If the user is found, returns their assigned role ('ADMIN' or 'DEVELOPER').
   * If not found, registers them as 'DEVELOPER' and returns 'DEVELOPER'.
   */
  static async checkUserRoleOnline(email: string, name?: string): Promise<'ADMIN' | 'DEVELOPER'> {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) return 'DEVELOPER';

    if (sharedPgPool && isSharedPgConnected) {
      try {
        const res = await sharedPgPool.query(
          'SELECT role FROM shared_team_members WHERE LOWER(email) = $1',
          [cleanEmail]
        );
        if (res.rows.length > 0) {
          const role = (res.rows[0].role || 'DEVELOPER').toUpperCase();
          return role === 'ADMIN' ? 'ADMIN' : 'DEVELOPER';
        }

        // Auto-register developer in central database if not registered yet
        if (name) {
          await sharedPgPool.query(
            `INSERT INTO shared_team_members (email, name, role, created_at, updated_at)
             VALUES ($1, $2, 'DEVELOPER', NOW(), NOW())
             ON CONFLICT (email) DO NOTHING`,
            [cleanEmail, name.trim()]
          );
        }
      } catch (err: any) {
        console.error('Error checking user role online:', err.message);
      }
    }
    return 'DEVELOPER';
  }

  /**
   * Verifies the master pin against the hash stored in shared_system_config in the online database.
   */
  static async verifyMasterPinOnline(pin: string): Promise<boolean> {
    if (!pin) return false;
    const cleanPin = pin.trim();
    const pinHash = crypto.createHash('sha256').update(cleanPin).digest('hex');

    if (sharedPgPool && isSharedPgConnected) {
      try {
        const res = await sharedPgPool.query(
          "SELECT config_value FROM shared_system_config WHERE config_key = 'admin_master_pin_hash'"
        );
        if (res.rows.length > 0) {
          return res.rows[0].config_value === pinHash;
        }
      } catch (err: any) {
        console.error('Error verifying master pin online:', err.message);
      }
    }

    // Fallback if DB not reachable
    const expectedKey = process.env.ADMIN_SECRET_KEY || 'admin_flowrunner_2026';
    return cleanPin === expectedKey;
  }

  /**
   * Promotes or registers a user as ADMIN in the online central database.
   */
  static async setMemberRoleOnline(email: string, role: 'ADMIN' | 'DEVELOPER', name?: string): Promise<boolean> {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) return false;

    if (sharedPgPool && isSharedPgConnected) {
      try {
        await sharedPgPool.query(
          `INSERT INTO shared_team_members (email, name, role, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (email) DO UPDATE SET role = $3, updated_at = NOW()`,
          [cleanEmail, name ? name.trim() : cleanEmail.split('@')[0], role]
        );
        return true;
      } catch (err: any) {
        console.error('Error updating member role online:', err.message);
      }
    }
    return false;
  }

  /**
   * Returns all team members and their roles from the online database.
   */
  static async getTeamMembersOnline(): Promise<Array<{ email: string; name: string; role: string; createdAt: string; updatedAt: string }>> {
    if (sharedPgPool && isSharedPgConnected) {
      try {
        const res = await sharedPgPool.query(
          'SELECT email, name, role, created_at, updated_at FROM shared_team_members ORDER BY role ASC, name ASC'
        );
        return res.rows.map(r => ({
          email: r.email,
          name: r.name,
          role: r.role,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        }));
      } catch (err: any) {
        console.error('Error fetching team members online:', err.message);
      }
    }
    return [];
  }

  // --- VERSIONING & SNAPSHOT SYSTEM ---

  static getVersions(): ItemVersion[] {
    if (!this.versionsLoaded) {
      this.versionsCache = readJsonFile<ItemVersion[]>('versions.json', []);
      this.versionsLoaded = true;
    }
    return this.versionsCache;
  }

  /**
   * Records a point-in-time snapshot of an entity (FLOW, VARIANT, or CATEGORIES).
   */
  static recordVersion(
    entityType: 'FLOW' | 'VARIANT' | 'CATEGORIES',
    entityId: string,
    snapshot: any,
    user?: Partial<UserProfile>,
    changeSummary?: string
  ): ItemVersion {
    const versions = this.getVersions();
    const entityVersions = versions.filter(v => v.entityType === entityType && v.entityId === entityId);
    const maxVer = entityVersions.reduce((max, v) => (v.versionNumber > max ? v.versionNumber : max), 0);
    const nextVer = maxVer + 1;

    const newVersion: ItemVersion = {
      id: `ver-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      entityType,
      entityId,
      versionNumber: nextVer,
      snapshot: JSON.parse(JSON.stringify(snapshot)),
      createdBy: user?.email || 'dev@kosmos.test',
      createdByName: user?.name || 'Desarrollador',
      changeSummary: changeSummary || `Versión ${nextVer}`,
      createdAt: new Date().toISOString()
    };

    versions.unshift(newVersion);
    this.versionsCache = versions;
    this.versionsLoaded = true;
    writeJsonFile('versions.json', versions);

    if (sharedPgPool && isSharedPgConnected) {
      sharedPgPool.query(
        `INSERT INTO item_versions (id, entity_type, entity_id, version_number, snapshot, created_by, created_by_name, change_summary, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          newVersion.id,
          newVersion.entityType,
          newVersion.entityId,
          newVersion.versionNumber,
          JSON.stringify(newVersion.snapshot),
          newVersion.createdBy,
          newVersion.createdByName,
          newVersion.changeSummary,
          newVersion.createdAt
        ]
      ).catch(e => console.error('Error guardando versión en PG:', e.message));
    }

    return newVersion;
  }

  /**
   * Retrieves all historical versions for an entity.
   */
  static async getEntityVersions(entityType: 'FLOW' | 'VARIANT' | 'CATEGORIES', entityId: string): Promise<ItemVersion[]> {
    if (sharedPgPool && isSharedPgConnected) {
      try {
        const res = await sharedPgPool.query(
          `SELECT id, entity_type as "entityType", entity_id as "entityId",
                  version_number as "versionNumber", snapshot, created_by as "createdBy",
                  created_by_name as "createdByName", change_summary as "changeSummary",
                  created_at as "createdAt"
           FROM item_versions
           WHERE entity_type = $1 AND entity_id = $2
           ORDER BY version_number DESC`,
          [entityType, entityId]
        );
        if (res.rows.length > 0) {
          return res.rows.map(r => ({
            ...r,
            snapshot: typeof r.snapshot === 'string' ? JSON.parse(r.snapshot) : r.snapshot,
            createdAt: new Date(r.createdAt).toISOString()
          }));
        }
      } catch (err: any) {
        console.error('Error recuperando versiones de PG:', err.message);
      }
    }

    const versions = this.getVersions();
    const filtered = versions
      .filter(v => v.entityType === entityType && v.entityId === entityId)
      .sort((a, b) => b.versionNumber - a.versionNumber);

    // If no versions exist yet, record the current entity as version 1 baseline
    if (filtered.length === 0) {
      if (entityType === 'FLOW') {
        const f = this.getFlowById(entityId);
        if (f) {
          const v1 = this.recordVersion('FLOW', entityId, f, { email: f.createdBy, name: f.createdByName }, 'Versión inicial (Línea base)');
          return [v1];
        }
      } else if (entityType === 'VARIANT') {
        const v = this.getVariantById(entityId);
        if (v) {
          const v1 = this.recordVersion('VARIANT', entityId, v, { email: v.createdBy, name: v.createdByName }, 'Versión inicial (Línea base)');
          return [v1];
        }
      } else if (entityType === 'CATEGORIES') {
        const cats = this.getCategories();
        const v1 = this.recordVersion('CATEGORIES', 'all_categories', cats, undefined, 'Estado inicial de categorías');
        return [v1];
      }
    }

    return filtered;
  }

  /**
   * Rolls back an entity to a specific historical version snapshot.
   */
  static async rollbackEntityVersion(
    entityType: 'FLOW' | 'VARIANT' | 'CATEGORIES',
    entityId: string,
    versionId: string,
    user?: Partial<UserProfile>
  ): Promise<any> {
    const versions = await this.getEntityVersions(entityType, entityId);
    const targetVersion = versions.find(v => v.id === versionId || String(v.versionNumber) === versionId);
    if (!targetVersion) {
      throw new Error(`Versión no encontrada para ${entityType} ${entityId}`);
    }

    const snapshot = targetVersion.snapshot;

    if (entityType === 'FLOW') {
      const restoredFlow: SavedFlow = {
        ...snapshot,
        id: entityId,
        updatedBy: user?.email || 'dev@kosmos.test',
        updatedByName: user?.name || 'Desarrollador',
        updatedAt: new Date().toISOString()
      };
      this.upsertFlow(restoredFlow, user, `Restaurado a versión v${targetVersion.versionNumber}`);
      return restoredFlow;
    } else if (entityType === 'VARIANT') {
      const restoredVar: Variant = {
        ...snapshot,
        id: entityId,
        updatedBy: user?.email || 'dev@kosmos.test',
        updatedByName: user?.name || 'Desarrollador',
        updatedAt: new Date().toISOString()
      };
      this.upsertVariant(restoredVar, user, `Restaurado a versión v${targetVersion.versionNumber}`);
      return restoredVar;
    } else if (entityType === 'CATEGORIES') {
      const restoredCats: string[] = Array.isArray(snapshot) ? snapshot : snapshot.categories || [];
      this.categoriesCache = Array.from(new Set(restoredCats));
      writeJsonFile('categories.json', this.categoriesCache);

      if (sharedPgPool && isSharedPgConnected) {
        for (const cat of this.categoriesCache) {
          await sharedPgPool.query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [cat]);
        }
      }

      this.recordVersion(
        'CATEGORIES',
        'all_categories',
        this.categoriesCache,
        user,
        `Restaurado a versión v${targetVersion.versionNumber}`
      );
      return this.categoriesCache;
    }
  }
}
