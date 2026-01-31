# ObShare Token Proxy

Cloudflare Workers Token 代理服务，用于安全管理飞书 API 凭证。

## 功能

- 安全存储飞书 appId/appSecret（使用 Workers Secrets）
- 统一获取和缓存 tenant_access_token（使用 Workers KV）
- 通过 API Key 保护端点

## 部署步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 KV 命名空间

```bash
npx wrangler kv:namespace create TOKEN_CACHE
```

将返回的 `id` 填入 `wrangler.toml` 中的 `[[kv_namespaces]]` 配置。

### 3. 配置 Secrets

```bash
# 飞书应用凭证
npx wrangler secret put FEISHU_APP_ID
npx wrangler secret put FEISHU_APP_SECRET

# API Key（用于保护端点，自己生成一个随机字符串）
npx wrangler secret put API_KEY
```

### 4. 部署

```bash
npm run deploy
```

部署成功后会返回 Worker URL，如 `https://obshare-token-proxy.your-subdomain.workers.dev`

## API 接口

### GET /token

获取飞书 access_token。

**请求头**：
```
Authorization: Bearer <your-api-key>
```

**响应**：
```json
{
  "access_token": "t-xxx...",
  "expires_in": 7200,
  "cached": true
}
```

### GET /health

健康检查（不需要认证）。

**响应**：
```json
{
  "status": "ok",
  "service": "obshare-token-proxy",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 在 ObShare 插件中配置

1. 在插件设置中填入：
   - **Token 代理 URL**：你的 Worker URL（如 `https://obshare-token-proxy.xxx.workers.dev`）
   - **API Key**：你在步骤 3 中设置的 API_KEY
   - **文件夹 Token**：飞书云空间文件夹的 Token

2. 点击"测试连接"验证配置是否正确

## 本地开发

```bash
# 启动本地开发服务器
npm run dev

# 查看日志
npm run tail
```

## 安全说明

- appId/appSecret 仅存储在 Cloudflare Workers Secrets 中，客户端无法访问
- 所有请求都需要有效的 API Key
- Token 缓存在 KV 中，提前 30 分钟刷新避免过期
