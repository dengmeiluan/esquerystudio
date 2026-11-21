/**
 * ：RawIoModal 原始 IO 弹窗字号三档 seg（rim.font 跨页弹层独立键）。
 *
 *  RawIoModal 是 IndexHub/SqlConsole/Adhoc/Xmigrate 四页共用的 teleport 自研弹层，
 *  不属于任何单页 → usePref 不挂页面键，立独立键 'rim.font'（缺省档=EDITOR_FONT_TIERS
 *  首档单源）。seg 形态对齐 dq-font-seg/dt-font-seg 既有范式（.seg 全局基类 + aria +
 *  on 激活态 + 共享常量 v-for + 「字号」文案）。请求体/响应两处只读 Monaco 各接线
 *  :font-size="rimFont"（fontSize 为可选 prop，缺席=undefined 走内层缺省，零破坏）。
 *
 *  断言形态承 edFontSpread668（668-C1 约定：UI 在场≠行为生效）——A 段源码锚之外，
 *  B 段必须断言 fontSize 真值经 mock 链到达两处 MonacoEditor（Monaco mock 以 rawIo545/
 *  rawIoReach565 既有 vi.mock 做法，stub 渲染 data-font-size 供读回）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rim = readFileSync(join(__dirname, '../components/RawIoModal.vue'), 'utf-8');
const tiers = readFileSync(join(__dirname, '../utils/editorTiers.ts'), 'utf-8');

/* Monaco mock：rawIo545/rawIoReach565 同款 + fontSize 真值读回锚（data-font-size 渲染到 DOM） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    template: '<div class="monaco-stub" :data-lang="language" :data-font-size="String(fontSize)"></div>',
  },
}));

import RawIoModal from '../components/RawIoModal.vue';
import type { RawIoRec } from '../api';

const REC: RawIoRec = {
  id: 1, ts: 1758000000000, method: 'POST',
  url: '/internal/es/index/cluster/query?index=idx&size=1',
  requestBody: '{"query":{"match_all":{}}}',
  status: 200, ok: true, durationMs: 42,
  responseRaw: '{"took":3,"hits":[]}',
};

let app: ReturnType<typeof createApp> | null = null;

async function settle(n = 8) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountModal() {
  document.body.innerHTML = '';
  app = createApp({ render: () => h(RawIoModal, { show: true, rec: REC }) });
  app.use(createPinia());
  app.mount(document.createElement('div'));
  await settle();
}

const segBtns = () => Array.from(document.body.querySelectorAll<HTMLButtonElement>('.rim-font-seg button'));
const stubs = () => Array.from(document.body.querySelectorAll<HTMLDivElement>('.monaco-stub'));

beforeEach(() => { localStorage.clear(); });
afterEach(() => { app?.unmount(); app = null; document.body.innerHTML = ''; });

/* ═══════════ A：源码锚（edFontSpread668 视图源锚同形态） ═══════════ */

describe('681 A：RawIoModal 字号档源码锚', () => {
  it('A1 usePref 独立键 rim.font，缺省档=EDITOR_FONT_TIERS 首档（单源引用非私造字面）', () => {
    expect(rim).toContain("usePref<number>('rim.font', EDITOR_FONT_TIERS[0])");
  });
  it('A2 档位数组单源 import（勿私造）', () => {
    expect(rim).toContain("import { EDITOR_FONT_TIERS } from '../utils/editorTiers';");
  });
  it('A3 请求/响应两处 MonacoEditor :font-size="rimFont" 全量接线', () => {
    expect((rim.match(/:font-size="rimFont"/g) ?? []).length).toBe(2);
  });
  it('A4 seg 形态（dq/dt-font-seg 同构：seg 基类+aria+on 态+共享常量 v-for+字号 title）', () => {
    expect(rim).toContain('class="seg rim-font-seg"');
    expect(rim).toContain('aria-label="编辑器字号档"');
    expect(rim).toContain('rimFont === f');
    expect(rim).toContain('v-for="f in EDITOR_FONT_TIERS"');
    expect(rim).toContain(":title=\"'编辑器字号 ' + f + 'px'\"");
  });
  it('A5 seg 尺寸锚（scoped CSS dt/dq-font-seg 同形）', () => {
    expect(rim).toContain('.rim-font-seg { flex-shrink: 0; }');
    expect(rim).toMatch(/\.rim-font-seg button \{ padding: 0 var\(--sp-1h\); font-size: var\(--fs-xs\); line-height: 1\.8; \}/);
  });
  it('A6 editorTiers 单源零漂移（三档字面在 utils 不动）', () => {
    expect(tiers).toContain('export const EDITOR_FONT_TIERS: number[] = [12.5, 14, 16];');
  });
  it('A7 头注 681 备案在场', () => {
    expect(rim).toContain('');
  });
});

/* ═══════════ B：渲染真值（668-C1 约定：seg 在场≠生效） ═══════════ */

describe('681 B：fontSize 真值到达两处 Monaco + rim.font 落盘还原', () => {
  it('B1 默认首档 12.5：三钮在场+文案含字号+激活态在首钮+两 Monaco 同收 12.5', async () => {
    await mountModal();
    const btns = segBtns();
    expect(btns.length, '三档钮').toBe(3);
    expect(btns.map(b => b.textContent)).toEqual(['12.5', '14', '16']);
    expect(document.body.querySelector('.rim-font-seg')!.getAttribute('aria-label')).toContain('字号');
    expect(btns[1]!.getAttribute('title')).toBe('编辑器字号 14px');
    expect(btns[0]!.classList.contains('on'), '缺省激活态在首档').toBe(true);
    const mon = stubs();
    expect(mon.length, '请求+响应两处').toBe(2);
    expect(mon[0]!.dataset.fontSize).toBe('12.5');
    expect(mon[1]!.dataset.fontSize).toBe('12.5');
  });

  it('B2 点击 14/16 档：两处 Monaco fontSize 真值跟随 + rim.font 落盘值同步', async () => {
    await mountModal();
    const btns = segBtns();
    btns[1]!.click();
    await settle();
    expect(stubs()[0]!.dataset.fontSize).toBe('14');
    expect(stubs()[1]!.dataset.fontSize).toBe('14');
    expect(localStorage.getItem('esquerystudio.pref.rim.font'), 'rim.font 落盘').toBe('14');
    btns[2]!.click();
    await settle();
    expect(stubs()[0]!.dataset.fontSize).toBe('16');
    expect(stubs()[1]!.dataset.fontSize).toBe('16');
    expect(localStorage.getItem('esquerystudio.pref.rim.font')).toBe('16');
    expect(btns[2]!.classList.contains('on'), '激活态跟随').toBe(true);
  });

  it('B3 卸载重挂载：还原所选档（持久化闭环）', async () => {
    await mountModal();
    segBtns()[2]!.click();
    await settle();
    app!.unmount();
    app = null;
    await mountModal();
    expect(stubs()[0]!.dataset.fontSize).toBe('16');
    expect(stubs()[1]!.dataset.fontSize).toBe('16');
    expect(segBtns()[2]!.classList.contains('on'), '重挂载激活态还原 16 档').toBe(true);
  });
});
