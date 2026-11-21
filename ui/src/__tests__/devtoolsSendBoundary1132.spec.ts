import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 1132：DevTools 发送链的「发送值 vs 原稿」边界。
 *
 * 注释剥离只作用于**发出的字节**：草稿 `t.body` 与历史/跨 Tab 镜像必须保留原稿（含注释），
 * 否则用户回放历史时注释被吃掉——而注释往往是这条请求唯一的说明。
 * 变量展开同理（历史里要留 `${var}` 原样，展开值只进请求）。
 *
 * 这条锁盯的是「别把 bodyFinal 写进 history / mirrorHistAll」这个具体回退，
 * 因为 `execSend` 里两者挨着出现，改错一次不会被任何行为测试发现。
 */
const view = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('1132 发送链：原稿进历史，剥离值进请求', () => {
  it('历史条目用原稿 t.body', () => {
    const at = view.indexOf('t.history = [{');
    expect(at).toBeGreaterThan(-1);
    const seg = view.slice(at, at + 400);
    expect(seg).toContain('body: t.body');
    expect(seg, '历史不得写剥离/展开后的值').not.toContain('bodyFinal');
    expect(seg).not.toContain('bodyExpanded');
  });

  it('跨 Tab 镜像同样用原稿', () => {
    const at = view.indexOf('mirrorHistAll({');
    expect(at).toBeGreaterThan(-1);
    const seg = view.slice(at, at + 200);
    expect(seg).toContain('body: t.body');
  });

  it('请求体送的是剥离后的 bodyFinal', () => {
    const at = view.indexOf('await api.devtoolsExecute(');
    expect(at).toBeGreaterThan(-1);
    const seg = view.slice(at, at + 160);
    expect(seg).toContain('bodyFinal');
  });

  it('剥离接在 execSend（唯一发送点）内，且晚于变量展开', () => {
    const at = view.indexOf('async function execSend(');
    const end = view.indexOf('const t0 = performance.now()', at);
    const seg = view.slice(at, end);
    const expandAt = seg.indexOf('applyVars(bodyOut)');
    /* 锚到发送链里那一行：格式化路径里也有同名调用，裸找会命中错的 */
    const stripAt = seg.indexOf('const stripped = stripJsonComments(bodyExpanded)');
    expect(stripAt).toBeGreaterThan(-1);
    expect(expandAt).toBeGreaterThan(-1);
    expect(stripAt, '必须先展开变量再剥离注释（变量值本身可能带注释）').toBeGreaterThan(expandAt);
  });
});
