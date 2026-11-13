<template>
  <div class="sec" :class="{ 'sec-browser': isBrowserMode }">
    <!-- 宿主作用域由横幅降级为副标题自述（纯宿主页的恒定事实不该以警告形态常驻） -->
    <PageHeader :icon="ShieldCheck" title="安全中心" subtitle="页面授权 · 操作审计 · 内置账号（独立部署）" />

    <div v-if="isBrowserMode" class="sec-browser-note">
      <AlertTriangle :size="14" />
      <span>浏览器模式没有服务端用户库：账号与页面权限由 Elasticsearch 自身和插件连接档案管理；下方操作审计是本机 IndexedDB 记录，仅保存在当前浏览器。</span>
    </div>

    <!-- 兜底账号横幅 -->
    <div v-if="auth.me?.fallback" class="fb-banner">
      <AlertTriangle :size="14" />
      <span>当前使用<b>兜底默认账号</b>登录（ES 中尚无任何正式账号）。建议立即在下方「修改密码」建立首个正式 ADMIN 账号，兜底账号将自动失效。</span>
    </div>

    <div class="sec-grid">
      <!-- 我的账号。：顶层 .card 壳退役（约定④）→ border-top 分节（xm-res 同语言） -->
      <div class="me-card">
        <div class="card-t"><button class="sec-fold" :class="{ folded: collapsed.me }" :aria-label="collapsed.me ? '展开' : '折叠'" @click="toggleBlock('me')"><ChevronDown :size="14" /></button><UserCircle2 :size="14" /> 我的账号</div>
        <div v-show="!collapsed.me">
        <div v-if="auth.me" class="me-rows">
          <div class="me-row">
<span>用户名</span>
            <!-- 委托账号是长 SSO ID，截断显示防撑破布局（hover 全量） -->
            <b class="mono" :title="auth.me.username">{{ auth.me.username.length > 24 ? auth.me.username.slice(0, 21) + '…' : auth.me.username }}</b>
          </div>
          <div v-if="auth.me.displayName && auth.me.displayName !== auth.me.username" class="me-row">
            <span>姓名</span><b>{{ auth.me.displayName }}</b>
          </div>
          <!-- ·语义重构：delegated 用户权限=宿主菜单勾选，角色徽标不再展示；
 内置登录（独立部署）保留角色徽标与说明 -->
          <div v-if="!auth.me.delegated" class="me-row">
<span>角色</span>
            <StatusPill :tone="roleTone(auth.me.role)" :label="auth.me.role" />
          </div>
          <div v-if="!auth.me.delegated" class="me-row"><span>说明</span><span class="dim">{{ roleDesc(auth.me.role) }}</span></div>
          <template v-else>
            <div class="me-row">
<span>授权来源</span>
              <b>宿主连接菜单</b>
            </div>
            <div class="me-row" v-if="grantSummary.connModel">
<span>页面授权</span>
              <span>可见 <b>{{ grantSummary.totals.visible }}</b> 页 · 可写 <b>{{ grantSummary.totals.writable }}</b> 页（明细见下）</span>
            </div>
            <!-- 混合授权：无 conn: 前缀的全局静态页对所有连接生效，不能只展示连接明细把它丢掉 -->
            <div class="me-row" v-if="grantSummary.connModel && grantSummary.staticKeys?.length">
<span>全局页面</span>
              <span class="dim">{{ grantSummary.staticKeys.map(pageName).join('、') }}（所有连接）</span>
            </div>
            <!-- 纯静态页白名单（无 conn 键）不是「未启用页面级授权」：如实展示全局页 -->
            <div class="me-row" v-else-if="grantSummary.staticKeys?.length">
<span>页面授权</span>
              <span>全局页面 <b>{{ grantSummary.staticKeys.length }}</b> 个：<span class="dim">{{ grantSummary.staticKeys.map(pageName).join('、') }}</span>（所有连接）</span>
            </div>
            <!-- grantedPages=null（宿主未启用页面级授权）≠「未下发授权」——
 按角色档回落展示：ADMIN=全权；非 ADMIN 保留角色徽标+说明（角色档是 SPI 未
 启用部署的唯一裁决，如实展示而不是一律说「未下发」误导） -->
            <template v-else>
              <div class="me-row" v-if="auth.me.role === 'ADMIN'">
<span>页面授权</span>
                <span>管理员 · 全部页面 · 可读可写</span>
              </div>
              <template v-else>
                <div class="me-row">
<span>页面授权</span>
                  <StatusPill :tone="roleTone(auth.me.role)" :label="auth.me.role" />
                </div>
                <div class="me-row"><span>说明</span><span class="dim">{{ roleDesc(auth.me.role) }}（宿主未启用页面级授权，按角色档）</span></div>
              </template>
            </template>
          </template>
        </div>
        <template v-if="!auth.me?.delegated">
          <div class="divider"></div>
          <div class="card-t sm">修改密码</div>
          <!-- type=text + CSS 圆点遮罩：避免浏览器密码管理器把安全中心当登录表单自动填充/弹账号选择 -->
          <input @keydown.enter="doChangePw()" v-model="pwOld" type="text" class="ipt w100 pw-mask" placeholder="旧密码" autocomplete="off" />
          <input v-model="pwNew" type="text" class="ipt w100 pw-mask" placeholder="新密码（≥6 位）" autocomplete="off" />
          <!-- 二次确认：两次输入不一致时禁用提交 + 行内红字，防止手滑把新密码设成错值锁死自己 -->
          <input @keydown.enter="doChangePw()" v-model="pwConfirm" type="text" class="ipt w100 pw-mask" placeholder="确认新密码" autocomplete="off" />
          <div v-if="pwNew && pwConfirm && pwNew !== pwConfirm" class="ipt-err w100">两次输入的新密码不一致</div>
          <button class="btn primary sm w100" :disabled="!pwOld || pwNew.length < 6 || pwConfirm !== pwNew || pwBusy" @click="doChangePw">
            <KeyRound :size="12" /> {{ auth.me?.fallback ? '设置密码并建立正式账号' : '修改密码' }}
          </button>
        </template>
        <template v-else>
          <div class="divider"></div>
          <div class="dim">当前身份由<b>宿主系统委托鉴权</b>，凭证由宿主管理，请在宿主系统修改密码。</div>
        </template>
      </div>
      </div>

      <!-- 页面授权总览（delegated+连接模型）——宿主菜单勾选的可视化：
 每连接一节，页 chips（可写>可见两档），页名从 me.pages 目录解析，未知 key 原样展示 -->
      <div class="me-card" v-if="grantSummary.connModel && grantSummary.conns.length">
        <div class="card-t"><button class="sec-fold" :class="{ folded: collapsed.grant }" :aria-label="collapsed.grant ? '展开' : '折叠'" @click="toggleBlock('grant')"><ChevronDown :size="14" /></button><ShieldCheck :size="14" /> 页面授权（宿主菜单勾选）</div>
        <div v-show="!collapsed.grant">
        <!-- 补强②（用户产线截图）：超管全键展开后 10 连接行全是重复的
 「全部页面·可读可写」——聚合为一行汇总，点开才列连接清单 -->
        <div v-if="allConnsFullGrant" class="pg-agg">
          <b>{{ grantSummary.conns.length }}</b> 个连接 · 每连接全部 {{ pageCatalogTotal }} 页 · 可读可写
          <span class="dim">（宿主超管隐式全权）</span>
        </div>
        <template v-else>
          <div v-for="g in grantSummary.conns" :key="g.connId" class="pg-conn">
            <details>
              <summary class="pg-conn-sum">
                <b>{{ connName(g.connId) }}</b>
                <span class="dim">可见 {{ g.visible.length }} 页<template v-if="g.writable.length"> · 可写 {{ g.writable.length }} 页</template></span>
                <span v-if="isFullGrant(g)" class="pg-full">全部页面 · 可读可写</span>
              </summary>
              <div class="pg-pages" v-if="!isFullGrant(g) && g.visible.length">
                <span v-for="p in g.visible" :key="p" class="chip static" :class="{ 'pg-w': g.writable.includes(p) }" :title="pageName(p) + (g.writable.includes(p) ? ' · 可写' : ' · 仅查看')">
                  {{ pageName(p) }}<b v-if="g.writable.includes(p)">·写</b>
                </span>
              </div>
            </details>
          </div>
        </template>
        <div class="dim" style="margin-top:var(--sp-2)">权限随宿主菜单勾选实时生效；点击连接行展开逐页明细；「·写」=可变更数据。Dev Tools / REST 的写权限等于<b>该连接的数据面全权</b>（检索/文档/批量/删查/SQL），管理面写（别名/快照/模板/脚本/集群设置）仍需对应页面写权限。</div>
      </div>
      </div>

      <!-- 用户管理（内置账号，独立部署登录用）。：同上款 .card 壳退役 → border-top 分节 -->
      <div class="us-card">
        <div class="card-t"><button class="sec-fold" :class="{ folded: collapsed.users }" :aria-label="collapsed.users ? '展开' : '折叠'" @click="toggleBlock('users')"><ChevronDown :size="14" /></button>
<Users :size="14" /> 用户管理（内置账号 · 独立部署登录用）
          <span v-if="!canReadUsers" class="dim sm-txt">（需安全中心读权限）</span>
          <span v-else-if="!canWriteUsers" class="dim sm-txt">（{{ auth.me?.delegated ? '宿主委派身份只读：本地全局账号仅内置 ADMIN 可管理' : '页面授权身份只读：本地全局账号仅内置 ADMIN 可管理' }}）</span>
          <!-- selectable 批量勾选暗状态（有勾选时计数常驻；仅写权限可见） -->
          <template v-if="canReadUsers">
            <span v-if="canWriteUsers && usSel.length" class="dim sm-txt">已选 {{ usSel.length }} 用户</span>
            <button aria-label="刷新用户列表" class="btn ghost sm right" @click="loadUsers" :disabled="usersLoading" title="刷新用户列表"><RefreshCw :size="12" :class="{ spinning: usersLoading }" /></button>
          </template>
        </div>
        <div v-show="!collapsed.users">
        <template v-if="canReadUsers">
          <!-- -A2：拉取失败不能伪装成「暂无正式账号」，否则误导管理员重建用户 -->
          <div v-if="usersErr" role="alert" class="err-bar rise-in">
            用户列表拉取失败：{{ usersErr }}
            <button class="btn sm" :disabled="usersLoading" @click="loadUsers">重试</button>
          </div>
          <!-- 修复：骨架/空态/数据三态互斥——原骨架条件「!users.length && !usersErr」
 在「加载完成但为空」时永真（委托鉴权+无正式账号场景骨架无限转圈、与空态叠加渲染），
 补 usersLoading 状态区分「在途」与「完成但为空」 -->
          <div v-if="usersLoading && !users.length" class="sec-skel">
            <SkeletonBox v-for="i in 4" :key="i" height="16px" round style="margin-bottom:9px" :width="(88 - i * 9) + '%'" />
          </div>
          <!-- 用户裸表换 QRT rows 型（同视图审计表 529 先例，先列锚清单再动手）——
 排序/列漏斗/右键/行导航/导出归内核（宿主 useTableSort 胶水退役）；
 删除钮走 #row-actions 槽（BrowserView 529 先例）；selectable 行多选通道开（批量场景）；
 列=中文键（与旧表头逐字同源），更新列落 epoch ms（QRT 数值比较器排序）+
 #cell-更新 槽 TimeCell abs 还原显示 -->
          <QueryResultTable
            v-if="users.length"
            :cols="US_COLS" :rows="usMatrix" sortable
            storage-key="security:users"
            export-name="security-users"
            :selectable="canWriteUsers"
            @selection-change="usSel = $event"
            :row-action-group="userRowAction"
            max-height="none"
          >
            <template #cell-用户名="{ value }"><span class="mono">{{ value }}</span></template>
            <template #cell-角色="{ value }"><StatusPill :tone="roleTone(String(value))" :label="String(value)" /></template>
            <template #cell-更新="{ value }"><TimeCell :ts="value" abs /></template>
            <template #row-actions="{ row }">
              <button v-if="canWriteUsers" aria-label="删除" class="btn ghost sm danger" title="删除" :disabled="deleting" @click="doDelete(row[0])"><Trash2 :size="12" :class="{ spinning: deleting }" /></button>
            </template>
          </QueryResultTable>
          <!-- C3/#13：err-bar 与 empty 互斥——拉取失败时不许伪装成「暂无正式账号」误导管理员重建用户
 空态给下一步动作（EmptyState 纪律）——一键把角色预置为 ADMIN 并聚焦表单
 裸 .empty 迁 EmptyState compact（用户管理窄卡），创建 ADMIN 改 actionText 等价保留 -->
          <EmptyState v-else-if="!usersLoading && !usersErr" compact :icon="UserPlus"
            text="暂无正式账号 —— 当前依赖兜底默认账号" :action-text="canAssignAdmin ? '创建 ADMIN' : undefined" @action="presetAdmin" />
          <template v-if="canWriteUsers">
          <div class="divider"></div>
          <div class="card-t sm">新建 / 更新用户</div>
          <div class="new-user">
            <input ref="nuNameRef" v-model.trim="nuName" class="ipt" placeholder="用户名" />
            <input v-model="nuPass" type="text" class="ipt pw-mask" placeholder="密码（更新时留空=只改角色）" autocomplete="off" />
            <select v-model="nuRole" class="ipt sel">
              <option value="VIEWER">VIEWER（只读）</option>
              <option value="OPERATOR">OPERATOR（文档编辑等低危写）</option>
              <option value="REBUILD_OP">REBUILD_OP（重建/迁移/回滚专项）</option>
              <option value="CLUSTER_OP">CLUSTER_OP（索引/集群管理专项）</option>
              <option value="AUDIT_OP">AUDIT_OP（审计日志查看专项）</option>
              <option v-if="canAssignAdmin" value="ADMIN">ADMIN（超管·全权+用户管理）</option>
            </select>
            <button class="btn primary sm" :disabled="!nuName || nuPassInvalid || nuBusy" @click="doUpsert"><UserPlus :size="12" /> 保存</button>
            <div v-if="nuPassInvalid" class="ipt-err new-user-err">密码最少 6 位（留空提交 = 只改角色）</div>
          </div>
          <!-- 角色说明从一行长文案结构化为对照清单（可读性） -->
          <div class="role-rows">
            <div v-for="rl in ROLE_ROWS" :key="rl" class="role-row">
              <!-- role-pill 落位锚类（原 role-tag min-width 对齐语义同步更新） -->
              <StatusPill class="role-pill" :tone="roleTone(rl)" :label="rl" />
              <span class="dim">{{ roleDesc(rl) }}</span>
            </div>
          </div>
          </template>
          <!-- 页面目录：授权时不再靠猜——能看到有哪些页面、哪些需版本门槛（me 响应的 pages 契约，纯前端渲染） -->
          <details v-if="auth.me?.pages?.groups?.length" class="page-catalog">
            <summary>页面目录（{{ pageCount }} 页 · 标「需 X+」为版本门槛）</summary>
            <div class="page-catalog-body">
              <div v-for="g in auth.me.pages.groups" :key="g.id" class="pc-group">
                <b class="pc-group-name">{{ g.name }}</b>
                <div class="pc-pages">
                  <!-- ④ 残量合并：控制集群页芯片退役自绘 .pc-page 基座，共用全局 .chip（static 非交互档） -->
                  <span v-for="p in g.pages" :key="p.key" class="chip static" :title="p.route">
                    {{ p.name }}<span v-if="p.minVer" class="pc-ver">需 {{ p.minVer }}+</span>
                  </span>
                </div>
              </div>
            </div>
          </details>
        </template>
      </div>
      </div>
    </div>

    <!-- 控制集群。：同上款 .card 壳退役 → border-top 分节 -->
    <div class="ctl-card">
      <div class="card-t"><button class="sec-fold" :class="{ folded: collapsed.ctl }" :aria-label="collapsed.ctl ? '展开' : '折叠'" @click="toggleBlock('ctl')"><ChevronDown :size="14" /></button>
<DatabaseZap :size="14" /> 控制集群
        <span class="dim sm-txt">（存放用户/连接档案/审计/作业/锁的集群）</span>
        <button aria-label="刷新安全状态" class="btn ghost sm right" @click="loadSetup" :disabled="setupLoading" title="刷新安全状态"><RefreshCw :size="12" :class="{ spinning: setupLoading }" /></button>
      </div>
        <div v-show="!collapsed.ctl">
      <div v-if="setup" class="me-rows">
        <div class="me-row">
<span>绑定状态</span>
          <b :class="setup.bound ? 'ok-txt' : 'err-txt'">{{ setup.bound ? '已绑定' : '未绑定' }}</b>
        </div>
        <div class="me-row">
<span>模式</span>
          <!-- 模式中文说明（BOOTSTRAP 等专业词不再裸奔） -->
          <b class="mono" :title="MODE_TIP[setup.mode] || ''">{{ setup.mode }}</b>
          <span v-if="MODE_TIP[setup.mode]" class="dim sm-txt">{{ MODE_TIP[setup.mode] }}</span>
        </div>
        <div class="me-row"><span>地址</span><b class="mono">{{ setup.endpoint || '-' }}</b></div>
      </div>
      <template v-if="canRebind">
        <div class="divider"></div>
        <div class="card-t sm">重绑控制集群（高危：新集群需重建账号/连接档案，历史审计不同步更新）</div>
        <div class="rebind-row">
          <input v-model.trim="rbUrl" class="ipt mono" placeholder="http://es-host:9200" />
          <input v-model.trim="rbUser" class="ipt" placeholder="用户名（可选）" autocomplete="off" />
          <input v-model="rbPass" type="text" class="ipt pw-mask" placeholder="密码（可选）" autocomplete="off" />
          <input v-if="setup?.setupTokenRequired" v-model="rbToken" type="password" class="ipt"
            placeholder="首连令牌 X-Setup-Token" autocomplete="off" />
          <button class="btn primary sm" :disabled="!rbUrl || rbBusy || (setup?.setupTokenRequired && !rbToken)" @click="doRebind">
            <Link2 :size="12" /> 重绑
          </button>
        </div>
        <div v-if="setup?.setupTokenRequired" class="dim sm-txt">本部署配置了 setup-token：重绑必须携带同一令牌（X-Setup-Token），否则服务端拒绝。</div>
      </template>
      <!-- 重绑是系统管理域（ADMIN 专属）：非 ADMIN 不再只是「区块凭空消失」——
           说明它存在但当前身份不可用，避免用户以为部署不支持重绑 -->
      <div v-else-if="auth.probed" class="sec-ro-note" role="status">
        重绑控制集群需 ADMIN 角色（高危：新集群需重建账号/连接档案，历史审计不同步更新）；当前身份只读该区块。
      </div>
    </div>
      </div>

    <!-- 操作审计（全量=rank3+；其余角色走 /ops-audit/mine 自助——username 服务端强制）。
 同上款 .card 壳退役 → border-top 分节 -->
    <div class="audit-card">
            <div class="card-t"><button class="sec-fold" :class="{ folded: collapsed.audit }" :aria-label="collapsed.audit ? '展开' : '折叠'" @click="toggleBlock('audit')"><ChevronDown :size="14" /></button>
<ScrollText :size="14" /> 操作审计流水
        <span v-if="!canAuditAll" class="dim sm-txt">（仅我的操作 · 全量需 AUDIT_OP/ADMIN + 安全中心读权限）</span>
        <!-- ：工具行分组收纳——高频快滤/动作/时间/刷新留明面（可见按钮 ≤5），
 低频筛选（按用户/集群/URI）与导出（TSV/Markdown）收进 ⋯（复用 ld-hist-more 同语汇） -->
        <!-- 轨4：审计快滤明面改用 SearchFilterBar 单源（sfbUnify650 锁；639 语义零变）——
 Esc 清空转组件内建，落位类 sv-adkw 承接原 .sm-ipt 宽度位 -->
        <SearchFilterBar v-model="adKw" class="sv-adkw" input-class="sm-ipt" placeholder="过滤用户/URI/集群" />
        <template v-if="auth.me">
          <select v-model="fAction" class="ipt sm-ipt sel" @change="loadAudit">
            <option value="">全部动作</option>
            <option v-for="a in actionSuggestions" :key="a.key" :value="a.key">{{ actionZh(a.key) }}<template v-if="a.count">（{{ a.count }}）</template></option>
            <option value="LOGIN">登录（LOGIN）</option>
            <option value="LOGIN_FAIL">登录失败（LOGIN_FAIL）</option>
            <option value="WRITE">写操作（WRITE）</option>
            <option value="HIGH_RISK">高危操作（HIGH_RISK）</option>
            <option value="PAGE_DENIED">页面访问被拒（PAGE_DENIED）</option>
            <!-- 宿主贡献者动作（打通 宿主 sys_audit_log，SPI 合并） -->
            <option value="HOST_OP">宿主操作（HOST_OP）</option>
          </select>
          <!-- 「仅看被拒」快捷过滤—— 双路径合一：改一次性 shortcut
 （单设 PAGE_DENIED 不 toggle，select 为单源；on 态仍由 fAction 派生） -->
          <button class="btn ghost sm" :disabled="auditLoading" :class="{ on: fAction === 'PAGE_DENIED' }" :title="fAction === 'PAGE_DENIED' ? '已聚焦页面访问被拒（请在动作下拉选「全部动作」退出）' : '只看页面访问被拒（PAGE_DENIED）'" @click="fAction = 'PAGE_DENIED'; loadAudit()">
            <ShieldAlert :size="12" /> 仅看被拒
          </button>
          <!-- 补/210:时间范围过滤(排障高频——最近1h/24h/7d,作用于已拉取范围) -->
          <select v-model="fRange" class="ipt sm-ipt sel" @change="loadAudit">
            <option value="all">全部时间</option>
            <option value="1h">最近 1 小时</option>
            <option value="24h">最近 24 小时</option>
            <option value="7d">最近 7 天</option>
          </select>
          <button class="btn ghost sm" :disabled="auditLoading" @click="loadAudit"><RefreshCw :size="12" /> 刷新</button>
          <!-- selectable 行多选计数（users 表 :57 同款暗状态可见性） -->
          <span v-if="auditSel.length" class="dim sm-txt">已选 {{ auditSel.length }} 条</span>
        </template>
        <!-- ：⋯ 溢出（低频筛选 + 导出）——原生 details 键盘可达（不入 Esc 台账），
 弹层四要素（bg1 底 + 边框 + 阴影 + r-m）；datalist 随输入同迁弹层内 -->
        <details class="ad-more">
          <summary class="ad-more-sum" aria-label="更多筛选与导出" title="更多选项：按用户/集群/URI 过滤 + TSV/Markdown 导出">⋯</summary>
          <div class="ad-more-pop">
            <!-- 值建议：fUser 挂 datalist（建议=审计索引 by_user terms agg 真实出现过的用户+计数） -->
            <input v-if="canAuditAll" v-model.trim="fUser" class="ipt sm-ipt" placeholder="按用户过滤" list="audit-user-suggestions"
              @keyup.enter="loadAudit" @keydown.esc.prevent="fUser = ''" />
            <datalist id="audit-user-suggestions">
              <option v-for="s in userSuggestions" :key="s.key" :value="s.key">{{ s.count }}</option>
            </datalist>
            <!-- R9 全栈优化轮：集群筛选下推（connName 精确服务端过滤，回车/刷新生效； 挂 datalist 值建议） -->
            <input v-if="canAuditAll" v-model.trim="fConn" class="ipt sm-ipt" placeholder="按集群过滤" list="audit-conn-suggestions"
              @keyup.enter="loadAudit" @keydown.esc.prevent="fConn = ''" />
            <!-- 自助面（mine）也按集群维度观察——默认当前所选集群，清空看全部 -->
            <input v-else v-model.trim="fConnMine" class="ipt sm-ipt" placeholder="按集群过滤（默认当前集群，清空看全部）"
              @keyup.enter="loadAudit" @keydown.esc.prevent="fConnMine = ''" />
            <datalist id="audit-conn-suggestions">
              <option v-for="s in connSuggestions" :key="s.key" :value="s.key">{{ s.count }}</option>
            </datalist>
            <!-- 值建议补齐：URI 前缀输入挂服务端 uriPrefix 下推（回车/刷新生效）； 挂 datalist（by_uri 真实 Top URI） -->
            <input v-if="canAuditAll" v-model.trim="fUri" class="ipt sm-ipt" placeholder="按 URI 前缀过滤" list="audit-uri-suggestions"
              @keyup.enter="loadAudit" @keydown.esc.prevent="fUri = ''" />
            <datalist id="audit-uri-suggestions">
              <option v-for="s in uriSuggestions" :key="s.key" :value="s.key">{{ s.count }}</option>
            </datalist>
            <!-- 补/208：审计 Markdown 复制 + 天罗W6 补 TSV——数据源走 QRT ref.getCsvBlock() -->
            <div class="ad-more-acts">
              <button class="btn ghost sm" @click="copyAuditTsv" :disabled="!adShown.length" title="复制当前筛选结果为 TSV（Excel/飞书直贴）">
                <ClipboardList :size="12" /> TSV
              </button>
              <button class="btn ghost sm" @click="copyAuditMd" :disabled="!adShown.length" title="复制当前筛选结果为 Markdown（群聊/工单直贴）">
                <ClipboardList :size="12" /> Markdown
              </button>
            </div>
          </div>
        </details>
      </div>
        <div v-show="!collapsed.audit">
<!-- -A2：审计拉取失败不能伪装成「暂无审计记录」，否则排障时会误判为无操作发生 -->
      <div v-if="auditErr" role="alert" class="err-bar rise-in">
        审计流水拉取失败：{{ auditErr }}
        <button class="btn sm" :disabled="auditLoading" @click="loadAudit">重试</button>
      </div>
      <!-- 审计裸表换 QRT rows 型（524 教训先列锚清单再动手）——
 排序/列漏斗（用户/角色/来源/动作/方法等值 + HTTP·耗时数值区间走 fieldTypes long →
 内建 isRangeCol）/列选/右键/行导航/导出 CSV·MD·XLSX·PNG 全归内核；
 kw 快滤（adKw）留视图（与 fAction 服务端过滤 AND 后作 rows 输入端）；
 524 派生展示列（TimeCell abs/role-tag/act-tag 动作中文/m-* 方法色轮/URI 短显示/
 HTTP ≥400 红字/详情查看器打开路径）逐条经 #cell-<列名> 作用域槽保真；
 导出文件名 sec-audit-<exportStamp> 走 export-name（ ops-audit 更名，
 与页域 security:* 记忆键同前缀），单元格加工走 export-cell；
 列名用中文键——与旧表头/旧 CSV 表头逐字同源，漏斗 aria「筛选 方法 列」保真 -->
      <QueryResultTable
        v-if="auditRows.length || auditLoading"
        ref="auditQrt"
        :cols="AUDIT_COLS" :rows="auditMatrix" sortable
        storage-key="security:audit"
        :default-cols="AUDIT_COLS"
        :field-types="{ HTTP: 'long', '耗时(ms)': 'long' }"
        export-name="sec-audit"
        :export-cell="auditExportCell"
        :loading="auditLoading"
        selectable
        @selection-change="auditSel = $event"
        max-height="none"
      >
        <template #cell-时间="{ value }"><TimeCell :ts="value" abs /></template>
        <template #cell-用户="{ value }"><span class="mono">{{ value }}</span></template>
        <!-- 角色列/动作列私造胶囊改用 StatusPill 统一件（roleTone/actTone 映射；
 动作代码 title 兜底与中文映射 actionZh 语义原样保留，securityReadability 锚同步更新保真） -->
        <template #cell-角色="{ value }"><StatusPill :tone="roleTone(String(value))" :label="String(value)" /></template>
        <template #cell-动作="{ value }"><StatusPill :tone="actTone(String(value))" :label="actionZh(String(value))" :title="'动作代码：' + value" /></template>
        <!-- W-C 批：HTTP 方法挂全局语义色轮 .m-*（GET 绿/POST 黄/PUT 紫/DELETE 红/HEAD 蓝） -->
        <template #cell-方法="{ value }"><span class="mono" :class="'m-' + String(value || '').toLowerCase()">{{ value }}</span></template>
        <template #cell-URI="{ value }"><span class="mono uri" :title="value">{{ shortUri(value) }}</span></template>
        <!-- 集群列（connName 实名优先，缺省回退 connId；空档显示 -） -->
        <template #cell-集群="{ value }"><span class="mono" :title="value" style="color: var(--tx2)">{{ value || '-' }}</span></template>
        <!-- 补全：来源 IP / 耗时 / 来源归属 三列升表格（数据模型已有，此前只在详情弹层） -->
        <template #cell-IP="{ value }"><span class="mono" style="color: var(--tx2)">{{ value || '-' }}</span></template>
        <template #cell-耗时(ms)="{ value }"><span class="mono" :style="Number(value) > 1000 ? 'color: var(--warn)' : 'color: var(--tx2)'">{{ value === '' || value == null ? '-' : value + 'ms' }}</span></template>
        <template #cell-来源="{ value }"><StatusPill :tone="value === 'host' ? 'b' : 'n'" :label="value === 'host' ? '宿主' : '控制台'" /></template>
        <template #cell-HTTP="{ value }"><span :class="Number(value) >= 400 ? 'err-txt' : ''">{{ value }}</span></template>
        <template #cell-详情="{ row, value }">
          <!-- 长 detail 可点开完整查看器(截断 2000 字符的详情不再只有 title)；
 打开路径不变——槽内由矩阵行重建 detailRow（AUDIT_COLS 列序契约） -->
          <button v-if="value" class="btn ghost xs" aria-label="查看完整详情" title="查看完整详情" @click.stop="openDetailCell(row)"><Maximize2 :size="10" /></button>
          <span class="detail-txt" :role="value ? 'button' : undefined" :tabindex="value ? 0 : undefined" @click="value && openDetailCell(row)" @keydown.enter.prevent="value && openDetailCell(row)" @keydown.space.prevent="value && openDetailCell(row)">{{ value || '-' }}</span>
        </template>
      </QueryResultTable>
      <!-- ：审计 >200 条可加载更多（复活孤儿 loadMore/auditHasMore/audit-more） -->
      <div v-if="auditHasMore" class="audit-more">
        <button class="btn ghost sm" :disabled="auditLoading || moreLoading" @click="loadMore">{{ moreLoading ? '加载中…' : '加载更多' }}</button>
      </div>
      <!-- 裸 .empty 迁 EmptyState compact（审计卡内嵌窄态）；补
 !auditLoading 门控——在途骨架与空态互斥（QRT v-if 已含 loadingOps 分支） -->
      <EmptyState v-if="!auditLoading && !auditRows.length && auth.me && !auditErr" compact :icon="ScrollText"
        text="暂无审计记录" hint="写操作与登录会自动落档到 esquerystudio_ops_audit" />

      <!-- 审计详情查看器(长 detail 完整查看+一键复制,不再只有 title 截断) -->
      <n-modal v-model:show="detailOpen" preset="card" title="审计详情" style="width:640px;max-width:92vw" :bordered="false">
        <template #header-extra>
          <button class="btn ghost xs" @click="copyDetailView" title="复制详情"><Copy :size="12" /> 复制</button>
        </template>
        <MetaStrip class="sec-dv-meta" :items="dvBaseItems" v-if="detailRow" />
        <!-- 富维度元信息行——所属集群（实名+连接 ID）/来源 IP/耗时/记录归属（控制台|宿主）
 （原始记录经行尾附挂位直达，四维全量；兜底重建路径仍有 cluster 展示位）。
 手写「·」串合并 MetaStrip items（逐段 v-if 条件同步更新进 dvRichItems，
 模板门控等价改判 items 非空） -->
        <MetaStrip class="sec-dv-meta" :items="dvRichItems" v-if="detailRow && dvRichItems.length" />
        <!-- W-C 批：detail 是自由文本，JSON.parse 试解成功才走 highlightJson（已转义 HTML），失败保持原文 pre；
 平文分支裸插值收口 errPreHtml v-html（转义安全；含 { 的残缺 JSON 尽力着色） -->
        <pre v-if="detailHtml" class="sec-dv-pre mono json-view" v-html="detailHtml"></pre>
        <pre v-else class="sec-dv-pre mono" v-html="detailPlainHtml"></pre>
      </n-modal>
    </div>
      </div>
  </div>
</template>

<script setup lang="ts">
/* 安全中心 —— 我的账号 / 用户管理 / 操作审计 */
import { ref, watch, onMounted, computed, nextTick } from 'vue';
import { NModal } from 'naive-ui';
import {
  ShieldCheck, UserCircle2, Users, UserPlus, Trash2, KeyRound, ShieldAlert, Maximize2, Copy,
  ScrollText, RefreshCw, AlertTriangle, DatabaseZap, Link2, ClipboardList, ChevronDown,
} from 'lucide-vue-next';
  /* Copy 去别名（天罗W6 顺手修）：审计详情弹窗模板用 <Copy> 但 import 历史上别名 CopyIcon
 （全模板 0 引用），运行时恒告警 Failed to resolve component */

import PageHeader from '../components/PageHeader.vue';import { api } from '../api';
import { isBrowserMode } from '../platform/browserApi';
/* 两处裸 .empty 迁 EmptyState compact */
import EmptyState from '../components/EmptyState.vue';
import SkeletonBox from '../components/SkeletonBox.vue';
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* 轨4：审计快滤明面改用统一件（sfbUnify650 锁） */
import { useAuthStore } from '../stores/auth';
import { useAppStore } from '../stores/app';
import { useScopedDraft } from '../composables/useScopedDraft';
import { usePref } from '../composables/urlState'; /* ：审计时间范围落盘（与 LiveDashboard mh2Range 同范式） */

/* 审计表换 QRT rows 型——排序/列漏斗（含 HTTP 区间）/列选/右键/导出归内核，
 宿主漏斗胶水（useColFilters+ColFilterPopover+af-btn）随壳退役（PluginsView 525 W5 同判据）；
 用户表同步换壳后 useTableSort 全退役，import 同步更新删除 */
import QueryResultTable from '../components/QueryResultTable.vue';
import type { CcmItem } from '../components/CellContextMenu.vue';
import { matrixText } from '../utils/copyMatrix';
import { askConfirm } from '../composables/confirm';
import { friendlyEsError } from '../utils/esError';
import { fmtTimeTz, copyText } from '../utils/format';
import { highlightJson, prettyJson } from '../utils/jsonc';
import { errPreHtml } from '../utils/errPre'; /* ：审计详情平文分支 v-html 内核 */
import TimeCell from '../components/TimeCell.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：role/act 私造胶囊改用统一件 */
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue'; /* ：审计详情 meta 串统一件（sec-dv-meta 手写「·」串合并） */

const auth = useAuthStore();
const store = useAppStore();
/* delegated 用户的安全中心语义=展示「宿主菜单勾了什么」而非角色——
 grantedPages 解析为按连接分组的授权摘要（纯函数见 utils/pageGrants.ts） */
import { summarizeGrants } from '../utils/pageGrants';
/* 984：裸键推导会虚报——conn:c1:w:bulk 在 c1 的 env 模板排除 bulk 时后端必 403，
   conn:c1:w:system 因 system 恒定宿主执行也不生效。展示层按与后端同源的
   envAllows + host-bound 归一后再算「可见/可写」，面板与执行门所见即所得。 */
const hostBoundWritePage = (p: string): boolean =>
  p === 'system' || p === 'config-drift' || p === 'security';
const grantSummary = computed(() => {
  const base = summarizeGrants(auth.me?.grantedPages ?? null);
  if (!base.connModel) return base;
  const conns = base.conns.map(g => {
    const visible = g.visible.filter(p => auth.envAllows(p, g.connId));
    /* ADMIN 是全局权限：宿主菜单可能只下发 49 个 w: 键（配置漂移/安全中心/系统索引
       等宿主页不下发连接写键），但后端对 ADMIN 整体放行。展示必须按同一裁决，
       否则会出现「角色写管理员、页面明细却不亮」的自相矛盾。 */
    const writable = auth.isAdmin()
      ? visible.filter(p => auth.envAllows(p, g.connId))
      : g.writable.filter(p => auth.envAllows(p, g.connId)
        && (!hostBoundWritePage(p) || g.connId === 'host'));
    return { ...g, visible, writable };
  });
  const visibleSet = new Set<string>(base.staticKeys ?? []);
  const writableSet = new Set<string>();
  for (const g of conns) {
    for (const p of g.visible) visibleSet.add(p);
    for (const p of g.writable) writableSet.add(p);
  }
  return { ...base, conns, totals: { visible: visibleSet.size, writable: writableSet.size } };
});
const connName = (connId: string): string => store.conns.find(c => c.id === connId)?.name || connId;
/* 页 key → 中文名：me.pages 目录（587 契约含 name）；未收录 key 原样展示（新增页兜底） */
const pageName = (key: string): string => {
  for (const g of auth.me?.pages?.groups ?? []) for (const p of g.pages) if (p.key === key) return p.name;
  return key;
};
/* 目录全部页数（全键判定的分母；目录未就绪时 0=不启用全键收敛，退回逐页枚举） */
const pageCatalogTotal = computed(() => {
  let n = 0;
  for (const g of auth.me?.pages?.groups ?? []) n += g.pages.length;
  return n;
});
/* 全键连接判定——可见页数=目录全部页数且全部可写（超管展开的典型形态） */
const isFullGrant = (g: { visible: string[]; writable: string[] }): boolean =>
  pageCatalogTotal.value > 0 && g.visible.length >= pageCatalogTotal.value
    && g.writable.length >= pageCatalogTotal.value;
/* 补强②：全部连接均全键（超管展开形态）→ 页面授权明细聚合为一行汇总 */
const allConnsFullGrant = computed(() =>
  grantSummary.value.connModel && grantSummary.value.conns.length > 0
    && grantSummary.value.conns.every(g => isFullGrant(g)));
/* ·管理域放开：用户管理归 security 页写勾选（POST /auth/users/upsert 归属 security 页），重绑/连接档案维持 ADMIN */
const canManageUsers = computed(() => auth.canEndpoint('admin', 'POST', '/internal/es/index/auth/users/upsert', store.target)); /* security 页写键可管理普通账号；ADMIN 角色全局可 */
/* 用户列表：后端 GET /auth/users 属 ADMIN 关键词（静态/内置身份只有 ADMIN 可读）；
   连接模型下 security 页读键在页面门裁决后才放行，故非 ADMIN 仅 conn 模型可见。 */
const canReadUsers = computed(() => {
  /* 明确无鉴权/独立挂载（未启动探测）可用；探测中或探测失败(me=null)不得读用户库 */
  if (auth.authDisabled || !auth.probeStarted) return true;
  if (auth.me == null) return false;
  if (auth.isAdmin()) return true;
  const gp = auth.grantedPages;
  return Array.isArray(gp) && gp.some(g => g.startsWith('conn:'))
    && auth.canEndpoint('admin', 'GET', '/internal/es/index/auth/users', store.target);
});
/* 本地账号是全局身份（可绕过页面门/连接写键），服务端只允许 ADMIN 与
   无页面语义的静态身份管理：页面授权（grantedPages 非空）与委派会话即使持
   security 页写键也会被 400 拒绝，前端必须同口径，不能亮出必失败的入口。 */
const canWriteUsers = computed(() => {
  if (auth.authDisabled || !auth.probeStarted) return true;
  if (auth.me == null) return false;
  /* 委派先于 isAdmin()：两者都是 true 时（产线 deng_test_x2）应以委派为准。
     能力层 canEndpoint 同口径已否决，这里保持同序，避免「内置 ADMIN 例外」被读成「委派也例外」。 */
  if (auth.me.delegated) return false;
  if (auth.isAdmin()) return true;
  if (Array.isArray(auth.grantedPages)) return false;
  return canManageUsers.value;
});
/* 拒绝理由要说对：委派超管（宿主授权登录）不是「权限不够」，而是身份来源不允许管理全局账号，
   照着「去要 ADMIN」去沟通只会白跑一趟。 */
const USER_WRITE_DENY_HINT = computed(() => auth.me?.delegated
  ? '当前是宿主授权的委派身份：本地全局账号只能由内置 ADMIN 管理，委派身份仅可查看'
  : '账号管理需要 ADMIN 角色；当前身份只能查看用户与自己的操作流水');
const canAssignAdmin = computed(() => auth.can('admin') && !auth.me?.delegated); /* 委派身份不得建/升本地 ADMIN（后端同口径） */
const canRebind = computed(() => auth.can('admin')); /* 重绑控制集群属系统管理域：ADMIN 角色专属 */

const pwOld = ref('');
const pwNew = ref('');
const pwConfirm = ref('');
const pwBusy = ref(false);

const users = ref<any[]>([]);
/* 修复：用户列表加载状态位（骨架只在在途显示，修复委托鉴权+空账号时骨架无限转圈） */
const usersLoading = ref(false);
const usersErr = ref('');
const auditErr = ref('');
const nuName = ref('');
const nuPass = ref('');
const nuRole = ref('VIEWER');
const nuBusy = ref(false);
/* 新建/更新用户密码统一 ≥6 位（留空=更新时只改角色，不校验长度） */
const nuPassInvalid = computed(() => nuPass.value.length > 0 && nuPass.value.length < 6);

/* 审计筛选条件进 URL（?user=&action=）——合规排查现场可分享/刷新可复原（可重入） */
const fUser = useScopedDraft('user', { route: 'security' }, '').text;
const fAction = useScopedDraft('action', { route: 'security' }, '').text;
/* R9 全栈优化轮：集群筛选下推（服务端 16 参端点 connName 精确过滤） */
const fConn = useScopedDraft('conn', { route: 'security' }, '').text;
/* 自助面（mine）集群筛选——默认当前所选集群（观察口径按集群维度），清空即看全部 */
const fConnMine = ref(currentConnName());
function currentConnName(): string {
  return store.conns.find(c => c.id === store.target)?.name || '';
}
/* 筛选行深化：URI 前缀服务端下推输入 */
const fUri = useScopedDraft('uri', { route: 'security' }, '').text;
/* 值建议：审计索引 terms agg 真实出现值（拉取失败/空=回落硬编码词表，绝不反噬）。
 users 维度（ by_user 聚合，动作/集群/用户三维建议）；：uris 维度（by_uri 真实 Top URI） */
const facets = ref<{ actions: { key: string; count?: number }[]; conns: { key: string; count?: number }[]; users: { key: string; count?: number }[]; uris: { key: string; count?: number }[] } | null>(null);
const connSuggestions = computed(() => facets.value?.conns || []);
const userSuggestions = computed(() => facets.value?.users || []);
const uriSuggestions = computed(() => facets.value?.uris || []);
const BASE_AUDIT_ACTIONS = new Set(['LOGIN', 'LOGIN_FAIL', 'WRITE', 'HIGH_RISK', 'PAGE_DENIED', 'HOST_OP']);
const actionSuggestions = computed(() => (facets.value?.actions || []).filter(a => !BASE_AUDIT_ACTIONS.has(a.key)));
/* 963：audit-facets 归全量审计档（rank3+）——低权不拉必 403 的端点，建议词表随之为空 */
async function loadFacets() {
  if (!canAuditAll.value) { facets.value = null; return; }
  try { facets.value = await api.auth.auditFacets(); } catch { facets.value = null; }
}
const auditRows = ref<any[]>([]);
const auditHasMore = ref(false);
const AUDIT_PAGE = 200;
/* 审计表补 loading 骨架态（users 表同款在途/完成区分）+ selectable 行多选通道
 （users 表同款 @selection-change 接线，批量场景备料） */
const auditLoading = ref(false);
/* 巡查：加载更多自有在途 ref——旧守卫错绑 auditLoading（loadMore 从不置位该
 ref=守卫恒空转），在途双击 fetchAuditPage(同 offset) 双发会重复追加大页行；防重入短路
 +finally 复位（INTERACTION nuBusy 二道防线惯例） */
const moreLoading = ref(false);
const auditSel = ref<unknown[]>([]);
/* 审计详情查看器(长 detail 完整查看,不再只有 title 截断) */
const detailOpen = ref(false);
const detailRow = ref<any>(null);
/* W-C 批：详情体 JSON 试解——合法才产出 highlightHtml（highlightJson 已转义），非法回退原文 pre */
const detailHtml = computed(() => {
  const d = String(detailRow.value?.detail || '');
  try { JSON.parse(d); return highlightJson(prettyJson(d)); } catch { return ''; }
});
/* 平文分支收口 errPreHtml（含 { 走 highlightJson 着色、否则转义平文；空 detail 出占位文案） */
const detailPlainHtml = computed(() => errPreHtml(String(detailRow.value?.detail || '') || '（无详情）'));
function copyDetailView() {
  if (!detailRow.value) return;
  const r = detailRow.value;
  const text = '[' + r.timestamp + '] ' + r.method + ' ' + r.uri + ' -> ' + r.httpStatus + (r.detail ? '\n' + r.detail : '');
  copyText(text).then(ok => store.notify(ok ? 'success' : 'error', ok ? '审计详情已复制' : '复制失败'));
}
/* 审计流水 7 列可排序——按用户/动作/HTTP 聚焦排查 */
/* 审计流水 7 列可排序——按用户/动作/HTTP 聚焦排查 */
/* 时间范围升级为服务端过滤——fRange 换算 sinceMs 下推 store.search
 （range clause），「加载更多」offset 累计仍作用于同一过滤集；前端不再二次过滤 */
const fRange = usePref<'all' | '1h' | '24h' | '7d'>('security.auditRange', 'all'); /* ：时间范围落盘，刷新/重进还原 */

/* ：五区块卡级折叠状态（usePref 落盘，重进还原） */
const collapsed = usePref<Record<string, boolean>>('security.blocks', {});
function toggleBlock(k: string) { collapsed.value[k] = !collapsed.value[k]; }
const RANGE_MS: Record<string, number> = { '1h': 3600e3, '24h': 24 * 3600e3, '7d': 7 * 24 * 3600e3 };
function sinceMsOf(): number | undefined {
  if (fRange.value === 'all') return undefined;
  return Date.now() - RANGE_MS[fRange.value];
}
/* 审计排序/漏斗归 QRT 内核（es_tbl_sort:security:audit 记忆、列头内建漏斗）
 ——宿主 useTableSort(auditRows)/useColFilters 胶水退役；：用户表同步换壳，
 useTableSort 全退役 */
/* ═══ ：审计 QRT rows 型数据映射 ═══
 列=中文键（与旧表头/旧导出 CSV 表头逐字同源）；矩阵值标量化：
 时间列落 epoch ms（QRT 数值比较器对 ISO 串 parseFloat 同年全等会废排序，ms 数值排序
 语义与旧 localeCompare 一致且更稳），显示/导出经 #cell-时间 槽 TimeCell abs / exportCell
 fmtTimeTz 还原；用户列=displayName||username（与旧展示/导出口径一致）。 */
/* 补全：审计表格做全——事件类型 14 维中可表格化的 12 列全上
 （IP/耗时/来源 从详情弹层升列；connId 并入集群列、timestamp 为时间列、原始记录行尾附挂不占列） */
const AUDIT_COLS = ['时间', '用户', '角色', '来源', '动作', '方法', 'URI', '集群', 'IP', 'HTTP', '耗时(ms)', '详情'];
function tsOf(v: any): number | string {
  if (typeof v === 'number') return v;
  const n = Date.parse(String(v ?? ''));
  return Number.isFinite(n) ? n : String(v ?? '');
}
/* 审计 kw 客户端快滤：username/uri/集群(connName||connId) includes，大小写不敏感，空串全量；
 fAction（含 PAGE_DENIED/HOST_OP 芯片）是服务端过滤、先裁数据集；漏斗/排序在 QRT 内核对此行集
 再滤再排 = AND 叠加；TSV/Markdown 复制（getCsvBlock）与导出同为「所见即所复」 */
const adKw = ref('');
const adShown = computed(() => {
  const k = adKw.value.trim().toLowerCase();
  if (!k) return auditRows.value;
  return auditRows.value.filter(r =>
    String(r.username ?? '').toLowerCase().includes(k)
    || String(r.uri ?? '').toLowerCase().includes(k)
    || String(r.connName ?? '').toLowerCase().includes(k)
    || String(r.connId ?? '').toLowerCase().includes(k));
});
/* 集群列（connName 优先实名，缺省回退 connId）——所属集群维度直达审计行；
 行尾第 10 位附加原始记录（QRT 只渲染 cols 声明列、导出按列裁剪，冗余位零感知），
 详情查看器从原记录取全维度（IP/耗时/归属），不再受位置化矩阵丢字段之害 */
const auditMatrix = computed<any[][]>(() => adShown.value.map(r => [
  tsOf(r.timestamp), r.displayName || r.username, r.role, r.source || 'console',
  r.action, r.method, r.uri, r.connName || r.connId || '', r.ip || '',
  r.httpStatus, r.costMs ?? '', r.detail || '', r,
]));
/* 导出/复制矩阵单元格加工：时间列还原 fmtTimeTz（旧 CSV 首列口径），其余恒等直出 */
const auditExportCell = (v: unknown, col: { key: string }) => (col.key === '时间' ? fmtTimeTz(v) : v);
/* 审计详情查看器打开路径不变（槽内优先取行尾附挂的原始记录（全维度），
 兜底按 AUDIT_COLS 列序重建（集群=index 6、HTTP=7、详情=8——旧数据防御位） */
const auditQrt = ref<InstanceType<typeof QueryResultTable> | null>(null);
function openDetailCell(row: any[]) {
  const src = row[12] && typeof row[12] === 'object' ? row[12] : null;
  detailRow.value = src ?? {
    timestamp: row[0], username: row[1], role: row[2], source: row[3],
    action: row[4], method: row[5], uri: row[6], cluster: row[7],
    ip: row[8], httpStatus: row[9], costMs: row[10], detail: row[11] || '',
  };
  detailOpen.value = true;
}

/* 用户表换 QRT rows 型（排序/漏斗归内核，宿主 useTableSort 胶水退役）：
 列=中文键（与旧表头逐字同源）；更新列落 epoch ms（QRT 数值比较器排序，与审计时间列
 同口径），显示经 #cell-更新 槽 TimeCell abs 还原 */
const US_COLS = ['用户名', '角色', '更新'];
const usMatrix = computed<any[][]>(() => users.value.map(u => [u.username, u.role, tsOf(u.updatedAt)]));
/* selectable 行多选通道（批量场景）：selection-change 上报原始用户对象数组 */
const usSel = ref<unknown[]>([]);

/* 控制集群状态 + 重绑 */
const setup = ref<{ bound: boolean; mode: string; endpoint: string | null; appName: string; setupTokenRequired?: boolean } | null>(null);
/* 巡查：loadSetup 在途 ref（刷新安全状态钮守卫+spinning；713 族） */
const setupLoading = ref(false);
async function loadSetup() {
  setupLoading.value = true;
  try { setup.value = await api.setup.status(); } catch { setup.value = null; }
  finally { setupLoading.value = false; }
}
const rbUrl = ref('');
const rbUser = ref('');
const rbPass = ref('');
const rbToken = ref('');
const rbBusy = ref(false);

function roleDesc(role: string) {
  /* 6 角色全覆盖——新角色落兜底「只读」会让权限自述失真（w66 回归）；文案与下方下拉框选项一致 */
  return role === 'ADMIN' ? '高危全权：重建/迁移/删除/别名/集群设置/用户管理'
    : role === 'OPERATOR' ? '低危写：文档编辑等普通写操作'
    : role === 'REBUILD_OP' ? '重建/迁移/回滚专项'
    : role === 'CLUSTER_OP' ? '索引/集群管理专项'
    : role === 'AUDIT_OP' ? '审计日志查看专项'
    : '只读：全部查询与观测（含 DSL/SQL/分词/渲染试跑）';
}

/* ═══ ：安全中心可读性+便捷性改造（用户截图插队）═══ */
/* 角色说明结构化数据源（复用 roleDesc 文案，单一事实源） */
const ROLE_ROWS = ['VIEWER', 'OPERATOR', 'REBUILD_OP', 'CLUSTER_OP', 'AUDIT_OP', 'ADMIN'];
/* 控制集群模式中文说明（未知模式原样展示，不猜不编） */
const MODE_TIP: Record<string, string> = {
  BOOTSTRAP: '引导模式：控制集群地址由应用配置指定，账号与审计数据存于此集群',
  SPRING: 'Spring 模式：控制集群地址由宿主配置显式指定（跳过档案与探测），首次连接向导不出现',
  NONE: '未绑定：无自举档案且宿主 ES 不可达，等待首次连接向导绑定控制集群',
};
/* 审计动作代码中文映射（未知代码原样）；补宿主贡献动作 HOST_OP */
const ACTION_ZH: Record<string, string> = {
  PAGE_DENIED: '页面被拒', PAGE_VIEW: '页面访问', LOGIN: '登录', LOGIN_FAIL: '登录失败',
  WRITE: '写操作', HIGH_RISK: '高危操作', READ: '读取', RAW: 'raw 透传',
  HOST_OP: '宿主操作',
};
function actionZh(a: string) { return ACTION_ZH[a] ?? a; }

/* ═══ ：role-tag×4 / act-tag 私造胶囊改用 StatusPill 统一件，tone 映射表 ═══
 原私造配色 → 既有五档映射（色语义就近归档，全档归 theme.css .pill 单源）：
 · 角色：ADMIN(err 高危全权)→r；OPERATOR(warn 低危写)→y；REBUILD_OP(orange→y 写专项)；
 VIEWER(只读 read→g)；CLUSTER_OP(ac→b 集群管理)；AUDIT_OP(violet→n 中性观测)
 · 动作：LOGIN(ok)→g；LOGIN_FAIL(err)→r；WRITE(write 语义→y)；HIGH_RISK(err)→r；
 PAGE_DENIED(warn→y)；READ(read→g)；PAGE_VIEW/RAW/未知码→n */
const ROLE_TONE: Record<string, 'g' | 'y' | 'r' | 'b' | 'n'> = {
  ADMIN: 'r', OPERATOR: 'y', REBUILD_OP: 'y', VIEWER: 'g', CLUSTER_OP: 'b', AUDIT_OP: 'n',
};
function roleTone(role: string): 'g' | 'y' | 'r' | 'b' | 'n' {
  return ROLE_TONE[String(role).toUpperCase()] ?? 'n';
}
const ACT_TONE: Record<string, 'g' | 'y' | 'r' | 'b' | 'n'> = {
  LOGIN: 'g', LOGIN_FAIL: 'y', WRITE: 'b', HIGH_RISK: 'r', PAGE_DENIED: 'y', READ: 'g',
  HOST_OP: 'b',
};
function actTone(a: string): 'g' | 'y' | 'r' | 'b' | 'n' {
  return ACT_TONE[String(a).toUpperCase()] ?? 'n';
}
/* URI 短显示：剥掉所有行相同的 /internal(/es) 路由前缀噪音，hover 看全量 */
function shortUri(u: string) {
  const s = String(u ?? '');
  const stripped = s.replace(/^\/internal(\/es)?(\/index)?/, '');
  return stripped || s;
}

/* ═══ ：审计详情弹窗两串手写「·」meta 合并 MetaStrip 统一件（items 双源） ═══
 基础串=用户/方法/URI/HTTP/时间五段（RemoteClusters rc-card-meta 同构：值亮+标签暗+
 ·分隔）；方法色档 .m-* 色轮归 MetaStrip tone 语义档就近映射（GET 绿→ok / POST 黄→warn /
 PUT 紫→info / DELETE 红→err / HEAD 蓝→info；色值归 theme token 单源，映射）。
 富维度串=集群（实名+连接 ID 括号副文案随 label）/IP/耗时/归属，555 四锚语义逐段同步更新。 */
const METHOD_TONE: Record<string, 'ok' | 'warn' | 'err' | 'info'> = {
  GET: 'ok', POST: 'warn', PUT: 'info', DELETE: 'err', HEAD: 'info',
};
const dvBaseItems = computed<MetaStripItem[]>(() => {
  const r = detailRow.value;
  if (!r) return [];
  const mt = METHOD_TONE[String(r.method || '').toUpperCase()];
  return [
    { value: r.displayName || r.username },
    { value: String(r.method || ''), ...(mt ? { tone: mt } : {}) },
    { value: shortUri(r.uri) },
    { value: String(r.httpStatus), label: 'HTTP' },
    { value: fmtTimeTz(r.timestamp) },
  ];
});
const dvRichItems = computed<MetaStripItem[]>(() => {
  const r = detailRow.value;
  if (!r) return [];
  const items: MetaStripItem[] = [];
  if (r.connName || r.connId) {
    const both = r.connName && r.connId && r.connName !== r.connId;
    items.push({ value: r.connName || r.connId, label: both ? `集群（${r.connId}）` : '集群' });
  } else if (r.cluster) {
    items.push({ value: String(r.cluster), label: '集群' });
  }
  if (r.ip) items.push({ value: String(r.ip), label: 'IP' });
  if (r.costMs != null) items.push({ value: String(r.costMs), unit: 'ms', label: '耗时' });
  if (r.source) items.push({ value: r.source === 'host' ? '宿主贡献' : '控制台' });
  return items;
});
/* 空态直达：预置 ADMIN 角色 + 聚焦用户名输入框 */
const nuNameRef = ref<HTMLInputElement | null>(null);
function presetAdmin() {
  if (!canAssignAdmin.value) return;
  nuRole.value = 'ADMIN';
  nextTick(() => nuNameRef.value?.focus());
}
/* 页面目录总数（me 响应 pages 契约） */
const pageCount = computed(() => (auth.me?.pages?.groups || []).reduce((n: number, g: any) => n + (g.pages?.length || 0), 0));

async function doChangePw() {
  /* Enter 直提绕过校验的修复——校验+防重入收进函数体，与按钮 disabled 同一门禁 */
  if (pwBusy.value) return;
  if (!pwOld.value || pwNew.value.length < 6 || pwConfirm.value !== pwNew.value) {
    store.notify('error', '请检查输入：旧密码必填、新密码 ≥6 位且两次一致');
    return;
  }
  pwBusy.value = true;
  try {
    const r = await api.auth.changePassword(pwOld.value, pwNew.value);
    pwOld.value = ''; pwNew.value = ''; pwConfirm.value = '';
    if (r.relogin) {
      store.notify('success', '正式账号已建立，请用新密码重新登录');
      auth.logout();
    } else {
      store.notify('success', '密码已修改');
    }
  } catch (e: any) {
    /* ES 错误友好化——裸 message 换全站 friendlyEsError 口径（同文件 loadUsers/loadAudit 同款） */
    store.notify('error', '修改失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally {
    pwBusy.value = false;
  }
}

/* 2.1.6：写后刷新与手动刷新可叠加——旧名单晚到会把刚创建/修改的账号"变没"；
 世代计数让过期包（成功/失败/复位）整包作废。 */
let usersSeq = 0;
async function loadUsers() {
  if (!canReadUsers.value) return;
  /* -A2：失败不再静默吞成空列表，页面级透传 + 重试。
 修复：usersLoading 状态位——骨架只在「在途」显示，
 加载完成但为空走空态（委托鉴权+无正式账号时骨架曾无限转圈并叠加空态） */
  const seq = ++usersSeq;
  usersLoading.value = true;
  try {
    const list = await api.auth.users();
    if (seq !== usersSeq) return;
    users.value = list;
    usersErr.value = '';
  } catch (e: any) {
    if (seq !== usersSeq) return;
    users.value = [];
    usersErr.value = friendlyEsError(String(e?.message ?? e));
  } finally { if (seq === usersSeq) usersLoading.value = false; }
}

async function doUpsert() {
  /* 委派非 ADMIN 不得写全局账号（服务端同口径）。提示而非静默 return：
     按钮虽隐藏，Enter/程序化入口仍应给得出理由（「缺什么」而非「点了没反应」）。 */
  if (!canWriteUsers.value) { store.notify('warning', USER_WRITE_DENY_HINT.value); return; }
  if (!canAssignAdmin.value) {
    const target = users.value.find((u: any) => u.username === nuName.value);
    if (nuRole.value === 'ADMIN' || target?.role === 'ADMIN') {
      store.notify('error', '仅 ADMIN 可授予/修改 ADMIN 账号');
      return;
    }
  }
  if (nuBusy.value) return; /* 函数体级防重入（按钮 disabled 之外的第二道防线） */
  /* 闸置位先于确认窗——确认窗挂起期间保存钮已禁用，二击不穿透双开确认窗（双发写动作） */
  nuBusy.value = true;
  try {
    /* 用户名已存在 = 更新而非新建：会覆盖对方角色（填了密码还会重置其登录凭证），
     不许再静默提交——先弹确认拿到管理员点头。点取消不动任何数据（finally 复位）。 */
    if (users.value.some((u: any) => u.username === nuName.value) && !await askConfirm({
      title: '更新已有用户',
      message: `用户 ${nuName.value} 已存在：将更新其角色${nuPass.value ? '，并重置其密码' : ''}。确认提交？`,
      okText: '更新用户',
    })) return;
    await api.auth.upsertUser(nuName.value, nuPass.value || undefined, nuRole.value);
    store.notify('success', `用户 ${nuName.value} 已保存`);
    nuName.value = ''; nuPass.value = '';
    loadUsers();
  } catch (e: any) {
    /* ES 错误友好化（同上款口径） */
    store.notify('error', '保存失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally {
    nuBusy.value = false;
  }
}

/* 提交防重（INTERACTION 范式）：删除在途时双击/重入直接短路（同 nuBusy 二道防线惯例）；
   闸置位先于确认窗——critical 确认窗挂起期间行内删除钮已禁用，二击不穿透双发 */
const deleting = ref(false);
async function doDelete(username: string) {
  /* 同 doUpsert：静默 return 会变成「点了没反应」，给原因。 */
  if (!canWriteUsers.value) { store.notify('warning', USER_WRITE_DENY_HINT.value); return; }
  if (!canAssignAdmin.value) {
    const target = users.value.find((u: any) => u.username === username);
    if (target?.role === 'ADMIN') {
      store.notify('error', '仅 ADMIN 可删除 ADMIN 账号');
      return;
    }
  }
  if (deleting.value) return;
  deleting.value = true;
  try {
    if (!await askConfirm({
      title: '删除用户',
      level: 'critical',
      guardText: username,
      message: `将删除用户「${username}」，其登录态立即失效；操作审计记录会保留，但账号本身不可恢复。输入用户名以确认。`,
      okText: '删除用户',
    })) return;
    await api.auth.deleteUser(username);
    store.notify('success', `用户 ${username} 已删除`);
    loadUsers();
  } catch (e: any) {
    /* ES 错误友好化（同上款口径） */
    store.notify('error', '删除失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally {
    deleting.value = false;
  }
}

/* 用户表行级操作组（并入 QRT 单元格右键）：复制用户名/角色为只读；删除复用
   doDelete 的完整权限链与 critical 确认，不在菜单里另开写通道。 */
function copyUserValue(text: string, label: string) {
  void copyText(text).then(ok => store.notify(ok ? 'success' : 'error', ok ? `已复制${label}` : '复制失败'));
}
function userRowAction(row: any[]): CcmItem | null {
  const username = String(row?.[0] ?? '');
  if (!username) return null;
  const role = String(row?.[1] ?? '');
  const children: CcmItem[] = [
    { key: 'user-copy-name', label: '复制用户名', icon: Copy, run: () => copyUserValue(username, '用户名') },
  ];
  if (role) children.push({ key: 'user-copy-role', label: '复制角色', icon: Copy, run: () => copyUserValue(role, '角色') });
  if (canWriteUsers.value) {
    children.push({ key: 'user-del', label: '删除用户', icon: Trash2, danger: true, sep: true, run: () => { void doDelete(username); } });
  }
  return { key: 'user-ops', label: '用户操作…', icon: Users, children };
}

async function fetchAuditPage(offset: number): Promise<{ rows: any[]; hasMore: boolean }> {
  /* 全量（rank3+）走 opsAudit；其余角色走 opsAuditMine（username 服务端强制=自己）。
 R9 全栈优化轮：全量态集群筛选下推（connName 精确服务端过滤）；：URI 前缀下推接活
 （ 输入挂了但通道缺失的死输入，后端 uriPrefix 形参在案，此处补通透传） */
  const r = canAuditAll.value
    ? await api.auth.opsAudit(fUser.value || undefined, fAction.value || undefined, AUDIT_PAGE, offset, sinceMsOf(), fConn.value || undefined, fUri.value || undefined)
    : await api.auth.opsAuditMine(fAction.value || undefined, AUDIT_PAGE, offset, sinceMsOf(), fConnMine.value || undefined);
  /* 后端线缆改 {records:[...]}——扁平键直出，ES hits 包装在存储实现内终结 */
  const rows = r?.records || [];
  return { rows, hasMore: rows.length === AUDIT_PAGE };
}

async function loadAudit() {
  if (!auth.me) return;
  /* 在途互斥闸：闸读收本体首行（loadMore 的 moreLoading 短路同形收敛）——九通道
 执行体（两下拉/仅看被拒/刷新/筛选回车/重试/挂载/角色切换）在途窗内的叠加拍被闸挡，
 旧筛选慢包后到顶掉新筛选结果的双拍交错随之消除 */
  if (auditLoading.value) return;
  auditLoading.value = true;
  try {
    const { rows, hasMore } = await fetchAuditPage(0);
    auditRows.value = rows;
    auditHasMore.value = hasMore;
    auditErr.value = '';
  } catch (e: any) { auditRows.value = []; auditHasMore.value = false; auditErr.value = friendlyEsError(String(e?.message ?? e)); }
  finally { auditLoading.value = false; }
}

async function loadMore() {
  if (!auth.me) return;
  if (moreLoading.value) return;
  moreLoading.value = true;
  try {
    const { rows, hasMore } = await fetchAuditPage(auditRows.value.length);
    auditRows.value = [...auditRows.value, ...rows];
    auditHasMore.value = hasMore;
  } catch (e: any) { store.notify('error', '加载更多失败：' + friendlyEsError(String(e?.message ?? e))); }
  finally { moreLoading.value = false; }
}

/* 审计「导出 CSV」按钮随换壳退役——QRT 工具行内建 CSV/MD/XLSX/PNG 接管
 （export-name → sec-audit-<exportStamp()>.csv，exportStamp 由内核拼装；
 前缀更名 sec-audit 与页域 security:* 记忆键同源，「语义前缀-本地时间戳」口径不变；
 行集/列集走内核排序+漏斗所见即所得） */

/* 天罗W6：审计复制矩阵（copyMatrix TSV）——数据源改走 QRT ref.getCsvBlock()
 （漏斗筛选+排序+列选所见即所复；单元格已经 exportCell 管道加工=时间列 fmtTimeTz） */
async function copyAuditTsv() {
  const blk = auditQrt.value?.getCsvBlock();
  if (!blk || !blk.rows.length) { store.notify('warning', '无表格结果可导出'); return; }
  const head = blk.head;
  const ok = await copyText(matrixText({ rows: blk.rows, cols: head, getVal: (row: any[], c: string) => row[head.indexOf(c)] }, 'tsv'));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${blk.rows.length} 条审计记录（TSV）` : '复制失败');
}

/* 补/208：审计 Markdown 复制（群聊/工单直贴）——行集改走
 getCsvBlock()（所见即所复）；表头=内核列名（中文键，与旧 | 时间 | 用户 |…| 逐字同源）；
 动作列中文映射（actionZh）与详情 '-' 兜底在此还原（内核矩阵存原码） */
async function copyAuditMd() {
  const blk = auditQrt.value?.getCsvBlock();
  if (!blk || !blk.rows.length) { store.notify('warning', '无表格结果可导出'); return; }
  const head = blk.head;
  const ai = head.indexOf('动作');
  const di = head.indexOf('详情');
  const esc = (v: any) => String(v ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
  const md = [
    '| ' + head.join(' | ') + ' |',
    '| ' + head.map(() => '---').join(' | ') + ' |',
    ...blk.rows.map(r =>
      '| ' + head.map((c, ci) => esc(ci === ai ? actionZh(String(r[ci] ?? '')) : (ci === di ? (r[ci] || '-') : r[ci]))).join(' | ') + ' |'),
  ].join('\n');
  const ok = await copyText(md);
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${blk.rows.length} 条审计记录（Markdown）` : '复制失败');
}

async function doRebind() {
  if (!canRebind.value) return; /* 963 执行体守卫：重绑=setup/rebind 连接级高危写，无权限直调也拦 */
  /* 在途互斥闸：闸读收本体首行+置位先于确认窗——确认窗挂起期间重绑钮已禁用，
     二击不穿透双发（重绑是集群级高危写）；取消/失败路径 finally 复位防闸死，
     成功路径保持置位至 reload（提交已落定，不再接受二次发起） */
  if (rbBusy.value) return;
  rbBusy.value = true;
  let submitted = false;
  try {
    if (!await askConfirm({
      title: '重绑控制集群',
      level: 'critical', guardText: 'REBIND',
      message: `将控制集群重绑到 ${rbUrl.value}：新集群上幂等初始化控制索引；现有用户/连接档案/审计不会自动迁移，重绑后可能需重新登录建号。输入 REBIND 确认。`,
      okText: '重绑集群',
    })) return;
    await api.setup.rebind({ url: rbUrl.value, username: rbUser.value || undefined, password: rbPass.value || undefined },
      setup.value?.setupTokenRequired ? rbToken.value : undefined);
    submitted = true;
    store.notify('success', '控制集群已重绑，即将刷新页面');
    setTimeout(() => window.location.reload(), 800);
  } catch (e: any) {
    /* ES 错误友好化（同上款口径） */
    store.notify('error', '重绑失败：' + friendlyEsError(String(e?.message ?? e)));
  } finally {
    if (!submitted) rbBusy.value = false;
  }
}

onMounted(() => { loadUsers(); loadAudit(); loadSetup(); if (canAuditAll.value) loadFacets(); });
/* 修复首屏审计/用户列表空——身份探测（probe）是异步的，onMounted 时 isAdmin() 可能
 还是 false 被静默跳过，靠手动刷新才出数据。身份就绪后自动补拉一次。
 身份就绪即补拉（任意角色——非审计角色也有「我的操作流水」要看） */
const canAuditAll = computed(() => auth.canAuditAll(store.target));
watch(() => auth.me?.role, (role, old) => {
  if (role && old !== role) { loadUsers(); loadAudit(); }
});
/* 无鉴权部署没有 role 跃迁：探测明确 404 后补拉用户/审计，不能停在首屏空态 */
watch(() => auth.authDisabled, (disabled) => {
  if (disabled) { loadUsers(); loadAudit(); if (canAuditAll.value) loadFacets(); }
});
/* 963：建议词表随全量审计档同步——身份就绪/升档补拉 audit-facets（低权端点必 403，降档即清空）。
   独立 watch 而非并入上方 role watch：档位是角色派生物，canViewAllAudit 映射变化（AUDIT_OP 等）也要跟随 */
watch(canAuditAll, (v) => {
  if (v) { loadFacets(); return; }
  /* 降档（宿主收回 security/全量审计授权，角色可能不变）必须立刻清掉已加载的全量流水，
     再按自助口重拉，不能把上一权限档看到的数据留在表里。 */
  facets.value = null;
  auditRows.value = [];
  auditHasMore.value = false;
  auditSel.value = [];
  void loadAudit();
});
</script>

<style scoped>
/* 页头样式已收敛 PageHeader 组件，本地同值块删除 */
.fb-banner {
  display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-4); padding: var(--sp-2) var(--sp-4);
  font-size: var(--fs-sm); color: var(--warn); border: 1px solid var(--warn-line);
  background: var(--warn-soft); border-radius: var(--r-m);
}

.sec-grid { display: grid; grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); gap: var(--sp-4); margin-bottom: var(--sp-4); }
@media (max-width: 1100px) { .sec-grid { grid-template-columns: minmax(0, 1fr); } }

/* 天罗W6：scoped .card 重定义整条删除——背景/边框/圆角/内边距与全局 .card（theme.css）
 同值，仅 10px 圆角离队；删后归档全局（radius 走 --r-l token），不再双轨。
 .card-title 与全局 .card-t 逐属性等值（gap 8px/--sp-2 同值），改名并轨；
 .sm 二档同步升 theme.css（与 .card-t 同处），scoped 双档声明随之退役 */
.right { margin-left: auto; }
.divider { border-top: 1px dashed var(--line); margin: var(--sp-3) 0; }

/* 四张顶层 .card 壳（theme.css 三件套）退役 → border-top 分节（约定④；
 XmigrateView xm-new/xm-res 同语言），card-t 行首横排标题保留；
 原卡 padding（14px var(--sp-4)）等值迁入分节（盒模型零变动，高度结构零触） */
.me-card, .us-card, .ctl-card, .audit-card { border-top: 1px solid var(--border); padding: 14px var(--sp-4); }

.me-rows { display: flex; flex-direction: column; gap: var(--sp-2); }
/* ④ 豁免：.me-row=两栏定义列表（label 左 value 右 space-between 纵排），MetaStrip=inline
 串（值前标签后）——形态语义不同构，且行内嵌 StatusPill/「模式+说明」双值列超出 MetaStrip item
 契约；强收=布局语义变更（651「精确等值才收，形态不同构豁免」同族约定，勿再合并） */
.me-row { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-2h); font-size: var(--fs-sm); }
.me-row > span:first-child { color: var(--tx2); flex-shrink: 0; }
/* 修复：委托账号是长 SSO ID（fs_ou_23627…），不断行会把「用户名」标签挤成竖排——
 值区允许断行 + 截断显示，hover 看全量 */
.me-row > b { min-width: 0; overflow-wrap: anywhere; word-break: break-all; text-align: right; }
.w100 { width: 100%; margin-bottom: var(--sp-2); }

/* role-tag 六色 / act-tag 五色私造配色胶囊随 StatusPill 改用退役
 （色档归 theme.css .pill 五档单源，映射表见 script ROLE_TONE/ACT_TONE）；
 role-pill 只留对照清单落位（原 role-tag 的 min-width 对齐语义同步更新，.pill 自带居中） */
.role-pill { flex-shrink: 0; min-width: 92px; justify-content: center; }

/* 表单行内校验红字（改密二次确认 / 新用户密码最短位） */
.ipt-err { color: var(--err); font-size: var(--fs-xs); line-height: 1.5; }
.new-user .ipt-err { grid-column: 1 / -1; }

/* scoped .tbl 全家随用户表换 QRT 壳退役（表头/行语言归内核单一出处） */
.danger { color: var(--err); }

.new-user { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(130px, 170px) auto; gap: var(--sp-2); align-items: center; }
/* .sel 的 appearance:auto 已移除——交给 theme.css 的 select[class] 全局自绘箭头 */
/* 角色说明从一段长文案结构化为对照清单（原 role-legend 一行式弃用） */
.role-rows { display: flex; flex-direction: column; gap: 3px; margin-top: var(--sp-2); font-size: var(--fs-xs); }
.role-row { display: flex; gap: var(--sp-2); align-items: baseline; }
/* 「仅看被拒」聚焦态（红色系=拒绝语义） */
.audit-card .btn.on { color: var(--err); border-color: var(--err); background: var(--err-soft); }
.page-catalog { margin-top: var(--sp-3); font-size: var(--fs-sm); }
.page-catalog summary { font-weight: 600; color: var(--tx1); }
.page-catalog-body { margin-top: var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-2); max-height: 320px; overflow: auto; }
.pc-group-name { display: block; font-size: var(--fs-xs); color: var(--ac-hi); margin-bottom: var(--sp-1); }
.pc-pages { display: flex; flex-wrap: wrap; gap: var(--sp-1); } /* 芯片本体已合并全局 .chip.static（④ G30），容器为布局层保留 */
.pc-ver { color: var(--warn); margin-left: var(--sp-1); }

.audit-card .sm-ipt { width: 140px; margin-left: var(--sp-2); }
/* 轨4：快滤明面 SFB 落位类（input-class sm-ipt 仅运行时锚，scoped 样式不再命中内层 input） */
.audit-card .sv-adkw { width: 140px; height: 30px; margin-left: var(--sp-2); padding: 0 var(--sp-2); font-size: var(--fs-sm); }

/* ：区块折叠钮（chevron 折叠态 -90°，只动 transform 不触发布局） */
.sec-fold { background: transparent; border: none; color: var(--muted); cursor: pointer; padding: 0; display: inline-flex; align-items: center; flex-shrink: 0; }
.sec-fold:hover { color: var(--tx0); }
.sec-fold svg { transition: transform var(--dur-fast) var(--ease-out); }
.sec-fold.folded svg { transform: rotate(-90deg); }

/* ：审计工具行 ⋯ 溢出（复用 ld-hist-more 同语汇）； 断点兜底 */
.audit-card .card-t { flex-wrap: wrap; row-gap: var(--sp-1); }
.ad-more { position: relative; flex: 0 0 auto; }
.ad-more-sum { list-style: none; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border: 1px solid var(--line); border-radius: var(--r-s); background: var(--bg1); color: var(--tx2); font-size: var(--fs-md); line-height: 1; }
.ad-more-sum::-webkit-details-marker { display: none; }
.ad-more-sum:hover { color: var(--tx0); border-color: var(--ac-line); }
.ad-more[open] .ad-more-sum { color: var(--tx0); border-color: var(--ac-line); }
.ad-more-pop { position: absolute; right: 0; top: calc(100% + var(--sp-1)); z-index: var(--z-popover); display: flex; flex-direction: column; gap: var(--sp-2h); min-width: 280px; padding: var(--sp-2h) var(--sp-3); background: var(--bg1); border: 1px solid var(--line-strong); border-radius: var(--r-m); box-shadow: var(--shadow-pop); }
.ad-more-pop .sm-ipt { width: 100%; margin-left: 0; }
.ad-more-acts { display: flex; justify-content: flex-end; gap: var(--sp-2); padding-top: var(--sp-1); border-top: 1px solid var(--line); }

.uri { max-width: 42vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.audit-more { padding: var(--sp-2) 0; text-align: center; }
/* act-tag/a-* 五色私造配色随 StatusPill 改用退役（映射表见 script） */
.err-txt { color: var(--err); }
.ok-txt { color: var(--ok); }

.ctl-card { margin-bottom: var(--sp-4); }
.rebind-row { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr auto; gap: var(--sp-2); align-items: center; }
/* 两处单行 900 重复档并档为一档（1100+900 两块标准形态）——new-user/rebind-row
 两规则逐条等值迁移零删规则（responsive900Sweep529 纪律口径：档内非空、无 ≥300px 裸 width） */
@media (max-width: 900px) {
  .new-user { grid-template-columns: minmax(0, 1fr); }
  .rebind-row { grid-template-columns: minmax(0, 1fr); }
}
.sec-skel { padding: var(--sp-3) var(--sp-0) var(--sp-1h); }

/* ═══ ：审计列筛选漏斗（.af-btn 全家）随换 QRT 壳退役——漏斗（含 HTTP 数值
 区间，fieldTypes long → 内建 isRangeCol）归 QRT 内建 .qrt-funnel + ColFilterPopover ═══ */
.pg-conn + .pg-conn { border-top: 1px solid var(--line); }
.pg-conn details { padding: var(--sp-1) 0; }
.pg-conn-sum { cursor: pointer; display: flex; align-items: center; gap: var(--sp-2); list-style: none; }
.pg-conn-sum::-webkit-details-marker { display: none; }
.pg-conn-sum::before { content: '▸'; color: var(--tx2); font-size: var(--fs-2xs); transition: transform 0.15s; }
.pg-conn details[open] .pg-conn-sum::before { transform: rotate(90deg); }
.pg-conn-sum:hover { color: var(--tx0); }
.pg-pages { display: flex; flex-wrap: wrap; gap: var(--sp-1); padding: var(--sp-1) var(--sp-2) 0; }
/* ：页面授权 chip 共用全局 .chip（.chip.static 非交互基座），
 可写修饰 .pg-w 品牌色保留（.pg-chip 自绘基座退役） */
.pg-w { color: var(--brand); border-color: color-mix(in srgb, var(--brand) 45%, transparent); }
.pg-w b { font-weight: 600; margin-left: var(--sp-0); }
.us-card { grid-column: 1 / -1; } /* ：用户管理表格需要全宽（窄列挤压修复） */
/* 只读区块说明（重绑等 ADMIN 专属区块隐藏时不留无解释的空缺；IlmView ilm-perm-note 同款） */
.sec-ro-note { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); margin-top: var(--sp-2); }
/* 纯浏览器模式：服务端账号/控制集群区块不属于本模式，只保留本机操作审计 */
.sec-browser-note { display: flex; align-items: flex-start; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx1); font-size: var(--fs-xs); line-height: 1.6; margin-bottom: var(--sp-3); }
.sec-browser .me-card, .sec-browser .us-card, .sec-browser .ctl-card, .sec-browser .fb-banner { display: none; }
</style>
