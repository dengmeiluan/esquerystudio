<template>
  <!-- 身份已落地但本页无读权：直接给授权说明，不渲染任何工具栏（避免「看得见点不了」） -->
  <EmptyState v-if="auth.probed && !pageVisible" :icon="ShieldAlert"
    text="暂无「Dev Tools」功能权限"
    hint="当前账号未被授予该功能页面。请联系管理员在「角色权限 → 勾选对应菜单」中开通。" />
  <div v-else class="dt-page">
    <!-- 执行中局部进度条（对齐 DslQuery dq-progress 范式——执行反馈不止按钮文字） -->
    <div v-if="cur" class="dt-progress ind-bar" :class="{ on: cur.busy }"></div>
    <PageHeader :icon="TerminalSquare" title="Dev Tools · 多标签 REST 控制台">
      <template #subtitle>
        Kibana 风格 · 每个 Tab 独立请求历史 · 一键运行 · sessionStorage 持久化 ·
        <b>{{ tabs.length }}</b> 个标签
      </template>
      <template #actions>
        <button class="btn ghost sm" @click="addTab">
          <Plus :size="12" /> 新 Tab
        </button>
        <button class="btn ghost sm" :disabled="resetting" @click="reset" title="清空全部">
          <RotateCcw :size="12" /> 重置
        </button>
        <button class="btn ghost sm" title="查看当前身份在本页与当前连接下允许的操作（与后端拦截器判定同源）" @click="permOpen = true"><Shield :size="12" /> 我的权限</button>
        <button class="btn ghost sm" data-test="open-mcp" title="MCP 接入：服务端 /mcp 或浏览器模式本机 JSON-RPC" @click="mcpOpen = true">MCP</button>
        <!-- 变量（Kibana Console「Variables」对位）——此前只在 DSL 页能管，REST 控制台
             用户按 Kibana 习惯写 ${var} 却无处填值；补同一入口，执行时按路径/JSON 体分别展开 -->
        <button class="btn ghost sm" title="管理变量 ${var}：路径里按字符串替换，JSON 体内按类型注入" @click="varsOpen = true">
          <Variable :size="12" /> 变量<span v-if="varsCount" class="dt-vars-n mono">{{ varsCount }}</span>
        </button>
      </template>
    </PageHeader>

    <!-- 后：tab 聚焦后 ←/→ 切换标签（重命名输入中豁免，光标语义优先） -->
    <!-- 完整 ARIA tabs 语义（tablist/tab/aria-selected）——修正 453b
 在 role=button 的 tab 内嵌 input/button 的违规（button 内禁交互子元素） -->
    <div class="dt-tabs" role="tablist" aria-label="REST 请求标签" @keydown="onTabsKeydown">
      <!-- 中键关闭（浏览器标签惯例）——多标签高频用户的快速关闭路径 -->
      <!-- 双击标题重命名（自定义名执行不覆盖；Esc 取消）——多标签高频用户区分现场 -->
      <div v-for="(t, i) in tabs" :key="t.id" class="dt-tab" :class="{ active: i === active }"
        role="tab" :aria-selected="i === active" :tabindex="i === active ? 0 : -1"
        @click="renamingIdx !== i && (active = i)" @mousedown.middle.prevent="closeTab(i)"
        @contextmenu.prevent="openTabMenu($event, i)" @keydown="onTabMenuKey($event, i)"
        @dblclick.self="startRename(i)" @keydown.enter.prevent="renamingIdx !== i && (active = i)"
        @keydown.space.self.prevent="renamingIdx !== i && (active = i)">
        <input v-if="renamingIdx === i" v-model="renameVal" class="dt-tab-ren mono" :aria-label="'重命名标签 ' + (i + 1)"
          @keydown.enter.prevent="commitRename(i)" @keydown.esc.prevent="renamingIdx = null"
          @blur="commitRename(i)" @click.stop v-focus />
        <span v-else class="dt-tab-tt" :title="t.title + '（双击重命名）'">{{ t.title }}</span>
        <!-- 语义色轮：执行中 tab 活体脉冲点（dot-pulse 全站语言）——busy 期间切走也看得出哪个 tab 在跑 -->
        <span v-if="t.busy" class="dt-tab-busy dot-pulse" aria-hidden="true"></span>
        <button v-if="tabs.length > 1" class="dt-tab-x" :aria-label="'关闭标签 ' + t.title" title="关闭标签" @click.stop="closeTab(i)"><X :size="10" /></button>
      </div>
      <div class="dt-tab-add" role="button" tabindex="0" aria-label="新建标签" title="新建标签" @click="addTab" @keydown.enter.prevent="addTab" @keydown.space.prevent="addTab">+</div>
    </div>

  <!-- 请求标签右键：批量关标签是浏览器标签页的肌肉记忆，此前只能逐个点 ×；分组收口避免平铺 -->
  <CellContextMenu v-if="tabMenu" :x="tabMenu.x" :y="tabMenu.y" :title="'标签 · ' + (tabs[tabMenu.i]?.title || '')"
    :items="tabMenuItems" @close="tabMenu = null" />
  <!-- 1160：响应表格视图的行右键——单击复制是最常用一步，右键补「复制键/值/整表」与
       「在查询工作台打开原始响应」，与全站两级菜单同一语言（复制类收进二级）。 -->
  <CellContextMenu v-if="respRowMenu" :x="respRowMenu.x" :y="respRowMenu.y" :title="respRowMenu.title"
    :items="respRowMenuItems" @close="respRowMenu = null" />

    <!-- 权限前置说明：执行钮在无写权时不再「静默消失」——告诉用户缺什么、能做什么。
         与 RestView.rt-perm-note 同一语言；两档区分「完全只读」与「仅数据面写」。 -->
    <div v-if="auth.probed && !canExecRead" class="dt-perm-note" role="status">
      <ShieldAlert :size="13" /> 当前身份无法执行：需要 ADMIN，或该连接的「DevTools / REST 直连」读权限（只读请求）／写权限（写请求）。
      现在仍可编辑请求、导入历史与查看响应；获权后执行钮自动出现。
    </div>
    <div v-else-if="auth.probed && canExecRead && !canAdmin" class="dt-perm-note dt-perm-note-readonly" role="status">
      <ShieldAlert :size="13" /> 当前身份对该连接<b>只读</b>：可执行 GET / POST 查询类请求（_search、_count、_cat 等）；
      写请求（PUT/DELETE/_bulk/_reindex 等）需要「DevTools / REST 直连」写权限。
    </div>
    <div v-else-if="auth.probed && canAdmin && !isAdminIdentity" class="dt-perm-note dt-perm-note-warn" role="status">
      <ShieldAlert :size="13" /> 当前为数据面写权限：可执行检索/文档/批量/delete-by-query；
      系统管理、别名/快照/模板/脚本等写操作会被后端拒绝（需对应页面写权限或 ADMIN）。
    </div>

    <div v-if="cur" class="dt-body">
      <div class="dt-req">
        <select v-model="cur.method" class="dt-method" :class="'m-' + cur.method.toLowerCase()">
          <!-- W3-T11：选中端点后不在 ep.methods 内的方法置灰提示（未选端点/自由文本=全可用） -->
          <option v-for="m in METHODS" :key="m" :value="m" :disabled="!!curEp && !curEp.methods.includes(m)">{{ m }}</option>
        </select>
        <!-- W3-T11：端点目录补全渗透；@keydown.ctrl.enter 经 attrs 落根 div，choose 后冒泡仍触发 run（选中即执行） -->
        <EndpointPathInput v-model="cur.path" class="dt-path" placeholder="/index/_search"
          @endpoint="onEndpoint" @keydown.ctrl.enter="run" />
        <button v-if="runVisible" class="btn primary sm btn-run-lock" @click="run"
          :disabled="cur.busy || !currentSendable"
          :title="currentSendable ? (scopeAdvisory || '执行（Ctrl+Enter）') : scopeDenyHint">
          <!-- 主按钮中文化对齐两工作台（此前英文 Run 是中文界面孤例）；执行中态句式统一「执行中 X.Xs」 -->
          <Play :size="12" /> {{ cur.busy ? '执行中 ' + (qr.elapsedMs.value / 1000).toFixed(1) + 's' : '执行' }}
          <span class="kbd" style="margin-left:var(--sp-1)">Ctrl⏎</span>
        </button>
        <!-- 常驻文字「运行需 ADMIN 角色」占执行钮位退役 → 图标+tooltip
 （非 admin 仍可见可读可聚焦，仅省宽度；原文案字面保留在 aria-label/title，
 permGating 可见性语义锚零漂移） -->
        <span v-else class="dt-perm-dim" tabindex="0" role="img" aria-label="运行需 ADMIN 角色"
          title="运行需 ADMIN、DevTools 或 REST 页写权限；非 ADMIN 仅数据面（检索/文档/批量），系统管理与别名/快照/模板仍仅 ADMIN"><ShieldAlert :size="13" /></span>
        <span v-if="canAdmin && !currentSendable" class="dt-perm-dim" tabindex="0" role="status"
          :title="scopeDenyHint">非 ADMIN 仅数据面</span>
        <button v-if="cur.busy" class="btn sm" @click="qr.cancel()"><X :size="12" /> 取消</button>
        <button class="btn ghost sm" @click="copyCurl" title="复制 curl">
          <Copy :size="12" /> curl
        </button>
        <!-- 复制为代码（toJs/toPython 既有能力挂上；切换即复制）。
 中文备注走 select title（option 字面被 devtoolsCodegen314 逐字锁）；
 恒在场 disabled 非条件消失——无路径时整颗控件撤位会让同排「从 curl 导入」左移
 （空态行结构恒定），与同排复制 curl 钮恒在场同口径 -->
        <select :disabled="!cur?.path" class="btn ghost sm" style="width:auto;cursor:pointer"
          title="复制为代码（fetch=前端 JavaScript 脚本 · requests=Python 脚本）" aria-label="复制为代码（fetch=前端 JavaScript 脚本 · requests=Python 脚本）"
          @change="copyAsCode(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).selectedIndex = 0">
          <option value="" disabled selected>代码</option>
          <option value="js">JavaScript (fetch)</option>
          <option value="python">Python (requests)</option>
        </select>
        <!-- W6-T3 复制响应全文：方案 B 补刀迁往响应头常驻（域归属归位=先例；
 无数据 disabled 而非 v-if 消失——空态行结构恒定，响应头与请求头同构对称）+ curl 导入回填 -->
        <button class="btn ghost sm" @click="curlOpen = true; curlErr = ''" title="粘贴 curl 命令回填请求">
          <ClipboardPaste :size="12" /> 从 curl 导入
        </button>
        <!-- 导出/导入请求（Kibana Console「Export / Import requests」对位）——
             导出整份编辑器内容为纯文本（保留方法行/请求体/排版），导入时每段成为一个 Tab。
             与「从 curl 导入」并存：前者是整份脚本，后者是单条命令。 -->
        <button class="btn ghost sm" :disabled="!tabs.length" title="把当前全部 Tab 导出为 .http 文本文件（可再导入，人可读可进版本库）"
          @click="exportToFile">
          <FileDown :size="12" /> 导出
        </button>
        <button class="btn ghost sm" title="从导出的文本文件导入，每个请求成为一个 Tab" @click="importFileEl?.click()">
          <FileUp :size="12" /> 导入
        </button>
        <input ref="importFileEl" type="file" class="sr-only" accept=".http,.txt,text/plain" @change="importFromFile" />
      </div>

      <!-- W6：body 区 textarea → Monaco（JSON 高亮/折叠/格式化），dslAssist 按端点语义分档补全 -->
      <!-- P1 workbench：请求/响应进统一可调布局（拖拽/预设/聚焦/Esc），窄屏自动上下堆叠。
 P1：预设钮文案语义化（DslQueryView L66-67 先例同款）——本页双 pane 即
 请求/响应，通用「编辑/结果优先」在语义上错位，换「请求优先/响应优先」 -->
      <WorkbenchLayout :scope="wbScope" :panes="DEVTOOLS_PANES" axis="vertical" mode="search"
        preset-editor-label="请求优先" preset-editor-title="请求区优先（响应收窄）"
        preset-result-label="响应优先" preset-result-title="响应区优先（请求收窄）">
        <template #pane-devtools-search-request>
          <FocusableSurface pane-id="devtools.search.request" title="请求体" :enabled="focusPaneId === 'devtools.search.request'"
            @update:enabled="v => (focusPaneId = v ? 'devtools.search.request' : null)">
            <!-- 竖排标题轨退役后标题语义落 fs-head 行首（横排，扁平语言）。
 请求域五钮（插入骨架/格式化/压缩/收藏/清空）自响应工具行迁回
 请求 pane 工具行（域归属归位——操作对象都是请求体；响应头只留响应观测族），
 .dt-actions/.toolrow 形态零新 CSS（focusSurface401 锁定的规则文本零触） -->
            <template #actions>
              <!-- ·用户评审选定方案 B（高频前置+溢出收纳）：行上=标题｜分隔线｜插入字段
 （主操作实底）/格式化/复制(icon-only)/字号 seg｜spacer｜「⋯」菜单收纳五件
 （压缩/骨架/自动格式化开关行/收藏/清空）+分段执行说明（dim 随菜单保留）。
 按钮行恒单行自然高，不新增 DOM 行=零高度链触碰；功能 handler 与原按钮同一条路 -->
              <div class="dt-actions toolrow">
                <span class="dt-pane-tt">请求体</span>
                <span class="dt-tb-sep"></span>
                <!-- W3-T11：端点带 body 骨架时出——直接覆盖现有 body（对齐格式化/清空的无确认交互）；
 低频动作迁「⋯」菜单，骨架钮同步更新菜单内（条件出现） -->
                <!-- 插入字段（insertSnippet expose 全站首消费，MonacoEditor.vue:823/931
 只调用零修改）——n-popover 内嵌 FieldPicker（to="false" 就地渲染，QueryHubView
 场景任务先例：弹层与 popover 同子树，clickoutside 不误判）；选中后在请求体 Monaco
 光标处插入 "字段名"；_bulk 档是 NDJSON（动作行+文档行成对），禁用并 title 说明 -->
                <n-popover trigger="click" placement="bottom-start" :width="insFieldPopW" :show-arrow="false"
                  :show="insFieldOpen" @update:show="(v: boolean) => (insFieldOpen = v)">
                  <template #trigger>
                    <button class="btn xs" :disabled="dtBodyKind === 'none'" aria-label="插入字段"
                      :title="dtBodyKind === 'none' ? '_bulk 档请求体是 NDJSON（动作行+文档行成对），字段插入不适用' : '从当前路径索引的字段清单选一个，在光标处插入 &quot;字段名&quot;'">
                      <ListPlus :size="11" /> 插入字段
                    </button>
                  </template>
                  <FieldPicker v-model="insFieldKw" :index="dtPathIdx || store.pickedIdx" :to="false" width="100%"
                    placeholder="过滤字段，点选后插入光标处" @picked="onInsPick" />
                </n-popover>
                <button class="btn ghost xs" @click="format">
                  <AlignJustify :size="11" /> 格式化
                </button>
                <!-- 复制请求体——方案 B 改 icon-only（title/aria 承载文案） -->
                <button class="btn ghost xs" aria-label="复制请求体" title="复制请求体原文" @click="copyBody">
                  <Copy :size="11" />
                </button>
                <!-- 编辑器字号三档 seg（dt.font 落盘；请求体与响应只读面同键）。
 档位常量合并 utils/editorTiers 单源 -->
                <span class="seg dt-font-seg" role="group" aria-label="编辑器字号档">
                  <button v-for="f in EDITOR_FONT_TIERS" :key="f" type="button" :class="{ on: edFont === f }"
                    :title="'编辑器字号 ' + f + 'px'" @click="edFont = f">{{ f }}</button>
                </span>
                <span class="dt-tb-sp"></span>
                <!-- 「⋯」溢出菜单——低频动作收纳（menu/aria 语义；选择即关） -->
                <n-popover trigger="click" placement="bottom-end" :show-arrow="false"
                  :show="moreOpen" @update:show="(v: boolean) => (moreOpen = v)">
                  <template #trigger>
                    <button class="btn ghost xs" aria-label="更多动作" aria-haspopup="menu" :aria-expanded="moreOpen"
                      title="更多动作（压缩 / 骨架 / 自动格式化 / 收藏 / 清空）" @click="moreOpen = !moreOpen">
                      <Ellipsis :size="13" />
                    </button>
                  </template>
                  <div class="dt-more-menu" role="menu">
                    <button class="dt-more-item" role="menuitem" @click="minify(); moreOpen = false"><Minimize2 :size="12" /> 压缩</button>
                    <button v-if="curEp?.body" class="dt-more-item" role="menuitem" @click="insertBody(); moreOpen = false"><Braces :size="12" /> 插入 body 骨架</button>
                    <div class="dt-more-sep"></div>
                    <button class="dt-more-item" role="menuitemcheckbox" :aria-checked="autoFmt ? 'true' : 'false'"
                      title="发送时自动格式化请求体（仅发送出参，草稿与历史保持原稿）" @click="autoFmt = !autoFmt">
                      <Check :size="12" :style="{ visibility: autoFmt ? 'visible' : 'hidden' }" /> 发送时自动格式化
                    </button>
                    <div class="dt-more-sep"></div>
                    <button class="dt-more-item" role="menuitem" @click="saveFav(); moreOpen = false"><Star :size="12" /> 收藏</button>
                    <button class="dt-more-item danger" role="menuitem" @click="cur.body = ''; cur.result = null; moreOpen = false"><Eraser :size="12" /> 清空</button>
                    <div class="dt-more-sep"></div>
                    <div class="dt-more-note">空行分段 · Ctrl+Enter 执行光标段 · Shift+Ctrl+Enter 全部</div>
                  </div>
                </n-popover>
              </div>
            </template>
            <!-- 聚焦态随视口拉伸（404 响应面对称）——此前聚焦后仍是 220px 小条。
 裸 90px 偏移折算进 --vh-offset 收敛口径（vh-offset=210px 全站页头+页边距
 预留；210-120=90 视觉零变化，聚焦面无页头、tab 条+请求行 ~120px 回加） -->
            <!-- @execute 接既有 run——按钮明示 Ctrl⏎ 但光标在请求体内时此前按了无效，
 MonacoEditor es-execute action 常驻注册，接上即通（SearchSandboxView 冒泡接线同思路；
 run 首行 busy 快照守卫在，键盘路径不绕防重入）。
 请求体 lint 静态体检提示条（SearchSandboxView join 串形态同款，随输入
 实时重估，零阻塞不拦执行）。：按 body 语义档路由 lint 引擎（search→
 lintDsl / _bulk→ndjsonLint / settings→lintSettingsBody / mapping→lintMappingBody /
 其他→[]），可定位条目上行内 Monaco marker（DslQueryView W2-2 范式），无行号
 可标的降级进底部条（不静默丢）；error 红条单列，warning/hint 黄条并列；
 JSON 非法静默 -->
            <!-- @execute 改挂段执行入口（Kibana 多请求语义：Ctrl+Enter 只跑光标所在段，
 单段体等价全量 run 零漂移）；Shift+Ctrl+Enter 经键面冒泡走全部段。切段只作用于
 发送出参——草稿/历史/镜像 body 锁面零触；本标签零高度链语义（不引新 pane） -->
            <MonacoEditor ref="bodyMonacoRef" v-model="cur.body"
              :height="focusPaneId === 'devtools.search.request' ? 'calc(100vh - var(--vh-offset) + 120px)' : '100%'"
              :language="bodyLang"
              :dsl-assist="dslAssist" :font-size="edFont" class="dt-body-monaco"
              @execute="onBodyExecute" @keydown.shift.ctrl.enter.prevent="runSmart(true)" />
            <!-- lint 形态壳改用 theme.css .lint-bar 单源（纯类名替换，DOM 保形）；
 本地 .dt-lint 只留高度链两钉（531 定高链 flex-shrink + 532 P1-2 max-height 钳制） -->
            <div v-if="dtLintErrors.length" role="alert" class="lint-bar dt-lint lint-bar-err">
              <span>DSL 检查（错误）：{{ dtLintErrors.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
            </div>
            <div v-else-if="dtLintWarns.length" role="status" class="lint-bar dt-lint lint-bar-warn">
              <span>DSL 检查：{{ dtLintWarns.map(f => f.message + '（' + f.suggestion + '）').join('；') }}</span>
            </div>
          </FocusableSurface>
        </template>
        <template #pane-devtools-search-response>
          <FocusableSurface pane-id="devtools.search.response" title="响应" :enabled="focusPaneId === 'devtools.search.response'"
            @update:enabled="v => (focusPaneId = v ? 'devtools.search.response' : null)">
            <!-- 工具行一体化——dt-actions 从面板体上移入头部行 actions slot,
 与聚焦钮同排(「浮在面板线上的孤钮」终态消除);窄容器整行可换行。
 请求域五钮迁回请求 pane 工具行（域归属归位），本行只留响应
 观测族（标题/重试/RawIo/MetaStrip/响应搜索）；dtLint/err-bar 落位不动 -->
            <template #actions>
<!-- W-C 批：并挂全局 .toolrow（theme.css，.dt-actions 同款形态）。本地 .dt-actions 规则暂留：
 focusSurface401 看守钉死该 CSS 文本且 >\* nowrap 是本页按钮行专属语义，不在全局兜 -->
<div class="dt-actions toolrow">
        <!-- 竖排标题轨退役后标题语义落工具行行首（横排，扁平语言）。
 方案 B 补刀：标题后分隔线与请求头同构；复制响应钮自执行行迁入常驻
 （无数据 disabled 而非消失——空态行结构恒定，与请求头元素密度对称） -->
        <span class="dt-pane-tt">响应</span>
        <span class="dt-tb-sep"></span>
        <button class="btn ghost xs" aria-label="复制响应" title="复制响应全文（截断展示时仍取完整原文）" :disabled="!cur.result"
          @click="copyText(cur.resultFull || cur.result || '').then(ok => store.notify(ok ? 'success' : 'error', ok ? '响应已复制（完整原文）' : '复制失败'))">
          <Copy :size="11" />
        </button>
        <!-- 原始 IO 快查——最近一次 /cluster/raw 请求/响应原文（IndexHub 同款钮形，
 本页执行走 api.raw 统一封装，记录环按该特征取最近一条） -->
        <button class="btn ghost xs" aria-label="查看原始 IO" title="最近一次执行的请求/响应原文（语义分档高亮 + 复制/curl 回放）"
          @click="openRawIo"><Terminal :size="11" /></button>
        <!-- 状态元信息行改用 MetaStrip 统一件（.dt-status 手写串退役）——
 语义全保留：不伪造未知 HTTP 码（真实码已知才出徽标段）、took 四档色经
 tookTone 映射（fast 绿/中 默认亮/slow 橙/veryslow 红，阈值仍走 tookClass 单一出处）、
 size 走 splitSize 数值+单位弱化（MetaStrip 规则 B）、截断警示 err 档 -->
        <MetaStrip v-if="cur.result" class="dt-status-ms" :items="statusMeta" />
        <!-- 响应查看档 seg（json/plaintext 双态扩「表格」档）——respLang=json 才出；
 表格态只替换 dt-out 显示区内容（Monaco v-if 让位），编辑器/输出高度结构零触。
 放头部工具行不放 dt-out 内：dt-out 是 Monaco height:100% 的直系父，加兄弟行即触高度链 -->
        <span v-if="respLang === 'json'" class="seg dt-resp-seg" role="group" aria-label="响应查看档">
          <button type="button" :class="{ on: !respTbl }" title="JSON 原文（只读编辑器）" @click="respView = 'raw'">JSON</button>
          <button type="button" :class="{ on: !!respTbl }" title="表格视图：顶层数组→行序表、对象→键值两列表（只读，行点击复制该行 JSON）" @click="respView = 'table'">表格</button>
        </span>
        <span v-if="cur.result" class="dt-resp-search">
          <input v-model="respFind.kw.value" class="inp mono" placeholder="搜响应…" @input="respFind.run()"
            @keydown.enter.prevent="respFind.kw.value.trim() && ($event.shiftKey ? respFind.prev() : respFind.next())" />
          <!-- 空词不显示 0/0 假计数 -->
          <template v-if="respFind.kw.value.trim()">
            <span class="mono dt-resp-mc">{{ respFind.current.value }}/{{ respFind.count.value }}</span>
            <button type="button" class="btn ghost xs" :disabled="!respFind.count.value" title="上一个匹配 (Shift+Enter)" @click="respFind.prev()">↑</button>
            <button type="button" class="btn ghost xs" :disabled="!respFind.count.value" title="下一个匹配 (Enter)" @click="respFind.next()">↓</button>
          </template>
        </span>
        <!-- 过滤响应（Kibana Console「Filter response」对位）——JQ 表达式或正则两档，
 只影响展示不改原文：清空表达式即恢复完整响应。表达式无效时原位报错，绝不给错值。 -->
        <span v-if="cur.result" class="dt-resp-filter" :class="{ on: !!respFilter.expr.trim() }">
          <select v-model="respFilter.mode" class="dt-flt-mode" aria-label="过滤方式"
            title="JQ=结构化查询（需 JSON 响应）；正则=逐行匹配（原文非 JSON 也可用）">
            <option value="jq">JQ</option>
            <option value="regex">正则</option>
          </select>
          <input v-model="respFilter.expr" class="inp mono dt-flt-inp"
            :placeholder="respFilter.mode === 'jq' ? '.hits.hits[]._id' : '^ERROR'"
            :title="respFilter.mode === 'jq'
              ? 'JQ 子集：字段/下标/迭代[]/递归../管道|/逗号/select/比较/逻辑/构造/常用函数'
              : '正则逐行匹配（不含分隔符与 flags）'"
            aria-label="过滤响应表达式" @keydown.esc.prevent="respFilter.expr = ''" />
          <span v-if="respFilter.expr.trim()" class="mono dt-flt-n" :class="{ err: !respFilterOut.ok }"
            :title="respFilterOut.ok ? '命中 ' + respFilterOut.count + ' 条' : respFilterOut.error">
            {{ respFilterOut.ok ? respFilterOut.count + ' 条' : '无效' }}
          </span>
          <button v-if="respFilter.expr.trim()" type="button" class="btn ghost xs" aria-label="清除过滤"
            title="清除过滤表达式，恢复完整响应" @click="respFilter.expr = ''">×</button>
        </span>
        <!-- 多段执行 per-段锚定徽标（seg i/n + ✓/✗ + took；主响应区现行为零触——
 末段覆写保持，前段响应点徽标载回；chip 形态对齐 dt-hist-chip，横向滚动随 .dt-actions；
 template 包 v-if 跳过段位空洞——单段先执行高位段时低位暂无锚） -->
        <div v-if="cur.segRuns?.length" class="dt-segbar" role="group" aria-label="分段执行结果">
          <template v-for="(run, i) in cur.segRuns" :key="i">
            <button v-if="run" type="button" class="dt-seg-run mono"
              :class="{ on: cur.segView === i, err: !run.ok }"
              :title="(run.ok ? '成功' : '失败') + ' · 点击把该段响应载入主响应区' + (run.errBrief ? '（' + run.errBrief + '）' : '')"
              @click="loadSegRun(run, i)">{{ run.label }} {{ run.ok ? '✓' : '✗' }} {{ fmtTook(run.took) }}</button>
          </template>
        </div>
      </div>
            </template>
      <!-- 语义色轮：ES 错误不再只靠 Monaco 红边框+纯 JSON dump——friendlyEsError 结构化提取
 root_cause[0].reason 与已知场景人话（esError.ts 既有能力，此前本页没用上）；
 原始报错全文仍在下方 Monaco（复制不丢真） -->
      <div v-if="cur.errBrief" role="alert" class="err-bar dt-err">
        <b class="dt-err-hd">✗ {{ cur.status ? 'HTTP ' + cur.status : '执行失败' }}</b>
        <span class="dt-err-rs">{{ cur.errBrief }}</span>
        <!-- 提示条三要素审计：原因（HTTP 码 + errBrief 人话）已具备，补重试入口——复用本页 run()
 重新执行当前 Tab 的方法+路径+body；busy 中禁用防重入（全站 err-bar 范式） -->
        <button v-if="canAdmin" class="btn sm" :disabled="cur.busy" @click="run"><RefreshCw :size="12" :class="{ spinning: cur.busy }" /> 重试</button>
      </div>
      <div class="dt-out">
        <!-- W6-T3：裸 pre → 只读 Monaco（json 着色/折叠/Ctrl+F；非 JSON 落 plaintext）——:model-value 单向不回写 -->
        <!-- 聚焦态 Monaco 随视口拉伸——此前固定 260px，放大后下半屏全是空白。
 裸 190px 偏移折算进 --vh-offset 收敛口径（210-20=190 视觉零变化；
 聚焦面无页头、tab 条+请求行+余量 ~20px 回加） -->
        <MonacoEditor v-if="cur.result && !respTbl" ref="respMonacoRef" :model-value="respShown" :language="respLang" :readonly="true"
          :dsl-assist="dtRespAssist" :font-size="edFont"
          :height="focusPaneId === 'devtools.search.response' ? 'calc(100vh - var(--vh-offset) + 20px)' : '100%'" class="dt-out-monaco" :class="{ err: !cur.ok }" />
        <!-- 表格查看档——顶层数组→行序表（列=各行键并集保持首现序，_cat/* 结构化响应
 主场景）、对象→键值两列表；只读，行点击/回车复制该行 JSON（数组行=行对象原文，键值行={k:v}）。
 轻量直渲不引 QueryResultTable（防体量）；显示区内容替换件，dt-out flex 结构与 busy/空态链不动 -->
        <div v-else-if="respTbl" class="dt-resp-tbl">
          <table v-if="respTbl.isArr" class="dt-resp-tbl-t">
            <thead><tr><th class="dt-resp-tbl-ix">#</th><th v-for="c in respTbl.cols" :key="c">{{ c }}</th></tr></thead>
            <tbody>
              <tr v-for="(r, ri) in respTbl.rows" :key="ri" tabindex="0" title="点击复制该行 JSON（右键更多操作）"
                @click="copyRespRow(r)" @keydown.enter.prevent="copyRespRow(r)"
                @contextmenu.prevent="openRespRowMenu($event, r, ri)" @keydown="onRespRowMenuKey($event, r, ri)" data-row-nav @keydown.self="rowArrowNav">
                <td class="dt-resp-tbl-ix">{{ ri + 1 }}</td>
                <td v-for="c in respTbl.cols" :key="c">{{ respCell(r[c]) }}</td>
              </tr>
            </tbody>
          </table>
          <table v-else class="dt-resp-tbl-t">
            <thead><tr><th>键</th><th>值</th></tr></thead>
            <tbody>
              <tr v-for="([k, val]) in respTbl.kv" :key="k" tabindex="0" title="点击复制该行 JSON（右键更多操作）"
                @click="copyRespRow({ [k]: val })" @keydown.enter.prevent="copyRespRow({ [k]: val })"
                @contextmenu.prevent="openRespRowMenu($event, { [k]: val }, -1)" @keydown="onRespRowMenuKey($event, { [k]: val }, -1)" data-row-nav @keydown.self="rowArrowNav">
                <td>{{ k }}</td>
                <td>{{ respCell(val) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- G7-C1：执行中占位——不再闪 EmptyState 引导（四态位置 ） -->
        <div v-else-if="cur.busy" class="dt-waiting">执行中，等待集群响应…</div>
        <EmptyState v-else :icon="TerminalSquare" text="输入 REST 请求执行" hint="快捷键 Ctrl+Enter">
          <!-- 空态给下一步动作，一键起步。三个不同参数的 quickRun 靠插槽承载
 （单 actionText 只能装一个），容器留白仍归 EmptyState -->
          <!-- 空态快捷入口同样按写门隐藏：无 DevTools/REST 写权时 run() 必然拒绝，
               展示可点按钮只会制造必 403 的死入口 -->
          <template v-if="canAdmin">
            <button class="btn ghost xs" @click="quickRun('GET', '/_cluster/health')">试试：集群健康</button>
            <button class="btn ghost xs" @click="quickRun('GET', '/_cat/indices?v&format=json')">列出索引</button>
            <button class="btn ghost xs" @click="quickRun('POST', '/_search', SEARCH_SAMPLE)">全局搜 5 条</button>
          </template>
        </EmptyState>
      </div>
    </FocusableSurface>
        </template>
      </WorkbenchLayout>

      <!-- ⚠ P0 回退（2.9.115 产线事故）：历史曾迁入响应 pane 内折叠区——
 pane 内容多出恒高 dt-hist 兄弟块后，Monaco host height:100% 与内容自适应父链
 （wl-body min-height 兜底、pane 拉伸随 wl-body）互为因果形成正反馈环，
 进入页面即每秒 ~2500px 无限增高（headless 探针实锤 8299→21037 六拍）。
 回退为直挂 dt-body（2.9.114 稳定形态），hist 展开顶高 dt-body 整页滚为原已知行为；
 展开列表 max(240px,42vh) 口径保留。教训：pane 内只允许「弹性归一」的子件，
 恒高兄弟进 pane 前必须过高度环探针。 -->
      <div class="dt-hist" v-if="cur.history?.length || histAll.length" :style="{ '--dt-hist-h': histH }">
        <!-- 历史面板可折叠（辅助信息收起主工作区优先；Chevron 方向随态）；
 折叠容器保留，行列表改用 QueryHistoryPanel 统一件（存储 key 不动） -->
        <div class="dt-hist-tt" role="button" tabindex="0" :aria-expanded="histOpen"
          :aria-label="histOpen ? '收起本 Tab 历史' : '展开本 Tab 历史'" title="点击折叠/展开历史"
          @click="histOpen = !histOpen" @keydown.enter.prevent="histOpen = !histOpen" @keydown.space.prevent="histOpen = !histOpen">
          <ChevronDown :size="12" :style="{ transform: histOpen ? '' : 'rotate(-90deg)' }" />
          <History :size="12" /> 本 Tab 历史（{{ cur.history.length }}）
        </div>
        <!-- P2-3：跨 Tab 汇聚范围切换——交互子件不进 role=button 头行（ARIA
 嵌套交互禁令，同款教训），作头行紧邻的兄弟行渲染；「全部」档 histRows
 切汇聚清单（cap100），条目 fill/play 回当前 Tab。
 行尾并列表限高三档钮（dt.histH useTierCycle；group 语义随之扩为
 范围+高度两件） -->
        <div class="dt-hist-scope" role="group" aria-label="历史范围与列表高度">
          <button type="button" class="dt-hist-chip" :class="{ on: histScope === 'tab' }" @click="histScope = 'tab'">本 Tab</button>
          <button type="button" class="dt-hist-chip" :class="{ on: histScope === 'all' }" @click="histScope = 'all'">全部（{{ histAll.length }}）</button>
          <button type="button" class="dt-hist-chip" style="margin-left:auto"
            :title="'历史列表限高：' + histH + '（点击循环）'" @click="cycleHistH">高</button>
        </div>
        <div v-show="histOpen" class="dt-hist-list">
          <!-- per-tab 历史行改用 QueryHistoryPanel——条目字段映射见 histRows（query=「METHOD path」、
 ts 优先落盘值回解析旧 time 串、ok/took 直通）；actions 窄集 play/fill/copy/del（本页无 rename 存储）；
 不开 clickable（旧行整行点击=仅填入是为防误重跑写请求，统一件整行=回放执行，安全语义不降级——
 「仅填入」走 fill 按钮承担）；导入隐藏（面板导入写 queryHistory store，与本页 tab 草稿不同存储）；
 导出经 export-row 保留 {method,path,body,ts} 互认字段 -->
          <!-- actions 窄集加 'fav'——历史行一键转收藏（DslQuery 历史面板 fav 形态
 同款行级钮），走 store.addFavorite rest 形态既有体系（同 kind+title 覆盖=幂等切换，
 零新存储键）；QueryHistoryPanel fav 行级门 `!it.mode || it.mode === 'dsl'`，
 本页条目无 mode 字段天然放行 -->
          <!-- actions 窄集加 'curl'——历史行一键复制 curl（行级 emit，命令组装归宿主
 histCurl：copyCurl 既有手法逐字平移）；QueryHistoryPanel 'curl' 行级钮不传零增量，
 其余宿主零变化 -->
          <!-- actions 窄集加 'newtab'——历史行「回放到新 Tab」（行级仅 emit，
 mkTab 造签+激活跳转归宿主 histNewTab，consumePrefill 三连同款） -->
          <QueryHistoryPanel :items="histRows" :actions="['play', 'fill', 'copy', 'fav', 'curl', 'newtab', 'del']"
            :clearable="histScope === 'tab'" :importable="false" :empty-text="histScope === 'all' ? '暂无跨 Tab 历史' : '暂无本 Tab 历史'"
            :export-row="histExportRow" took-tip="端到端耗时（performance.now 实测，含网络往返）"
            @play="histPlay" @fill="loadHist" @del="histDel" @clear="askClearTabHist" @fav="histFav" @curl="histCurl" @newtab="histNewTab" />
        </div>
      </div>
    </div>

    <!-- 重置确认收敛全局 askConfirm（ 后果前置语义不变，本地 ConfirmModal 宿主退役） -->

    <!-- W6-T3：curl 导入弹层——NModal 默认 Teleport 到 body（探针实证：naive 2.43.2 NModal 不支持
 to="false"——不转发 disabled 给 LazyTeleport，传 false 反致 Invalid Teleport target 内容不渲染；
 preset=card 带 mask 不绑 clickoutside，无约定 8 的误判关闭面）。
 补 max-width 94vw 视口钳制——此前全站唯一无钳制弹窗（HotkeyPanel/CmdPalette 同档） -->
    <NModal v-model:show="curlOpen" preset="card" title="从 curl 导入" style="width: 560px; max-width: 94vw">
      <!-- rows=6 定高退役 → autosize 6~14 行随内容自适应——小窗不再被 14 行顶爆、
 长 curl 不再滚 6 行微型框（naive autosize 标准 API，无 JsonArea 大改） -->
      <NInput v-model:value="curlText" type="textarea" :autosize="{ minRows: 6, maxRows: 14 }" spellcheck="false"
        placeholder="粘贴完整 curl 命令，例如：&#10;curl -X PUT 'http://es:9200/my-index' -d '{&quot;settings&quot;:{}}'" />
      <!-- 语义色轮：解析失败就地给具体原因（空输入/非 curl 开头/引号未闭合/缺 URL），不再只有一句 toast -->
      <div v-if="curlErr" class="il-hint il-err" role="alert">{{ curlErr }}</div>
      <template #footer>
        <button class="btn primary sm" @click="doImportCurl">导入</button>
      </template>
    </NModal>

    <!-- 原始 IO 快查弹窗（IndexHub/查询工作台同款共享件） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
    <PermModal v-model:show="permOpen" :target="store.target" />

    <!-- 变量弹窗（Kibana Console「Variables」对位）——与 DSL 页共用同一 es_vars 表，
         改完即对全站生效；执行时路径按字符串、JSON 体按类型展开 -->
    <NModal v-model:show="varsOpen" preset="card" title="变量 ${var}" style="width:520px;max-width:92vw" :bordered="false">
      <div class="dt-vars-list">
        <div v-for="(v, k) in varsMap" :key="k" class="dt-vars-row">
          <span class="mono dt-vars-k">{{ '${' + k + '}' }}</span>
          <input class="inp mono" :value="v" @input="varsMap[k] = ($event.target as HTMLInputElement).value" />
          <button class="btn sm ghost danger" :aria-label="'删除变量 ' + k" title="删除该变量（只影响本地变量表）" @click="delete varsMap[k]"><X :size="11" /></button>
        </div>
        <div class="dt-vars-row">
          <input class="inp mono" v-model="newVarK" placeholder="变量名" style="width:150px" />
          <input class="inp mono" v-model="newVarV" placeholder="值（JSON 或字符串）" @keydown.enter="addVar" />
          <button class="btn sm" @click="addVar">添加</button>
        </div>
        <div v-if="!Object.keys(varsMap).length" class="dt-vars-empty">还没有变量。加一个后即可在路径或请求体里用 <span class="mono">${'{idx}'}</span>。</div>
      </div>
      <div class="dt-vars-tip">
        用法：<span class="mono">/${'{idx}'}/_search</span>（路径里按字符串替换）或
        <span class="mono">"size": ${'{n}'}</span>（JSON 体内数字/数组/对象按类型注入）。
        未定义的变量在执行前会被拦下并列出名字。
      </div>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <button class="btn pri" @click="saveVarsAll">保存</button>
        </div>
      </template>
    </NModal>

    <McpPanel v-model:show="mcpOpen" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onActivated, onDeactivated, onBeforeUnmount, watch, nextTick } from 'vue';
import {
  TerminalSquare, Plus, X, Play, Copy, AlignJustify, Minimize2, Star, Eraser, History, RotateCcw, Braces, ClipboardPaste,
  ChevronDown, RefreshCw, ShieldAlert, Terminal, ListPlus, Ellipsis, Check, Shield, Pencil, Variable, FileDown, FileUp} from 'lucide-vue-next';
import PermModal from '../components/PermModal.vue';
import McpPanel from '../components/McpPanel.vue';
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue'; /* 1143：标签右键 */
import { NModal, NInput, NPopover } from 'naive-ui';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { useQueryRun } from '../composables/useQueryRun';
import { usePref } from '../composables/urlState'; /* ：dt.histOpen 折叠态落盘（usePref 全站既有偏好体系） */
import { useTierCycle } from '../composables/useTierCycle'; /* ：历史列表限高三档统一件（dt.histH） */
import { EDITOR_FONT_TIERS } from '../utils/editorTiers'; /* ：字号三档单源合并（DQ/IH 同口径） */
import EmptyState from '../components/EmptyState.vue';
import { applyResponseFilter } from '../utils/jqFilter';
import { applyVars, missingVars, hasVars, loadVars, saveVars } from '../utils/vars';
import { exportRequests, parseRequests, requestTitle, nextRequestLine, prevRequestLine } from '../utils/devtoolsFileIO';
import { api, ApiError, ioRecorder, type RawIoRec } from '../api';
/* fmtTook/tookClass 收口 utils/format 单一出处（本页 505-513 两份复制品退役，阈值不再漂移） */
import { copyText, fmtTime, splitSize, fmtTook, tookClass, downloadText } from '../utils/format';
import EndpointPathInput from '../components/devtools/EndpointPathInput.vue';
import MonacoEditor from '../components/MonacoEditor.vue';
import { useIndexFields } from '../composables/useIndexFields';
import { useTermsSuggest } from '../composables/useTermsSuggest';
import { useDebounceFn } from '../composables/useDebounceFn';
import { bodyKindForPath, bodyLangForPath } from '../utils/dslCompletionContext';
/* dtLint 档路由——search→lintDsl / bulk→lintNdjsonBody（与 REST 同源）/
 settings→lintSettingsBody / mapping→lintMappingBody / 结构化体→lintStructuredBody（与 RestView 同源）；
 Finding 形态供行内 marker 与底部条共用 */
import { lintDsl, lintSettingsBody, lintMappingBody, lintStructuredBody, lintNdjsonBody, lintNdjsonLineKeys, type Finding } from '../utils/dslLint';
import { parseCurl, diagnoseCurl } from '../utils/curlParse';
import { friendlyEsError } from '../utils/esError';
import { toJs, toPython } from '../utils/codegen';
import { stripJsonComments } from '../utils/jsonc';
/* monaco 命名空间（KeyMod/KeyCode 键位常量）——与 MonacoEditor 同一模块实例，
 Ctrl+I 宿主接线经 getEditor() expose 出口（组件本体零改，全站黑名单），PainlessLab/SqlConsole 视图同款 import 形态 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
/* 多请求编辑器切段纯函数（切段只作用于发送出参，草稿/历史/镜像原稿零触） */
import { splitRequests, locateSegment, type DtSeg } from '../utils/devtoolsSegments';
import { REST_METHODS, type EsEndpoint } from '../utils/esEndpoints';
import { redactDraft } from '../composables/useScopedDraft'; /* ：curl 粘贴稿凭据掩埋 */
/* 重置确认收敛全局 askConfirm（本地 ConfirmModal 宿主退役） */
import { askConfirm } from '../composables/confirm';
/* 状态元信息行改用 MetaStrip（.dt-status 手写串退役）；历史行改用 QueryHistoryPanel 统一件 */
import MetaStrip, { type MetaStripItem } from '../components/MetaStrip.vue';
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';
import RawIoModal from '../components/RawIoModal.vue';
import FieldPicker from '../components/FieldPicker.vue'; /* ：插入字段弹层字段源（to="false" 就地渲染） */

import { useMonacoLocate } from '../composables/useMonacoLocate';
import WorkbenchLayout, { type WorkbenchPaneSpec } from '../components/WorkbenchLayout.vue';
import FocusableSurface from '../components/FocusableSurface.vue';
import PageHeader from '../components/PageHeader.vue';
import { writeStoredRaw, removeStoredRaw } from '../utils/safeJson';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';
import { nonAdminDataPlaneWriteAllowed, nonAdminRootSearchNeedsIndex,
  nonAdminIndexQueryParamRejected, nonAdminControlIndexDenied, nonAdminWildcardTargetAdvisory,
  nonAdminBodyTargetsControl, nonAdminCatNeedsJson, nonAdminAsyncResultRead } from '../utils/devtoolsScope';
const store = useAppStore();
/* 权限门禁——DevTools 运行统一走专用 /cluster/devtools/execute（devtools/rest 写键，ADMIN 全局）；
 编辑/导入/复制响应全角色可用，非 ADMIN 给自述不给扳机 */
const auth = useAuthStore();
const permOpen = ref(false);
const mcpOpen = ref(false);
/* 透传执行能力**按当前 tab 的内层方法**分档（1133）：
   读键 → 可执行内层只读请求；写键/ADMIN → 可执行写。
   此前的 canAdmin 一律按 admin 写档判定，导致宿主持有 conn:{id}:devtools 读键的
   只读身份连 GET /_cluster/health 都执行不了——「生产只读」退化成「生产不可用」。 */
const canExecInner = (method: string, path: string) => auth.canExecutePassthrough(
  method, path, '/internal/es/index/cluster/devtools/execute', store.target);
/* 写档能力：仍用于「非 ADMIN 仅数据面」的判定与说明条分叉。 */
const canAdmin = computed(() => auth.canPassthroughWrite(
  '/internal/es/index/cluster/devtools/execute', store.target));
/* 读档能力：只读身份也能进入可执行态（只读 tab 亮着「执行」）。 */
const canExecRead = computed(() => auth.canPassthroughRead(
  '/internal/es/index/cluster/devtools/execute', store.target));
/* 页级可见性门（1131）：路由守卫在「身份尚未落地」窗口会放行（`pageAllowed` 对
   grantedPages=null 且 role=null 返回 true），零授权用户因此在探测完成前能进本页并
   点到工具栏（导出/导入/变量）。后端仍会拦写请求，但「可操作性必须与授权一致」
   要求这里也不该露出。身份落地后 canReadPage 自动重算——有权限的人不受影响。 */
const pageVisible = computed(() => auth.canReadPage('devtools', store.target));
/* 身份档位（仅用于说明条文案分叉）：ADMIN 有全局写权，其余有写键者只到数据面。 */
const isAdminIdentity = computed(() => auth.isAdmin());
/* 当前请求是否在非 ADMIN 的数据面白名单内。ADMIN/无鉴权部署不受限；
   连接写键用户对系统管理写（别名/快照/模板/设置/脚本）不显示可执行态。
   me==null（未启用鉴权/探测完成未登录）跟随 canEndpoint 放行——authDisabled 形态
   无角色概念，scope 门不得把管理写在前端拦死。 */
const requestInScope = (method: string, path: string, body?: string | null) =>
  auth.isAdmin() || auth.me == null || auth.authDisabled || nonAdminDataPlaneWriteAllowed(method, path, body);
const currentSendable = computed(() => !!cur.value
  && canExecInner(cur.value.method, cur.value.path)
  && requestInScope(cur.value.method, cur.value.path, cur.value.body));
/* 执行钮可见性：只要「内层方法可执行」就亮着——只读身份的只读 tab 也应有执行钮，
   不能整块变灰（那会让只读部署看起来完全不可用）。 */
const runVisible = computed(() => (!!cur.value
  ? canExecInner(cur.value.method, cur.value.path)
  : canExecRead.value));
const SCOPE_DENY_HINT = '非 ADMIN 仅可执行数据面写（检索/文档/批量/SQL）；别名、快照、模板、脚本与集群管理写需 ADMIN';
/* 不可用原因分档：根级检索缺索引范围是最高频的「看得见点不了」，单独说明怎么改 */
const scopeAdvisory = computed(() => {
  const c = cur.value;
  if (!c || auth.isAdmin() || auth.me == null || auth.authDisabled) return '';
  return nonAdminWildcardTargetAdvisory(c.path, c.body) || '';
});
const scopeDenyHint = computed(() => {
  const c = cur.value;
  if (c && !auth.isAdmin() && auth.me != null && !auth.authDisabled) {
    if (nonAdminIndexQueryParamRejected(c.path)) {
      return 'index/indices 查询参数不能限定目标：请改用 /{index}/_search 路径形式';
    }
    if (nonAdminControlIndexDenied(c.path)) {
      return '控制面/系统索引不对非 ADMIN 开放：请改用业务索引';
    }
    if (nonAdminRootSearchNeedsIndex(c.path, c.body)) {
      return '根级检索需用 /{index}/_search 形式，或 PIT（body 带 pit.id）；非 ADMIN 不允许全量读';
    }
    if (nonAdminCatNeedsJson(c.path)) {
      return '_cat 目录查询需带 format=json 且保留 index 列（服务端据此逐行过滤控制面索引）';
    }
    if (nonAdminAsyncResultRead(c.path)) {
      return '异步查询结果按 id 取回（id 即凭据，结果集按执行者权限生成）：非 ADMIN 请重新提交查询，不要复用他人 id';
    }
    if (nonAdminBodyTargetsControl(c.path, c.body)) {
      return '请求体里的目标指向控制面索引：请把 _index / index / indices / SQL FROM 改为业务索引';
    }
  }
  return SCOPE_DENY_HINT;
});
/* 预填 run:true 在身份未确认时挂起，probe 完成后仅执行一次：
   既不提前发写请求，也不让有权限的人因为开屏竞态而丢失自动执行。 */
const pendingPrefillRun = ref(false);
/* 挂起执行必须绑定到被预填的那个 tab：等待身份期间用户可能切到另一个含写请求的
   历史 tab，watcher 不能用“当前 tab”代跑——否则会绕过手动发送。 */
const pendingPrefillTab = ref<Tab | null>(null);
/* 只读判定：GET/HEAD 与搜索类 POST（_search/_count/_sql）可自动执行；
   其余写方法必须手动发送。POST scroll 不在列——非 ADMIN 数据面下仅 DELETE 形态
   放行，自动执行一个必被 scope 禁用的请求只会变成「预填失效」的困惑。 */
function isReadOnlyPrefill(method: string, path: string): boolean {
  const m = String(method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return true;
  if (m !== 'POST') return false;
  const p = String(path || '').split('?')[0];
  return p === '/_search' || p === '/_count' || p === '/_sql' || p === '/_xpack/sql'
    || p.endsWith('/_search') || p.endsWith('/_search/template')
    || p.endsWith('/_count') || p.endsWith('/_msearch') || p.endsWith('/_sql');
}
/* KeepAlive 失活页不得执行挂起预填：离页即丢弃，避免身份晚到后在不可见页发写请求 */
const pageActive = ref(true);
watch([() => auth.probed, () => auth.me, () => auth.authDisabled, canAdmin], () => {
  if (!pendingPrefillRun.value || !pageActive.value || !auth.probed) return;
  /* 首探 401 后宿主令牌可能晚到并重探成功：me 仍空且未明确无鉴权时继续等 */
  if (auth.me == null && !auth.authDisabled) return;
  const tab = pendingPrefillTab.value;
  pendingPrefillRun.value = false;
  pendingPrefillTab.value = null;
  if (!canAdmin.value) {
    store.notify('warning', '身份已确认但无 DevTools 写权限，请求仅填入未执行');
    return;
  }
  /* 只执行当初被预填的那个只读 tab；用户等待期间切换/删除了它就不代跑当前 tab。 */
  if (!tab || !isReadOnlyPrefill(tab.method, tab.path)) {
    store.notify('warning', '预填请求已失效，请手动确认后发送');
    return;
  }
  const idx = tabs.value.indexOf(tab);
  if (idx < 0) {
    store.notify('warning', '预填标签页已关闭，未自动执行');
    return;
  }
  active.value = idx;
  run();
});

/* P1 workbench：布局偏好按 target+route+mode+viewport 档位隔离（不与 query 草稿混用） */
const wbScope = { target: store.target || 'host', route: '/devtools', mode: 'search', profile: 'standard' as const };
const DEVTOOLS_PANES: WorkbenchPaneSpec[] = [
  /* 裁决：竖排标题轨退役（title 置空即不渲染，约定先例）——34px 侧轨
 与「响应」中缝竖排在视觉上把工作区切碎；标题语义由 fs-head 行首横排 .dt-pane-tt 承接 */
  { id: 'devtools.search.request', role: 'request', title: '', minSize: 260, defaultSize: 420, maxSize: 'available', focusable: true, persist: true },
  { id: 'devtools.search.response', role: 'response', title: '', minSize: 300, defaultSize: 560, maxSize: 'available', focusable: true, persist: true },
];
const focusPaneId = ref<string | null>(null);
const qr = useQueryRun(); // 长请求读秒 + 取消（ 范式）
/* 响应截断展示阈值（512KB） */
const DEVTOOLS_RESP_MAX = 512 * 1024;
/* URL 即现场轮：tab 工作区落盘 localStorage → sessionStorage（会话级草稿，刷新可恢复、关标签页即弃），
 key 带集群目标维度同 useScopedDraft 口径——按 tabId 保存的语义不变，切集群不串稿 */
const DRAFT_KEY = computed(() => `es_devtools_draft:${store.target || 'host'}`);
/* 搜索定位轮：响应 Monaco 真定位（findMatches + revealLineInCenter + setSelection） */
const respMonacoRef = ref<InstanceType<typeof MonacoEditor> | null>(null);
const respFind = useMonacoLocate(() => respMonacoRef.value?.getEditor());

interface Tab {
  id: string; title: string;
  /* 自定义命名后执行不再覆盖标题 */
  named?: boolean;
  method: string; path: string; body: string;
  result: string | null; ok: boolean; took: number; size: number; busy: boolean;
  /* 语义色轮：真实 HTTP 状态码（成功取自 raw 信封 status，失败取自 ApiError.status；未知=null 不伪造不显示） */
  status?: number | null;
  /* 结构化错误摘要（friendlyEsError 提取 root_cause/已知场景人话）；null=非错误态。落盘剥离（恢复侧清） */
  errBrief?: string | null;
  /* 大响应防护——result 只存截断展示版，完整原文留在 resultFull（内存，不落盘） */
  resultFull?: string | null; truncated?: boolean;
  /* 多段执行 per-段锚定（Kibana 每请求独立响应位对位）——段位快照数组 +
 当前回看位；⚠不落盘（writeDraft/恢复侧剥离，与 result 同保密级），切 tab/刷新零回带 */
  segRuns?: DtSegRun[]; segView?: number;
  /* 语义色轮：历史记录补 ok/took 展示元数据（旧草稿无此二字段→行内不渲染，零降级）；
 补 ts 落盘（QueryHistoryPanel relTime 需要 epoch；旧草稿无 ts 回解析 time 串）；
 补 seg 段标识（段执行时=「seg i/n」，全量执行无此字段，旧草稿零降级） */
  history: { method: string; path: string; body: string; time: string; ts?: number; ok?: boolean; took?: number; seg?: string }[];
}

const tabs = ref<Tab[]>([]);
const active = ref(0);
const cur = computed(() => tabs.value[active.value]);

/* 段执行锚（多段执行每段独立响应位，Kibana 对位）——execOneSeg 落槽、
 徽标点击经 loadSegRun 载回主响应区；形态见 Tab.segRuns 注 */
interface DtSegRun { label: string; ok: boolean; took: number; status?: number | null; errBrief?: string | null; result: string; resultFull?: string | null; truncated?: boolean }

/* W3-T11：端点目录联动——onEndpoint 记录选中端点（按 tab id 隔离，切 tab 不串），
 curEp 驱动 method 置灰与 body 骨架；路径不再匹配端点模板（自由文本）即脱钩回全可用（零降级） */
/* 方法全集收口 esEndpoints.REST_METHODS */
const METHODS = REST_METHODS;
const pickedEp = ref<Record<string, EsEndpoint>>({});
/** 端点模板匹配：{index}/{id} 槽位段适配任意单段实例，查询串不参与 */
function epMatch(ep: EsEndpoint, p: string): boolean {
  const bare = (p || '').split('?')[0];
  const re = new RegExp('^' + ep.path.split(/\{[a-z]+\}/)
    .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+') + '$');
  return re.test(bare);
}
const curEp = computed<EsEndpoint | null>(() => {
  const t = cur.value;
  const ep = t ? pickedEp.value[t.id] : undefined;
  return ep && epMatch(ep, t!.path) ? ep : null;
});
function onEndpoint(ep: EsEndpoint) {
  const t = cur.value; if (!t) return;
  pickedEp.value[t.id] = ep;
  /* 当前 method 不在端点 methods 内 → 自动纠正为首个（与置灰提示并存） */
  if (!ep.methods.includes(t.method)) t.method = ep.methods[0];
}
function insertBody() { if (cur.value && curEp.value?.body) cur.value.body = curEp.value.body; }

/* P1-1：字段源跟请求路径走——/orders/_search 的补全/类型体检吃 orders 的字段
 （此前恒用 pickedIdx，自由路径请求与补全错位）。dtPathIdx=剥 '?' 后首段。
 ·实报修正：原「首个非 '_' 段」遍历会把 /_cat/indices 的 cat 子命令
 indices 误当索引名拉 /indices/_mapping（404）——改首段判定：首个非空段 '_' 开头
 （_cat/_cluster/_nodes 等系统路径）恒空串回退 pickedIdx，不再从后段抠索引。
 路径首段是击键级高频源：防抖 400ms 后再拉字段，'o'/'or' 部分串不再逐键发 mappingDetail。 */
const dtPathIdx = computed(() => {
  const seg = (cur.value?.path || '').split('?')[0].split('/').find(Boolean);
  return seg && !seg.startsWith('_') ? seg : '';
});
const { fields: dtFields, ensure: ensureDtFields } = useIndexFields(() => dtPathIdx.value || store.pickedIdx || '');
const ensureDtFieldsDebounced = useDebounceFn(() => { ensureDtFields(); }, 400);
watch(() => dtPathIdx.value || store.pickedIdx, () => { ensureDtFieldsDebounced(); }, { immediate: true });
const dtBodyKind = computed(() => bodyKindForPath(curEp.value?.path ?? cur.value?.path ?? '', cur.value?.method ?? ''));
/* P0-2a：body 语言跟档——_bulk 的多行 NDJSON 恒吃 json 语言会被 json worker
 多根对象全线误报语法红线；切 ndjson（自研 monarch，无 JSON LS 校验）红线消失、高亮保留 */
/* 1439：体语言抽成共享纯函数（_bulk/_msearch → ndjson）——REST 页同源 */
const bodyLang = computed(() => bodyLangForPath(cur.value?.path || ''));
/* dslAssist 闭包在 setup 作用域声明（T14 实证：模板内联字面量走 _ctx 代理，ref 顶层 unwrap 后 .value 取 undefined） */
/* terms 通道接值位动态候选（658 DqlQueryView 首发姊妹刀）——索引源与 dtFields
 同源闭包（dtPathIdx||pickedIdx）现调现读：body 索引随 path 变时 suggest 请求跟着走
 （655 设计 -4：terms 闭包索引绑定=视图责任）；未选索引/异常恒 resolve [] 零扰动 */
const dtTerms = useTermsSuggest(() => dtPathIdx.value || store.pickedIdx || '');
const dslAssist = { fields: () => dtFields.value, bodyKind: () => dtBodyKind.value, indices: () => store.indices.map(i => i.index), terms: (f: string, p: string) => dtTerms.suggestAsync(f, p) };
/* 请求体 lint 静态体检。：按 dtBodyKind 路由分派——
 search→lintDsl / bulk（_bulk→none 档）→ndjsonLint（bulkNdjson 既有件复用不改）/
 settings→lintSettingsBody / mapping→lintMappingBody / 结构化体→lintBodyKeys 根键校验 /
 其他（doc 等）→[]。
 search/settings/mapping 档 JSON 解析失败静默（格式化按钮的校验已在）；bulk 档吃原文不进 JSON.parse */
const dtLint = computed<Finding[]>(() => {
  const kind = dtBodyKind.value;
  const body = cur.value?.body || '';
  try {
    if (kind === 'none' || kind === 'msearch-body' || kind === 'msearch-template-body' || kind === 'bulk-body') {
      const mode = kind === 'msearch-body' ? 'msearch' as const
        : kind === 'msearch-template-body' ? 'msearch-template' as const : 'bulk' as const;
      const base = lintNdjsonBody(body, mode);
      return kind !== 'none'
        ? [...base, ...lintNdjsonLineKeys(body, mode)]
        : base;
    }
    if (kind === 'settings') return lintSettingsBody(JSON.parse(body));
    if (kind === 'mapping') return lintMappingBody(JSON.parse(body));
    if (kind === 'search') return lintDsl(JSON.parse(body), { fields: dtFields.value });
    /* 1439：结构化体根键校验——与 RestView 同一分派（补全目录同源派生） */
    return lintStructuredBody(kind, body);
  } catch { return []; }
});
/* P0-1：行内 marker 接线（DslQueryView W2-2 成熟范式）——body Monaco ref +
 watch(dtLint → setMarkers)，severity 映射 info→hint（MonacoEditor setMarkers 结构类型
 只收 warning/hint/error）。无 anchor 的 finding（bulk 的 ndjson-pair：NDJSON 无键名锚点，
 '' 锚会误撞文本中的 "%%" 空串形态）不进 findMatches，直接进 unplaced；setMarkers 定位
 不到的 unplaced 一并降级进底部条——不静默丢。挂载前/测试 stub 无 setMarkers 出口时
 全量降级底部条（双可选链防 stub 无 expose）。组件卸载 owner 清理由 MonacoEditor
 onBeforeUnmount 既有兜底承担，此处不重复。 */
const bodyMonacoRef = ref<InstanceType<typeof MonacoEditor> | null>(null);
const lintUnplaced = ref<Finding[]>([]);
watch(dtLint, (findings) => {
  const mappable = findings.filter(f => f.anchor);
  const r = bodyMonacoRef.value?.setMarkers?.(mappable.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
  /* r=undefined（挂载前/测试 stub 无 setMarkers 出口）→ 全量降级底部条不丢；
 r 在场 → 无锚点条目 + 定位不到的 unplaced 降级，已落 marker 的不再进条 */
  lintUnplaced.value = r ? [...findings.filter(f => !f.anchor), ...r.unplaced] : findings.slice();
}, { immediate: true });
const dtLintErrors = computed(() => lintUnplaced.value.filter(f => f.severity === 'error'));
const dtLintWarns = computed(() => lintUnplaced.value.filter(f => f.severity === 'warning' || f.severity === 'hint'));

/* ═══ Ctrl+I = 格式化当前请求体（对齐 Kibana Console 的 Auto-indent 键位）═══
 官方 Console 键位表：Ctrl+I=Auto-indent current request、Ctrl+Space/Enter/Tab=补全候选。
 此前这里把 Ctrl+I 绑成了「唤起补全」——与 Kibana 相反，从 Kibana 过来的人按 Ctrl+I
 期望整理 JSON，却弹出候选框。补全本来就有 Monaco 默认的 Ctrl+Space，不需要抢占该键。
 草稿零触：格式化只替换编辑器内容（等价用户手改），不碰 t.body 的持久化语义。 */
watch(bodyMonacoRef, (mc) => {
  if (!mc) return;
  nextTick(() => {
    const ed = mc.getEditor?.();
    if (!ed || typeof ed.addCommand !== 'function') return;
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
      /* 与「发送时自动格式化」同一个 formatter，避免两套缩进行为不一致 */
      const next = tryFormatBody(ed.getValue?.() ?? cur.value?.body ?? '');
      if (!next || next === ed.getValue?.()) return;
      const model = ed.getModel?.();
      if (model && typeof ed.executeEdits === 'function') {
        ed.executeEdits('dt-auto-indent', [{ range: model.getFullModelRange(), text: next }]);
      } else {
        ed.setValue?.(next);
      }
      /* 编辑器是草稿的唯一真源：同步回 tab，让「切 Tab 再回来」看到的仍是格式化后的内容 */
      if (cur.value) cur.value.body = next;
    });
    /* Kibana Console `Ctrl+↑/↓`（previous/next request end）对位：在请求之间移动光标。
       我们的 Tab 已是「一条请求」，所以跳转落在相邻请求的起始行；找不到就保持不动
       （返回 -1 时不 setPosition，避免把光标弹回文件头）。 */
    const jump = (line: number) => {
      if (line < 0) return;
      const model = ed.getModel?.();
      const maxCol = model ? model.getLineMaxColumn(line) : 1;
      ed.setPosition?.({ lineNumber: line, column: maxCol });
      ed.revealLineInCenterIfOutsideViewport?.(line);
    };
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.UpArrow, () => {
      jump(prevRequestLine(ed.getValue?.() ?? '', ed.getPosition?.()?.lineNumber ?? 1));
    });
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.DownArrow, () => {
      jump(nextRequestLine(ed.getValue?.() ?? '', ed.getPosition?.()?.lineNumber ?? 1));
    });
  });
}, { immediate: true });

function mkTab(title?: string, method = 'GET', path = '/_cluster/health', body = ''): Tab {
  return { id: Math.random().toString(36).slice(2, 8), title: title || 'Tab ' + (tabs.value.length + 1),
    method, path, body, result: null, ok: false, took: 0, size: 0, busy: false, history: [] };
}
/* 默认三标签：首装与换号清理共用同一份（两处必须一致，故抽成单点） */
function DEFAULT_TABS(): Tab[] {
  return [
    mkTab('健康', 'GET', '/_cluster/health', ''),
    mkTab('索引', 'GET', '/_cat/indices?v&format=json', ''),
    mkTab('查询', 'POST', '/_search', '{"size":5,"query":{"match_all":{}}}'),
  ];
}
/* 导出/导入请求文件（Kibana Console「Export / Import requests」）——纯文本，
   保住方法行/请求体/排版；导入每段成一个 Tab。整份替换语义与 Kibana 一致（导入先确认）。 */
const importFileEl = ref<HTMLInputElement | null>(null);
function exportToFile() {
  const text = exportRequests(tabs.value.map(t => ({ method: t.method, path: t.path, body: t.body })));
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'devtools-' + stamp + '.http';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  store.notify('success', '已导出 ' + tabs.value.length + ' 个请求');
}
async function importFromFile(ev: Event) {
  const el = ev.target as HTMLInputElement;
  const file = el.files?.[0];
  el.value = ''; /* 同一文件可再次选择 */
  if (!file) return;
  let text = '';
  try { text = await file.text(); }
  catch (e: any) { store.notify('error', '读取文件失败：' + (e?.message || e)); return; }
  const { requests, skipped } = parseRequests(text);
  if (!requests.length) {
    store.notify('warning', skipped.length
      ? '文件里没有可识别的请求（首个无法解析的行：' + skipped[0] + '）'
      : '文件里没有请求');
    return;
  }
  const ok = await askConfirm({
    title: '导入请求文件',
    message: '将用文件中的 ' + requests.length + ' 个请求替换当前 ' + tabs.value.length + ' 个 Tab'
      + (skipped.length ? '（另有 ' + skipped.length + ' 段无法识别，将被忽略：' + skipped[0] + '）' : '') + '。',
    okText: '替换导入',
  });
  if (!ok) return;
  tabs.value = requests.map(r => {
    const t = mkTab();
    t.method = r.method;
    t.path = r.path;
    t.body = r.body;
    t.title = requestTitle(r);
    return t;
  });
  active.value = 0;
  persist();
  store.notify('success', '已导入 ' + requests.length + ' 个请求'
    + (skipped.length ? '，忽略 ' + skipped.length + ' 段无法识别的内容' : ''));
}
function addTab() { tabs.value.push(mkTab()); active.value = tabs.value.length - 1; persist(); }
/* 后：tab 聚焦后 ←/→ 切换（QueryHub onModesKeydown 同款 roving 模式） */
function onTabsKeydown(e: KeyboardEvent) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (renamingIdx.value !== null) return; /* 重命名输入中：←/→ 是光标移动 */
  const btns = [...((e.currentTarget as HTMLElement).querySelectorAll('.dt-tab'))] as HTMLElement[];
  const i = btns.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  e.preventDefault();
  const next = e.key === 'ArrowLeft' ? (i - 1 + btns.length) % btns.length : (i + 1) % btns.length;
  btns[next]?.focus();
  active.value = next;
}

/* Tab 重命名 */
const renamingIdx = ref<number | null>(null);
const renameVal = ref('');
function startRename(i: number) {
  renamingIdx.value = i;
  renameVal.value = tabs.value[i].title;
}
function commitRename(i: number) {
  if (renamingIdx.value !== i) return;
  const val = renameVal.value.trim();
  if (val) { tabs.value[i].title = val; tabs.value[i].named = true; persist(); }
  renamingIdx.value = null;
}

/* 重命名输入自动聚焦 */
const vFocus = { mounted: (el: HTMLElement) => el.focus() };

/* 标签右键菜单（批量关闭/复制现场）——动作全部复用既有单标签函数：
   仅此处按「多标签现场」补充 closeOthers/closeAll（逐个 closeTab 会每次 persist，
   这里一次性裁剪后落盘一次，避免 N 次写） */
const tabMenu = ref<{ x: number; y: number; i: number } | null>(null);
function openTabMenu(e: MouseEvent, i: number) {
  tabMenu.value = { x: e.clientX, y: e.clientY, i };
}
function onTabMenuKey(e: KeyboardEvent, i: number) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  tabMenu.value = { ...menuKeyAnchor(e), i };
}
function closeOthers(keep: number) {
  const kept = tabs.value[keep];
  if (!kept) return;
  for (const t of tabs.value) if (t.id !== kept.id) delete pickedEp.value[t.id];
  tabs.value = [kept];
  active.value = 0;
  persist();
}
function closeAll() {
  for (const t of tabs.value) delete pickedEp.value[t.id];
  tabs.value = [mkTab()];
  active.value = 0;
  persist();
}
const tabMenuItems = computed<CcmItem[]>(() => {
  const m = tabMenu.value; if (!m) return [];
  const t = tabs.value[m.i];
  if (!t) return [];
  return [
    { key: 'activate', label: '切到此标签', icon: Play, run: () => { active.value = m.i; } },
    { key: 'rename', label: '重命名…', icon: Pencil, run: () => startRename(m.i) },
    {
      key: 'copy-group', label: '复制…', icon: Copy, sep: true, children: [
        { key: 'copy-title', label: '复制标签名', icon: Copy, run: () => {
          void copyText(t.title).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制标签名' : '复制失败'));
        } },
        { key: 'copy-path', label: '复制路径', icon: Copy, run: () => {
          void copyText(t.path).then(ok => store.notify(ok ? 'success' : 'error', ok ? '已复制路径' : '复制失败'));
        } },
        { key: 'copy-curl', label: '复制此标签的 cURL', icon: Terminal, run: () => {
          const c = `curl -X ${t.method} '${window.location.origin}${t.path}'` +
            (t.body ? ` -H 'Content-Type: application/json' -d '${t.body.replace(/'/g, "'\\''")}'` : '');
          void copyText(c).then(ok => store.notify(ok ? 'success' : 'error', ok ? 'curl 已复制' : '复制失败'));
        } },
      ],
    },
    {
      key: 'close-group', label: '关闭…', icon: X, sep: true, children: [
        { key: 'close', label: '关闭此标签', icon: X, run: () => closeTab(m.i) },
        ...(tabs.value.length > 1
          ? [{ key: 'close-others', label: `关闭其他 ${tabs.value.length - 1} 个`, icon: X, run: () => closeOthers(m.i) }]
          : []),
        { key: 'close-all', label: `关闭全部 ${tabs.value.length} 个`, icon: X, danger: true, run: () => closeAll() },
      ],
    },
  ];
});

function closeTab(i: number) {
  /* T11 复审 M3：pickedEp 按 tab.id 键控——关 tab 同步清键，防键控残留 */
  const tid = tabs.value[i]?.id;
  tabs.value.splice(i, 1);
  if (tid) delete pickedEp.value[tid];
  if (active.value >= tabs.value.length) active.value = Math.max(0, tabs.value.length - 1);
  if (tabs.value.length === 0) tabs.value.push(mkTab());
  persist();
}
/* 重置确认收敛全局 askConfirm（等价改写：warn 级 + 后果前置文案 + okText「清空全部」）。
 互斥闸置位前移到确认窗之前：确认窗挂起期间重置钮禁用，二击不再穿透双开确认窗
 （confirm.ts 全局单例覆写会把第一开按取消静默收掉）；取消/确认路径 try/finally 复位防闸死 */
const resetting = ref(false);
async function reset() {
  if (resetting.value) return;
  resetting.value = true;
  try {
    const ok = await askConfirm({
      title: '重置 Dev Tools',
      message: `将关闭全部 ${tabs.value.length} 个标签并清空各自的请求与历史（仅本地记录，不影响集群），不可恢复。`,
      level: 'warn',
      okText: '清空全部',
    });
    if (!ok) return;
    doReset();
  } finally { resetting.value = false; }
}
function doReset() {
  removeStoredRaw(sessionStorage, DRAFT_KEY.value); tabs.value = [mkTab()]; active.value = 0;
  pickedEp.value = {}; /* T11 复审 M3：重置一并清空端点联动残留 */
}
/* 落盘剥离 result/resultFull（响应体体积大且时效性强，不持久化）——巨型响应曾把
 存储逼近 5MB 上限写爆静默失败，标签持久化整体失效；：busy 同不落盘——执行中
 刷新/关页后恢复 busy:true 会永久卡在「执行中」，落盘前强制复位，恢复侧再兜一层。 */
/* 历史面板折叠态（KeepAlive 切页回来不重置）；：会话内 ref → usePref
 落盘（dt.histOpen，跨会话记忆；默认 true=首次仍展开，既有行为零变化） */
const histOpen = usePref('dt.histOpen', true);
/* 编辑器字号三档落盘（dt.font，默认 12.5=MonacoEditor 组件既有默认零漂移）——
 请求体 Monaco 与响应只读面同键；MonacoEditor fontSize prop 既有（黑名单零触，纯宿主传参） */
const edFont = usePref<number>('dt.font', 12.5);
/* 本地三档常量退役合并 utils/editorTiers 单源（模板 v-for 直用
 EDITOR_FONT_TIERS）；fontSize 响应缺角（prop 变更 Monaco 无感知）亦 
 在 MonacoEditor 补 watch 修复 */
/* 发送态 auto-format 退出口（dt.autoFmt 落盘，默认开=557 既有行为零变化）——
 关闭后发送出参直送草稿原稿；宽容格式化仍归手动 format 钮既有路径 */
const autoFmt = usePref('dt.autoFmt', true);
/* 历史列表限高三档（dt.histH useTierCycle 落盘）——首档=2.9.115/119 事故面
 冻结值 max(240px, 42vh) 零漂移；/devtoolsLint532 冻结 CSS 字面零触
 （仍在册=缺省档同值），档值经 .dt-hist 容器注入 --dt-hist-h 变量、后置同选择器规则消费。
 恒高块纪律不变：dt-hist flex-shrink:0，max 变档只改列表自身滚动上限，dt-body 定高链零触。 */
const HIST_H_TIERS: string[] = ['max(240px, 42vh)', 'max(360px, 56vh)', 'max(480px, 70vh)'];
const { v: histH, cycle: cycleHistH } = useTierCycle('dt.histH', HIST_H_TIERS);

/* P2-3：跨 Tab 历史汇聚——per-tab cap50 切 Tab 互不可见，写历史时镜像一份到
 sessionStorage 键 es_devtools_hist_all:{target}（cap100，条目 method/path/body/ts/ok/took），
 dt-hist 面板「全部」chip 渲染汇聚清单，条目 fill/play 回当前 Tab。
 ⚠ dt-hist 直挂 dt-body 落位与 .qhp-list max(240px,42vh) 口径不动（2.9.115 事故位红线） */
const HIST_ALL_KEY = computed(() => `es_devtools_hist_all:${store.target || 'host'}`);
interface HistAllEntry { method: string; path: string; body: string; ts: number; ok: boolean; took: number; }
const histAll = ref<HistAllEntry[]>([]);
const histScope = ref<'tab' | 'all'>('tab');
function histAllRead(): HistAllEntry[] {
  try {
    const r = JSON.parse(sessionStorage.getItem(HIST_ALL_KEY.value) || '[]');
    return Array.isArray(r) ? r : [];
  } catch { return []; }
}
function mirrorHistAll(e: HistAllEntry) {
  const next = [e, ...histAll.value].slice(0, 100);
  histAll.value = next;
  writeStoredRaw(sessionStorage, HIST_ALL_KEY.value, JSON.stringify(next));
}
/* 切集群目标：汇聚清单按新 key 重新水合（键带 target 维度，与 DRAFT_KEY 同口径） */
watch(() => store.target, () => { histAll.value = histAllRead(); });

/* 本 Tab 历史清空——面板 clearable 契约（emit('clear')，确认由父做）。
 仅本 Tab 档开启（「全部」档是跨 Tab 汇聚镜像，按 Tab 清越权，不开放该档清空钮）；
 确认后清当前 tab history（tabs deep watch 自动冲刷草稿落盘） */
/* 确认链互斥闸与 reset 同口径：置位前移到确认窗之前，二击不再穿透双开（清空钮在
 QueryHistoryPanel 内部无闸面，闸收执行体本体=唯一可靠通道）；try/finally 复位防闸死 */
const clearingHist = ref(false);
async function askClearTabHist() {
  if (clearingHist.value) return;
  const t = cur.value;
  if (!t || !t.history?.length) return;
  clearingHist.value = true;
  try {
    const ok = await askConfirm({
      title: '清空本 Tab 历史',
      message: `将删除本 Tab 的全部 ${t.history.length} 条请求历史记录，此操作不可撤销。`,
      level: 'warn',
      okText: '清空',
    });
    if (!ok) return;
    t.history = [];
  } finally { clearingHist.value = false; }
}

/* ==== ：原始 IO 快查（响应工具行钮） ====
 本页执行走 api.devtoolsExecute（/cluster/devtools/execute 透传，兼容历史 /cluster/raw 记录），记录环按该特征取最近一条开弹窗；无记录时空态引导。 */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
/* 判空同步更新（DslQueryView 550 口径逐字平移）——无记录 notify 引导不开空弹窗 */
function openRawIo() {
  const rec = ioRecorder.last('/cluster/devtools/execute') || ioRecorder.last('/cluster/raw');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

function writeDraft() {
  try {
    /* segRuns/segView 段锚剥离（与 result 同保密级，恢复侧零回带） */
    writeStoredRaw(sessionStorage, DRAFT_KEY.value, JSON.stringify({
      active: active.value,
      tabs: tabs.value.map(t => ({ ...t, result: null, resultFull: null, busy: false, segRuns: [], segView: -1 })),
    }));
  } catch { /* 隐私模式/存储满容忍 */ }
}
/* URL 即现场轮：写入改 300ms 防抖（deep watch 高频击键不再逐次整包序列化）；
 pagehide/卸载冲刷兜「改完立刻刷新」的防抖尾窗，刷新恢复不丢最后一次编辑 */
let draftTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { draftTimer = null; writeDraft(); }, 300);
}
watch(tabs, persist, { deep: true });
/* active 并入同一草稿对象持久化——刷新后回到用户所在标签（此前恒归第一个） */
watch(active, persist);
function flushDraft() { if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; writeDraft(); } }
/* 顶栏全局 MCP 入口：一次性标记打开面板，读后即删（KeepAlive 再进入也幂等）。 */
function onMcpOpenEvent() {
  removeStoredRaw(sessionStorage, 'esquerystudio.mcp.open');
  mcpOpen.value = true;
}
function consumeMcpOpen() {
  try {
    if (sessionStorage.getItem('esquerystudio.mcp.open') === '1') {
      removeStoredRaw(sessionStorage, 'esquerystudio.mcp.open');
      mcpOpen.value = true;
    }
  } catch { /* 存储不可用不阻断页面 */ }
}
onMounted(() => {
  window.addEventListener('esquerystudio:mcp-open', onMcpOpenEvent);
  window.addEventListener('pagehide', flushDraft);
  window.addEventListener('esquerystudio:identity-changed', onIdentityReset);
  let restored = false;
  try {
    const raw = JSON.parse(sessionStorage.getItem(DRAFT_KEY.value) || 'null');
    /* 恢复侧 busy 兜底复位（旧版本落盘过 busy:true 的存量数据在此自愈） */
    if (raw && Array.isArray(raw.tabs) && raw.tabs.length) {
      /* 语义色轮：errBrief 恢复侧一并清（result 已在落盘侧剥离，摘要条不陪孤儿响应挂到刷新后） */
      tabs.value = raw.tabs.map((t: any) => ({ ...t, busy: false, errBrief: null }));
      if (Number.isInteger(raw.active) && raw.active >= 0 && raw.active < tabs.value.length) active.value = raw.active;
      restored = true;
    }
  } catch { /* 草稿损坏静默兜底：回落默认三个示例标签 */ }
  if (!restored) tabs.value = DEFAULT_TABS();
  histAll.value = histAllRead(); /* ：跨 Tab 汇聚清单按 target 键水合 */
  consumePrefill();
  consumeMcpOpen();
  /* 视图级全局执行——工作台任意处 Ctrl+Enter 即跑当前 Tab（DslQueryView 先例平移） */
  window.addEventListener('keydown', onGlobalRunKey);
});
/* KeepAlive 白名单再进入仍消费预填（实报「打开不自动填充」根因②）——
 本页在 KEEP_ALIVE_VIEWS 名单（App.vue line95 明文要求「深链预填在 onActivated 下仍可消费」，
 入名单时漏）；esquerystudio.devtools.open 既有 5 写入方（DslQuery/Watcher/IndexHub/Ilm/
 CmdPalette）+827 favReplay devtools 分支第 6 写入方，缓存态此前全被吞。键读后即删=与
 onMounted 双挂载幂等无害 */
onActivated(() => {
  /* KeepAlive 缓存态恢复：全局键只在页面激活时挂载，离页不得残留执行通道 */
  pageActive.value = true;
  window.addEventListener('keydown', onGlobalRunKey);
  consumePrefill();
  consumeMcpOpen();
});
onDeactivated(() => {
  /* 切页仅失活不卸载——必须摘掉全局执行键，防在别的页面 Ctrl+Enter 触发隐藏 Tab 写请求 */
  pageActive.value = false;
  pendingPrefillRun.value = false;
  pendingPrefillTab.value = null;
  window.removeEventListener('keydown', onGlobalRunKey);
});
/* 换号清理（1130）：App 的 onIdentityChanged 只清 store/ioRecorder/模块缓存，
   本组件里的 Tab 草稿、变量弹窗草稿、响应过滤表达式都是**内存态**——不落盘也照样在屏幕上。
   不清的话，下一个用户点执行会带着上一个账号的路径与变量发出去。
   重建默认 Tab 即同时丢掉旧响应，所以这里不做「原地保留」的例外。 */
function onIdentityReset() {
  try { tabs.value = DEFAULT_TABS(); active.value = 0; } catch { /* 极端态下保持可用 */ }
  /* 跨 Tab 历史汇聚是内存镜像：磁盘键（es_devtools_hist_all:*）已被 purgeUserRequestState
     按 es_devtools_ 前缀清掉，但 ref 不清就会在**同一会话内换号**后继续显示上一账号的
     请求历史，直到切目标或刷新才消失。 */
  histAll.value = [];
  histScope.value = 'tab';
  varsMap.value = {};
  newVarK.value = ''; newVarV.value = '';
  varsOpen.value = false;
  respFilter.expr = '';
  respFilter.mode = 'jq';
  curlOpen.value = false; curlErr.value = '';
  permOpen.value = false;
  store.notify('info', '账号已切换：DevTools 的标签页与变量草稿已清空');
}

onBeforeUnmount(() => {
  window.removeEventListener('esquerystudio:mcp-open', onMcpOpenEvent);
  window.removeEventListener('pagehide', flushDraft);
  window.removeEventListener('esquerystudio:identity-changed', onIdentityReset);
  window.removeEventListener('keydown', onGlobalRunKey); /* ：全局键随挂载对摘除 */
  flushDraft(); /* 卸载前冲刷防抖尾窗，草稿不丢 */
});

/* ═══ ：视图级全局执行（DslQueryView onGlobalRunKey 先例平移）═══
 执行钮/Monaco es-execute action 之外的可发现入口：工作台任意处 Ctrl+Enter 即跑当前 Tab。
 输入守卫：INPUT/TEXTAREA/SELECT/contentEditable 让路（原生换行/提交语义优先）；
 Monaco 内已有同名 execute action 且 .monaco-editor 判定让路（不重复触发）；
 执行中让路防并发重入（run() 首行 busy 快照守卫双保险） */
function onGlobalRunKey(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable || t.closest('.monaco-editor'))) return;
  if (!cur.value || cur.value.busy) return;
  e.preventDefault();
  /* Shift+Ctrl+Enter=全部段顺序执行（切段只作用于发送出参）；
 无 Shift=既有全量执行。编辑器内两键由 es-execute（光标段）/键面冒泡（全部段）承接 */
  if (e.shiftKey) void runSmart(true); else run();
}

/* -f 跨工具联动入口——命令面板「新开标签」与其他视图（Watcher 等）
 通过 sessionStorage 预填一个请求后跳转过来，这里统一消费。 */
function consumePrefill() {
  if (sessionStorage.getItem('esquerystudio.devtools.newtab')) {
    removeStoredRaw(sessionStorage, 'esquerystudio.devtools.newtab');
    tabs.value.push(mkTab(undefined, 'GET', '/', ''));
    active.value = tabs.value.length - 1;
    persist();
  }
  const raw = sessionStorage.getItem('esquerystudio.devtools.open');
  if (!raw) return;
  removeStoredRaw(sessionStorage, 'esquerystudio.devtools.open');
  try {
    const p = JSON.parse(raw);
    const tab = mkTab(p.title, p.method || 'GET', p.path || '/', p.body || '');
    tabs.value.push(tab);
    active.value = tabs.value.length - 1;
    persist();
    /* 身份探测未完成时不得自动发出写请求：预填只回填、不执行。
       自动执行仅限 GET/HEAD 与搜索类只读 POST——sessionStorage 同源可写，
       任意脚本塞入 run:true 的 DELETE/PUT 不得借打开 DevTools 自动落地。 */
    const readOnlyPrefill = isReadOnlyPrefill(p.method || 'GET', p.path || '/');
    if (p.run && readOnlyPrefill) {
      if (!auth.probed) {
        pendingPrefillRun.value = true;
        pendingPrefillTab.value = tab;
        store.notify('info', '身份确认中，请求已填入，确认后自动执行');
      } else if (canAdmin.value) {
        run();
      } else {
        store.notify('warning', '无 DevTools 写权限，请求已填入但未执行');
      }
    } else if (p.run) {
      store.notify('info', '写请求仅预填，请确认后手动发送');
    }
  } catch { /* 预填内容损坏则忽略，正常打开 DevTools */ }
}

/* run() 前置 auto-format（Kibana「send 时 auto indent」对标，556 设计稿 P2）——
 合法 JSON 才 pretty；非法/带注释（JSONC）原样不动：严格 JSON.parse 门（不走 stripJsonComments
 宽容口径——宽容解析会剥注释，DQ「不做」同因；宽容路径仍归手动 format 钮既有 :789-793）。
 发送态格式化只作用于 api.devtoolsExecute 出参（bodyOut），t.body 草稿零触：草稿是 sessionStorage 持久稿，
 且历史/跨 Tab 汇聚镜像源码锁钉 body: t.body 原稿（devtoolsLint532:310-311）、fill 回填
 逐字节保形（279）。非法静默（dtLint 已报，不重复播报） */
function tryFormatBody(body: string): string {
  if (!body) return body;
  try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
}

async function run() {
  /* 权限门双保险：按钮 v-if 之外，键盘/历史/预填所有入口在执行体首行拦截（busy 置位前）。
     按**内层方法**分档：只读请求读键即可，写请求才要写键（1133）。 */
  if (!cur.value || !canExecInner(cur.value.method, cur.value.path)) {
    store.notify('warning', cur.value && canExecRead.value
      ? '当前身份对该连接只有只读权限：内层写请求需要 DevTools / REST 直连的写权限'
      : '原始透传需要 ADMIN，或该连接的 DevTools / REST 直连读/写权限');
    return;
  }
  if (!requestInScope(cur.value?.method || 'GET', cur.value?.path || '/', cur.value?.body)) {
    store.notify('warning', SCOPE_DENY_HINT);
    return;
  }
  /* G7-A1：Ctrl+Enter 键盘路径不受按钮 :disabled 约束——执行体守卫管键盘重入（教训 7，
 与 观察项 TemplatesView Ctrl+S 同构；busy 期间连按不再并发重发写请求）
 复审 F1：头部快照 tab 引用——await 期间用户切 tab 后 cur 随 active 漂移，
 不快照会把结果/历史写进新 tab，且原 tab 的 busy=true 永远无人复位（永久锁死）。
 网络/响应/历史内核下沉 execSend（全量与段执行共走一条链），
 本函数=全量语义入口（busy 快照与 autoFmt 出参位置语义不变，557/560 锁面原样） */
  const t = cur.value;
  if (!t || t.busy) return;
  t.busy = true; t.result = null; t.errBrief = null; t.status = null;
  /* send 前置 auto-format（草稿零触，出参进 api.raw）；
 dt.autoFmt 退出口——关闭后直送草稿原稿（devtoolsLint532 历史/镜像 body:t.body 锁面零触） */
  const bodyOut = autoFmt.value ? tryFormatBody(t.body) : t.body;
  await execSend(t, bodyOut);
}

/* 发送/响应/历史共用内核——api.raw 透传、信封解包、截断展示、标题命名、
 历史与跨 Tab 镜像全部在此（run 全量与段执行唯一分叉=bodyOut 与 segLabel）。
 segLabel 在场=段执行：历史条目补 seg 标识（「seg i/n」）便于区分段现场；
 镜像 HistAllEntry 字段零增（跨 Tab 汇聚锁面零触），草稿 t.body 原稿零触。 */
async function execSend(t: Tab, bodyOut: string, segLabel?: string): Promise<boolean> {
  /* 内核单点门：全量/段执行/预填/历史回放最终都汇入此处。
     按内层方法分档（1133）：只读身份可执行只读请求，写请求必须写键/ADMIN。
     调用方已置 busy；此处拒绝必须复位，否则权限在等待期间被撤会永久锁死该 Tab。 */
  if (!canExecInner(t.method, t.path)) {
    store.notify('warning', canExecRead.value
      ? '当前身份对该连接只有只读权限：内层写请求需要 DevTools / REST 直连的写权限'
      : '原始透传需要 ADMIN，或该连接的 DevTools / REST 直连读/写权限');
    t.busy = false;
    return false;
  }
  if (!requestInScope(t.method, t.path, t.body)) {
    store.notify('warning', SCOPE_DENY_HINT);
    t.busy = false;
    return false;
  }
  /* Console Variables（Kibana 同款 ${var}）——放在权限/范围判定之后、发车之前：
     判定必须看原始请求（变量可能展开成任何路径，先按用户写的判），发送用展开值。
     未定义变量显式拦住：把 `${var}` 原样发给 ES 只会得到难懂的语法错误。 */
  const miss = missingVars([t.path || '', bodyOut].join('\n'));
  if (miss.length) {
    store.notify('warning', '变量未定义：' + miss.map(n => '${' + n + '}').join('、') + '——请先在「变量」里填值');
    t.busy = false;
    return false;
  }
  const pathOut = hasVars(t.path || '') ? applyVars(t.path || '', undefined, { pathMode: true }) : t.path;
  /* Kibana 把 `//` `#` `/* *\/` 当语法：发送前必须剔除，否则用户按 Kibana 习惯写一行说明
     就会拿到 Unexpected character ('/') —— 看起来像控制台坏了。变量展开后再剥离：
     变量值本身也可能带注释（多见于粘来的片段）。草稿 t.body 原稿零触。 */
  const bodyExpanded = hasVars(bodyOut) ? applyVars(bodyOut) : bodyOut;
  /* 与 RestView 同一单源（utils/jsonc.findCommentRanges）：`//` `#` 与块注释都在此剥离。
     剥完只剩空白则送空串（别把空壳发给 ES）；草稿 t.body 原稿零触。 */
  const stripped = stripJsonComments(bodyExpanded);
  const bodyFinal = stripped.trim() ? stripped : '';
  /* 变量展开结果必须再过一次范围门：否则非 ADMIN 写 `/${v}/_snapshot`、变量值是控制面路径时，
     前端守卫会看着「原始路径」放行，而实际发出的是越权路径（后端仍会拦，但前端不该放行）。 */
  if (pathOut !== t.path || bodyFinal !== bodyOut) {
    if (!requestInScope(t.method, pathOut, bodyFinal)) {
      store.notify('warning', SCOPE_DENY_HINT + '（变量展开后的实际请求已越出当前授权范围）');
      t.busy = false;
      return false;
    }
  }
  const t0 = performance.now();
  const signal = qr.begin();
  try {
    /* 走 api.devtoolsExecute 统一封装：自动带 context-path 前缀、鉴权头、X-Es-Target 目标头。
 body 送格式化出参（bodyOut），t.body 草稿原样进历史/镜像 */
    const data = await api.devtoolsExecute(t.method, pathOut, bodyFinal, signal);
    /* 语义色轮：/cluster/devtools/execute 成功回 {status, body} 信封（RestView 读 .status/.body 同款解包）——
 此前整信封 stringify 进面板，body 变转义字符串且真实 ES 状态码不可见。解包后
 body 直接进面板/截断/复制链路，status 供 HTTP 徽标语义分档；信封形态不符（防御）保持整包。 */
    const env = data && typeof data === 'object' ? (data as { status?: unknown; body?: unknown }) : null;
    const realStatus = env && typeof env.status === 'number' && env.body !== undefined ? env.status : null;
    let txt = realStatus != null && env ? String(env.body ?? '')
      : typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    if (realStatus != null && !txt.trim()) txt = '（HTTP ' + realStatus + '，空响应体——HEAD/无返回体请求）';
    t.status = realStatus;
    /* 字符串响应若是 JSON 自动 prettify（此前单行巨型 JSON 直接糊面板） */
    try { txt = JSON.stringify(JSON.parse(txt), null, 2); } catch { /* 非 JSON 保持原文 */ }
    t.ok = true; t.took = Math.round(performance.now() - t0); t.size = txt.length;
    /* 大响应截断展示：Monaco 只喂前 512KB（几 MB 曾整卡）；完整原文留内存供复制 */
    if (txt.length > DEVTOOLS_RESP_MAX) {
      t.resultFull = txt;
      t.result = txt.slice(0, DEVTOOLS_RESP_MAX) + '\n\n…（响应 ' + (txt.length / 1048576).toFixed(1) + ' MB 过大，已截断展示前 512 KB——「复制响应」仍取完整原文）';
      t.truncated = true;
    } else {
      t.result = txt; t.resultFull = null; t.truncated = false;
    }
    /* 语义色轮：历史记录补 ok/took（成功态）；：补 ts 落盘（面板 relTime 用）；
 镜像一份进跨 Tab 汇聚（es_devtools_hist_all，cap100）；
 段执行条目补 seg 标识（全量执行 segLabel 缺席=字段不落，旧稿零降级） */
    t.history = [{ method: t.method, path: t.path, body: t.body,
      time: fmtTime(Date.now()), ts: Date.now(), ok: true, took: t.took, ...(segLabel ? { seg: segLabel } : {}) }, ...(t.history || [])].slice(0, 50);
    mirrorHistAll({ method: t.method, path: t.path, body: t.body, ts: Date.now(), ok: true, took: t.took });
    // 用 path 后缀作为 tab 标题
    const seg = t.path.split('?')[0].split('/').filter(Boolean).slice(-2).join('/');
    if (seg && !t.named) t.title = seg;
    persist();
  } catch (e: any) {
    /* 取消通道甄别先于失败渲染链：用户主动取消=info 轻提示带耗时（DslQueryView 同语言），
 丢弃处理——不进错误条、不写失败历史与汇聚镜像；返回 false 供段执行断链 */
    if (e?.name === 'AbortError') {
      store.notify('info', '已取消（' + (qr.elapsedMs.value / 1000).toFixed(1) + 's）');
      return false;
    }
    t.ok = false; t.took = Math.round(performance.now() - t0);
    /* 语义色轮：原始报错全文留在 result（复制不丢真）；「错误：」前缀移除——
 失败语义由 ✗ 失败 + err-bar 结构化摘要承担，纯 JSON 报错文不再加前缀破坏着色侦测 */
    t.result = String(e?.message || e);
    t.status = e instanceof ApiError && Number.isFinite(e.status) ? e.status : null;
    t.errBrief = friendlyEsError(t.result);
    /* 语义色轮：失败也进历史（ok:false 红点 + 耗时档），重跑链路才覆盖失败现场；：补 ts；
 失败条目同样镜像进跨 Tab 汇聚（ok:false 红点口径一致）；
 段执行失败条目同样补 seg 标识（失败现场段位可辨） */
    t.history = [{ method: t.method, path: t.path, body: t.body,
      time: fmtTime(Date.now()), ts: Date.now(), ok: false, took: t.took, ...(segLabel ? { seg: segLabel } : {}) }, ...(t.history || [])].slice(0, 50);
    mirrorHistAll({ method: t.method, path: t.path, body: t.body, ts: Date.now(), ok: false, took: t.took });
  } finally { t.busy = false; qr.finish(); }
  return true;
}

/* ═══ ：光标处单请求执行（Kibana 多请求编辑器语义）═══
 Ctrl+Enter 只执行光标所在段（方法行 method/path + body 切段出参），Shift+Ctrl+Enter 全部段
 顺序执行；切段只作用于发送出参——草稿持久化/历史 body/镜像 body 原稿零触。
 单段体等价全量 run()（零行为漂移）；编辑器无光标信息（挂载前/测试 stub 无 getEditor 出口）
 回退定位到偏移 0（首段）。执行中让路（busy 快照守卫与 run 同构，防并发重入）。 */
function editorCursorOffset(): number | null {
  const ed = bodyMonacoRef.value?.getEditor?.();
  if (!ed || typeof ed.getModel !== 'function' || typeof ed.getPosition !== 'function') return null;
  const model = ed.getModel();
  const pos = ed.getPosition();
  if (!model || !pos || typeof model.getOffsetAt !== 'function') return null;
  return model.getOffsetAt(pos);
}
function onBodyExecute() { void runSmart(false); }
async function runSmart(all: boolean) {
  /* 段执行（Monaco Ctrl+Enter / Shift+Ctrl+Enter）同样受门，守卫先于 busy 置位。
     按内层方法分档：只读段用读键即可（1133）。 */
  if (!cur.value || !canExecInner(cur.value.method, cur.value.path)) {
    store.notify('warning', cur.value && canExecRead.value
      ? '当前身份对该连接只有只读权限：内层写请求需要 DevTools / REST 直连的写权限'
      : '原始透传需要 ADMIN，或该连接的 DevTools / REST 直连读/写权限');
    return;
  }
  const t = cur.value;
  if (!t || t.busy) return;
  const segs = splitRequests(t.body || '');
  if (segs.length <= 1) { await run(); return; }
  if (all) {
    /* 全量重跑=全量重锚（起跑清段锚，回看位归零）；取消即断链（余段不再起跑） */
    t.segRuns = []; t.segView = -1;
    for (let i = 0; i < segs.length; i++) { if (!(await execOneSeg(segs[i], i, segs.length))) break; }
    /* useQueryRun.cancel 只中止当前在途 fetch（逐段 begin 新建控制器），断链靠返回值透传 */
    return;
  }
  const off = editorCursorOffset();
  const at = Math.min(Math.max(locateSegment(t.body || '', off == null ? 0 : off), 0), segs.length - 1);
  await execOneSeg(segs[at], at, segs.length);
}
async function execOneSeg(seg: DtSeg, i: number, n: number): Promise<boolean> {
  const t = cur.value;
  if (!t || t.busy) return false;
  t.busy = true; t.result = null; t.errBrief = null; t.status = null;
  /* 段出参同吃 autoFmt 退出口（560 口径）；t.body 草稿原稿零触 */
  const bodyOut = autoFmt.value ? tryFormatBody(seg.text) : seg.text;
  const done = await execSend(t, bodyOut, 'seg ' + (i + 1) + '/' + n);
  if (!done) return false; /* 取消段不进锚（丢弃口径一致） */
  /* per-段锚定——每段执行完快照到段位 i（段位稳定，重复执行覆写同槽；
 主响应区现行为零触：末段覆写语义保持，前段响应在徽标里可回看） */
  t.segRuns = [...(t.segRuns || [])];
  t.segRuns[i] = { label: 'seg ' + (i + 1) + '/' + n, ok: t.ok, took: t.took, status: t.status ?? null, errBrief: t.errBrief ?? null, result: t.result || '', resultFull: t.resultFull ?? null, truncated: !!t.truncated };
  t.segView = -1;
  return true;
}
/* 段徽标点击——该段响应载回主响应区（成功段不丢；err-bar/MetaStrip/截断
 面随字段组回放；active 段高亮，新执行后归零） */
function loadSegRun(run: DtSegRun, i: number) {
  const t = cur.value;
  if (!t) return;
  t.ok = run.ok; t.took = run.took; t.status = run.status ?? null; t.errBrief = run.errBrief ?? null;
  t.result = run.result; t.resultFull = run.resultFull ?? null; t.truncated = !!run.truncated;
  t.segView = i;
}

/* 语义色轮：耗时展示与四档（fmtTook/tookClass 本地复制品退役，收口 utils/format.ts 单一出处，
 与 QueryHistoryPanel/TookBadge 同源不再漂移） */
/* HTTP 状态码分档改回 MetaStrip tone 档——2xx→ok 绿 / 4xx→warn 橙 / 5xx→err 红 / 其余(1xx/3xx)→info
 （原 .dt-code 软底徽标随 .dt-status 手写串退役，视觉统一为 MetaStrip 纯文本 tone 语言） */
function codeTone(s: number): 'ok' | 'warn' | 'err' | 'info' {
  if (s >= 200 && s < 300) return 'ok';
  if (s >= 400 && s < 500) return 'warn';
  if (s >= 500) return 'err';
  return 'info';
}
/* took 四档 → MetaStrip tone 映射（fast→ok 绿 / 中→缺省亮 / slow→warn 橙 / veryslow→err 红；
 'ok' 档原 --tx1 与 MetaStrip 缺省 --tx0 同为中性灰阶一档亮度差，换全串统一 tone 语言） */
function tookTone(ms: number): 'ok' | 'warn' | 'err' | undefined {
  const c = tookClass(ms);
  return c === 'fast' ? 'ok' : c === 'slow' ? 'warn' : c === 'veryslow' ? 'err' : undefined;
}
/* 状态元信息行（成败·HTTP 码·took 四档色·size·截断）适配 MetaStrip items——
 语义保留：未知 HTTP 码不出段（真实码已知才渲染） */
const statusMeta = computed<MetaStripItem[]>(() => {
  const t = cur.value;
  if (!t?.result) return [];
  const size = splitSize(t.size);
  const items: (MetaStripItem | null)[] = [
    { value: t.ok ? '✓ 成功' : '✗ 失败', tone: t.ok ? 'ok' : 'err' },
    t.status ? { value: 'HTTP ' + t.status, tone: codeTone(t.status), tip: 'HTTP 状态码 ' + t.status } : null,
    { value: fmtTook(t.took), tone: tookTone(t.took), tip: '端到端耗时（含网络往返）' + t.took + 'ms' },
    { value: size.num, unit: size.unit, tip: '响应大小' },
    t.truncated ? { value: '已截断展示', tone: 'err', tip: '响应过大：Monaco 仅渲染前 512KB，「复制响应」可取完整原文' } : null,
  ];
  return items.filter((x): x is MetaStripItem => x !== null);
});

function loadHist(h: any) { if (!cur.value) return; cur.value.method = h.method; cur.value.path = h.path; cur.value.body = h.body || ''; }
/* 本 Tab 历史适配 QueryHistoryPanel HistRow 形状——
 query 行文本=「METHOD path」（面板过滤/复制/copy 动作都吃 query，合并串让旧 method/path 过滤口径等价）；
 ts 优先取落盘值（旧草稿无 ts 回解析 fmtTime 的 'YYYY-MM-DD HH:mm:ss' 串，解析失败不渲染时间）；
 id=原数组下标（面板 del 事件回传条目对象，按下标定位删除）。
 P2-3：histScope='all' 时切跨 Tab 汇聚清单（histAll，cap100；id=汇聚数组下标），
 条目 method/path/body/ts/ok/took 字段同形，fill/play/del 语义随 scope 分派。 */
const histRows = computed(() => {
  /* time/ts 双可选口径：tab 历史条目有 time（旧稿回解析用），汇聚条目只有落盘 ts；
 body 摘要行需要 body 字段（tab 历史/汇聚条目两形皆有，注记补齐）；
 tab 历史条目多 seg（段执行标识），汇聚条目无此字段（镜像锁面零触） */
  const list: { method: string; path: string; body?: string; ts?: number; time?: string; seg?: string }[] = histScope.value === 'all'
    ? histAll.value
    : (cur.value?.history ?? []);
  return list.map((h, i) => ({
    ...h, id: i,
    query: h.method + ' ' + h.path,
    ts: h.ts ?? (Date.parse(String(h.time || '').replace(' ', 'T')) || undefined),
    /* body 截断摘要（面板可选 sub 行）——80 字符截断 + 省略号，title 悬停看全；
 行对象本体仍经 ...h 携带完整 body（fill/play/curl/导出链零触）。
 段执行标识不进本行字面（552 黑名单行），seg 前缀在下方第二遍 map 补 */
    sub: h.body ? (h.body.length > 80 ? h.body.slice(0, 80) + '…' : h.body) : undefined,
  })).map((r, i) => (list[i].seg ? { ...r, sub: [list[i].seg, r.sub].filter(Boolean).join(' · ') } : r));
});
/* play=填入并立即执行（原 ▶ 语义）；fill 直接复用 loadHist（汇聚档条目同字段形态，fill/play 原样回当前 Tab） */
function histPlay(h: any) { loadHist(h); run(); }
/* 历史行一键复制 curl（面板 'curl' action 宿主组装）——copyCurl 既有手法
 逐字平移（origin=当前页面地址；body 单引号转义），行数据自持 method/path/body */
function histCurl(h: any) {
  const c = `curl -X ${h.method} '${window.location.origin}${h.path}'` +
    (h.body ? ` -H 'Content-Type: application/json' -d '${h.body.replace(/'/g, "'\\''")}'` : '');
  copyText(c).then(ok => store.notify(ok ? 'success' : 'error', ok ? 'curl 已复制' : '复制失败'));
}
/* 历史行「回放到新 Tab」（面板 'newtab' action 宿主组装）——mkTab 先例造新签
 承接行自持的 method/path/body，push 后激活跳转+persist（consumePrefill 同款三连）；
 标题沿用 run 的 path 尾段口径（named 未置，后续执行仍可自动覆盖）；不自动执行——
 「回放」到填入为止，执行主动权留给用户（与 fill 同语义分档，防误发写请求） */
function histNewTab(h: any) {
  const seg = String(h.path || '').split('?')[0].split('/').filter(Boolean).slice(-2).join('/');
  tabs.value.push(mkTab(seg || undefined, h.method, h.path, h.body || ''));
  active.value = tabs.value.length - 1;
  persist();
  store.notify('success', '已在新标签页填入：' + h.method + ' ' + h.path);
}
/* 删除单条历史（面板 del 事件；原 delHist 按索引签名退役，落盘交 tabs deep watch）。
 汇聚档删除=从 histAll 摘除并同步写回 sessionStorage 镜像 */
function histDel(h: { id?: string | number }) {
  if (histScope.value === 'all') {
    if (h.id == null) return;
    histAll.value = histAll.value.filter((_, k) => k !== h.id);
    writeStoredRaw(sessionStorage, HIST_ALL_KEY.value, JSON.stringify(histAll.value));
    return;
  }
  const t = cur.value; if (!t || h.id == null) return;
  t.history = t.history.filter((_, k) => k !== h.id);
}
/* 面板导出行映射——保留 rest 特有字段（{method,path,body,ts} 与 RestView 历史导出互认格式同源） */
const histExportRow = (h: any) => ({ method: h.method, path: h.path, body: h.body, ts: h.ts, ok: h.ok, took: h.took });
/* 历史行一键转收藏——与 saveFav 同一 addFavorite rest 形态（saveFav :），
 addFavorite 按 kind+title 覆盖更新（store :269），重复收藏幂等不产生重复条目，零新存储键 */
function histFav(h: any) {
  store.addFavorite({ kind: 'rest', title: h.method + ' ' + h.path,
    subtitle: (h.body || '').slice(0, 60),
    payload: { method: h.method, path: h.path, body: h.body }, tags: ['rest', 'devtools'] });
  store.notify('success', '已收藏');
}
/* 空态一键起步——填入示例请求并立即执行 */
const SEARCH_SAMPLE = '{"size":5,"query":{"match_all":{}}}';
function quickRun(method: string, path: string, body = '') {
  if (!cur.value) return;
  cur.value.method = method; cur.value.path = path; cur.value.body = body;
  run();
}

/* 格式化/压缩走 JSONC 宽容解析（stripJsonComments 先剥注释）——
 与 DslQuery/RestView/CreateIndexModal 同口径；带注释/尾逗号不再误报「非合法 JSON」 */
function format() {
  if (!cur.value?.body) return;
  try { cur.value.body = JSON.stringify(JSON.parse(stripJsonComments(cur.value.body)), null, 2); }
  catch { store.notify('warning', '非合法 JSON（已容忍注释与尾逗号，仍解析失败）'); }
}
function minify() {
  if (!cur.value?.body) return;
  try { cur.value.body = JSON.stringify(JSON.parse(stripJsonComments(cur.value.body))); }
  catch { store.notify('warning', '非合法 JSON（已容忍注释与尾逗号，仍解析失败）'); }
}
/* 过滤响应（Kibana Console「Filter response」对位）——只作用于展示层：
 原文 cur.result 不动，过滤结果另开一条派生串；清空表达式即回到原文。
 无效表达式不修改展示（避免"过滤失败却看起来像响应变了"），原位标红提示。 */
/* 变量（Kibana Console「Variables」）——与 DSL 页共用 es_vars 表；
   弹窗打开时从存储读一份草稿，保存才落盘（编辑中不影响已有请求）。 */
const varsOpen = ref(false);
const varsMap = ref<Record<string, string>>({});
const newVarK = ref('');
const newVarV = ref('');
const varsCount = computed(() => Object.keys(varsMap.value).length);
watch(varsOpen, v => { if (v) varsMap.value = { ...loadVars() }; });
function addVar() {
  const k = newVarK.value.trim();
  if (!k) return;
  if (!/^[\w.-]+$/.test(k)) { store.notify('warning', '变量名只能用字母、数字、下划线、点和连字符'); return; }
  varsMap.value[k] = newVarV.value;
  newVarK.value = ''; newVarV.value = '';
}
function saveVarsAll() {
  saveVars({ ...varsMap.value });
  varsOpen.value = false;
  store.notify('success', '变量已保存，共 ' + Object.keys(varsMap.value).length + ' 个');
}
const respFilter = reactive({ mode: 'jq' as 'jq' | 'regex', expr: '' });
const respFilterOut = computed(() => applyResponseFilter(cur.value?.result || '', respFilter.expr, respFilter.mode));
/* 过滤生效时的展示文本：表达式非空且求值成功才替换，否则恒取原文 */
const respShown = computed(() => {
  if (!respFilter.expr.trim()) return cur.value?.result || '';
  return respFilterOut.value.ok ? respFilterOut.value.text : (cur.value?.result || '');
});
/* 响应只读 Monaco 语言侦测——合法 JSON 走 json 着色/折叠，非 JSON（错误文本/NDJSON 等）落 plaintext。
 过滤后文本可能是多值逐行（非单一 JSON），此时按 plaintext 落，避免 json 着色器误判整段。 */
const respLang = computed(() => {
  const r = respShown.value || '';
  try { JSON.parse(r); return 'json'; } catch { return 'plaintext'; }
});
/* 响应只读面 dsl-assist 白得通道——fields 源同 body 口（dtFields 同一 useIndexFields
 出口）；bodyKind 视 respLang：合法 JSON 响应=文档体档（键位零候选 + field 值位/字段 hover 白得），
 非 JSON 归 none（provider 按语言挂 json/ndjson，plaintext 模型本就不匹配，档位收口为语义双保险）。
 闭包在 setup 作用域声明（模板内联对象箭头函数经 _ctx 代理，T14 渗透红灯实证） */
const dtRespAssist = { fields: () => dtFields.value, bodyKind: () => (respLang.value === 'json' ? 'doc' as const : 'none' as const) };

/* 响应表格查看档数据面——respView 切「表格」且 respLang=json 且可解析才有值
 （标量/解析失败归 null，Monaco 保持原文）；顶层数组→行序表（列=各行键并集保持首现序，
 _cat/* 结构化响应主场景），对象→键值两列表。轻量直渲，不引 QueryResultTable */
interface RespTbl { isArr: boolean; cols: string[]; rows: Array<Record<string, unknown>>; kv: Array<[string, unknown]> }
const respView = ref<'raw' | 'table'>('raw');
const respTbl = computed<RespTbl | null>(() => {
  if (respView.value !== 'table' || respLang.value !== 'json') return null;
  try {
    /* 过滤后文本为合法 JSON 时，表格档跟随过滤结果（与 Monaco 展示同源） */
    const v: unknown = JSON.parse(respShown.value || '');
    if (Array.isArray(v)) {
      const rows: Array<Record<string, unknown>> = v;
      const cols: string[] = [];
      for (const it of rows) {
        if (it && typeof it === 'object') for (const k of Object.keys(it)) if (!cols.includes(k)) cols.push(k);
      }
      return { isArr: true, cols, rows, kv: [] };
    }
    if (v && typeof v === 'object') return { isArr: false, cols: [], rows: [], kv: Object.entries(v as Record<string, unknown>) };
    return null;
  } catch { return null; }
});
/* 单元格展示串：标量直出，嵌套结构单行 JSON（视觉溢出由表格 ellipsis 兜，不截数据） */
function respCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}
/* 行点击/回车复制该行 JSON（数组行=行对象原文；键值行={k:v} 单键对象），文案口径同页内 copyText 族 */
/* ═══ 1160：响应表格行右键（两级）═══
 一级 = 复制该行 JSON（与单击同义，鼠标右手也能直达）+ 复制键值对；
 其余（整表 / 发到查询工作台）收进二级，避免又一次「功能平铺」。 */
const respRowMenu = ref<{ x: number; y: number; title: string; row: any; ri: number } | null>(null);
function openRespRowMenu(e: MouseEvent, row: any, ri: number) {
  const keys = row && typeof row === 'object' && !Array.isArray(row) ? Object.keys(row) : [];
  const title = keys.length ? `响应行 · ${keys.slice(0, 2).join(', ')}${keys.length > 2 ? '…' : ''}` : '响应行';
  respRowMenu.value = { x: e.clientX, y: e.clientY, title, row, ri };
}
function onRespRowMenuKey(e: KeyboardEvent, row: any, ri: number) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  const keys = row && typeof row === 'object' && !Array.isArray(row) ? Object.keys(row) : [];
  const title = keys.length ? `响应行 · ${keys.slice(0, 2).join(', ')}${keys.length > 2 ? '…' : ''}` : '响应行';
  respRowMenu.value = { ...menuKeyAnchor(e), title, row, ri };
}
const respRowMenuItems = computed<CcmItem[]>(() => {
  const m = respRowMenu.value; if (!m) return [];
  const json = JSON.stringify(m.row);
  const copy = (text: string, okMsg: string) => copyText(text).then(ok => store.notify(ok ? 'success' : 'error', ok ? okMsg : '复制失败'));
  const isObj = m.row && typeof m.row === 'object' && !Array.isArray(m.row);
  const tsv = isObj ? Object.values(m.row).map(v => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))).join('	') : '';
  const entries = isObj ? Object.entries(m.row as Record<string, unknown>) : [];
  return [
    { key: 'copy-row', label: '复制该行 JSON', icon: Copy, run: () => void copy(json, '该行 JSON 已复制') },
    ...(entries.length
      ? [{
          key: 'copy-group', label: '复制…', icon: ClipboardPaste, sep: true, children: [
            { key: 'copy-tsv', label: '复制为 TSV（可直接贴表格）', icon: ClipboardPaste, run: () => void copy(tsv, '已复制该行（TSV）') },
            { key: 'copy-kv', label: '复制为 key=value 行', icon: Braces, run: () => void copy(entries.map(([k, v]) => k + '=' + String(v)).join(' '), '已复制键值对') },
            ...entries.slice(0, 6).map(([k, v], i) => ({
              key: 'copy-v-' + i, label: `复制字段值：${k}`, icon: Copy,
              run: () => void copy(v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v), '已复制 ' + k),
            })),
          ],
        } as CcmItem,
        {
          key: 'copy-all-group', label: '整表…', icon: FileDown, children: [
            { key: 'copy-all-json', label: '复制整个响应 JSON', icon: Braces, run: () => void copy(JSON.stringify(respTbl.value?.rows ?? respTbl.value?.kv ?? null), '已复制响应 JSON') },
            { key: 'export-resp', label: '导出响应原文（JSON）', icon: FileDown, run: () => {
              /* 原文直出（不重排），与服务端回包逐字节一致 */
              downloadText(respShown.value ?? '', 'devtools-response.json', 'application/json');
            } },
          ],
        } as CcmItem]
      : []),
  ];
});

function copyRespRow(row: unknown) {
  copyText(JSON.stringify(row)).then(ok => store.notify(ok ? 'success' : 'error', ok ? '该行 JSON 已复制' : '复制失败'));
}

/* W6-T3：curl 导入——parseCurl 纯函数解析回填三字段；识别不了提示且不动手。
 语义色轮：parseCurl 仅回 null 无原因，纠错提示在调用侧判因——空输入 / 非 curl 开头 /
 引号未闭合（转义对先剥离再数奇偶；未闭合串曾骗过 tokenizer 把 URL 吃成 '/... 垃圾路径）/
 缺 URL。弹层就地展示（.il-hint.il-err 全站语言），不改 curlParse.ts 纯函数契约。 */
const curlOpen = ref(false);
/* curl 粘贴稿草稿化——独立键 es_devtools_curl_draft（不混入主 tabs 包），
 键形态对齐主 body 的 DRAFT_KEY（target 合并键，切集群不串稿）；误关弹窗/切页后
 粘贴现场保留，导入成功才清。凭据掩埋复用 useScopedDraft 体系的 redactDraft
 （curl -u/-H Authorization 常带密码）。 */
const CURL_DRAFT_KEY = computed(() => `es_devtools_curl_draft:${store.target || 'host'}`);
const curlText = ref((() => {
  try { return sessionStorage.getItem(CURL_DRAFT_KEY.value) || ''; } catch { return ''; }
})());
watch(curlText, v => {
  try {
    if (v) writeStoredRaw(sessionStorage, CURL_DRAFT_KEY.value, redactDraft(v));
    else removeStoredRaw(sessionStorage, CURL_DRAFT_KEY.value);
  } catch { /* 存储满/隐私模式容忍 */ }
});
const curlErr = ref('');
/* 1439：诊断改为 utils/curlParse.diagnoseCurl（引号感知）——此前分别数两种引号，
   双引号体里的 `it's` 会被判成「单引号未闭合」，导致本产品自己生成的 curl 导不回来。 */
function doImportCurl() {
  const why = diagnoseCurl(curlText.value);
  if (why || !cur.value) {
    curlErr.value = why || '当前无可用标签';
    store.notify('warning', 'curl 导入失败：' + curlErr.value);
    return;
  }
  const r = parseCurl(curlText.value)!;
  /* 缺 method 不算失败：parseCurl 缺省回填（带 -d 体 POST / 无体 GET），提示讲明避免静默困惑 */
  const hinted = /(?:^|\s)-\w*X/i.test(curlText.value) ? '' : '（未指定 method，按 ' + r.method + ' 回填）';
  cur.value.method = r.method; cur.value.path = r.path; cur.value.body = r.body;
  curlOpen.value = false; curlErr.value = '';
  curlText.value = ''; /* ：导入成功清粘贴稿（草稿随清，防陈稿残留） */
  store.notify('success', 'curl 已导入' + hinted);
}

/* P1-3：host 从硬编码 ES_HOST 占位串改当前页面 origin——DevTools 本就走
 同源 /cluster/devtools/execute 透传，复制出的 curl 直接可执行（占位串此前必须手改才能用） */
function copyCurl() {
  if (!cur.value) return;
  const c = `curl -X ${cur.value.method} '${window.location.origin}${cur.value.path}'` +
    (cur.value.body ? ` -H 'Content-Type: application/json' -d '${cur.value.body.replace(/'/g, "'\\''")}'` : '');
  copyText(c).then(ok => store.notify(ok ? 'success' : 'error', ok ? 'curl 已复制' : '复制失败')); /* */
}

/* 复制请求体（请求工具行钮）——成功文案对齐 RawIoModal copyReq「请求体已复制」 */
function copyBody() {
  if (!cur.value) return;
  copyText(cur.value.body).then(ok => store.notify(ok ? 'success' : 'error', ok ? '请求体已复制' : '复制失败'));
}

/* ═══ ：插入字段（insertSnippet expose 全站首消费）═══
 请求工具行 n-popover 内嵌 FieldPicker，字段源与 dslAssist 同源（dtPathIdx || pickedIdx →
 useIndexFields 缓存共享引用，不重复发请求）。选中后经 bodyMonacoRef 的 insertSnippet expose
 通道（MonacoEditor.vue:823/931，黑名单件只调用）在光标处 executeEdits 插入 "字段名"；
 happy-dom stub 无该出口时守卫跳过并如实 notify（不静默假装成功）。弹层开合与输入稿为
 内存态（一次性插入动作无会话现场语义，不落盘）。 */
const insFieldOpen = ref(false);
/* 插入字段弹层视口钳制（239 守卫锚⑤合并）——naive width prop 类型窄
 （number|'trigger'），CSS min() 字符串运行时生效但类型不过，改站内 computed 先例
 形态（QueryHubView histDrawerW 同款 0.94 口径）；视口宽走 app store 响应式单源
 （非响应式直读在嵌入容器挂载早期会读到 0 并永久缓存）。 */
const insFieldPopW = computed(() => Math.min(300, Math.round(store.viewportW * 0.94)));
const insFieldKw = ref('');
/* 方案 B：「⋯」溢出菜单开合（菜单内动作选择即关） */
const moreOpen = ref(false);
function onInsPick(v: string) {
  insFieldOpen.value = false;
  insFieldKw.value = '';
  if (!v) return;
  const ok = !!bodyMonacoRef.value?.insertSnippet?.('"' + v + '"');
  store.notify(ok ? 'success' : 'info', ok ? '已在光标处插入「' + v + '」' : '编辑器未就绪，请稍后再试');
}

/* 复制为代码（codegen 既有 toJs/toPython；host 取当前 origin 兜底 localhost:9200） */
function copyAsCode(kind: string) {
  if (!cur.value || !kind) return;
  const code = kind === 'python'
    ? toPython(cur.value.method, cur.value.path, cur.value.body || '')
    : toJs(cur.value.method, cur.value.path, cur.value.body || '');
  copyText(code).then(ok => store.notify(ok ? 'success' : 'error', ok ? (kind === 'python' ? 'Python 代码已复制' : 'fetch 代码已复制') : '复制失败'));
}
function saveFav() {
  if (!cur.value) return;
  store.addFavorite({ kind: 'rest', title: `${cur.value.method} ${cur.value.path}`,
    subtitle: (cur.value.body || '').slice(0, 60),
    payload: { method: cur.value.method, path: cur.value.path, body: cur.value.body }, tags: ['rest', 'devtools'] });
  store.notify('success', '已收藏');
}
</script>

<style scoped>
/* G7-C6：区块级间距 token 化（--sp-1..6 = 4/8/12/16/24/32）；控件内 padding / tab·历史行级密排 / 亚阶梯不动 */
/* 页内不再私加边距，水平节奏由全局 .page 统一供给 */
.dt-page { padding: 0; position: relative; display: flex; flex-direction: column; min-height: calc(100vh - var(--vh-offset)); }
/* ·实报「请求体工具栏高度和响应体工具栏高度不一致」：双 pane 头部
 统一 min-height（左侧 seg/菜单钮撑高、右侧元素少行矮→编辑器顶边错位）——
 恒等高 34px 使请求/响应编辑器顶边严格对齐；纯 min-height 零高度链反例（内容恒单行） */
.dt-page :deep(.fs-head) { min-height: 34px; }
/* 工作区撑满视口剩余——52vh 在高屏仍留底部空白;vh-offset 对齐全站页头预留 */
.dt-page :deep(.wl) { flex: 1 1 auto; }
/* 工作区视口高度——此前 wl 高度=内容高（Monaco 220px），宽屏下工作区挤在
 页面上部、下部大片空白（实报「质感不足」主诉之一）；52vh 起步对齐 vh 族，
 Monaco 非聚焦高度同步 220/260px→100% 跟随 pane（拖 pane 高即编辑器高）。
 20260920 重叠根治：52vh 兜底在 dt-body 定高（2.9.116）后成为溢出源——
 req(31)+52vh(468@900 视口)+hist(167) > dt-body 595，wl-body 顶撑 419>344 盖压历史区；
 dt-body 定高下 wl flex:1 min-height:0 已兜底，此处归零（高度链 Analyze flex 范式合规）。 */
.dt-page :deep(.wl-body) { min-height: 0; }
.dt-page :deep(.rp-content) { display: flex; flex-direction: column; }
.dt-page :deep(.fs) { flex: 1 1 auto; }
/* dt-out 拉伸后空态/等待文案随 pane 居中（此前贴顶留大片下方空白） */
.dt-out :deep(.empty-state) { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0; }
/* 执行进度条贴请求行上方（DslQuery 同款 ind-bar 语言） */
.dt-progress { position: absolute; top: 0; left: 0; right: 0; color: var(--ac); }
/* 权限前置说明条（RestView.rt-perm-note 同语言）：只在身份就绪后出现，不闪断首屏 */
.dt-perm-note { display: flex; align-items: center; gap: var(--sp-2); margin: var(--sp-2) var(--sp-1) 0; padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); background: var(--bg-alt); color: var(--tx2); font-size: var(--fs-xs); line-height: 1.5; }
.dt-perm-note-warn { border-color: var(--warn-line, var(--line)); background: var(--warn-soft); color: var(--tx1); }
/* 只读档（读键可见、写被拒）：用中性强调色，与「完全无权」和「数据面写」都区分开 */
.dt-perm-note-readonly { border-color: var(--ac-line); background: var(--ac-soft); color: var(--tx1); }
.dt-tabs { display: flex; align-items: center; gap: var(--sp-2); border-bottom: 1px solid var(--border); padding: 0 var(--sp-1); overflow-x: auto; }.dt-tab { display: flex; align-items: center; gap: var(--sp-1h); padding: var(--sp-1h) var(--sp-2h); font-size: var(--fs-xs); cursor: pointer;
  border: 1px solid transparent; border-bottom: none; border-radius: 4px 4px 0 0; white-space: nowrap; }
/* 重命名内联输入（贴 tab 同视觉密度） */
.dt-tab-ren { width: 90px; height: 20px; padding: 0 var(--sp-1); font-size: var(--fs-xs); border: 1px solid var(--ac); border-radius: 3px; background: var(--bg1); color: var(--fg); outline: none; }
.dt-tab.active { background: var(--panel); border-color: var(--border); font-weight: 600; color: var(--accent); }
.dt-tab-tt { max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
.dt-tab-x { opacity: 0.4; cursor: pointer; background: none; border: none; padding: var(--sp-0); display: flex; align-items: center; color: inherit; }
.dt-tab-x:hover { opacity: 1; color: var(--danger); }
.dt-tab-add { padding: var(--sp-1) var(--sp-2h); cursor: pointer; opacity: 0.6; font-size: var(--fs-lg); }
.dt-tab-add:hover { opacity: 1; }

/* ⚠ P0 根治（2.9.115 产线「编辑框无限扩大」）：dt-body 从 min-height 改确定高度——
 此前整链只有下限没有定值，Monaco host height:100% 在内容自适应父链里对「恒高兄弟」
 （dt-lint 提示条 66px/dt-hist 历史 134px/dt-err 错误条）形成每布局遍历 +常数 的正反馈棘轮
 （hostRO→layoutKick 泵频 ~19 遍/s，实锤 +2540px/s 无上界）。确定高度链落地后
 Monaco 100% 恒有定解，lint/hist/err 三类兄弟并存全部安全，整类棘轮根除。 */
.dt-body { padding: var(--sp-3) var(--sp-1); display: flex; flex-direction: column; gap: var(--sp-2); height: calc(100vh - var(--vh-offset)); }
/* wl 在确定高度容器内改为可收缩弹性件（原 min-height 视口兜底由 dt-body 的确定高度接管） */
.dt-body :deep(.wl) { flex: 1 1 auto; min-height: 0; }
/* 请求行 9 控件同排窄视口必溢出——补换行（row-gap 管换行后行距） */
/* 同排控件统一 26px 高（此前 path 36 / 主钮 25 / ghost 钮 22–23 / 方法下拉 26 五档混排，
   基线参差 = 视觉毛刺）：行内控件一律 box-sizing + 定高，路径框内 input 撑满 */
.dt-req { display: flex; gap: var(--sp-1h); row-gap: var(--sp-1); align-items: center; flex-wrap: wrap; }
.dt-req > .btn, .dt-req > .dt-method, .dt-req > .dt-path { box-sizing: border-box; height: 26px; }
.dt-req > .btn { display: inline-flex; align-items: center; gap: var(--sp-1); padding-top: 0; padding-bottom: 0; }
.dt-method { padding: 0 var(--sp-2); font-family: var(--mono); font-weight: 650; border: 1px solid var(--border); border-radius: var(--r-xs); background: var(--panel); font-size: var(--fs-xs); }
/* W-C 批：方法色轮迁全局 .m-*（theme.css 末段），本地五条色款删除；历史行 .dt-hist-m.m-* 同步合并 */
.dt-path { flex: 1; display: flex; align-items: center; padding: 0 var(--sp-2); font-family: var(--mono); font-size: var(--fs-xs); border: 1px solid var(--border); border-radius: var(--r-xs); background: var(--panel); color: var(--fg); }
/* W-C 批：.dt-body-area 死样式段删除（W6 改用 Monaco 后模板 0 引用，grep 实证）；
 .dt-tab-ren 保留——双击重命名内联输入模板在用（tabRename440 锁定），非退役残留 */
/* W6：body Monaco 容器边框——裁决退役（pane 已是容器，编辑器直贴扁平化，
 与 Kibana 控制台同一语言；分内容由 fs-head border-bottom 分隔承接） */
.dt-body-monaco { overflow: hidden; }
/* 20260920 重叠根治：lint 提示条（恒高≤88px）与 Monaco(height:100% inline) 在 fs-body
 内并存时内容溢出 pane（lint 画到 dt-hist 上=文案重叠真凶）——Monaco 弹性化让位：
 height 覆盖 inline（!important），lint 出现时 Monaco 自动缩短（AnalyzeView monaco-host
 flex:1 1 0 合规先例；聚焦态 fs 面定高，flex 填充同义 calc 拉伸） */
.dt-body-monaco { height: auto !important; flex: 1 1 auto; min-height: 220px; }
.dt-lint { flex-shrink: 0; }
/* lint 形态壳（display/gap/padding/radius/字号/行高 + warn/err 底色）退役 →
 theme.css .lint-bar/.lint-bar-warn/.lint-bar-err 单源（模板纯类名改用，DOM 保形）。
 本类只留高度链两钉（theme 单源不含，2.9.115/119 冻结面）：上行 531 定高链恒高兄弟不收缩 +
 本行 532 P1-2 max-height 钳制 + overflow（lint 条目增多不得撑高压缩 Monaco） */
.dt-lint { max-height: 88px; overflow: auto; }
/* 窄容器（聚焦面/窄屏）不再逐字断行——按钮与状态条 nowrap，容器可换行不叠字 */
/* ·实报：窄容器按钮换行堆竖排——单轨化（ lrBarSingleTrack 约定同刀）：
 nowrap+横滚，flex:1 1 0 吃 fs-head 剩余宽与聚焦钮同行、不触容器级换行；row-gap 退役。
 子项不内断守卫保留（形态，横滚下依然正确）。 */
.dt-actions { display: flex; gap: var(--sp-1h); align-items: center; flex-wrap: nowrap; overflow-x: auto; min-width: 0; flex: 1 1 0; }
/* 方案 B：行内分组分隔线 + spacer（溢出菜单靠右）+「⋯」菜单形态
 （全部既有 token，零新视觉语言；菜单为 popover 内容不参与按钮行高度链） */
.dt-tb-sep { width: 1px; height: 14px; background: var(--line-strong); margin: 0 var(--sp-0); flex: none; }
.dt-tb-sp { flex: 1; }
.dt-more-menu { display: flex; flex-direction: column; min-width: 180px; }
.dt-more-item {
  display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-1) var(--sp-2h);
  border: 0; border-radius: var(--r-s); background: transparent; color: var(--tx1);
  font-size: var(--fs-sm); font-family: inherit; cursor: pointer; text-align: left;
}
.dt-more-item:hover { background: var(--bg2); color: var(--tx0); }
.dt-more-item.danger { color: var(--err); }
.dt-more-item.danger:hover { background: var(--err-soft); }
.dt-more-sep { height: 1px; background: var(--line); margin: var(--sp-1) 0; }
.dt-more-note { padding: var(--sp-1) var(--sp-2h); font-size: var(--fs-xs); color: var(--tx2); }
.dt-actions > * { white-space: nowrap; flex-shrink: 0; }
/* .dt-status 手写状态串退役——MetaStrip 接管（右对齐沿用原 margin-left:auto 口径） */
.dt-status-ms { margin-left: auto; }
/* 权限降级提示缩为图标（tooltip 全文可读，非 admin 可见可聚焦可读） */
.dt-perm-dim { align-self: center; display: inline-flex; color: var(--muted); cursor: help; }

/* 裁决：dt-out 大框退役（border+panel-2 底+radius）——空态时整块空框是
 「层层容器嵌套」的主源；内容直贴 pane，仅保留布局职责（滚动/弹性占位，高度结构零变动） */
.dt-out { min-height: 200px; max-height: none; overflow: auto; flex: 1 1 auto; display: flex; flex-direction: column; }
/* 聚焦态解除 500px 上限——401 的 calc(100vh-190px) 会被此 max-height 裁回，
 放大「只高不宽」假象真凶；busy 占位同步拉伸，放大后不再大片空白。
 W-C 批：常态封顶同步解除（max-height:none）——pane 自带 wl-body 52vh 兜底、dt-out 自身
 overflow:auto 滚动兜底在，500px 常态小窗与聚焦态高度跳变不再有；聚焦态独立规则保持不动 */
.fs-active .dt-out { max-height: none; min-height: 0; flex: 1 1 auto; display: flex; flex-direction: column; }
.fs-active .dt-out .dt-out-monaco { flex: 1 1 auto; }
.fs-active .dt-waiting { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; }
.dt-waiting { padding: var(--sp-3); font-size: var(--fs-xs); color: var(--muted); }
/* 非聚焦态等待占位同样随 dt-out 拉伸居中（555 行仅聚焦态） */
.dt-waiting { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; }
/* W6-T3：响应 Monaco 容器边框退役（20260920 扁平化，同 .dt-body-monaco）；err 态保留
 红框语义信号（原 err 视觉=边框变红，常态无边框后 err 用完整红 border 承接） */
.dt-out-monaco { overflow: hidden; }
.dt-out-monaco.err { border: 1px solid var(--err); border-radius: var(--r-xs); }
/* 竖排标题轨退役后的行首横排小标题（fs-head 工具行内，扁平语言） */
.dt-pane-tt { font-size: var(--fs-xs); font-weight: 650; color: var(--tx1); letter-spacing: .02em; }
/* 编辑器字号三档 seg（工具行内，形态归全局 .seg；仅新控件收内衬，既有尺寸语义零触） */
.dt-font-seg { flex-shrink: 0; }
.dt-font-seg button { padding: 0 var(--sp-1h); font-size: var(--fs-xs); line-height: 1.8; }
/* 搜索定位轮：响应搜索行。
 工具行「动作|元信息|搜索」轻分组——动作段与元信息段靠 .dt-status-ms
 margin-left:auto 拉开大间距，搜索段不再用第二个 auto 抢间距，改 border-left 竖线
 挂在元信息段侧做分区（纯 CSS 分隔，不引新组件；窄屏换行后竖线仍标示搜索段起点） */
.dt-resp-search { display: inline-flex; align-items: center; gap: var(--sp-1); flex: 0 1 auto; border-left: 1px solid var(--border); padding-left: var(--sp-2); }
/* 过滤响应档（Kibana「Filter response」对位）——与响应搜索同一条工具行，
 分隔线只在有内容时出现（空态不额外占视觉重量）；表达式生效时整组走强调色。 */
.dt-resp-filter { display: inline-flex; align-items: center; gap: var(--sp-1); }
.dt-resp-filter.on .dt-flt-inp { border-color: var(--ac-hi); }
.dt-flt-mode { height: 26px; padding: 0 var(--sp-1); font: 650 var(--fs-2xs) var(--mono); color: var(--tx2);
  background: var(--panel); border: 1px solid var(--border); border-radius: var(--r-xs); cursor: pointer; }
.dt-flt-inp { width: min(170px, 100%); min-width: 0; flex: 0 1 170px; height: 26px; padding: 0 var(--sp-2); font-size: var(--fs-xs); }
.dt-flt-n { font-size: var(--fs-2xs); color: var(--tx2); white-space: nowrap; }
.dt-flt-n.err { color: var(--err); cursor: help; }
/* 变量弹窗（与 DSL 页 vars-* 同语言；本页独立 scoped，不复用跨页类名） */
.dt-vars-n { margin-left: var(--sp-0); padding: 0 var(--sp-1); font-size: var(--fs-2xs); color: var(--tx2); background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r-m); }
.dt-vars-list { display: flex; flex-direction: column; gap: var(--sp-1h); }
.dt-vars-row { display: flex; align-items: center; gap: var(--sp-2); }
.dt-vars-k { flex: 0 0 auto; min-width: 92px; font-size: var(--fs-xs); color: var(--ac-hi); }
.dt-vars-row .inp { flex: 1 1 auto; min-width: 0; }
.dt-vars-empty { padding: var(--sp-2) 0; font-size: var(--fs-xs); color: var(--tx2); }
.dt-vars-tip { margin-top: var(--sp-2); font-size: var(--fs-xs); line-height: 1.7; color: var(--tx2); }
/* width:150px → min(150px,100%) 极窄溢出钳制（547 XmigrateView:1291 同款；
 900 档同值规则保持不变——两档现在同口径，窄容器由 100% 收） */
/* 过滤档加入后工具行更挤：搜索框给下限宽度，压缩时优先让过滤表达式收缩
 （搜索是高频动作，过滤是可选动作——按使用频率分配可压缩预算） */
.dt-resp-search input { width: min(150px, 100%); min-width: 96px; padding: var(--sp-0) var(--sp-2); font-size: var(--fs-xs); }
.dt-resp-mc { font-size: var(--fs-xs); color: var(--muted); min-width: 34px; text-align: center; }
/* 段执行锚徽标（工具行内横排随 .dt-actions 滚动；chip 形态对齐 dt-hist-chip；
 on=当前回看段、err=失败段红档；零高度链——徽标行在 fs-head 工具行内不新增 DOM 行） */
.dt-segbar { display: inline-flex; align-items: center; gap: var(--sp-1); border-left: 1px solid var(--border); padding-left: var(--sp-2); }
.dt-seg-run { font-size: var(--fs-xs); padding: 0 var(--sp-2); border-radius: var(--r-s); border: 1px solid var(--border); background: none; color: var(--muted); cursor: pointer; line-height: 1.6; }
.dt-seg-run:hover { color: var(--tx0); border-color: var(--accent); }
.dt-seg-run.on { color: var(--accent); border-color: var(--accent); background: var(--panel); }
.dt-seg-run.err { color: var(--err); border-color: var(--err); }
/* .dt-out-monaco.err 二处重复声明合并为上方 :1048 一条（border shorthand 已含
 border-color，纯去重；err 红框语义零变动） */

/* ══ ：响应表格查看档（显示区替换件——Monaco v-if 让位即整体不渲染，高度链零触）。
 全部贴 theme token（line/panel/tx 族），无新私造壳；档位 seg 形态归全局 .seg（dt-font-seg 同款） ══ */
.dt-resp-seg { flex-shrink: 0; }
.dt-resp-tbl { flex: 1 1 auto; min-height: 0; overflow: auto; }
.dt-resp-tbl-t { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
.dt-resp-tbl-t th, .dt-resp-tbl-t td { text-align: left; padding: var(--sp-0) var(--sp-1h); border-bottom: 1px solid var(--line); white-space: nowrap; max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
.dt-resp-tbl-t thead th { position: sticky; top: 0; background: var(--panel); color: var(--tx1); font-weight: 600; }
.dt-resp-tbl-t tbody tr { cursor: copy; }
.dt-resp-tbl-t tbody tr:hover { background: var(--panel); }
.dt-resp-tbl-ix { color: var(--muted); }

/* dt-hist 四刀降层（纯视觉层）——①border 壳退役→border-top 分节分隔；
 ②panel-2 头（.dt-hist-tt 底+border-bottom）退役→sec-t 档行首横排；③chip 行嵌套盒
 （panel-2 底+border-bottom）退役→行内裸排；④列表内衬退役。
 ⚠高度结构语义零变动：.dt-hist flex-shrink:0、.qhp-list max(240px,42vh)、dt-body 直挂落位
 与 .dt-body 定高链一字不动（2.9.115/119 两次事故面，高度字面全部冻结） */
.dt-hist { border-top: 1px solid var(--line); margin-top: var(--sp-2); padding-top: var(--sp-1h); flex-shrink: 0; }
/* .dt-hist-tt 为可点击折叠控件头（role=button/aria-expanded），形态升 sec-t 档（fs-sm/600/tx1）；
 控件语义豁免标题四档约定同 ih-op-hd 口径 */
.dt-hist-tt { padding: var(--sp-0) 0; font-size: var(--fs-sm); font-weight: 600; color: var(--tx1); display: flex; gap: var(--sp-1h); align-items: center; cursor: pointer; }
.dt-hist-tt:hover { color: var(--tx0); }
/* P2-3：汇聚范围 chip 行（头行紧邻兄弟，恒高一行；交互子件不进 role=button 头行）
 ——：panel-2 底+border-bottom 退役，随分节行内裸排 */
.dt-hist-scope { display: flex; gap: var(--sp-1h); align-items: center; padding: var(--sp-1h) 0 0; }
.dt-hist-chip { font-size: var(--fs-xs); padding: 0 var(--sp-2); border-radius: var(--r-s); border: 1px solid var(--border); background: none; color: var(--muted); cursor: pointer; line-height: 1.6; }
.dt-hist-chip.on { color: var(--accent); border-color: var(--accent); background: var(--panel); }
/* 折叠区内改用 QueryHistoryPanel。
 限高统一 max(240px, 42vh) 口径（ clamp(200px,34vh,420px) 退役）——
 入响应 pane 后与 dt-out（flex 1 1 auto + overflow auto）同列分配，面板不再顶高整页；
 字面冻结同步更新（/devtoolsLint532 锚） */
.dt-hist-list { padding: var(--sp-1h) 0 0; }
.dt-hist-list :deep(.qhp-list) { max-height: max(240px, 42vh); }
/* 历史列表限高三档消费位（后置同选择器覆盖上行 531 冻结字面——缺省档同值
 零漂移，冻结行保留在册；--dt-hist-h 由 .dt-hist 容器内联注入，dt.histH useTierCycle）。
 ⚠恒高块纪律不变：dt-hist flex-shrink:0、dt-body 定高链一字不动（2.9.115/119 冻结面），
 max 变档只改列表自身滚动上限，不引入任何 height:100% 回路 */
.dt-hist-list :deep(.qhp-list) { max-height: var(--dt-hist-h, max(240px, 42vh)); }

/* ══ 语义色轮增补：状态码徽标/耗时四档/错误摘要条/busy tab 点（全部走既有 token） ══
 .dt-code/.dt-took/.dt-size 三段随 .dt-status 手写串退役——HTTP 分档走 MetaStrip tone，
 took 四档走 tookTone 映射，size 走 splitSize 数值+单位弱化，色值全走 MetaStrip 全局 token */
/* 错误结构化摘要条：全站 .err-bar 容器（err-soft 底 + err-line 边）+ 本页行内密度 */
.dt-err { margin: 0 0 var(--sp-2); font-size: var(--fs-xs); }
.dt-err-hd { flex: none; font-variant-numeric: tabular-nums; }
.dt-err-rs { min-width: 0; }
/* tab 执行中脉冲点（dot-pulse 全站活体语言，currentColor 随 --ac） */
.dt-tab-busy { color: var(--ac); flex: none; }

/* 900 紧凑微调档（ 口径）——全站最后一个零 @media 主工作页补档（
 豁免三文件至此只剩 Forbidden/NotFound 两个静态页）。只加换行容许与 min() 钳制：
 pane 堆叠仍归 WorkbenchLayout <1100 JS 档；⚠高度链基础值一字不动（dt-hist 落位字面/
 dt-lint max 88px 等 2.9.115/119 冻结面，本档禁入），focusSurface401 锁定的基线行不在此覆写 */
@media (max-width: 900px) {
  /* .dt-actions wrap 覆写随单轨约定退役（窄视口横滚优于堆竖排，不挤编辑器高度） */
  .dt-actions > * { flex-shrink: 0; }
  .dt-resp-search input { width: min(150px, 100%); }
}
</style>
