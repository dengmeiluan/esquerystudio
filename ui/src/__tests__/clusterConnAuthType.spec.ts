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
  it('渐进披露:默认账密出用户名/密码,切 API Key 出单一秘钥输入(留空=保留旧 Key)', () => {
    expect(cs).toMatch(/<template v-if="form\.authType !== 'API_KEY'">/);
    expect(cs).toContain('<div v-else class="cm-f wide">');
    expect(cs).toContain('API Key（编辑时留空=保留旧 Key）');
    expect(cs).toContain('placeholder="base64 的 id:api_key"');
  });
  it('提交与编辑回填:authType 随表单走,编辑缺省回 BASIC', () => {
    expect(cs).toContain('authType: form.value.authType,');
    expect(cs).toContain("env: c.env || '', authType: c.authType || 'BASIC',");
  });
  it('列表 AK 角标在场(token 化,与 .cs-ver 同构)', () => {
    expect(cs).toContain(`title="API Key 认证">AK</span>`);
    expect(cs).toContain('.cs-ak');
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
  it('密码/API Key 输入保留 pw-mask 自绘且 autocomplete="off" 在场', () => {
    expect((cs.match(/pw-mask/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((cs.match(/autocomplete="off"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});
