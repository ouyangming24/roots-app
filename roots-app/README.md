# RootPath · 英语词根词缀学习

中文界面的词根/词缀学习小程序：艾宾浩斯间隔重复、多种练习模式、计时历史、每日计划与进度仪表。

## 本地运行

```bash
npm install
env -u DATABASE_URL npm run dev
```

打开 http://127.0.0.1:3000 。本地使用 PGlite（内存 Postgres），并通过 `cursor/identity.dev.ts` 模拟登录用户。

## 数据

- 词库：`public/data/roots.json`（与 `docs/english-roots-affixes.md` 配套）
- Schema：`migrations/*.sql`
- 发布时声明 Postgres：`cursor-app.json`

## 构建

```bash
npm run build
```

有 `DATABASE_URL` 时会在 build 末尾执行迁移。
