/**
 * ObShare Token Proxy - Cloudflare Workers
 *
 * 用于安全地管理飞书 API 凭证和 Token 缓存
 * 客户端从此 Worker 获取 access_token，然后直接调用飞书 API
 */

interface Env {
  FEISHU_APP_ID: string;
  FEISHU_APP_SECRET: string;
  API_KEY: string; // 保护 Worker 端点的 API Key（必填）
  TOKEN_CACHE: KVNamespace;
}

interface CachedToken {
  token: string;
  expireAt: number; // Unix 时间戳（秒）
}

interface FeishuTokenResponse {
  code: number;
  msg: string;
  tenant_access_token: string;
  expire: number;
}

const CACHE_KEY = 'feishu_tenant_token';
const TOKEN_BUFFER = 30 * 60; // 提前30分钟刷新

// CORS 响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * 返回 JSON 响应
 */
function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

/**
 * 返回错误响应
 */
function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * 验证 API Key
 */
function validateApiKey(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return false;
  }

  // 支持 "Bearer <key>" 格式
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return false;
  }

  return parts[1] === env.API_KEY;
}

/**
 * 从飞书获取新的 tenant_access_token
 */
async function fetchTokenFromFeishu(env: Env): Promise<{ token: string; expire: number }> {
  const response = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: env.FEISHU_APP_ID,
        app_secret: env.FEISHU_APP_SECRET,
      }),
    }
  );

  const result = await response.json() as FeishuTokenResponse;

  if (result.code !== 0) {
    throw new Error(`飞书 API 错误: ${result.msg}`);
  }

  return {
    token: result.tenant_access_token,
    expire: result.expire,
  };
}

/**
 * 处理获取 Token 请求
 */
async function handleGetToken(env: Env): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);

  // 1. 尝试从 KV 缓存获取
  try {
    const cached = await env.TOKEN_CACHE.get(CACHE_KEY, { type: 'json' }) as CachedToken | null;

    if (cached && cached.expireAt > now + TOKEN_BUFFER) {
      // 缓存有效，直接返回
      return jsonResponse({
        access_token: cached.token,
        expires_in: cached.expireAt - now,
        cached: true,
      });
    }
  } catch (error) {
    // 缓存读取失败，继续获取新 token
    console.error('KV 缓存读取失败:', error);
  }

  // 2. 从飞书获取新 token
  try {
    const { token, expire } = await fetchTokenFromFeishu(env);
    const expireAt = now + expire;

    // 3. 存入 KV 缓存
    try {
      await env.TOKEN_CACHE.put(
        CACHE_KEY,
        JSON.stringify({ token, expireAt } as CachedToken),
        { expirationTtl: expire }
      );
    } catch (cacheError) {
      // 缓存写入失败不影响返回结果
      console.error('KV 缓存写入失败:', cacheError);
    }

    return jsonResponse({
      access_token: token,
      expires_in: expire,
      cached: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    console.error('获取 token 失败:', message);
    return errorResponse(message, 500);
  }
}

/**
 * 处理健康检查请求
 */
function handleHealthCheck(): Response {
  return jsonResponse({
    status: 'ok',
    service: 'obshare-token-proxy',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Worker 入口
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 健康检查端点（不需要认证）
    if (path === '/health' && request.method === 'GET') {
      return handleHealthCheck();
    }

    // 验证 API Key
    if (!validateApiKey(request, env)) {
      return errorResponse('Unauthorized: Invalid or missing API key', 401);
    }

    // 路由处理
    if (path === '/token' && request.method === 'GET') {
      return handleGetToken(env);
    }

    return errorResponse('Not Found', 404);
  },
};
