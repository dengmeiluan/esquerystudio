# ESQueryStudio 交互规范 Checklist

> 新增/修改视图与组件时的交互规范。每一条背后都有对应守卫 spec，违反即在 CI 门禁暴露。

## 1. 列表行 / 卡片（可点击行）

- [ ] `role="button"` + `tabindex="0"` + `@keydown.enter.prevent="<同 @click 表达式>"`
- [ ] `aria-label` 描述动作与对象（如「填入 GET /_cat/indices」）
- [ ] 行内嵌套的原生 `<button>`（重跑/删除）保留 `@click.stop`

## 2. 排序表头（自制表）

- [ ] `tabindex="0"` + `@keydown.enter.prevent` + `@keydown.space.prevent`
- [ ] `:aria-sort`（`descending`/`ascending`/缺省）
- [ ] 优先复用 `useTableSort`（composables/tableSort.ts），不要重写排序

## 3. 弹层 / 浮层

- [ ] 确认类用 `ConfirmModal`（自动获得 Esc/Enter/焦点管理/critical guardText）
- [ ] 自绘浮层必须实现：Esc 关闭（capture 监听 + `onBeforeUnmount` 移除）+ 遮罩点击关闭
- [ ] `FocusableSurface`（聚焦放大）：同钮双态已内建，勿再自绘进入/退出钮
- [ ] 聚焦态下原本在面外的操作（翻页/导出/重置）必须在面内补等效入口（449/450/461）

## 4. 执行反馈

- [ ] 数据查询/长任务：页根 `position:relative` + 顶部 `<div class="pg-progress ind-bar" :class="{ on: busy }">`
- [ ] 主执行按钮加 `.btn-run-lock`（min-width 9.5em，busy 文字变长不推挤布局）
- [ ] busy 态：按钮 `:disabled` + 图标 `:class="{ spinning: busy }"`
- [ ] 异步函数 loading 守卫：`if (loading.value) return;` + `finally { loading.value = false; }`

## 5. 过滤 / 搜索输入

- [ ] placeholder 含「搜索/过滤/筛选/查找」的输入框：`@keydown.esc.prevent="<var> = ''"`
- [ ] 结果内查找复用 `useGridSearch`；空词不显示 0/0 假计数

## 6. 样式

- [ ] 跨视图通用样式写进 `theme.css`，**禁止**视图内重复定义（.spinning/.kbd.inline/
      .kbd-mini/.pg-progress/.focus-tools/.dim/.sm-txt 已收编，回归即红）
- [ ] 图标尺寸 ≥10（8px 仅限 HealthReport 状态圆点特例）
- [ ] 数字列/计数：容器具备 `tabular-nums`（theme 已覆盖 .tbl td/.qrt-tbl td）
- [ ] 工具行（多按钮+统计）：容器 `flex-wrap: wrap`、子项 `white-space: nowrap`
- [ ] 主题色一律用 token（`var(--tx1)` 等，禁止硬编码 hex）——WCAG 审计按 token 计算

## 7. 持久化

- [ ] 视图模式/折叠态等用户偏好：`usePref`（自动 localStorage 持久化）
- [ ] 查询类内容体量大：`useScopedDraft`（route+target 隔离）
- [ ] 同值赋值不会触发 watch——需要「变化检测」的逻辑勿依赖同值写

## 8. 聚焦放大（FocusableSurface）

- [ ] 双态已内建：聚焦 Maximize2 ↔ 还原 Minimize2，勿自绘退出钮
- [ ] **聚焦态操作可达**：面外的工具行（翻页/导出/重置/切视图）必须在面内补等效入口
- [ ] 切视图/清空数据时同步 `focusPaneId = null`（防状态残留全屏空表）
- [ ] 禁用的视图钮升级为「点击自动解锁」（如 Sandbox explain/profile 自动勾选请求选项）

## 9. 键盘与 roving

- [ ] 分页器：焦点在分页器任一控件时 ←/→ 翻页（`onArrow` 守卫 INPUT/SELECT 不拦截）
- [ ] 标签页组（DevTools dt-tabs）：聚焦后 ←/→ 切换 + 重命名输入中豁免
- [ ] 模式切换器：roving tabindex（←→/Home/End 移焦点，Enter 激活）
- [ ] 新增键盘交互必须同步登记 `components/HotkeyPanel.vue`（「有功能没人知道」防重演）

## 10. 导出

- [ ] 文件名：`语义前缀-${exportStamp()}.扩展名`（禁止 toISOString——UTC 日期陷阱）
- [ ] 组装：`csvText(head, rows)`（CSV）/ `downloadText`（BOM 可选），勿手拼
- [ ] 异步导出：`expRunning` 类守卫 + 取消按钮 + 进行中计数
