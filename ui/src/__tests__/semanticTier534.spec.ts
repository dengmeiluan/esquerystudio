/**
 * 五百三十四批「语义档」源锚（工蚁 W5）：SlmView / WatcherView 页头状态中文主显改用。
 *
 * 断言落在源文本上（semanticTier531/533 同理由：happy-dom 不参与 scoped <style> 与
 * MetaStrip 插值计算，渲染后断言是死断言）：
 *  A SlmView operation_mode 中文主显（slmOpModeZh）+ tone 走收口件既有口径；
 *    英文原值留 tip 保检索——tip 断言锁「原值不丢」；
 *  B WatcherView watcher_state 同构（watcherStateZh/watcherStateTone + tip 保检索）；
 *  C 负向锚：两视图手写英文三元档退役，不得双轨（本地 ternary tone 映射不回潮）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const readView = (name: string) => readFileSync(join(SRC, 'views', name + '.vue'), 'utf-8');

describe('semanticTier534 A：SlmView operation_mode 中文主显', () => {
  it('slmOpModeZh/slmOpModeTone import 在場；中文主显 + tone 收口件接线', () => {
    const s = readView('SlmView');
    expect(s).toContain("import { slmOpModeZh, slmOpModeTone } from '../utils/esEnumZh'");
    expect(s).toContain("value: slmOpModeZh(statusMode.value), label: '运行状态', tone: slmOpModeTone(statusMode.value)");
  });

  it('英文原值留 tip 保检索；手写英文三元档退役不双轨', () => {
    const s = readView('SlmView');
    expect(s).toContain('tip: statusMode.value');
    expect(s, '原 RUNNING 三元 tone 退役（换 slmOpModeTone 单源）')
      .not.toContain("tone: statusMode.value === 'RUNNING' ? 'ok' : 'warn'");
  });
});

describe('semanticTier534 B：WatcherView watcher_state 中文主显', () => {
  it('watcherStateZh/watcherStateTone import 在場；中文主显 + tone 收口件接线', () => {
    const s = readView('WatcherView');
    expect(s).toContain("import { watcherStateZh, watcherStateTone } from '../utils/esEnumZh'");
    expect(s).toContain("value: watcherStateZh(watchState.value), label: '状态', tone: watcherStateTone(watchState.value)");
  });

  it('英文原值留 tip 保检索；手写英文三元档退役不双轨', () => {
    const s = readView('WatcherView');
    expect(s).toContain('tip: watchState.value');
    expect(s, '原 started 三元 tone 退役（换 watcherStateTone 单源）')
      .not.toContain("tone: watchState.value === 'started' ? 'ok' : 'warn'");
  });
});
