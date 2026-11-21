/**
 * 六百三十批：连接列表「被挤没」修复——用户产线实报「这个弹出遮挡了」。
 *
 * 实锚（用户产线截图 = 10 连接 · 4 异常 + 「＋ 新增连接」展开）→ 真机复现（probe-connmgr-fit.mjs）：
 * 病灶=「＋ 新增连接」表单展开后连接列表被挤成细条。根因在双折叠节的 flex 契约——
 *   .cm-fold 基类 flex-shrink:0 让表单节吃满固有高 ~479px，而 .cm-list 是唯一可收缩项且
 *   min-height:0，于是全部高度亏空都压给列表：1842×937 视口列表仅剩 151px（10 个连接 2 行可见）；
 *   视口高 800px 时仅剩 34px（0 行完整可见），末行被横切成半、紧贴下方带底色的表单卡，观感即「被压住」。
 *
 * 修法（让位方从「列表」改「表单」）：
 *   ① 列表折叠节保底 min-height = 折叠头 ~32px + 3 行卡（~63px/行）→ 列表恒有 3 个连接可见可点；
 *   ② .cm-fold-form.open 可收缩（flex-shrink:1，此前被基类钉死为 0）+ 表单体自滚（overflow-y:auto）；
 *   ③ 操作行 sticky 钉表单滚动区底缘——主按钮（测试连接/添加连接）不因表单自滚而滚出视野。
 *
 * 风格：source-lock（naive 弹层挂载易碎不 mount，ClusterSwitcher 既有 spec 全 source-lock）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cs = readFileSync(join(__dirname, '../components/ClusterSwitcher.vue'), 'utf-8');

describe('连接列表保底（630 批·用户实报「被挤没」）', () => {
  it('列表折叠节带最小高度保底（不再是 min-height:0 可被无限压扁）', () => {
    expect(cs).toMatch(/\.cm-fold-list\.open \{[^}]*flex:\s*1 1 auto;\s*min-height:\s*2\d\dpx/s);
    expect(cs).not.toMatch(/\.cm-fold-list\.open \{[^}]*min-height:\s*0/s);
  });
  it('列表自身仍是滚动区：overflow-y auto 不回退', () => {
    expect(cs).toMatch(/\.cm-list \{[^}]*overflow-y:\s*auto/s);
  });
});

describe('让位方=表单（630 批）', () => {
  it('表单折叠节可收缩（此前 flex-shrink:0 恒不让位，是列表被挤没的直接原因）', () => {
    expect(cs).toMatch(/\.cm-fold-form\.open \{[^}]*flex-shrink:\s*1/s);
    expect(cs).toMatch(/\.cm-fold-form\.open \{[^}]*min-height:\s*0/s);
  });
  it('表单体自滚承担高度亏空', () => {
    expect(cs).toMatch(/\.cm-fold-form\.open \.cm-fold-bd \{[^}]*overflow-y:\s*auto/s);
  });
  it('表单折叠头不被压扁', () => {
    expect(cs).toMatch(/\.cm-fold-form\.open \.cm-fold-hd \{[^}]*flex-shrink:\s*0/s);
  });
});

describe('主按钮不滚出视野（630 批）', () => {
  it('表单操作行 sticky 钉底（同底色，不新增色值）', () => {
    expect(cs).toMatch(/\.cm-fold-form\.open \.cm-form-ops \{[^}]*position:\s*sticky/s);
    expect(cs).toMatch(/\.cm-fold-form\.open \.cm-form-ops \{[^}]*bottom:\s*0/s);
    expect(cs).toMatch(/\.cm-fold-form\.open \.cm-form-ops \{[^}]*background:\s*var\(--bg2\)/s);
  });
});

describe('625 批既有契约不回退（630 批同步更新锁）', () => {
  it('弹窗恒不超屏语义保留', () => {
    expect(cs).toMatch(/width:720px;max-width:94vw;max-height:86vh/);
  });
  it('permGating 折叠 wrapper 模板串逐字不变', () => {
    expect(cs).toContain('<div class="cm-fold cm-fold-form" :class="{ open: formOpen }" v-if="canAdmin"');
  });
});
