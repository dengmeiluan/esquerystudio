import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, getTarget, setTargetId } from '../api';
import type { ClusterConnView } from '../api';
import type { IndexCat } from '../types';
import { friendlyEsError } from '../utils/esError';
import { copyText } from '../utils/format';
import { verLt } from '../utils/version';
import { readUrlHostTheme } from '../utils/hostTheme';
import type { HostThemeMode } from '../utils/hostTheme';
import { writeStoredRaw, removeStoredRaw } from '../utils/safeJson';
import { useAuthStore } from './auth';

export const useAppStore = defineStore('app', () => {
  /* 索引 */
  const indices = ref<IndexCat[]>([]);
  const pickedIdx = ref<string>(localStorage.getItem('es_picked') || '');
  const loadingIndices = ref(false);
  const clusterOk = ref<boolean | null>(null);
  const clusterSelf = ref('');
  /* 真实集群健康色（green/yellow/red，空=未知）——侧栏底栏不再用「连接成功」冒充「集群正常」 */
  const clusterHealth = ref<string>('');
  const clusterUnassigned = ref(0);

  /* 世代守卫：懒载口/切连接口可并发入列，每拍入列即取得唯一落案权（拍序捕获前移到
 首个 await 之前）——切集群后旧集群的慢回包不得把索引清单/健康面写进新集群上下文；
 互斥裸闸不可用：会吞掉 setTarget 切连接的新拍 */
  let indicesSeq = 0;
  async function loadIndices() {
    const seq = ++indicesSeq;
    await ensureSetup();
    if (seq !== indicesSeq) return false; // 已有更新拍入列：本拍整拍作废
    // .2：宿主隐藏且尚未选中连接：不发数据面请求（后端会 403 HOST_DISABLED），保持未知态等引导
    if (!hostVisible.value && !target.value) {
      indices.value = [];
      clusterOk.value = null;
      clusterHealth.value = '';
      loadingIndices.value = false;
      return false;
    }
    loadingIndices.value = true;
    try {
      const list = await api.clusterIndices();
      if (seq !== indicesSeq) return false; // 旧拍迟到：清单/健康面/版本识别整拍丢弃
      indices.value = Array.isArray(list) ? list : [];
      clusterOk.value = true;
      loadVersion(); // 连接成功后顺带识别版本，供导航级能力降级标注
      /* 宿主概览恒定执行在 host：目标连接用户无宿主 overview 页授权时不发这段必 403 的请求。 */
      const gp = useAuthStore().grantedPages;
      const canHostOverview = useAuthStore().isAdmin() || gp == null || gp.includes('overview')
        || gp.includes('conn:host:overview') || gp.includes('conn:host:w:overview');
      if (canHostOverview) api.overview().then(o => { clusterSelf.value = o?.self || ''; }).catch(() => {});
      api.clusterHealth().then((h: any) => {
        clusterHealth.value = h?.status || '';
        clusterUnassigned.value = Number(h?.unassigned_shards || 0);
      }).catch(() => { clusterHealth.value = ''; });
      if (indices.value.length && pickedIdx.value && !indices.value.some(i => i.index === pickedIdx.value)) {
        /* 1036：跨集群残留 picked 清空（产线实报「切换集群连接的时候，索引选择信息没有
           置空」——带着 A 集群的索引名查 B 集群全是 index_not_found）。清单非空时不在
           清单=当前集群不可查（别名也会在清单里），置空并提示；清单为空（加载失败）
           不误清。 */
        const gone = pickedIdx.value;
        pick('');
        notify('info', `索引「${gone}」不在当前集群，已清空选择——请在顶栏重新选索引`);
      }
      /* 1039 续：目标未变（不触发 setTarget）但视图级「上次索引」记忆已跨集群失效的
         启动场景——按同一清单校验逐键清理（通配符模式保留；加载失败不误清）。 */
      if (indices.value.length) {
        for (const k of TARGET_INDEX_KEYS) {
          const v = localStorage.getItem(k);
          if (v && !v.includes('*') && !indices.value.some(i => i.index === v)) {
            removeStoredRaw(localStorage, k);
          }
        }
      }
      return true;
    } catch (e: any) {
      if (seq !== indicesSeq) return false; // 旧拍失败同样丢弃：不得改写新拍成功面
      if (e?.status === 401) {
        // 未登录导致的 401：登录遮罩已在引导，不误报“集群连接失败”，保持未知态
        clusterOk.value = null;
      } else if (e?.status === 403) {
        // 无页面授权≠集群故障：同样保持未知态——不发「连接失败」横幅/红点/弹窗，
        // 禁用屏与侧栏的授权指引已在讲同一件事（产线实报：零授权用户开屏即见
        // 「集群连接失败，部分功能不可用」+ 加载索引列表失败，全是噪声）
        clusterOk.value = null;
        clusterHealth.value = '';
      } else {
        clusterOk.value = false;
        clusterHealth.value = '';
        notify('error', '加载索引列表失败: ' + (e?.message || e));
      }
      return false;
    } finally {
      if (seq === indicesSeq) loadingIndices.value = false;
    }
  }

  /* 最近工作索引（最多 8 个）——顶栏选择器与 ⌘K 置顶展示，大集群免翻找 */
  const RECENT_KEY = 'es_recent_idx';
  const recentIdx = ref<string[]>(loadRecent());
  function loadRecent(): string[] {
    try {
      const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(a) ? a.filter(x => typeof x === 'string') : [];
    } catch { return []; }
  }

  function pick(idx: string) {
    pickedIdx.value = idx;
    writeStoredRaw(localStorage, 'es_picked', idx);
    if (idx) {
      recentIdx.value = [idx, ...recentIdx.value.filter(x => x !== idx)].slice(0, 8);
      writeStoredRaw(localStorage, RECENT_KEY, JSON.stringify(recentIdx.value));
    }
  }

  const pickedInfo = computed(() => indices.value.find(i => i.index === pickedIdx.value));

  /* 多集群目标——''=宿主；非空= connId（api 层自动带 X-Es-Target 头）
 列表已按登录角色过滤 minRole（低于档案门槛的连接后端直接不返回），并附 health 探活结果
 .2：hostVisible=false（纯管理平台形态）时切换器藏掉宿主项，无目标时自动映射首个可见连接 */
  const target = ref<string>(getTarget());
  const targetName = ref<string>(localStorage.getItem('esquerystudio.target.name') || '');
  /* w45:双键撕裂自愈——id 与 name 是两个独立 localStorage 键,部分清理/异常可致
 「顶栏显示生产集群、实际请求不带 X-Es-Target(打宿主)」的撕裂态,这是用户
 「明明选了生产还报宿主侧错误」的系统性根源之一。恢复时以 id 为准,name 必须依附 id。 */
  if (!target.value && targetName.value) {
    targetName.value = '';
    removeStoredRaw(localStorage, 'esquerystudio.target.name');
  }
  const conns = ref<ClusterConnView[]>([]);
  const isRemote = computed(() => !!target.value);
  const hostVisible = ref(true);
  let setupPromise: Promise<void> | null = null;
  /* setup/status 免鉴权且启动期多处依赖：单飞行缓存，失败保持默认 true 零回归 */
  function ensureSetup(): Promise<void> {
    if (!setupPromise) {
      setupPromise = api.setup.status()
        .then(s => { hostVisible.value = s.hostVisible !== false; })
        .catch(() => {});
    }
    return setupPromise;
  }
  /* 世代守卫（loadIndices indicesSeq 同构）：启动链/切换器增删后/登录后/懒载口
 可并发入列，回包乱序时旧拍整拍丢弃——迟到旧快照不得覆写清单，也不得在陈旧快照上
 走回落链（把刚选的新目标误判「已删除」强制切回） */
  let connsSeq = 0;
  async function loadConns() {
    const seq = ++connsSeq;
    await ensureSetup();
    if (seq !== connsSeq) return; // 已有更新拍入列：本拍整拍作废
    try {
      const list = await api.clustersList();
      if (seq !== connsSeq) return; // 旧拍迟到：清单与回落链整拍丢弃
      conns.value = Array.isArray(list) ? list : [];
    } catch (e: any) {
      if (seq !== connsSeq) return; // 旧拍失败同样丢弃：不得清空新拍成功清单
      /* 失败不清空既有清单：清空会让侧栏与切换器同时变空，用户无法区分
         「网络/后端故障」「连接被删」还是「自己被撤权」——三者处置完全不同。
         保留上次结果 + 明确告警，是本文件 loadIndexes 既有范式。
         无页面授权的 403 只落通知历史不弹（开屏噪声，授权指引屏已在讲）。 */
      notify('warning', '连接目录加载失败：' + (e?.message || e) + '（已保留上次结果，可稍后重试）',
        { logOnly: e?.status === 403 });
    }
    /* 连接环境是 env 页面模板的前端收缩依据：目录与 /auth/me.envPages 合流，
       菜单/按钮必须与后端 effectivePages 同口径（否则出现必 403 的假入口）。 */
    useAuthStore().setConnEnvs(conns.value);
    // 目标档案已被删：回落避免死绑不存在的 connId 全站报错（宿主隐藏时回落首个可见连接而非宿主）。
    // 回落全静默：可能是跨账号残留目标（换号后按域共享），也可能是连接真被删——
    // 「已删除」对权限场景是错误表述（产线实报被当脏数据），顶栏切换器如实呈现回落结果。
    if (target.value && !conns.value.some(c => c.id === target.value)) {
      if (hostVisible.value) {
        setTarget('', '');
      } else {
        const first = conns.value[0];
        setTarget(first?.id || '', first?.name || '');
      }
    } else if (!hostVisible.value && !target.value && conns.value.length) {
      // .2 自动映射：宿主隐藏且未选目标，默认选中首个可见连接，免去手动切一次
      const first = conns.value[0];
      setTarget(first.id, first.name);
    }
  }
  /* 1039：按视图记忆的「上次索引」是目标域产物（dsl/lucene/sandbox/sql/flame 各自
     记住上一集群的索引名）——切集群不清零，视图预填旧集群索引名 = index_not_found
     类（产线实报「切换集群连接的时候，索引选择信息没有置空」）。setTarget 与跨标签
     同步两条路径统一走这里清。 */
  const TARGET_INDEX_KEYS = [
    'esquerystudio.dsl.index', 'esquerystudio.dsl.carry.index', 'esquerystudio.lucene.index',
    'esquerystudio.sandbox.index', 'esquerystudio.sql.prefill.index', 'esquerystudio.flame.index',
  ];
  function clearTargetIndexMemory() {
    /* sql.prefill.index 在 sessionStorage（SqlConsoleView 会话域），其余在 localStorage */
    for (const storage of [localStorage, sessionStorage]) {
      for (const k of TARGET_INDEX_KEYS) removeStoredRaw(storage, k);
    }
  }

  function setTarget(id: string, name: string) {
    target.value = id;
    targetName.value = id ? name : '';
    setTargetId(id);
    writeStoredRaw(localStorage, 'esquerystudio.target.name', targetName.value);
    pick(''); // 切集群后旧 picked 索引大概率不存在，清空避免误导
    recentIdx.value = []; // ：最近索引同理随集群失效，避免跨集群误导
    removeStoredRaw(localStorage, RECENT_KEY);
    clearTargetIndexMemory();
    esVersion.value = ''; // 版本随目标失效，等 loadIndices 成功后重新识别
    loadIndices();
  }

  /* 当前目标集群的 ES 版本（如 7.10.1）——导航「需 x.x+」降级标注数据源。
 远端目标优先取连接档案里 回写的版本；档案缺失或宿主目标则 GET / 识别；拿不到留空=不标注（有意降级） */
  const esVersion = ref<string>('');
  let verInflight: Promise<void> | null = null;
  function loadVersion(): Promise<void> {
    if (target.value) {
      const c = conns.value.find(x => x.id === target.value);
      const v = c?.esVersion || c?.health?.version;
      if (v) { esVersion.value = v; return Promise.resolve(); }
    }
    if (verInflight) return verInflight;
    /* 回落弃 raw 透传改 clusterHealth（后端顺带 version）——raw 是 ADMIN 域
 高危端点，版本识别每次开屏都落一条 HIGH_RISK「raw=GET /」刷审计流水（实报
 「只是打开页面就出现高危操作」）。共享端点 VIEWER 可读零审计噪声。 */
    verInflight = api.clusterHealth()
      .then((h: any) => {
        esVersion.value = h?.version || '';
      })
      .catch(() => { /* 版本识别失败不打扰用户，仅少了导航降级标注 */ })
      .finally(() => { verInflight = null; });
    return verInflight;
  }
  /** 当前版本低于 min（major.minor 比较）；版本未知时返回 false 不误标 */
  function verBelow(min: string): boolean {
    return !!esVersion.value && verLt(esVersion.value, min);
  }

  /* 通知（轻量事件，App.vue 用 naive notification 消费） */
  interface NotifyAction { label: string; onClick: () => void }
  interface NotifyItem { id: number; kind: 'success' | 'error' | 'warning' | 'info'; msg: string; action?: NotifyAction; actions?: NotifyAction[]; duration?: number }
  const notifyQueue = ref<NotifyItem[]>([]);
  let nid = 0;
  /* toast 风暴抑制——轮询/重试场景同一错误连环弹（如服务重启期 inspect 连挂），
 右下角轰炸 + 通知历史刷屏都是垃圾体验。同 kind+文案在窗口期内只弹一次 toast，
 历史侧则聚合为一条 ×N（见 pushNotifyLog），信息不丢、噪音归零。 */
  const TOAST_DEDUP_MS = 8000;
  const lastToastAt = new Map<string, number>();
  function notify(kind: 'success' | 'error' | 'warning' | 'info', msg: string, opts?: { action?: NotifyAction; actions?: NotifyAction[]; duration?: number; logOnly?: boolean }) {
    /* 错误类消息全局友好化：ES 原始错误 JSON 提取 reason + 常见场景翻译 + 限长 */
    const shown = kind === 'error' ? friendlyEsError(msg) : msg;
    /* + 动作数组化：友好化后原始错误不丢——自动附「复制原始」动作；
    调用方还可经 opts.actions 追加「跳转」类动作（如查询失败直达诊断页），
    单 action 入参保持兼容并并入数组头（渲染层见 App.vue toast-acts 多按钮） */
    const actions: NotifyAction[] = [...(opts?.actions ?? [])];
    if (opts?.action) actions.unshift(opts.action);
    if (kind === 'error' && shown !== msg && !actions.some(a => a.label === '复制原始')) {
      actions.push({ label: '复制原始', onClick: () => { copyText(msg).then(ok => { notify(ok ? 'success' : 'error', ok ? '原始错误已复制' : '复制失败：浏览器拦截了剪贴板'); }); } });
    }
    pushNotifyLog(kind, shown, actions.length ? actions.map(a => a.label) : undefined);
    /* 只抑制异常类：success/info 是用户主动操作的即时反馈（如连续复制），静音会误导“没生效” */
    if (kind === 'error' || kind === 'warning') {
      const dk = kind + '|' + shown;
      const now = Date.now();
      if ((now - (lastToastAt.get(dk) || 0)) < TOAST_DEDUP_MS) return; // 历史已聚合计数，toast 静音
      lastToastAt.set(dk, now);
    }
    /* logOnly：只落通知历史不弹 toast——读拒绝的批量出口用（开屏并行引导请求
       逐条 403 时逐条弹错=轰炸；页面自身的禁用态/空态已经在讲同一件事） */
    if (opts?.logOnly) return;
    notifyQueue.value.push({ id: ++nid, kind, msg: shown, action: actions[0], actions: actions.length > 1 ? actions : undefined, duration: opts?.duration });
  }
  function shiftNotify() { notifyQueue.value.shift(); }

  /* 慢请求可观测——api 层对 >10s 的成功请求广播 esquerystudio:slow-request
 （事件桥与 unauthorized/setup-required 同范式，api 层不反依赖 store），此处转发
 既有 notify warning 档；同 path+文案的轮询重弹由 notify 内建 8s 去重吸收 */
  if (typeof window !== 'undefined') {
    window.addEventListener('esquerystudio:slow-request', (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.path) notify('warning', `${d.path} 耗时 ${d.seconds}s`);
    });
    /* 权限拒绝的全局出口（后端 403 与客户端写硬门共用）：此前 215 处 catch 静默吞掉，
       用户只看到「点了没反应」。统一给出「缺什么 + 怎么办 + 可复制申请」，各视图不必再造轮子。
       轮询型读请求由 notify 的 8s 同文去重吸收；写操作永远提示（那是用户主动动作）。 */
    window.addEventListener('esquerystudio:forbidden', (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      const page = typeof d.page === 'string' && d.page ? d.page : '';
      const required = typeof d.required === 'string' && d.required ? d.required : '';
      const who = d.method && d.method !== 'GET' ? '该操作' : '该功能';
      /* 读拒绝完全静默（不弹也不入史）：无授权身份开屏时引导读会一齐 403，
         逐条记录=通知历史被权限噪声刷屏（产线实报），而页面自身的禁用态/
         空态/无授权全屏已在讲同一件事。写请求保持必弹+必入史——那是用户
         主动动作，静音会变成「点了没反应」。 */
      if (!d.method || /^(GET|HEAD|OPTIONS)$/i.test(String(d.method))) return;
      let msg: string;
      if (d.denied === 'CLIENT_WRITE_DENIED') {
        msg = `当前身份无权执行${who}，请求已在客户端拦截（未发出）；请核对当前页面/目标连接的写授权，刚被撤权时刷新页面可同步菜单`;
      } else if (d.denied === 'ENV_PAGE_DENIED') {
        /* 环境限制不是「没权限」：页面上限由连接的 env 模板决定，找管理员勾页面是白跑一趟。
           后端 EnvPagesResolver.denyBody 带 page + 这条 code，dedicated 文案才对得上原因。 */
        msg = `当前连接的运行环境未开放「${page || '该'}」页面：${who}未发出（由环境模板限制，与账号页面授权无关）；`
          + `如需在该环境使用，请联系管理员调整连接的 env 模板或改连其他环境`;
      } else if (page) {
        msg = `暂无「${page}」页面权限：${who}未发出（后端拒绝）`;
      } else if (required) {
        msg = `权限不足：${who}需要 ${required} 角色`;
      } else {
        msg = d.message || `${who}被拒绝：当前身份无权限`;
      }
      const detail = [page && `page=${page}`, required && `required=${required}`,
        d.method && `method=${d.method}`, d.path && `path=${d.path}`].filter(Boolean).join(' · ');
      notify('error', detail ? `${msg}（${detail}）` : msg, {
        actions: [{
          label: '复制申请信息',
          onClick: () => {
            const text = [`控制台权限申请`, `页面：${page || '（未指定）'}`, `所需角色：${required || '（未指定）'}`,
              `请求：${d.method || ''} ${d.path || ''}`, `后端提示：${d.message || ''}`].join('\n');
            copyText(text).then(ok => notify(ok ? 'success' : 'error',
              ok ? '申请信息已复制，可发给管理员' : '复制失败：浏览器拦截了剪贴板'));
          },
        }],
      });
    });
  }

  /* 通知历史——toast 转瞬即逝，错过就永久丢失（尤其 / 的作业失败通知）。
 落 localStorage 跨刷新可回看；action 回调不可序列化，历史只留 kind/msg/ts */
  interface NotifyLogItem { kind: NotifyItem['kind']; msg: string; ts: number; count?: number; firstTs?: number;
    /** 该通知的动作 label 清单（回调不可序列化；历史侧展示徽标提示错过了可操作按钮） */
    actions?: string[] }
  const NLOG_KEY = 'esquerystudio.notify.log';
  const NSEEN_KEY = 'esquerystudio.notify.seen';
  const NLOG_MAX = 50;
  const notifyLog = ref<NotifyLogItem[]>(loadNotifyLog());
  const notifySeenTs = ref(Number(localStorage.getItem(NSEEN_KEY) || 0));
  function loadNotifyLog(): NotifyLogItem[] {
    try { const a = JSON.parse(localStorage.getItem(NLOG_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch { return []; }
  }
  function pushNotifyLog(kind: NotifyItem['kind'], msg: string, actionLabels?: string[]) {
    /* 连发同类消息聚合为一条 ×N——重试风暴不再刷穿 50 条历史，把真正有价值的通知挤丢 */
    const head = notifyLog.value[0];
    if (head && head.kind === kind && head.msg === msg) {
      head.count = (head.count || 1) + 1;
      head.firstTs = head.firstTs || head.ts; // ：首见时间留住——风暴从何时开始、持续多久是排障关键线索
      head.ts = Date.now();
    } else {
      notifyLog.value.unshift({ kind, msg, ts: Date.now(), actions: actionLabels });
      if (notifyLog.value.length > NLOG_MAX) notifyLog.value.length = NLOG_MAX;
    }
    writeStoredRaw(localStorage, NLOG_KEY, JSON.stringify(notifyLog.value));
  }
  /* 未读只计 error/warning：成功类不值得亮红点逼人点开 */
  const notifyUnread = computed(() => notifyLog.value.filter(n => n.ts > notifySeenTs.value && (n.kind === 'error' || n.kind === 'warning')).length);
  function markNotifySeen() {
    notifySeenTs.value = Date.now();
    writeStoredRaw(localStorage, NSEEN_KEY, String(notifySeenTs.value));
  }
  function clearNotifyLog() {
    notifyLog.value = [];
    removeStoredRaw(localStorage, NLOG_KEY);
  }

  /* 全局事件总线（轻量）：CmdPalette 动作 → 视图 */
  const eventBus = ref<{ name: string; payload?: any; ts: number }>({ name: '', ts: 0 });
  function emit(name: string, payload?: any) { eventBus.value = { name, payload, ts: Date.now() }; }

  /* 收藏夹（localStorage 持久化，跨会话恢复） */
  interface Favorite {
    id: string;
    kind: 'dsl' | 'rest' | 'route' | 'template';
    title: string;
    subtitle?: string;
    payload: any;
    ts: number;
    tags?: string[];
  }
  const FAV_KEY = 'esquerystudio.favorites.v1';
  const favorites = ref<Favorite[]>(loadFav());
  function loadFav(): Favorite[] {
    try {
      const arr = JSON.parse(localStorage.getItem(FAV_KEY) || '[]') as Favorite[];
      return Array.isArray(arr) ? arr : [];
    }
    catch { return []; }
  }
  function saveFav() { writeStoredRaw(localStorage, FAV_KEY, JSON.stringify(favorites.value)); }
  function addFavorite(f: Omit<Favorite, 'id' | 'ts'> & { id?: string }): Favorite {
    const id = f.id || `fav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const rec: Favorite = { id, ts: Date.now(), ...f };
    /* 幂等：同 kind + title 已存在则覆盖 */
    const idx = favorites.value.findIndex(x => x.kind === rec.kind && x.title === rec.title);
    if (idx >= 0) favorites.value.splice(idx, 1, rec);
    else favorites.value.unshift(rec);
    /* 上限 200 条 */
    if (favorites.value.length > 200) favorites.value.splice(200);
    saveFav();
    return rec;
  }
  function removeFavorite(id: string) {
    favorites.value = favorites.value.filter(x => x.id !== id);
    saveFav();
  }
  function clearFavorites() { favorites.value = []; saveFav(); }

  /* 2.5.0 宿主主题跟随：settings.theme 第四档 'host'（跟随宿主明暗）。
 hostTheme 初始值取 URL 参数（与 index.html 防闪脚本同源），非法/缺省钳回 dark——
 宿主未接入时按深色兜底，永不出现无主题裸奔。embedded 须先于 settings 声明（默认档判定引用它）。 */
  const hostTheme = ref<HostThemeMode>(readUrlHostTheme() ?? 'dark');
  const embedded = typeof window !== 'undefined' && window.parent !== window;

  /* 设置（持久化） */
  const settings = ref({
    histSize: Number(localStorage.getItem('es_hist_size') || 20),
    autoAgg: localStorage.getItem('es_auto_agg') !== '0',
    defaultLang: localStorage.getItem('es_code_lang') || 'curl',
    density: (localStorage.getItem('es_density') as 'comfortable' | 'compact') || 'comfortable',
    theme: (localStorage.getItem('es_theme') as 'dark' | 'light' | 'auto' | 'host')
      || (embedded ? 'host' : 'dark'),
    /* 侧栏形态 auto/on/off——auto 时按可用宽度自动折叠（iframe 内嵌宿主只有 ~866px，208px 侧栏吃掉 1/4 空间导致内容区处处截断），用户手动切换后固定其显式选择 */
    navCollapse: (localStorage.getItem('es_nav_collapse') as 'auto' | 'on' | 'off') || 'auto',
  });
  function applyDensity() {
    if (typeof document !== 'undefined') document.documentElement.dataset.density = settings.value.density;
  }
  applyDensity();

  /* 主题：dark/light/auto/host（auto 跟随系统 prefers-color-scheme；host 跟随宿主明暗，见上方 hostTheme） */
  const systemDark = ref(typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mm = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => { systemDark.value = e.matches; if (settings.value.theme === 'auto') applyTheme(); };
    mm.addEventListener?.('change', handler);
  }
  const effectiveTheme = computed<'dark' | 'light'>(() => {
    const t = settings.value.theme;
    if (t === 'host') return hostTheme.value;
    return t === 'auto' ? (systemDark.value ? 'dark' : 'light') : t;
  });
  function applyTheme() {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = effectiveTheme.value;
    /* index.html 防白闪的 style 属性优先级高于样式表，热切换时必须同步改写，否则浅色下透出深底 */
    document.documentElement.style.background = effectiveTheme.value === 'light' ? '#f7f8fa' : '#0d0e12';
  }
  applyTheme();
  function setTheme(t: 'dark' | 'light' | 'auto' | 'host') {
    settings.value.theme = t;
    writeStoredRaw(localStorage, 'es_theme', t);
    applyTheme();
  }
  function cycleTheme() {
    const order: ('dark' | 'light' | 'auto' | 'host')[] = ['dark', 'light', 'auto', 'host'];
    const i = order.indexOf(settings.value.theme);
    setTheme(order[(i + 1) % order.length]);
  }
  /* 宿主热切主题：仅当前档位为 host 时重应用——用户手切其他档即反超，宿主热推不再生效。
 非法值钳回 dark（与初始化同策略）。 */
  function setHostTheme(mode: string) {
    hostTheme.value = mode === 'light' ? 'light' : 'dark';
    if (settings.value.theme === 'host') applyTheme();
  }

  function saveSettings() {
    writeStoredRaw(localStorage, 'es_hist_size', String(settings.value.histSize));
    writeStoredRaw(localStorage, 'es_auto_agg', settings.value.autoAgg ? '1' : '0');
    writeStoredRaw(localStorage, 'es_code_lang', settings.value.defaultLang);
    writeStoredRaw(localStorage, 'es_density', settings.value.density);
    writeStoredRaw(localStorage, 'es_theme', settings.value.theme);
    applyDensity();
    applyTheme();
  }
  function toggleDensity() {
    settings.value.density = settings.value.density === 'compact' ? 'comfortable' : 'compact';
    saveSettings();
  }

  /* 视口宽度（窄容器判定用）——iframe 内嵌时这就是 iframe 自身宽度 */
  const viewportW = ref(typeof window !== 'undefined' ? window.innerWidth : 1440);
  /* 视口高度（编辑器拖柄上限/满档高度估计用）——嵌入容器挂载早期可能读到 0，
     响应式值让消费 computed 在首拍 resize 后自愈，非响应式读数会永久缓存 0 */
  const viewportH = ref(typeof window !== 'undefined' ? (window.innerHeight || document.documentElement.clientHeight || 900) : 900);
  if (typeof window !== 'undefined') {
    let rt: any = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        viewportW.value = window.innerWidth;
        if (window.innerHeight > 0) viewportH.value = window.innerHeight;
      }, 120);
    });
  }
  const narrow = computed(() => viewportW.value <= 1000);
  /* 侧栏是否图标态：显式选择优先，auto 跟随窄容器 */
  const navIcon = computed(() => {
    const m = settings.value.navCollapse;
    return m === 'on' ? true : m === 'off' ? false : narrow.value;
  });
  function toggleNav() {
    /* 从当前实际形态取反并固化，符合「我点了就该变」的直觉（不留 auto 反弹） */
    settings.value.navCollapse = navIcon.value ? 'off' : 'on';
    writeStoredRaw(localStorage, 'es_nav_collapse', settings.value.navCollapse);
  }
  /* 完全隐藏侧栏（dbx Mod+B 对位——查询/索引控制台全屏体验）。
 独立于图标折叠档：hidden 时侧栏整体移除，主区占满；持久化（dbx 同款跨会话记忆），
 TopBar 钮与 Mod+B 均可唤回。 */
  const navHidden = ref(localStorage.getItem('es_nav_hidden') === '1');
  function setNavHidden(v: boolean) {
    navHidden.value = v;
    writeStoredRaw(localStorage, 'es_nav_hidden', v ? '1' : '0');
  }
  function toggleNavHidden() {
    setNavHidden(!navHidden.value);
  }

  /* 跨标签页目标同步：api 层每次请求读 localStorage 的 X-Es-Target，UI 门读内存 target。
     另一标签切换目标而本页不跟随，会出现「界面显示 QA、请求打到 PROD」的目标撕裂。 */
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== 'esquerystudio.target' && e.key !== 'esquerystudio.target.name') return;
      const id = getTarget();
      const name = id ? (localStorage.getItem('esquerystudio.target.name') || '') : '';
      if (id === target.value) {
        targetName.value = name;
        return;
      }
      target.value = id;
      targetName.value = name;
      pick('');
      recentIdx.value = [];
      removeStoredRaw(localStorage, RECENT_KEY);
      clearTargetIndexMemory();
      esVersion.value = '';
      loadIndices();
    });
  }

  /* 换账号（含宿主 token 换人）：所有「账号视角」内存态归零。
     只清存储不够——单例 ref 会在下一次写入时把旧账号的收藏/历史落回磁盘；
     目标尤其危险：storage 已被清空而内存仍显示 A 的生产集群，请求却不带 X-Es-Target，
     写入会落到宿主。存储键由 auth.purgeUserRequestState 统一清理，这里负责内存与目标双键。 */
  function resetIdentityState() {
    /* 世代号必须前移：换号时在飞的 listIndices/loadConns 回包若晚到，旧账号的索引名/
       连接目录会写回新账号的 store（清空数组不等于作废旧拍）。 */
    indicesSeq++;
    connsSeq++;
    verInflight = null;
    loadingIndices.value = false;
    esVersion.value = '';
    indices.value = [];
    recentIdx.value = [];
    pickedIdx.value = '';
    clusterOk.value = null;
    clusterSelf.value = '';
    clusterHealth.value = '';
    clusterUnassigned.value = 0;
    conns.value = [];
    target.value = '';
    targetName.value = '';
    setTargetId('');
    removeStoredRaw(localStorage, 'esquerystudio.target.name');
    removeStoredRaw(localStorage, 'es_picked');
    removeStoredRaw(localStorage, RECENT_KEY);
    favorites.value = [];
    notifyLog.value = [];
    /* 未消费的 toast 队列也是账号视角：x1 的「已切到 es_excel_conn」不能在 x3 侧弹出。 */
    notifyQueue.value = [];
  }

  return { indices, pickedIdx, recentIdx, pickedInfo, loadingIndices, clusterOk, clusterSelf, clusterHealth, clusterUnassigned, loadIndices, pick, notifyQueue, notify, shiftNotify, notifyLog, notifyUnread, markNotifySeen, clearNotifyLog, eventBus, emit, favorites, addFavorite, removeFavorite, clearFavorites, resetIdentityState, settings, saveSettings, toggleDensity, effectiveTheme, setTheme, cycleTheme, hostTheme, setHostTheme, target, targetName, conns, isRemote, hostVisible, loadConns, setTarget, esVersion, verBelow, viewportW, viewportH, narrow, navIcon, toggleNav, navHidden, setNavHidden, toggleNavHidden };
});
