/**
 * 688：演示站可点击复现（用户要求「mock 站要能点击复现每个板块的能力」）。
 *
 * 锁定重建/迁移/安全/连接四块的写动作在 demo transport 里真实改变后续读取：
 * 启动作业 → 读取推进到终态 → 事件/对账/预检/结构同步回包齐备；连接/用户/别名
 * 写后列表立即可见。演示数据全部合成，横幅已声明。
 */
import { describe, expect, it } from 'vitest';
import { demoFetch } from '../platform/demoApi';

async function call(path: string, method = 'GET', body?: any) {
  const r = await demoFetch('/internal/es' + path, body === undefined ? { method } : { method, body: JSON.stringify(body) });
  return r.json();
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('演示站 · 连接档案（688）', () => {
  it('新增/保存后列表立即可见，删除后消失', async () => {
    const before = (await call('/clusters')).length;
    await call('/clusters/save', 'POST', { name: '演示复制连接', url: 'http://10.0.0.9:9200', env: 'QA' });
    const after = await call('/clusters');
    expect(after.length).toBe(before + 1);
    const added = after.find((c: any) => c.name === '演示复制连接');
    expect(added.host).toBe('10.0.0.9');
    expect(added.port).toBe(9200);
    await call('/clusters/delete?id=' + encodeURIComponent(added.id), 'POST');
    expect((await call('/clusters')).length).toBe(before);
  });
});

describe('演示站 · 用户与别名写动作（688）', () => {
  it('用户 upsert/delete 反映到列表', async () => {
    const before = (await call('/auth/users')).length;
    await call('/auth/users/upsert', 'POST', { username: 'demo_probe', password: 'x', role: 'VIEWER' });
    expect((await call('/auth/users')).length).toBe(before + 1);
    await call('/auth/users/delete?username=demo_probe', 'POST');
    expect((await call('/auth/users')).length).toBe(before);
  });
  it('别名写动作后别名表变化', async () => {
    const before = (await call('/cluster/aliases')).length;
    await call('/cluster/alias-actions', 'POST', { action: 'add', alias: 'demo_alias', index: 'bond_issuer', writeIndex: true });
    expect((await call('/cluster/aliases')).length).toBe(before + 1);
  });
});

describe('演示站 · 托管重建全动线（688）', () => {
  it('prepare 带 settings/mapping；start → status 推进到 SUCCEEDED；events 可回放', async () => {
    const prep = await call('/adhoc-rebuild/prepare?index=research_report');
    expect(prep.settingsJson).toContain('number_of_shards');
    expect(prep.mappingJson).toContain('properties');
    const st = await call('/adhoc-rebuild/start', 'POST', { index: 'research_report', destIndex: 'research_report_adhoc_demo' });
    expect(st.jobId).toBeTruthy();
    expect(st.job.status).toBe('RUNNING');
    await wait(1800);
    const done = await call('/adhoc-rebuild/status?jobId=' + st.jobId);
    expect(done.status).toBe('SUCCEEDED');
    expect(done.created).toBe(done.total);
    const ev = await call('/adhoc-rebuild/jobs/' + st.jobId + '/events');
    expect(ev.events.length).toBeGreaterThanOrEqual(2);
    expect((await call('/adhoc-rebuild/jobs')).some((j: any) => j.jobId === st.jobId)).toBe(true);
  });
});

describe('演示站 · 跨集群迁移/结构同步（688）', () => {
  it('start → progress 推进到 DONE；reconcile/conflicts 回包', async () => {
    const st = await call('/xmigrate/start', 'POST', { sourceIndex: 'research_report', destIndex: 'research_report_uat' });
    expect(st.jobId).toBeTruthy();
    await wait(1800);
    const prog = await call('/xmigrate/progress?jobId=' + st.jobId);
    expect(prog.status).toBe('DONE');
    expect(prog.migrated).toBe(prog.total);
    const rc = await call('/xmigrate/jobs/' + st.jobId + '/reconcile');
    expect(rc.sourceCount).toBe(rc.destCount);
    expect(Array.isArray(rc.conflictSamples)).toBe(true);
    const cf = await call('/xmigrate/jobs/' + st.jobId + '/conflicts');
    expect(Array.isArray(cf.samples)).toBe(true);
  });
  it('预检/能力对比/结构同步/智能同步/计划/等价验证均有可渲染字段', async () => {
    const pf = await call('/xmigrate/preflight', 'POST', { sourceIndex: 'research_report' });
    expect(pf.recommended.slices).toBeGreaterThan(0);
    expect(pf.fieldTypeCounts.keyword).toBeGreaterThan(0);
    const caps = await call('/xmigrate/compare-capabilities', 'POST', { srcConnId: 'demo-prod' });
    expect(caps.diff.risks.length).toBeGreaterThan(0);
    const sync = await call('/xmigrate/sync-structure', 'POST', { sourceIndex: 'research_report', destIndex: 'research_report_uat', dryRun: true });
    expect(sync.dryRun).toBe(true);
    expect(sync.planned.removedSettings.length).toBeGreaterThan(0);
    const smart = await call('/xmigrate/smart-sync', 'POST', { sourceIndex: 'research_report', destIndex: 'research_report_uat' });
    expect(smart.verdict).toBe('PLANNED');
    expect(smart.planDigest).toBeTruthy();
    const plans = await call('/xmigrate/plans');
    expect(plans.plans.length).toBeGreaterThan(0);
    const applied = await call('/xmigrate/plans/apply', 'POST', { planId: plans.plans[0].planId });
    expect(applied.verdict).toBe('APPLIED');
    const ver = await call('/xmigrate/verify-equivalence', 'POST', { srcConnId: 'demo-prod', sourceIndex: 'research_report', destSourceIndex: 'research_report_uat' });
    expect(ver.verdict).toBe('EQUIVALENT');
    const diff = await call('/xmigrate/diff-structure', 'POST', { sourceIndex: 'research_report' });
    expect(diff.compatible).toBe(true);
  });
  it('Watcher / 远程集群 / 模板有可点样例', async () => {
    expect((await call('/cluster/watcher')).stats.total).toBeGreaterThan(0);
    expect((await call('/cluster/remote-clusters')).length).toBeGreaterThan(0);
    expect((await call('/cluster/templates')).index_templates.length).toBeGreaterThan(0);
  });
});
