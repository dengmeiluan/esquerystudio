import type { Router } from 'vue-router';
import { getTarget } from '../api';
import { NAV_ITEMS } from '../router';
import { draftStorageKey } from '../composables/useScopedDraft';
import { writeStoredRaw, removeStoredRaw } from './safeJson';

/* 收藏重放统一真链路（收藏夹页 + 命令面板共用）。
 此前 dsl/rest 分支写的预填键没有任何视图消费，「打开」是假动作；
 且 SQL/Lucene/Bulk 等收藏全标 kind:rest，按 rest 重放必然空白。
 现按 tags 语义分发回源视图：一次性 carry 键 / 各视图既有 prefill 键 / 草稿键。 */

/* tags→重放去向（与下方 replayFavorite 分发逻辑同文件同源维护）。
 收藏卡片用它标注「打开」去哪个视图——重放前可预期，不用点了才知道。 */
export function replayTarget(it: { kind: string; tags?: string[]; payload?: any }): { path: string; label: string } {
  const tags: string[] = it.tags || [];
  /* 查询家族收敛进查询工作台（/search?mode=），重放直达对应模式 */
  if (it.kind === 'dsl') return { path: '/search', label: '查询工作台 · DSL' };
  if (it.kind === 'route') {
    /* ：「重放去向前置可见」在 route 类兑现——payload.path 才是真去向
 （replayFavorite 直推它），按 NAV_ITEMS 契约（esquerystudio-pages.json 唯一事实源）映射
 具体视图名；缺 path/未收录路径（旧重定向路由）回落泛化「视图跳转」不具假名 */
    const rp = it.payload?.path;
    const nav = typeof rp === 'string' ? NAV_ITEMS.find(n => n.path === rp.split('?')[0]) : undefined;
    return { path: '', label: nav ? nav.name : '视图跳转' };
  }
  if (it.kind === 'template') return { path: '/search', label: '查询工作台 · 沙盒' };
  /* DevTools 存藏标注回源视图（与下方 replayFavorite devtools 分支同源维护） */
  if (tags.includes('devtools')) return { path: '/devtools', label: 'Dev Tools' };
  if (tags.includes('sql')) return { path: '/search', label: '查询工作台 · ES-SQL' };
  if (tags.includes('lucene')) return { path: '/search', label: '查询工作台 · Lucene' };
  if (tags.includes('bulk')) return { path: '/bulk', label: 'Bulk 编辑器' };
  if (tags.includes('ubq') || tags.includes('dbq')) return { path: '/update-by-query', label: 'Update by Query' };
  if (tags.includes('reindex')) return { path: '/reindex-advanced', label: 'Reindex' };
  if (tags.includes('doc')) return { path: '/doc-diff', label: '文档 Diff' };
  return { path: '/rest', label: 'REST 直连' };
}

export function replayFavorite(
  it: { kind: string; payload?: any; tags?: string[] },
  router: Router,
  notify: (type: 'success' | 'warning', msg: string) => void,
  canOpen?: (path: string) => boolean,
) {
  const p = it.payload || {};
  const tags: string[] = it.tags || [];
  /* 重放前先过页面门：目标页不可见时不写 carry 键、不 push、不报「已恢复」，
     避免路由守卫跳到 /forbidden 而 toast 仍宣称成功。 */
  const dest = it.kind === 'route'
    ? (typeof p.path === 'string' && p.path ? p.path : '/overview')
    : replayTarget(it).path;
  if (canOpen && dest && !canOpen(dest)) {
    notify('warning', `当前身份无「${dest}」页面权限，已取消打开`);
    return;
  }
  /* payload 缺关键字段（旧格式/手工导入损坏）不再静默假成功——
 如实告知但仍跳到目标视图，现场可手动补全，不留死胡同 */
  const partial = (view: string) =>
    notify('warning', `收藏数据不完整（可能为旧版本格式），已带你到${view}，请手动补全后重新收藏`);
  switch (it.kind) {
    case 'dsl':
      /* 一次性 carry 键，DslQueryView onMounted 消费后即删（与实时镜像键分离） */
      writeStoredRaw(sessionStorage, 'esquerystudio.dsl.carry', typeof p === 'string' ? p : (p.body || JSON.stringify(p, null, 2)));
      if (p.index) writeStoredRaw(sessionStorage, 'esquerystudio.dsl.carry.index', p.index);
      router.push({ path: '/search', query: { mode: 'dsl' } });
      notify('success', 'DSL 已恢复至查询窗口');
      break;
    case 'rest':
      if (tags.includes('sql')) {
        if (p.sql) {
          writeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill', p.sql);
          /* 1086：SQL 收藏还原索引/参数现场——旧键先清，避免上一条 SQL 的上下文串到本条 */
          removeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.params');
          if (p.params) writeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.params', p.params);
          removeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.index');
          if (p.index) writeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.index', p.index);
          /* 1087：执行选项现场（时区/页超时/列式/宽容/取数）；旧收藏只有 fetchSize 时降级还原 */
          removeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.opts');
          const opts = p.opts && typeof p.opts === 'object' ? p.opts : (p.fetchSize ? { fetchSize: p.fetchSize } : null);
          if (opts) writeStoredRaw(sessionStorage, 'esquerystudio.sql.prefill.opts', JSON.stringify(opts));
          router.push({ path: '/search', query: { mode: 'sql' } });
          notify('success', 'SQL 已恢复并自动执行');
        } else { router.push({ path: '/search', query: { mode: 'sql' } }); partial('ES-SQL 控制台'); }
      } else if (tags.includes('lucene')) {
        if (p.q) writeStoredRaw(sessionStorage, 'esquerystudio.lucene.q', p.q);
        if (p.index) writeStoredRaw(sessionStorage, 'esquerystudio.lucene.index', p.index);
        /* 排序现场本就是 URL 状态，走 query 带齐——重放不再丢排序 */
        router.push({ path: '/search', query: { mode: 'lucene', ...(p.sortField ? { sort: p.sortField } : {}), ...(p.sortOrder ? { order: p.sortOrder } : {}) } });
        if (p.q || p.index) notify('success', 'Lucene 查询已恢复');
        else partial('Lucene 查询');
      } else if (tags.includes('bulk')) {
        if (p.body) {
          /* 改写一次性 carry 键（旧 esquerystudio.draft.bulk-editor.body 是草稿前的
 死命名空间，无消费方，恢复提示是假的）——BulkEditorView 挂载即消费并转入自身草稿 */
          writeStoredRaw(sessionStorage, 'esquerystudio.bulk.carry', p.body);
          router.push({ path: '/bulk', query: p.index ? { idx: p.index } : {} });
          notify('success', 'Bulk 操作体已恢复');
        } else { router.push({ path: '/bulk', query: p.index ? { idx: p.index } : {} }); partial('Bulk 编辑器'); }
      } else if (tags.includes('ubq') || tags.includes('dbq')) {
        /* 同理改 esquerystudio.ubq.carry（UpdateByQueryView 挂载消费，取 .query 入草稿） */
        const ok = !!(p.body && p.body.trim());
        if (ok) writeStoredRaw(sessionStorage, 'esquerystudio.ubq.carry', p.body);
        router.push({ path: '/update-by-query', query: { ...(p.index ? { idx: p.index } : {}), ...(p.mode ? { mode: p.mode } : {}) } });
        if (ok) notify('success', '查询体已恢复，执行前请再次核对');
        else partial('Update by Query');
      } else if (tags.includes('reindex')) {
        if (p.body) {
          writeStoredRaw(sessionStorage, 'esquerystudio.reindex-advanced.body', p.body);
          router.push('/reindex-advanced');
          notify('success', 'Reindex 配置已恢复');
        } else { router.push('/reindex-advanced'); partial('Reindex 配置页'); }
      } else if (tags.includes('doc')) {
        if (p.index && p.id) {
          /* 收藏时的编辑稿走一次性 carry 键带回——拉取最新版后自动恢复，正好落在 diff 对比区 */
          if (p.source) writeStoredRaw(sessionStorage, 'esquerystudio.doc-diff.carry.source', p.source);
          router.push({ path: '/doc-diff', query: { idx: p.index, id: p.id } });
          notify('success', '已定位文档，正在拉取最新版本');
        } else { router.push('/doc-diff'); partial('文档 Diff 编辑器'); }
      } else if (tags.includes('devtools')) {
        /* DevTools 存藏回源视图——写 -f 预填键（DevToolsView
 consumePrefill 统一消费=新标签装填 method/path/body），不再坠 /rest 通用兜底；
 实报「打开跳转无效+不自动填充」根因①（payload 缺失仍到 DevTools=partial 诚实） */
        const ok = !!(p.method || p.path);
        if (ok) {
          writeStoredRaw(sessionStorage, 'esquerystudio.devtools.open', JSON.stringify({
            title: (p.method || 'GET') + ' ' + (p.path || '/'),
            method: p.method || 'GET', path: p.path || '/', body: p.body || '',
          }));
        }
        router.push('/devtools');
        if (ok) notify('success', '请求已恢复至 Dev Tools 新标签');
        else partial('Dev Tools');
      } else {
        /* 通用 REST：写 草稿键，RestView 挂载即读 */
        /* 草稿：走 draftStorageKey（带集群目标维度），与 RestView 读取同键 */
        const restScope = { route: 'rest', target: () => getTarget() };
        writeStoredRaw(sessionStorage, draftStorageKey(restScope, 'method'), p.method || 'GET');
        if (p.path) writeStoredRaw(sessionStorage, draftStorageKey(restScope, 'path'), p.path);
        if (p.body) writeStoredRaw(sessionStorage, draftStorageKey(restScope, 'body'), p.body);
        router.push('/rest');
        if (p.path) notify('success', 'REST 请求已恢复');
        else partial('REST 直连');
      }
      break;
    case 'route':
      /* path 缺失防御——旧数据/手工导入可能无 path，push("undefined")
 会落 404；改回概览页并如实提示 */
      if (p.path && typeof p.path === 'string') {
        router.push(p.path);
        notify('success', '已跳转视图');
      } else {
        router.push('/overview');
        notify('warning', '该收藏缺少视图路径，已回概览页');
      }
      break;
    case 'template':
      writeStoredRaw(sessionStorage, 'esquerystudio.sandbox.body', typeof p === 'string' ? p : JSON.stringify(p, null, 2));
      router.push({ path: '/search', query: { mode: 'sandbox' } });
      notify('success', '模板已送到搜索沙盒');
      break;
  }
}
