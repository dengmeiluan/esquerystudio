/* MCP 迁移链路口径看守：migrate_index / cross_cloud_structure_sync 提示词与
 * es_xmigrate 分组参数表在四端（浏览器 browserMcp.ts、本地 Node stdio 桥、
 * 服务端 McpController.java、docs/mcp.md）保持同一份口径。
 *
 * 锁面（源文本按字面匹配）：
 *   - migrate_index 正文步骤 3 三端逐字一致，且引导 dryRun 预览后执行携带
 *     planDigest（expectPlanDigest）防源结构漂移——漂移防护引导不再只存在于
 *     cross_cloud_structure_sync 提示词。
 *   - cross_cloud_structure_sync 四端都声明可选参数 destIndex（缺省与 sourceIndex 同名）。
 *   - es_xmigrate 分组参数表三端同表：expectPlanDigest / downgradedAnalyzerFallback
 *     在列（分发层均已接受，schema 不落后于实现），sampleSize / aggSize 为 number
 *     并写明与实现层同源的钳制（10-500 缺省 100 / 1-50 缺省 10）。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const ts = read('../platform/browserMcp.ts');
const local = read('../../../mcp/esquerystudio-local-mcp.mjs');
const java = read('../../../modules/console/src/main/java/io/github/dengmeiluan/esquerystudio/console/mcp/McpController.java');
const docs = read('../../../docs/mcp.md');

/** 截取 migrate_index 正文步骤 3（从「3. 结构兼容」到「syncAliases=true」），三端应逐字相等。 */
function migrateStep3(source: string): string {
  const i = source.indexOf('3. 结构兼容');
  if (i < 0) return '';
  const j = source.indexOf('syncAliases=true', i);
  return j < 0 ? '' : source.slice(i, j + 'syncAliases=true'.length);
}

describe('MCP 迁移链路四端口径', () => {
  it('migrate_index 步骤 3 三端逐字一致，且引导执行时携带 expectPlanDigest 防源结构漂移', () => {
    const guard = '执行时携带 dryRun 预览返回的 planDigest（expectPlanDigest）防源结构漂移';
    const stepTs = migrateStep3(ts);
    expect(stepTs, 'browserMcp.ts 应包含步骤 3').toContain(guard);
    expect(migrateStep3(local), '本地 Node 桥与浏览器端逐字一致').toEqual(stepTs);
    expect(migrateStep3(java), '服务端与浏览器端逐字一致').toEqual(stepTs);
  });

  it('cross_cloud_structure_sync 四端都声明可选参数 destIndex', () => {
    expect(ts).toContain("promptArg('destIndex', 'Target index name; defaults to sourceIndex.', false)");
    expect(local).toContain("promptArg('destIndex', 'Target index name; defaults to sourceIndex.', false)");
    expect(java).toContain('promptArg("destIndex", "Target index name; defaults to sourceIndex.", false)');
    expect(docs).toMatch(/cross_cloud_structure_sync` \| `srcConnId`、`destConnId`（必填）、`sourceIndex\?`、`destIndex\?`/);
  });

  it('es_xmigrate 分组参数表三端补齐 expectPlanDigest / downgradedAnalyzerFallback，sampleSize / aggSize 为 number 且写明钳制', () => {
    for (const [label, source] of [['浏览器', ts], ['本地 Node', local], ['服务端', java]] as const) {
      expect(source.match(/downgradedAnalyzerFallback = \{ type: 'string'/g) || source.match(/put\("downgradedAnalyzerFallback", string\("string"/g),
        `${label} 分组表应有 downgradedAnalyzerFallback（string）`).not.toBeNull();
      expect(source.match(/expectPlanDigest = \{ type: 'string'/g) || source.match(/put\("expectPlanDigest", string\("string"/g),
        `${label} 分组表应有 expectPlanDigest（string）`).not.toBeNull();
      expect(source.match(/sampleSize = \{ type: 'number', description: 'verify_equivalence: _doc 序取样条数，钳制 10-500（缺省 100）'/g)
        || source.match(/put\("sampleSize", string\("number", "verify_equivalence: _doc 序取样条数，钳制 10-500（缺省 100）"\)/g),
        `${label} sampleSize 应为 number 且写明钳制 10-500 缺省 100`).not.toBeNull();
      expect(source.match(/aggSize = \{ type: 'number', description: 'verify_equivalence: 聚合桶数，钳制 1-50（缺省 10）'/g)
        || source.match(/put\("aggSize", string\("number", "verify_equivalence: 聚合桶数，钳制 1-50（缺省 10）"\)/g),
        `${label} aggSize 应为 number 且写明钳制 1-50 缺省 10`).not.toBeNull();
    }
    expect(docs).toContain('`downgradedAnalyzerFallback?`（降级字段的回退分析器，缺省 standard，normalizer 属性总是剔除）');
    expect(docs).toContain('`sampleSize?`（缺省 100，钳制 10..500）');
    expect(docs).toContain('`aggSize?`（缺省 10，钳制 1..50）');
  });
});
