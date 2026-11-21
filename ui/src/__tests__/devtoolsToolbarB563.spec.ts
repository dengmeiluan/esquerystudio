/**
 * 五百六十三批·用户评审选定:DevTools 工具行重设计**方案 B(高频前置 + 溢出收纳)**。
 *
 * 请求工具行从 9 元素同权重平铺收为:标题 → 分隔线 → 高频四件(插入字段[主操作实底]/
 * 格式化/复制请求体[icon-only]/字号 seg)→ spacer → 「⋯」溢出菜单。
 * 收纳五件:压缩/收藏/清空/自动格式化(菜单内开关行,aria-checked)/body 骨架(条件);
 * 562 分段执行说明随菜单底部 dim 段保留(请求 pane 切片内字面仍在,kibanaWave562 锁零触)。
 *
 * 红线自证:按钮行恒单行自然高,不新增 DOM 行=零高度链触碰(DevTools :1103 冻结面禁入);
 * 响应头 561 已观测族对称(原始 IO/MetaStrip/查看档/搜索)零触。
 *
 * 源码锁口径(focusSurface401 同理由)。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const dt = readFileSync(join(SRC, 'views/DevToolsView.vue'), 'utf-8');
const reqPane = dt.slice(dt.indexOf('#pane-devtools-search-request'), dt.indexOf('#pane-devtools-search-response'));

describe('563 方案 B:请求工具行高频前置 + 溢出收纳', () => {
  it('行上高频:插入字段(主操作实底 btn xs)+格式化+复制 icon-only+字号 seg', () => {
    expect(reqPane).toMatch(/class="btn xs"[^>]*aria-label="插入字段"/);
    expect(reqPane).toMatch(/@click="format">/);
    expect(reqPane, '复制请求体改 icon-only(title/aria 承载文案)').toMatch(/aria-label="复制请求体" title="复制请求体原文" @click="copyBody">\s*<Copy :size="11" \/>\s*<\/button>/);
    expect(reqPane).toContain('dt-font-seg');
  });
  it('「⋯」溢出菜单收纳五件:压缩/骨架/自动格式化开关/收藏/清空(danger)', () => {
    expect(reqPane).toMatch(/aria-label="更多动作" aria-haspopup="menu" :aria-expanded="moreOpen"/);
    expect(reqPane).toContain('@click="minify(); moreOpen = false"');
    expect(reqPane).toContain('@click="saveFav(); moreOpen = false"');
    expect(reqPane).toMatch(/:aria-checked="autoFmt \? 'true' : 'false'"/);
    expect(reqPane).toMatch(/class="[^"]*dt-more-item[^"]*"[^>]*@click="cur\.body = ''; cur\.result = null; moreOpen = false"/);
  });
  it('分段执行说明保留在请求 pane(⋯菜单底部 dim 段,kibanaWave562 字面零触)', () => {
    expect(reqPane).toContain('空行分段 · Ctrl+Enter 执行光标段 · Shift+Ctrl+Enter 全部');
  });
  it('旧形态退役:行内「自动格式化开/关」文字钮与行内 dim 提示不再直排', () => {
    expect(reqPane).not.toContain('>自动格式化{{ autoFmt');
    expect(reqPane, 'dim 提示移入菜单,行内不再直排').not.toMatch(/<span class="dim" title="空行或/);
  });
  it('功能 handler 保形(菜单项与原按钮同一条路)', () => {
    expect(dt).toContain('function minify()');
    expect(dt).toContain('function saveFav()');
    expect(dt).toContain('function insertBody()');
    expect(dt).toContain('function copyBody()');
  });
});

describe('563 方案 B 补刀:响应头与请求头同构对称(空态不再失衡)', () => {
  it('响应头标题后加分隔线(与请求头 dt-tb-sep 同构)', () => {
    const respPane = dt.slice(dt.indexOf('#pane-devtools-search-response'), dt.indexOf('NModal'));
    expect(respPane).toMatch(/<span class="dt-pane-tt">响应<\/span>\s*<span class="dt-tb-sep"><\/span>/);
  });
  it('复制响应钮常驻化(无数据 disabled 而非 v-if 消失,空态行结构恒定)', () => {
    const respPane = dt.slice(dt.indexOf('#pane-devtools-search-response'), dt.indexOf('NModal'));
    expect(respPane).toMatch(/aria-label="复制响应" title="复制响应全文（截断展示时仍取完整原文）"\s*:disabled="!cur\.result"/);
    expect(respPane, '常驻钮不再条件消失').not.toMatch(/<button v-if="cur\.result"[^>]*aria-label="复制响应"/);
  });
});

describe('563 方案 B 补刀:双 pane 工具行恒等高(请求/响应编辑器顶边对齐)', () => {
  it('dt-page 内 fs-head 统一 min-height 34px(左 seg 撑高 vs 右元素少行矮的错位根治)', () => {
    expect(dt).toMatch(/\.dt-page :deep\(\.fs-head\) \{ min-height: 34px; \}/);
  });
});
