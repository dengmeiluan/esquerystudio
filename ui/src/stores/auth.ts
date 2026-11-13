import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api, setToken, clearToken, getToken, ioRecorder } from '../api';
import { canCap, canViewAllAudit, roleRank, type ConsoleCap } from '../utils/capability';
import { isReadonlyEsRequest, isPassthroughPath } from '../utils/passthroughScope';
import { removeStoredRaw, writeStoredRaw } from '../utils/safeJson';

/** 只读 POST 清单的段边界匹配（后端 ConsoleAuthInterceptor.isReadonlyPost 同源）：
 * kw 前是 / 或串首、kw 后是段尾（/ ? ; 或串尾；尾带 / 的 kw 天然段前缀）——
 * includes 会把 /cluster/counter-reset 等前缀内的新写端点静默认成只读。 */
export function matchReadonlyKeyword(path: string, kw: string): boolean {
  const prefixKw = kw.endsWith('/');
  let at = path.indexOf(kw);
  while (at >= 0) {
    const end = at + kw.length;
    /* kw 以 / 开头时前导 / 自身就是段分隔（/index/cluster/query 的 at-1 是 x 不是 /）；
       不以 / 开头才要求前一字符是段边界，防 /mycluster/query 命中 cluster/query。 */
    const prevOk = at === 0 || path.charAt(at - 1) === '/' || kw.charAt(0) === '/';
    const endOk = prefixKw
      || end === path.length
      || path.charAt(end) === '/' || path.charAt(end) === '?' || path.charAt(end) === ';';
    if (prevOk && endOk) return true;
    at = path.indexOf(kw, at + 1);
  }
  return false;
}

/** 控制台鉴权状态 —— token 持久在 localStorage，身份内存态 */
export const useAuthStore = defineStore('auth', () => {
  /** 当前身份（null=未登录/未知）；delegated=宿主委托鉴权（凭证归宿主管，不可退出/改密）；
 * displayName/authSource/attributes= 身份档案（宿主真实姓名与来源，顶栏产品化展示） */
  const me = ref<{
    username: string; role: string; fallback: boolean; hasAnyUser?: boolean; delegated?: boolean;
    displayName?: string | null; authSource?: string; attributes?: Record<string, string>;
    grantedPages?: string[] | null; // 2.5.0 菜单 SPI：null=未启用 / []=全拒 / 非空=白名单
    /** 环境页面模板（env → 页面 key 集）：与后端 EnvPagesResolver 同口径收缩菜单/按钮。 */
    envPages?: Record<string, string[]>;
    pages?: { groups: { id: string; name: string; sort: number; pages: { key: string; name: string; route: string; minVer?: string; apiPrefixes?: string[] }[] }[] }; // 页面目录契约（安全中心页面目录）
  } | null>(null);
  /** 是否需要弹登录遮罩 */
  const showLogin = ref(false);
  /** 鉴权是否启用（后端关了 auth 时 me 探测 404/放行，遮罩永不弹） */
  const probed = ref(false);
  /** 探测到后端明确关闭鉴权（/auth/me 404）。用于区分「未探测完成」与「无鉴权部署」。 */
  const authDisabled = ref(false);
  /* 是否提供内置账号登录（null=未知，按可用处理）：自定义授权器/宿主委托部署不展示本地表单。 */
  const builtinLogin = ref<boolean | null>(null);

  /* 代际守卫：并发 probe（iframe 首探与宿主 token 重探）乱序完成时只认最新一代——
 无凭证 401 若晚于有凭证 200 回来，旧代 catch 会把已认出的身份清回 null（grantedPages 随之失守） */
  let probeSeq = 0;
  let probeRetry: ReturnType<typeof setTimeout> | null = null;
  let probeRetryDelay = 3000;
  /* 身份探测是否已启动：应用启动即置位。未启动=独立挂载/组件测试（无鉴权语义）；
     一旦启动，身份未确定前写门必须 fail-closed，不能把开屏竞态窗口当无鉴权。 */
  const probeStarted = ref(false);
  const clearProbeRetry = () => {
    if (probeRetry) { clearTimeout(probeRetry); probeRetry = null; }
  };

  /** 身份已确定：明确关闭鉴权（404）、已取得 me，或探测尚未启动。其余一律 fail-closed。 */
  const identityKnown = () => authDisabled.value || me.value != null || !probeStarted.value;
  /** 应用 setup 同步调用：子视图挂载前就进入“探测中”，关闭开屏 fail-open 窗口。 */
  const beginProbe = () => { probeStarted.value = true; };
  /** raw/管理域入口：ADMIN/无鉴权部署/独立挂载测试放行；探测中或探测失败一律关闭。 */
  const canAdminOps = () => authDisabled.value || isAdmin() || !probeStarted.value;

  /** 上一登录用户（localStorage）：换人时清掉上一用户的请求草稿/历史，防同标签页串数据。 */
  const LAST_USER_KEY = 'esquerystudio.last-user';
  const USER_STATE_PREFIXES = [
    /* DevTools/REST 草稿与历史（旧命名空间 + draft2 新命名空间覆盖全部视图 route） */
    'es_devtools_', 'esquerystudio.devtools.', 'es_rest_hist', 'esquerystudio.draft2:',
    /* 收藏/查询历史/保存的搜索/命令面板最近使用 */
    'esquerystudio.favorites.v1', 'es_query_hist_v2', 'es_query_saved', 'es_cmd_recent',
    /* 一次性 carry/预填键：换人后自动回填上一用户的载荷（部分入口还会自动执行） */
    'esquerystudio.dsl.', 'esquerystudio.bulk.', 'esquerystudio.ubq.', 'esquerystudio.doc-diff.',
    'esquerystudio.reindex-advanced.', 'esquerystudio.sql.', 'esquerystudio.lucene.',
    'esquerystudio.sandbox.', 'esquerystudio.pit.', 'esquerystudio.rebuild-paste',
    'esquerystudio.search-templates.carry', 'esquerystudio.flame.',
    'esquerystudio.lifecycle.rollover', 'esquerystudio.link.',
    /* 旧命名空间的历史/列宽/字段记忆/监控快照/健康报告/作业已读位：同样是账号视角产物 */
    'es_dsl:', 'es_query_hist', 'es_cols:', 'es_tbl_', 'es_recent_idx', 'es_picked',
    'esquerystudio_qb_field_recent', 'esquerystudio.live.snapshot:',
    'esquerystudio.healthReport.archive.v1', 'esquerystudio.jobs.seen',
    /* 目标选择是账号可见性产物：换人不清零，残留目标会以 X-Es-Target 毒化
       数据面请求（对不可见连接必 403）——管理面已在 api 层剥头，这里兜数据面。 */
    'esquerystudio.target', 'esquerystudio.target.name',
    /* 通知历史/已读位/工作现场是账号视角产物：换人不清零，x3 的历史里会躺着
       x1 的「已切到 es_excel_conn」、恢复提示会把 x1 的现场弹给 x3（产线实报）。 */
    'esquerystudio.notify.log', 'esquerystudio.notify.seen', 'esquerystudio.last-route',
    /* 查询工作台会话/深链自动执行、字段词项持久档、建树暂存、SQL 桥预填、健康报告快照、
       变量编辑器内容、确认「不再提示」：都是上一身份的工作现场/决定，不能跨账号沿用。 */
    'esquerystudio.qw.session:', 'esquerystudio_terms_stash', 'esquerystudio.qb.subtree',
    'esquerystudio.pref.sqlbridge.sql', 'esquerystudio.health-report.last', 'es_vars',
    'es_confirm_skip:',
    /* 账号切换审计补齐（1008）：SQL 位置参数原文、DSL 请求级参数、查询沙盒 body、
       大屏全屏意图——都是上一账号的查询现场，换人后不得回填/沿用。
       1100 续：`esquerystudio.pref.sql.*` 整族（timeZone/pageTimeout/columnar/fetchSize/
       lenient/aggChartOpen）同样是执行口径——换人后沿用上一账号的时区会让日期列与
       cursor 续页口径错位，仅保护 `.params` 一个键不够。 */
    'esquerystudio.pref.sql.', 'esquerystudio.pref.dq.req.', 'ss_dsl_body',
    'esquerystudio.live.',
  ];
  function purgeUserRequestState() {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        const keys: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k) keys.push(k);
        }
        for (const k of keys) {
          if (USER_STATE_PREFIXES.some(p => k === p || k.startsWith(p))) removeStoredRaw(storage, k);
        }
      } catch { /* 存储不可用：无残留可清 */ }
    }
  }
  function purgeIfUserChanged(username?: string | null) {
    if (!username) return;
    let prev = '';
    try { prev = localStorage.getItem(LAST_USER_KEY) || ''; } catch { /* 存储不可用 */ }
    if (prev !== username) {
      /* prev 为空同样清理：升级/手工清键后，磁盘里可能仍躺着上一个身份的数据。
         清理后广播，让内存态 Pinia store 同步归零（只清存储不够：singleton ref 会在
         下一次写入时把旧账号的收藏/历史又落回磁盘）。 */
      purgeUserRequestState();
      try {
        window.dispatchEvent(new CustomEvent('esquerystudio:identity-changed',
          { detail: { username } }));
      } catch { /* 非浏览器/派发失败：内存重置由 App.vue 的 username watcher 兜底 */ }
    }
    writeStoredRaw(localStorage, LAST_USER_KEY, username);
  }

  /** 启动探测：有 token 或后端放行则拉身份；401 由全局事件弹遮罩 */
  async function probe() {
    probeStarted.value = true;
    const seq = ++probeSeq;
    clearProbeRetry();
    try {
      const m = await api.auth.me();
      if (seq !== probeSeq) return; // 已有更新一代在飞/完成，旧代结果丢弃
      purgeIfUserChanged(m?.username);
      me.value = m;
      authDisabled.value = false;
      probeRetryDelay = 3000;
      // 认出身份即收遮罩：iframe 握手竞态下首次 probe 的 401 可能把遮罩顶出来，重探成功要能自愈
      if (me.value) showLogin.value = false;
    } catch (e: any) {
      if (seq !== probeSeq) return;
      // 401 已由 api.ts 广播 esquerystudio:unauthorized；404 需二次确认（下方）
      me.value = null;
      /* 404 可能是「无鉴权部署」（/auth 控制器未装配），也可能是代理/版本错配。
         必须由 setup/status 明确报告 authEnabled=false 才放开写门；否则 fail-closed。 */
      if (e?.status === 404 || e?.status === 401) {
        try {
          const s = await api.setup.status();
          if (seq !== probeSeq) return;
          authDisabled.value = s.authEnabled === false;
          if (typeof (s as any).builtinLogin === 'boolean') {
            builtinLogin.value = (s as any).builtinLogin;
          }
        } catch {
          if (seq !== probeSeq) return;
          authDisabled.value = false;
        }
      } else {
        authDisabled.value = false;
      }
      /* 非 401/404 的瞬时失败（500/网络/超时）不能让有权限的人永久锁死：
         指数退避重探，身份一到即恢复；期间所有写门保持 fail-closed。 */
      if (!authDisabled.value && e?.status !== 401) {
        const delay = probeRetryDelay;
        probeRetryDelay = Math.min(probeRetryDelay * 2, 30000);
        probeRetry = setTimeout(() => {
          probeRetry = null;
          if (seq === probeSeq && me.value == null && !authDisabled.value) void probe();
        }, delay);
      }
    } finally {
      if (seq === probeSeq) probed.value = true;
    }
  }

  async function login(username: string, password: string) {
    const r = await api.auth.login(username, password);
    /* 先换令牌再触发换人清理：purge 会同步广播 identity-changed，App.vue 随即重启
       jobTracker/liveMonitor 轮询。旧顺序（先 purge 后 setToken）让新账号的轮询带着
       上一账号的令牌/授权跑第一拍（x3 登录后能看到 x1 的在跑作业/告警）。 */
    setToken(r.token);
    invalidateIdentity(); /* 旧 me/grantedPages 立即失效；身份落地前写门 fail-closed */
    purgeIfUserChanged(r.username);
    ioRecorder.clear(); /* 前一个会话的请求原文不得留给新登录用户 */
    me.value = { username: r.username, role: r.role, fallback: r.fallback };
    authDisabled.value = false;
    showLogin.value = false;
    // 登录成功后补拉一次完整身份（含 hasAnyUser）
    probe();
    return r;
  }

  /**
   * 凭证换发/401：旧身份授权立即失效，直到新一代 probe 落地。
   * 只认身份、不清请求原文（换发不是换人）；期间的写门因 me=null 而 fail-closed。
   */
  function invalidateIdentity() {
    probeSeq++; /* 作废在飞/待重试的身份探测，旧回包不得把旧授权填回 */
    clearProbeRetry();
    me.value = null;
  }

  /** 宿主登出/跨标签登出：立即清掉上一账号的工作现场并广播内存重置。
   *  此时没有新身份可探测（probe 只会 401），不能等「下一次登录的 purgeIfUserChanged」——
   *  共享工作站上旧草稿/目标/词项会在登录遮罩背后继续留在磁盘。 */
  function purgeLocalUserState() {
    purgeUserRequestState();
    /* 用户名本身也是上一账号痕迹：登出后不留在共享工作站的 localStorage 里。
       下一账号登录时 prev='' 同样触发一次清理（幂等）。 */
    removeStoredRaw(localStorage, LAST_USER_KEY);
    ioRecorder.clear();
    /* 连接目录 → env 模板映射是上一账号的连接可见性产物：残留会让新账号按旧 env
       判页面（该拦的放行、该放的误拦）。 */
    connEnvById.value = {};
    try {
      window.dispatchEvent(new CustomEvent('esquerystudio:identity-changed', { detail: { username: '' } }));
    } catch { /* 非浏览器/派发失败：内存重置由调用方兜底 */ }
  }

  function logout() {
    /* 先尽力通知服务端吊销当前令牌：请求在途/失败都不阻塞、不影响本地清理
       （服务端不可达也要能登出），令牌头在发车前快照，随后才 clearToken。 */
    void api.auth.logout().catch(() => { /* 吞错：吊销失败不阻断登出 */ });
    probeSeq++; /* 作废在飞/待重试的身份探测，避免退出后又被旧回包填回 me */
    clearProbeRetry();
    clearToken();
    /* 内置登录的本地登出同样要清工作现场：此前只清 me/token，草稿/目标/历史留在
       磁盘到下一次登录才清——共享工位登出后仍可被后来者读到上一账号查询原文。 */
    purgeLocalUserState();
    me.value = null;
    showLogin.value = true;
  }

  function requireLogin() {
    /* 401 到达即撤旧授权：遮罩背后不得继续用上一份 grantedPages 发写。 */
    invalidateIdentity();
    showLogin.value = true;
    // 401 瞬时竞态自愈：本机有 token（宿主委托/本地登录态）时自动重探一次身份——
    // probe 成功即收遮罩；probe 仍 401 则遮罩保持。杜绝「token 已恢复但遮罩无人收回，
    // 透明拦截层挡死整页交互」的残留形态（托管重建 settings/mapping 不可编辑的真凶）。
    if (getToken()) void probe();
  }

  /** 2.5.0 页面级授权白名单（三态）。路由守卫 / SideNav 过滤 / App.vue 复核共用同一真源。 */
  const grantedPages = computed<readonly string[] | null>(() => {
    const gp = me.value?.grantedPages;
    return Array.isArray(gp) ? gp : null;
  });

  /* 连接环境（来自连接目录）→ 该环境的页面模板（来自 /auth/me.envPages）。
     环境模板是后端 EnvPagesResolver 的页集封顶：前端菜单/按钮必须同口径收缩，
     否则会出现「菜单说能进、端点 403」的假入口（或反向误拦）。 */
  const connEnvById = ref<Record<string, string>>({});
  function setConnEnvs(list: ReadonlyArray<{ id?: string; env?: string | null }>) {
    const out: Record<string, string> = {};
    for (const c of list || []) {
      if (!c?.id || !c?.env) continue;
      out[String(c.id)] = String(c.env).trim().toUpperCase();
    }
    connEnvById.value = out;
  }
  const envPagesMap = computed<Record<string, Set<string>> | null>(() => {
    const raw = me.value?.envPages;
    if (!raw || typeof raw !== 'object') return null;
    const out: Record<string, Set<string>> = {};
    for (const k of Object.keys(raw)) {
      const pages = (raw as Record<string, unknown>)[k];
      out[String(k).trim().toUpperCase()] = new Set(
        Array.isArray(pages) ? pages.map(p => String(p)) : []);
    }
    return Object.keys(out).length ? out : null;
  });
  /** 当前目标连接的环境模板是否开放 pageKey（未配置模板/未知环境=不收缩）。 */
  const envAllows = (pageKey: string, targetId?: string | null): boolean => {
    const templates = envPagesMap.value;
    if (!templates || !pageKey) return true;
    const tid = !targetId || String(targetId).toLowerCase() === 'host' ? 'host' : String(targetId);
    const env = connEnvById.value[tid];
    if (!env) return true;
    const tpl = templates[env];
    return tpl === undefined ? true : tpl.has(pageKey);
  };

  const isAdmin = () => me.value?.role === 'ADMIN';
  /* 环境封顶与实际角色无关：ADMIN 不受页面白名单约束，但要受「这个连接是生产库」约束。
     后端 ConsoleAuthInterceptor.envCapViolation 同口径（该判定在 ADMIN 豁免之前）。
     判不出页面归属时返回 null = 不封顶，避免把 keys/indices 这类基础读误拦掉。 */
  const envCapOf = (pageKey: string | null | undefined, targetId?: string | null): string | null =>
    !pageKey || envAllows(pageKey, targetId) ? null : pageKey;
  /* 连接元数据可见性：ADMIN/未启用鉴权/静态键模型看全部；conn 模型只看授权连接，防未授权连接名/host 外泄 */
  const canSeeConn = (connId: string): boolean => {
    if (!identityKnown()) return false; /* 探测中/探测失败：连接名也不外泄 */
    if (me.value == null || isAdmin()) return true;
    const gp = me.value.grantedPages;
    if (!Array.isArray(gp)) return true;
    if (gp.length === 0) return false; /* 空集=全拒：连连接名也不外泄 */
    /* 静态键是全局页授权（对所有连接生效），混入 conn 键时不能反过来把静态覆盖的连接藏掉 */
    if (gp.some(g => !g.startsWith('conn:'))) return true;
    return gp.some(g => g.startsWith('conn:' + connId + ':'));
  };
  /* 能力门禁统一入口（镜像后端拦截器 rank 语义）——危险按钮「不展示」都走 can()，
 语义真源在 utils/capability.ts；安全边界始终在后端，这里是体验层防误点。
 分层兜底：me=null（后端未启用鉴权/身份未探测到）→ 全放行——无鉴权部署全功能可用的既有语义不破
 （有鉴权但未登录时整卡被 LoginOverlay 遮罩拦截，此放行不可达）；me 有值但 role 无法识别 →
 capability 内 fail-closed 按 VIEWER。 */
  const can = (cap: ConsoleCap) => {
    if (!identityKnown()) return false;
    return me.value == null ? true : canCap(me.value.role, cap);
  };
  const canAuditAll = (targetId?: string | null) => me.value != null
    && canViewAllAudit(me.value.role) && canReadPage('security', targetId);
  /* 页面读可见性（不含角色档）：路由/菜单按页面 key 判可见，审计全量另叠 rank3。
     与后端 effectivePages 同口径：静态键全局、conn:{tid}: 键按目标、w: 键同可见。 */
  const canReadPage = (pageKey: string, targetId?: string | null) => {
    if (!identityKnown()) return false;
    if (me.value == null || isAdmin()) return true;
    const gp = me.value.grantedPages;
    if (!Array.isArray(gp)) return true;
    if (gp.length === 0) return false;
    /* system/config-drift 恒定执行在宿主；REST 写键可执行 DevTools 端点，页面入口同口径可见。 */
    const hostPage = pageKey === 'system' || pageKey === 'config-drift';
    const tid = hostPage
      ? 'host'
      : (!targetId || String(targetId).toLowerCase() === 'host' ? 'host' : targetId);
    /* security 页的审计读是 host-scope：顶栏选中连接时，conn:host:security
       仍应打开安全中心（后端 pageScope 同口径，行级只看 host 事件）。 */
    /* 静态 security 页同样回退到宿主 scope（后端 pageScope 取 host 有效页集）；
       目标 env 排除 security 时，这段 fallback 仍让宿主审计入口可见。 */
    const hostSecurity = pageKey === 'security'
      && (gp.includes('security')
        || gp.includes('conn:host:security') || gp.includes('conn:host:w:security'));
    /* 环境模板按实际授权作用域收缩：静态/目标连接授权走目标 env，host security 走宿主。 */
    const direct = gp.includes(pageKey)
      || gp.includes('conn:' + tid + ':' + pageKey)
      || gp.includes('conn:' + tid + ':w:' + pageKey);
    if (direct && envAllows(pageKey, tid)) return true;
    /* DevTools 由 w:rest 打开时按 rest 页收缩（env 只开放 rest 时 DevTools 仍可达）。 */
    if (pageKey === 'devtools' && gp.includes('conn:' + tid + ':w:rest')
        && envAllows('rest', tid)) return true;
    return hostSecurity;
  };

  /* 表格文档写门（{@code /cluster/doc*} 共享端点）：
     conn 模型只认 search/indices/doc-diff 三个归属页的精确 w: 键；混合模型静态页键回落到
     「页可见 + 角色档」。此前「该目标有任意 w: 键即放行」会把 optimizer/aliases 写键
     误当成文档写权（按钮露出、后端 403）。browser 只有文档读面，不参与写。 */
  const canWriteOn = (targetId: string | null | undefined): boolean => {
    if (!identityKnown()) return false; /* 身份未定：写入口不展示 */
    if (isAdmin()) return true; /* 超管全局写权：不受连接写键缺失拖累 */
    const gp = grantedPages.value;
    if (Array.isArray(gp) && gp.length === 0) return false; /* 空集=全拒 */
    const tid = !targetId || String(targetId).toLowerCase() === 'host' ? 'host' : String(targetId);
    const docPages = ['search', 'indices', 'doc-diff'];
    if (!Array.isArray(gp) || gp.length === 0) return can('write');
    return docPages.some(p => envAllows(p, tid) && (
      gp.includes('conn:' + tid + ':w:' + p) || (gp.includes(p) && can('write'))));
  };

  /* 页面级连接感知门——conn 模型下「勾选即权限」，本页写键(conn:{tid}:w:{pageKey})
 在场即放行（镜像后端页面门 writeAllowed 精确键语义）；静态模型（grantedPages=null）与
 非连接上下文回落全局角色档 canCap；admin 是管理域（连接菜单无对应勾选项）不走连接分支。 */
  const canPage = (cap: ConsoleCap, pageKey: string, targetId: string | null | undefined) => {
    if (!identityKnown()) return false;
    if (me.value == null) return true;
    if (isAdmin()) return true; /* 超管全局页面权：页面白名单/连接键不拖累 */
    const gp = me.value.grantedPages;
    if (Array.isArray(gp) && gp.length === 0) return false; /* 空集=全拒 */
    const isConn = Array.isArray(gp) && gp.some(g => g.startsWith('conn:'));
    const hostPage = pageKey === 'system' || pageKey === 'config-drift';
    const tid = hostPage
      ? 'host'
      : (!targetId || String(targetId).toLowerCase() === 'host' ? 'host' : targetId);
    const envOk = envAllows(pageKey, tid);
    if (isConn && cap !== 'admin') {
      /* 混合模型：conn 写键优先；静态页键回落到「可见 + 角色档」（后端同序）。 */
      return envOk && (gp!.includes('conn:' + tid + ':w:' + pageKey)
        || (gp!.includes(pageKey) && canCap(me.value.role, cap)));
    }
    /* 静态页面白名单：页面可见性 + 角色档双闸（后端页面门/角色门同序），
       不能只按角色放行而在点下去时才 403。 */
    if (Array.isArray(gp) && gp.length > 0) {
      return envOk && gp.includes(pageKey) && canCap(me.value.role, cap);
    }
    return canCap(me.value.role, cap);
  };

  /* 集群级动作（ILM start/stop、全集群 reroute retry）的 rank 门镜像
     （后端 CLUSTER_SCOPE_WRITE_KEYWORDS）：连接模型下页面写键短路角色门，但这些动作作用于
     目标集群全局——rank2 的 OPERATOR 即使持 w:lifecycle 也只能做 rollover/move。
     放行通道与后端同序：rank3+ 或该连接的 w:cluster-settings（集群设置页=集群级语义）；
     静态/内置模型由端点角色档（ops=rank3）裁决，本函数对它们恒真。 */
  const canClusterScope = (targetId?: string | null) => {
    if (!identityKnown()) return false;
    if (me.value == null) return true;
    if (roleRank(me.value.role) >= 3) return true;
    const gp = me.value.grantedPages;
    if (!Array.isArray(gp) || !gp.some(g => g.startsWith('conn:'))) return true;
    const tid = !targetId || String(targetId).toLowerCase() === 'host' ? 'host' : String(targetId);
    return gp.includes('conn:' + tid + ':w:cluster-settings');
  };

  /* 端点级单一权限入口——用 me.pages 下发的 apiPrefixes 镜像后端 pageOf
 （最长前缀匹配→归属页），conn 模型按精确 conn:{tid}:w:{pageKey} 裁决；未命中（共享
 端点）按任意写键；静态模型回落 canCap；admin 管理域不走连接分支。视图只传按钮真实
 调用的端点路径，零 pageKey 硬编码（586 错位根治）。 */
  /* 963：与后端 ConsoleAuthInterceptor.isReadonlyPost 对齐——sql 关键词去尾斜杠（裸 /cluster/sql 也命中）；
     insight/settings-impact 为只读评估端点新增入册 */
  /* painless/execute 不在列：可执行脚本按写档裁决（后端 READONLY_POST_KEYWORDS 同源） */
  /* insight/actions/{id}/estimate|dry-run 也不在列：estimate 会签发 confirmToken（写意图），
     必须与 execute 同档，否则连接模型的页写键授权标记不会置位，有权限的人反被动作 minRole 拦下。 */
  const READONLY_POST_KEYWORDS = ['/cluster/query', '/cluster/profile', '/cluster/count', '/cluster/search-dsl', '/cluster/search-raw', '/cluster/search-template', '/cluster/render-template', '/cluster/validate-query', '/cluster/explain-doc', '/cluster/allocation-explain', '/cluster/analyze', '/cluster/reindex-preview', '/cluster/sql', '/cluster/pit/', '/insight/settings-impact'];
  /* 963：共享写端点 → 合法页面写键（与后端 ConsoleAuthInterceptor.SHARED_WRITE_PAGES 同源）。
     原先“任意写键”放行会让 optimizer 写键持有人删文档/取消任务/改 ILM 策略。 */
  const SHARED_WRITE_PAGE_KEYS: Record<string, string[]> = {
    '/cluster/doc/update': ['search', 'indices', 'doc-diff'],
    '/cluster/doc': ['search', 'indices', 'doc-diff'],
    '/cluster/update-document': ['search', 'indices', 'doc-diff'],
    '/cluster/update-partial': ['search', 'indices', 'doc-diff'],
    '/cluster/delete-by-id': ['search', 'indices'],
    '/cluster/delete-by-query': ['search', 'update-by-query'],
    '/cluster/tasks/cancel': ['tasks', 'task-tree'],
    '/cluster/ilm/policy': ['ilm'],
    '/cluster/ilm/move': ['ilm', 'lifecycle'],
    '/cluster/index-settings/update': ['index-settings', 'indices', 'optimizer'],
    /* 热 Setting 的两入口必须同页集（后端 SHARED_WRITE_PAGES 同源）：原先只认 mapping 页，
       index-settings/indices/optimizer 的写键持有人点保存会被 403。 */
    '/cluster/update-settings': ['mapping', 'index-settings', 'indices', 'optimizer'],
    '/cluster/reload-analyzers': ['analysis-settings', 'synonyms'],
    '/cluster/reroute': ['cluster-settings'],
    /* retry-failed 是 reroute 的子集：cluster-settings 写键本就能任意 reroute，
       不许它做更窄的 retry 就是口径倒挂（后端 SHARED_WRITE_PAGES 同源）。 */
    '/cluster/reroute/retry-failed': ['diag', 'cluster-settings'],
    /* ilm/start|stop 是集群级开关，与 cluster-settings 页同级（rank 档位另由 canClusterScope 把守） */
    '/cluster/ilm/start': ['lifecycle', 'cluster-settings'],
    '/cluster/ilm/stop': ['lifecycle', 'cluster-settings'],
    '/cluster/create-index': ['config-validator', 'indices'],
    '/cluster/alias-actions': ['aliases', 'config-validator', 'indices'],
    '/cluster/scripts/put': ['search-templates', 'painless-lab'],
    '/cluster/scripts/delete': ['search-templates', 'painless-lab'],
    '/cluster/painless/execute': ['painless-lab'],
    '/cluster/devtools/execute': ['rest', 'devtools'],
    '/mcp/keys': ['devtools'],
    '/insight/actions/apply-index-settings': ['index-settings', 'indices', 'optimizer'],
  };
  /* 共享端点匹配必须落在段边界：apply-index-settings 不得命中 apply-index-settings-extra。 */
  const sharedPathMatches = (path: string, key: string): boolean => {
    let i = path.indexOf(key);
    while (i >= 0) {
      const end = i + key.length;
      if (end === path.length || path[end] === '/' || path[end] === '?') return true;
      i = path.indexOf(key, i + 1);
    }
    return false;
  };
  const sharedWritePageKeys = (path: string): string[] | null => {
    const clean = String(path || '').split('?')[0].split('#')[0];
    let best: string[] | null = null;
    let bestLen = -1;
    for (const [frag, keys] of Object.entries(SHARED_WRITE_PAGE_KEYS)) {
      if (sharedPathMatches(clean, frag) && frag.length > bestLen) { best = keys; bestLen = frag.length; }
    }
    return best;
  };
  /* 共享读端点 → 归属页读键（与后端 SHARED_READ_PAGES 同源）。 */
  const SHARED_READ_PAGE_KEYS: Record<string, string[]> = {
    '/cluster/query': ['search', 'indices', 'analyzer-lab'],
    '/cluster/search-dsl': ['search', 'profile-flame', 'update-by-query'],
    '/cluster/search-template': ['search-templates'],
    '/cluster/search-raw': ['search', 'indices', 'browser', 'analyzer-lab', 'update-by-query', 'bulk', 'doc-diff', 'boost-tuner', 'rank-debug', 'score-explain', 'match-matrix', 'query-xray', 'profile-flame'],
    '/cluster/profile': ['search', 'indices'],
    '/cluster/count': ['search', 'indices'],
    '/cluster/explain-doc': ['rank-debug', 'search', 'indices'],
    '/mcp/keys': ['devtools'],
    '/cluster/validate-query': ['query-xray', 'search'],
    '/cluster/term-vectors': ['query-xray'],
    '/cluster/doc': ['search', 'indices', 'browser', 'doc-diff'],
    '/cluster/inspect': ['indices', 'mapping', 'search', 'config-validator', 'adhoc-rebuild'],
    '/cluster/ilm/explain': ['ilm', 'lifecycle'],
    '/cluster/ilm/policies': ['ilm', 'lifecycle'],
    '/cluster/templates': ['templates', 'templates-gallery'],
    '/cluster/shards': ['overview', 'indices', 'topology'],
    '/cluster/task-detail': ['tasks', 'task-tree', 'workspace'],
    '/cluster/remote-clusters': ['remote-clusters', 'workspace'],
    '/cluster/sql': ['search', 'workspace'],
    '/cluster/health-report': ['health-report', 'workspace'],
    '/insight/settings-impact': ['index-settings', 'optimizer'],
    '/monitor-metrics': ['overview', 'live'],
    '/monitor-history': ['overview', 'live'],
    '/monitor-alerts': ['overview', 'live'],
    '/ring-usage': ['overview', 'topology', 'live'],
    '/cluster/tasks': ['tasks', 'task-tree'],
    '/cluster/index-settings': ['index-settings', 'indices', 'optimizer'],
    '/cluster/index-settings-defaults': ['mapping', 'index-settings', 'indices', 'optimizer'],
    '/cluster/aliases': ['aliases', 'indices', 'browser'],
    '/cluster/scripts': ['painless-lab', 'search-templates'],
    '/cluster/mapping-detail': ['mapping', 'mapping-designer', 'indices', 'analyzer-lab', 'search', 'browser', 'doc-diff'],
    '/cluster/analysis-settings': ['analysis-settings', 'analyze', 'mapping', 'synonyms'],
    '/cluster/nodes-stats-brief': ['topology', 'overview', 'live'],
    '/cluster/shard-stores': ['topology', 'indices', 'overview'],
    '/cluster/analyze': ['analyze', 'analyzer-lab', 'analysis-settings'],
    '/es/index/keys': ['xmigrate'],
    '/desired-state': ['config-drift', 'adhoc-rebuild', 'indices', 'mapping'],
    '/desired-state.html': ['config-drift', 'adhoc-rebuild', 'indices', 'mapping'],
    '/mapping-reconcile/report': ['config-drift', 'indices', 'mapping'],
    '/progress': ['indices', 'update-by-query', 'reindex-advanced', 'search', 'tasks', 'task-tree', 'adhoc-rebuild'],
    '/xmigrate/progress': ['xmigrate'],
    '/internal/es/index/health': ['overview', 'diag', 'health-report'],
  };
  const sharedReadPageKeys = (path: string): string[] | null => {
    const clean = String(path || '').split('?')[0].split('#')[0];
    let best: string[] | null = null;
    let bestLen = -1;
    for (const [frag, keys] of Object.entries(SHARED_READ_PAGE_KEYS)) {
      if (sharedPathMatches(clean, frag) && frag.length > bestLen) { best = keys; bestLen = frag.length; }
    }
    return best;
  };
  /* 写端点角色档镜像（与后端 ConsoleAuthInterceptor 的 ADMIN/REBUILD/CLUSTER 关键词同源）。
     守卫只用于「请求发车前」拦截；漏项只会让守卫更宽松，有权限的人不会被误拦，
     后端 rank 门仍是最终边界。 */
  const ADMIN_WRITE_HINTS = ['/auth/users', '/cluster/raw', '/cluster/devtools/execute', '/setup/rebind', '/clusters/'];
  const OPS_WRITE_HINTS = [
    '/rebuild', '/first-migrate', '/full-reload', '/cleanup', '/abort',
    '/lock/release', '/force-merge', '/replicas',
    '/cluster/update-by-query', '/cluster/bulk', '/reindex-advanced',
    '/xmigrate/start', '/xmigrate/resume', '/xmigrate/abort',
    '/xmigrate/connect-check', '/xmigrate/fetch-config', '/xmigrate/resolve-preview', '/xmigrate/preflight',
    'adhoc-rebuild/start', 'adhoc-rebuild/abort', 'adhoc-rebuild/confirm-switch',
    /* 取消在途 reindex/UBQ/force-merge 任务与重建中止同族，提档与 abort 对齐（后端同源） */
    '/cluster/tasks/cancel',
    '/cluster/delete-index', '/cluster/create-index', '/cluster/delete-by-id', '/cluster/delete-by-query',
    '/cluster/settings/put', '/cluster/reroute', '/cluster/reroute/retry-failed',
    '/cluster/alias-actions', '/cluster/rollover',
    '/cluster/templates/put', '/cluster/templates/delete', '/cluster/scripts/put', '/cluster/scripts/delete',
    '/cluster/snapshot/delete', '/cluster/snapshot/restore', '/cluster/snapshot/create',
    '/cluster/ilm/policy', '/cluster/ilm/move', '/cluster/ilm/start', '/cluster/ilm/stop', '/cluster/slm/execute',
    '/cluster/index-settings/update', '/cluster/update-settings',
    '/cluster/mapping-put', '/cluster/put-mapping', '/cluster/analysis-update',
    '/cluster/synonyms-upsert', '/cluster/reload-analyzers',
  ];
  const BOOTSTRAP_WRITE_HINTS = ['/auth/login', '/auth/logout', '/auth/change-password', '/setup/test', '/setup/apply'];
  const capForWritePath = (path: string): ConsoleCap => {
    if (ADMIN_WRITE_HINTS.some(h => path.includes(h))) return 'admin';
    if (OPS_WRITE_HINTS.some(h => path.includes(h))) return 'ops';
    return 'write';
  };
  /* 最长前缀匹配端点归属页（与后端 pageOf 同口径） */
  const pageOwnerOf = (path: string): string | null => {
    /* 查询串/锚点不参与归属判定：调用方可能把实际调用路径（含 ?index=）直接传进来 */
    const clean = String(path || '').split('?')[0].split('#')[0];
    const pages = me.value?.pages?.groups?.flatMap(g => g.pages) ?? [];
    let best: { key: string; len: number } | null = null;
    for (const p of pages) for (const pre of (p.apiPrefixes ?? [])) {
      const hit = pre.endsWith('/') ? clean.startsWith(pre) : (clean === pre || clean.startsWith(pre + '/'));
      if (hit && pre.length > (best?.len ?? 0)) best = { key: p.key, len: pre.length };
    }
    return best?.key ?? null;
  };
  /* 恒定作用于宿主集群的端点（镜像后端 isHostBoundPath）：
     只有 /cluster/**、/insight、config-lab/validate、迁移进度与 adhoc prepare/start 跟随目标；
     其余 provider/系统/概览读取都执行在宿主，授权目标必须按 host 判定。 */
  const isHostBoundPath = (path: string): boolean => {
    if (path.includes('/cluster/') || path.includes('/insight')
        || path.includes('/config-lab/validate') || path.endsWith('/internal/es/index/progress')
        || path.includes('/adhoc-rebuild/')) return false;
    if (path.includes('/monitor-metrics') || path.includes('/monitor-history')
        || path.includes('/monitor-alerts') || path.includes('/ring-usage')) return false;
    if (path.endsWith('/es/index/keys') || path.includes('/desired-state')
        || path.includes('/mapping-reconcile/report')) return false;
    if (path.includes('/clusters') || path.includes('/xmigrate/') || path.includes('/setup/')) return false;
    /* 本地账号管理是宿主控制面数据；审计流水仍按目标连接行级过滤。 */
    if (path.includes('/auth/')) return path.includes('/auth/users');
    return true;
  };
  const canEndpoint = (cap: ConsoleCap, method: string, path: string, targetId: string | null | undefined) => {
    if (!identityKnown()) return false;
    if (me.value == null) return true;
    /* 委派身份（含委派 ADMIN）不得写本地账号——先于 isAdmin() 豁免，与后端
       BuiltinConsoleAuthService.forbidDelegatedLocalUserWrite 同口径。放在能力层而不是
       单个视图中：任何按此能力渲染的入口都自动同源，不会再冒出第二个「亮着必失败」的钮。 */
    if (me.value.delegated && String(path || '').includes('/auth/users')
        && String(method || 'GET').toUpperCase() !== 'GET') return false;
    /* 环境封顶先于 ADMIN 豁免（后端 envCapViolation 同序）：ADMIN 不受页面白名单约束，
       但要受「当前连接是生产库」约束。判不出页归属时 envCapOf 返回 null → 不封顶。 */
    if (isAdmin()) {
      const cleanPath = String(path || '').split('?')[0].split('#')[0];
      /* host-bound 端点恒在宿主执行，不吃连接 env 模板（后端 isHostBoundPath 同口径）。
         实测：当前这些自举路径即便去掉本行也会因「判不出页归属」而放行，所以它是
         **防御性**的——防的是 pageCatalog 将来给某个自举端点挂上页前缀后，
         PROD 视图把 /auth/me 之类封掉、让人失去自助能力。 */
      if (isHostBoundPath(cleanPath)) return true;
      const tid = (!targetId || String(targetId).toLowerCase() === 'host') ? 'host' : String(targetId);
      const ownerKey = pageOwnerOf(cleanPath);
      if (ownerKey) return envCapOf(ownerKey, tid) == null;
      /* 无页前缀的复用端点（raw / devtools / sql…）落在共享表：任一归属页在模板内即可 */
      const sharedKeys = sharedWritePageKeys(path) || sharedReadPageKeys(path)
        /* raw 透传只列在 ADMIN_WRITE_HINTS（角色专属，无 conn 写键形态），共享表里没有它；
           它的页面语义就是「DevTools/REST 写」。漏掉这条会让 PROD 连接上 raw 仍然亮着。 */
        || (cleanPath.includes('/cluster/raw') ? ['devtools', 'rest'] : null);
      if (sharedKeys && sharedKeys.length) return sharedKeys.some(k => envAllows(k, tid));
      return true;
    }
    const gp = me.value.grantedPages;
    if (Array.isArray(gp) && gp.length === 0) return false; /* 空集=全拒：与后端 isEmpty 分支同源 */
    const isConn = Array.isArray(gp) && gp.some(g => g.startsWith('conn:'));
    /* 静态页白名单：纯静态模型与「conn 键 + 静态键」混合模型都保留全局页授权。
       混合模型下静态写权 = 静态页键在场 + 角色档（后端 staticWriteAllowed 同语义）。 */
    const staticKeys = Array.isArray(gp) ? gp.filter(k => !k.startsWith('conn:')) : [];
    const staticPages = staticKeys.length > 0 ? new Set(staticKeys) : null;
    /* host/缺省目标同样走连接写键：conn 用户不得因未带目标头落回全局角色门写宿主；
       与后端 ConsoleAuthInterceptor 的 targetId=host 归一化同源。host-bound 端点强制 host。 */
    const cleanPath = String(path || '').split('?')[0].split('#')[0];
    const gateTarget = isHostBoundPath(cleanPath) ? 'host' : targetId;
    const tid = !gateTarget || String(gateTarget).toLowerCase() === 'host' ? 'host' : gateTarget;
    /* 963：只读 POST=清单命中 或 后端三条精确尾缀（index/query、index/system-query、探活 probe）——
       尾缀端点无页归属，误判写会走精确写键把读动作也拦掉。
       988：清单命中改段边界匹配（后端 isReadonlyPost 同源）——kw 前是 / 或串首、kw 后是
       段尾（/ ? ; 串尾；尾带 / 的 kw 天然段前缀），防 includes 把前缀内的未来新写端点
       静默认成只读 */
    const writeReq = method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD'
      && !READONLY_POST_KEYWORDS.some(kw => matchReadonlyKeyword(cleanPath, kw))
      && !cleanPath.endsWith('/index/query') && !cleanPath.endsWith('/index/system-query') && !cleanPath.endsWith('/probe');
    if (writeReq) {
      /* 写语义：共享映射优先（多页合法复用的端点，任一归属页写键即放行）；
         未登记共享写再走页前缀精确写键。 */
      const sharedPages = sharedWritePageKeys(path);
      if (sharedPages) {
        /* env 模板按页收缩：共享端点任一“可写且环境开放”的归属页即可放行。 */
        if (isConn) return sharedPages.some(k => gp!.includes('conn:' + tid + ':w:' + k) && envAllows(k, tid))
          || (!!staticPages && sharedPages.some(k => staticPages.has(k) && envAllows(k, tid))
              && canCap(me.value.role, cap));
        if (staticPages) {
          return sharedPages.some(k => staticPages.has(k) && envAllows(k, tid))
            && canCap(me.value.role, cap);
        }
        return canCap(me.value.role, cap);
      }
      const owner = pageOwnerOf(path);
      if (owner) {
        const envOk = envAllows(owner, tid);
        if (isConn) {
          return envOk && (gp!.includes('conn:' + tid + ':w:' + owner)
            || (!!staticPages && staticPages.has(owner) && canCap(me.value.role, cap)));
        }
        if (staticPages) return envOk && staticPages.has(owner) && canCap(me.value.role, cap);
        return canCap(me.value.role, cap);
      }
      /* 护栏动作 fail-closed（与后端 1031 同口径）：动态 actionId 未经共享写映射登记
         一律拒绝——不得借角色档回落漏进静态/混合模型（配置漂移在客户端也拦下）。 */
      if (path.startsWith('/insight/actions/')) return false;
      /* 连接模型默认拒绝「无页面归属」的写端点：与后端未登记写默认拒绝同源，
         不能让未登记的端点回落全局角色档（否则 UI 会显示一个后端必 403 的入口）。
         混合模型有静态全局页授权时，按纯静态语义回落角色门（后端 hasStatic 同口径）。 */
      return isConn ? (staticPages ? canCap(me.value.role, cap) : false) : canCap(me.value.role, cap);
    }
    const sharedRead = sharedReadPageKeys(path);
    if (isConn) {
      /* conn 模型读也要过页面可见性：后端 effectivePages 先裁页面，再落到角色门。
         混入的静态键同样视为可见（后端 effectivePages 同口径；env 收缩在服务端执行）。 */
      const staticKeys = gp!.filter(k => !k.startsWith('conn:'));
      const visibleOn = (keys: string[]) => keys.some(k => envAllows(k, tid)
        && (staticKeys.includes(k)
          || gp!.includes('conn:' + tid + ':' + k) || gp!.includes('conn:' + tid + ':w:' + k)));
      if (sharedRead) return visibleOn(sharedRead);
      const owner = pageOwnerOf(path);
      /* 与后端 pageScope 同口径：host-scope security 审计在连接目标下仍可读；
         静态 security 页也回退宿主 scope（后端 hostPages 回退包含静态键）。 */
      if (owner === 'security'
          && (gp!.includes('security')
            || gp!.includes('conn:host:security') || gp!.includes('conn:host:w:security'))) {
        return true;
      }
      return owner == null ? true : visibleOn([owner]);
    }
    if (sharedRead) {
      if (staticPages) return sharedRead.some(k => staticPages.has(k) && envAllows(k, tid));
      return true;
    }
    const owner = pageOwnerOf(path);
    if (staticPages && owner) {
      /* security 读端点在目标 env 排除该页时仍可按宿主 scope 回退（后端 pageScope 同口径）。 */
      if (owner === 'security' && staticPages.has('security')) return true;
      return staticPages.has(owner) && envAllows(owner, tid);
    }
    return true;
  };

  /**
   * 透传端点（raw / devtools）的**写**能力：写键或 ADMIN。
   * 与后端共享写门同源——这才是「能执行内层写请求」的判据。
   */
  const canPassthroughWrite = (path: string, targetId: string | null | undefined) => {
    if (!identityKnown()) return false;
    /* me=null（后端未启用鉴权/身份未落地）全放行——与 can()/canEndpoint 同口径；
       有鉴权但未登录时整卡被 LoginOverlay 遮罩，此放行不可达。 */
    if (me.value == null) return true;
    if (isAdmin()) return true;
    const gp = grantedPages.value;
    if (Array.isArray(gp) && gp.length === 0) return false;
    const clean = String(path || '').split('?')[0].split('#')[0];
    const tid = !targetId || String(targetId).toLowerCase() === 'host' ? 'host' : String(targetId);
    /* raw 有页面归属（rest 页），devtools 走共享表：两个来源都要认，与后端同口径。 */
    const keys = sharedWritePageKeys(clean) || (pageOwnerOf(clean) ? [pageOwnerOf(clean)!] : null)
      || (clean.includes('/cluster/raw') ? ['devtools', 'rest'] : null);
    if (!keys || !keys.length) return false;
    const isConn = Array.isArray(gp) && gp.some(g => g.startsWith('conn:'));
    if (!isConn) {
      /* 静态模型：归属页可见 + 角色达写档。
         grantedPages=null（SPI 未启用）没有白名单可查——与 canEndpoint / canPage 同口径
         回落全局角色档；此前直接 gp!.includes 会在这里空指针，把整个视图 setup 打崩。 */
      if (!Array.isArray(gp)) return canCap(me.value?.role, capForWritePath(clean));
      const owner = keys.find(k => gp.includes(k));
      return !!owner && envAllows(owner, tid)
        && canCap(me.value?.role, capForWritePath(clean));
    }
    return keys.some(k => envAllows(k, tid) && gp!.includes('conn:' + tid + ':w:' + k));
  };

  /**
   * 透传端点的**读**能力：读键、写键或 ADMIN。
   *
   * <p>宿主给 {@code conn:{id}:devtools} 读键，即可执行内层只读请求——外层是 POST
   * 不等于内层是写，按外层整段封死会让只读身份连 GET 都发不出。写仍走
   * {@link canPassthroughWrite}。</p>
   */
  const canPassthroughRead = (path: string, targetId: string | null | undefined) => {
    if (!identityKnown()) return false;
    if (isAdmin()) return true;
    if (canPassthroughWrite(path, targetId)) return true;
    const gp = grantedPages.value;
    if (Array.isArray(gp) && gp.length === 0) return false;
    const clean = String(path || '').split('?')[0].split('#')[0];
    const tid = !targetId || String(targetId).toLowerCase() === 'host' ? 'host' : String(targetId);
    const keys = sharedWritePageKeys(clean) || (pageOwnerOf(clean) ? [pageOwnerOf(clean)!] : null)
      || (clean.includes('/cluster/raw') ? ['devtools', 'rest'] : null);
    if (!keys || !keys.length) return false;
    const isConn = Array.isArray(gp) && gp.some(g => g.startsWith('conn:'));
    if (!isConn) {
      /* 静态模型没有读写键之分（宿主只给页授权，不给 w: 变体）：
         保持既有 admin 档语义，与后端 staticSharedWrite→角色门同口径。
         读/写键之分只存在于连接模型。 */
      return canEndpoint('admin', 'POST', clean, targetId);
    }
    /* 读键（不带 w:）也算：只读授权正是内层只读请求的通行证。 */
    return keys.some(k => envAllows(k, tid)
      && (gp!.includes('conn:' + tid + ':' + k) || gp!.includes('conn:' + tid + ':w:' + k)));
  };

  /**
   * 透传端点「按内层真实方法」的执行能力。
   * 内层只读 → 读键即可；内层写 → 必须写键。未识别（非透传端点）回落原有写门。
   */
  const canExecutePassthrough = (innerMethod: string, innerPath: string,
                                  endpoint: string, targetId: string | null | undefined) => {
    if (isReadonlyEsRequest(innerMethod, innerPath)) return canPassthroughRead(endpoint, targetId);
    return canPassthroughWrite(endpoint, targetId);
  };

  /**
   * API 层写门（api.request 在 fetch 前调用）：未授权写请求零发出。
   * 自助/引导写（登录/退出/改密/setup）与只读 POST 不拦；后端仍是最终边界。
   */
  const canEmitWrite = (method: string, path: string, targetId: string | null | undefined) => {
    const m = String(method || 'GET').toUpperCase();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
    const clean = String(path || '').split('?')[0].split('#')[0];
    if (BOOTSTRAP_WRITE_HINTS.some(h => clean.includes(h))) return true;
    /* 透传端点的内层方法在请求体里，这里只能看到外层 POST。整段按写拦会把只读身份
       的只读请求一并挡住；真正的读/写分档由后端按内层 method 裁决，
       客户端只在**明显无权**时提前拦截：读写都不行才拒。 */
    if (isPassthroughPath(clean)) {
      return canPassthroughRead(clean, targetId);
    }
    /* MCP key 自助管理是 DevTools 页的读能力，不是数据面写：
       后端 McpKeyController 只用 requireDevtoolsPage(principal, false)（读授权）并再按
       owner/ADMIN 裁决；客户端若按普通 POST 写门要求 w:devtools，会把「有 DevTools 读
       但无写」的本人 key 签发/轮换直接拦在 fetch 之前（实报：张飞翔账号签发失败）。 */
    if (sharedPathMatches(clean, '/mcp/keys')) return canReadPage('devtools', targetId);
    /* 用户管理/重绑是授权载体本身：后端始终要求 ADMIN（系统管理域先于页面门），
       conn:{tid}:w:security 不得在客户端把请求发车。初始化窗口（me 尚未认出）仍放行，
       否则首次绑定会被自己的客户端门拦住。 */
    /* 委派身份（含委派 ADMIN，产线 deng_test_x2 即 role=ADMIN + delegated=true）一律不得写
       本地账号——先于角色判断，与 BuiltinConsoleAuthService.forbidDelegatedLocalUserWrite 同口径。
       旧顺序在 isAdmin() 处放行，请求会发出但必被后端拒绝，形成「点亮即失败」的假入口。 */
    if (clean.includes('/auth/users') && me.value?.delegated) return false;
    if (clean.includes('/auth/users') && !isAdmin()
        && (me.value != null || (probeStarted.value && !authDisabled.value))) return false;
    if ((clean.endsWith('/setup/apply') || clean.endsWith('/setup/test') || clean.endsWith('/setup/rebind'))
        && me.value != null && !isAdmin()) return false;
    /* 与后端同源特例：托管重建向导「校验并继续」持 adhoc 写键即可调用
       config-lab/validate，不额外要求 config-validator 页。 */
    if (clean.endsWith('/config-lab/validate')
        && canEndpoint('ops', 'POST', '/internal/es/index/adhoc-rebuild/start', targetId)) return true;
    return canEndpoint(capForWritePath(clean), m, clean, targetId);
  };

  /* 跨标签页身份同步：另一标签换人/退出后，本页旧 grantedPages 必须立即失效；
     新 token 到达即作废旧身份并重探，身份落地前写门 fail-closed。 */
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== 'esquerystudio.auth.token') return;
      invalidateIdentity();
      void probe();
    });
  }

  return { me, showLogin, probed, authDisabled, builtinLogin, probeStarted, beginProbe, canAdminOps, probe, login, logout, purgeLocalUserState, requireLogin, invalidateIdentity, isAdmin, canSeeConn, grantedPages, can, canWriteOn, canPage, canEndpoint, canEmitWrite, canReadPage, canAuditAll, canClusterScope, canPassthroughRead, canPassthroughWrite, canExecutePassthrough, setConnEnvs, envAllows };
});
