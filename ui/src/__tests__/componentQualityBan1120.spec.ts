/**
 * 1120 组件质量门禁：统一提示件（Tip）就位后的防新增扫描。
 * 门禁一：原生 title 属性文本超过 60 字符时浏览器原生提示无法承载（不换行、不可滚动、
 *   不受主题控制），禁新增——长文本提示一律用 <Tip text="...">。静态扫描只认两类字符串
 *   字面量形态：title="..." 与 :title="'...'"；:title 动态表达式（变量/拼接）无法静态
 *   求值，跳过不判。存量分批迁移到 Tip 组件，白名单只减不增。
 * 门禁二：手搓 1024 字节换算禁新增——统一走 utils/format.ts 的 fmtSize（内部循环
 *   x /= 1024 一处所有）；views/components 里再出现 /1024、1024 ** 或 * 1024 字面
 *   即为新的手搓点。存量同样分批迁移，白名单只减不增。
 * 两份白名单均为建仓时点的实测存量快照（按文件计数），只允许减少：迁移一处就把对应
 *   文件的计数减 1（减到 0 删条目）；任何文件超出快照上限、或快照外文件新增命中即红。
 * 扫描写法与 nativeControlBan.spec.ts 同源（fs 全量扫 components+views 的 .vue）；
 * 组件冒烟沿用项目惯例：createApp 手工 mount，不依赖 @vue/test-utils。
 * 统一进度件 ProgressBar 零引用已退役（孤儿处置），其冒烟组随之撤销。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createApp, h, nextTick, type App, type VNode } from 'vue';
import Tip from '../components/Tip.vue';

const SRC = join(__dirname, '..');

/* 原生 title 超 60 字符存量快照（title="..." 静态与 :title="'...'" 绑定字面量两类
   合计按文件计数）。建仓实测 25 处已全数迁 Tip long 档（含 AdhocRebuildView 3 处），
   表清零——空表即零容忍：任何新增命中直接红。 */
const LONG_TITLE_BASELINE: Record<string, number> = {};

/* 手搓 1024 换算存量快照（正则命中次数按文件计数）。原 3 处已清零：CurrentIdxChip
   注释措辞调整不再命中正则；DevToolsView/RestView 的 512KiB 容量常量改直书数值
   524288（语义不变）。空表=零容忍：任何新命中即红。 */
const MANUAL_1024_BASELINE: Record<string, number> = {};

function collectVue(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectVue(p, out);
    else if (name.endsWith('.vue')) out.push(p);
  }
  return out;
}

const files = collectVue(join(SRC, 'components'))
  .concat(collectVue(join(SRC, 'views')))
  .map((p) => relative(SRC, p).replace(/\\/g, '/'));

/** 静态 title="..."（负向后顾排除 :title / data-title 等带前缀形态） */
const RE_TITLE_STATIC = /(?<![:\w"-])title="([^"]*)"/g;
/** :title="'...'" 绑定字符串字面量；动态表达式（非纯字面量）不匹配、跳过 */
const RE_TITLE_BIND_LITERAL = /:title="'([^']*)'"/g;
const RE_MANUAL_1024 = /\/\s*1024|1024\s*\*\*|\* 1024\b/g;

function countLongTitles(rel: string): number {
  let n = 0;
  for (const line of readFileSync(join(SRC, rel), 'utf-8').split('\n')) {
    for (const m of line.matchAll(RE_TITLE_STATIC)) if (m[1].length > 60) n++;
    for (const m of line.matchAll(RE_TITLE_BIND_LITERAL)) if (m[1].length > 60) n++;
  }
  return n;
}

function countManual1024(rel: string): number {
  let n = 0;
  for (const line of readFileSync(join(SRC, rel), 'utf-8').split('\n')) {
    n += (line.match(RE_MANUAL_1024) || []).length;
  }
  return n;
}

/* ── 组件挂载冒烟设施（createApp 手工 mount，fieldSelectPopup 先例同源） ── */
const apps: App[] = [];
const settle = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
async function mountComp(comp: typeof Tip, props: Record<string, unknown>, slot?: () => VNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(comp as never, props as never, slot ? { default: slot } : undefined) });
  app.config.warnHandler = () => {};
  apps.push(app);
  app.mount(host);
  await settle();
  return host;
}
afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
});

const tipSrc = readFileSync(join(SRC, 'components/Tip.vue'), 'utf-8');

describe('1120 组件质量门禁：原生 title 超 60 字符禁新增（迁 Tip 组件）', () => {
  it('扫描面非空（components+views 全量 vue 文件）', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('title/:title 字面量超 60 字符：存量只减不增，白名单外文件零命中', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      const n = countLongTitles(rel);
      const cap = LONG_TITLE_BASELINE[rel] ?? 0;
      if (n > cap) offenders.push(`${rel} → ${n} 处（快照上限 ${cap}）`);
    }
    expect(offenders.join('\n'), '超出快照=有新增长文本原生 title，改用 <Tip text="...">；迁移存量后请同步调小白名单').toBe('');
  });

  it('白名单文件与实际文件对齐（防名单腐化）', () => {
    for (const rel of Object.keys(LONG_TITLE_BASELINE)) {
      expect(readFileSync(join(SRC, rel), 'utf-8'), `${rel} 应存在`).toBeTruthy();
    }
  });
});

describe('1120 组件质量门禁：手搓 1024 字节换算禁新增（统一 fmtSize）', () => {
  it('1024 换算字面量：存量只减不增，白名单外文件零命中', () => {
    const offenders: string[] = [];
    for (const rel of files) {
      const n = countManual1024(rel);
      const cap = MANUAL_1024_BASELINE[rel] ?? 0;
      if (n > cap) offenders.push(`${rel} → ${n} 处（快照上限 ${cap}）`);
    }
    expect(offenders.join('\n'), '超出快照=新的手搓换算，字节格式化统一走 utils/format.ts 的 fmtSize').toBe('');
  });

  it('白名单文件与实际文件对齐（防名单腐化）', () => {
    for (const rel of Object.keys(MANUAL_1024_BASELINE)) {
      expect(readFileSync(join(SRC, rel), 'utf-8'), `${rel} 应存在`).toBeTruthy();
    }
  });
});

describe('1120 组件渲染冒烟：Tip props→DOM 基本形态', () => {
  it('Tip：触发元素经默认插槽透传在场（NTooltip 承载）', async () => {
    const host = await mountComp(Tip, { text: '提示内容' }, () => h('button', { class: 'tip-demo-trigger' }, '触发'));
    const btn = host.querySelector('button.tip-demo-trigger');
    expect(btn, '插槽触发元素渲染在场').toBeTruthy();
    expect(btn?.textContent).toBe('触发');
  });

  it('Tip：hover 触发 + placement 透传 + long 档 320px/200px 滚动（源码锚）', () => {
    expect(tipSrc).toContain('trigger="hover"');
    expect(tipSrc).toContain(':placement="placement"');
    expect(tipSrc).toMatch(/\.tip-long \{[^}]*width: min\(320px, 92vw\);/);
    expect(tipSrc).toMatch(/\.tip-long \{[^}]*max-height: 200px;/);
    expect(tipSrc).toMatch(/\.tip-long \{[^}]*overflow-y: auto;/);
  });
});
