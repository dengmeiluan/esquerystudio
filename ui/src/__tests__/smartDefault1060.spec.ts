/* 1060：新条件默认字段——最近使用优先，否则按业务角色选查询入口，不再字母序撞 amount。 */
import { describe, it, expect, beforeEach } from 'vitest';
import { defaultLeafTarget, rememberRecentField, setFieldSearchIndex } from '../utils/fieldSearch';

beforeEach(() => { localStorage.clear(); setFieldSearchIndex(''); });

describe('1060 新条件智能默认字段', () => {
  it('优先主体/名称字段而非字母序第一个', () => {
    const fields = ['amount', 'created_at', 'company_name', 'status'];
    const types = { amount: 'double', created_at: 'date', company_name: 'keyword', status: 'keyword' };
    const t = defaultLeafTarget(fields, types, 'i');
    expect(t?.field).toBe('company_name');
    expect(t?.op).toBe('term');
  });

  it('无主体字段 → 正文/标题字段（text→match）', () => {
    const fields = ['amount', 'content'];
    const t = defaultLeafTarget(fields, { amount: 'double', content: 'text' }, 'i');
    expect(t?.field).toBe('content');
    expect(t?.op).toBe('match');
  });

  it('只有分类/编号/日期/数值 → 按角色序，object 容器不参与', () => {
    const fields = ['amount', 'created_at', 'doc_id', 'status', 'profile'];
    const types = { amount: 'double', created_at: 'date', doc_id: 'keyword', status: 'keyword', profile: 'object' };
    expect(defaultLeafTarget(fields, types, 'i')?.field).toBe('status');
    const idOnly = defaultLeafTarget(['amount', 'created_at', 'doc_id'], { amount: 'double', created_at: 'date', doc_id: 'keyword' }, 'i');
    expect(idOnly?.field).toBe('doc_id');
    const dateOnly = defaultLeafTarget(['amount', 'created_at'], { amount: 'double', created_at: 'date' }, 'i');
    expect(dateOnly?.field).toBe('created_at');
    expect(dateOnly?.op).toBe('range');
  });

  it('最近使用字段优先于角色推断', () => {
    rememberRecentField('idx-x', 'amount');
    const t = defaultLeafTarget(['amount', 'company_name'], { amount: 'double', company_name: 'keyword' }, 'idx-x');
    expect(t?.field).toBe('amount');
  });

  it('keyword 的 name/title 作为主体入口优先于 code/status', () => {
    const t = defaultLeafTarget(['code', 'name', 'status'], { code: 'keyword', name: 'keyword', status: 'keyword' }, 'i');
    expect(t?.field).toBe('name');
    expect(t?.op).toBe('term');
  });

  it('空字段 → null；仅容器 → 回退首个可查询字段', () => {
    expect(defaultLeafTarget([], {}, 'i')).toBeNull();
    expect(defaultLeafTarget(['profile'], { profile: 'object' }, 'i')?.field).toBe('profile');
  });
});
