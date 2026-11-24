/* R99 空态留白治理的防回退看守。
 *
 * 治理本体：空态原本各写各的大 padding（40–80px），
 * 是用户「空间很大却大片留白」的直接来源；改用 EmptyState 后
 * 统一由组件的 padding: 34px 16px 决定。
 *
 * 本断言防的是「有人给某页重新写一条大 padding 的空态样式」——
 * 这会静默退回原症状，而全量测试不会有任何反应。
 *
 * ── 覆盖范围（务必按字面理解，不要外推）───────────────────────
 * 本看守【按类名命名约定工作，不是全站逐页看守】。
 * 它只认类名里含 empty / placeholder / blank / nodata / no-data 的选择器与元素；
 * 新造一个类名（例如 .xx-void、.slm-hint）就能完全绕过这里的全部断言。
 * 新增空态类命名时必须同步 NAME_RE 这个列表，否则本文件会静默失去覆盖。
 * 下面那一批逐视图断言容易给人「全站每页都被看住了」的印象——它不是，
 * 它只是「对每个视图文件各跑一遍同一条命名约定匹配」。
 *
 * 覆盖两个面：
 *   1) <style> 段里的 CSS 规则（.xx-empty { padding: 60px }）
 *   2) <template> 段里的行内 style（<div class="xx-empty" style="padding:60px">）
 * 面 2 曾是真实逃逸口：F1 之前有 8 处行内大 padding 全部逃过普查与本看守。
 *
 * 为什么不断言「文件里必须出现 <EmptyState」：那只测代码长什么样。
 * 为什么不在单测里断言渲染后的 padding 值：本仓库 vitest 环境是 happy-dom，
 * scoped <style> 不参与计算，getComputedStyle(el).padding === ''，
 * 任何数值断言都是死断言（恒真或恒假）。
 * 故断言落在唯一可靠且与症状同构的量上：源文本里不许存在大 padding 的空态声明。
 *
 * 剥注释同 mappingEmptyState.spec.ts:18 的教训——注释里的字面不算数。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(__dirname, '..', 'views');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* 空态类名约定。CSS 选择器与 template class 属性共用同一份名单，
   避免「一个扩了一个没扩」导致两面覆盖不一致。 */
const NAME_RE = 'empty|placeholder|blank|nodata|no-data';

/* 阈值：EmptyState 自身是 34px；40px 起算「大留白」，与症状描述（40–80px）对齐。 */
const BIG = 40;

/* 把一段 padding 声明文本里的所有长度值折算成 px（rem/em 按 16px 同轨）。 */
const padsOf = (decl: string) =>
  [...decl.matchAll(/padding(?:-(?:top|bottom|left|right))?\s*:\s*([^;}"']+)/gi)]
    .flatMap(p => [...p[1].matchAll(/([\d.]+)(px|rem|em)/gi)]
      .map(v => Number(v[1]) * (v[2].toLowerCase() === 'px' ? 1 : 16)));

/* 被跳过、且已记名的进行态/富内容/小容器豁免。名单必须逐条给理由；
   空着或塞满等于本测试失效。
   R99-F2：DevToolsView / FavoritesView / RemoteClustersView 三条已删除——
   它们当初的豁免理由都是「富内容 / 多按钮，props 装不下」（判据2/3），
   而 EmptyState 加了默认插槽逃生舱后这三处已真替换掉，
   自有大 padding 的 .dt-empty / .fv-empty / .rc-empty 规则随之删除。
   留在名单里会触发反腐化断言（豁免页必须仍真的带大 padding）而变红——那正是本回路的设计意图。
   五百三十批：IndexSettingsView 条目已删除——.is-empty 失败态留白归一全站 34px 16px 契约，
   豁免失效按本回路设计自动出清。 */
const EXEMPT: Record<string, string> = {};

describe('R99 空态留白防回退', () => {
  for (const f of readdirSync(dir).filter(x => x.endsWith('.vue'))) {
    it(`${f} 不含大 padding 的空态样式规则`, () => {
      const css = strip(readFileSync(join(dir, f), 'utf8'));
      const bad = [...css.matchAll(
        new RegExp(String.raw`\.[a-z-]*(?:${NAME_RE})[a-z-]*[^{}]*\{([^}]*)\}`, 'gi'),
      )]
        .map(m => ({
          rule: m[0],
          /* 取 padding / padding-top 等所有边的所有长度值；px 与 rem/em 同轨换算。
             只 exec 第一个值会被 `padding: 10px 60px` / `padding-top: 60px` / `3rem` 绕过。 */
          pads: padsOf(m[1]),
        }))
        .filter(x => x.pads.some(v => v >= BIG));

      if (EXEMPT[f]) {
        /* 豁免页也要断言「豁免仍然必要」，否则名单会腐化成永久通行证 */
        expect(bad.length, `${f} 已在豁免名单但已无大 padding 空态，请删除豁免`).toBeGreaterThan(0);
        return;
      }
      expect(bad.map(x => x.rule), `${f} 出现大 padding 空态样式，空态留白应由 EmptyState(34px 16px) 决定`).toEqual([]);
    });

    /* 面 2：<template> 里的行内 style。
       F1 之前有 8 处（MappingView/DslQueryView/IlmView/ClusterSettingsView/
       RestView/SystemView）写成 <div class="empty" style="padding-top:80px">，
       CSS 规则扫描完全看不见它们，于是「21 处」这个分母本身少算了。
       覆盖的写法变体（缺一条就是新的逃逸口）：
         - class 在 style 之前：class="x-empty" ... style="padding:60px"
         - style 在 class 之前：style="padding:60px" ... class="x-empty"
         - 双引号与单引号两种属性定界符
       仅扫 </template> 之前的正文，避开 <style> 段与脚本。 */
    it(`${f} 模板里不得有行内大 padding 的空态`, () => {
      const tpl = readFileSync(join(dir, f), 'utf8').split('</template>')[0];
      const CLS = String.raw`class\s*=\s*(?:"[^"]*(?:${NAME_RE})[^"]*"|'[^']*(?:${NAME_RE})[^']*')`;
      const STY = String.raw`style\s*=\s*(?:"([^"]*padding[^"]*)"|'([^']*padding[^']*)')`;
      /* 两个顺序各扫一遍；标签内不跨 '>' 匹配，避免把相邻标签串成一条。 */
      const hits = [
        ...tpl.matchAll(new RegExp(`<[^>]*${CLS}[^>]*${STY}[^>]*>`, 'gi')),
        ...tpl.matchAll(new RegExp(`<[^>]*${STY}[^>]*${CLS}[^>]*>`, 'gi')),
      ].filter(m => padsOf(m[1] ?? m[2] ?? '').some(v => v >= BIG));

      expect(
        [...new Set(hits.map(h => h[0].trim()))],
        `${f} 行内 padding 会静默复发留白症状（本次治理的原始逃逸口）`,
      ).toEqual([]);
    });
  }

  /* 上面那两批逐视图断言全盯「各视图有没有重新写大 padding」，但组件自身那个值无人看守：
     把 EmptyState.vue 的 34px 改成 60px，逐视图断言全绿而全站空态留白一起复发。
     padding 恰是本波治理的唯一本体，故单独锁住。
     走源文本匹配是有意的：happy-dom 下 scoped <style> 不参与计算，
     getComputedStyle(el).padding === ''，真渲染的数值断言必然是死断言。 */
  it('EmptyState 组件自身的 padding 不得放大', () => {
    const css = strip(readFileSync(join(__dirname, '..', 'components', 'EmptyState.vue'), 'utf8'));
    const pad = /\.empty-state\s*\{[^}]*padding:\s*([\d.]+)px/.exec(css);
    expect(pad, 'EmptyState 的 .empty-state padding 声明消失了').toBeTruthy();
    expect(Number(pad![1]), '组件 padding 被放大，全站空态留白会一起复发').toBeLessThanOrEqual(34);
  });

  /* 与上一条对称的另一半：theme.css 的全局 .empty。
     上面所有断言都只读 src/views/*.vue 与 EmptyState.vue，theme.css 从不在扫描范围内，
     而全局 .empty 被 17 个 view 直接引用（其中 4 个既无 scoped 覆盖也无行内 style，
     留白完全由这一条决定）。把它改回 48px 时，逐视图断言与组件断言全绿，
     症状却在这批页面复发——这正是本条要堵的盲区。
     阈值取 34：与组件同值即为对齐，超出即为放大。
     同样走源文本匹配：theme.css 未在 happy-dom 下注入文档，
     getComputedStyle 取不到值，数值断言只能落在源文本上（同上一条的理由）。 */
  it('全局 .empty 的 padding 必须与 EmptyState 对齐、不得放大', () => {
    const css = strip(readFileSync(join(__dirname, '..', 'theme.css'), 'utf8'));
    /* 只锚定 .empty 本体规则：[^{}]* 之外用边界排除 .empty::before / .xx-empty 等兄弟选择器 */
    const rule = /(?:^|[\s,}])\.empty\s*\{([^}]*)\}/m.exec(css);
    expect(rule, 'theme.css 的全局 .empty 规则消失了').toBeTruthy();
    const pads = padsOf(rule![1]);
    expect(pads.length, '全局 .empty 的 padding 声明消失了').toBeGreaterThan(0);
    expect(
      Math.max(...pads),
      '全局 .empty padding 被放大，17 个 view 的空态留白会一起复发（须与 EmptyState 的 34px 对齐）',
    ).toBeLessThanOrEqual(34);
  });

  /* ConfigDriftView 的老病：加载中态与「真无 provider」空态曾复用同一套 class
     （.cd-empty / .cd-empty-tt），于是转圈的「正在加载」长得跟「确实没有」一样，
     且这一屏因此整条保留了 60px 大留白（豁免理由即「加载态在用同一个 class」）。
     本条锁的是「加载态不得再挂空态家族类名」：
     加载分支的判据是 loadingKeys，其 class 必须不落在 NAME_RE 命名约定里，
     否则它会重新被上面那批逐视图 padding 断言当成空态、并重新需要豁免。
     走源文本匹配同本文件其余断言：happy-dom 下 scoped <style> 不参与计算。
     本条不是恒真——把 class="cd-loading" 改回 class="cd-empty" 即变红（已做变异验证）。 */
  it('ConfigDriftView 的加载态不得复用空态类名（进行态必须与空态视觉可分）', () => {
    const tpl = readFileSync(join(dir, 'ConfigDriftView.vue'), 'utf8').split('</template>')[0];
    /* 抓 loadingKeys 那个分支所在的开标签，取它的 class 值 */
    const tag = /<[^>]*v-if="[^"]*loadingKeys[^"]*"[^>]*>/i.exec(tpl);
    expect(tag, '加载态分支（v-if 含 loadingKeys）消失了，三态结构被改动').toBeTruthy();
    const cls = /class\s*=\s*"([^"]*)"/i.exec(tag![0]);
    expect(cls, '加载态分支没有 class，无法确认它与空态是否可分').toBeTruthy();
    expect(
      new RegExp(NAME_RE, 'i').test(cls![1]),
      `加载态 class="${cls?.[1]}" 命中空态命名约定（${NAME_RE}）——`
      + '进行态又在伪装成空态；加载中应有自己的 class（如 .cd-loading）',
    ).toBe(false);
  });
});
