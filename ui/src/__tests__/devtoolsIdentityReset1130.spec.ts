import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 1130：DevTools 必须响应换号事件。
 *
 * 缺口实证：`onIdentityChanged`（App.vue）会清 ioRecorder / store / 各类模块缓存，
 * 但 DevTools 组件内的局部状态（Tab 草稿、变量弹窗草稿 varsMap、响应过滤表达式）
 * 完全没有监听 `esquerystudio:identity-changed`——换号后上一个账号的请求路径、
 * 变量值、过滤表达式仍留在页面上，下一个用户点执行就会带着它们发出去。
 *
 * 与「存储层已清 es_vars」不是一回事：内存草稿不落盘也照样在屏幕上。
 */
const view = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('DevTools 换号清理（1130）', () => {
  it('监听 esquerystudio:identity-changed', () => {
    expect(view).toContain("'esquerystudio:identity-changed'");
  });

  it('卸载时摘除该监听（避免泄漏）', () => {
    const unmount = view.match(/onBeforeUnmount\(\(\) => \{[\s\S]{0,600}?\n\}\);/);
    expect(unmount).toBeTruthy();
    expect(unmount![0]).toContain('removeEventListener');
    expect(unmount![0]).toContain('identity');
  });

  it('换号时清空：Tab 草稿、变量草稿、过滤表达式，并关闭两个弹窗', () => {
    const at = view.indexOf('function onIdentityReset');
    expect(at).toBeGreaterThan(-1);
    const seg = view.slice(at, at + 900);
    expect(seg).toMatch(/tabs\.value\s*=/);          // Tab 回到默认
    expect(seg).toContain('varsMap.value = {}');     // 变量草稿清零
    expect(seg).toContain("respFilter.expr = ''");   // 过滤表达式清零
    expect(seg).toContain('varsOpen.value = false'); // 弹窗关闭
    expect(seg).toContain('curlOpen.value = false');
  });

  it('换号清理必须发生在新身份可用之前不留旧响应（清 result）', () => {
    const at = view.indexOf('function onIdentityReset');
    const seg = view.slice(at, at + 900);
    /* 重建默认 Tab 即丢掉旧 result：断言走的是 DEFAULT_TABS（默认三标签单点）而非原地保留 */
    expect(seg).toContain('DEFAULT_TABS()');
  });

  /* 1132：跨 Tab 历史汇聚是**内存镜像**。磁盘键（es_devtools_hist_all:*）已被
     purgeUserRequestState 按 es_devtools_ 前缀清掉，但 ref 不重置就会在同一会话内
     换号后继续显示上一账号的请求历史，直到切目标或刷新才消失。 */
  it('换号时清空跨 Tab 历史汇聚与历史作用域', () => {
    const at = view.indexOf('function onIdentityReset');
    const seg = view.slice(at, at + 900);
    expect(seg).toContain('histAll.value = []');
    expect(seg).toContain("histScope.value = 'tab'");
  });
});

/**
 * 其余视图靠「换号即重挂载」兜底：App 的 <component :key> 含 username。
 * 这是 RestView / IlmView / IndexHub / Templates / ReindexAdvanced 这类
 * 「有内存草稿但未自己监听换号」的视图不会把上一账号现场留给下一个人的**唯一依据**——
 * 一旦这个 key 被改成不含 username，那些视图立刻回退成污染源，故在此钉死。
 */
describe('换号重挂载兜底（1130）', () => {
  const app = readFileSync(join(__dirname, '../App.vue'), 'utf-8');

  it('<component :key> 必须包含 auth.me?.username', () => {
    const m = app.match(/<component\s+:is="Component"\s+:key="([^"]+)"/);
    expect(m, 'App.vue 的视图渲染 key 未找到').toBeTruthy();
    expect(m![1]).toContain('username');
  });

  it('key 同时包含 route.path 与 target（换页/换目标也要重挂）', () => {
    const m = app.match(/<component\s+:is="Component"\s+:key="([^"]+)"/);
    expect(m![1]).toContain('route.path');
    expect(m![1]).toContain('target');
  });
});
