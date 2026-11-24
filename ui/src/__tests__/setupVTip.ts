/**
 * vitest setup（setupFiles 第二项，setupFetchGuard 之后）：v-tip 指令在全部单测中不产生
 * 「Failed to resolve directive: tip」告警。本项目挂载型 spec 全部走 createApp 手工挂载
 * （@vue/test-utils 并未安装，引用它的文件均为 vi.mock），而 Vue 3 没有跨 app 的全局
 * 指令注册表、ESM 模块导出不可改写——setup 层无法向各 spec 自建的 app 注入指令；
 * 未注册指令在 Vue 中仅 dev 告警、不抛错不改变行为（v-tip 无触发即无 DOM 副作用），
 * 故对这一条特定告警做 console.warn 过滤兜底。
 * 项目挂具惯例（mountComp 的 app.config.warnHandler 静音）已覆盖大部分场景，此处兜其余。
 * 需要断言 v-tip 行为的 spec 自行 app.directive('tip', vTip) 注册（vTip.spec.ts 示范）。
 */
const SUPPRESS = 'Failed to resolve directive: tip';
const origWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes(SUPPRESS)) return;
  origWarn(...args);
};
