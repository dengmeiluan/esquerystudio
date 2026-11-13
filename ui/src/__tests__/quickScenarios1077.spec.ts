/* 1069 续：债券/公告生产 mapping 的角色解析——分类词根不能冒充主体；
   正文关键词任务优先 content/body，而不是标题字段。 */
import { describe, it, expect } from 'vitest';
import { QUICK_TASKS, quickTaskDsl, resolveQuickTaskField, quickTaskAvailability, recommendQuickTasks, quickTaskBindingLabel } from '../utils/queryHub';
import { fieldRoleOf } from '../utils/fieldRole';
import type { FieldItem } from '../composables/useIndexFields';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BOND: FieldItem[] = [
  { path: 'announcement_title', type: 'text' },
  { path: 'content', type: 'text' },
  { path: 'issuer_name', type: 'keyword' },
  { path: 'issuer_type', type: 'keyword' },
  { path: 'issuer_code', type: 'keyword' },
  { path: 'bond_rating', type: 'keyword' },
  { path: 'publish_time', type: 'date' },
];
const task = (k: string) => QUICK_TASKS.find(t => t.k === k)!;

describe('1077 债券/公告字段角色', () => {
  it('分类词根优先：issuer_type 分类、issuer_name 主体、issuer_code 标识', () => {
    expect(fieldRoleOf('issuer_type', 'keyword')).toBe('category');
    expect(fieldRoleOf('issuer_name', 'keyword')).toBe('entity');
    expect(fieldRoleOf('issuer_code', 'keyword')).toBe('identifier');
    expect(fieldRoleOf('bond_rating', 'keyword')).toBe('category');
  });

  it('角色解析选真实字段：entity=issuer_name、text=content、category=bond_rating', () => {
    expect(resolveQuickTaskField(BOND, 'entity')).toBe('issuer_name');
    expect(resolveQuickTaskField(BOND, 'text')).toBe('content');
    expect(resolveQuickTaskField(BOND, 'category')).toBe('bond_rating');
    /* 只有主体属性分类时仍退回它，不因过滤而丢角色 */
    expect(resolveQuickTaskField([{ path: 'issuer_type', type: 'keyword' }], 'category')).toBe('issuer_type');
  });

  it('关键词每主体最新：关键词 + 近 90 天 + 按主体 collapse（三角色自动绑定）', () => {
    const r = quickTaskDsl(task('text-entity-latest'), ' 违约 ', BOND);
    expect(r.field).toBe('content · publish_time · issuer_name');
    const d = JSON.parse(r.dsl!);
    expect(d.query.bool.must[0].match.content).toBe('违约');
    expect(d.query.bool.must[1].range.publish_time.gte).toBe('now-90d/d');
    expect(d.collapse.field).toBe('issuer_name');
    expect(d.sort[0].publish_time.order).toBe('desc');
    const miss = quickTaskDsl(task('text-entity-latest'), 'x', [
      { path: 'content', type: 'text' }, { path: 'issuer_name', type: 'keyword' },
    ]);
    expect(miss.dsl).toBeUndefined();
    expect(miss.missing).toContain('date 字段');
  });

  it('双输入：主体 + 关键词 + 近 7 天（三角色绑定，两输入各自 trim）', () => {
    const r = quickTaskDsl(task('entity-text-recent'), ' 示例发行人 ', BOND, ' 违约 ');
    expect(r.field).toBe('issuer_name · content · publish_time');
    const d = JSON.parse(r.dsl!);
    expect(d.query.bool.must[0].term.issuer_name).toBe('示例发行人');
    expect(d.query.bool.must[1].match.content).toBe('违约');
    expect(d.query.bool.must[2].range.publish_time.gte).toBe('now-7d/d');
    expect(d.sort[0].publish_time.order).toBe('desc');
    const miss = quickTaskDsl(task('entity-text-recent'), 'x', [
      { path: 'issuer_name', type: 'keyword' }, { path: 'publish_time', type: 'date' },
    ], 'y');
    expect(miss.dsl).toBeUndefined();
    expect(miss.missing).toContain('text 字段');
  });

  it('主体近 7 天 / 正文关键词任务绑定正确字段', () => {
    const e = quickTaskDsl(task('entity-recent'), '示例发行人', BOND);
    expect(e.field).toBe('issuer_name · publish_time');
    const d = JSON.parse(e.dsl!);
    expect(d.query.bool.must[0].term.issuer_name).toBe('示例发行人');
    const t = quickTaskDsl(task('text-search'), '违约', BOND);
    expect(t.field).toBe('content');
    expect(JSON.parse(t.dsl!).query.match.content).toBe('违约');
  });
});


describe('1077 场景可用性自动判定', () => {
  it('完整 mapping：角色场景可用并回传绑定字段', () => {
    const a = quickTaskAvailability(task('entity-latest'), BOND);
    expect(a.available).toBe(true);
    expect(a.roles).toEqual({ entity: 'issuer_name', date: 'publish_time' });
    expect(quickTaskAvailability(task('entity-text-recent'), BOND).roles)
      .toEqual({ entity: 'issuer_name', text: 'content', date: 'publish_time' });
  });

  it('自动推荐：无输入、角色齐全的任务，覆盖多者优先，随 mapping 变化', () => {
    expect(recommendQuickTasks(BOND, 3).map(r => r.task.k)).toEqual(['entity-latest', 'recent-window', 'entity-top']);
    expect(recommendQuickTasks(BOND, 3).every(r => r.availability.available && !r.task.input)).toBe(true);
    const noDate = BOND.filter(f => f.path !== 'publish_time');
    expect(recommendQuickTasks(noDate, 3).map(r => r.task.k)).toEqual(['entity-top', 'category-top']);
  });

  it('绑定证据可读：角色→真实字段；缺角色给「缺：…」；无角色为空', () => {
    expect(quickTaskBindingLabel(task('entity-latest'), BOND)).toBe('主体/名称字段→issuer_name · date 字段→publish_time');
    expect(quickTaskBindingLabel(task('entity-latest'), BOND.filter(f => f.path !== 'publish_time'))).toBe('缺：date 字段');
    expect(quickTaskBindingLabel(task('by-id'), [])).toBe('');
  });

  it('缺角色：预判不可用并说明缺什么；无角色任务恒可用', () => {
    const noDate = BOND.filter(f => f.path !== 'publish_time');
    const a = quickTaskAvailability(task('entity-latest'), noDate);
    expect(a.available).toBe(false);
    expect(a.missing).toBe('date 字段');
    expect(quickTaskAvailability(task('entity-category-top'), noDate).available).toBe(true);
    const legacy = quickTaskAvailability(task('by-id'), []);
    expect(legacy).toEqual({ available: true, missing: '', roles: {} });
  });
});

describe('1077 双输入 UI 接线', () => {
  const src = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf-8');
  it('第二输入独立渲染；申请校验两输入；切任务清残留', () => {
    expect(src).toContain("const taskInput2 = ref('');");
    expect(src).toContain('v-model="taskInput2"');
    expect(src).toContain("if (t.input2 && !input2)");
    expect(src).toContain(':disabled="!taskInput.trim() || !taskInput2.trim() || !taskReady(t)"');
    expect(src).toContain("taskInput.value = ''; taskInput2.value = '';");
  });

  it('可用性预禁用 + 计数提示（按 mapping 自动匹配，不认业务字段名）', () => {
    expect(src).toContain('quickTaskAvailability(t, taskFields.fields.value)');
    expect(src).toContain('按当前 mapping 自动匹配');
    expect(src).toContain(':disabled="!taskReady(t)"');
    expect(src).toContain(":title=\"taskTitle(t)\"");
    expect(src).toContain(":class=\"{ 'qh-task-off': !taskReady(t) }\"");
  });

  it('推荐区按 mapping 自动生成，不改变完整目录顺序', () => {
    expect(src).toContain('recommendQuickTasks(taskFields.fields.value, 3)');
    expect(src).toContain('按当前 mapping 推荐');
    expect(src).toContain('v-for="r in recAuto"');
    expect(src).toContain('quickTaskBindingLabel(t, taskFields.fields.value)');
  });
});
