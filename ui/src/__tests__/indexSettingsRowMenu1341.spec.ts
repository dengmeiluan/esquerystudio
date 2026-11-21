/**
 * 一千三百四十一批：索引设置页 9 个热参数行没有右键。
 *
 * 来源：按**渲染表面**做了一次全站右键普查（16 条路由，找「可点行容器 + 右键无菜单」）：
 *
 *   /analyzer-lab  al-card          NO MENU   ← 已于 1340 补
 *   /synonyms      sy-card          NO MENU
 *   /index-settings is-rows(9行)    NO MENU   ← 本批
 *   /mapping-designer md-card       NO MENU
 *   /reindex-advanced ra-card       NO MENU
 *   /painless-lab  pl-stored-list   NO MENU
 *   /rank-debug    rd-row           NO MENU
 *
 * 本页的每一行就是一个 ES 设置项（`refresh_interval` / `number_of_replicas` /
 * `blocks.read_only`…），而**键名正是用户下一步要贴进 DevTools 或设置 API 的东西**，
 * 此前只能肉眼抄。按项目右键约定补：一级 = 复制设置键名 + 更多…（分组父项）。
 *
 * 真机验收（admin 身份，真实鼠标右键 `number_of_replicas` 行）：
 *   复制设置键名 → 剪贴板 `number_of_replicas`
 *   更多… → 复制为设置请求体 → `{"index":{"number_of_replicas":null}}`
 *
 * ⚠ 键名取值踩过一次坑：第一版用 `code/.mono` 取文本，拿到的是说明里的 `-1`；
 *   改用 `.dotkey` 的 **title**（DotKey 内部用 <wbr> 断行，textContent 会被折成
 *   「refre sh_interval」，只有 title 恒为完整键）。
 *
 * 本 spec 锁：
 *  ① 所有设置行都挂 contextmenu（且 prevent.stop）；
 *  ② 键名只从 `.dotkey` 的 title 取（防回退到 textContent 被 <wbr> 折断）；
 *  ③ 一级恰 2 项：复制设置键名 + 分组父项；
 *  ④ 二级含「请求体」项，且拼的是 `{index:{key:value}}` 形态。
 * 负控：删掉行上的 @contextmenu → 第 1 条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/IndexSettingsView.vue'), 'utf-8');

describe('1341 索引设置行右键', () => {
  it('所有设置行都挂 contextmenu，且 prevent.stop', () => {
    const rows = src.match(/<div class="is-row"[^>]*>/g) || [];
    expect(rows.length, '本页设置行应当有多行').toBeGreaterThanOrEqual(5);
    for (const r of rows) {
      expect(r, '每个设置行都要能右键').toContain('@contextmenu.prevent.stop="openRowMenu($event)"');
    }
  });

  it('键名只认 .dotkey 的 title（textContent 会被 <wbr> 折断）', () => {
    const i = src.indexOf('function openRowMenu');
    expect(i, 'openRowMenu 必须存在').toBeGreaterThan(-1);
    const body = src.slice(i, src.indexOf('\n}', i));
    expect(body, '必须查 .dotkey').toContain("querySelector('.dotkey')");
    expect(body, '必须优先取 title').toContain("getAttribute('title')");
    /* 负锁：不得再用会拿到说明文字的通用选择器当键名来源 */
    expect(body, '不得用 code/.mono 当键名来源').not.toMatch(/querySelector\('\.dk-key, \.dk, code, \.mono'\)/);
  });

  it('一级恰 2 项：复制键名 + 分组父项', () => {
    const i = src.indexOf('const rowMenuItems');
    const body = src.slice(i, src.indexOf('\n});', i));
    const beforeChildren = body.slice(0, body.indexOf('children:'));
    const topKeys = [...beforeChildren.matchAll(/key: '([a-z-]+)'/g)].map(m => m[1]);
    expect(topKeys).toEqual(['is-copy-key', 'is-more']);
  });

  it('二级含请求体片段，拼 {index:{key:value}} 形态', () => {
    const i = src.indexOf('const rowMenuItems');
    const body = src.slice(i, src.indexOf('\n});', i));
    expect(body).toContain('请求体');
    expect(body, '必须是 ES 的 _settings 请求体形态').toMatch(/\{\s*index:\s*\{\s*\[m\.key\]/);
  });

  it('菜单走 CellContextMenu 共享件', () => {
    expect(src).toContain('CellContextMenu');
    expect(src).toMatch(/<CellContextMenu v-if="rowMenu"/);
  });
});
