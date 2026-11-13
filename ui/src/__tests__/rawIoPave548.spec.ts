/**
 * 五百四十八批：原始 IO 快查环第三波 —— 六视图铺装（Reindex 高级 / 别名图 / Mapping 设计器 /
 * 打分解剖 / 排名侦探 / 查询 X 光）。
 *
 *  形态逐字承 546 批三行模式：import RawIoModal + api 行扩 ioRecorder/type RawIoRec + Terminal
 *  图标并入既有 lucide import；模板钮 data-test="raw-io"（QueryXray 双钮另 + raw-io-tv，545
 *  Adhoc 两钮先例）；script 三件套（rawIoShow/rawIoRec/openRawIo，判空 store.notify 引导不开空弹窗）。
 *  endpoint 前缀全站独占性：Reindex 高级='/cluster/reindex-advanced'、别名图写通道=
 *  '/cluster/alias-actions'（GET /cluster/aliases 会被 IndexHub 顶掉，勿用）、Mapping 设计器
 *  写通道='/cluster/mapping-put'（GET mapping-detail 被 IndexHub/AnalyzerLab 污染，勿用）、
 *  打分解剖='/cluster/search-raw'、排名侦探='/cluster/explain-doc'（已知限制备案：runAb 对决
 *  双发 Promise.all，ioRecorder.last 只见后完成者——通常 B 文档；A 文档原文仍在环内更早记录，
 *  特征锁定单条语义不变）、查询 X 光双通道='/cluster/validate-query' + '/cluster/term-vectors'。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('五百四十八批：五视图「原始 IO」钮铺装（字面锁，546 CASES 同形态）', () => {
  const CASES: Array<{ f: string; label: string; feat: string }> = [
    { f: 'ReindexAdvancedView.vue', label: '查看原始 IO（Reindex 高级）', feat: "ioRecorder.last('/cluster/reindex-advanced')" },
    { f: 'AliasesView.vue', label: '查看原始 IO（别名图）', feat: "ioRecorder.last('/cluster/alias-actions')" },
    { f: 'MappingDesignerView.vue', label: '查看原始 IO（Mapping 设计器）', feat: "ioRecorder.last('/cluster/mapping-put')" },
    { f: 'ScoreExplainView.vue', label: '查看原始 IO（打分解剖）', feat: "ioRecorder.last('/cluster/search-raw')" },
    { f: 'RankDebugView.vue', label: '查看原始 IO（排名侦探）', feat: "ioRecorder.last('/cluster/explain-doc')" },
  ];
  for (const c of CASES) {
    it(`${c.f}：钮 / 特征 ${c.feat} / 弹窗挂载 / 判空 notify`, () => {
      const v = read('../views/' + c.f);
      expect(v).toContain("import RawIoModal from '../components/RawIoModal.vue'");
      expect(v).toContain('data-test="raw-io"');
      expect(v).toContain(`aria-label="${c.label}"`);
      expect(v).toContain(c.feat);
      expect(v).toContain('<RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />');
      /* 判空：rec=null 时 notify 引导（不开空弹窗），文案全站同口径 */
      expect(v).toContain("store.notify('info', '暂无原始 IO 记录");
    });
  }
});

describe('五百四十八批：QueryXrayView 双钮（545 Adhoc 两钮先例）', () => {
  it('透视/词频双钮双特征：validate-query + term-vectors 各取各的记录', () => {
    const v = read('../views/QueryXrayView.vue');
    expect(v).toContain("import RawIoModal from '../components/RawIoModal.vue'");
    expect(v).toContain('data-test="raw-io"');
    expect(v).toContain('data-test="raw-io-tv"');
    expect(v).toContain('aria-label="查看原始 IO（透视校验）"');
    expect(v).toContain('aria-label="查看原始 IO（词频取证）"');
    expect(v).toContain("ioRecorder.last('/cluster/validate-query')");
    expect(v).toContain("ioRecorder.last('/cluster/term-vectors')");
    expect(v).toContain('openRawIoValidate');
    expect(v).toContain('openRawIoTv');
    expect(v).toContain('<RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />');
    expect(v).toContain("store.notify('info', '暂无原始 IO 记录");
  });
});

describe('五百四十八批：全站 endpoint 语义（七前缀互不混淆）', () => {
  const HOME: Array<{ f: string; own: string[] }> = [
    { f: 'ReindexAdvancedView.vue', own: ['/cluster/reindex-advanced'] },
    { f: 'AliasesView.vue', own: ['/cluster/alias-actions'] },
    { f: 'MappingDesignerView.vue', own: ['/cluster/mapping-put'] },
    { f: 'ScoreExplainView.vue', own: ['/cluster/search-raw'] },
    { f: 'RankDebugView.vue', own: ['/cluster/explain-doc'] },
    { f: 'QueryXrayView.vue', own: ['/cluster/validate-query', '/cluster/term-vectors'] },
  ];
  it('六视图七通道前缀各归其位：own 在场、他人前缀零串扰', () => {
    const all = HOME.flatMap(h => h.own);
    expect(new Set(all).size).toBe(all.length); /* 七前缀互不相同 */
    for (const h of HOME) {
      const v = read('../views/' + h.f);
      for (const o of h.own) expect(v).toContain(`ioRecorder.last('${o}')`);
      for (const foreign of all.filter(p => !h.own.includes(p))) {
        expect(v, `${h.f} 不得串入他人前缀 ${foreign}`).not.toContain(`ioRecorder.last('${foreign}')`);
      }
    }
  });
});
