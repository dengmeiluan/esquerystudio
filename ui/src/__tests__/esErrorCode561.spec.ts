/* 五百六十一批轨5【前端三件看守】。
 *
 * F3 约定本体：esError.ts 新增 friendlyApiError(e: unknown)——鸭子类型读 e.code 命中
 * 后端结构化错误码表（code 是后端明确分流的语义，命中优先级恒高于 message 子串猜测）；
 * 未命中/无 code 降级 friendlyEsError(String(e?.message ?? e))。存量 KNOWN 表与
 * friendlyEsError 逐字节零改动（由本 spec 的降级等值断言看守）。
 *
 * F1/F6 走源文本匹配理由同 obsWave560.spec.ts 头注：happy-dom 下组件接线/模块内定时器
 * 回调体断言只能是源文本断言（useNow 的 tick 行为另以 fake timers 行为测试双保险）。
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { friendlyApiError, friendlyEsError } from '../utils/esError';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* 约定全码表（与 esError.ts API_CODE_FRIENDLY 一一对应；顺序即约定顺序） */
const CODE_TABLE: Array<[string, string]> = [
  ['LOCK_CONFLICT', '索引被其他任务锁定,请稍后重试'],
  ['LOCK_LOST', '索引被其他任务锁定,请稍后重试'],
  ['STAGE_GUARD', '当前阶段不允许该操作'],
  ['RULE_REJECTED', '规则校验未通过,请检查配置'],
  ['CONTROL_CLUSTER_DOWN', '管控集群不可达,请稍后重试'],
  ['DEST_INDEX', '目标索引操作失败'],
  ['JOB_STATE', '作业状态不允许该操作'],
  ['REMOTE_CONNECT_FAILED', '远端集群连接失败'],
  ['SETUP_REQUIRED', '连接尚未完成初始化'],
  ['BAD_CREDENTIALS', '凭据校验失败'],
  ['CONN_FORBIDDEN', '无该连接的访问权限'],
  ['CONN_NOT_FOUND', '连接不存在或已删除'],
];

describe('friendlyApiError（561 约定：结构化 code 表）', () => {
  it('全码表遍历：每个 code 命中约定文案（多码同文案的 LOCK_CONFLICT/LOCK_LOST 在列）', () => {
    for (const [code, msg] of CODE_TABLE) {
      expect(friendlyApiError({ code, message: '原始报错体 ' + code })).toBe(msg);
    }
  });

  it('code 命中优先于 message 子串：message 含 KNOWN 子串但 code 不同 → code 表赢', () => {
    /* message 里的 index_not_found_exception 是 KNOWN 表叶子，若实现先翻 message 就翻车 */
    expect(
      friendlyApiError({ code: 'LOCK_CONFLICT', message: 'index_not_found_exception: no such index' }),
    ).toBe('索引被其他任务锁定,请稍后重试');
    /* 反向：message 与 LOCK_LOST 无关、code 命中 → 仍约定文案 */
    expect(
      friendlyApiError({ code: 'STAGE_GUARD', message: 'parsing_exception: bad dsl' }),
    ).toBe('当前阶段不允许该操作');
  });

  it('无 code 降级：与 friendlyEsError(String(e?.message ?? e)) 逐字等值', () => {
    const samples = [
      'index_not_found_exception: no such index [x]',
      'HTTP 502',
      'inspect 失败: ResponseException: cluster blocked',
    ];
    for (const m of samples) {
      expect(friendlyApiError({ message: m })).toBe(friendlyEsError(m));
    }
    /* 无 message 的对象 → String(e) 口径 */
    const plain = { foo: 1 };
    expect(friendlyApiError(plain)).toBe(friendlyEsError(String(plain)));
  });

  it('字符串入参与 null 安全：直接落降级路径', () => {
    expect(friendlyApiError('parsing_exception: bad')).toBe(friendlyEsError('parsing_exception: bad'));
    expect(friendlyApiError(null)).toBe(friendlyEsError(String(null)));
  });

  it('code 不在表中：降级走 message 翻译（未命中回退约定）', () => {
    expect(
      friendlyApiError({ code: 'NOT_IN_TABLE_561', message: 'index_closed_exception: closed' }),
    ).toBe(friendlyEsError('index_closed_exception: closed'));
  });

  it('存量零改动看守：KNOWN 表与 friendlyEsError 本体未被扰动（降级路径行为等值）', () => {
    /* friendlyEsError 原有约定锁样本（esError.spec 主域所有，这里只抽 2 条防误伤） */
    expect(friendlyEsError('index_not_found_exception: no such index [a]')).toContain('索引不存在');
    expect(friendlyEsError('HTTP 401')).toContain('登录凭证已失效');
  });
});

describe('F6 useNow hidden 短路（561）', () => {
  afterAll(() => { vi.useRealTimers(); });

  it('hidden=true 时 tick 短路（30s 频率约定不动，仅隐藏页跳过刷新）', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { useNow } = await import('../composables/useNow');
    const now = useNow();
    /* visible：tick 正常推进 */
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    vi.advanceTimersByTime(30_000);
    expect(now.value).toBe(1_030_000);
    /* hidden：跳过 */
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    vi.advanceTimersByTime(30_000);
    expect(now.value).toBe(1_030_000);
    /* 恢复可见：续走（步长恰等于周期时 fake timers 有边界 double-fire quirk，
       断不等式锁「继续推进」意图即可，短路本体由上一精确断言锁定） */
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    vi.advanceTimersByTime(30_000);
    expect(now.value).toBeGreaterThan(1_030_000);
  });

  it('源文本看守：tick 回调体内有 document.hidden 短路', () => {
    expect(src('composables/useNow.ts')).toContain('if (document.hidden) return;');
  });
});

describe('F1 CmdPalette forcemerge 同步语义（ES 7.10 不支持 wait_for_completion）', () => {
  const code = strip(src('components/CmdPalette.vue'));

  it('forcemerge URL 不再携带 ES 7.10 不支持的 wait_for_completion', () => {
    expect(code).toContain('_forcemerge?max_num_segments=1`');
    expect(code).not.toContain('wait_for_completion=false');
  });

  it('成功文案按同步语义「ForceMerge 已完成」', () => {
    expect(code).toContain('ForceMerge 已完成');
    expect(code).not.toContain('任务已提交(异步)');
  });

  it('不再编造异步「看任务」入口（同步 API 无 taskId）', () => {
    expect(code).not.toContain('看任务');
  });
});
