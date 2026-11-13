/**
 * 1212：路由巡检发现的契约对齐守卫。
 *
 * 背景（可复现的现场）：我写的 mock 替身把 `/cluster/tasks` 返回成 ES 原生的
 * `{ nodes, tasks }` 包装对象，而**真实后端返回的是扁平 List**：
 *   InternalEsIndexRebuildController.clusterTasks(...) → List<Map<String,Object>>
 * TasksView 消费端写的是 `(raw || []).map(...)`，于是整页落到 catch，
 * 用户看到的是「(raw || []).map is not a function + 重试」。
 *
 * 这**不是产品缺陷**（真实后端契约正确、页面在真实契约下正常），但它暴露两个真问题：
 *  ① 测试替身可以与真实契约漂移，而没有任何门禁发现——巡检会把替身的 bug 报成产品的；
 *  ② 消费端的空值兜底 `(raw || [])` 只挡 null/undefined，不挡「形状变了」——
 *     契约一旦从 List 变成对象，整页崩而不是局部降级。
 *
 * 本 spec 锁 ①：把「后端返回 List」与「消费端按数组消费」两侧钉在一起。
 * 不锁 ②：全站只有 2 处这种写法，且后端契约在本仓库内闭合，
 * 为不存在的形状变化加运行时校验属于过度防御（见 AGENTS 的「只在校验边界验证」）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf-8');

const mockSrc = () => read('.tmp/browser/mock.mjs');

/* 1393：契约样例改读**受版本管理**的 fixture。
   原先这里直接 read('.tmp/browser/mock.mjs')，而 `.tmp/` 在 .gitignore 里——
   CI 上该文件根本不存在，两条用例以 ENOENT 报红（报的是「文件没有」，不是契约坏了）。
   现在样例落在 ui/src/__tests__/fixtures/tasksContract1212.json，
   CI 可读；mock 也从同一份读，替身与守卫不再各写一份。 */
const fixturePath = join(__dirname, 'fixtures', 'tasksContract1212.json');
const tasksFixture = () => JSON.parse(readFileSync(fixturePath, 'utf-8'));

describe('1212 /cluster/tasks 契约两侧对齐', () => {
  it('后端返回扁平 List（不是 { nodes, tasks } 包装）', () => {
    const java = read('modules/console/src/main/java/io/github/dengmeiluan/esquerystudio/console/web/InternalEsIndexRebuildController.java');
    /* 方法签名必须是 List<Map<String,Object>> —— 这是契约的唯一出处 */
    expect(java).toMatch(/@GetMapping\("cluster\/tasks"\)\s*\n\s*public java\.util\.List<Map<String, Object>> clusterTasks\(/);
  });

  it('前端按数组消费（(raw || []).map），与后端 List 一致', () => {
    const view = read('ui/src/views/TasksView.vue');
    expect(view).toMatch(/const raw = await api\.clusterTasks\(/);
    expect(view).toContain('tasks.value = (raw || []).map((t: any) => ({');
  });

  it('巡检替身样例是扁平数组（不是 { nodes, tasks } 包装）', () => {
    const data = tasksFixture();
    expect(Array.isArray(data), '样例必须是数组').toBe(true);
    expect(data.length).toBeGreaterThan(0);
    /* 每条记录都不许出现包装对象的键 */
    for (const row of data) {
      expect(row).not.toHaveProperty('nodes');
      expect(Array.isArray(row.tasks), '不许把 tasks 数组塞进记录里').toBe(false);
    }
  });

  it('样例里的任务字段与消费端读取的键同源（taskId/action/runningTimeNanos）', () => {
    const data = tasksFixture();
    const keys = new Set(data.flatMap((r: Record<string, unknown>) => Object.keys(r)));
    for (const key of ['taskId', 'action', 'runningTimeNanos', 'startTimeInMillis', 'description']) {
      expect(keys.has(key), `样例缺少 ${key}`).toBe(true);
    }
    /* 消费端确实读这两项（tookMs 折算依赖 runningTimeNanos） */
    const view = read('ui/src/views/TasksView.vue');
    expect(view).toContain('runningTimeNanos');
  });

  it('mock 与守卫读同一份样例（替身不许另写一份契约）', () => {
    /* mock.mjs 在 .gitignore 里，CI 上不存在——只在本地存在时才核这一条，
       缺失即跳过（不再 ENOENT 报假红）。 */
    let mock: string;
    try { mock = mockSrc(); } catch { return; }
    expect(mock, 'mock 必须从受版本管理的 fixture 读').toContain('tasksContract1212.json');
    expect(mock).toContain('TASKS_CONTRACT');
    /* 内联旧副本必须已经删掉——它不是契约出处 */
    expect(mock).not.toContain("indices:data/write/reindex', taskId: 'node-1:101'");
  });
});
