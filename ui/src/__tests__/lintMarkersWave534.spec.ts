/**
 * 五百三十四批 P0-1：四视图 banner→划线双通道契约看守（工蚁 W1）。
 *
 * RestView / SystemView / MatchMatrixView / UpdateByQueryView 各补「编辑器 ref +
 * watch(输入源, useDebounceFn 250ms) + setMarkers(info→hint 降级)」——
 * SearchSandboxView 524 批范式逐字（assistLintWave533 五视图同款接线锚）；
 * 既有 banner 提示条保留（双通道，负向锁不退役）。
 *
 * 源码锁口径（assistLintWave533 同理由）：happy-dom 不参与 Monaco 划线计算，
 * 划线接线是形态契约，落源文本最稳。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const readView = (name: string) => readFileSync(join(SRC, `views/${name}.vue`), 'utf-8');

const rt = readView('RestView');
const sys = readView('SystemView');
const mm = readView('MatchMatrixView');
const ubq = readView('UpdateByQueryView');

/* SearchSandboxView 524 批范式的核心一行：info 降级 hint 后喂 setMarkers（四视图逐字同款） */
const DOWNGRADE_LINE = "severity: f.severity === 'info' ? 'hint' as const : f.severity";

describe('四视图 setMarkers 双通道挂法锚（banner 保留）', () => {
  it('RestView：rtBodyMonaco 挂点 + 防抖 setMarkers（info 降级 hint）+ banner 不退役', () => {
    expect(rt).toMatch(/<MonacoEditor ref="rtBodyMonaco" v-model="body"/);
    expect(rt).toContain('const rtBodyMonaco');
    expect(rt).toContain('rtBodyMonaco.value?.setMarkers?.(rtLint.value');
    expect(rt).toContain(DOWNGRADE_LINE);
    expect(rt).toContain('watch(body, () => { queueRtLintMarkers(); }, { immediate: true });');
    expect(rt).toContain("import { useDebounceFn } from '../composables/useDebounceFn';");
    /* banner 提示条保留（双通道，不因划线退役） */
    expect(rt).toMatch(/rtLintErrors\.length" role="alert"/);
    expect(rt).toMatch(/rtLintWarns\.length" role="status"/);
  });

  it('SystemView：sysDslMonaco 同款 + banner 不退役', () => {
    expect(sys).toMatch(/<MonacoEditor ref="sysDslMonaco" v-model="dsl"/);
    expect(sys).toContain('const sysDslMonaco');
    expect(sys).toContain('sysDslMonaco.value?.setMarkers?.(sysLint.value');
    expect(sys).toContain(DOWNGRADE_LINE);
    expect(sys).toContain('watch(dsl, () => { queueSysLintMarkers(); }, { immediate: true });');
    expect(sys).toMatch(/sysLintErrors\.length" role="alert"/);
    expect(sys).toMatch(/sysLintWarns\.length" role="status"/);
  });

  it('MatchMatrixView：mmJaRef（JsonArea 面透传）+ banner 不退役', () => {
    expect(mm).toMatch(/<JsonArea ref="mmJaRef" v-model="dsl"/);
    expect(mm).toContain('const mmJaRef');
    expect(mm).toContain('mmJaRef.value?.setMarkers?.(mmLint.value');
    expect(mm).toContain(DOWNGRADE_LINE);
    expect(mm).toContain('watch(dsl, () => { queueMmLintMarkers(); }, { immediate: true });');
    expect(mm).toMatch(/mmLintErrors\.length" role="alert"/);
    expect(mm).toMatch(/mmLintWarns\.length" role="status"/);
  });

  it('UpdateByQueryView：uqJaRef（JsonArea 面透传）+ 全量删除红条与黄条 banner 均不退役', () => {
    expect(ubq).toMatch(/<JsonArea ref="uqJaRef" v-model="queryStr"/);
    expect(ubq).toContain('const uqJaRef');
    expect(ubq).toContain('uqJaRef.value?.setMarkers?.(queryLint.value');
    expect(ubq).toContain(DOWNGRADE_LINE);
    expect(ubq).toContain('watch(queryStr, () => { queueUqLintMarkers(); }, { immediate: true });');
    /* 五百六十二批同步更新：.uq-lint 私造双档改用 theme.css .lint-bar 单源（uq-lint 锚并存，
       grid-column 落位留 scoped），role 语义与条件逐字不动 */
    expect(ubq).toMatch(/fullDeleteWarn" role="alert" class="lint-bar uq-lint lint-bar-err"/);
    expect(ubq).toMatch(/queryLintWarnings\.length" class="lint-bar uq-lint lint-bar-warn"/);
  });

  it('四视图防抖统一件同值：useDebounceFn 250ms（SearchSandboxView 缺省口径）', () => {
    for (const [name, s] of [['RestView', rt], ['SystemView', sys], ['MatchMatrixView', mm], ['UpdateByQueryView', ubq]] as const) {
      expect(s, name).toMatch(/useDebounceFn\(\(\) => \{[\s\S]*?\}, 250\)/);
    }
  });
});
