import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLUSTER_SETTINGS_CATALOG, SETTINGS_CATALOG } from '../utils/indexSettingsCatalog';

/* 五百五十七批 轨1+轨5：参数中文备注 + 错误友好化收尾（--sp 合并本体锚在 adaptive556 扩锚）。
 *
 * ① CLUSTER_SETTINGS_CATALOG：集群级 persistent/transient 常用键中文目录——字段结构对齐
 *    既有 SETTINGS_CATALOG 四字段形态（desc 中文/example/dynamic）。dynamic 口径本目录
 *    换轨定义：true = 可经 _cluster/settings API 热更；false = 节点级/遗留键
 *    （discovery.zen.minimum_master_nodes 在 7.x 已由集群自动维护，列册只为悬停不空白，
 *    标 false 防误导直填）。
 * ② 目录接线源码锚：ClusterSettingsView persistent/transient 两档裸 input 悬停
 *    :title=中文释义+示例（「集群设置英文参数不知作用」根治）；IndexSettingsView 自定义
 *    setting 行值输入同法接 SETTINGS_CATALOG（normKey 去 index. 前缀口径）。
 *    备案：任务「可挂 datalist 候选（键名）」不落——本页键=行本身（白名单渲染），
 *    值输入上挂键名候选语义错位，:title 释义已是根治面。
 * ③ 热更失败裸 err 合并 friendlyEsError（XmigrateView w80 先例逐字平移）；本页加载/
 *    下发两处 catch 早在第十批已是 friendlyEsError 口径，本轨只收 save 兜底一处。 */

const srcOf = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');

describe('五百五十七批 ①：CLUSTER_SETTINGS_CATALOG 集群级设置键中文目录', () => {
  it('键数 10~25 档且逐键四字段齐（desc 非空中文 + example 非空 + dynamic 布尔）', () => {
    expect(CLUSTER_SETTINGS_CATALOG.length).toBeGreaterThanOrEqual(10);
    /* 560 同步更新：上限 20→25（560 批补 logger.org.elasticsearch.discovery 一键，原 10~20
       档封顶顶满修订；目录语义=常用键精选清单，扩员不失控） */
    expect(CLUSTER_SETTINGS_CATALOG.length).toBeLessThanOrEqual(25);
    for (const e of CLUSTER_SETTINGS_CATALOG) {
      expect(e.key, '键为小写点分路径形态').toMatch(/^[a-z][a-z0-9_.*]*$/);
      expect(e.desc.length, `${e.key} desc 非空`).toBeGreaterThan(0);
      expect(e.desc, `${e.key} desc 须中文`).toMatch(/[\u4e00-\u9fff]/);
      expect(e.example.length, `${e.key} example 非空`).toBeGreaterThan(0);
      expect(typeof e.dynamic, `${e.key} dynamic 须布尔`).toBe('boolean');
    }
  });

  it('键无重复且与既有索引级目录零交叉（两目录语义域不同）', () => {
    const ks = CLUSTER_SETTINGS_CATALOG.map(e => e.key);
    expect(new Set(ks).size).toBe(ks.length);
    const idx = new Set(SETTINGS_CATALOG.map(e => e.key));
    expect(ks.filter(k => idx.has(k)), '集群目录键不得撞索引目录键').toEqual([]);
  });

  it('任务点名键逐键在册（allocation/awareness/磁盘水位/破坏性动作/只读/恢复限速…）', () => {
    const ks = new Set(CLUSTER_SETTINGS_CATALOG.map(e => e.key));
    for (const k of [
      'cluster.routing.allocation.enable',
      'cluster.routing.allocation.awareness.attributes',
      'cluster.routing.allocation.disk.threshold_enabled',
      'cluster.routing.allocation.disk.watermark.low',
      'cluster.routing.allocation.disk.watermark.high',
      'cluster.routing.allocation.disk.watermark.flood_stage',
      'action.destructive_requires_name',
      'cluster.max_shards_per_node',
      'cluster.blocks.read_only',
      'indices.recovery.max_bytes_per_sec',
    ]) expect(ks.has(k), `${k} 应在集群目录`).toBe(true);
    expect(CLUSTER_SETTINGS_CATALOG.some(e => e.key.startsWith('discovery.zen.')), 'discovery.zen 相关键在册').toBe(true);
  });

  it('热更口径标注：动态主键 dynamic=true；遗留/节点级 discovery.zen dynamic=false', () => {
    const get = (k: string) => CLUSTER_SETTINGS_CATALOG.find(e => e.key === k)!;
    expect(get('cluster.routing.allocation.enable').dynamic).toBe(true);
    expect(get('cluster.routing.allocation.disk.watermark.flood_stage').dynamic).toBe(true);
    expect(get('indices.recovery.max_bytes_per_sec').dynamic).toBe(true);
    const zen = CLUSTER_SETTINGS_CATALOG.find(e => e.key.startsWith('discovery.zen.'))!;
    expect(zen.dynamic).toBe(false);
    expect(zen.desc, '遗留键说明须点破 7.x 遗留/自动维护').toMatch(/遗留|自动维护/);
  });
});

describe('五百五十七批 ②：目录接线源码锚（tooltip 根治「英文参数不知作用」）', () => {
  it('ClusterSettingsView：P/T 两档 input 接 :title=目录释义（中文 desc+示例单源精确匹配）', () => {
    const s = srcOf('views/ClusterSettingsView.vue');
    expect(s).toContain("import { CLUSTER_SETTINGS_CATALOG } from '../utils/indexSettingsCatalog';");
    expect(s.match(/:title="csHint\(row\[1\]\)"/g)!.length, 'persistent/transient 两档各接一处').toBe(2);
    expect(s).toMatch(/function csHint\(k: string\): string \{[^}]*CLUSTER_SETTINGS_CATALOG/);
  });

  it('IndexSettingsView：自定义 setting 行值输入接 :title=SETTINGS_CATALOG 释义（normKey 去前缀口径）', () => {
    const s = srcOf('views/IndexSettingsView.vue');
    expect(s).toContain("import { SETTINGS_CATALOG } from '../utils/indexSettingsCatalog';");
    expect(s).toContain(':title="customHint(r.key)"');
    expect(s).toMatch(/function customHint\(k: string\): string \{[^}]*SETTINGS_CATALOG[^}]*normKey/);
  });
});

describe('五百五十七批 ③：热更失败错误友好化（XmigrateView w80 先例逐字平移）', () => {
  it('save 裸 catch 合并 friendlyEsError(String(e?.message ?? e))；裸 e.message 直弹清零', () => {
    const s = srcOf('views/IndexSettingsView.vue');
    expect(s).toContain("import { friendlyEsError } from '../utils/esError';");
    expect(s).toContain("store.notify('error', '热更失败：' + friendlyEsError(String(e?.message ?? e)));");
    expect(s, '裸 (e?.message || e) 拼接不许残留').not.toMatch(/\+\s*\(e\?\.message \|\| e\)/);
  });
});
