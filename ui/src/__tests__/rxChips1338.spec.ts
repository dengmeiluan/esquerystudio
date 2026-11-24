/**
 * 一千三百三十八批：参数条 14 个 chips 折成两行，把结果表挤到折叠线以下。
 *
 * 真机量化（1440×900，查询工作台执行拿到结果后，逐块量 top/height）：
 *
 *   修前：结果表工具行 y=812，视口 900 → **只剩 88px 可见**，每次查完都得滚动
 *        其中 .rx-chips 独占 96px（flex-wrap 折成两行）
 *   修后：.rx 96px → 39px（**单行横向滚动**），工具行 y=812 → y=742，可见 88px → 158px
 *
 * 用户原话「表格首行很丑元素很多挤占」——查询工作台上这一处就是它：
 * 一排默认「未设置」的占位把真正的结果推下去了。
 *
 * 为什么不是「把未配置的收进更多菜单」：那样默认只剩 1 颗 chip，
 * 直接违背两条既有契约（fullsiteGuard ⑥「参数条 chip 化不回退」要求 ≥5 颗具名 chip；
 * rootExtras 176「chips 键盘导航」要求焦点能在多颗 chip 间移动环绕）。
 * 1338 第一版就是那么做的，一次打红 18 条，已回退。
 *
 * 最终做法：chip 全部常驻（契约与可达性不变），容器改 **单行 + overflow-x:auto**。
 * 本 spec 锁：
 *  ① .rx-chips 必须 nowrap（防回退成折行占两行）；
 *  ② 横向滚动可达（overflow-x auto），不能靠裁切藏项；
 *  ③ chip 不参与收缩（flex: 0 0 auto），否则会被压成文字截断；
 *  ④ 14 颗 chip 仍全部在场且具名 toggle 未变。
 * 负控：把 flex-wrap 改回 wrap → 第 1 条必红。
 */
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import RootExtrasPane from '../components/builder/RootExtrasPane.vue';

const SRC = readFileSync(join(__dirname, '../components/builder/RootExtrasPane.vue'), 'utf-8');
const css = (() => {
  const i = SRC.indexOf('.rx-chips {');
  expect(i, '.rx-chips 规则必须存在').toBeGreaterThan(-1);
  return SRC.slice(i, SRC.indexOf('}', i));
})();

const tree = ref({
  sort: null, source: null, highlight: null, aggs: [], postFilter: null, collapse: null,
  knn: null, retriever: null, suggest: null, rescore: null, scriptFields: null,
  runtimeMappings: null, searchParams: {}, extras: {}, aggKey: 'aggs',
});

async function mountPane() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(RootExtrasPane as any, { tree: tree.value, fields: [], types: {}, index: 'i' }) });
  app.mount(host);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
  return { host, app };
}

describe('1338 参数条单行横向滚动（不折行挤占结果区）', () => {
  it('容器必须 nowrap：折行会多占一行并把结果表推出折叠线', () => {
    expect(css, '必须 flex-wrap: nowrap').toMatch(/flex-wrap:\s*nowrap/);
  });

  it('必须可横向滚动（超宽时滑动可达，而不是裁切藏项）', () => {
    expect(css).toMatch(/overflow-x:\s*auto/);
    expect(css).toMatch(/overflow-y:\s*hidden/);
  });

  it('chip 不参与收缩（否则被压成截断文字）', () => {
    const i = SRC.indexOf('.rx-chip {');
    expect(i, '.rx-chip 规则必须存在').toBeGreaterThan(-1);
    /* 规则体里要有 flex: 0 0 auto（可能单独一条，也可能在未来合并） */
    const seg = SRC.slice(i, i + 600);
    expect(seg, 'chip 必须 flex: 0 0 auto').toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it('14 颗 chip 仍全部在场，具名 toggle 未变（不回退成收纳菜单）', async () => {
    const { host, app } = await mountPane();
    const chips = [...host.querySelectorAll('.rx-chip')];
    expect(chips.length, '全部 chip 常驻（既有 chip 化契约）').toBe(14);
    /* 1338 起 chip 由 CHIP_META 数据驱动（模板只有一个 v-for），
       所以判据是「14 个 key 全在 CHIP_META 里」，而不是逐个 toggle 字面量。 */
    const meta = SRC.slice(SRC.indexOf('const CHIP_META'), SRC.indexOf('] as const'));
    for (const k of ['sort', 'src', 'hl', 'aggs', 'pf', 'col', 'knn', 'rt', 'sug', 'rc', 'sf', 'rm', 'qp', 'ex']) {
      expect(meta, `CHIP_META 必须含 ${k}`).toMatch(new RegExp(`k: '${k}'`));
    }
    const text = chips.map(e => e.textContent?.replace(/\s+/g, '') || '').join('|');
    expect(text, '排序 chip 可见').toContain('排序');
    app.unmount();
  });

  it('键盘导航前提成立：多颗 chip 可聚焦', async () => {
    const { host, app } = await mountPane();
    const chips = [...host.querySelectorAll<HTMLButtonElement>('.rx-chip')];
    expect(chips.length, '≥5 颗才谈得上 ←→ 导航').toBeGreaterThanOrEqual(5);
    chips[0].focus();
    expect(document.activeElement).toBe(chips[0]);
    app.unmount();
  });
});
