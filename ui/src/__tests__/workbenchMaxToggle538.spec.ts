/**
 * 五百三十八批：分栏互覆盖（档位循环）+检索参数节头常显+结果视图条卡内糅合。
 * 用户裁决「双栏条件树和 DSL 编辑器互相左右放大覆盖对方」——柄=两栏关系调节器：
 * 档位钮点击循环 对半→前位独占→后位独占。此前「互覆盖已完成」为虚记（DSL_PANES 无
 * maximizable 字段、折叠钮挂在 title 轨而 title 置空=入口根本不存在），本 spec
 * 纯函数行为+源码双锚定，TDD 先行。
 * 连带锚：dq-params-sec 外层 v-show 事故（收起时连节头一起消失=无法再展开，用户实报
 * 「检索参数嗯？」）+结果区视图条（表格/JSON/Tree/卡片+分页）从卡外独立条并进结果卡内
 * 头部（用户裁决「糅合进表格本身」）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cycleMaxState } from '../utils/layout';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const wl = readFileSync(join(__dirname, '../components/WorkbenchLayout.vue'), 'utf-8');
const rp = readFileSync(join(__dirname, '../components/ResizablePane.vue'), 'utf-8');
const sh = readFileSync(join(__dirname, '../components/SplitHandle.vue'), 'utf-8');

describe('档位循环纯函数 cycleMaxState（538 批）', () => {
  const A = 'a.b';
  const B = 'c.d';

  it('对半→前位独占→后位独占→对半 三态循环', () => {
    expect(cycleMaxState(null, A, B)).toBe(A);
    expect(cycleMaxState(A, A, B)).toBe(B);
    expect(cycleMaxState(B, A, B)).toBeNull();
  });
  it('独占态再点自己=切到对方（两态窗体下永不卡死）', () => {
    expect(cycleMaxState(A, A, B)).not.toBe(A);
  });
});

describe('互覆盖接线（538 批）', () => {
  it('WorkbenchLayout：maximizedId 状态机+隐藏走折叠管线+隐藏 flex/sized 让出占位', () => {
    expect(wl).toContain('maximizedId');
    expect(wl).toContain('function isPaneHidden(');
    expect(wl).toContain(':collapsed="isPaneHidden(spec)"');
    /* flex 隐藏=0 弹性占位（flex:1 恒挂会让「独占」只是内容消失）；sized 隐藏压 0 宽
       （34px 塌缩条在无 title 互覆盖场景是无意义空条，还原入口在柄上） */
    expect(wl).toContain('flexHiddenStyle');
    expect(wl).toContain('sizedHiddenStyle');
    /* 独占上界：被隐藏 sibling 不再保留 min reserved（否则独占侧被钳在 available-min 拉不满） */
    expect(wl).toMatch(/reservedForSiblings[\s\S]*?isPaneHidden\(p\)/);
    /* 独占的 sized pane 以 fill 吸满（后随 flex 已隐藏时不再让位） */
    expect(wl).toMatch(/rest\.some\(p => isFlex\(p\) && !isPaneHidden\(p\)\)/);
    expect(wl).toContain('rest.every(p => isPaneHidden(p))');
    /* 还原入口：重置布局清独占态 */
    expect(wl).toMatch(/function resetLayout\(\)[\s\S]*?maximizedId\.value = null/);
  });

  it('SplitHandle：档位钮渲染+不误触拖拽热区；ResizablePane 透传+隐藏侧保留柄作还原入口', () => {
    expect(sh).toContain('maxLabel?');
    expect(sh).toContain('maxActive?');
    expect(sh).toContain("@pointerdown.stop");
    expect(sh).toContain('emit(\'max-click\')');
    expect(rp).toContain('@max-click="emit(\'handle-max\')"');
    /* 被独占隐藏的 pane（handleMaxLabel 在场）保留柄=唯一还原入口；手动折叠场景柄照旧隐藏 */
    expect(rp).toMatch(/v-if="!last && \(!collapsed \|\| handleMaxLabel\)"/);
  });

  it('源码锚：DSL_PANES 双 pane maximizable+maxName', () => {
    expect(dq).toMatch(/id: 'query-builder\.tree',[\s\S]*?maximizable: true, maxName: '条件树'/);
    expect(dq).toMatch(/id: 'query-builder\.workspace',[\s\S]*?maximizable: true, maxName: '编辑器'/);
  });
});

describe('检索参数节头常显+参数前置执行行（538 批）', () => {
  it('检索参数开关常驻可点（542 二刀同步更新：钮在执行行 run-end 内常显，展开区独立 v-show）', () => {
    expect(dq).not.toMatch(/dq-params-tg" [^>]*v-show/);
    expect(dq).toContain('class="dq-params-tg"');
    expect(dq).toMatch(/<div v-show="paramsOpen" class="dq-params-body dq-params-standalone">/);
  });
  it('参数开关与执行同处统一容器 dq-run-sec（542 二刀同步更新：钮进 run-end、展开区在其下）', () => {
    const secAt = dq.indexOf('<div class="dq-run-sec">');
    const runAt = dq.indexOf('<div class="dq-run-row">');
    const paramsAt = dq.indexOf('dq-params-standalone');
    expect(secAt).toBeGreaterThan(-1);
    expect(runAt).toBeGreaterThan(secAt);
    expect(paramsAt).toBeGreaterThan(runAt);
  });
});

describe('结果视图条糅合进结果卡（538 批）', () => {
  it('dq-res-bar 卡外独立条退役：视图 seg+分页+命中数并入 dq-res-body 卡内头部', () => {
    expect(dq).not.toContain('class="dq-res-bar"');
    expect(dq).toContain('dq-res-head');
    /* 547 批同步更新：.card 结果区卡壳退役——dq-res-body 只留布局容器职责（.card 类退役） */
    const bodyAt = dq.indexOf('class="dq-res-body"');
    const headAt = dq.indexOf('dq-res-head');
    expect(bodyAt).toBeGreaterThan(-1);
    expect(headAt).toBeGreaterThan(bodyAt);
  });
});
