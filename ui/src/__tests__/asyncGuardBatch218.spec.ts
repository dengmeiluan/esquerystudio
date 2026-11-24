/**
 * 2.1.8 可重复触发加载器补齐世代守卫（续 2.1.6 批次）。
 *
 * 2.1.6 已覆盖：UpdateByQuery 预估 / Analyze 候选 / 任务与任务树 / 账号名单。
 * 本批把「刷新钮可连点、筛选可连续切换」的其余加载器全部补上：
 * Painless/别名/搜索模板/索引模板/Watcher/集群设置/远程集群/拓扑/体检报告/
 * Diag allocation/SLM 双源。旧包晚到不得覆盖新包的名单/图表/状态。
 *
 * 另：Diag 热线程失败时保留旧样本必须标注来源节点 + 内联失败原因（不得把节点 A
 * 的样本冒充节点 B 的结果）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

const CASES: [string, string][] = [
  ['views/PainlessLabView.vue', 'storedSeq'],
  ['views/AliasesView.vue', 'loadSeq'],
  ['views/SearchTemplatesView.vue', 'loadSeq'],
  ['views/TemplatesView.vue', 'loadSeq'],
  ['views/WatcherView.vue', 'loadSeq'],
  ['views/ClusterSettingsView.vue', 'loadSeq'],
  ['views/RemoteClustersView.vue', 'loadSeq'],
  ['views/TopologyView.vue', 'loadSeq'],
  ['views/HealthReportView.vue', 'runSeq'],
  ['views/DiagView.vue', 'allocSeq'],
  ['views/SlmView.vue', 'loadSeq'],
];

describe('2.1.8 刷新类加载器世代守卫（源码锁）', () => {
  for (const [file, seqName] of CASES) {
    it(`${file} 用 ${seqName} 作废旧包`, () => {
      const src = read(file);
      expect(src, `${file} 缺 ${seqName} 计数`).toContain(`let ${seqName} = 0;`);
      expect(src, `${file} 缺过期包丢弃`).toContain(`if (seq !== ${seqName}) return;`);
    });
  }

  it('成功写入必须夹着世代判定（防"读了就写"绕过守卫）', () => {
    expect(read('views/TopologyView.vue')).toMatch(/await Promise\.all\(\[[\s\S]{0,400}?if \(seq !== loadSeq\) return;[\s\S]{0,120}?shards\.value =/);
    expect(read('views/HealthReportView.vue')).toMatch(/const rep = await api\.healthReport\(\);[\s\S]{0,80}?if \(seq !== runSeq\) return;[\s\S]{0,80}?data\.value = rep;/);
    expect(read('views/SlmView.vue')).toMatch(/const pol = await api\.slmPolicies\(\);[\s\S]{0,80}?if \(seq !== loadSeq\) return;/);
  });
});

describe('2.1.8 Diag 热线程失败态（源码锁）', () => {
  const dg = read('views/DiagView.vue');
  it('失败时记录原因并保留旧样本来源节点', () => {
    expect(dg).toContain("const hotErr = ref('');");
    expect(dg).toContain("const hotSampledNode = ref('');");
    expect(dg).toMatch(/hotSampledNode\.value = picked;/);
    expect(dg).toMatch(/hotErr\.value = '本次采样失败：' \+ friendlyEsError/);
  });

  it('旧样本必须标注来源，且不冒充本次结果', () => {
    expect(dg, '内联失败条在场').toContain('class="dg-hot-err" role="alert"');
    expect(dg, '旧样本来源文案').toContain('不是本次结果');
    expect(dg).toMatch(/下方保留 \{\{ hotSampledNode \|\| '全集群' \}\} 的上次样本/);
  });
});
