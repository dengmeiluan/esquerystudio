/**
 * 一千三百四十三批：Painless 实验室「已存脚本」行没有右键。
 *
 * 全站右键普查（按渲染表面扫 16 条路由，找「可点行容器 + 右键无菜单」）命中本页
 * `.pl-stored-list` —— 它是**一个已存脚本一行**，而这两件事都只能靠绕路：
 *   · 把脚本 ID 拿走（贴进 `script_score` 的 `{script:{id}}`、贴进 DevTools、发给同事）
 *   · 载入到编辑器（行本身可点，但右键这个动作在别处已成习惯）
 *
 * 按项目右键约定补（一级 ≤2 个频繁动作 + 分组父项）：
 *   一级：载入到编辑器 | 更多…
 *   二级：复制脚本 ID | 复制引用片段（{script:{id,lang}}）| 复制「id  lang」
 *
 * 真机验收（headless Chrome + mock，真实鼠标右键第一行 `score_by_recency`）：
 *   一级 2 项、二级 3 项；点「复制引用片段」→ 剪贴板
 *   `{"script":{"id":"score_by_recency","lang":"painless"}}`
 *
 * 本 spec 锁：
 *  ① 行挂 contextmenu 且 **prevent.stop**（行本身有 @click 选中，右键不该顺带切换）；
 *  ② 一级恰 2 项：载入 + 分组父项；
 *  ③ 二级含「引用片段」，且是 `{script:{id,lang}}` 形态（可直接贴进 script_score）；
 *  ④ 既有「载入到编辑器」行为复用 pickStored，不另写一份载入逻辑。
 * 负控：删掉行上的 @contextmenu → 第 1 条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/PainlessLabView.vue'), 'utf-8');

describe('1343 已存脚本行右键', () => {
  it('行挂 contextmenu，且 prevent.stop', () => {
    const i = src.indexOf('class="pl-stored"');
    expect(i, '已存脚本行必须存在').toBeGreaterThan(-1);
    const seg = src.slice(i, i + 520);
    expect(seg, '行必须可右键').toMatch(/@contextmenu\.prevent\.stop="openStoredMenu\(/);
  });

  it('一级恰 2 项：载入 + 分组父项', () => {
    const i = src.indexOf('const storedMenuItems');
    expect(i, 'storedMenuItems 必须存在').toBeGreaterThan(-1);
    const body = src.slice(i, src.indexOf('\n});', i));
    const beforeChildren = body.slice(0, body.indexOf('children:'));
    const topKeys = [...beforeChildren.matchAll(/key: '([a-z-]+)'/g)].map(m => m[1]);
    expect(topKeys).toEqual(['ps-load', 'ps-more']);
  });

  it('载入复用 pickStored（不另造载入逻辑）', () => {
    const i = src.indexOf('const storedMenuItems');
    const body = src.slice(i, src.indexOf('\n});', i));
    expect(body).toContain('pickStored(s)');
  });

  it('二级引用片段是 {script:{id,lang}} 形态', () => {
    const i = src.indexOf('const storedMenuItems');
    const body = src.slice(i, src.indexOf('\n});', i));
    expect(body).toContain('引用片段');
    expect(body, '必须是 ES script_score 引用的形态').toMatch(/JSON\.stringify\(\{\s*script:\s*\{\s*id:/);
    expect(body, 'lang 必须带上（默认 painless）').toContain("lang: s.lang || 'painless'");
  });

  it('菜单走 CellContextMenu 共享件', () => {
    expect(src).toContain('CellContextMenu');
    expect(src).toMatch(/<CellContextMenu v-if="storedMenu"/);
  });
});
