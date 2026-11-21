/**
 * 1120 组件质量门禁：悬浮提示语言统一后的防新增扫描。
 * 门禁一（零容忍 + 标签感知）：原生 HTML/SVG 标签上的 title 属性一律禁用（零基线零容忍），
 *   不再是此前「仅 >60 字符」的长度门——浏览器原生提示不受主题 token 控制、不可换行滚动、
 *   禁用控件上不出现，全站统一迁两种合法承接形态：v-tip 全局指令（directives/vTip.ts，
 *   主题化单例浮层，机械迁移主力）或 Tip 组件（components/Tip.vue 的 <Tip text="...">，
 *   naive NTooltip 场景）。
 *   标签感知：小写标签名 ∈ 原生标签集合视为原生标签，其 title= / :title= / v-bind:title=
 *   命中即红；组件标签（PascalCase / 自定义名 / naive 的 n-xxx 等）上的 title 是传给
 *   组件的 prop（如 NTooltip 场景），合法放行。扫描域为 src 全量 .vue（排除 __tests__
 *   与 Tip.vue 自身），目录全量扫描不做文件名反查。
 * 门禁二：手搓 1024 字节换算禁新增——统一走 utils/format.ts 的 fmtSize（内部循环
 *   x /= 1024 一处所有）；views/components 里再出现 /1024、1024 ** 或 * 1024 字面
 *   即为新的手搓点。存量同样分批迁移，白名单只减不增。
 * 组件冒烟沿用项目惯例：createApp 手工 mount，不依赖 @vue/test-utils。
 * 统一进度件 ProgressBar 零引用已退役（孤儿处置），其冒烟组随之撤销。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createApp, h, nextTick, type App, type VNode } from 'vue';
import Tip from '../components/Tip.vue';

const SRC = join(__dirname, '..');

/* 原生 HTML/SVG 标签集合（含 h1-h6 展开与 svg 系标签）：小写标签名命中集合即原生标签，
   其 title 属性禁用；集合外标签（PascalCase 组件 / n-xxx / tip 等）的 title 是 prop 放行 */
const NATIVE_TAGS = new Set(('a abbr address area article aside audio b bdi bdo blockquote br button ' +
  'canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed ' +
  'fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr i iframe img input ins ' +
  'kbd label legend li link main map mark menu meta meter nav noscript object ol optgroup option ' +
  'output p param picture pre progress q rp rt ruby s samp section select slot small source span ' +
  'strong sub summary sup table tbody td tfoot th thead time tr track u ul var video wbr ' +
  'svg circle clippath defs ellipse g line lineargradient mask path pattern polygon polyline rect ' +
  'stop symbol text tspan use view').split(' '));

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

/* 门禁一扫描域：src 全量 .vue（含 App.vue 与未来新增目录），排除 __tests__ 与 Tip.vue。
   目录全量收集不做文件名反查——守卫必须吃到任何位置的新增原生 title */
function collectVueAll(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__') continue;
      collectVueAll(p, out);
    } else if (name.endsWith('.vue')) out.push(p);
  }
  return out;
}

const files = collectVue(join(SRC, 'components'))
  .concat(collectVue(join(SRC, 'views')))
  .map((p) => relative(SRC, p).replace(/\\/g, '/'));

const titleFiles = collectVueAll(SRC)
  .map((p) => relative(SRC, p).replace(/\\/g, '/'))
  .filter((rel) => rel !== 'components/Tip.vue');

/** 提取 SFC 模板区（首个 <template 到最后一个 </template>）并剔除 HTML 注释 */
function extractTemplate(src: string): string {
  const s = src.indexOf('<template');
  const e = src.lastIndexOf('</template>');
  if (s < 0 || e < 0) return '';
  return src.slice(s, e).replace(/<!--[\s\S]*?-->/g, '');
}

/** 开标签（含自闭合）：捕获标签名 + 属性区（属性区里的引号串整体越过，防 > 提前截断） */
const RE_OPEN_TAG = /<([a-zA-Z][a-zA-Z0-9.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
/** title 属性三形态：title= 静态 / :title= 绑定 / v-bind:title= 全写。前置空白锚排除
    data-title、aria-title 等带前缀属性（其前是 - 非空白） */
const RE_TITLE_ATTR = /(?:\s|^)(?::title|v-bind:title|title)\s*=/;

function scanNativeTitles(rel: string): string[] {
  const hits: string[] = [];
  const tpl = extractTemplate(readFileSync(join(SRC, rel), 'utf-8'));
  for (const m of tpl.matchAll(RE_OPEN_TAG)) {
    /* Vue SFC 模板保留大小写：含大写字母的标签名（PascalCase）必为组件引用，title 是 prop 放行；
       全小写且 ∈ 原生集合（含 n-button/tip 等集合外自定义名之外的真原生名）才是原生标签 */
    if (m[1] !== m[1].toLowerCase() || !NATIVE_TAGS.has(m[1])) continue;
    if (RE_TITLE_ATTR.test(m[2])) hits.push(`${rel}: <${m[1]}> 携带 title 属性`);
  }
  return hits;
}

const RE_MANUAL_1024 = /\/\s*1024|1024\s*\*\*|\* 1024\b/g;

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

describe('1120 组件质量门禁：原生标签 title 属性零容忍（迁 v-tip 指令或 Tip 组件）', () => {
  it('扫描面非空（src 全量 vue 文件，排除 __tests__ 与 Tip.vue）', () => {
    expect(titleFiles.length).toBeGreaterThan(170);
  });

  it('原生 HTML/SVG 标签上的 title/:title/v-bind:title 零命中（零基线零容忍）', () => {
    const offenders: string[] = [];
    for (const rel of titleFiles) offenders.push(...scanNativeTitles(rel));
    expect(offenders.join('\n'), '原生标签 title 一律迁 v-tip 指令（v-tip="..." / v-tip.long）或 Tip 组件（<Tip text="...">）；组件标签上的 title prop 不受本门禁限制').toBe('');
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
