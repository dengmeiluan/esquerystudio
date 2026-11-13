/* 工具条左右分栏（.lr-bar）骨架单轨看守。
 *
 * 治理本体：11 个 view 的页顶工具条原本各写一份三条规则（容器 + 左栏 + 右栏），
 * 共性是 flex + space-between + 两子栏 flex/align-items:center，离散的只有档位：
 *   - 右栏 gap 曾有 6px / 8px / 10px / var(--sp-2) / var(--sp-3) 五档
 *   - 容器 align-items:center 4 有 7 无（无害仅因子栏各自设了，是巧合不是设计）
 *   - flex-wrap:wrap 7 有 4 无
 *   - SnapshotsView 的右栏漏了 align-items:center（唯一一个，靠内容恰好等高蒙混过去）
 * 骨架收敛到 theme.css 的 .lr-bar / -l / -r，各 view 只留 padding 或 margin 真差异。
 *
 * 本文件防两类静默失效：
 *
 *  1) 消费方丢掉 lr-bar 骨架类。这是最危险的一种：display:flex 与
 *     justify-content:space-between 全部由骨架提供。丢了类之后 DOM 完好、
 *     内容全在、全量测试全绿，但两栏会塌成纵向堆叠——工具条从一行变三行，
 *     右侧动作按钮跑到标题下方。
 *
 *  2) 骨架自身被掏空。.lr-bar 的 flex/space-between 或子栏的 flex 少任何一个，
 *     11 处一起塌。
 *
 * 走源文本匹配的理由同 indBarSingleTrack.spec.ts 与 emptyStatePadding.spec.ts:24-27：
 * happy-dom 下 theme.css 与 scoped <style> 都不参与计算，
 * getComputedStyle(el).display === ''，渲染后的布局断言必然是死断言。
 *
 * 剥注释同 emptyStatePadding.spec.ts:29 的教训——注释里的字面不算数。
 *
 * ── 覆盖边界（按字面理解，不要外推）───────────────────────────
 * 只看守名单内 11 处 + 骨架本体。新写一个 .xx-toolbar 手搓左右分栏完全绕过这里；
 * 新增消费方必须同步 CONSUMERS，否则本文件对它没有任何覆盖。
 * 卡片内的 section header（.xx-card-hd 一族，约 20 处）不在治理范围：它们带
 * border-bottom、嵌在卡片体内、部分是每行一个的重复项，与页顶工具条不同构。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const views = join(__dirname, '..', 'views');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* [文件, 容器局部类, 左栏局部类, 右栏局部类]。
   DslQueryView 的子栏命名是 -tb-l/-tb-r（不跟容器名），故三者分列而非拼接。 */
const CONSUMERS: Array<[string, string, string, string]> = [
  ['AliasesView.vue', 'alv-bar', 'alv-bar-l', 'alv-bar-r'],
  /* v3.0.1 三横幅重造:Ilm/Templates/Snapshots 工具条并入 PageHeader actions,lr-bar 骨架随横幅退役移出名单 */
  ['IndexSettingsView.vue', 'is-bar', 'is-bar-l', 'is-bar-r'],
  ['TopologyView.vue', 'tp-bar', 'tp-bar-l', 'tp-bar-r'],
  ['TasksView.vue', 'tv-bar', 'tv-bar-l', 'tv-bar-r'],
  ['SearchSandboxView.vue', 'ss-bar', 'ss-bar-l', 'ss-bar-r'],
  ['TaskTreeView.vue', 'tt-bar', 'tt-bar-l', 'tt-bar-r'],
  ['ClusterSettingsView.vue', 'cs-bar', 'cs-bar-l', 'cs-bar-r'],
  ['DslQueryView.vue', 'dq-toolbar', 'dq-tb-l', 'dq-tb-r'],
];

/* 取模板正文到最后一个 </template>：切第一个会在含具名插槽的文件上截断正文
   （pillColorTrack.spec.ts 与 emptyStatePadding.spec.ts:99 均踩过此坑）。 */
function template(file: string): string {
  const full = strip(readFileSync(join(views, file), 'utf8'));
  const end = full.lastIndexOf('</template>');
  return end === -1 ? full : full.slice(0, end);
}

describe('工具条左右分栏骨架单轨', () => {
  for (const [file, container, left, right] of CONSUMERS) {
    it(`${file} 的三处挂载点都带 lr-bar 骨架类`, () => {
      const tpl = template(file);
      for (const [local, skeleton] of [[container, 'lr-bar'], [left, 'lr-bar-l'], [right, 'lr-bar-r']]) {
        /* 收尾锚 (?=["\s]) 对局部类同样必需：\b 在 alv-bar 与 -l 之间成立（- 是非词字符），
           不锚定会让查容器 .alv-bar 时把 .alv-bar-l / -r 的标签也收进来，
           而那两个标签带的是 lr-bar-l / lr-bar-r，于是断言假失败。 */
        const tags = [...tpl.matchAll(new RegExp(String.raw`<[^>]*\b${local}(?=["\s])[^>]*>`, 'g'))].map(m => m[0]);
        expect(tags.length, `.${local} 的挂载点消失了，工具条被删或改名`).toBeGreaterThanOrEqual(1);
        for (const tag of tags) {
          /* \b 在 lr-bar 与 lr-bar-l 之间不足以区分（前者是后者前缀），
             故用「后随空白或引号」收尾，避免 lr-bar-l 被当成 lr-bar 的命中。 */
          expect(
            new RegExp(String.raw`\b${skeleton}(?=["\s])`).test(tag),
            `.${local} 未挂 ${skeleton}——骨架提供 display:flex 与 space-between，`
            + '丢了它两栏塌成纵向堆叠（右侧动作跑到标题下方），全量测试不会报错',
          ).toBe(true);
        }
      }
    });

    it(`${file} 不得重新内联骨架职责`, () => {
      const css = strip(readFileSync(join(views, file), 'utf8'));
      /* 容器规则可以留 padding / margin（真差异），但不得再声明 flex 三件套 */
      const rule = new RegExp(String.raw`(?:^|[\s,}])\.${container}\s*\{([^}]*)\}`, 'm').exec(css);
      if (rule) {
        for (const prop of ['display', 'justify-content', 'align-items', 'flex-wrap']) {
          expect(
            new RegExp(String.raw`\b${prop}\s*:`).test(rule[1]),
            `.${container} 重新声明了 ${prop}——该属性属骨架职责，局部只应留 padding/margin`,
          ).toBe(false);
        }
      }
      /* 子栏规则应当完全不存在（gap 五档飘移正是从这里来的） */
      for (const sub of [left, right]) {
        expect(
          new RegExp(String.raw`(?:^|[\s,}])\.${sub}\s*(?:,[^{]*)?\{`, 'm').test(css),
          `.${sub} 又出现了局部规则——子栏的 flex/align-items/gap 一律归骨架，`
          + '局部规则会让 gap 档位重新分叉（治理前右栏有 5 档）',
        ).toBe(false);
      }
    });
  }

  it('theme.css 的 .lr-bar 骨架三要件齐备', () => {
    const css = strip(readFileSync(join(__dirname, '..', 'theme.css'), 'utf8'));

    const bar = /(?:^|[\s,}])\.lr-bar\s*\{([^}]*)\}/m.exec(css);
    expect(bar, 'theme.css 的 .lr-bar 规则消失了，11 处工具条会一起塌').toBeTruthy();
    expect(/display\s*:\s*flex/.test(bar![1]), '.lr-bar 的 display:flex 消失了，两栏塌成纵向').toBe(true);
    expect(
      /justify-content\s*:\s*space-between/.test(bar![1]),
      '.lr-bar 的 space-between 消失了，右栏不再靠右',
    ).toBe(true);

    const l = /(?:^|[\s,}])\.lr-bar-l\s*\{([^}]*)\}/m.exec(css);
    expect(l, '.lr-bar-l 规则消失了').toBeTruthy();
    expect(/display\s*:\s*flex/.test(l![1]), '.lr-bar-l 的 display:flex 消失了').toBe(true);
    /* 左栏必须可压缩：长索引名/过滤框要能收窄并截断，否则会把右栏挤出容器 */
    expect(/min-width\s*:\s*0/.test(l![1]), '.lr-bar-l 的 min-width:0 消失了，长内容会挤爆右栏').toBe(true);

    const r = /(?:^|[\s,}])\.lr-bar-r\s*\{([^}]*)\}/m.exec(css);
    expect(r, '.lr-bar-r 规则消失了').toBeTruthy();
    expect(/display\s*:\s*flex/.test(r![1]), '.lr-bar-r 的 display:flex 消失了').toBe(true);
    /* 右栏不可压缩：动作按钮被压缩会文字换行变形 */
    expect(/flex-shrink\s*:\s*0/.test(r![1]), '.lr-bar-r 的 flex-shrink:0 消失了，动作按钮会被挤变形').toBe(true);
    /* 治理前 SnapshotsView 的右栏漏了这条，锁住它 */
    expect(/align-items\s*:\s*center/.test(r![1]), '.lr-bar-r 的 align-items:center 消失了，右栏内容不再垂直居中').toBe(true);
  });
});
