/**
 * R130 二百一十五批：别名管控页交互拉满（右键菜单双场景——操作聚合到右键，主界面减负）。
 * 锁定（源码锁）：
 * ①组头右键：复制别名名/复制成员索引清单/切换/详情/查询 五项；
 * ②成员行右键：复制索引名/工作区/查询/设为唯一可写(仅非 write 行)/解绑(danger)；
 * ③解绑走既有 unbind 确认链，设写走既有 setWrite；
 * ④CellContextMenu 共享件挂载 ×2。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/AliasesView.vue'), 'utf-8');

describe('别名管控右键菜单（二百一十五批）', () => {
  it('组头/成员行 contextmenu 接线 + CellContextMenu 挂载', () => {
    expect(src).toMatch(/@contextmenu\.prevent="openAliasMenu\(\$event, g\)"/);
    expect(src).toMatch(/@contextmenu\.prevent="openRowMenu\(\$event, g, r\.index, r\.isWriteIndex\)"/);
    expect(src).toMatch(/<CellContextMenu v-if="aliasMenu"/);
    expect(src).toMatch(/<CellContextMenu v-if="rowMenu"/);
  });

  it('组头菜单五项：复制别名名/成员清单/切换/详情/查询', () => {
    expect(src).toContain("key: 'copy-alias', label: '复制别名名'");
    expect(src).toContain("key: 'copy-members', label: '复制成员索引清单'");
    expect(src).toContain("key: 'switch', label: '零停机切换指向…'");
    expect(src).toContain("key: 'inspect', label: '查看别名详情'");
    expect(src).toContain("key: 'query', label: 'DSL 查询此别名'");
  });

  it('成员行菜单：复制索引名/工作区/查询/设写/解绑', () => {
    expect(src).toContain("key: 'copy-idx', label: '复制索引名'");
    expect(src).toContain("key: 'hub', label: '打开索引工作区'");
    expect(src).toContain("key: 'query', label: 'DSL 查询此索引'");
    expect(src).toContain("key: 'set-write', label: '设为唯一可写…'");
    expect(src).toContain("key: 'unbind', label: '解绑此索引…'");
  });

  it('imports：CellContextMenu + copyText', () => {
    expect(src).toContain("import CellContextMenu from '../components/CellContextMenu.vue';");
    expect(src).toMatch(/import \{ copyText \} from '\.\.\/utils\/format';/);
  });
});
