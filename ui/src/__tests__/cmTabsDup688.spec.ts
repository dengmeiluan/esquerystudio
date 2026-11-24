/**
 * 六百八十八批：集群连接管理页签化 + 复制连接（用户实报「新增和现有列表应做页签区分，
 * 默认挤在一块操作空间很小，也没有快速复制只改连接的能力」）。
 *
 * 锁定：
 * 1) 列表 / 新增（编辑）页签互斥，各得整幅高度；表单页签自滚、操作行钉底；
 * 2) 行内「复制连接」入口（icon + 右键菜单），进入表单后名称自动生成唯一副本名，
 *    端点/认证/环境/超时全带出、密码留空，焦点落在连接串——改地址即可另存；
 * 3) 页签 ARIA（tablist/tab/tabpanel）与键盘 Enter 保存仅在表单页签生效。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cs = readFileSync(join(__dirname, '../components/ClusterSwitcher.vue'), 'utf-8');

describe('连接管理页签（688）', () => {
  it('页签骨架：tablist + 两个 tab + 两个 tabpanel，列表默认', () => {
    expect(cs).toMatch(/role="tablist"/);
    expect(cs.match(/role="tab"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(cs.match(/role="tabpanel"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(cs).toMatch(/manageTab = ref<'list' \| 'form'>\('list'\)/);
  });
  it('页签互斥显隐 + 列表页签保底高度（无管理权时恒回列表）', () => {
    expect(cs).toContain(`v-show="manageTab === 'list' || !canAdmin"`);
    expect(cs).toMatch(/v-show="manageTab === 'form'"/);
    expect(cs).toMatch(/\.cm-pane-list \{[^}]*min-height:\s*260px/s);
  });
  it('Enter 保存限定表单页签（列表页签回车不会误存）', () => {
    expect(cs).toMatch(/useModalEnter\(manageOpen, saveConn, \(\) => canAdmin\.value && manageTab\.value === 'form'/);
  });
});

describe('复制连接（688）', () => {
  it('行内复制图标 + 右键菜单第二入口，均走 duplicateConn', () => {
    expect(cs).toContain('@click="duplicateConn(c)"');
    expect(cs).toContain("label: '复制为新连接…'");
    expect(cs).toMatch(/function duplicateConn\(c: ClusterConnView\)/);
  });
  it('副本配置带出端点/认证/环境/超时，密码清空（不复制密钥）', () => {
    const dup = cs.slice(cs.indexOf('function duplicateConn'));
    const body = dup.slice(0, dup.indexOf('manageTab.value = \'form\';'));
    expect(body).toContain('url: `${c.scheme}://${c.host}:${c.port}`');
    expect(body).toContain("password: ''");
    expect(body).toContain('authType: c.authType');
    expect(body).toContain('env: c.env');
    expect(body).toContain('connectTimeoutMs: c.connectTimeoutMs');
    expect(body).toContain('socketTimeoutMs: c.socketTimeoutMs');
  });
  it('副本名唯一（重名自动追加序号），并聚焦连接串', () => {
    expect(cs).toMatch(/function dupName\(base: string\)/);
    expect(cs).toMatch(/`\$\{base\} 副本`/);
    expect(cs).toMatch(/focusFormField\('url'\)/);
  });
  it('复制提示明示「还要改什么」——表单页展示来源与操作指引', () => {
    expect(cs).toMatch(/class="cm-dup-note"/);
    expect(cs).toContain('改连接串 / 密码后点「添加连接」即可另存');
  });
});
