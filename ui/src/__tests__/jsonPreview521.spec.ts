/**
 * 五百二十一批：裸 JSON 预览/原始响应统一 highlightJson 高亮收口（静态守卫，同 374/302 范式）。
 *  ① CreateIndexModal 请求预览：computed highlightJson(previewText) + 既有 json-view 类（SnapshotsView 同款）；
 *  ② LifecycleView rollover/move 原始响应：JSON 分支走 highlightJson（v-html），
 *     五百二十五批同步更新：「错误：」前缀判型退役——失败路径前缀移除直接存原始错误全文，
 *     判型改 resultLooksErr 稳判（JSON.parse + error 键），错误分支换 errPreHtml v-html 全文。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cim = readFileSync(join(__dirname, '../components/CreateIndexModal.vue'), 'utf-8');
const lc = readFileSync(join(__dirname, '../views/LifecycleView.vue'), 'utf-8');

describe('CreateIndexModal 请求预览高亮（521 批）', () => {
  it('previewText 走 computed highlightJson + json-view 类，v-html 承接（输出已转义无注入面）', () => {
    expect(cim).toMatch(/const previewHtml = computed\(\(\) => highlightJson\(previewText\.value\)\);/);
    expect(cim).toContain('<pre v-if="previewOpen" class="cim-preview mono scroll-y json-view" v-html="previewHtml">');
    expect(cim).toMatch(/import \{ tryParse, highlightJson \} from '\.\.\/utils\/jsonc';/);
  });
});

describe('LifecycleView 原始响应高亮收口（521 批；五百二十五批稳判 + errPreHtml 同步更新）', () => {
  it('rollover：JSON 分支 highlightJson（json-view + v-html），错误分支 errPreHtml 全文（前缀移除）', () => {
    /* 五百二十五批：判型走 resultLooksErr 稳判（parse 成功且含 error 键 = 错误 JSON，parse 失败 = 平文错误） */
    expect(lc).toMatch(/const rolloverResultIsErr = computed\(\(\) => resultLooksErr\(rolloverResult\.value\)\);/);
    expect(lc).toContain("'error' in (o as Record<string, unknown>)");
    expect(lc).toMatch(/const rolloverResultHtml = computed\(\(\) =>\s*\n\s*rolloverResultIsErr\.value \? errPreHtml\(rolloverResult\.value\) : highlightJson\(rolloverResult\.value\)\);/);
    expect(lc).toMatch(/<pre v-if="rolloverResultIsErr" class="lc-result" v-html="rolloverResultHtml"><\/pre>/);
    expect(lc).toMatch(/<pre v-else class="lc-result json-view" v-html="rolloverResultHtml"><\/pre>/);
    /* 五百二十五批：失败路径前缀移除——不再写「错误：」前缀 */
    expect(lc).not.toContain("rolloverResult.value = '错误：'");
  });

  it('move：同 rollover 双分支（template v-if 承接，空结果不渲染空 pre）', () => {
    expect(lc).toMatch(/const moveResultIsErr = computed\(\(\) => resultLooksErr\(moveResult\.value\)\);/);
    expect(lc).toMatch(/const moveResultHtml = computed\(\(\) =>\s*\n\s*moveResultIsErr\.value \? errPreHtml\(moveResult\.value\) : highlightJson\(moveResult\.value\)\);/);
    expect(lc).toContain('<template v-if="moveResult">');
    expect(lc).toMatch(/<pre v-if="moveResultIsErr" class="lc-result" v-html="moveResultHtml"><\/pre>/);
    expect(lc).toMatch(/<pre v-else class="lc-result json-view" v-html="moveResultHtml"><\/pre>/);
    expect(lc).not.toContain("moveResult.value = '错误：'");
  });

  it('highlightJson 单一出处（utils/jsonc），不复制着色逻辑', () => {
    expect(lc).toMatch(/import \{ highlightJson \} from '\.\.\/utils\/jsonc';/);
  });
});
