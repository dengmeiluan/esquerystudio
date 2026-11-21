/* 五百六十批轨5【错误语义合并+进度可见】八件看守。
 *
 * 治理本体：六写路径裸 err（e.message 直出）→ friendlyEsError 单源翻译
 * （BoostTunerView w80 先例口径 friendlyEsError(String(e?.message ?? e))，中文前缀保留）；
 * DQ jqError 死状态（写了 ref 但模板零渲染点）补行内提示；
 * DQ 工具行窄屏静默裁切：overflow:hidden 为 dqBuilderEntry554 在途锁域，备案回退；
 * Snapshots 恢复/创建提交后进度可见（立即补刷+文案指路）；
 * Browser ForceMerge 同步等待改异步提交（wait_for_completion=false，对齐 IndexHub 先例）；
 * Slm 触发后双刷（立即 + 1200ms 兜底）。
 *
 * 走源文本匹配理由同 lrBarSingleTrack.spec.ts:26-29：happy-dom 下 scoped <style>
 * 不参与计算，布局/接线断言只能是源文本断言；剥注释同 emptyStatePadding.spec.ts:29
 * 的教训——注释里的字面不算数。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const views = join(__dirname, '..', 'views');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const read = (f: string) => strip(readFileSync(join(views, f), 'utf-8'));

const FFE = "friendlyEsError(String(e?.message ?? e))";

describe('obsWave560：DslQueryView 六写路径错误合并', () => {
  const dq = read('DslQueryView.vue');

  it('六处 catch 臂全部接线 friendlyEsError 单源（中文前缀保留）', () => {
    expect(dq.includes("import { friendlyEsError } from '../utils/esError'"),
      'DslQueryView 必须从 utils/esError 单源导入 friendlyEsError').toBe(true);
    const pairs: Array<[string, string]> = [
      ['更新文档失败：', 'saveDoc 更新文档失败'],
      ['写入失败：', 'saveNewDoc 新建文档失败'],
      ['删除文档失败：', 'askDeleteDoc 删除文档失败'],
      ['count 预估失败: ', 'askDeleteByQuery count 预估失败'],
      ['删除失败：', '_delete_by_query 执行失败'],
      ['全量导出失败：', 'exportAll 全量导出失败'],
    ];
    for (const [prefix, label] of pairs) {
      expect(dq.includes(`'${prefix}' + friendlyEsError(String(e?.message ?? e))`),
        `${label} 必须是「'${prefix}' + friendlyEsError(String(e?.message ?? e))」口径`).toBe(true);
    }
  });

  it('catch 臂不再残留裸 e.message 直出 notify（六路径合并后不得回退）', () => {
    /* 六处合并点所在行不得再出现裸串拼接（失败原因可读化后裸串回退=治理失效） */
    const lines = dq.split('\n');
    for (const ln of lines) {
      if (ln.includes("store.notify('error'") && /e\?\.message \|\| e/.test(ln)) {
        expect(ln.includes('friendlyEsError'),
          `错误 notify 不得裸拼 e.message：${ln.trim()}`).toBe(true);
      }
    }
  });

  it('jqError 死状态修复：JQ 行尾有渲染点（写了 ref 必须有人消费）', () => {
    expect(/<span v-if="jqError" class="il-hint il-err"/.test(dq),
      'jqError 已写入 ref 但模板无渲染点=死状态；JQ 行尾必须补 il-hint il-err 行内提示').toBe(true);
    expect(/v-if="jqError" class="il-hint il-err"[^>]*>\{\{ jqError \}\}/.test(dq),
      '渲染点必须输出 jqError 文本本体').toBe(true);
  });

  it('工具行窄屏裁切：overflow:hidden 备案保留（dqBuilderEntry554 在途锁域，回退裁决）', () => {
    const rule = /(?:^|[\s,}])\.dq-toolbar \.lr-bar-l\s*\{([^}]*)\}/m.exec(dq);
    expect(rule, '.dq-toolbar .lr-bar-l 规则消失了').toBeTruthy();
    expect(/overflow\s*:\s*hidden/.test(rule![1]),
      'dqBuilderEntry554:121 逐字锁（对方在途 untracked spec）——overflow:hidden 字面必须保留').toBe(true);
    expect(/flex\s*:\s*1 1 auto/.test(rule![1]) && /white-space|nowrap/.test(dq),
      '左段弹性与 nowrap 单行语义保持（542 三行合一锁域零触）').toBe(true);
  });
});

describe('obsWave560：SnapshotsView 提交后进度可见', () => {
  const sv = read('SnapshotsView.vue');

  it('doRestore 提交成功后立即补刷列表一次（1500ms 兜底前的进度可见）', () => {
    const body = /async function doRestore\(\)[\s\S]*?\n\}/.exec(sv)?.[0] ?? '';
    expect(body, 'doRestore 函数体必须存在').toBeTruthy();
    expect(/restoreOpen\.value = false;\s*\n\s*loadSnapshots\(\);/.test(body),
      '恢复提交成功关闭弹窗后必须立即 loadSnapshots() 一次（IN_PROGRESS 行级进度可见）').toBe(true);
    expect(/loadSnapshots, 1500\)/.test(sv),
      '创建侧既有 1500ms 单发兜底形态不动（不为恢复造定时器）').toBe(true);
  });

  it('doRestore 成功文案补「进度见列表行」指路', () => {
    expect(sv.includes('进度见列表行'),
      '恢复成功 notify 必须补「进度见列表行」文案（异步去處可见）').toBe(true);
  });

  it('doCreate 提交后立即 loadSnapshots() + 1500ms 单发兜底保留', () => {
    const body = /async function doCreate\(\)[\s\S]*?\n\}/.exec(sv)?.[0] ?? '';
    expect(body, 'doCreate 函数体必须存在').toBeTruthy();
    expect(/createOpen\.value = false;\s*\n\s*loadSnapshots\(\);/.test(body),
      '创建提交成功关闭弹窗后必须立即 loadSnapshots()（不等 1500ms）').toBe(true);
    expect(/setTimeout\(loadSnapshots, 1500\)/.test(body),
      '1500ms 单发兜底保留（IN_PROGRESS 快照元数据晚到补偿）').toBe(true);
  });

  it('doCreate 裸 err 接线 friendlyApiError（571 同步更新：560 原锁 friendlyEsError 口径，571 三消费面接线升级 code 优先单源）', () => {
    expect(sv.includes("'创建失败：' + friendlyApiError(e)"),
      '创建失败必须 friendlyApiError 口径（560 doRestore 已修是先例；571 升级 code 优先）').toBe(true);
  });

  it('sv-input 改用 SearchFilterBar 统一件（placeholder 逐字保留，559 TasksView tv-kw 先例）', () => {
    expect(sv.includes("import SearchFilterBar from '../components/SearchFilterBar.vue'"),
      '必须导入 SearchFilterBar 统一件').toBe(true);
    expect(/<SearchFilterBar v-model="filter"/.test(sv),
      '过滤词 v-model="filter" 接线必须保留（HitNav/onHitKey 消费方零动）').toBe(true);
    expect(/placeholder="按名字过滤"/.test(sv),
      'placeholder 逐字保留（兼作 aria-label）').toBe(true);
    expect(/input-class="sv-kw"/.test(sv),
      'sv-kw 纯锚类随 input-class 保留在 input 上（tv-kw 先例形态，胶囊壳归组件单源）').toBe(true);
    expect(/@enter="onHitKey"/.test(sv),
      'Enter 定向转出接线 onHitKey（HitNav Shift+Enter 前/后语义经 SFB @enter 保留）').toBe(true);
    expect(/<input v-model="filter" placeholder="按名字过滤" class="sv-input/.test(sv),
      '手写过滤框必须退役（改用后不得残留裸 input 形态）').toBe(false);
  });
});

describe('obsWave560：BrowserView ForceMerge 异步化+错误合并', () => {
  const br = read('BrowserView.vue');

  it('ForceMerge 走结构化端点；ES 7.10 不携带 wait_for_completion（会 400）', () => {
    expect(br).toContain('api.clusterForceMerge(idx.index, 1)');
    const adminSrc = readFileSync(join(__dirname, '../../../modules/console/src/main/java/io/github/dengmeiluan/esquerystudio/console/core/EsIndexAdmin.java'), 'utf-8');
    expect(adminSrc).toContain('/_forcemerge');
    expect(adminSrc).not.toContain('/_forcemerge?wait_for_completion=false');
  });

  it('响应含 taskId 时 notify 指路任务页（响应处理形态对齐 IndexOptimizerView 先例）', () => {
    const body = /async function askFm\([\s\S]*?\n\}/.exec(br)?.[0] ?? '';
    expect(body, 'askFm 函数体必须存在').toBeTruthy();
    expect(/taskId/.test(body) && body.includes('已提交后台执行'),
      '响应含 taskId 必须 notify「已提交后台执行，去任务页看进度」语义').toBe(true);
  });

  it('打开文档失败/ForceMerge 失败两处裸 err 接线 friendlyEsError', () => {
    expect(br.includes("'打开文档失败：' + " + FFE),
      'openLinkedDoc 打开文档失败必须 friendlyEsError 口径').toBe(true);
    expect(br.includes("'ForceMerge 失败: ' + " + FFE),
      'askFm ForceMerge 失败必须 friendlyEsError 口径（原半角冒号+空格前缀保留）').toBe(true);
  });
});

describe('obsWave560：SlmView 触发后双刷+错误合并', () => {
  const slm = read('SlmView.vue');

  it('execNow 成功臂：立即 loadAll() + 1200ms 兜底重刷保留', () => {
    const body = /async function execNow\([\s\S]*?\n\}/.exec(slm)?.[0] ?? '';
    expect(body, 'execNow 函数体必须存在').toBeTruthy();
    expect(/store\.notify\('success'[^;]*;\s*\n\s*loadAll\(\);/.test(body),
      '触发成功后必须立即 loadAll()（快照进度可见不等 1200ms）').toBe(true);
    expect(/setTimeout\(loadAll, 1200\)/.test(body),
      '1200ms 兜底重刷保留（SLM 侧状态晚到补偿）').toBe(true);
  });

  it('触发失败裸 err 接线 friendlyEsError', () => {
    expect(slm.includes("'触发失败：' + " + FFE),
      'execNow 触发失败必须 friendlyEsError 口径（本文件其余臂已修是先例）').toBe(true);
  });
});

describe('obsWave560：PitScrollView 三处裸 err 合并', () => {
  const pit = read('PitScrollView.vue');

  it('PIT 开启/关闭/拉取失败三处接线 friendlyEsError（log 留痕原文不动）', () => {
    expect(pit.includes("import { friendlyEsError } from '../utils/esError'"),
      'PitScrollView 必须从 utils/esError 单源导入 friendlyEsError').toBe(true);
    expect(pit.includes("'PIT 开启失败：' + " + FFE),
      'open 失败必须 friendlyEsError 口径').toBe(true);
    expect(pit.includes("'关闭失败：' + " + FFE),
      'doClose 失败必须 friendlyEsError 口径').toBe(true);
    expect(pit.includes("'拉取失败：' + friendlyEsError(msg)"),
      '导出循环失败 error 臂必须 friendlyEsError 口径（_shard_doc tip warning 臂不在此域）').toBe(true);
  });
});
