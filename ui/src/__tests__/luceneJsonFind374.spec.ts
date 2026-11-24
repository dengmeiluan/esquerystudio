/**
 * 三百七十四批：Lucene JSON 视图内查找——台账波次 E「304 Lucene JSON 视图查找」
 * 是路线图上最后一个未打勾项。表格视图查找走 QRT/HitNav；JSON 视图（逐 hit
 * JsonTree 嵌套展开）此前无任何查找手段，大结果集只能肉眼扫。
 * 实现：jsonKw 过滤式查找（_id 与 JSON.stringify(_source) 双匹配、大小写不敏感）
 * + 「命中/总数」计数 + 清除钮；kw 空回全量。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');

describe('Lucene JSON 视图内查找（374 批，304 遗留收尾）', () => {
  it('jsonKw 过滤态 + _id/_source 双匹配（大小写不敏感）', () => {
    expect(v).toMatch(/const jsonKw = ref\(''\);/);
    expect(v).toMatch(/const kw = jsonKw\.value\.trim\(\)\.toLowerCase\(\);/);
    expect(v).toMatch(/String\(h\._id \?\? ''\)\.toLowerCase\(\)\.includes\(kw\)/);
    expect(v).toMatch(/JSON\.stringify\(h\._source \?\? \{\}\)\.toLowerCase\(\)\.includes\(kw\)/);
    expect(v).toMatch(/if \(!kw\) return hits\.value;/);
  });

  it('查找条 UI：输入+命中计数+清除钮；表格体消费 jsonHits', () => {
    expect(v).toMatch(/<div class="lc-json-find" v-if="hits\.length">/);
    expect(v).toMatch(/v-model="jsonKw"/);
    /* 五百六十二批同步更新：手写 input 改用 SearchFilterBar 统一件（Esc 清空组件内建承接，
       行为等价 filterEscClear379 口径）——input 独立 aria-label 属性退役，placeholder
       经组件内建兼作 aria-label（原「JSON 视图内查找」语义入 placeholder 逐字保留） */
    expect(v).toMatch(/placeholder="在 JSON 视图内查找（_id\/字段值）…"/);
    expect(v).toMatch(/\{\{ jsonHits\.length \}\}\/\{\{ hits\.length \}\} 条/);
    expect(v).toMatch(/<button v-if="jsonKw" class="btn ghost xs" aria-label="清除 JSON 视图查找" @click="jsonKw = ''">✕<\/button>/);
    /* 五百二十一批同步更新：命中行加底色类 + aria-current（_id 套 MarkText），tr 键声明不变 */
    /* 1207：行上多了 @contextmenu（命中行右键），锚点跟着放宽——锁的是
       「这一行确实由 jsonHits 驱动」，不是没别的属性 */
    expect(v).toMatch(/<tr v-for="h in jsonHits" :key="h\._id" :class="\{ 'lc-hit-row': !!jsonMarkKw \}" :aria-current="jsonMarkKw \? 'true' : undefined"/);
  });

  it('查找条仅 JSON 视图渲染（表格视图查找归 QRT/HitNav，不双份）', () => {
    /* lc-json-find 在 v-else（json 视图）分支内，且不在 QRT 标签之前；452 起 json 分支包聚焦面 */
    const qrtIdx = v.indexOf('<QueryResultTable');
    const findIdx = v.indexOf('lc-json-find');
    const elseIdx = v.indexOf('pane-id="lucene.json"');
    expect(findIdx).toBeGreaterThan(elseIdx);
    expect(elseIdx).toBeGreaterThan(qrtIdx);
  });
});
