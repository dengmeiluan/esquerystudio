// 571 批：friendlyApiError 12 码接线收尾（561b 遗留，状态档案②待办 5）。
// 561 约定单源 utils/esError.ts friendlyApiError（鸭子类型读 ApiError.code 命中 12 码人话表；
// api.ts 533 批起 code 随错误体透传），但三高频消费面 AdhocRebuild/Xmigrate/Snapshots 的
// catch 仍走旧口径 friendlyEsError(String(e?.message ?? e))——只按 message 子串猜语义，
// 后端 {code,message} 结构化错误体命中不了约定文案（LOCK_CONFLICT/STAGE_GUARD/CONN_* 等）。
// 三视图全量接线：锁1=import friendlyApiError；锁2=旧口径调用形态清零；
// 锁3=行为锚（ApiError 同构对象命中码表；真 ApiError 类 import 会拖 api.ts 副作用，
// 鸭子类型同构对象与 esErrorCode561 同款）。
// 措辞纪律（先例 568-C1）：锁2 的 not.toContain 串不得在本文件注释外出现于实现注释。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { friendlyApiError } from '../utils/esError';

const views = ['AdhocRebuildView', 'XmigrateView', 'SnapshotsView'];
const readView = (n: string) => readFileSync(join(__dirname, '..', 'views', `${n}.vue`), 'utf-8');

describe('friendlyApiError 三消费面接线（571）', () => {
  it.each(views)('%s: import friendlyApiError（561 单源接线）', (n) => {
    expect(readView(n)).toContain('friendlyApiError');
  });

  it.each(views)('%s: 旧口径调用形态清零（升级为 code 优先单源）', (n) => {
    expect(readView(n)).not.toContain('friendlyEsError(String(e?.message ?? e))');
  });

  it('行为锚：ApiError 同构对象（code+message）命中 12 码表人话', () => {
    expect(friendlyApiError({ code: 'LOCK_CONFLICT', message: 'index locked by job' })).toContain('锁定');
    expect(friendlyApiError({ code: 'CONN_FORBIDDEN', message: 'denied' })).toContain('权限');
  });

  it('行为锚：无 code 的普通 Error 走降级路径（与旧口径逐字等值，零回归面）', () => {
    const m = 'index_not_found_exception: no such index [idx-x]';
    expect(friendlyApiError(new Error(m))).toBe(friendlyApiError({ message: m }));
  });
});
