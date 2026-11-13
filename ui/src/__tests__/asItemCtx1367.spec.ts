/**
 * 一千三百六十七批：分析组件条目右键菜单。
 *
 * 用户反复要求「鼠标右键必须极致的增强在整个项目，现在很多地方没有右键能力」。
 * 分析组件（analyzer / tokenizer / filter / char_filter / normalizer，60+ 条）此前
 * 右键是浏览器默认菜单——没有复制名称、没有复制配置、没有「粘进 mapping」的引用片段。
 *
 * 本 spec 锁：
 *  ① 条目挂 contextmenu 且 preventDefault（不弹浏览器菜单）
 *  ② 一级符合项目右键约定：≤2 高频动作 + 一个分组父行，不得平铺
 *  ③ 「复制引用代码」按段名生成**可直接粘进 mapping** 的形态：
 *     filter 段是数组元素，其余段是引用名（猜错就等于给了错代码）
 *  ④ 负控：把条目上的 contextmenu 绑定去掉 → ① 必须红
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '../views/AnalysisSettingsView.vue'), 'utf-8');

describe('1367 分析组件右键菜单', () => {
  it('① 条目挂 contextmenu.prevent（不弹浏览器默认菜单）', () => {
    expect(SRC, 'as-item 必须有右键绑定且 prevent').toMatch(
      /class="as-item"[\s\S]{0,160}@contextmenu\.prevent="openItemMenu\(\$event, g\.key, String\(name\), cfg\)"/,
    );
    expect(SRC, '必须用项目统一右键件').toContain("import CellContextMenu, { type CcmItem }");
    expect(SRC, '菜单必须真渲染').toContain(':items="itemMenuItems"');
  });

  it('② 一级 ≤2 高频动作 + 一个分组父行（不平铺）', () => {
    const i = SRC.indexOf('const itemMenuItems = computed<CcmItem[]>');
    expect(i, '必须有 itemMenuItems').toBeGreaterThan(-1);
    const body = SRC.slice(i, SRC.indexOf('\n});', i));
    const topLevel = [...body.matchAll(/key: '([a-z-]+)',\s*label:/g)].map(m => m[1]);
    /* 二级 children 里的键也匹配到，这里按「一级 = children 之前的字面」粗分 */
    const beforeChildren = body.slice(0, body.indexOf('children:'));
    const l1 = [...beforeChildren.matchAll(/key: '([a-z-]+)',\s*label:/g)].map(m => m[1]);
    expect(l1.length, `一级必须 ≤3（2 动作 + 1 分组父行），实际：${l1.join(',')}`).toBeLessThanOrEqual(3);
    expect(l1, '分组父行必须在').toContain('as-more');
    expect(topLevel, '引用代码不许放一级（低频，会撑爆菜单）').not.toBe('as-ref');
  });

  it('③ 引用片段按段名生成可直粘 mapping 的形态（filter 是数组元素，其余是引用名）', () => {
    const i = SRC.indexOf('function asRefSnippet');
    expect(i, '必须有 asRefSnippet').toBeGreaterThan(-1);
    const body = SRC.slice(i, SRC.indexOf('\n}', i));
    expect(body, 'filter 段必须生成数组元素').toMatch(/seg === 'filter'/);
    expect(body, '必须真的 JSON 化（不是拼字符串猜格式）').toContain('JSON.stringify');
    /* 段名映射必须覆盖 ES settings.analysis 的五个段 */
    const seg = SRC.slice(SRC.indexOf('const AS_SEG'), SRC.indexOf('function asRefSnippet'));
    for (const s of ['analyzer', 'tokenizer', 'filter', 'char_filter', 'normalizer']) {
      expect(seg, `段名映射必须含 ${s}`).toContain(`${s}:`);
    }
  });

  it('④ 负控：去掉 contextmenu 绑定 → ① 必须红', () => {
    const broken = SRC.replace('@contextmenu.prevent="openItemMenu($event, g.key, String(name), cfg)"', '');
    expect(broken, '负控必须真的改掉源码').not.toBe(SRC);
    expect(broken, '去掉后必须判不合格').not.toMatch(
      /class="as-item"[\s\S]{0,160}@contextmenu\.prevent="openItemMenu/,
    );
  });
});
