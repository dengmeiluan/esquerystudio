/* R93-83 守门：命令面板拼音别名表「每个键都能被真实构造出的 title 命中」。
 *
 * 缺陷背景：导航项 title 是 '前往：'+name，而 ALIAS_MAP 键是裸名；消费点精确查表
 * ALIAS_MAP[title] 时导航类全死，拼音搜索对全部导航项从设计上全程失效。#72 的 commit
 * message 自证「导航类 20 键整体失配」（= 12 导航裸名 + 8 昵称孤儿）。
 *
 * 修法：把表与查表抽到本模块（utils/cmdAlias.ts），查表前对导航类去 '前往：' 前缀；
 * 8 个昵称孤儿键名改成它真正想指的导航名/动作 title。
 *
 * 判据落点（见本波规则 7 / #86 教训）：
 *   - 不锚在 '前往：' 字面（那是外观），锚在「构造出的 title 经查表能拿到非空别名」这个**行为**；
 *   - 「真实构造出的 title」逐键遍历断言，不抽查；
 *   - 配反向变异证明对照是活的——把去前缀拆掉（恢复成 ALIAS_MAP[title]），列出哪些键变红，
 *     如实报条数（action 类孤儿不依赖去前缀，不会红，不凑数）。
 *
 * ⚠ 前缀冒号是全角 '：'(U+FF1A)。写成半角 ':' 会静默永不命中（无编译错误），
 * 单设一条全/半角看守盯住它——这正是本波「正则里一个字符错了、静默失效」形态的看门。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALIAS_MAP, aliasForTitle, NAV_TITLE_PREFIX,
} from '../cmdAlias';
import { NAV_ITEMS } from '../../router';

/* 真实构造出的 title 全集：
 *   导航类 = CmdPalette 源码里的前缀字面量 + NAV_ITEMS[i].name
 *   动作类 = CmdPalette.vue 里 title: '...' 字面量
 * 两者都从源码静态解析（与 threeStateContract/inlineRenderScope 范式一致：读源码抽契约），
 * 避免在这里把 title 抄一份（抄了就会漂移）。 */
const consoleSrc = readFileSync(join(__dirname, '..', '..', 'components', 'CmdPalette.vue'), 'utf8');
const actionTitles = [...consoleSrc.matchAll(/title:\s*'([^']+)'/g)].map(m => m[1]);

/* ⚠ 导航前缀必须从**组件源码**解析，不能复用被测模块的 NAV_TITLE_PREFIX 常量。
   两侧若同源，把常量改成半角时「测试构造的 title」与「查表用的前缀」会一起漂移而自洽通过——
   变异实测证实过这个假绿（同 hotkeys.spec.ts 注释点名的失效模式：两侧同源则改数据也照样绿）。
   真实 title 由 CmdPalette 的 '前往：'+n.name 产出，故判据的「真实」那一侧只能来自组件源码。 */
const SRC_NAV_PREFIX = (() => {
  const m = consoleSrc.match(/title:\s*'([^']*)'\s*\+\s*n\.name/);
  if (!m) throw new Error('CmdPalette 里没找到 title: 前缀 + n.name 的导航构造');
  return m[1];
})();

const navNames = NAV_ITEMS.map(n => n.name);
const navTitles = navNames.map(n => SRC_NAV_PREFIX + n);
const allRealTitles = new Set([...navTitles, ...actionTitles]);

/* 「裸标识」= title 去掉导航前缀后的形态：导航类是裸名，动作类就是 title 本身。
   ALIAS_MAP 的键必须等于某条命令的裸标识，精确查表才命中。 */
const bareIdentities = new Set([...navNames, ...actionTitles]);

describe('R93 别名表 · 每个键都能被真实构造出的 title 命中（遍历断言）', () => {
  it('自检：真实 title 全集与裸标识全集非空（否则下面遍历恒真）', () => {
    expect(allRealTitles.size).toBeGreaterThan(0);
    expect(bareIdentities.size).toBeGreaterThan(0);
    expect(Object.keys(ALIAS_MAP).length).toBeGreaterThan(0);
  });

  /* 核心判据：每个键必须等于某条命令的裸标识（导航裸名或动作 title）。
     遍历 ALIAS_MAP 全表，不抽查。键落在裸标识上 ⇒ 精确查表命中 ⇒ 该 title 经
     aliasForTitle 拿到非空别名。这把判据钉在「行为」（查表拿到非空）上，不钉在字面上。 */
  it.each(Object.keys(ALIAS_MAP).map(k => [k] as [string]))(
    '键 [%s] 恰为某条真实命令的裸标识，且该 title 查表拿到非空别名',
    (key) => {
      expect(bareIdentities.has(key), `键 [${key}] 不是任何真实命令的裸标识（导航裸名/动作 title），精确查表永不命中`).toBe(true);
      // 反推它对应的真实 title：导航类带前缀，动作类就是键本身
      const title = navNames.includes(key) ? SRC_NAV_PREFIX + key : key;
      expect(allRealTitles.has(title), `键 [${key}] 反推出的 title [${title}] 不在真实 title 全集里`).toBe(true);
      const alias = aliasForTitle(title);
      expect(alias, `title [${title}] 经 aliasForTitle 查表得空——别名链断`).toBeTruthy();
    },
  );

  /* 反向：裸标识里凡有别名登记的，aliasForTitle 都得拿到非空——保证没有「键在表里却查不到」的反向漏。 */
  it('每个真实命令的裸标识若在表中登记，aliasForTitle(title) 必拿到非空', () => {
    const misses: string[] = [];
    for (const id of bareIdentities) {
      if (!(id in ALIAS_MAP)) continue; // 未登记不强制
      const title = navNames.includes(id) ? SRC_NAV_PREFIX + id : id;
      if (!aliasForTitle(title)) misses.push(id);
    }
    expect(misses, `这些裸标识登记了却查不到: ${misses.join(', ')}`).toEqual([]);
  });
});

describe('R93 全角冒号看守（半角静默失效形态）', () => {
  /* 前缀冒号必须是全角 U+FF1A。半角会静默永不命中——无编译错误，拼音搜索对导航项全程失效。
     正反两面：全角在、半角不在。两侧都钉才不致「常量自己改了，断言跟着改还绿」。 */
  it('NAV_TITLE_PREFIX 的冒号是全角 U+FF1A，不是半角', () => {
    expect(NAV_TITLE_PREFIX).toBe('前往：');
    expect([...NAV_TITLE_PREFIX].map(c => c.codePointAt(0)!.toString(16)))
      .toEqual(['524d', '5f80', 'ff1a']); // 前 / 往 / 全角：
  });

  /* 同源校验：CmdPalette 构造导航 title 用的前缀字面量必须与本模块常量同字符。
     两处各写一份字面量（一处本模块、一处组件构造），任一改成半角都静默失效，
     故这条专门盯「两侧字符一致」。 */
  it('CmdPalette 构造导航 title 的前缀字面量与本模块常量同字符（同源不漂移）', () => {
    const m = consoleSrc.match(/title:\s*'([^']*)'\s*\+\s*n\.name/);
    expect(m, 'CmdPalette 里没找到 title: 前缀 + n.name 的导航构造').toBeTruthy();
    const prefixLit = m![1];
    expect(prefixLit).toBe(NAV_TITLE_PREFIX);
  });

  /* 行为闭环：一个带前缀的导航 title 真能拿到非空别名——
     证明去前缀真的生效了（不是写了个 startsWith 却 slice 错位置）。 */
  it('带前缀的导航 title 查表拿到非空（去前缀确实生效）', () => {
    const sample = SRC_NAV_PREFIX + '概览';
    expect(aliasForTitle(sample)).toBe(ALIAS_MAP['概览']);
    expect(aliasForTitle(sample)).toBeTruthy();
  });

  /* 若误用半角前缀去查（变异：半角 ':'），带全角前缀的真实 title 永远 startsWith 失败 → 查不到。
     这条把「半角变异」具体化为行为：用半角前缀去查导航 title，结果必须为空（证明全角是承重的）。 */
  it('半角前缀变异：用半角 \':\' 当前缀，全角 title 查表必为空（证明全角是承重的）', () => {
    const halfPrefix = '前往:'; // 半角冒号
    expect(halfPrefix).not.toBe(NAV_TITLE_PREFIX); // 自检：确实不同
    const realTitle = SRC_NAV_PREFIX + '概览';
    // 模拟半角变异实现：startsWith(halfPrefix) 永假 → 直接查带前缀的 title → 表里没有这个键
    const mutated = realTitle.startsWith(halfPrefix) ? realTitle.slice(halfPrefix.length) : realTitle;
    expect(ALIAS_MAP[mutated] || '').toBe('');
  });
});

describe('R93 反向变异：拆掉去前缀后哪些键变红（红名单，如实）', () => {
  /* 变异实现 = 把去前缀逻辑拆掉，恢复成缺陷形态 ALIAS_MAP[title]（不去前缀）。
     在这个变异下，「键能被命中」当且仅当「键本身就是某个真实 title（带前缀的导航 title 或动作 title）」。
     - 导航裸名键：真实 title 是 '前往：'+name ≠ 裸名 → 变异下查不到 → 红
     - 改名后落到导航名的 7 个孤儿：同理 → 红
     - 落到动作 title 的 1 个孤儿（'打开搜索沙盒'）：动作 title 无前缀，键==title，变异下仍命中 → 不红
     - 原本就命中动作 title 的键：变异下仍命中 → 不红
     故预期红数 = 12 导航 + 7 孤儿 = 19（不是 20，如实）。 */
  const mutatedLookup = (title: string) => ALIAS_MAP[title] || '';

  const alive: string[] = [];
  const dead: string[] = [];
  for (const key of Object.keys(ALIAS_MAP)) {
    const title = navNames.includes(key) ? SRC_NAV_PREFIX + key : key;
    if (mutatedLookup(title)) alive.push(key); else dead.push(key);
  }

  it('变异下仍活着的键（不依赖去前缀）—— 这些不该被算进红名单', () => {
    // 动作类键：键==title，去不去前缀都命中。把动作键列出来作为「不该红」的对照。
    expect(alive.length).toBeGreaterThan(0);
  });

  it('红名单：拆掉去前缀后查不到的键 = 12 导航裸名 + 7 落到导航名的孤儿 = 19', () => {
    /* 预期 19 条的构成（逐一可指认）：
       12 导航裸名：概览/Mapping/诊断/系统索引/任务/拓扑/快照/热Setting/ILM/集群设置/任务树/Reindex预估
       7 孤儿（改名后落到导航名）：查询工作台/数据浏览器/REST 直连/跨集群迁移/分词验证/别名管控/索引模板
       不红的孤儿：'打开搜索沙盒'（落到动作 title，无前缀，变异下键==title 仍命中） */
    const expected = [
      '概览', 'Mapping', '诊断', '系统索引', '任务', '拓扑', '快照', '热Setting', 'ILM', '集群设置', '任务树', 'Reindex预估',
      '查询工作台', '数据浏览器', 'REST 直连', '跨集群迁移', '分词验证', '别名管控', '索引模板',
    ].sort();
    expect(dead.sort()).toEqual(expected);
    expect(dead).toHaveLength(19);
  });

  /* 这才是「对照是活的」的硬证明：上方「每个键都能命中」的遍历断言在变异下应当失败 19 次。
     这里把同一判据（aliasForTitle 拿到非空）跑在变异实现上，红 19 条——
     说明主遍历断言不是恒真，去前缀一旦被拆，立刻有 19 条命中的键变红。 */
  it('同一判据跑在变异实现上红 19 条（证明主遍历断言对照是活的）', () => {
    const wouldRed = Object.keys(ALIAS_MAP).filter(key => {
      const title = navNames.includes(key) ? SRC_NAV_PREFIX + key : key;
      return !mutatedLookup(title); // 变异下查不到 = 主断言会红
    });
    expect(wouldRed).toHaveLength(19);
  });

  /* 动作类孤儿 '打开搜索沙盒' 明确不红——它不依赖去前缀。如实单列，不凑 20。 */
  it('动作类孤儿「打开搜索沙盒」变异下仍命中（不依赖去前缀，不进红名单）', () => {
    expect(mutatedLookup('打开搜索沙盒')).toBe(ALIAS_MAP['打开搜索沙盒']);
    expect(dead).not.toContain('打开搜索沙盒');
  });
});
