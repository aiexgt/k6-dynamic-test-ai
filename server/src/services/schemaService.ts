import { getIntrospectionQuery } from 'graphql';
import { Database } from '../storage/db';
import { Environment, EnvironmentSettings } from '../types';

interface CachedSchema {
  schema: any;
  typesCount: number;
  fetchedAt: string;
  sourceUrl: string;
}

// In-memory cache for schema introspection
const schemaCache = new Map<string, CachedSchema>();

export class SchemaService {
  /**
   * Normaliza la URL de GraphQL para un entorno o URL dada
   */
  static resolveGraphqlUrl(environment?: Environment | null, settings?: EnvironmentSettings | null, customUrl?: string): string {
    if (customUrl && customUrl.trim()) {
      return customUrl.trim();
    }

    if (environment) {
      let base = (environment.magentoUrl || '').trim().replace(/\/+$/, '');
      if (base) {
        return base.endsWith('/graphql') ? base : `${base}/graphql`;
      }
    }

    if (settings) {
      let base = (settings.magentoUrl || '').trim().replace(/\/+$/, '');
      if (base) {
        return base.endsWith('/graphql') ? base : `${base}/graphql`;
      }
    }

    return 'https://magento.test/graphql';
  }

  /**
   * Obtiene los headers requeridos para la petición de introspección
   */
  static resolveHeaders(environment?: Environment | null, settings?: EnvironmentSettings | null, customHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(settings?.customHeaders || {}),
      ...(environment?.customHeaders || {}),
      ...(customHeaders || {})
    };

    // Customer Token / Auth
    const token = environment?.variables?.customerToken ||
      environment?.variables?.token ||
      settings?.customHeaders?.Authorization;

    if (token && !headers['Authorization'] && !headers['authorization']) {
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Ejecuta la Introspección contra el endpoint objetivo
   */
  static async introspect(options: {
    environmentId?: string;
    endpointUrl?: string;
    headers?: Record<string, string>;
    forceRefresh?: boolean;
  }): Promise<{
    success: boolean;
    schema?: any;
    typesCount: number;
    fetchedAt: string;
    sourceUrl: string;
    error?: string;
  }> {
    const settings = Database.getSettings();
    let targetEnv: Environment | null = null;

    if (options.environmentId) {
      targetEnv = Database.getEnvironmentById(options.environmentId) || null;
    } else if (settings.activeEnvironmentId) {
      targetEnv = Database.getEnvironmentById(settings.activeEnvironmentId) || null;
    }

    const targetUrl = this.resolveGraphqlUrl(targetEnv, settings, options.endpointUrl);
    const headers = this.resolveHeaders(targetEnv, settings, options.headers);

    // Revisar caché si no se fuerza el refresco
    if (!options.forceRefresh && schemaCache.has(targetUrl)) {
      const cached = schemaCache.get(targetUrl)!;
      return {
        success: true,
        schema: cached.schema,
        typesCount: cached.typesCount,
        fetchedAt: cached.fetchedAt,
        sourceUrl: cached.sourceUrl
      };
    }

    try {
      const introspectionQuery = getIntrospectionQuery();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: introspectionQuery }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
      }

      const json: any = await res.json();
      if (json.errors && json.errors.length > 0) {
        const msg = json.errors.map((e: any) => e.message).join('; ');
        throw new Error(`GraphQL Errors en introspección: ${msg}`);
      }

      if (!json.data || !json.data.__schema) {
        throw new Error('La respuesta del servidor no contiene __schema de GraphQL válido');
      }

      const typesCount = json.data.__schema.types ? json.data.__schema.types.length : 0;
      const cachedRecord: CachedSchema = {
        schema: json.data,
        typesCount,
        fetchedAt: new Date().toISOString(),
        sourceUrl: targetUrl
      };

      schemaCache.set(targetUrl, cachedRecord);

      return {
        success: true,
        schema: json.data,
        typesCount,
        fetchedAt: cachedRecord.fetchedAt,
        sourceUrl: targetUrl
      };
    } catch (err: any) {
      const isAbort = err.name === 'AbortError';
      const errorMsg = isAbort
        ? `Timeout al conectar con ${targetUrl} (20s)`
        : (err.message || 'Error desconocido al ejecutar introspección');

      // Si falló pero tenemos un caché previo, podemos devolver el caché con advertencia
      if (schemaCache.has(targetUrl)) {
        const cached = schemaCache.get(targetUrl)!;
        return {
          success: true,
          schema: cached.schema,
          typesCount: cached.typesCount,
          fetchedAt: cached.fetchedAt,
          sourceUrl: cached.sourceUrl,
          error: `Aviso (usando caché previo): ${errorMsg}`
        };
      }

      return {
        success: false,
        typesCount: 0,
        fetchedAt: new Date().toISOString(),
        sourceUrl: targetUrl,
        error: errorMsg
      };
    }
  }

  /**
   * Obtiene el esquema en caché para el entorno actual sin forzar llamada de red
   */
  static getCachedForUrl(url: string): CachedSchema | null {
    return schemaCache.get(url) || null;
  }
}
