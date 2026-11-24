/**
 * 五百五十七批：统一件收尾波（工蚁6 独占域 7 视图）。
 *
 *  ① RawIo 第四波补铺五面（MatchMatrix / Lifecycle 双钮 / IndexOptimizer / RemoteClusters /
 *     PainlessLab）——形态逐字承 546/548 三行模式：import RawIoModal + api 行扩
 *     ioRecorder/type RawIoRec + Terminal 图标并入既有 lucide import；模板钮 data-test="raw-io"
 *     （Lifecycle 双钮另 + raw-io-lc-explain，548 QueryXray raw-io-tv 先例）；script 三件套
 *     （rawIoShow/rawIoRec/openRawIo，判空 store.notify 引导不开空弹窗）。
 *     endpoint 特征：MatchMatrix='/cluster/search-raw'（与 548 ScoreExplain 同特征——该页唯一
 *     出口即 searchRaw，特征锁定单条语义不变，跨页互见备案）；Lifecycle='/cluster/rollover' +
 *     '/cluster/ilm/explain'（rollover 响应 details 与 explain 预填两通道各取各的）；
 *     IndexOptimizer='/cluster/index-settings'（GET 扫描与 PUT 下发 update 同族公共前缀，
 *     last 取最近一条=「plan/preview」双语义，备案：/cluster/index-settings-defaults 子串互见）；
 *     RemoteClusters='/cluster/remote-clusters'（连通性拉取响应）；PainlessLab='/cluster/painless/execute'。
 *  ② QueryXrayView 退壳：.qx-card 三消费面（编辑器卡/执行解释卡/词频取证卡）照 554 st-card
 *     先例 border:0;border-radius:0（overflow:hidden 保留——CSS resize 手柄生效条件）；
 *     .qx-ii width:170px → min(170px,100%) 断点钳（529 ④ 扩锚同款范式，900 档 100% 独占行
 *     前的基样式极窄溢出钳制）；.qx-card-ed :deep(.ja) 剥框只核对。
 *  ③ SecurityView：审计详情弹窗两串手写「·」meta → MetaStrip 组件（items 双源计算属性，
 *     555 富维度四锚同步更新）；@media 三块（1100 + 900 单行×2 重复档）并档为 1100+900 两块
 *     （逐条规则等值迁移零删规则）。
 *  ④ PainlessLabView：storedErr 手写 err-mini（pl-empty-mini 空态家族遗留类）→ EmptyState
 *     compact（:text="storedErr" 文案逐字透传 + action-text="重试"）；既有两处 EmptyState 不动。
 *  ⑤ LifecycleView：rollover 辅助编辑器外框退役——.lc-rollover :deep(.ja) border:none
 *     （RankDebugView rd-card-ed 先例同语言；rows 定高不随容器伸缩，不接 flex 链）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ═══════════ ① RawIo 第四波补铺五面（546/548 CASES 同形态字面锁） ═══════════ */
describe('五百五十七批①：RawIo 补铺五面（三行模式，548 rawIoPave 同形态）', () => {
  const CASES: Array<{ f: string; label: string; feat: string }> = [
    { f: 'MatchMatrixView.vue', label: '查看原始 IO（矩阵执行）', feat: "ioRecorder.last('/cluster/search-raw')" },
    { f: 'IndexOptimizerView.vue', label: '查看原始 IO（优化向导）', feat: "ioRecorder.last('/cluster/index-settings')" },
    { f: 'RemoteClustersView.vue', label: '查看原始 IO（远程集群）', feat: "ioRecorder.last('/cluster/remote-clusters')" },
    { f: 'PainlessLabView.vue', label: '查看原始 IO（脚本求值）', feat: "ioRecorder.last('/cluster/painless/execute')" },
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

  it('LifecycleView 双钮双特征（548 QueryXray 两钮先例）：rollover + ilm explain 各取各的记录', () => {
    const v = read('../views/LifecycleView.vue');
    expect(v).toContain("import RawIoModal from '../components/RawIoModal.vue'");
    expect(v).toContain('data-test="raw-io"');
    expect(v).toContain('data-test="raw-io-lc-explain"');
    expect(v).toContain('aria-label="查看原始 IO（Rollover）"');
    expect(v).toContain('aria-label="查看原始 IO（ILM explain）"');
    expect(v).toContain("ioRecorder.last('/cluster/rollover')");
    expect(v).toContain("ioRecorder.last('/cluster/ilm/explain')");
    expect(v).toContain('<RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />');
    expect(v).toContain("store.notify('info', '暂无原始 IO 记录");
  });

  it('十二特征并集互不混淆（六特征 ∪ 548 七前缀；search-raw 双页同特征属 own 重叠非串扰）', () => {
    const MINE: Array<{ f: string; own: string[] }> = [
      { f: 'MatchMatrixView.vue', own: ['/cluster/search-raw'] },
      { f: 'LifecycleView.vue', own: ['/cluster/rollover', '/cluster/ilm/explain'] },
      { f: 'IndexOptimizerView.vue', own: ['/cluster/index-settings'] },
      { f: 'RemoteClustersView.vue', own: ['/cluster/remote-clusters'] },
      { f: 'PainlessLabView.vue', own: ['/cluster/painless/execute'] },
    ];
    const LEGACY = [
      '/cluster/reindex-advanced', '/cluster/alias-actions', '/cluster/mapping-put',
      '/cluster/search-raw', '/cluster/explain-doc', '/cluster/validate-query', '/cluster/term-vectors',
    ];
    const all = [...new Set([...MINE.flatMap(m => m.own), ...LEGACY])];
    expect(new Set(all).size).toBe(all.length); /* 全站十二特征互不相同 */
    for (const m of MINE) {
      const v = read('../views/' + m.f);
      for (const o of m.own) expect(v).toContain(`ioRecorder.last('${o}')`);
      for (const foreign of all.filter(p => !m.own.includes(p))) {
        expect(v, `${m.f} 不得串入他人前缀 ${foreign}`).not.toContain(`ioRecorder.last('${foreign}')`);
      }
    }
  });
});

/* ═══════════ ② QueryXrayView 退壳（st-card 先例同语言 + 断点钳） ═══════════ */
describe('五百五十七批②：QueryXrayView .qx-card 三面退役 + .qx-ii 断点钳', () => {
  const v = read('../views/QueryXrayView.vue');

  it('.qx-card 带框壳退役：border:0;border-radius:0（overflow:hidden 保留=resize 手柄条件）', () => {
    expect(v).toContain('.qx-card { border: 0; border-radius: 0; overflow: hidden; }');
    expect(v, '带框写法不回潮').not.toMatch(/\.qx-card \{ border: 1px solid/);
    expect(v, '--r-m 圆角不回潮').not.toMatch(/\.qx-card \{[^}]*--r-m/);
  });

  it('三消费面锚在场（编辑器卡 / 执行解释卡 / 词频取证卡，模板零触）', () => {
    expect(v).toContain('class="qx-card qx-card-ed"');
    expect(v.match(/class="qx-card"/g)?.length).toBe(2);
  });

  it('.qx-ii 断点钳：width:170px → min(170px,100%)（529 ④ 同款范式，退回裸 px 即红）', () => {
    expect(v).toContain('width: min(170px, 100%)');
    expect(v, '裸 170px 不回潮').not.toMatch(/\.qx-ii \{ width: 170px;/);
  });

  it('.qx-card-ed :deep(.ja) 剥框已在场（rd-card-ed 先例，只核对不回删）', () => {
    expect(v).toContain('.qx-card-ed :deep(.ja) { flex: 1; min-height: 0; border: none; border-radius: 0; }');
  });
});

/* ═══════════ ③ SecurityView：MetaStrip 合并 + @media 并档 ═══════════ */
describe('五百五十七批③：SecurityView 审计详情 meta 串合并 MetaStrip + 900 重复档并档', () => {
  const v = read('../views/SecurityView.vue');

  it('弹窗两串换 MetaStrip 组件消费（items 双源计算属性；手写「·」串退役）', () => {
    expect(v).toContain("import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'");
    expect(v.match(/<MetaStrip /g)?.length).toBe(2);
    expect(v).toContain('dvBaseItems');
    expect(v).toContain('dvRichItems');
    expect(v, '手写「·」分隔串不回潮').not.toContain(' · {{');
    expect(v, 'sec-dv-meta 手写串容器不回潮').not.toContain('class="sec-dv-meta mono"');
  });

  it('555 富维度四锚同步更新（集群/IP/耗时/宿主贡献语义在场）', () => {
    expect(v).toContain("value: String(r.cluster), label: '集群'");
    expect(v).toContain("value: String(r.ip), label: 'IP'");
    expect(v).toContain("value: String(r.costMs), unit: 'ms', label: '耗时'");
    expect(v).toContain("r.source === 'host' ? '宿主贡献' : '控制台'");
  });

  it('@media 三块并档为 1100+900 两块：900 档全文件恰一块，new-user/rebind-row 两规则等值在场', () => {
    expect(v.match(/@media \(max-width: 900px\)/g)?.length).toBe(1);
    expect(v.match(/@media \(max-width: 1100px\)/g)?.length).toBe(1);
    expect(v).toContain('.new-user { grid-template-columns: minmax(0, 1fr); }');
    expect(v).toContain('.rebind-row { grid-template-columns: minmax(0, 1fr); }');
  });
});

/* ═══════════ ④ PainlessLabView：err-mini 合并 EmptyState ═══════════ */
describe('五百五十七批④：PainlessLabView storedErr 手写空态合并 EmptyState（文案逐字保留）', () => {
  it('EmptyState compact 接管 storedErr（:text 透传 + 重试 action 在场；pl-empty-mini 家族退役）', () => {
    const raw = read('../views/PainlessLabView.vue');
    /* 剥注释断言（flattenWave556 strip 同一教训）：类名退役锁锁的是代码不是备案注释 */
    const v = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    expect(raw).toMatch(/<EmptyState v-if="storedErr" compact :icon="AlertCircle" :text="storedErr" action-text="重试" class="pl-err-mini" @action="retryStored" \/>/);
    /* 重试在途防重入（原钮 :disabled="storedLoading" 语义等值承接；loadStored 本体不设防
       ——storedLoading 初值 true 是首帧防闪假空态位，起手短路会杀掉 onMounted 首载） */
    expect(v).toContain('function retryStored()');
    expect(v.match(/function retryStored[\s\S]{0,80}return;/s)).toBeTruthy();
    expect(v, 'pl-empty-mini 空态家族档退役（类名+样式）').not.toContain('pl-empty-mini');
    expect(v, 'pl-err-mini 手写样式档退役（类名保留作 devxThreeState 行为锁落位锚）').not.toMatch(/\.pl-err-mini \{/);
    expect(v, '.pl-load-mini 加载态保留（进行态与空态视觉可分，G7-B2 口径）').toContain('.pl-load-mini');
    /* 既有两处 EmptyState 不动（暂无存储脚本 / 点击试跑） */
    expect(v).toContain('text="暂无存储脚本"');
    expect(v).toContain('text="点击「试跑」运行脚本"');
  });
});

/* ═══════════ ⑤ LifecycleView：rollover 辅助编辑器外框退役 ═══════════ */
describe('五百五十七批⑤：LifecycleView 辅助编辑器外框退役（RankDebug 先例同语言）', () => {
  it('.lc-rollover :deep(.ja) border:none 在场（rows 定高，不接 flex 链）', () => {
    const v = read('../views/LifecycleView.vue');
    expect(v).toContain('.lc-rollover :deep(.ja) { border: none; border-radius: 0; }');
  });
});
