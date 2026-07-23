# 前端说明（dfrobot_mmWave/frontend）

Home Assistant mmWave 控制台前端（React + Vite）。

## 本地运行

在插件根目录或本目录：

```bash
npm install
npm run dev
```

常用地址：

- `http://127.0.0.1:5173`
- Mock 模式：`http://127.0.0.1:5173/?mock=1`（不依赖后端与 HA）

开发代理默认把 `/api` 转到 `http://localhost:42069`（见 `vite.config.ts`）。

## 主要页面

- 欢迎页：仅首次进入；写入 `localStorage` 后刷新直达控制台
- 设备总览 / 设备详情 / 设备管理 / 区域管理
- 区域管理：探测范围、标签区域、参数、底图；支持恢复出厂设置

## 相关文档

- [插件使用文档](../DOCS.md)
- [后端 API](../backend/README_API.md)
- [仓库总说明](../../README.md)
