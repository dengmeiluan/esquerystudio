/* .pill 色款单轨看守。
 *
 * 治理本体：全局 .pill 的色款后缀是单字母（theme.css: .pill.g/.y/.r/.b/.n）。
 * 曾有页面写成 `class="pill p-b"` / `p-r` / `p-n` / `p-g` —— `.p-*` 全仓无任何 CSS 定义，
 * 这类徽标只拿到 .pill 基座（圆角/字号/内距），语义底色与文字色全部丢失，渲染成无色胶囊。
 * 这是用户直接可见的功能缺陷，不是风格偏好：
 *   AliasesView 曾有 7 处（别名下的「多写 / 只读 / 正常 / 可写」状态徽标全部无色），
 *   TasksView 曾有 1 处（reindex 任务的 action 徽标）。
 *
 * 已有的 clusterThreeState.spec.ts:117-125 是运行时断言，但只覆盖 TasksView 一页；
 * AliasesView 的 7 处正是从那道守卫下逃走的。本文件补的是全站面。
 *
 * ── 覆盖范围（按字面理解，不要外推）─────────────────────────
 * 断言落在源文本上：happy-dom 下 theme.css 不注入文档，getComputedStyle 取不到值，
 * 「底色是否真的丢了」在单测里无法测量。故断言与症状同构的量——
 * 源码里 .pill 元素上不许出现无定义的 p-* 后缀。
 *
 * 只认 `class="pill …"` 这一种写法（含 :class 静态字符串部分）。
 * 动态绑定 :class="{ y: cond }" 走对象语法，本身就不会拼出 p-*，不在覆盖内。
 *
 * 不覆盖：色款选得对不对（红 vs 绿的语义判断，需人工评审）、
 * 也不覆盖其他组件的局部徽标类（那属于徽标并轨的后续议题）。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const viewsDir = join(__dirname, '..', 'views');
const componentsDir = join(__dirname, '..', 'components');
const strip = (s: string) => s.replace(/<!--[\s\S]*?-->/g, ' ');

/* theme.css 里 .pill 实际提供的色款后缀。多一档少一档都要同步这里，
   否则守卫会把新增的合法色款误判成 p-* 同类问题。 */
const VALID = ['g', 'y', 'r', 'b', 'n'];

const vueFiles = (dir: string) =>
  readdirSync(dir).filter(f => f.endsWith('.vue')).map(f => ({ f, path: join(dir, f) }));

/* 取模板正文：必须切到【最后一个】</template> 之前。
   切第一个会在含具名插槽（<template #actions> 等）的文件上把正文截断——
   AliasesView 的 7 个状态徽标全在插槽之后，切第一个时匹配数为 0，
   否定断言恒真、正向锚恒假。emptyStatePadding.spec.ts:99 踩过同一坑。 */
const templateOf = (path: string) => {
  const src = strip(readFileSync(path, 'utf8'));
  const end = src.lastIndexOf('</template>');
  return end === -1 ? src : src.slice(0, end);
};

describe('.pill 色款单轨（p-* 无定义类不许回潮）', () => {
  for (const { f, path } of [...vueFiles(viewsDir), ...vueFiles(componentsDir)]) {
    it(`${f} 的 .pill 不拼无定义的 p-* 色款`, () => {
      const tpl = templateOf(path);
      /* 抓 class 属性里同时含 pill 与 p-<单字母> 的元素 */
      const bad = [...tpl.matchAll(/class\s*=\s*"([^"]*\bpill\b[^"]*)"/g)]
        .map(m => m[1])
        .filter(cls => /\bp-[a-z]\b/.test(cls));

      expect(
        bad,
        `${f} 用了 .p-* 色款（全仓无 CSS 定义，底色会丢）；`
        + `全局 .pill 的色款是单字母：${VALID.join(' / ')}`,
      ).toEqual([]);
    });
  }

  /* 反向锚：theme.css 必须真的提供这五档，否则上面的否定断言在
     「色款全被删掉、所有 pill 都无色」时依然全绿。 */
  it('theme.css 提供 .pill 的五档色款', () => {
    const css = readFileSync(join(__dirname, '..', 'theme.css'), 'utf8');
    for (const k of VALID) {
      expect(
        new RegExp(String.raw`\.pill\.${k}\s*\{`).test(css),
        `theme.css 缺 .pill.${k} 色款；引用它的页面会退化成无色胶囊`,
      ).toBe(true);
    }
  });

  /* AliasesView 是本次修复的现场，锚住它真的在用合法色款——
     只有否定断言时，把这 7 个徽标整段删掉也能让上面全绿。
     五百三十一批同步更新：七处手写 pill 改用 StatusPill 统一件（色款走组件 tone 五主档，
     单源看守归 componentUnify530 / semanticTier531），锚改锁组件化形态不回退。 */
  it('AliasesView 的状态徽标使用合法色款（五百三十一批起锚 StatusPill 组件化形态）', () => {
    const tpl = templateOf(join(viewsDir, 'AliasesView.vue'));
    /* 按行匹配：v-if 表达式里含「>」会截断标签级正则（g.writeCount > 1），
       七处 StatusPill 全部单行书写，行级断言等价且稳 */
    const pillLines = tpl.split('\n').filter(l => l.includes('<StatusPill'));
    expect(pillLines.length, 'AliasesView 的别名状态徽标消失了').toBeGreaterThanOrEqual(7);
    for (const line of pillLines) {
      expect(line, `AliasesView 有 StatusPill 未带 tone 色款：${line.trim()}`).toMatch(/(:tone=|\btone=")/);
    }
  });
});
