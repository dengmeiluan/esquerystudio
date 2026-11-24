/**
 * 五百三十三批：布局自适应 / 重复元素收口源码锁。
 * 锁五件事（全源码锁，零挂载）：
 * ① ClusterSettingsView / RemoteClustersView 900 紧凑微调档在场——529/531 两批「全量」
 *    叙事的真实漏网页补齐，防回删（同 responsive900Sweep529 口径：档在场且非空）；
 *    RemoteClusters 语义合并（StatusPill / MetaStrip 统一件）一并锁防回退；
 * ② QueryHubView .qh-top 窄容器换行（flex-wrap）在场——900 档单列化兜窄档之外，
 *    档位之间一带允许 chip/入口钮换行；
 * ③ QueryHub / SqlBridge / SqlConsole 三页页头 CurrentIdxChip 在场（import + 模板挂载）——
 *    三页静默消费 store.pickedIdx 却无当前索引可视锚，收口后防拔锚；
 * ④ DiffEditorView df.edH 高度落盘——全站唯一「可调不落盘」（.df-ta resize:vertical
 *    拖完刷新即丢）收口为 qx.taH 范式（pointerup 读实高落 usePref）；
 * ⑤ AnalysisSettingsView --sp 间距 token 收口在场（theme.css:100-103 裁决，只收精确等值）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcOf = (name: string) => readFileSync(join(__dirname, '..', 'views', `${name}.vue`), 'utf-8');
/* 900 档块提取：规则全为单行，非贪婪到首个行首 `}` 即块尾（块内无行首大括号） */
const block900Of = (src: string) => src.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/);

describe('五百三十三批：布局自适应/重复元素收口（源码锁）', () => {
  it('① ClusterSettings/RemoteClusters 900 档在场且非空；RemoteClusters StatusPill/MetaStrip 合并在场', () => {
    for (const name of ['ClusterSettingsView', 'RemoteClustersView']) {
      const block = block900Of(srcOf(name));
      expect(block, `${name}.vue 缺 900 紧凑微调档`).toBeTruthy();
      expect(block![0], `${name}.vue 900 档为空壳`).toMatch(/\{[^{}]+\}/);
    }
    const rc = srcOf('RemoteClustersView');
    expect(rc, '连接状态合并 StatusPill（tone g/r 双态）').toMatch(/<StatusPill :tone="r\.connected \? 'g' : 'r'"/);
    expect(rc, 'rc-card-meta 合并 MetaStrip（items=metaOf）').toMatch(/<MetaStrip class="rc-card-meta" :items="metaOf\(r\)" \/>/);
    expect(rc, 'rc-dot 色点随合并退役').not.toMatch(/class="rc-dot"/);
  });

  it('② QueryHubView .qh-top 窄容器换行（flex-wrap）在场', () => {
    const src = srcOf('QueryHubView');
    expect(src, '.qh-top 缺 flex-wrap（窄容器硬挤单行回潮）').toMatch(/\.qh-top \{[^}]*flex-wrap: wrap/);
  });

  it('③ QueryHub/SqlBridge/SqlConsole 三页页头 CurrentIdxChip 在场（import + 挂载）', () => {
    for (const name of ['QueryHubView', 'SqlBridgeView', 'SqlConsoleView']) {
      const src = srcOf(name);
      expect(src, `${name}.vue 缺 CurrentIdxChip import`).toMatch(/import CurrentIdxChip from '\.\.\/components\/CurrentIdxChip\.vue'/);
      expect(src, `${name}.vue 缺 CurrentIdxChip 模板挂载`).toMatch(/<CurrentIdxChip \/>/);
    }
  });

  it('④ DiffEditorView df.edH 高度落盘（usePref 键 + pointerup 读实高 + 两卡 min-height 回灌）', () => {
    const src = srcOf('DiffEditorView');
    expect(src, "缺 usePref('df.edH') 偏好键").toMatch(/usePref<string>\('df\.edH'/);
    expect(src, '缺 pointerup 读实高落盘函数').toMatch(/function saveEdH\(e: PointerEvent\)/);
    expect(src, '.df-ta 缺 :style min-height 回灌').toMatch(/class="df-ta ro json-view" :style="\{ minHeight: edH \}"/);
    expect(src, '.df-ta-ja 缺 :style min-height 回灌').toMatch(/class="df-ta-ja" :style="\{ minHeight: edH \}"/);
    /* ⚠df-ta 是 textarea/pre 自渲染面：禁加 height:100%（锁死 resize 语义）——防劣化守护 */
    expect(src, '.df-ta 不得加 height:100%（锁死 resize 语义）').not.toMatch(/\.df-ta \{[^}]*height: 100%/);
  });

  it('⑤ AnalysisSettingsView --sp 间距 token 收口在场（页侧距/卡头/分组 grid 落梯）', () => {
    const src = srcOf('AnalysisSettingsView');
    expect(src, '页侧距未落 --sp 梯').toMatch(/\.as-page \{ padding: var\(--sp-3\) var\(--sp-4\) var\(--sp-5\)/);
    expect(src, '分组 grid 间距未落 --sp 梯').toMatch(/\.as-groups \{[^}]*gap: var\(--sp-3\); margin-bottom: var\(--sp-3\);/);
    expect(src, '卡头 padding 未落 --sp 梯').toMatch(/\.as-card-hd \{ padding: var\(--sp-2\) var\(--sp-3\);/);
  });
});
