/**
 * 五百六十二批·用户产线实报两修契约看守（DevTools 插入字段 + 工具行单轨）。
 *
 *  A dtPathIdx 系统路径防护——实报：/_cat/indices 路径下「插入字段」把 cat 子命令
 *    indices 误当索引名拉 /indices/_mapping（404 index_not_found）。修法=首段判定：
 *    只认首个非空段，'_' 开头系统段（_cat/_cluster/_nodes/…）恒回退 pickedIdx，
 *    不再从后段抠索引。锁 devtoolsLint532 的接线行零触。
 *  B useIndexFields.loadErr 压缩——实报浮层裸怼千字级 ResponseException 原文。
 *    修法=compactLoadErr 单源：抽 status line 状态码 + ES 首个 reason，未命中形态
 *    退 160 字截断（七消费面 FieldPicker/补全白得）。
 *  C .dt-actions 单轨化——实报窄容器按钮换行堆竖排（401 批「容器换行+子项不内断」
 *    不治本）。修法=543 批 lrBarSingleTrack 约定同刀：nowrap+横滚+flex:1 1 0 与
 *    ⤢ 聚焦钮同行；子项 nowrap/flex-shrink:0 保留。
 *
 * 源码锁口径（assistLintWave533 同理由）：scoped CSS/computed 形态契约落源文本最稳。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compactLoadErr } from '../composables/useIndexFields';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');

const dt = read('views/DevToolsView.vue');
const uif = read('composables/useIndexFields.ts');

describe('562 实报 A：dtPathIdx 首段判定（/_cat/indices 不再误抠子命令当索引名）', () => {
  it('dtPathIdx=首个非空段且非 _ 开头，否则空串（不再遍历跳过系统段）', () => {
    expect(dt).toMatch(/const seg = \(cur\.value\?\.path \|\| ''\)\.split\('\?'\)\[0\]\.split\('\/'\)\.find\(Boolean\);/);
    expect(dt).toMatch(/return seg && !seg\.startsWith\('_'\) \? seg : '';/);
    expect(dt, '旧「首个非 _ 段」遍历形态退役').not.toMatch(/for \(const s of \(cur\.value\?\.path \|\| ''\)/);
  });
  it('devtoolsLint532 接线行零触（useIndexFields 消费行原样）', () => {
    expect(dt).toContain("useIndexFields(() => dtPathIdx.value || store.pickedIdx || '')");
  });
});

describe('562 实报 B：loadErr 压缩单源 compactLoadErr', () => {
  it('catch 臂消费压缩器（不再裸回 e.message 原文）', () => {
    expect(uif).toContain('loadErr.value = compactLoadErr(e);');
    expect(uif).toMatch(/function compactLoadErr\(e: any\): string/);
  });
  it('行为：status line + ES reason 压缩为人话短串（404 index_not_found 实报形态）', () => {
    const raw = 'ResponseException: method [GET], host [http://es-cn-xxx:9200], URI [/indices/_mapping], '
      + 'status line [HTTP/1.1 404 Not Found]\n{"error":{"root_cause":[{"type":"index_not_found_exception",'
      + '"reason":"no such index [indices]","resource.type":"index_or_alias"}],"status":404}';
    expect(compactLoadErr(raw)).toBe('ES 404 Not Found:no such index [indices]');
  });
  it('行为：非 status line 形态退 160 字截断（短原文保真）', () => {
    expect(compactLoadErr({ message: '请求超时（30s 无响应）' })).toBe('请求超时（30s 无响应）');
    const long = 'x'.repeat(200);
    expect(compactLoadErr({ message: long })).toBe('x'.repeat(160) + '…');
  });
});

describe('562 实报 C：.dt-actions 单轨化（窄容器不再换行堆竖排，与 ⤢ 同行）', () => {
  it('nowrap+横滚+flex:1 1 0（543 lrBarSingleTrack 同刀；row-gap 退役）', () => {
    expect(dt).toMatch(/\.dt-actions \{ display: flex; gap: var\(--sp-1h\); align-items: center; flex-wrap: nowrap; overflow-x: auto; min-width: 0; flex: 1 1 0; \}/);
  });
  it('子项不内断守卫保留（401 批横滚形态下依然正确）', () => {
    expect(dt).toMatch(/\.dt-actions > \* \{ white-space: nowrap; flex-shrink: 0; \}/);
  });
});
