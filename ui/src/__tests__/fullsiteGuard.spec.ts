import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/* R130 全站 UI 升级轮守卫：把踩坑固化为自动门禁——
   每条曾经的事故都必须有一条防它复发的断言。 */

const SRC = join(__dirname, '../..', 'src');

function walk(dir: string, ext: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, ext, acc);
    else if (p.endsWith(ext)) acc.push(p);
  }
  return acc;
}

describe('R130 全站 UI 守卫', () => {
  it('① 视图 CSS 禁止 auto-fit 轨道混入弹性值（KPI 网格塌陷通病：非法声明被浏览器静默丢弃，6 视图曾塌成单列）', () => {
    const bad: string[] = [];
    for (const f of walk(join(SRC, 'views'), '.vue')) {
      const s = readFileSync(f, 'utf-8');
      // auto-fit/auto-fill 的轨道列表里不允许再出现 1fr/auto 等弹性值（非法→整条声明被丢弃）
      // 精确匹配「minmax(...) 闭合后再追加弹性轨道」——minmax 内部的 , 1fr) 是合法的
      // 529 批同步更新：minmax 内允许一层嵌套括号（min(320px,100%) 防极窄溢出先例），
      // 旧 [^)]* 会把 min() 的闭合误当 minmax 闭合、把合法嵌套形态误报为非法
      const m = s.match(/repeat\(\s*(?:auto-fit|auto-fill)\s*,\s*minmax\((?:[^()]|\([^()]*\))*\)\s*,\s*(?:1fr|auto)\s*\)/g);
      if (m) bad.push(f + ' → ' + m[0].slice(0, 80));
    }
    expect(bad, '非法 grid 轨道:\n' + bad.join('\n')).toEqual([]);
  });

  it('② 禁止引用已确认未定义的 token（fallback 永久生效：--ink/--ink-2/--brand-deep/--bg-hover 曾致暗色 pill 3:1 不可见）', () => {
    const banned = ['var(--ink)', 'var(--ink-2)', 'var(--brand-deep)', 'var(--bg-hover)'];
    const bad: string[] = [];
    for (const f of [...walk(join(SRC, 'views'), '.vue'), ...walk(join(SRC, 'components'), '.vue')]) {
      const s = readFileSync(f, 'utf-8');
      for (const b of banned) {
        // 带 fallback 的 var(--x, y) 是合法兜底写法，仅禁裸引用
        const re = new RegExp(b.replace(/[()]/g, m => '\\' + m) + '(?![\\s,])', 'g');
        if (re.test(s)) bad.push(f + ' → ' + b);
      }
    }
    expect(bad, '裸引用未定义 token:\n' + bad.join('\n')).toEqual([]);
  });

  it('③ 条件行工具钮禁止透明度降噪（35% 透明在亮色下看不清，用户点名两次）', () => {
    const s = readFileSync(join(SRC, 'components/builder/ClauseNode.vue'), 'utf-8');
    expect(s).not.toMatch(/\.cn \.btn[^{]*\{[^}]*opacity:\s*\.\d+\s*;/);
    expect(s).toContain('aria-label="标准时间转时间戳"');
  });

  it('④ 语义色轴收拢：must 连接词必须用品牌青 --c-must（禁止第四种绿与品牌色打架）', () => {
    const s = readFileSync(join(SRC, 'theme.css'), 'utf-8');
    const light = s.slice(s.indexOf('[data-theme="light"]'));
    expect(s).toMatch(/--c-must:\s*#2dd4bf/);           // 暗色段 = 品牌亮青
    expect(light).toMatch(/--c-must:\s*#0b7c71/);        // 亮色段 = 品牌深青（4.6:1）
    expect(light).not.toMatch(/--c-must:\s*#0d6b4d/);    // v3.1 旧值（与品牌无关的深绿）不得回归
  });

  it('⑤ naive darkOverrides 中性色必须与 theme.css 青调 token 同步（弹层与页面底色色温曾割裂）', () => {
    const app = readFileSync(join(SRC, 'App.vue'), 'utf-8');
    const theme = readFileSync(join(SRC, 'theme.css'), 'utf-8');
    const bg0 = theme.match(/--bg0:\s*(#\w+)/)![1];
    const bg1 = theme.match(/--bg1:\s*(#\w+)/)![1];
    const tx0 = theme.match(/--tx0:\s*(#\w+)/)![1];
    // naive 侧至少引用同一组青调值（弹层/卡片底色与页面同源）
    expect(app).toContain(bg0);
    expect(app).toContain(bg1);
    expect(app).toContain(tx0);
  });

  it('⑥ 图标按钮必须有可访问名（aria-label/title 三选一；R130 第十一批扫出 5 处裸图标钮）', () => {
    const bad: string[] = [];
    for (const f of [...walk(join(SRC, 'views'), '.vue'), ...walk(join(SRC, 'components'), '.vue')]) {
      const s = readFileSync(f, 'utf-8');
      for (const m of s.matchAll(/<button\b([^>]*)>(\s*<\w+[^>]*size=[^>]*>\s*)<\/button>/g)) {
        const attrs = m[1];
        if (!/aria-label|title/.test(attrs)) {
          const line = s.slice(0, m.index).split('\n').length;
          bad.push(`${f}:${line}`);
        }
      }
    }
    expect(bad, '裸图标按钮(屏幕阅读器不可达):\n' + bad.join('\n')).toEqual([]);
  });

  it('⑦ 空态容器禁止内联 padding 覆盖（留白体系单一来源 theme.css .empty；第十三批曾清 13 处）', () => {
    const bad: string[] = [];
    for (const f of walk(join(SRC, 'views'), '.vue')) {
      const s = readFileSync(f, 'utf-8');
      const m = s.match(/class="empty"\s+style="padding[^"]*"/g);
      if (m) bad.push(f + ' → ' + m.join(' | '));
    }
    expect(bad, '空态内联 padding 覆盖（留白回退）:\n' + bad.join('\n')).toEqual([]);
  });

  it('⑧ QueryHubView 场景按钮禁止回退虚线胶囊（D3 分段语言统一）', () => {
    const s = readFileSync(join(SRC, 'views/QueryHubView.vue'), 'utf-8');
    expect(s).not.toMatch(/\.qh-task \{[^}]*dashed/);
    expect(s).toContain('border-radius: var(--r-s)');
  });

  it('⑥ 参数条 chip 化不回退：RootExtrasPane 必须是横向 chips（不得退回垂直折叠清单；582 同步更新 563「page」chip 退役）', () => {
    const s = readFileSync(join(SRC, 'components/builder/RootExtrasPane.vue'), 'utf-8');
    expect(s).toContain('rx-chips');
    expect(s).toContain("toggle('aggs')");
    /* 五百八十二批同步更新：563 批用户实报「无效控制」清扫退役 page chip（6→5）——数量阈同步更新，
       并补五颗具名 chip 锁（防进一步缩水成空壳也过）。
       1338：chip 改为 CHIP_META 数据驱动（模板只剩一个 v-for），逐字面量数 class="rx-chip"
       的判据失效——改为量 CHIP_META 的具名 key 数（意图不变：仍是一排具名 chip）。 */
    const meta = s.slice(s.indexOf('const CHIP_META'), s.indexOf('] as const'));
    const keys = [...meta.matchAll(/k: '([a-z]+)'/g)].map(m => m[1]);
    expect(keys.length, '具名 chip 数量不得缩水').toBeGreaterThanOrEqual(5);
    for (const k of ['sort', 'src', 'hl', 'aggs', 'ex']) {
      expect(keys, `chip ${k} 必须在场`).toContain(k);
    }
    /* 仍是横向 chips（1338 起单行 nowrap + 横向滚动；防退回垂直折叠清单） */
    expect(s, '参数条必须保持横向单行').toMatch(/\.rx-chips \{[^}]*flex-wrap:\s*nowrap/);
  });

  it('⑪ QRT 表头字重/线与密度斑马纹不回退（170 批：600+line-strong 层次；紧凑去条纹，dbx 视觉对齐）', () => {
    const s = readFileSync(join(SRC, 'components/QueryResultTable.vue'), 'utf-8');
    expect(s).toMatch(/font-weight: 600;\s*\n\s*border-bottom-color: var\(--line-strong\);/);
    expect(s).toContain('.qrt-tbl.dense tbody tr:nth-child(even) { background: transparent; }');
  });

  it('⑫ 表头底色全站统一 bg2（204 批颜色不割裂：吸顶表头 bg1 覆盖曾致同站两色）', () => {
    const bad: string[] = [];
    for (const f of [...walk(join(SRC, 'views'), '.vue'), ...walk(join(SRC, 'components'), '.vue')]) {
      const s = readFileSync(f, 'utf-8');
      // 表头选择器边界（\b th \b，防 width 里的 th 子串误伤）：规则内禁 background: var(--bg1)
      for (const m of s.matchAll(/(?:^|[,\s{}])th\s*\{[^}]*background:\s*var\(--bg1\)[^}]*\}/gm)) {
        bad.push(f + ' → ' + m[0].replace(/\s+/g, ' ').slice(0, 70));
      }
    }
    expect(bad, '表头 bg1 覆盖（应 bg2）:\n' + bad.join('\n')).toEqual([]);
  });
});
