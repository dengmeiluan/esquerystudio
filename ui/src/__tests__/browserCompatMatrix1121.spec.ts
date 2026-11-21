/* 2026-11-21 兼容计划批：结构同步兼容矩阵（COMPAT_MATRIX）九规则正负用例——
 * 六条剔除规则（apack-private/vendor-private/ttl-legacy/routing-attrs/plugin-analysis/ilm-missing）
 * 与三条建议规则（shards-advise/auto-replicas/store-advise）直接驱动 applyCompatMatrix，
 * 规则 id 与 reason 文案与服务端逐字一致；顺带覆盖厂商推断（inferVendor，插件按 token 边界命中）。 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCompatMatrix, COMPAT_MATRIX, inferVendor, VENDOR_LABELS } from '../platform/browserXmigrate';

function ctxOf(over: Partial<Parameters<typeof applyCompatMatrix>[0]> = {}) {
  return {
    settings: {} as Record<string, any>,
    analysis: null as Record<string, any> | null,
    props: {} as Record<string, any>,
    targetPlugins: [] as string[],
    dataNodeCount: null as number | null,
    missingIlmPolicies: new Set<string>(),
    ...over,
  };
}

describe('COMPAT_MATRIX 规则表', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('规则清单为九条且 id 逐字对齐', () => {
    expect(COMPAT_MATRIX.map(r => r.id)).toEqual([
      'apack-private', 'vendor-private', 'ttl-legacy', 'routing-attrs', 'plugin-analysis',
      'ilm-missing', 'shards-advise', 'auto-replicas', 'store-advise',
    ]);
  });

  it('apack-private：index.apack.* 剔除；index.apack 前缀外的 apack 键不受影响', () => {
    const ctx = ctxOf({ settings: { 'index.apack.knn': 'true', 'index.apack_options': '1' } });
    const r = applyCompatMatrix(ctx);
    expect(r.removedSettings).toEqual([{ key: 'index.apack.knn', reason: '阿里云 apack 私有设置，跨环境不可迁移' }]);
    expect(ctx.settings).toEqual({ 'index.apack_options': '1' });
    expect(r.advice).toEqual([]);
  });

  it('vendor-private：键归属前缀在目标厂商不同即剔除（不要求源厂商=归属），目标未知不剔+告知', () => {
    /* 跨厂商：index.apack/aliyun 前缀归属 aliyun，目标 tencent → 按 vendor-private 剔除且不重复记账 */
    const cross = ctxOf({
      settings: {
        'index.apack.knn': 'true', 'index.aliyun.cos.replica': 'x',
        'index.tencent.shard': 'y',
      } as Record<string, any>,
      sourceVendor: 'aliyun', targetVendor: 'tencent',
    });
    const r = applyCompatMatrix(cross);
    expect(r.removedSettings).toEqual([
      { key: 'index.apack.knn', reason: 'vendor private setting (aliyun) not supported by target vendor tencent' },
      { key: 'index.aliyun.cos.replica', reason: 'vendor private setting (aliyun) not supported by target vendor tencent' },
    ]);
    expect(cross.settings).toEqual({ 'index.tencent.shard': 'y' }); // tencent 前缀归属=目标厂商，保留
    /* 键归属判定与源厂商无关：不传 sourceVendor 也照剔（归属看键前缀本身） */
    const noSource = ctxOf({ settings: { 'index.qcloud.ext': '1' } as any, targetVendor: 'aliyun' });
    expect(applyCompatMatrix(noSource).removedSettings).toEqual([
      { key: 'index.qcloud.ext', reason: 'vendor private setting (tencent) not supported by target vendor aliyun' },
    ]);
    /* 同厂商：目标=aliyun，index.aliyun.* 私有前缀保留（apack 前缀仍走 apack-private 无条件剔除） */
    const same = ctxOf({ settings: { 'index.aliyun.cos.replica': 'x' } as any, sourceVendor: 'aliyun', targetVendor: 'aliyun' });
    expect(applyCompatMatrix(same).removedSettings).toEqual([]);
    /* 厂商未知（目标 unknown）：vendor-private 不剔（apack 前缀仍走 apack-private 无条件剔），
       qcloud 键保留并记告知（留给目标报错兜底） */
    const unknownTarget = ctxOf({
      settings: { 'index.apack.knn': 'true', 'index.qcloud.ext': '1' } as any,
      sourceVendor: 'aliyun', targetVendor: 'unknown',
    });
    const unknownRes = applyCompatMatrix(unknownTarget);
    expect(unknownRes.removedSettings)
      .toEqual([{ key: 'index.apack.knn', reason: '阿里云 apack 私有设置，跨环境不可迁移' }]);
    expect(unknownTarget.settings).toEqual({ 'index.qcloud.ext': '1' });
    expect(unknownRes.warnings).toEqual([
      '目标厂商未知，厂商私有设置 index.qcloud.ext 暂不预剔除（留给目标报错兜底）',
    ]);
    /* 缺省（不传 vendor，历史调用面）：与既有 apack 行为完全一致 */
    const legacy = ctxOf({ settings: { 'index.apack.knn': 'true' } as any });
    expect(applyCompatMatrix(legacy).removedSettings)
      .toEqual([{ key: 'index.apack.knn', reason: '阿里云 apack 私有设置，跨环境不可迁移' }]);
    /* aws 私有前缀同理：归属 aws、目标 oss → 剔 */
    const aws = ctxOf({ settings: { 'index.cloud_aws.zone': '2' } as any, targetVendor: 'oss' });
    expect(applyCompatMatrix(aws).removedSettings).toEqual([
      { key: 'index.cloud_aws.zone', reason: 'vendor private setting (aws) not supported by target vendor oss' },
    ]);
  });

  it('ttl-legacy：index.ttl* 剔除（已废弃 TTL 设置）', () => {
    const ctx = ctxOf({ settings: { 'index.ttl': '86400000' } });
    expect(applyCompatMatrix(ctx).removedSettings).toEqual([{ key: 'index.ttl', reason: '已废弃的 TTL 设置' }]);
  });

  it('routing-attrs：节点属性路由剔除，_ 前缀内建 tier 属性与四子域外设置保留', () => {
    const ctx = ctxOf({
      settings: {
        'index.routing.allocation.include.tag': 'hot',
        'index.routing.allocation.include._tier_preference': 'data_hot',
        'index.routing.allocation.total_shards_per_node': '12',
      },
    });
    const r = applyCompatMatrix(ctx);
    expect(r.removedSettings.map(s => s.key)).toEqual(['index.routing.allocation.include.tag']);
    expect(r.removedSettings[0].reason).toContain('节点属性路由依赖源集群节点标签');
    /* total_shards_per_node 不属 include/exclude/require/initial_recovery 四子域：跨集群仍生效，不剔 */
    expect(ctx.settings).toEqual({
      'index.routing.allocation.include._tier_preference': 'data_hot',
      'index.routing.allocation.total_shards_per_node': '12',
    });
  });

  it('plugin-analysis：目标缺 analysis-ik 时 ik 组件剔除并级联降级字段引用；目标有插件则全保留', () => {
    const mk = () => ({
      settings: { 'index.number_of_shards': '1' } as Record<string, any>,
      analysis: { tokenizer: { ik_max_word: { type: 'ik_max_word' } } },
      props: { title: { type: 'text', analyzer: 'ik_max_word' } } as Record<string, any>,
    });
    const missing = ctxOf({ ...mk(), targetPlugins: ['analysis-pinyin'] });
    const r1 = applyCompatMatrix(missing);
    expect(r1.removedAnalysis).toEqual([{
      kind: 'tokenizer', name: 'ik_max_word',
      reason: '目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用',
    }]);
    /* fallback 缺省 standard：analyzer 引用降级为 standard（normalizer 才是剔除属性） */
    expect(r1.downgradedFields).toEqual([{ field: 'title', from: 'ik_max_word', to: 'standard', reason: '目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用' }]);
    expect(missing.props.title).toEqual({ type: 'text', analyzer: 'standard' }); // 字段保留，仅降级分析属性
    /* 正例：目标装了 analysis-ik → 不剔不降级 */
    const has = ctxOf({ ...mk(), targetPlugins: ['analysis-ik'] });
    const r2 = applyCompatMatrix(has);
    expect(r2.removedAnalysis).toEqual([]);
    expect(r2.downgradedFields).toEqual([]);
    expect(has.props.title.analyzer).toBe('ik_max_word');
    /* 目标插件未知（探测失败）→ 跳过该规则，不误删 */
    const unknown = ctxOf({ ...mk(), targetPlugins: null });
    expect(applyCompatMatrix(unknown).removedAnalysis).toEqual([]);
  });

  it('plugin-analysis：未列映射的组件按「插件名包含组件名」判定（如 aliws）；reason 用组件名（type 值）', () => {
    const ctx = ctxOf({
      settings: {},
      analysis: { analyzer: { aliws_analyzer: { type: 'aliws' } } },
      props: {},
      targetPlugins: [],
    });
    const r = applyCompatMatrix(ctx);
    /* 定义名保留在 name；reason 记命中的缺失组件名（type 值），口径对齐服务端 */
    expect(r.removedAnalysis).toEqual([{
      kind: 'analyzer', name: 'aliws_analyzer', reason: '目标集群缺少插件 aliws，组件 aliws 不可用',
    }]);
    const ok = ctxOf({
      settings: {}, analysis: { analyzer: { aliws_analyzer: { type: 'aliws' } } }, props: {},
      targetPlugins: ['aliws-tokenizer-plugin'],
    });
    expect(applyCompatMatrix(ok).removedAnalysis).toEqual([]);
  });

  it('plugin-analysis 级联：引用被剔 tokenizer 定义的自定义 analyzer 一并剔除，字段引用降级', () => {
    const ctx = ctxOf({
      settings: {},
      analysis: {
        tokenizer: { ik_max_word: { type: 'ik_max_word' } },
        analyzer: { my_analyzer: { type: 'custom', tokenizer: 'ik_max_word' } },
      },
      props: { title: { type: 'text', analyzer: 'my_analyzer' } } as Record<string, any>,
      targetPlugins: [],
    });
    const r = applyCompatMatrix(ctx);
    expect(r.removedAnalysis).toEqual([
      { kind: 'tokenizer', name: 'ik_max_word', reason: '目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用' },
      {
        kind: 'analyzer', name: 'my_analyzer',
        reason: 'analyzer 引用了目标不可用的 tokenizer [ik_max_word]: 目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用',
      },
    ]);
    expect(r.downgradedFields.map(d => [d.field, d.from, d.to])).toEqual([['title', 'my_analyzer', 'standard']]);
    expect(ctx.props.title).toEqual({ type: 'text', analyzer: 'standard' }); // 字段保留，analyzer 引用降级为 standard
  });

  it('plugin-analysis 级联：analyzer 的 tokenizer 直接引用缺失组件名（无对应定义）→ 剔除该 analyzer', () => {
    const ctx = ctxOf({
      settings: {},
      analysis: { analyzer: { my_analyzer: { type: 'custom', tokenizer: 'ik_smart' } } },
      props: { title: { type: 'text', analyzer: 'my_analyzer' } } as Record<string, any>,
      targetPlugins: [],
    });
    const r = applyCompatMatrix(ctx);
    expect(r.removedAnalysis).toEqual([{
      kind: 'analyzer', name: 'my_analyzer',
      reason: 'analyzer 引用了目标不可用的组件 ik_smart: 目标集群缺少插件 analysis-ik，组件 ik_smart 不可用',
    }]);
    expect(r.downgradedFields.map(d => [d.field, d.from, d.to])).toEqual([['title', 'my_analyzer', 'standard']]);
    expect(ctx.props.title).toEqual({ type: 'text', analyzer: 'standard' });
  });

  it('plugin-analysis 级联：字段直接引用无定义的缺失组件（analyzer:ik_smart）→ planned 降级该字段', () => {
    const ctx = ctxOf({
      settings: {},
      analysis: null,
      props: { body: { type: 'text', analyzer: 'ik_smart' } } as Record<string, any>,
      targetPlugins: [],
    });
    const r = applyCompatMatrix(ctx);
    expect(r.removedAnalysis).toEqual([]); // 组件无定义，无可剔定义本体
    expect(r.downgradedFields).toEqual([{
      field: 'body', from: 'ik_smart', to: 'standard',
      reason: '目标集群缺少插件 analysis-ik，组件 ik_smart 不可用',
    }]);
    expect(ctx.props.body).toEqual({ type: 'text', analyzer: 'standard' });
  });

  it('ilm-missing：目标 404 的 ILM 策略整键剔除；策略存在则保留', () => {
    const mk = () => ({ settings: { 'index.lifecycle.name': 'ilm-x' } as Record<string, any> });
    const r = applyCompatMatrix(ctxOf({ ...mk(), missingIlmPolicies: new Set(['ilm-x']) }));
    expect(r.removedSettings).toEqual([{ key: 'index.lifecycle.name', reason: '目标集群不存在 ILM 策略 ilm-x' }]);
    expect(applyCompatMatrix(ctxOf({ ...mk(), missingIlmPolicies: new Set() })).removedSettings).toEqual([]);
  });

  it('shards-advise：源分片 > 3×目标数据节点才建议，消息带双侧规模', () => {
    const over = { 'index.number_of_shards': '7' };
    const hit = applyCompatMatrix(ctxOf({ settings: { ...over } as any, dataNodeCount: 2 }));
    expect(hit.advice).toEqual([{
      kind: 'shards', key: 'index.number_of_shards',
      message: '目标数据节点 2 个，源分片 7 片过碎，建议 ≤ 6',
    }]);
    /* 边界：7 片对 3 节点（3×3=9>7）不触发；数据节点未知不触发 */
    expect(applyCompatMatrix(ctxOf({ settings: { ...over } as any, dataNodeCount: 3 })).advice).toEqual([]);
    expect(applyCompatMatrix(ctxOf({ settings: { ...over } as any, dataNodeCount: null })).advice).toEqual([]);
  });

  it('auto-replicas 与 store-advise：存在即建议，键保留不剔除', () => {
    const ctx = ctxOf({
      settings: { 'index.auto_expand_replicas': '0-all', 'index.store.type': 'niofs' } as Record<string, any>,
    });
    const r = applyCompatMatrix(ctx);
    expect(r.advice.map(a => [a.kind, a.message])).toEqual([
      ['replicas', 'auto_expand_replicas 跨集群可能失控（如 0-all），建议显式副本数'],
      ['store', '目标默认存储类型更稳妥，建议移除显式 store.type'],
    ]);
    expect(r.removedSettings).toEqual([]); // 建议类不剔除
    expect(ctx.settings['index.store.type']).toBe('niofs');
    /* store.type 非 niofs/simplefs 不建议 */
    expect(applyCompatMatrix(ctxOf({ settings: { 'index.store.type': 'fs' } as any })).advice).toEqual([]);
  });

  it('plugin-analysis 跨厂商：降级 reason 用英文厂商模板，实际触及的插件出 plugin_install 建议', () => {
    /* 目标厂商已知：downgraded reason 换英文模板（对齐服务端 pluginFieldReason），to 缺省 standard */
    const cross = ctxOf({
      settings: {} as Record<string, any>,
      analysis: { tokenizer: { ik_max_word: { type: 'ik_max_word' } } },
      props: { title: { type: 'text', analyzer: 'ik_max_word' } } as Record<string, any>,
      targetPlugins: ['analysis-pinyin'],
      sourceVendor: 'aliyun', targetVendor: 'tencent',
    });
    const r = applyCompatMatrix(cross);
    /* 组件剔除 reason 保持中文、不带目标厂商尾缀 */
    expect(r.removedAnalysis).toEqual([{
      kind: 'tokenizer', name: 'ik_max_word',
      reason: '目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用',
    }]);
    expect(r.downgradedFields[0]).toEqual({
      field: 'title', from: 'ik_max_word', to: 'standard',
      reason: 'target vendor tencent lacks plugin analysis-ik; analyzer ik_max_word -> standard',
    });
    expect(cross.props.title).toEqual({ type: 'text', analyzer: 'standard' });
    /* 跨厂商且实际发生剔除/降级 → 只对被触及的插件逐个 plugin_install 建议（文案对齐服务端）；同厂商不出 */
    expect(r.advice.filter(a => a.kind === 'plugin_install')).toEqual([{
      kind: 'plugin_install', key: 'analysis-ik', component: 'ik_max_word',
      message: 'target vendor tencent lacks plugin analysis-ik; install it on target or accept standard fallback',
    }]);
    const sameVendor = ctxOf({
      settings: {}, analysis: { tokenizer: { ik_max_word: { type: 'ik_max_word' } } },
      props: {} as Record<string, any>, targetPlugins: [],
      sourceVendor: 'aliyun', targetVendor: 'aliyun',
    });
    expect(applyCompatMatrix(sameVendor).advice).toEqual([]);
    /* 目标厂商 unknown：reason 保持中文文案（不带厂商） */
    const unknownTarget = ctxOf({
      settings: {}, analysis: { tokenizer: { ik_max_word: { type: 'ik_max_word' } } },
      props: {} as Record<string, any>, targetPlugins: [],
      sourceVendor: 'aliyun', targetVendor: 'unknown',
    });
    expect(applyCompatMatrix(unknownTarget).removedAnalysis[0].reason)
      .toBe('目标集群缺少插件 analysis-ik，组件 ik_max_word 不可用');
  });

  it('inferVendor：插件/发行版特征按优先级推断（插件 token 边界命中），oss/unknown 如实回落', () => {
    expect(inferVendor(['apack'], null)).toMatchObject({ id: 'aliyun', label: '阿里云 ES', evidence: ['plugin:apack'] });
    expect(inferVendor(['analysis-ik'], 'aliyun-build').evidence).toContain('distribution:aliyun-build');
    expect(inferVendor(['qcloud-es-plugin'], null).id).toBe('tencent');
    /* aws 证据走 token 边界关键字（com.amazonaws/cloud-aws/repository-s3）：
     * repository-s3 整词命中；mapper-forensicsaws 的 forensicsaws 是单个 token 不误判 */
    expect(inferVendor(['repository-s3'], null).id).toBe('aws');
    expect(inferVendor(['cloud-aws'], null).id).toBe('aws');
    expect(inferVendor(['mapper-forensicsaws'], null).id).toBe('unknown');
    expect(inferVendor(['amazon-es'], null).id).toBe('unknown'); // 'amazon'/'aws' 子串不再作为 aws 证据
    expect(inferVendor([], 'ECE').id).toBe('elastic');
    expect(inferVendor([], 'default')).toEqual({ id: 'oss', label: VENDOR_LABELS.oss, evidence: ['distribution:default'] });
    expect(inferVendor(['analysis-ik'], null).id).toBe('unknown'); // 无云特征且发行版未知
  });
});
