# Mapping 冲突转 Adhoc 重建

ES 不允许原地改变既有字段的核心语义。startup reconciler 检出这些差异时只报告 `CONFLICT`，不会删除字段、覆盖 type 或自动执行重建。

## 不能原地完成的变更

- `object` -> `nested`
- `text` -> `keyword`
- `long` -> `date`
- 既有 `analyzer` / `search_analyzer` 变化
- 既有 `normalizer` 变化
- 既有日期 `format` 变化

典型日志明确给出 actual、desired、path 与 action：

```text
[MappingReconcile] indexKey=tradeOrder index=trade_order path=properties.legs actual=object desired=nested status=CONFLICT action=USE_ADHOC_REBUILD
[MappingReconcile] indexKey=tradeOrder index=trade_order path=properties.description actual=text desired=keyword status=CONFLICT action=USE_ADHOC_REBUILD
[MappingReconcile] indexKey=tradeOrder index=trade_order path=properties.tradeTime actual=long desired=date status=CONFLICT action=USE_ADHOC_REBUILD
[MappingReconcile] indexKey=tradeOrder index=trade_order path=properties.code.normalizer actual=<missing> desired=lowercase status=CONFLICT action=USE_ADHOC_REBUILD
```

`conflict-policy=warn` 只允许同一请求中独立的新字段继续追加，不会让这些冲突变更变得可写，也不会清除 `USE_ADHOC_REBUILD`。

## 安全处理步骤

先确认当前目标边界：顶栏全局数据目标选择器及其 `X-Es-Target` 请求头**不控制 Adhoc**。当前 Adhoc 仍绑定 host/control-cluster local client；Adhoc target-aware routing 是更大范围的后续能力，本次 startup-mapping 功能中**尚未交付**。

非 host 业务目标必须同时具备 **Adhoc 专属目标选择器**、明确展示集群身份/地址/索引的**执行预览**、以及执行请求和作业绑定同一目标的**后端目标路由与确认**。缺任一项都必须 **STOP**，先协调部署/升级；当前仓库没有可替代的任意非 host 目标 Adhoc 工作流。

1. 在业务应用 `/internal/es/index/desired-state.html` 复制该索引的完整期望配置。
2. 打开 宿主应用，按上述边界确认 Adhoc 实际绑定目标；不得用全局选择器推断。
3. 进入 Adhoc 托管重建，粘贴期望配置，确认 alias、源物理索引和新物理索引计划。
4. 运行 validate 与 dry-run，逐项核对冲突 path、actual、desired、settings 引用和数据转换风险。
5. 对 `long` -> `date` 等存储形态变化明确转换策略；无法无损解释的数据不得直接执行。
6. 执行重建，观察全量复制、增量追平与别名切换；完成后验证文档数、抽样查询、mapping 和写别名。
7. 保留旧物理索引到回滚窗口结束，再按既定运维流程清理；startup reconciler 不会自动删除它。

自动对账没有“强制覆盖”路径：不会 auto delete，不会 type update，也不会把冲突伪装成成功。`USE_ADHOC_REBUILD` 是要求新建兼容目标并迁移的操作指引。
