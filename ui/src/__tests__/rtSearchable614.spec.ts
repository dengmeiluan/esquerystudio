/**
 * 六百一十四批（轨3 表格内核消费面二批）：searchable 消费面扩展——IH qryTbl + DQ resultTbl。
 *
 * 背景：612 批首消费面 IndexHub docsTbl 接线时明注「qryTbl 不设负锚——下批接线不反锁」；
 * 落 ⑥-1 同链余量两行：查询 tab（qryTbl）与查询工作台（resultTbl）同接
 * :searchable="true"（宪法 B「可检索」七能力铺到两大高频结果面；606 口径
 * 「全选/反选=sortedHits 当前视图」随接线在两面产品可达）。
 *
 * ⚠540 W3 裁决边界（it3 决策钉）：qryTbl 不接 remote-sort——DSL 是用户手写，服务端 sort
 * 下推会与用户 sort 子句冲突（IndexHubView 五百四十批注释在案）；searchable 是纯前端当前
 * 视图过滤（quickFilter 管线），不触 DSL，不在该裁决射程内。负锚钉住「searchable 接线
 * ≠ sort 接线」防后续误扩（568-C1 已核：两面标签段注释无 sort 字样，负锚不自伤）。
 *
 * ⚠键盘安全静态预勘（612-C2「输入态×既有键盘语义」组合锁的静态半边；行为半边=
 * rtSearchable612 it2/it3「输入态 Esc 清词勾选保留」内核级锁 face 无关已覆盖）：
 * IH 抽屉/放大两级 capture 守卫（onDrawerKeydown/onFsKeydown）均 INPUT/TEXTAREA 让路；
 * DQ onGlobalRunKey（P1）INPUT/TEXTAREA/SELECT/contentEditable/.monaco-editor 全让路、
 * DQ 无 window 级 Esc；TableQSearch esc.prevent 清词自持——两接线面零串扰（it4 钉守卫形态）。
 *
 * rtTag 提取法=ihUnify554/rtSearchable612 同款。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

/* rtTag 提取法（rtSearchable612 同款）：从 <ResultTable ref="X" 切到 </ResultTable> */
function rtTag(src: string, ref: string): string {
  const start = src.indexOf('<ResultTable ref="' + ref + '"');
  expect(start, 'RT 消费标签存在（防空跑）').toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('</ResultTable>', start));
}

describe('六百一十四批：searchable 消费面扩展（qryTbl+resultTbl）', () => {
  it('IH 查询 tab qryTbl 接线 :searchable="true"（接线锁）', () => {
    expect(rtTag(ih, 'qryTbl')).toContain(':searchable="true"');
  });

  /* 八百二十四批锁同步更新：恒真接线退役（双搜索框合一——json 档 dq-json-find/cards 档
     dq-cards-kw 伴生，快滤管线只作用于表格行，非表格档死 UI）；接线仍真、档位收窄
     表格档，本锁语义=接线存在性同步更新为档位接线锁 */
  it('DQ resultTbl 档位接线 :searchable="view === \'table\'"（824 同步更新：双框合一）', () => {
    expect(rtTag(dq, 'resultTbl')).toContain(":searchable=\"view === 'table'\"");
  });

  it('540 W3 决策钉（804 同步更新·用户八令推翻：DQ 结果表已接 remote-sort——「排序真实查询语句命中」20261008 16:13 实报；IH qryTbl 维持不接）', () => {
    expect(rtTag(ih, 'qryTbl')).not.toMatch(/\bremote-sort\b/);
    expect(rtTag(ih, 'qryTbl')).not.toContain('sync-sort');
    expect(rtTag(dq, 'resultTbl')).toMatch(/\bremote-sort\b/);
    expect(rtTag(dq, 'resultTbl')).toContain('sync-sort');
    expect(rtTag(dq, 'resultTbl')).toContain('@sort-change');
  });

  it('键盘安全静态钉：IH 两级守卫与 DQ 全局执行键输入态让路在场（612-C2 静态半边）', () => {
    expect(ih).toMatch(/function onDrawerKeydown[\s\S]{0,400}tagName === 'INPUT'[\s\S]{0,80}tagName === 'TEXTAREA'/);
    expect(ih).toMatch(/function onFsKeydown[\s\S]{0,600}tagName === 'INPUT'[\s\S]{0,80}tagName === 'TEXTAREA'/);
    expect(dq).toMatch(/function onGlobalRunKey[\s\S]{0,500}tagName === 'INPUT'/);
  });
});
