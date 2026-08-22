# Changelog

## 1.0.0 稳定版复核(2026-08-22)

v1.0.0(tag `c75ffd2`,2026-08-21 发布)于 2026-08-22 完成稳定版六步复核,现 HEAD(43e7b70)仅多文档提交。

### 复核结论

- **测试**:45/45 通过(7 个测试文件,vitest + Testing Library)。
- **审核**:Rust 侧仅托管 SQL 插件 + 2 个迁移(lib.rs 30 行,无自定义 command);capabilities 收紧为 `sql:*` + 三个窗口操作权限;前端无 `dangerouslySetInnerHTML`/`eval`/`new Function`;**零远程请求**(纯本地应用)。
- **已知约束**:`tauri.conf.json` 的 `csp: null`——因应用零远程加载面 + capabilities 紧凑,记录为可接受风险;若未来引入远程内容必须先收紧 CSP。
- **发布物**:`flow-evolver_1.0.0_aarch64.dmg`,SHA256 `27401db8a647dbf450e2dc833826d21658bd6f92b52c0dfa44f4f1656e6e8233`(ad-hoc 签名,未公证,安装前核对校验和)。
- **干净构建**:剔除 node_modules/target 后全新 install + `tsc && vite build` 通过(2026-08-22)。

## 1.0.0 (2026-08-21)

首个正式版:自适应专注计时器(Tauri 2 + React 19)。含设置/历史面板、误触地板、SQL 写锁修复、sub-10s 可见提示等(见 git log `v0.2.1..v1.0.0`)。
