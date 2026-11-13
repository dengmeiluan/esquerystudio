/**
 * 六百六十七批·轨2：IndexHub alt 三视图改用 AltHitsViews 统一件（565 件解冻收口）。
 *
 *  背景：565 件③抽 AltHitsViews 共享件时 DQ 落地、IndexHub docs/query 两域跳过——
 *  ihUnify554 DOM 字面锁在册 + 工作树 11 M 残留未清（altViewsShare565 头注备案
 *  「留给锁同步更新批」）。658 批接管提交 9e999d7e 后工作树 M=0、黑名单制度性清零，
 *  冻结前提蒸发，解冻收口：IH 两域六分支改用共享件单源（轨4「相同场景共用
 *  同一套组件」；DQ/RT/QRT 之后第四消费面）。
 *
 *  契约（验收锚）：
 *  一、IH import 共享件 + docs/query 两域 json/tree/cards 六分支各挂一件
 *      （view/:json-html/:tree-data/:hits + @open-doc 契约，565 DQ 同款）；
 *  二、内联内脏退役负锚：pre v-html 直挂/JsonTree 直挂/卡片 v-for 行/
 *      .ih-card 系六规则 CSS/格式化截断导入 全部退役（防回流）；
 *  三、留宿主正锚（防过收）：jsonc 高亮链导入 + 两域行集 computed + 高亮管道
 *      在场（共享件输入源）；包裹层 v-show 容器类 ih-json-wrap/ih-tree-view/ih-cards
 *      + ih-alt-body 留宿主（track2Wave560-ih CSS 锁零触）。
 *  行为等值由同步更新后 ihUnify554（四段点卡开文档）+ 565 组件行为锁 + 真机探针三重承接。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

/* 域切片（ihUnify554 同款切法，防其他消费方误匹配） */
function domainSlice(src: string, startMark: string, endMark: string): string {
  const start = src.indexOf(startMark);
  expect(start, startMark + ' 在场（防空跑）').toBeGreaterThan(-1);
  return src.slice(start, src.indexOf(endMark, start));
}

describe('667 一：IH import 共享件 + 两域六分支接线（源码锁）', () => {
  it('import AltHitsViews 在场（565 DQ 同款路径）', () => {
    expect(ih).toContain("import AltHitsViews from '../components/AltHitsViews.vue';");
  });
  it('docs 域三分支：json=高亮信封入参 / tree=行集入参 / cards=全量命中+openDoc（导航条接线随 934 对齐）', () => {
    const seg = domainSlice(ih, "tab === 'docs'", "tab === 'query'");
    expect(seg).toContain('<AltHitsViews view="json" :json-html="docsJsonHtml" :doc-count="docsHits.length"');
    expect(seg).toContain('<AltHitsViews view="tree" :tree-data="docsAltData" :doc-count="docsAltData.length"');
    expect(seg).toContain('<AltHitsViews view="cards" :hits="docsHits" @open-doc="openDoc" />');
  });
  it('query 域三分支同构（qryJsonHtml/qryAltData/qryResp.hits；导航条接线随 934 对齐）', () => {
    const seg = domainSlice(ih, '<template v-else-if="tab === \'query\'">', '<!-- Settings -->');
    expect(seg).toContain('<AltHitsViews view="json" :json-html="qryJsonHtml" :doc-count="qryResp?.hits?.length ?? 0"');
    expect(seg).toContain('<AltHitsViews view="tree" :tree-data="qryAltData" :doc-count="qryAltData.length"');
    expect(seg).toContain('<AltHitsViews view="cards" :hits="qryResp.hits" @open-doc="openDoc" />');
  });
});

describe('667 二：内联内脏退役负锚（防回流）', () => {
  it('json 档 pre v-html 直挂退役（信封入参化）', () => {
    expect(ih).not.toContain('<pre class="json-view" v-html=');
  });
  it('JsonTree 直挂退役（Tree 档经共享件；组件 import 一并退役）', () => {
    expect(ih).not.toContain('<JsonTree ');
    expect(ih).not.toMatch(/import JsonTree from '\.\.\/components\/JsonTree\.vue';/);
  });
  it('卡片 v-for 内脏退役 + .ih-card 系六规则 CSS 退役', () => {
    expect(ih).not.toContain('class="ih-card"');
    expect(ih).not.toMatch(/\.ih-card-(id|row|k|v)\b/);
    expect(ih).not.toMatch(/\.ih-card[\s{:]/);
  });
  it('42 字截断导入退役（随卡片内脏进共享件；565 DQ 同款退役）', () => {
    expect(ih).not.toMatch(/\btrunc\b/);
  });
});

describe('667 三：留宿主正锚（防过收；共享件输入源与包裹层保形）', () => {
  it('jsonc 高亮链 + 两域行集 computed + 高亮管道在场（AltHitsViews 输入源）', () => {
    expect(ih).toMatch(/import \{ stripJsonComments, prettyJson, highlightJson \} from '\.\.\/utils\/jsonc';/);
    expect(ih).toMatch(/const docsAltData = computed\(\(\) => docsHits\.value\.map\(h => \(\{ _id: h\._id, \.\.\.h\._source \}\)\)\);/);
    expect(ih).toContain('const qryAltData = computed(');
    expect(ih).toMatch(/highlightJson\(prettyJson\(/);
  });
  it('包裹层 v-show 容器类三档留宿主（560-ih CSS 锁零触）', () => {
    expect(ih).toContain('class="scroll-y ih-json-wrap ih-alt-body"');
    expect(ih).toContain('class="scroll-y ih-tree-view ih-alt-body"');
    expect(ih).toContain('class="ih-cards ih-alt-body"');
    expect(ih).toContain('.ih-json-wrap { max-height: var(--ih-alt-cap, 56vh); }');
    expect(ih).toContain('.ih-tree-view { max-height: var(--ih-alt-cap, 56vh); padding: var(--sp-2); }');
    expect(ih).toContain('.ih-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--sp-2h); max-height: 56vh; }');
  });
});
