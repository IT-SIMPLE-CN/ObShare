# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

ObShare 是一个 Obsidian 插件，用于将笔记同步分享到飞书云文档。它将 Obsidian Markdown 转换为飞书文档格式，处理图片上传，并管理文档权限。

## 构建命令

```bash
# 开发模式（监听文件变化，包含 inline sourcemap）
npm run dev

# 生产构建（类型检查 + 打包输出）
npm run build
```

构建使用 esbuild，入口为 `main.ts`，输出到 `main.js`。构建后需重新加载 Obsidian 测试变更。

## 架构

### 核心模块

**main.ts** - 插件入口与流程编排
- `FeishuUploaderPlugin`：主插件类，管理设置、命令和上传流程
- `FeishuUploaderSettingTab`：设置界面
- `UploadProgressModal`：上传进度实时显示
- 注册命令：「分享当前文档到飞书」、右键菜单、侧边栏按钮

**feishu-api.ts** - 飞书 API 客户端
- `FeishuApiClient`：处理认证（tenant access token，提前30分钟刷新）、文件上传、文档创建/修改
- 删除操作限速（350ms 间隔，防止超频）
- Mermaid 图片缓存提升上传效率

### 格式转换器

将 Obsidian 特有语法转换为飞书兼容格式：

| 模块 | 功能 |
|------|------|
| `callout-converter.ts` | Obsidian callout（> [!NOTE]）→ 飞书高亮块，含颜色映射 |
| `yaml-processor.ts` | YAML frontmatter → 飞书 callout 块 |
| `mermaid-converter.ts` | 通过 Obsidian 渲染器渲染 Mermaid 图表，截取为 PNG 上传 |
| `svg-converter.ts` | SVG 图片 → PNG（使用 Canvas API） |
| `link-processor.ts` | 双链（`[[笔记]]`）处理，双链模式下递归上传引用文档 |

### 工具模块

**smart-update.ts** - 根据标题检测已有文档，原地更新而非创建重复文档。

### 数据流程

1. 用户触发上传 → `main.ts:uploadFile()`
2. 内容预处理：YAML → Callout → 双链 → 图片/Mermaid
3. `feishu-api.ts`：通过导入 API 创建文档，上传图片素材
4. 后处理：替换图片占位符、设置权限
5. 存入上传历史并保存设置

## 关键模式

- 所有模块使用静态 `setDebugEnabled()` 控制调试日志
- 设置存储于 `data.json`（明文）
- API 调用计数用于使用量统计
- `NotificationManager` 实现通知去重

## 插件清单

- ID：`obshare`
- 最低 Obsidian 版本：1.9.12
- 入口：`main.js`
