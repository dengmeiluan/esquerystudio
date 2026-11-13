/**
 * 开发者工具写请求“发起点”守卫锁：
 * - RestView 的 send/重试/Enter 最终都汇入 doSend，doSend 必须自己再判一次；
 * - DevTools 的全局 Ctrl+Enter 只能在页面激活时存在，KeepAlive 离页不得残留；
 * - Painless 的落库写仍由 save/deleteStored 执行体首行守卫；试跑只走只读 execute。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const V = (f: string) => readFileSync(join(__dirname, '../views', f), 'utf-8');
const C = (f: string) => readFileSync(join(__dirname, '../components', f), 'utf-8');

function fnBody(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  expect(start, `函数必须存在：${name}`).toBeGreaterThanOrEqual(0);
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (!depth) return src.slice(brace + 1, i);
    }
  }
  throw new Error(`函数体未闭合：${name}`);
}

const rest = V('RestView.vue');
const devtools = V('DevToolsView.vue');
const painless = V('PainlessLabView.vue');
const palette = C('CmdPalette.vue');

/* 1133 起守卫按**内层方法**分档（只读身份可发只读请求），表达式由 canAdmin 换成
 canExecInner；本条锁的意图不变——执行体首部必须自带能力门，且先于在途置位与实际发车。 */
const EXEC_GUARD = 'if (!canExecInner(';

describe('972 RestView 实际发起写请求处必须再判执行体门', () => {
  it('doSend 首部守卫先于在途置位与 api.raw', () => {
    const body = fnBody(rest, 'doSend');
    const guard = body.indexOf(EXEC_GUARD);
    expect(guard, 'doSend 缺执行体守卫').toBeGreaterThanOrEqual(0);
    expect(guard).toBeLessThan(body.indexOf('sending.value = true'));
    expect(guard).toBeLessThan(body.indexOf('await api.raw('));
  });
  it('send 的确认前守卫保留', () => {
    const body = fnBody(rest, 'send');
    expect(body.indexOf(EXEC_GUARD)).toBeGreaterThanOrEqual(0);
    expect(body.indexOf(EXEC_GUARD)).toBeLessThan(body.indexOf('await askConfirm'));
  });
});

describe('972 DevTools 全局执行键随 KeepAlive 生命周期装卸', () => {
  it('onMounted 注册、onActivated 恢复、onDeactivated 摘除、卸载兜底', () => {
    expect(devtools).toContain("window.addEventListener('keydown', onGlobalRunKey);");
    const activated = devtools.slice(devtools.indexOf('onActivated('), devtools.indexOf('onDeactivated('));
    expect(activated).toContain("window.addEventListener('keydown', onGlobalRunKey);");
    const deactivated = devtools.slice(devtools.indexOf('onDeactivated('), devtools.indexOf('onBeforeUnmount('));
    expect(deactivated).toContain("window.removeEventListener('keydown', onGlobalRunKey);");
    expect(fnBody(devtools, 'onGlobalRunKey')).toContain('run()');
  });
  it('执行内核 execSend 仍有执行体能力门（1133：按内层方法分档）', () => {
    expect(fnBody(devtools, 'execSend').indexOf(EXEC_GUARD)).toBeGreaterThanOrEqual(0);
  });
});

describe('972 Painless 写落库有门、试跑只走只读 execute', () => {
  it('save/deleteStored 首行 canOps', () => {
    expect(fnBody(painless, 'save').indexOf('if (!canOps.value)')).toBeGreaterThanOrEqual(0);
    expect(fnBody(painless, 'deleteStored').indexOf('if (!canOps.value)')).toBeGreaterThanOrEqual(0);
  });
  it('run 只调 painlessExecute，不直接写脚本', () => {
    const body = fnBody(painless, 'run');
    expect(body).toContain('api.painlessExecute(');
    expect(body).not.toContain('putStoredScript');
    expect(body).not.toContain('deleteStoredScript');
  });
});

describe('972 命令面板 raw 执行体守卫', () => {
  it('runRaw 首行 canRawOps（977 raw 系统命令 ADMIN 档）', () => {
    const start = palette.indexOf('const runRaw =');
    expect(start, 'runRaw 必须存在').toBeGreaterThanOrEqual(0);
    const body = palette.slice(start, palette.indexOf('const canW', start));
    expect(body.indexOf('if (!canRawOps()) return;')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('if (!canRawOps()) return;')).toBeLessThan(body.indexOf('await api.raw('));
  });
});
