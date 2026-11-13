/**
 * 一千三百六十八批：索引优化建议条目右键菜单。
 *
 * 用户反复要求「鼠标右键必须极致的增强在整个项目，现在很多地方没有右键能力」。
 * 优化建议列表（.io-rec）此前右键是浏览器默认菜单——没有「勾选此条」、
 * 没有「复制建议配置」（运营拿到建议的下一步就是贴进 PUT _settings body）。
 *
 * 本 spec 锁：
 *  ① 条目挂 contextmenu.prevent + 用项目统一右键件
 *  ② 一级符合约定：≤3（2 动作 + 分组父行），不平铺
 *  ③ 复制的「建议配置」按 path 还原成**嵌套 settings body**，能直粘 PUT
 *     （拍平成 {"refresh_interval":...} 会丢掉 index.* 层级，贴进 ES 直接 400）
 *  ④ 负控：去掉 contextmenu 绑定 → ① 必须红
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '../views/IndexOptimizerView.vue'), 'utf-8');

describe('1368 索引优化建议右键菜单', () => {
  it('① 条目挂 contextmenu.prevent + 统一右键件', () => {
    expect(SRC, 'io-rec 必须有右键绑定').toMatch(
      /class="io-rec"[\s\S]{0,120}@contextmenu\.prevent="openRecMenu\(\$event, r\)"/,
    );
    expect(SRC, '必须用项目统一右键件').toContain("import CellContextMenu, { type CcmItem }");
    expect(SRC, '菜单必须真渲染').toContain(':items="recMenuItems"');
  });

  it('② 一级 ≤3（2 动作 + 1 分组父行）', () => {
    const i = SRC.indexOf('const recMenuItems = computed<CcmItem[]>');
    expect(i, '必须有 recMenuItems').toBeGreaterThan(-1);
    const body = SRC.slice(i, SRC.indexOf('\n});', i));
    const beforeChildren = body.slice(0, body.indexOf('children:'));
    const l1 = [...beforeChildren.matchAll(/key: '([a-z-]+)',\s*label:/g)].map(m => m[1]);
    expect(l1.length, `一级必须 ≤3，实际：${l1.join(',')}`).toBeLessThanOrEqual(3);
    expect(l1, '必须有分组父行').toContain('rec-more');
    expect(l1.length, '一级不能被塞到只剩一个').toBeGreaterThanOrEqual(2);
  });

  it('③ 建议配置按 path 还原成嵌套 body（含 index 根层，不是拍平的一层）', () => {
    const i = SRC.indexOf('function recBody');
    expect(i, '必须有 recBody').toBeGreaterThan(-1);
    const body = SRC.slice(i, SRC.indexOf('\n}', i));
    /* rec.path 是**相对 index. 的路径**（'refresh_interval' / 'blocks.read_only_allow_delete'）。
       漏掉 index 根层会得到 {"refresh_interval":"30s"}，PUT _settings 会被 ES 拒绝——
       第一版就漏了，真机复制出来是 {"refresh_interval":"30s"} 才发现的。 */
    expect(body, '必须带 index 根层').toMatch(/\{\s*index:\s*\{\s*\}\s*\}/);
    expect(body, '必须从 body.index 起逐层展开').toMatch(/node[^=]*=\s*body\.index/);
    expect(body, '必须真的 JSON 化').toContain('JSON.stringify');
    /* 与页面下方「Body 预览」必须同一形状（两处都产出可直粘的 PUT body） */
    const pb = SRC.slice(SRC.indexOf('const previewBody = computed'));
    expect(pb.slice(0, 500), 'previewBody 也以 index 为根（两处同形）').toMatch(/body:\s*any\s*=\s*\{\s*index:\s*\{\s*\}\s*\}/);
    expect(SRC, 'Rec 接口必须含 path').toMatch(/interface Rec \{[^}]*path: string;/);
  });

  it('④ 负控：去掉 contextmenu 绑定 → ① 必须红', () => {
    const broken = SRC.replace('@contextmenu.prevent="openRecMenu($event, r)"', '');
    expect(broken, '负控必须真的改掉源码').not.toBe(SRC);
    expect(broken, '去掉后必须判不合格').not.toMatch(
      /class="io-rec"[\s\S]{0,120}@contextmenu\.prevent="openRecMenu/,
    );
  });
});
