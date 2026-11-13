/**
 * R26 值建议收口（监控持续优化轮）：
 * ① 审计筛选行 username 维度 datalist——R24 后端 by_user terms agg 的前端消费闭环
 *   （后端半成品补完：AuditFacetsStore 此前只加请求体没解析，响应缺 users 键；
 *   Java 侧契约=AuditFacetsStoreTest，此处锁前端消费面）；
 * ② URI 前缀下推接活——R23 死输入（输入框挂了但 opsAudit 通道缺失，回车只刷新不过滤），
 *   api.opsAudit 补 uriPrefix 第 7 参 + fetchAuditPage 透传 fUri；
 * ③ 去重回潮守卫——历史去重脚本事故：fUser 输入框曾整行重复双份入 UI（R23 批带入），
 *   三筛选输入框各恰好一份防回潮。
 * 源码锁（与 permGating / securityAuditCluster555 同语言）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sec = readFileSync(join(__dirname, '../views/SecurityView.vue'), 'utf-8');
const apiSrc = readFileSync(join(__dirname, '../api.ts'), 'utf-8');

describe('R26 审计值建议收口（username datalist / uriPrefix 通道 / 去重回潮守卫）', () => {
  it('fUser 挂 datalist：建议=by_user terms agg 真实用户+计数（R24 前端消费闭环）', () => {
    expect(sec).toContain('placeholder="按用户过滤" list="audit-user-suggestions"');
    expect(sec).toContain('<datalist id="audit-user-suggestions">');
    expect(sec).toContain('<option v-for="s in userSuggestions" :key="s.key" :value="s.key">{{ s.count }}</option>');
    expect(sec).toContain('const userSuggestions = computed(() => facets.value?.users || []);');
  });

  it('facets 契约四维：actions/conns/users/uris（users 缺失即 R24 半成品回潮；uris 缺失即 R28 回潮）', () => {
    expect(sec).toContain('users: { key: string; count?: number }[]; uris: { key: string; count?: number }[] } | null>(null);');
    expect(apiSrc).toContain("users: { key: string; count?: number }[]; uris: { key: string; count?: number }[] }>('/auth/audit-facets')");
  });

  it('uriPrefix 通道：opsAudit 第 7 参 + 查询串透传 + fetchAuditPage 携 fUri（R23 死输入接活；582 同步更新 R36 三参追加）', () => {
    /* 五百八十二批同步更新（577-C1 闭合锚漂）：R36 慢请求面板在 uriPrefix 后追加
       minCostMs/fromMs/toMs 三参——旧字面「uriPrefix?: string) =>」闭括号失配 */
    expect(apiSrc).toContain('connName?: string, uriPrefix?: string, minCostMs?: number, fromMs?: number, toMs?: number) =>');
    expect(apiSrc).toContain('q({ username, action, size, from, since, connName, uriPrefix, minCostMs, fromMs, toMs })');
    expect(sec).toContain('fConn.value || undefined, fUri.value || undefined)');
  });

  it('R28：fUri 挂 datalist（建议=by_uri 真实 Top URI+计数，facets 四维化）', () => {
    expect(sec).toContain('placeholder="按 URI 前缀过滤" list="audit-uri-suggestions"');
    expect(sec).toContain('<datalist id="audit-uri-suggestions">');
    expect(sec).toContain('const uriSuggestions = computed(() => facets.value?.uris || []);');
    expect(apiSrc).toContain("uris: { key: string; count?: number }[] }>('/auth/audit-facets')");
  });

  it('去重回潮守卫：三筛选输入框各恰好一份（fUser 曾整行双份入 UI 的事故锚）', () => {
    expect(sec.match(/placeholder="按用户过滤"/g)?.length).toBe(1);
    expect(sec.match(/placeholder="按集群过滤"/g)?.length).toBe(1);
    expect(sec.match(/placeholder="按 URI 前缀过滤"/g)?.length).toBe(1);
    expect(sec.match(/const facets = ref</g)?.length).toBe(1);
  });
});
