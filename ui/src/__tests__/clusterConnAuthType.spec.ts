/**
 * 连接中心自动同步批·API Key 认证:前端契约锁(source-lock 风格,与 ClusterSwitcher
 * 既有 spec 同款——naive 弹层挂载易碎不 mount)。
 *
 * 锁定:
 * 1) api.ts——ClusterConnView.authType 可选键 + clustersSave/clustersTest 载荷透传 authType;
 * 2) ClusterSwitcher 管理表单——「认证方式」切换(cm-role-btn 同款语言,渐进披露:
 *    默认账密出用户名/密码两字段,切 API Key 出单一秘钥输入,留空=保留旧 Key);
 * 3) 列表 AK 迷你角标(token 化配色);
 * 4) 无障碍:切换钮 aria-pressed。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cs = readFileSync(join(__dirname, '../components/ClusterSwitcher.vue'), 'utf-8');
const apiSrc = readFileSync(join(__dirname, '../api.ts'), 'utf-8');

describe('api.ts 认证形态契约', () => {
  it('ClusterConnView 带 authType 可选键', () => {
    expect(apiSrc).toMatch(/authType\?: string \| null;/);
  });
  it('clustersSave/clustersTest 载荷透传 authType(秘钥仍走 password 位,不新增秘钥通道)', () => {
    expect(apiSrc).toMatch(/authType\?: string \}\) => post\('\/clusters\/save', c\)/);
    expect(apiSrc).toMatch(/authType\?: string \}\) => post\('\/clusters\/test', c\)/);
  });
});

describe('ClusterSwitcher 认证方式切换', () => {
  it('AUTH_OPTS 账密/API Key 双档 + aria-pressed 切换钮(cm-role-btn 同款语言)', () => {
    expect(cs).toContain("const AUTH_OPTS = [");
    expect(cs).toContain("{ k: 'BASIC', t: '账密', tip: '用户名 + 密码(basic 认证)' }");
    expect(cs).toMatch(/:aria-pressed="form\.authType === a\.k"/);
  });
  it('渐进披露:默认账密出用户名/密码,切 API Key 出单一秘钥输入(编辑留空=保留旧 Key)', () => {
    expect(cs).toMatch(/<template v-if="form\.authType !== 'API_KEY'">/);
    expect(cs).toContain('<div v-else class="cm-f wide">');
    /* 688 同步更新：新建/复制时不再提示「留空=保留旧」，只有编辑态才显示该约束 */
    expect(cs).toContain("API Key{{ form.id ? '（留空=保留旧 Key）' : '' }}");
    expect(cs).toContain("密码{{ form.id ? '（留空=保留旧密码）' : '' }}");
    expect(cs).toContain('placeholder="base64 的 id:api_key"');
  });
  it('提交与编辑回填:authType 随表单走,编辑缺省回 BASIC', () => {
    expect(cs).toContain('authType: form.value.authType,');
    expect(cs).toContain("env: c.env || '', authType: c.authType || 'BASIC',");
  });
  it('列表 AK 角标在场(token 化,与 .cs-ver 同构;title 已迁 v-tip 指令)', () => {
    expect(cs).toContain(`v-tip="'API Key 认证'">AK</span>`);
    expect(cs).toContain('.cs-ak');
  });
});

describe('ClusterSwitcher 表单输入 label/id 关联', () => {
  it('五个自绘输入(名称/连接串/用户名/密码/API Key)逐个 label for ↔ input id 同键', () => {
    /* name/url/user 三个 TextInput 走标签 :id；pass/key 两个 NInput 的 id 经 input-props 落真实 input */
    for (const k of ['name', 'url', 'user']) {
      expect(cs, k + ' label 带 for').toContain(`:for="'cs-${k}-' + uid"`);
      expect(cs, k + ' input 带 id').toContain(`:id="'cs-${k}-' + uid"`);
    }
    for (const k of ['pass', 'key']) {
      expect(cs, k + ' label 带 for').toContain(`:for="'cs-${k}-' + uid"`);
      expect(cs, k + ' 真实 input 带 id').toContain(`id: 'cs-${k}-' + uid`);
    }
  });
  it('id 用实例随机后缀隔离(多实例并存不撞车,HistoryChart 同惯例)', () => {
    expect(cs).toContain('const uid = Math.random().toString(36).slice(2, 8);');
  });
});

describe('ClusterSwitcher 超时输入档（NInputNumber）', () => {
  it('连接/读写超时走 NInputNumber（空=null=全局默认），原生 type="number" 不回潮', () => {
    expect(cs).toContain('v-model:value="form.connectTimeoutMs"');
    expect(cs).toContain('v-model:value="form.socketTimeoutMs"');
    expect(cs).toContain(':min="1"');
    expect(cs).toContain('placeholder="如 5000"');
    expect(cs).toContain('placeholder="如 60000"');
    expect(cs).toContain('connectTimeoutMs: null as number | null');
    expect(cs).not.toContain('type="number"');
  });
  it('密码/API Key 输入 NInput password 档原生遮蔽且 autocomplete=new-password 落真实 input', () => {
    /* 口径迁移：Firefox 不支持 -webkit-text-security 圆点遮蔽会露明文，密码型统一
       NInput password 档（SecurityView/SetupWizard/BrowserConnect 同款）；pw-mask 形态退役；
       autocomplete=new-password（新凭据录入语义，较 off 更稳地阻断浏览器自动填充） */
    expect((cs.match(/type="password" show-password-on="click"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((cs.match(/autocomplete: 'new-password'/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(cs).not.toContain('pw-mask');
  });
});
