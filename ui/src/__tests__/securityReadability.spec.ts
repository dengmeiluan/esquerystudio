/**
 * R130 一百八十八批：安全中心深度改造（用户截图插队——审计流水的专业词可读性与便捷性）。
 * 锁定：
 * 1) 审计动作徽标中文映射（PAGE_DENIED=页面被拒 等，未知代码原样不猜）；
 * 2) URI 短显示剥 /internal(/es)(/index) 前缀，hover 全量；
 * 3) 时间列绝对化（审计取证场景，TimeCell abs）；
 * 4) 「仅看被拒」快捷过滤钮（fAction 与 PAGE_DENIED 互切）；
 * 5) 空态「创建 ADMIN」直达（预置角色+聚焦表单）；
 * 6) BOOTSTRAP 模式中文说明；角色说明结构化对照清单。
 * 源码锁（视图级改造，无新增独立状态机）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SecurityView.vue'), 'utf-8');

describe('安全中心深度改造（一百八十八批）', () => {
  it('动作徽标中文映射 + 未知原样', () => {
    expect(src).toMatch(/PAGE_DENIED: '页面被拒'/);
    expect(src).toMatch(/LOGIN_FAIL: '登录失败'/);
    expect(src).toMatch(/HIGH_RISK: '高危操作'/);
    expect(src).toMatch(/function actionZh\(a: string\) \{ return ACTION_ZH\[a\] \?\? a; \}/);
    /* 五百二十九批锚同步更新：r.action → #cell-动作 槽 value（动作原码 title 语义不变） */
    expect(src).toContain(`:title="'动作代码：' + value"`);
  });

  it('URI 短显示（剥 /internal(/es)(/index) 前缀），title 全量', () => {
    expect(src).toContain("replace(/^\\/internal(\\/es)?(\\/index)?/, '')");
    /* 五百二十九批锚同步更新：裸 td → #cell-URI 作用域槽内 span（QRT 换壳后派生展示走槽） */
    expect(src).toMatch(/<span class="mono uri" :title="value">\{\{ shortUri\(value\) \}\}<\/span>/);
  });

  it('审计时间绝对化（TimeCell abs 取证模式）', () => {
    /* 五百二十九批锚同步更新：r.timestamp → #cell-时间 槽 value（矩阵=epoch ms，TimeCell 兼收） */
    expect(src).toMatch(/<TimeCell :ts="value" abs \/>/);
  });

  it('「仅看被拒」快捷过滤钮（单设 fAction + on 态；六百三十九批 G23 双路径合一改单设不 toggle）', () => {
    expect(src).toMatch(/:class="\{ on: fAction === 'PAGE_DENIED' \}"/);
    expect(src).toMatch(/fAction = 'PAGE_DENIED'; loadAudit\(\)/);
  });

  it('空态「创建 ADMIN」直达（预置角色+聚焦）', () => {
    /* 第十批收尾同步更新：裸 .empty 按钮迁 EmptyState compact，actionText/@action 仍直达 presetAdmin（正向锁语义不变） */
    expect(src).toMatch(/<EmptyState v-else-if="!usersLoading && !usersErr" compact :icon="UserPlus"\s*\n\s*text="暂无正式账号 —— 当前依赖兜底默认账号" :action-text="canAssignAdmin \? '创建 ADMIN' : undefined" @action="presetAdmin" \/>/);
    expect(src).toContain('function presetAdmin()');
    expect(src).toContain('nuRole.value = ');
    expect(src).toContain('nuNameRef.value?.focus()');
  });

  it('模式中文说明 + 角色说明结构化', () => {
    expect(src).toMatch(/BOOTSTRAP: '引导模式：控制集群地址由应用配置指定，账号与审计数据存于此集群'/);
    expect(src).toMatch(/const ROLE_ROWS = \['VIEWER', 'OPERATOR', 'REBUILD_OP', 'CLUSTER_OP', 'AUDIT_OP', 'ADMIN'\]/);
    expect(src).toMatch(/<div v-for="rl in ROLE_ROWS"/);
    expect(src).not.toMatch(/\.role-legend \{/); /* 旧一行长文案样式清干净 */
  });
});
