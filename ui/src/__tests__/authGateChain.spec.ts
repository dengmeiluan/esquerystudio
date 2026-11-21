/**
 * 五百五十七批·授权就绪链源码锁（TDD 审视批补测）。
 * 行为面（门的挂起/豁免/直通/4s 兜底）已由 api.headers.spec 行为测试锁定；
 * 此处锁 App.vue 的接线契约——settleAuthChain 的时序行为依赖异步身份/连接目录到达，
 * 组件级挂载难以稳定行为化（与 pollerScopeGuard 同范式，仓内既定测试形态）：
 * ①门注册在 setup 同步期（晚于子视图挂载的注册会让首批请求看不到门）
 * ②链路顺序=身份探测→连接目录→同步钉选→释放（autoPickConnTarget 复用，watch 兜底保留）
 * ③bootstrapIdentity 必须挂链（漏挂=门永不释放，4s 兜底才放行=开屏竞态回归）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appVue = readFileSync(join(__dirname, '../App.vue'), 'utf-8');

describe('授权就绪链接线（五百五十七批源码锁）', () => {
  it('门注册在 setup 同步期：setAuthSettled 的 promise 构造先于任何 await', () => {
    expect(appVue).toMatch(/setAuthSettled\(new Promise<void>\(res => \{ releaseAuthGate = res; \}\)\);/);
  });

  it('链路四步：loadConns → autoPickConnTarget 同步钉选 → release', () => {
    expect(appVue).toMatch(/await Promise\.race\(\[store\.loadConns\(\), authChainSleep\(1600\)\]\);/);
    expect(appVue).toMatch(/autoPickConnTarget\(auth\.grantedPages\);/);
    expect(appVue).toMatch(/releaseAuthGate\?\.\(\);/);
  });

  it('bootstrapIdentity 挂链：probe 与 loadIndices 并行下链路必启（漏挂=门靠 4s 兜底放行）', () => {
    expect(appVue).toMatch(/store\.loadIndices\(\);[^\n]*\n\s*settleAuthChain\(\);/);
  });

  it('宿主令牌迟到短轮询：嵌入形态等握手（独立形态直通）', () => {
    expect(appVue).toMatch(/if \(!getHostToken\(\) && !embeddedForm\) break;/);
  });
});
