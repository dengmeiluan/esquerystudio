/**
 * 一千三百三十批：工具行右键菜单缺了宿主自己注入的那两枚图标钮。
 *
 * 真机（索引工作区，1100 视口）：
 *   - 工具行在 ≤1060 容器宽时换行（既有设计「宁可两行也要全钮可达」），实测 68px 两行、零溢出；
 *   - 但「原始 IO」「表格操作提示」是宿主从 bar-extra 槽加进去的**纯图标钮**，
 *     而工具行右键（表格操作那个表头的完整入口）里**没有**它们 →
 *     窄档下这两个功能只剩一枚无文字图标，用户只能靠试。
 *   - 对照实验：仅隐藏「原始 IO」一个钮，工具行就从 68px 回到 41px 单行，
 *     说明它正是压弯那一行的那一个（不是说它不该存在，而是说它必须有可读的第二入口）。
 *
 * 本 spec 锁：
 *  - RT 暴露 barMenuExtra prop，并把它拼进「更多…」的二级；
 *  - 索引工作区 docs / query 两个 tab 都把「原始 IO」「操作提示」传进去；
 *  - 缺省不传时行为零变化（空数组）。
 * 负控：把 `...(props.barMenuExtra || [])` 删掉 → 第一条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const hub = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

describe('1330 工具行右键要覆盖宿主注入的图标钮', () => {
  it('RT 声明 barMenuExtra 并拼进「更多…」', () => {
    expect(rt, '必须声明 barMenuExtra prop').toMatch(/barMenuExtra\?:\s*CcmItem\[\]/);
    const i = rt.indexOf("key: 'bar-more'");
    expect(i, '必须有「更多…」分组').toBeGreaterThan(-1);
    const seg = rt.slice(i, i + 1600);
    expect(seg, '分组二级必须拼入宿主项').toContain('...(props.barMenuExtra || [])');
  });

  it('索引工作区两个 tab 都传了宿主项（原始 IO + 操作提示）', () => {
    for (const [name, binding] of [['docs', 'docsBarMenuExtra'], ['query', 'queryBarMenuExtra']] as const) {
      expect(hub, `${name} tab 必须绑 :bar-menu-extra`).toContain(`:bar-menu-extra="${binding}"`);
      const i = hub.indexOf(`const ${binding} = computed`);
      expect(i, `${binding} 必须声明`).toBeGreaterThan(-1);
      const seg = hub.slice(i, i + 900);
      expect(seg, `${binding} 必须含「原始 IO」项`).toContain('查看原始 IO');
      expect(seg, `${binding} 必须含「操作提示」项`).toContain('操作提示');
    }
  });

  it('缺省不传时零变化（空数组兜底，不是 undefined 崩）', () => {
    expect(rt).toContain('props.barMenuExtra || []');
  });
});
