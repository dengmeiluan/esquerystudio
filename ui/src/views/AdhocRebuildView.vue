<template>
  <div class="ahr">
    <!-- 副标题与步条叙事对齐（Xmigrate w80「副标题与编号同步」同病异治——
 本页两套口径是真并存而非断链：步条是向导 UI 五步，四阶段是作业内部 ES 侧流程，
 动态副标题会丢四阶段总览，故选低成本标注对应关系） -->
    <PageHeader :icon="Hammer" title="托管重建" subtitle="无 provider · 任意逻辑索引名 · 向导五步编排 · 作业内走 ES 四阶段：建新 → 全量 → 追平 → 切换" />
    <!-- P2：执行进度条（ind-bar 全站范式；preparing/validating/starting 三链任一在途即点亮，
 绝对定位零高度占位，读秒仍在钮面 既有形态零触） -->
    <div class="ar-progress ind-bar" :class="{ on: preparing || validating || starting }"></div>
    <div v-if="draftRestored" class="ar-draft-row">
      <DraftBadge @clear="clearDrafts" />
    </div>

    <!-- 步骤条 -->
    <div class="steps">
      <!-- F1：作业执行中（RUNNING，含停在 AWAIT_CONFIRM 挡写的时刻）时，执行监控 chip
 反向可点——从任意步骤一键回监控步。否则用户从监控步回看配置后就被困在
 前四步，AWAIT_CONFIRM 的阻断横幅（渲染在 step 4）也将永远看不见。 -->
      <div v-for="(s, i) in STEPS" :key="i" class="step"
           :class="{ act: step === i, done: step > i, locked: isTerminal, retmon: canReturnToMonitor(i) }"
           v-tip="canReturnToMonitor(i) ? '作业执行中——点此返回执行监控' : undefined"
           :role="stepInteractive(i) ? 'button' : undefined"
           :tabindex="stepInteractive(i) ? 0 : -1"
           :aria-current="step === i ? 'step' : undefined"
           :aria-disabled="isTerminal || undefined"
           @click="onStepChipClick(i)"
           @keydown.enter.prevent="onStepChipClick(i)"
           @keydown.space.prevent="onStepChipClick(i)">
        <span class="s-num">{{ i + 1 }}</span><span class="s-name">{{ s }}</span>
        <ChevronRight v-if="i < STEPS.length - 1" :size="13" class="s-arrow" />
      </div>
    </div>

    <!-- W3：运行中作业重挂提示（非阻断）——job 为内存态，刷新后 resumeScene 把
 step>3 钳回 3，运行中作业失联，唯一回路是下方最近作业表 Eye 钮。step<4（向导前
 四步，含刷新后落点的确认预览步）且最近作业存在 RUNNING 作业时出现；「回到监控」
 复用既有 watchJob（不自造轮询），切回监控步（step=4）后本条随条件隐没。既有
 class/状态机分支零触碰（547 卡壳正锁与 adhocStateMachine/adhocStepPersist 裁决锁
 兼容：本条是裁决之后数据面的纯新增显示）。 -->
    <div v-if="showReattachHint" class="ar-reattach-hint" data-test="adhoc-reattach-hint" role="status">
      <span>检测到运行中的重建作业 <span class="mono">{{ runningAdhocJob?.jobId }}</span>，可在下方最近作业中点详情回监控</span>
      <button class="btn ghost sm" data-test="adhoc-reattach-go" v-tip="'回到该作业的执行监控（与最近作业表「查看任务详情」同一链路）'" @click="reattachToRunning"><Eye :size="12" /> 回到监控</button>
    </div>

    <!-- ① 选索引。结构序：索引名行上移到双 Tab 编辑器上方——先选索引再贴配置
 才是实际操作顺序（原序双 Tab 在前、索引名压底，与流程相反）。纯模板位移，
 状态机/草稿键零触碰（adhocStateMachine/adhocStepPersist 口径不变）。 -->
    <!-- P2：全局 .card 壳退役 → border-top 分节（ar-sec，Xmigrate 551 同刀；五步卡+最近作业卡六处同步） -->
    <div v-if="step === 0" class="ar-sec">
      <div class="card-t">选择要重建的逻辑索引名（别名或物理索引名均可）</div>
      <div ref="idxRowEl" class="row" :class="{ 'ar-highlight': highlightIdxInput }">
        <IndexPicker v-model="indexName" placeholder="如 bond_index（别名）或 bond_index_v1（物理索引）" width="100%" @picked="doPrepare" />
        <!-- 「用当前索引」一键回填：草稿与顶栏全局选中是两份状态（写类视图不开 useIdxState
 follow， 白名单口径），小钮把当前全局索引进草稿；有稿时钮仍在，点击显式覆盖。
 内联钮改用 PickCurrentIdxBtn 统一件（兑现；空索引不渲染、
 data-test/title 逐字锚由组件保真透传，回填语义归本消费方） -->
        <PickCurrentIdxBtn @pick="indexName = store.pickedIdx" />
        <button class="btn primary" :disabled="!indexName || preparing" @click="doPrepare">
          <Loader2 v-if="preparing" :size="13" class="spinning" /><Search v-else :size="13" /> 探测
        </button>
        <!-- 原始 IO 快查（评估分节）——最近一次探测/启动请求/响应原文 -->
        <button class="btn ghost sm" aria-label="查看原始 IO（探测评估）" v-tip="'最近一次托管重建接口调用的请求/响应原文'" @click="openRawIo">
          <Terminal :size="13" />
        </button>
      </div>
      <!-- 探测失败内联错误条（对齐 ar-risk-err 范式）：toast 一闪即逝，prep=null 后这里曾是裸空白。
 私造错误壳合并全局 .err-bar + errPreHtml/errMeta 双参（XmigrateView :63
 同款：prepErrRaw 原始对象旁路，code/endpoint 徽标一眼可辨）。结构序锁
 `<div v-if="prepErr" class="ar-probe-err">` 随批于本注释——本条位置（先于双 Tab）
 即原锁锚位置，断言面待同步更新批换锚 -->
      <div v-if="prepErr" role="alert" class="err-bar rise-in ar-probe-err">
        <span v-html="errPreHtml('探测失败：' + prepErr, errMeta(prepErrRaw))"></span>
        <button class="btn ghost sm" :disabled="!indexName || preparing" @click="doPrepare">重试</button>
      </div>
<!-- w69:双 Tab 输入模式 — 两条路径并排可见,不再是隐藏的折叠 -->
      <div class="ar-input-tabs">
        <button type="button" :class="{ on: inputMode === 'paste' }" @click="inputMode = 'paste'"
          v-tip="'从业务应用复制的内容粘贴，自动解析 settings/mapping/字段清单'">
粘贴业务侧 JSON
</button>
        <button type="button" :class="{ on: inputMode === 'manual' }" @click="inputMode = 'manual'"
          v-tip="'自己写 settings/mapping，不需要业务侧 JSON'">
手动输入 settings / mapping
</button>
      </div>

      <!-- 路径 A:粘贴业务侧 JSON -->
      <div v-if="inputMode === 'paste'" class="ar-paste">
        <div class="ar-paste-hd">
          <ClipboardPaste :size="13" />
          <strong>粘贴期望配置</strong>
          <span class="hint">{{ isBrowserMode ? '浏览器模式：从服务端模式复制期望配置后粘贴到这里' : '业务应用 → desired-state.html → 「复制期望配置」→ 贴到这里' }}</span>
          <!-- 期望配置页外链钮（宿主 client 侧 DesiredStateController 自包含单页，
 与 api EP 同前缀 /internal/es/index）——此前只有文案，业务同事找不到入口。
 浏览器模式没有宿主静态页，禁用入口而不是让用户点开 404。 -->
          <button type="button" class="btn ghost xs" :disabled="!canDesiredState"
            v-tip="isBrowserMode ? '浏览器模式没有宿主期望配置静态页；请从服务端模式复制后粘贴' : (canDesiredState ? '' : '期望配置页需宿主或静态页授权——纯连接授权打开只会得到 403')" @click="openDesiredState"><ExternalLink :size="11" /> 打开期望配置页</button>
          <!-- 四档高度循环钮（ConfigValidatorView data-cv-issues-h 同款范式）——
 title 实时回显当前档，点击切下一档末档回首档，usePref 落盘 -->
          <button type="button" class="btn ghost xs" data-ar-paste-h v-tip="'粘贴区高度档：' + pasteH + '（点击循环）'" @click="cyclePasteH">高</button>
        </div>
        <MonacoEditor ref="pasteMcRef" v-model="pasteRaw" language="json" :height="pasteH" :dsl-assist="pasteAssist" @execute="applyPaste" /><!-- ：ref + @execute="applyPaste"（弹窗 JsonArea @submit 同语义先例——Ctrl+Enter 即解析；：height 定高字面升四档 :height="pasteH" 循环（默认档=原 min(60vh, 420px) 保底，见 PASTE_H_TIERS； min(200px,24vh)→视口弹性档、 W4 补 dsl-assist 的沿革不变）——不传 bodyKind（期望配置形态任意，挂 settings/mapping 档必误导）、不挂 lint；Ctrl+I 唤起补全经 pasteMcRef 宿主接线 -->
        <div class="ar-paste-act">
          <button class="btn primary" @click="applyPaste">解析并预填 <span class="kbd" style="margin-left:var(--sp-1)">Ctrl⏎</span></button>
          <span v-if="pasteErr" class="ar-paste-err">{{ pasteErr }}</span>
          <span v-else-if="pastePicked" class="ar-paste-ok">已预填：{{ pastePicked }}</span>
          <span v-if="pasteWarn" class="ar-paste-warn">{{ pasteWarn }}</span>
        </div>
        <div v-if="pasteList.length > 1" class="ar-paste-list">
          <button v-for="(r, i) in pasteList" :key="i" class="btn ghost sm"
                  :class="{ primary: pasteIdx === i }" @click="pickPaste(i)">
            {{ r.indexKey || r.alias || ('#' + i) }}
          </button>
        </div>
      </div>

      <!-- 路径 B:手动输入 -->
      <div v-if="inputMode === 'manual'" class="ar-manual">
        <div class="ar-manual-hd">
          <strong>直接写期望的 settings / mapping</strong>
          <span class="hint">知道索引该怎么配就怎么写，不需要业务侧 JSON</span>
          <!-- 拉取源配置——与审编步「粘贴导入」互补双入口（粘贴=外部期望，这里=源现状）：
 拉取优先吃向导步骤①已探测的源索引 settings/mapping（prep 快照，零网络），缺探测时
 现场 api.clusterInspect 补拉；显式用户动作 + askConfirm 确认覆盖后才写两框
 （挂载初值/自动链零触——adhocManualWorkbench426/draftGovernance 口径） -->
          <button type="button" class="btn ghost xs" data-ar-pull-src aria-label="拉取源配置"
            :disabled="pullingSrc || !canPullSrc"
            v-tip="canPullSrc ? '拉取源索引当前的 settings / mapping 覆盖下方两框（覆盖前需确认）' : '拉取源配置需索引、映射、搜索、配置校验或托管重建任一页读权限'" @click="pullSourceToManual">
            <Download :size="11" /> 拉取源配置
          </button>
          <!-- P1：编辑框高度档循环钮（形态抄本页 paste 档钮；与审编卡头钮同一落盘键 adhoc.edH） -->
          <button type="button" class="btn ghost xs" data-ar-ed-h v-tip="'编辑框高度档：' + edRows + ' 行（点击循环）'" @click="cycleEdRows">高</button>
        </div>
        <!-- 手动模式对照双栏接可调工作台（411 同款语义收口） -->
        <!-- fill-viewport=false 摘视口 min-height 兜底——向导「目标物理索引名/校验」行动行不被推出首屏（DslQueryView 先例），编辑区高度交 pane 内容自撑。
 P2 高度档接管：四 JsonArea 摘 fill 改 rows 驱动（adhoc.edH 档值 8/16/28/44，
 height=rows*19+16 纯内容函数确定解）——P0 时代的 fill 链整体退役（塌陷成因随之消失），
 pane 高度复归内容自撑，行动行留首屏裁决在低档位下依旧成立（ar-fill-wl 定高档退役） -->
        <WorkbenchLayout class="ar-fill-wl" :scope="arManualScope" :panes="AR_MANUAL_PANES" axis="vertical" mode="arManual" :fill-viewport="false">
          <template #pane-adhoc-manual-settings>
          <div class="ed-col">
            <div class="ar-manual-lb">
settings <span class="dim">索引设置</span>
              <!-- 已填/留空私造胶囊改用 StatusPill n 档（色档归 pill 单源） -->
              <StatusPill v-if="manualSettings.trim()" tone="n" label="✓ 已填" />
              <StatusPill v-else tone="n" label="留空 = 沿用源索引" />
            </div>
            <JsonArea ref="manualSetJaRef" v-model="manualSettings" :rows="edRows" :dsl-assist="arManualSettingsAssist" placeholder="{&quot;index&quot;:{&quot;number_of_shards&quot;:3}}" />
          </div>
          </template>
          <template #pane-adhoc-manual-mapping>
          <div class="ed-col">
            <div class="ar-manual-lb">
mapping <span class="dim">字段映射</span>
              <StatusPill v-if="manualMapping.trim()" tone="n" label="✓ 已填" />
              <StatusPill v-else tone="n" label="留空 = 沿用源索引" />
            </div>
            <JsonArea ref="manualMapJaRef" v-model="manualMapping" :rows="edRows" :dsl-assist="arManualMappingAssist" placeholder="{&quot;properties&quot;:{&quot;field_name&quot;:{&quot;type&quot;:&quot;keyword&quot;}}}" />
          </div>
          </template>
        </WorkbenchLayout>
        <!-- F2：索引名缺失的常驻红字（不只是 toast）——填上索引名即熄 -->
        <div v-if="needIndexForManual && !indexName" class="ar-paste-err ar-manual-idx-miss">← 还需要选一个索引名</div>
        <div class="ar-manual-act">
          <button class="btn primary" :disabled="!manualSettings.trim() && !manualMapping.trim()" @click="applyManual">应用并进入审编</button>
          <span v-if="!manualSettings.trim() && !manualMapping.trim()" class="hint">↑ 至少填一个</span>
        </div>
      </div>

      <template v-if="prep">
        <div class="probe">
          <div class="p-row">
<span>形态</span>
            <b v-if="prep.isAlias" class="ok-txt">别名（原子切换，零窗口 ✓）</b>
            <b v-else class="warn-txt">直连物理索引（切换=删旧+以旧名建别名，存在短暂读写窗口 ⚠）</b>
          </div>
          <div class="p-row" v-if="prep.isAlias">
<span>物理索引</span>
            <span class="mono">{{ (prep.physicals || []).join(', ') }}
              <!-- 索引芯片（xm-idx-go 同款）——直达索引工作区 -->
              <button v-for="ph in prep.physicals || []" :key="ph" class="ad-idx-go" :aria-label="'打开索引工作区：' + ph" v-tip="'打开索引工作区'" @click="gotoIdx(ph)"><ExternalLink :size="11" /></button>
            </span>
</div>
          <div class="p-row">
<span>源（write）</span><span class="mono">{{ prep.sourcePhysical }}
            <button class="ad-idx-go" :aria-label="'打开索引工作区：' + prep.sourcePhysical" v-tip="'打开索引工作区'" @click="gotoIdx(prep.sourcePhysical)"><ExternalLink :size="11" /></button>
          </span>
</div>
          <!-- 所属别名（源物理索引的成员别名，空则不渲染）：chip 可点——一键改用该别名作为重建入口并重新探测。
               删除物理索引会连带断开其所属别名的成员关系，业务侧查询将失效，入口必须引导用户走别名 -->
          <div class="p-row" v-if="prep.memberAliases?.length">
<span>所属别名</span>
            <span class="ar-tf-chips">
              <button v-for="a in prep.memberAliases" :key="a" type="button" class="chip mono ar-tf-chip"
                v-tip="'点击改用该别名作为重建入口（重新探测）：' + a"
                @click="useAliasAsInput(a)">{{ a }}</button>
            </span>
          </div>
          <!-- 数据安全警示：源物理索引同时挂在业务别名下时，直连切换（删旧物理+以旧名建别名）会让
               该别名失去成员、业务查询 404——红字常驻探测现场（start 侧另有硬拒兜底） -->
          <div v-if="prep.memberAliases?.length && !prep.isAlias" role="alert" class="ar-dest-err">⚠ 该物理索引还挂在别名 {{ prep.memberAliases.join('、') }} 下——直连重建会删除它并断开这些别名，业务会 404。请改用别名作为输入。</div>
          <div class="p-row"><span>文档数</span><b>{{ fmtNum(prep.docCount) }}</b></div>
          <div class="p-row">
<span>时间字段候选</span>
            <!-- 候选串改可点 chip（点击预选为追平时间字段；选中态高亮）——
 此前纯文本 join('、') 只可读不可选，INCREMENTAL 用户得回下拉再选一遍 -->
            <span v-if="prep.timeFieldCandidates?.length" class="ar-tf-chips">
              <button v-for="c in prep.timeFieldCandidates" :key="c.field" type="button"
                class="chip mono ar-tf-chip" :class="{ on: timeField === c.field }"
                v-tip="'点击预选为追平时间字段：' + c.field + '(' + c.type + ')'"
                @click="timeField = c.field">{{ c.field }}({{ c.type }})</button>
            </span>
            <span v-else class="dim">无（INCREMENTAL 策略不可用）</span>
          </div>
        </div>
        <button v-if="!isTerminal" class="btn primary next" @click="step = 1">下一步：审阅 settings / mapping <ChevronRight :size="13" /></button>
      </template>
    </div>

    <CellContextMenu v-if="rowMenu" :x="rowMenu.x" :y="rowMenu.y"
      :title="rowMenu.title" :items="rowMenuItems" @close="rowMenu = null" />
    <!-- 作业行级右键菜单（2026-11-21 对账批）：与差异/轮次表菜单各自独立状态，同一时刻只开一个 -->
    <CellContextMenu v-if="jobRowMenu" :x="jobRowMenu.x" :y="jobRowMenu.y"
      :title="jobRowMenu.title" :items="jobRowMenuItems" @close="jobRowMenu = null" />

    <!-- ② 审编 settings/mapping -->
    <div v-if="step === 1" class="ar-sec">
      <!-- 粘贴导入入口——手里一串原始 JSON 直接识别拆填，不再手动分拆两侧 -->
      <div class="card-t">
新索引 settings / mapping（预填自源索引，可直接修改 —— 改分词/分片正是在这里）
        <button class="btn ghost sm" style="margin-left:auto" v-tip="'粘贴 Mapping 页复制的原始 JSON / GET _mapping / _settings 响应，自动识别拆填'" @click="openPasteImport">
          <ClipboardPaste :size="12" /> 粘贴导入
        </button>
        <!-- 从集群复刻——跨集群结构直拉：选连接中心已存档案+源索引，服务端白名单精选
             settings（分片/副本/analysis/similarity）并还原插件组件名，从源头绕开
             手动拷贝 GET 原文的系统键/null 值/插件脱敏三类坑 -->
        <button class="btn ghost sm" data-test="ar-clone-open" v-tip="'从连接中心的其它集群直接拉取指定索引的 settings/mapping，自动清理后拆填'" @click="openCloneImport">
          <FileDown :size="12" /> 从集群复刻
        </button>
        <!-- 审编卡头原始 IO 钮——校验走 /config-lab/validate（不在 /adhoc-rebuild/
 记录特征下），openRawIo 取数扩 config-lab 回退链；判空 notify 口径归其既有单源 -->
        <button class="btn ghost sm" aria-label="查看原始 IO（审编校验）" v-tip="'最近一次校验（config-lab validate）或探测接口调用的请求/响应原文'" @click="openRawIo">
          <Terminal :size="12" /> 原始 IO
        </button>
        <!-- P1：编辑框高度档循环钮（与手动模式 hd 钮同一落盘键 adhoc.edH） -->
        <button type="button" class="btn ghost sm" data-ar-ed-h v-tip="'编辑框高度档：' + edRows + ' 行（点击循环）'" @click="cycleEdRows"><UnfoldVertical :size="12" /> 高度</button>
      </div>
      <!-- stripDsl 预剔除结果常驻展示——toast 会消散，审编现场必须能随时看到「向导替你改了什么」 -->
      <div v-if="stripNote" class="strip-note">
        <ShieldAlert :size="13" style="flex-shrink:0" />
        <span>{{ stripNote }}</span>
      </div>
      <!-- settings/mapping 对照双栏接统一可调工作台（拖拽调宽，mapping 长文档拉宽直达） -->
      <!-- fill-viewport=false 摘视口 min-height 兜底（同上手动模式，行动行留首屏）； P2 同刀：rows 驱动高度档，ar-fill-wl 定高档退役 -->
      <WorkbenchLayout class="ar-fill-wl" :scope="arEdScope" :panes="AR_ED_PANES" axis="vertical" mode="arEditors" :fill-viewport="false">
        <template #pane-adhoc-settings>
        <div class="ed-col">
          <div class="ed-label">settings <span class="dim">索引设置</span></div>
          <JsonArea ref="setJaRef" v-model="settingsJson" :rows="edRows" :dsl-assist="arSettingsAssist" />
        </div>
        </template>
        <template #pane-adhoc-mapping>
        <div class="ed-col">
          <div class="ed-label">
mapping <span class="dim">字段映射</span>
            <!-- 注解推导私造胶囊改用 StatusPill b 档（ 来源标明语义走悬浮说明同步更新；
 长说明迁 Tip long 档，原生 title 不承载多行） -->
            <Tip v-if="mappingFromDerived" long text="业务侧实体没有 @Mapping，这份来自 starter 对实体注解的推导（payload 的 derivedMappingJson），也是重建实际会应用的那份">
                  <StatusPill tone="b" label="来自注解推导" />
            </Tip>
          </div>
          <JsonArea ref="mapJaRef" v-model="mappingJson" :rows="edRows" :dsl-assist="arMappingAssist" />
        </div>
        </template>
      </WorkbenchLayout>
      <div class="row">
        <label class="lbl">目标物理索引名</label>
        <!-- 单行文本统一件承载（原 ipt/grow/mono 皮肤类随 inputClass 保留在真实 input 上，
             选择器与视觉零漂移；trim 经 update 事件等价接线，enter 走 keydown 透传到真实 input） -->
        <TextInput :model-value="destIndex" input-class="ipt grow mono" :placeholder="prep?.suggestedDest"
                   @update:model-value="destIndex = $event.trim()" @keydown.enter="destIndexEnter" />
        <!-- 行尾「用建议名」一键回填（destNameErr 链零触——回填建议名后红字照常即时复评） -->
        <button v-if="prep?.suggestedDest" class="btn ghost xs" v-tip="'回填探测建议的目标索引名'" @click="destIndex = prep.suggestedDest">用建议名</button>
      </div>
      <!-- sem-rm 智能纠错：目标物理索引名即时红字——非法字符/大写（同 Xmigrate idxNameProblem 口径）；
 目标=源物理名（直连模式）＝「切换即删源本身」的核武级配错，必须在启动前看见 -->
      <div v-if="destNameErr" role="alert" class="ar-dest-err">⚠ {{ destNameErr }}</div>

      <!-- 内嵌三层校验 —— 不过不放行（ERROR 阻断，WARN/INFO 提示） -->
      <div v-if="valReport" class="val-box">
        <!-- 报告头三件套（ConfigValidatorView cv-rp-hd 同款范式）：主徽章 StatusPill +
	 计数三枚小 pill（0 值档不渲染）+ TookBadge；Dry-run 实测目标 dim 段尾随。
	 手写 ✔/✘ b 徽标 + dim 计数串三段混排随改用退役 -->
        <div class="val-hd">
          <StatusPill :tone="valReport.valid && valReport.dryRunPassed ? 'g' : 'r'"
                      :label="valReport.valid && valReport.dryRunPassed ? '校验通过' : '配置存在问题'" />
          <StatusPill v-if="valReport.errorCount" tone="r" :label="valReport.errorCount + ' 错误'" />
          <StatusPill v-if="valReport.warnCount" tone="y" :label="valReport.warnCount + ' 警告'" />
          <StatusPill v-if="valReport.infoCount" tone="b" :label="valReport.infoCount + ' 建议'" />
          <TookBadge :ms="valReport.elapsedMs" /><!-- ：裸 ms → TookBadge 四档语义徽标 -->
          <!-- w44:实测目标透出——Dry-run 打偏集群(如回落宿主)一眼可见,不再误判为配置问题 -->
          <span v-if="valReport.dryRunExecuted" class="dim val-hd-dry">
            Dry-run 实测于：<code>{{ valReport.dryRunTargetName || valReport.dryRunTargetId || '宿主集群' }}</code>
          </span>
        </div>
        <div v-for="(iss, i) in valReport.issues" :key="i" class="val-iss">
          <!-- severity 裸枚举 → sevZh 中文主体 + 英文小字 en 档（ W10 的
	 .pill+sevPill 手滚形态改用 StatusPill 统一件；tone 色档口径不变：err→r/warn→y/info→b） -->
          <StatusPill :tone="sevTone(iss.severity)" :label="sevZh(iss.severity)" :en="iss.severity" />
          <!-- 错误码/路径 chip 化（span.mono → code，容器皮吃 theme.css 全局 code 档）：
	 path 保持 info 色差异化 -->
          <code class="val-code">{{ iss.code }}</code>
          <span class="val-msg"><code v-if="iss.path" class="val-path">{{ iss.path }}</code>{{ iss.message }}<span v-if="iss.suggestion" class="dim"> — {{ iss.suggestion }}</span></span>
          <!-- 可执行修复动作：识别≠擅自动配置——askConfirm 确认门后才改写审编框。
	 修复目标键从 title-only 升为按钮旁 code chip 可见（ADD 连建议值 =value 一并上屏） -->
          <code v-if="iss.fix" class="val-fixkey">{{ iss.fix.key }}<template v-if="iss.fix.action === 'ADD_SETTING' && iss.fix.value != null">={{ iss.fix.value }}</template></code>
          <button v-if="iss.fix && iss.fix.action === 'REMOVE_SETTING'" type="button"
                  class="btn ghost sm" style="flex-shrink:0" data-test="ar-fix-remove"
                  v-tip="'从 settings 移除键 ' + iss.fix.key + '（确认后执行）'"
                  @click="applyFixRemoveSetting(iss)">
            <Trash2 :size="11" /> 一键移除
          </button>
          <button v-else-if="iss.fix && iss.fix.action === 'ADD_SETTING'" type="button"
                  class="btn ghost sm" style="flex-shrink:0" data-test="ar-fix-add"
                  v-tip="'向 settings 补充键 ' + iss.fix.key + (iss.fix.value != null ? '=' + iss.fix.value : '') + '（确认后执行）'"
                  @click="applyFixAddSetting(iss)">
            <Plus :size="11" /> 一键补充
          </button>
        </div>
      </div>

      <div class="row">
        <button v-if="canValidate" class="btn ghost" :disabled="validating || !canValidate" v-tip="'校验需配置校验页或托管重建写权限'" @click="doValidateConfig(false)">
          <Loader2 v-if="validating" :size="13" class="spinning" /><ShieldCheck v-else :size="13" /> 仅校验
        </button>
        <button v-if="canValidate" class="btn primary" :disabled="validating || !canValidate" v-tip="'校验需配置校验页或托管重建写权限'" @click="doValidateConfig(true)">
          <Loader2 v-if="validating" :size="13" class="spinning" /><ChevronRight v-else :size="13" /> {{ validating ? '校验中 ' + valSecs + 's' : '校验并继续：选择追平策略' }}
        </button>
      </div>
    </div>

    <!-- ③ 选策略 -->
    <div v-if="step === 2" class="ar-sec">
      <div class="card-t">追平策略（全量 reindex 期间业务持续写入旧索引，如何补齐这段增量？）</div>
      <n-radio-group v-model:value="strategy" class="strats" name="adhoc-strategy" data-test="ar-strategy-group">
        <div class="strat" :class="{ sel: strategy === 'INCREMENTAL', dis: !prep?.timeFieldCandidates?.length }"
             @click="pickStrategy('INCREMENTAL', !prep?.timeFieldCandidates?.length)">
          <n-radio value="INCREMENTAL" :disabled="!prep?.timeFieldCandidates?.length" data-test="ar-strat-INCREMENTAL" />
          <div><strong>A · 增量追平（推荐）</strong>
            <p>业务不停写。按时间字段做 ≤3 轮 range reindex 收敛 → 切换 → 切换后终追一轮兜底。要求文档带更新时间字段。</p>
            <!-- 禁用灰态只有透明度，补一句可读的现场原因（未选中时才提示；选中过说明用户已知） -->
            <p v-if="!prep?.timeFieldCandidates?.length && strategy !== 'INCREMENTAL'" class="dim" data-test="strat-inc-unavailable">索引无时间字段候选，此策略不可用</p>
          </div>
        </div>
        <div class="strat" :class="{ sel: strategy === 'WRITE_BLOCK' }" @click="pickStrategy('WRITE_BLOCK', false)">
          <n-radio value="WRITE_BLOCK" data-test="ar-strat-WRITE_BLOCK" />
          <div><strong>B · 写阻断窗口</strong>
            <p>阻断旧索引写入（业务写请求短暂失败）→ 追平/全量 → 切换。绝对一致，适合可容忍秒~分钟级写失败的低峰操作。</p>
          </div>
        </div>
        <div class="strat" :class="{ sel: strategy === 'MANUAL' }" @click="pickStrategy('MANUAL', false)">
          <n-radio value="MANUAL" data-test="ar-strat-MANUAL" />
          <div><strong>C · 直切 + 回补报告</strong>
            <p>全量后直接切换，不自动追平。产出 T0~切换点差异报告与建议回补 DSL，由你人工回补。</p>
          </div>
        </div>
      </n-radio-group>
      <!-- 时间字段+追平缓冲行：MANUAL 直切无追平概念，两输入与其无关，整行隐藏。
	 时间字段下拉改 NSelect（TopBar/IndexHub 同先例；原 v-model string 与 NSelect
	 value string 等价，空串档=「不指定」显式可选，候选由探测 timeFieldCandidates map） -->
      <div class="row" v-if="strategy !== 'MANUAL'">
        <label class="lbl">时间字段</label>
        <n-select v-model:value="timeField" :options="timeFieldOpts" size="small" class="sel ar-tf-sel"
                  data-test="ar-time-field" />
        <label class="lbl">追平缓冲（ms）</label>
        <!-- 数字框 naive 化（NInputNumber）：number|null 经 bufferMsModel 桥接回草稿数值域；
             Enter=该步主钮（keydown 自内部 input 冒泡到组件根，native fallthrough 监听承接） -->
        <n-input-number v-model:value="bufferMsModel" :min="0" size="small" class="ar-num" data-test="ar-buffer-ms"
                        v-tip="'增量追平轮之间的等待窗口：全量完成后按此间隔再扫增量，越大切换越晚但业务写入窗口越长'"
                        @keydown.enter="strategyNextEnter" />
      </div>
      <!-- +1：INCREMENTAL 必选时间字段的常驻红字（对齐 needIndexForManual 形态：
	 选上即熄）——此前只靠「下一步」钮禁用，用户不知道被什么拦住 -->
      <div v-if="strategy === 'INCREMENTAL' && !timeField" class="ar-paste-err ar-manual-idx-miss">← 增量追平必须指定时间字段：按它做 range reindex 收敛增量；候选为空说明索引无时间字段，请改用写阻断或直切策略</div>
      <n-checkbox v-model:checked="deleteOldIndex" size="small" class="ar-chk" data-test="ar-del-old">切换成功后删除旧物理索引（默认保留只读，验证无误后再手动清理更稳妥）</n-checkbox>
      <!-- 切换前人工确认门。开启后作业会停在 AWAIT_CONFIRM 等人放行；门 30 分钟未确认自动解除挡写 -->
      <n-checkbox v-model:checked="pauseBeforeSwitch" size="small" class="ar-chk" data-test="ar-pause-switch">切换前等待人工确认（作业停在 AWAIT_CONFIRM，确认后才执行切换；30 分钟未确认将自动解除写阻断并按失败收尾）</n-checkbox>
      <!-- 直连模式真实边界（两端一致）：切换=删除旧索引；浏览器模式不自动以旧名建别名，
           勾选删除时作业停人工确认门、目标索引探活通过并确认后才执行删除——如实展示，不静默降级 -->
      <div v-if="prep && !prep.isAlias" class="ar-warn-window" data-test="ar-direct-swap-warn" role="alert">
        <TriangleAlert :size="13" />
        <b>直连物理索引模式的切换边界</b>
        <span>该索引不经别名：服务端模式切换=删除旧索引「{{ prep.sourcePhysical }}」并以旧名建别名（短暂读写窗口）；浏览器模式不自动建别名——若勾选「切换成功后删除旧物理索引」，作业会停在人工确认门，目标索引探活通过并确认后才执行删除，删除后业务查询必须改用目标索引名，请提前知悉。</span>
      </div>

      <!-- 执行参数小区（限流/slices）——「缺省不发键」协议：空/-1/auto 都不进请求体，
      后端缺省即不限流/auto 并行。非法值红字常驻且启动不放行（双门：下一步禁用+doStart 首行守卫） -->
      <div class="ar-tuning">
        <div class="ar-tuning-t">执行参数<span class="hint">缺省不传 = 不限流 · slices auto（ES 自动并行）</span></div>
        <div class="row">
          <label class="lbl">限流（docs/s）</label>
          <!-- 数字框 naive 化（NInputNumber）：number|null 经 tuningRpsModel 桥接回草稿串域（'-1'/'500' 可逆） -->
          <n-input-number v-model:value="tuningRpsModel" size="small" class="ar-num" placeholder="-1 不限"
                          v-tip="'每秒批次数（requests_per_second）：大索引重建时限制写入速率保护集群，-1 或留空不限'"
                          data-test="ar-tuning-rps" @keydown.enter="strategyNextEnter" />
          <label class="lbl">slices</label>
          <!-- 档位下拉改 NSelect（auto/自定义数字两档，data-test 锚保留；「自定义数字」
		 条件子框逻辑不动——tuningSlicesMode computed 写路径接 NSelect v-model:value） -->
          <n-select v-model:value="tuningSlicesMode" :options="SLICES_MODE_OPTS" size="small" class="ar-tuning-sel"
                    data-test="ar-tuning-slices-mode"
                    v-tip="'reindex 并行切片数：auto 由 ES 按分片数自动决定；自定义需 >=1 的整数'" />
          <n-input-number v-if="tuningSlicesMode === 'custom'" v-model:value="tuningSlicesModel" size="small" class="ar-num"
                          placeholder=">=1" data-test="ar-tuning-slices-num"
                          v-tip="'slices 并行切片数：>=1 的整数，或选 auto 交由 ES 决定'" @keydown.enter="strategyNextEnter" />
        </div>
        <div v-if="rpsErr" class="ar-paste-err" data-test="ar-tuning-rps-err">{{ rpsErr }}</div>
        <div v-if="slicesErr" class="ar-paste-err" data-test="ar-tuning-slices-err">{{ slicesErr }}</div>
      </div>

      <!-- / spec 无 timeField 时 WRITE_BLOCK 会全程挡写（AdhocRebuildService:235 earlyBlock），
 窗口不是「一轮追平」而是「全量 reindex 全程」，大索引可能几十分钟。必须让人看见再决定。 -->
      <div v-if="needAckFullBlock" class="ar-warn-window">
        <TriangleAlert :size="13" />
        <b>该索引未指定时间字段 —— 业务写入将在整个重建期间被阻断</b>
        <span>
          源索引约 {{ prep?.docCount ?? '—' }} 条，全量 reindex 全程挡写；
          指定一个时间字段可把窗口缩短到「一轮追平」的量级。
        </span>
        <n-checkbox v-model:checked="ackFullBlock" size="small" class="ar-warn-ack" data-test="ar-ack-fullblock">我已知悉并接受全程挡写</n-checkbox>
      </div>

      <!-- 期望（粘贴来的）vs 实际（ES 读回）字段级比对。
 P2：分节标题升 .sec-t 档（行首横排 fs-sm/600/tx1，选择器限 .ar-diff/.report 两区） -->
      <div v-if="cfgDiff.length" class="ar-diff">
        <div class="ed-label sec-t">
          期望 vs 实际（mapping）
          <span class="dim sm-txt">
            期望有实际没有 {{ cfgSum.added }} · 实际有期望没有 {{ cfgSum.removed }} ·
            值不同 {{ cfgSum.changed }} · 一致 {{ cfgSum.same }} ·
            已忽略 {{ cfgSum.ignored }} · 撞车 {{ cfgSum.conflict }}
          </span>
        </div>
        <MiniTable :columns="CFG_DIFF_COLS">
          <template #rows>
            <!-- kind 是 已评审的契约不动，但界面不显示 raw kind：
 added/removed 对使用者天然歧义，必须给人话标签。
 -9 / I-4：标签与提示已提成纯函数并由断言看守，模板只做调用。 -->
            <!-- 真差异区始终展开。 -->
            <tr v-for="row in cfgParts.real" :key="'r-' + row.path" class="cd-real" :class="'cd-' + row.kind" tabindex="0"
              @contextmenu.prevent="openDiffMenu($event, row)" @keydown="onDiffMenuKey($event, row)" data-row-nav @keydown.self="rowArrowNav">
              <td class="cd-path mono">{{ row.path }}</td>
              <td class="cd-kind">{{ kindLabel(row.kind) }}</td>
              <td class="cd-l mono">{{ fmtVal(row.expected) }}</td>
              <td class="cd-r mono">{{ fmtVal(row.actual) }}</td>
              <td class="cd-note">
                <span v-if="kindNote(row)" class="cd-hint">{{ kindNote(row) }}</span>
              </td>
            </tr>
            <!-- 等价噪声折叠条，默认收起。：键盘可达（role/tabindex/Enter） -->
            <tr v-if="cfgParts.benign.length" class="cd-benign-toggle" role="button" tabindex="0" :aria-label="benignOpen ? '收起无风险变更' : '展开无风险变更'" @click="benignOpen = !benignOpen" @keydown.enter.prevent="benignOpen = !benignOpen" @keydown.space.prevent="benignOpen = !benignOpen">
              <td :colspan="5">{{ cfgParts.benign.length }} 项已知等价默认值（点击展开）</td>
            </tr>
            <!-- 噪声区，仅在展开时进入 DOM。 -->
            <template v-if="benignOpen">
              <tr v-for="row in cfgParts.benign" :key="'b-' + row.path" class="cd-benign" :class="'cd-' + row.kind">
                <td class="cd-path mono">{{ row.path }}</td>
                <td class="cd-kind">{{ kindLabel(row.kind) }}</td>
                <td class="cd-l mono">{{ fmtVal(row.expected) }}</td>
                <td class="cd-r mono">{{ fmtVal(row.actual) }}</td>
                <td class="cd-note">
                  <span v-if="kindNote(row)" class="cd-hint">{{ kindNote(row) }}</span>
                </td>
              </tr>
            </template>
          </template>
        </MiniTable>
      </div>

      <!-- / ：date 兼容风险报告。与 configDiff 同屏（spec ）。
 +1：源/目标类型对比行（destTypeRisks）并轨同一区块展示
 （mergeRiskRows 已按档位/字段排序，error 前置）。 -->
      <div v-if="displayRiskRows.length || riskErr || riskBusy" class="ar-risk">
        <div class="ar-risk-hd">
          <ShieldAlert :size="13" />
          <b>date 兼容风险</b>
          <span v-if="destTypeRisks.length" class="hint">另有源/目标 mapping 对比 {{ destTypeRiskTotal }} 项</span>
          <span class="hint">
            <template v-if="riskBusy">正在采样…</template>
            <template v-else>
              <!-- 修订四：取样口径必须露出来。一份不说明自己怎么取样的报告，
 读者会默认它是随机的 —— 这次恰好对，下次不一定对。 -->
              基于 {{ sampledCount }} 条样本<template v-if="samplingMode">（取样方式：{{ samplingMode }}）</template>
              —— 结论只表示「这 {{ sampledCount }} 条中未发现」，不代表全量无风险
            </template>
          </span>
        </div>
        <div v-if="riskErr" class="ar-risk-err">{{ riskErr }}</div>
        <div v-for="(r, i) in displayRiskRows" :key="i" class="ar-risk-row" :class="r.level">
          <!-- level 裸英文 → sevZh 中文（warning 别名同步补齐）；row class 保留原
 枚举供 ar-risk 档着色；'ok' 全清行 sevZh 回落「建议」失真，单独给「无风险」 -->
          <span class="ar-risk-lv">{{ r.level === 'ok' ? '无风险' : sevZh(r.level) }}</span>
          <code>{{ r.field || '（全索引）' }}</code>
          <span class="ar-risk-code">{{ r.code }}</span>
          <span class="ar-risk-reason">{{ r.reason }}</span>
          <pre v-if="r.fix" class="ar-risk-fix">{{ r.fix }}</pre>
        </div>
        <!-- 类型对比行封顶 100 防刷屏，超出时尾注给出完整总数（不以截断后行数冒充） -->
        <div v-if="destTypeRiskTotal > destTypeRisks.length" class="dim sm-txt" data-test="ar-risk-cap">仅展示前 100 项，共 {{ destTypeRiskTotal }} 项</div>
      </div>

      <button v-if="!isTerminal" class="btn primary next" :disabled="(strategy === 'INCREMENTAL' && !timeField) || !canStart || tuningInvalid" @click="step = 3">下一步：确认预览 <ChevronRight :size="13" /></button>
    </div>

    <!-- ④ 确认预览 -->
    <div v-if="step === 3" class="ar-sec">
      <div class="card-t">执行预览
        <!-- 原始 IO 快查（执行分节）——与探测评估共用 /adhoc-rebuild/ 记录环特征 -->
        <button class="btn ghost sm" style="margin-left:auto" aria-label="查看原始 IO（托管重建）" v-tip="'最近一次托管重建接口调用的请求/响应原文'" @click="openRawIo">
          <Terminal :size="12" />
        </button>
      </div>
      <div class="probe">
        <div class="p-row"><span>逻辑名</span><span class="mono">{{ indexName }}</span></div>
        <div class="p-row"><span>源 → 目标</span><span class="mono">{{ prep?.sourcePhysical }} → {{ destIndex || prep?.suggestedDest }}</span></div>
        <div class="p-row"><span>策略</span><b>{{ strategyLabel }}</b></div>
        <div class="p-row" v-if="timeField"><span>时间字段</span><span class="mono">{{ timeField }}（缓冲 {{ bufferMs }}ms）</span></div>
        <div class="p-row">
<span>切换方式</span>
          <span v-if="prep?.isAlias">别名 write-index 原子切换（零窗口）</span>
          <span v-else class="warn-txt">删除旧索引 → 以旧名建别名（短暂读写失败窗口）</span>
        </div>
        <!-- w80：确认门状态上屏——刷新续场后是否仍停在 AWAIT_CONFIRM，启动前必须可见 -->
        <div class="p-row" data-test="pv-confirm-gate"><span>切换确认</span><span>{{ pauseBeforeSwitch ? '人工（作业停在 AWAIT_CONFIRM，确认后才翻别名）' : '自动' }}</span></div>
        <div class="p-row"><span>旧索引处置</span><span :class="{ 'err-txt': deleteOldIndex }">{{ deleteOldIndex ? '切换后删除' : '保留只读（加写阻塞）' }}</span></div>
        <!-- 执行参数回显：与请求体组装同一数据源（缺省不发键 → 未限流/slices auto 人话） -->
        <div class="p-row" data-test="pv-tuning"><span>执行参数</span><span>{{ tuningSummary }}</span></div>
        <!-- 目标磁盘占用预估（增强信息）：进行中轻量提示；失败静默降级整行不渲染，不阻断预览 -->
        <div class="p-row" v-if="previewEstState === 'loading'" data-test="pv-disk-est-loading"><span>目标磁盘预估</span><span class="dim">估算中…</span></div>
        <div class="p-row" v-else-if="previewEstState === 'ok' && previewEst?.estimatedTargetBytes != null" data-test="pv-disk-est"><span>目标磁盘预估</span><span>预计目标磁盘占用 ≈ {{ fmtSize(previewEst.estimatedTargetBytes) }}（{{ fmtNum(previewEst.docs) }} 篇 × 平均 {{ fmtNum(Math.round(previewEst.avgDocBytes || 0)) }} B 估算）</span></div>
      </div>
      <n-checkbox v-if="!prep?.isAlias" v-model:checked="confirmDirectSwap" size="small" class="ar-chk warn-txt" data-test="ar-confirm-direct">我已知悉直连模式切换存在短暂读写窗口，确认执行</n-checkbox>
      <div v-if="!isTerminal" class="row">
        <button class="btn ghost" @click="step = 2"><ChevronLeft :size="13" /> 上一步</button>
        <!-- -9 / I-1：canStart 一并接到**执行按钮**上。步骤条只允许回退、
 doValidateConfig 只从 1→2，故这是防御深度而非补漏；但「知悉全程挡写」
 这个门本就该守在真正扣扳机的地方，而不只是守在翻页处。 -->
        <button v-if="canOps" class="btn primary" :disabled="starting || (!prep?.isAlias && !confirmDirectSwap) || !canStart || tuningInvalid" @click="doStart">
          <Loader2 v-if="starting" :size="13" class="spinning" /><Play v-else :size="13" /> {{ starting ? '启动中 ' + startSecs + 's' : '启动托管重建' }}
        </button>
        <span v-else class="dim" style="font-size: var(--fs-xs)">发起重建需 REBUILD_OP/ADMIN 角色</span>
      </div>
    </div>

    <!-- ⑤ 执行监控 -->
    <div v-if="step === 4" class="ar-sec">
      <div class="card-t">
执行监控
        <StatusPill v-if="job" class="ar-st-en" :tone="statusTone(job.status)" :label="jobStatusZh(job.status) || String(job.status)" :en="jobStatusZh(job.status) ? job.status : undefined" /><!-- ：手滚 pill 改用 StatusPill（en 英文小字组件化；.ar-st-en 锚类外挂保留——小字视觉由组件 sp-en 承担；起轮次徽标小字亦归组件，本页不再自携小字样式） --><!-- ：状态枚举加中文名（esEnumZh.jobStatusZh 收口；英文枚举小字保留在后，XmigrateView 同范式；数据/条件行不动） -->
        <span v-if="job" class="dim sm-txt">阶段：<StatusPill class="sm" :tone="stagePill(job.stage)" :label="stageZh(job.stage) || String(job.stage)" :en="stageZh(job.stage) ? job.stage : undefined" /></span><!-- ：stage 裸枚举 → stageZh 中文 + 英文小字（Lead 十 stage 契约接线；w80：stage 裸串→pill 徽标同谱系） -->
        <!-- 追平轮进度：CATCHUP 阶段在阶段 pill 旁给出「第 N/M 轮」（N=已完成轮次数，
             M 按策略：增量最多 3 轮 range reindex 收敛、写阻断单窗 1 轮），一眼可读当前推进到第几轮 -->
        <StatusPill v-if="job && job.stage === 'CATCHUP' && (job.rounds?.length || 0) > 0" class="sm" tone="n"
                    :label="'第 ' + job.rounds.length + '/' + catchupMaxRounds + ' 轮'" data-test="adhoc-catchup-round"
                    title="追平进度：按策略最多 N 轮 range reindex 收敛（增量 3 轮 / 写阻断单窗 1 轮）" />
        <!-- 锁安全徽标（后端 toMap 透出 gateOutcome/lockActive/switchedWithoutLock，
 此前前端不显=锁保护盲区：lock.enabled=false 与锁正常工作在界面上无法区分）。
 switchedWithoutLock=true（无锁切换，数据一致性风险）最重，与 lockActive=false 互斥显
 （切换已发生时锁是否在保护已无意义）；gateOutcome 非 CONFIRMED（TIMED_OUT 超时自动
 解除阻断 / ABORTED 人工中止）=门结局非人工确认放行。数据/条件行零改动，纯加显。 -->
        <Tip v-if="job && job.switchedWithoutLock" long :text="SWITCHED_NO_LOCK_TIP"><StatusPill tone="r" label="无锁切换" /></Tip>
        <Tip v-else-if="job && job.lockActive === false" long :text="LOCK_INACTIVE_TIP"><StatusPill tone="y" label="锁保护未生效" /></Tip>
        <StatusPill v-if="job && job.gateOutcome === 'TIMED_OUT'" tone="y" label="确认超时" title="确认门超时：超时方赢得竞争，写阻断已自动解除、别名切换未执行" />
        <StatusPill v-else-if="job && job.gateOutcome === 'ABORTED'" tone="n" label="门已中止" title="确认门以人工中止告终——写阻断已解除、别名切换未执行" />
        <!-- 后台通知偏好（useJobNotify，与跨集群迁移页共用偏好键）：标题闪烁默认开
             （免授权兜底——页面隐藏期间停门/终态在标签页标题上闪图标）；桌面通知需显式
             授权，浏览器层 denied 后就地禁用并说明重授权路径；环境不支持（无 Notification）
             同样禁用并说明，不让人空点 -->
        <span class="ar-notify-pref">
          <n-checkbox :checked="notifyTitleOn" size="small" class="ar-notify-title" data-test="ar-notify-title"
                      v-tip="'页面隐藏期间有停门/终态时闪烁标签页标题（免授权，默认开）'"
                      @update:checked="onNotifyTitleToggle">标题闪烁</n-checkbox>
          <button type="button" class="btn ghost xs" data-test="ar-notify-desktop"
                  :disabled="notifyDesktopDenied || notifyDesktopUnsupported"
                  v-tip="notifyDesktopTip"
                  @click="onNotifyDesktopBtn"><BellRing :size="11" /> 桌面通知</button>
        </span>
        <!-- 监控步行尾原始 IO 钮（423 执行分节先例同形）——询现场
         （/adhoc-rebuild/ 记录环）此前在 step4 无取数入口；中止钮在场时其 .right
         margin-left:auto 独占行尾推进，本钮不叠加 auto（防双 auto 平分剩余空间挤移中止钮），
         非 RUNNING（中止钮缺席）时本钮自持 margin-left:auto 补行尾位 -->
        <button class="btn ghost sm" :style="(canOps && job?.status === 'RUNNING') ? '' : 'margin-left:auto'" aria-label="查看原始 IO（监控轮询）" v-tip="'最近一次托管重建接口调用的请求/响应原文（含监控轮询现场）'" @click="openRawIo"><Terminal :size="12" /></button>
        <!-- 中止钮 title 与下方确认窗（doAbort askConfirm）同一口径：保留目标索引与已迁移数据、
             可重跑续接。切换已确认（FINAL_CATCHUP/FINALIZE）后服务端硬拒中止，前端先禁用并说明，
             避免点进去吃报错 -->
        <button v-if="canMutateJob && job?.status === 'RUNNING'" class="btn ghost sm danger right"
                v-tip="switchConfirmed ? '切换已确认，无法中止' : '中止 reindex task 并结束作业；目标索引与已迁移数据保留，可重跑续接'"
                :disabled="aborting || switchConfirmed" @click="doAbort"><CircleStop :size="12" /> 中止</button>
      </div>
      <!-- 轮询连续失败警示：监控数据可能已过期时必须明示（纯前端计数，成功即清零） -->
      <div v-if="pollFailCount >= 3" class="ar-poll-stale" role="alert" data-test="adhoc-poll-stale">
        <TriangleAlert :size="13" />
        <span>状态刷新失败 {{ pollFailCount }} 次{{ pollLastOkAt != null ? '（上次成功 ' + fmtHms(pollLastOkAt) + '）' : '' }}，数据可能已过期</span>
      </div>
      <!-- 深链 ?jobId= 失联空态：作业不在清单（宿主重启内存态丢失/本机无此记录）如实呈现而非踢回向导；
           拉取通道本身失败（网络/5xx）是另一回事——文案区分，不把「拉不到」伪装成「不存在」 -->
      <EmptyState v-if="deepLinkMiss" :icon="SearchX"
        :text="deepLinkGone ? '作业不存在或已清理' : '作业状态拉取失败'"
        :hint="deepLinkGone
          ? '该 jobId 不在当前作业清单中：服务端模式的作业为内存态（宿主重启即失联），浏览器模式的记录保存在本机。可返回向导重新发起，目标索引名沿用即可续上已迁数据。'
          : '网络或服务暂时不可用，无法确认该作业是否仍在：请稍后刷新重试；服务端模式的作业为内存态（宿主重启即失联）。'"
        action-text="返回向导" data-test="adhoc-deeplink-miss" @action="reset" />
      <template v-if="job">
        <!-- 等待人工确认。此刻 WRITE_BLOCK 已在挡写，业务写入持续失败，必须醒目。
             门截止倒计时（gateDeadlineMs，服务端/浏览器两端同字段）：剩余 mm:ss 随 1s 心跳跳动，
             最后 5 分钟转警示红态；字段缺席（旧后端）只保留正计时 -->
        <div v-if="job.stage === 'AWAIT_CONFIRM'" class="ar-await" :class="{ 'ar-await-urgent': gateUrgent || gateExpired }">
          <TriangleAlert :size="14" />
          <b>业务写入正在被阻断</b>
          <span>已阻断 {{ blockedSec }} 秒 —— 请尽快「确认切换」或「中止」</span>
          <span v-if="gateLeftMs != null" class="mono ar-gate-left" data-test="adhoc-gate-left"
                :class="{ urgent: gateUrgent, expired: gateExpired }"
                v-tip="'确认门截止时刻 ' + new Date(Number(job.gateDeadlineMs)).toLocaleTimeString('zh-CN', { hour12: false }) + '——30 分钟未确认将自动解除写阻断、不执行切换'">
            {{ gateExpired ? '确认门已超时（等待自动收尾）' : '确认门剩余 ' + gateLeftText + (gateUrgent ? ' —— 请尽快决策' : '') }}
          </span>
          <button v-if="canMutateJob" class="btn primary sm" :disabled="confirming" @click="doConfirmSwitch">确认切换</button>
          <button v-if="canMutateJob" class="btn ghost sm danger" :disabled="aborting" @click="doAbort">中止并解除阻断</button>
          <span v-if="!canOps" class="dim" style="font-size: var(--fs-xs)">切换/中止需 REBUILD_OP/ADMIN 角色——请联系对应角色处置，勿自行尝试</span>
          <span v-else-if="!canMutateJob && jobOwner" class="dim" style="font-size: var(--fs-xs)">作业由 <b class="mono">{{ jobOwner }}</b> 创建：切换/中止仅创建者本人或 ADMIN 可操作；同连接成员可查看进度与报告</span>
        </div>
        <div class="probe">
          <div class="p-row"><span>作业</span><span class="mono cpy" v-tip="'点击复制 jobId：' + job.jobId" tabindex="0" role="button" @keydown.enter.prevent="copyJobId(job.jobId)" @keydown.space.prevent="copyJobId(job.jobId)" @click="copyJobId(job.jobId)">{{ job.jobId }}</span></div>
          <div class="p-row">
<span>{{ job.sourcePhysical }} → {{ job.destPhysical }}<!-- SUCCEEDED 后 dest 旁挂索引工作区芯片（step0 探测步同款）：重建完成的第一步就是去看新索引 --><button v-if="job.status === 'SUCCEEDED'" class="ad-idx-go" :aria-label="'打开索引工作区：' + job.destPhysical" v-tip="'打开索引工作区'" data-test="adhoc-dest-goto" @click="gotoIdx(job.destPhysical)"><ExternalLink :size="11" /></button></span>
            <span class="dim">源 {{ job.sourceDocCount != null ? fmtNum(job.sourceDocCount) : '-' }} 条 / 目标 {{ job.destDocCount != null ? fmtNum(job.destDocCount) : '…' }} 条</span>
          </div>
          <div class="p-row" v-if="job.currentProgress">
            <span>全量进度</span>
            <span class="mono" style="flex:1;display:flex;align-items:center;gap:var(--sp-2)">
              <ProgressTrack class="ar-reindex-track" :value="job.currentProgress.total ? reindexPct(job) : null"
                             :max="100" size="xs" state="success"
                             :label="'全量进度（' + fmtNum(job.currentProgress.created) + ' / ' + fmtNum(job.currentProgress.total) + '）'" />
              <span>{{ fmtNum(job.currentProgress.created) }} / {{ fmtNum(job.currentProgress.total) }}</span>
              <span class="dim">{{ job.currentProgress.total ? reindexPct(job) + '%' : '—' }}</span>
            </span>
          </div>
          <!-- J1 配套：/status 顶层 docs 级进度三字段（total/created/updated，
 Java AdhocRebuildJobProgressTest 契约：awaitTask 轮询 ReindexProgress 单源刷新、
 终态保留末次采样）行内小字消费——currentProgress 兼容路径之外的第二通道，
 追平轮间隙/终态也可见末次计数；字段缺省（旧后端/未进入 reindex 阶段）整行
 不渲染 = 零增量向后兼容（不冒充 0） -->
          <div class="p-row" v-if="job.total != null && job.created != null" data-test="adhoc-docs-progress">
            <span>已写</span>
            <span class="mono">{{ fmtNum(job.created) }} / {{ fmtNum(job.total) }}<template v-if="job.updated != null">（更新 {{ fmtNum(job.updated) }}）</template></span>
          </div>
          <!-- W3：速率观测行（XmigrateView rateOf 范式移植，Xm 文件零触碰）——
 Σcreated 对询相邻两次采样的时间差分出 docs/s（差分 ≤0 不出，不冒充速率）；
 已耗时随既有轮询刷新（终态取后端 tookMs），零新增定时器。轮次表零触碰（有锁）。 -->
          <div class="p-row" v-if="job.currentProgress" data-test="adhoc-rate">
            <span>速率观测</span>
            <span class="dim">
              <template v-if="reindexRate != null"><span class="mono">{{ fmtNum(reindexRate) }} docs/s</span> · </template>
              <template v-if="jobElapsedMs != null">已耗时 <TookBadge :ms="jobElapsedMs" title="自作业启动起的已耗时（随监控轮询刷新；终态取后端 tookMs 收尾值）" /></template>
              <template v-else>已耗时 —</template>
              <!-- P2：预计剩余 ETA——速率缺失/非正、余量非正不渲染（不冒充） -->
              <template v-if="reindexEtaMs != null"> · 预计剩余 <Tip long :text="ETA_FORMULA_TIP"><TookBadge :ms="reindexEtaMs" /></Tip></template>
              <!-- 速率趋势迷你线：差分速率环形窗序列（cap 60，XmigrateView :520-525 同形态）；
                   ≥2 个有效采样才绘（单点无趋势可言，不冒充） -->
              <Tip v-if="rateSpark.length >= 2" text="速率趋势 docs/s（监控轮询差分采样，近 60 拍）" class="ar-rate-spark">
                <SparkLine :data="rateSpark" :w="96" :h="16" />
              </Tip>
            </span>
          </div>
          <!-- reindex task 联动（浏览器模式编排时记录 _reindex 响应的 task 字段；服务端 toMap 透出
               currentTaskId）：chip 深链直达任务管理页（TasksView ?taskId= 同款跳法） -->
          <div class="p-row" v-if="job.currentTaskId" data-test="adhoc-task-row">
            <span>reindex task</span>
            <span>
              <button class="btn ghost xs mono" data-test="adhoc-task-link" v-tip="'在任务管理页查看该 reindex task（深链定位）'" @click="gotoTask(String(job.currentTaskId))">{{ job.currentTaskId }}</button>
            </span>
          </div>
          <!-- 动态调速：仅 reindex 执行段（全量/追平/终追，task 在场）可用，档位调 throttle 端点；
               当前生效速率随轮询回显（requestsPerSecond 缺省=不限速） -->
          <div class="p-row" v-if="job.status === 'RUNNING'" data-test="adhoc-throttle">
            <span>执行调速</span>
            <span class="ar-throttle">
              <n-select v-model:value="throttlePick" :options="THROTTLE_OPTS" size="small" class="ar-throttle-sel"
                        :disabled="!throttleStageOn" data-test="adhoc-throttle-pick"
                        v-tip="throttleStageOn ? '调整当前 reindex task 的 requests_per_second（不限速=恢复全速）' : '仅全量/追平/终追阶段（有执行中的 reindex task）可调速'" />
              <button class="btn ghost sm" :disabled="!throttleStageOn || throttling" data-test="adhoc-throttle-apply" @click="doThrottle">调速</button>
              <span class="dim">当前 {{ job.requestsPerSecond != null ? job.requestsPerSecond + '/s' : '不限速' }}</span>
              <span v-if="!throttleStageOn" class="dim">非 reindex 执行段不可调速</span>
            </span>
          </div>
          <!-- 后端 error 串常带整段 Java 栈：默认显示 friendlyApiError 友好化摘要（吃字符串），
           完整原文留 title + 点击复制——长栈不刷屏，取证不丢原文 -->
          <div class="p-row" v-if="job.error"><span>错误</span><span class="err-txt" v-tip="job.error" data-test="adhoc-job-error" role="button" tabindex="0" @keydown.enter.prevent="copyJobErr" @keydown.space.prevent="copyJobErr" @click="copyJobErr">{{ friendlyApiError(job.error) }}</span></div>
        </div>
        <!-- 宿主重启孤儿作业提示：FAILED 且 error 文案点名「重启」（作业在宿主内存，重启即失联，
        目标索引已建好但未切换）——给一条回路：回向导重新发起，目标名沿用即可续上已迁数据 -->
        <div v-if="orphanAfterRestart" class="ar-reattach-hint ar-orphan-hint" data-test="ar-orphan-hint" role="status">
          <span>宿主重启导致中断：目标索引已保留，可返回向导重新发起</span>
          <button class="btn ghost sm" data-test="ar-orphan-back" v-tip="'清空当前向导现场回到选索引步重新发起'" @click="reset">返回向导</button>
        </div>
        <!-- 失败文档样本（后端 toMap failures，数组缺席不渲染）：每条 [type] reason（index/id 在场时附）。
        type 缺失/空串时标签兜底「未分类」（不出空方括号）。
        >=6 条默认折叠只显前 5 + 「展开全部 N 条」（后端封顶 10 条，防刷屏）。
        样本前列聚类区（type + reason 首行归一，首行引号段换占位）：单一类时聚类无增量信息不出（逐条即全貌）；
        多类混叠时「N 类 · top3」胶囊行先行给分布，点开看分组明细（每组计数+首条完整样本） -->
        <div v-if="failureSamples.length" class="ar-failures" data-test="ar-failure-samples">
          <div v-if="failureClusters.length > 1" class="ar-fcluster" data-test="ar-fcluster">
            <button type="button" class="ar-fcluster-sum" data-test="ar-fcluster-summary"
                    :aria-expanded="failureClusterOpen ? 'true' : 'false'"
                    v-tip="'按错误类型 + 原因首行聚类的分布概览（计数与占比基于已采样的前 ' + failureSamples.length + ' 条）；点击展开每组的首条完整样本'"
                    @click="failureClusterOpen = !failureClusterOpen">
              失败聚类：{{ failureClusters.length }} 类 · top{{ failureClusterTop.length }}：<span v-for="(c, ci) in failureClusterTop" :key="c.key" class="mono">{{ c.type }} x{{ c.count }}（{{ clusterPct(c) }}）{{ ci < failureClusterTop.length - 1 ? ' · ' : '' }}</span>
            </button>
            <div v-if="failureClusterOpen" class="ar-fcluster-detail" data-test="ar-fcluster-detail">
              <div v-for="(c, ci) in failureClusters" :key="c.key" class="ar-fcluster-row mono" :data-test="'ar-fcluster-item-' + ci">
                <span class="ar-fcluster-lv">[{{ c.type }}]</span>
                <span class="ar-fcluster-cnt">x{{ c.count }}（{{ clusterPct(c) }}）</span>
                <span class="ar-fcluster-first">{{ clusterHead(c.first) || '（无原因说明）' }}</span>
              </div>
            </div>
          </div>
          <button type="button" class="ar-failures-t" :aria-expanded="failuresCollapsed ? 'false' : 'true'" @click="failuresCollapsed = !failuresCollapsed">失败文档样本（前 {{ failureSamples.length }} 条）</button>
          <div v-for="(f, i) in visibleFailures" :key="i" class="ar-failures-row mono" :data-test="'ar-failure-item-' + i"><span class="ar-failures-lv">[{{ failTypeLabel(f) }}]</span> {{ f.reason }}<template v-if="failureWhere(f)">（{{ failureWhere(f) }}）</template></div>
          <button v-if="failuresCollapsed && failureSamples.length > visibleFailures.length" type="button" class="btn ghost xs" data-test="ar-failure-expand" @click="failuresCollapsed = false">展开全部 {{ failureSamples.length }} 条</button>
          <!-- 失败处置：复制全部失败 doc id（无 id 样本禁用并说明）+ 生成失败窗口回补 query
               （按作业 timeField 生成 time range 重放 DSL；无 timeField 无法圈定窗口，禁用并说明原因） -->
          <div class="ar-failures-act">
            <button type="button" class="btn ghost xs" data-test="ar-failure-copy-ids"
                    :disabled="!failedDocIds.length"
                    v-tip="failedDocIds.length ? '复制全部失败文档 id（' + failedDocIds.length + ' 个，每行一个）' : '失败样本中没有文档 id（如 mapping 冲突在写入前被拒），无法复制'"
                    @click="copyFailedDocIds"><Copy :size="11" /> 复制全部失败 doc id</button>
            <button type="button" class="btn ghost xs" data-test="ar-failure-backfill"
                    :disabled="!!backfillGenBlockedReason"
                    v-tip="backfillGenBlockedReason || '按作业时间字段生成失败窗口（启动~收尾）的回补 _reindex DSL 并复制（op_type=create 幂等）'"
                    @click="copyFailureBackfill"><Braces :size="11" /> 生成回补 query</button>
          </div>
        </div>
        <MiniTable v-if="job.rounds?.length" :columns="ROUND_COLS" table-class="ar-rounds">
          <template #rows>
            <tr v-for="r in job.rounds" :key="r.round + r.phase" tabindex="0"
              @contextmenu.prevent="openRoundMenu($event, r)" @keydown="onRoundMenuKey($event, r)" data-row-nav @keydown.self="rowArrowNav">
              <td>{{ r.round }}</td><td><StatusPill tone="b" :label="roundZh(r.phase) || r.phase" :en="roundZh(r.phase) ? r.phase : undefined" /></td><!-- ：r.phase 裸枚举 → roundZh 中文接线（Lead 收口实地核 addRound 四值 FULL/CATCHUP/CATCHUP_BLOCKED/FINAL 全收录）。：轮次阶段私造胶囊改用 StatusPill b 档——未收录新枚举回退原英文（label 兜底），en 英文小字归组件 sp-en -->
              <td>{{ r.total != null ? fmtNum(r.total) : '-' }}</td><td>{{ r.created != null ? fmtNum(r.created) : '-' }}</td><td>{{ r.updated != null ? fmtNum(r.updated) : '-' }}</td><td>{{ r.versionConflicts != null ? fmtNum(r.versionConflicts) : '-' }}</td>
              <!-- 轮次耗时：服务端 toMap 字段名 roundTookMs、浏览器编排为 tookMs——双字段兜底读取，
	 TookBadge 四档语义徽标（缺字段不冒充，走 '—'） -->
              <td data-test="ar-round-took"><TookBadge :ms="roundTookMsOf(r)" title="该轮 reindex 耗时（自上一轮完成起算，首轮自作业启动起算）" /><span v-if="roundTookMsOf(r) == null" class="dim">—</span></td>
            </tr>
          </template>
          <!-- W1：Σ 聚合行（DiagView/HealthReportView 523 聚合行同语言：bg2 底+顶部分隔线，
	 数值右对齐）——追平收敛一眼判读：Σcreated+Σupdated 应趋近 Σtotal；ΣversionConflicts
	 高涨=全量期间源仍在被写（增量策略下的正常现象，写阻断策略下应恒 0） -->
          <template #tfoot>
            <tr class="ar-rounds-agg-row">
              <td class="mono ar-agg-lb" aria-hidden="true">Σ</td>
              <td></td>
              <td></td>
              <td class="ar-rounds-agg-num">Σ {{ roundSum('created') }}</td>
              <td class="ar-rounds-agg-num">Σ {{ roundSum('updated') }}</td>
              <td class="ar-rounds-agg-num">Σ {{ roundSum('versionConflicts') }}</td>
              <!-- 耗时列占位：轮间隔含等待窗口，逐轮 Σ 不等于作业总耗时（job 已有总耗时行），留空不误导 -->
              <td></td>
            </tr>
          </template>
        </MiniTable>
        <!-- 事件时间线（api.adhoc.events 只读回放，服务端/浏览器同构）：竖向轨道，
             ts HH:mm:ss + stage 徽标 + detail；GATE_* 事件琥珀行高亮（确认门轨迹），
             终态事件按状态色（statusTone 复用）。进入监控（Eye/深链/启动）按 jobId 拉取
             一次，重跑成功即重拉（新生命周期）；轮询运行期间节流静默刷新（≥5s），
             拍失败保旧数据+错误条并存。
             2026-11-21 对账批：标题行加筛选芯片（全部/门禁/错误/终态，按 stage/status 过滤）
             与自动滚动开关（默认开，新事件到达滚到底部）；容器限高内滚，长作业时间线不再撑爆页高。
             能力对齐批（Xmigrate 同款三件）：关键字搜索（与档位芯片 AND 叠加）、JSONL 导出
             （当前筛选后事件集，文件名含 jobId）、单事件行点击钻取（完整时间戳/枚举/全文+复制） -->
        <div class="ar-events" data-test="ar-events">
          <div class="ar-events-t sec-t">事件时间线
            <span class="ar-ev-tools">
              <button v-for="f in EV_FILTERS" :key="f.v" type="button" class="chip ar-ev-fchip"
                      :class="{ on: evFilter === f.v }" :data-test="'ar-evt-filter-' + f.v"
                      :aria-pressed="evFilter === f.v ? 'true' : 'false'" :disabled="evReplayOn"
                      v-tip="f.hint" @click="evFilter = f.v">{{ f.label }}</button>
              <TextInput v-model="evKw" data-test="ar-evt-kw" input-class="inp ar-ev-kw" :disabled="evReplayOn"
                         placeholder="搜索关键字" v-tip="'按 detail/stage 关键字过滤，与左侧档位芯片叠加（AND）'" />
              <button type="button" class="chip ar-ev-replay" :class="{ on: evReplayOn }" data-test="ar-evt-replay"
                      :aria-pressed="evReplayOn ? 'true' : 'false'" :disabled="!evReplayOn && filteredEvents.length < 2"
                      v-tip="'把当前筛选后的事件按虚拟时间轴回放：播放/暂停/逐条/倍速；长空档已压缩'"
                      @click="evReplayOn ? exitEvReplay() : enterEvReplay()"><Play :size="11" /> {{ evReplayOn ? '回放中' : '回放' }}</button>
              <button type="button" class="btn ghost sm ar-ev-export" data-test="ar-evt-export" :disabled="evReplayOn"
                      v-tip="'把当前筛选后事件导出为 JSONL 文件（每行 {ts,stage,status,detail}）'"
                      @click="exportEventsJsonl"><Download :size="11" /> 导出 JSONL</button>
              <n-checkbox v-model:checked="evAutoScroll" size="small" class="ar-ev-autoscroll" data-test="ar-evt-autoscroll"
                          :disabled="evReplayOn">
                自动滚动到最新
              </n-checkbox>
            </span>
          </div>
          <EventReplayBar v-if="evReplayOn" :count="evReplayEvents.length" :index="evReplay.index.value"
            :playing="evReplay.playing.value" :progress="evReplay.progress.value" :speed="evReplay.speed.value"
            @toggle="evReplay.toggle()" @seek="evReplay.seek($event)" @step="evReplay.step($event)"
            @speed="evReplay.setSpeed($event)" @exit="exitEvReplay" />
          <div v-if="eventsErr" role="alert" class="ar-events-err" data-test="ar-events-err">事件读取失败：{{ eventsErr }}<template v-if="jobEvents.length">（下方保留上次成功的事件快照）</template></div>
          <div v-if="eventsLoading && !jobEvents.length" class="dim">事件读取中…</div>
          <div v-else-if="evTimelineEvents.length" ref="evLineEl" class="ar-events-line" data-test="ar-events-line">
            <template v-for="(ev, i) in evTimelineEvents" :key="i">
              <!-- 跨天分组段头（dayLabel 单源：今天/昨天/MM-DD）——派生自筛选后序列，
                   筛选后剩余事件跨天时分组仍正确；ar-ev-N 事件行全局索引保持，
                   段头锚用 ar-day-head 前缀（不撞既有 [data-test^="ar-ev-"] 事件行集语义） -->
              <div v-if="eventDayHeads[i]" class="ar-ev-day" data-test="ar-day-head">{{ eventDayHeads[i] }}</div>
              <!-- 事件行=钻取入口（点击/Enter/Space 内联展开）；行本体样式与筛选锁面零触 -->
              <div class="ar-ev"
                   :class="{ gate: String(ev.status ?? '').startsWith('GATE_'), 'ar-ev-current': evReplayOn && evReplay.current.value === ev }" :data-test="'ar-ev-' + i"
                   role="button" tabindex="0" :aria-expanded="evOpenKey === String(i) ? 'true' : 'false'"
                   :aria-current="evReplayOn && evReplay.current.value === ev ? 'true' : undefined"
                   :data-ev-current="evReplayOn && evReplay.current.value === ev ? 'true' : undefined"
                   @click="toggleEvOpen(i)" @keydown.enter.prevent="toggleEvOpen(i)" @keydown.space.prevent="toggleEvOpen(i)">
                <span class="ar-ev-ts mono">{{ fmtHms(Number(ev.ts)) }}</span>
                <StatusPill class="ar-ev-stage" :tone="eventTone(ev)" :label="String(ev.stage ?? '')" />
                <span class="ar-ev-detail">{{ ev.detail }}</span>
              </div>
              <!-- 钻取展开区：完整时间戳（含日期）/stage/status 枚举 + detail 全文不截断 + 复制钮
                   （data-test 走 ar-evt- 前缀——不进 [data-test^="ar-ev-"] 事件行集语义） -->
              <div v-if="evOpenKey === String(i)" class="ar-evd" data-test="ar-evt-detail">
                <div class="ar-evd-meta mono">
                  <span>{{ fmtTime(Number(ev.ts)) }}</span>
                  <span class="chip">stage={{ ev.stage || '—' }}</span>
                  <span class="chip">status={{ ev.status || '—' }}</span>
                  <button type="button" class="btn ghost xs ar-evd-copy" data-test="ar-evt-copy"
                          v-tip="'复制该事件 detail 全文'" @click.stop="copyEvDetail(ev)"><ClipboardCopy :size="11" /> 复制</button>
                </div>
                <pre class="ar-evd-msg mono">{{ ev.detail || '（无详情）' }}</pre>
              </div>
            </template>
          </div>
          <div v-else-if="!eventsErr" class="dim" data-test="ar-events-empty">{{ jobEvents.length ? '当前筛选无命中事件' : '暂无事件记录' }}</div>
        </div>
        <div v-if="job.report" class="report">
          <div class="ed-label sec-t">收尾报告
            <!-- 回补 DSL 一键复制（RawIoModal copyReq 三行手法；直切策略人工回补高频） -->
            <button v-if="job.report.suggestedBackfillDsl" class="btn ghost xs" v-tip="'复制建议回补 DSL'" @click="copyBackfillDsl">
              <Copy :size="11" /> 复制回补 DSL
            </button>
          </div>
          <!-- 2026-11-21 对账批：终态文档数对账条（后端 report.reconcile，Controller 快照透出）。
               MATCH=绿（对账一致）/ GAP=黄（差值+补齐路径）/ SOURCE_GONE=灰（源已删，无法对账）/
               UNAVAILABLE=灰（取数失败，不作验收依据）；字段缺席（旧后端）整行不渲染 -->
          <div v-if="job.report.reconcile" class="p-row ar-reconcile" data-test="ar-reconcile">
            <span>文档数对账</span>
            <span style="display:flex;gap:var(--sp-2);align-items:center;flex-wrap:wrap">
              <StatusPill :tone="reconcileView.tone" :label="reconcileView.label" :data-test="'ar-reconcile-' + reconcileView.status" />
              <span class="dim">{{ job.report.reconcile.message }}</span>
            </span>
          </div>
          <div class="p-row" v-if="job.report.hint"><span class="dim">{{ job.report.hint }}</span></div>
          <pre v-if="job.report.suggestedBackfillDsl" class="mono dsl" v-html="backfillHtml"></pre><!-- ：裸 pre → highlightJson 高亮（先 pretty，输出已转义） -->
        </div>
        <!-- R4 完成校验闭环：SUCCEEDED 后就地核对——a) 文档数比对（快照 sourceDocCount vs
             destDocCount，缺字段不冒充）；b) 别名模式调既有 aliases 读端点核对别名指向 dest；
             直连模式如实说明无别名可核对。校验失败给排查指引，不替用户下「数据一致」的结论 -->
        <div v-if="job.status === 'SUCCEEDED'" class="ar-verify" data-test="adhoc-verify">
          <div class="ar-verify-t">完成校验
            <button class="btn ghost xs" data-test="adhoc-verify-run" :disabled="verifyBusy" @click="doVerify">
              <Loader2 v-if="verifyBusy" :size="11" class="spinning" /><ShieldCheck v-else :size="11" /> {{ verifyResult ? '重新校验' : '开始校验' }}
            </button>
          </div>
          <template v-if="verifyResult">
            <div class="p-row">
              <span>文档数比对</span>
              <span v-if="docVerifyVerdict" style="display:flex;gap:var(--sp-2);align-items:center;flex-wrap:wrap">
                <StatusPill :tone="docVerifyVerdict.match ? 'g' : 'r'" :label="docVerifyVerdict.match ? '一致' : '不一致'" />
                <span class="dim" data-test="adhoc-verify-count">{{ docVerifyVerdict.live ? '实取 _count：' : '快照：' }}源 {{ fmtNum(docVerifyVerdict.src) }} / 目标 {{ fmtNum(docVerifyVerdict.dst) }}</span>
                <!-- 活取为主时快照降级为参考行；源已删时如实说明只有快照可比 -->
                <span v-if="verifyResult.live?.src?.state === 'gone'" class="warn-txt" data-test="adhoc-verify-src-gone">源已删，仅快照可比</span>
                <span v-else-if="docVerifyVerdict.live && docCountVerify" class="dim">（快照参考：源 {{ fmtNum(docCountVerify.src) }} / 目标 {{ fmtNum(docCountVerify.dst) }}）</span>
              </span>
              <span v-else class="dim">快照缺 sourceDocCount / destDocCount，无法比对（不冒充结论）</span>
            </div>
            <div class="p-row" v-if="jobIsAliasMode">
              <span>别名指向</span>
              <span v-if="verifyResult.error" class="err-txt" v-tip="verifyResult.error" data-test="adhoc-verify-alias-err">校验请求失败：{{ verifyResult.error }}</span>
              <span v-else-if="verifyResult.alias?.error" class="warn-txt" v-tip="verifyResult.alias.error" data-test="adhoc-verify-alias-err">别名核对失败：{{ verifyResult.alias.error }}（文档数校验不受影响）</span>
              <span v-else-if="verifyResult.alias && verifyResult.alias.ok" style="display:flex;gap:var(--sp-2);align-items:center;flex-wrap:wrap">
                <StatusPill tone="g" :label="verifyResult.alias.writeOk ? '别名已指向目标索引' : '别名已包含目标索引'" />
                <span class="dim">成员：{{ (verifyResult.alias.members || []).join('、') || '—' }}</span>
              </span>
              <span v-else-if="verifyResult.alias" style="display:flex;gap:var(--sp-2);align-items:center;flex-wrap:wrap">
                <StatusPill tone="r" :label="verifyResult.alias.members?.length ? '别名未指向目标索引' : '别名不存在'" />
                <span class="dim">{{ verifyResult.alias.members?.length ? '当前成员：' + verifyResult.alias.members.join('、') : '别名 ' + job.logicalName + ' 不存在——切换可能未生效' }}</span>
              </span>
              <span v-else class="dim">未核对</span>
            </div>
            <div class="p-row" v-else>
              <span>别名指向</span>
              <span class="dim">直连模式：无别名指向可核对，请按业务查询入口验证目标索引「{{ job.destPhysical }}」</span>
            </div>
            <div v-if="!docVerifyVerdict?.match || (verifyResult.alias && !verifyResult.alias.ok)" class="ar-verify-guide" data-test="adhoc-verify-guide" role="alert">
              排查指引：文档数不一致时，先确认源索引在全量期间是否继续写入（增量策略可「重跑」补齐追平轮；直连模式请按业务主键核对）；
              别名未指向目标索引时，先到<router-link to="/aliases" data-test="adhoc-verify-aliases-link" v-tip="'打开别名管理页核查切换结果'">别名管理页</router-link>核查切换结果，再决定重跑或人工切换。
            </div>
          </template>
          <div v-else class="dim">核对文档数与别名指向，确认重建结果可接手业务流量后再删除旧索引</div>
        </div>
        <!-- w80：SUCCEEDED 后「去查询验证」常驻钮——此前只挂在确认切换 toast 的 action 上（12s 即逝），
 错过就得手动找索引。目标优先作业回传，回落向导内 destIndex/建议名（深链同 doConfirmSwitch 的 toast action） -->
        <button v-if="job.status === 'SUCCEEDED'" class="btn primary next" data-test="go-verify"
                v-tip="'在查询工作台打开「' + (verifiedTarget || '目标索引') + '」验证数据'"
                @click="goVerifyFromJob"><Search :size="13" /> 去查询验证</button>
        <!-- 成功后跨板块联动：健康报告页核对目标索引分片/存储/映射健康度（与去查询验证并列的验收入口） -->
        <button v-if="job.status === 'SUCCEEDED'" class="btn ghost next" data-test="adhoc-health-link"
                v-tip="'打开健康报告页，核对目标索引的分片/存储/映射健康度'"
                @click="router.push('/health-report')"><Activity :size="13" /> 查看健康报告</button>
        <!-- R3 一键重跑：FAILED/ABORTED 作业同 jobId 重置，成功后直接留在监控态（跳过向导）；
             2026-11-21 对账批升级为参数覆盖弹层（rps/slices/batchSize 可选填，未填沿用原值） -->
        <button v-if="job.status === 'FAILED' || job.status === 'ABORTED'" class="btn primary next" data-test="adhoc-retry"
                :disabled="retrying" v-tip="retrySemanticsHint(job)" @click="openRetryModal(job)">
          <Loader2 v-if="retrying" :size="13" class="spinning" /><RotateCw v-else :size="13" /> 重跑该作业
        </button>
        <span v-if="job.status === 'FAILED' || job.status === 'ABORTED'" class="dim ar-retry-hint" data-test="adhoc-retry-hint">{{ retrySemanticsHint(job) }}</span>
        <!-- 以此参数新建：作业参数回填向导（源/策略/参数）并回到向导首步重新探测——
             settings/mapping 不随作业持久化，由回填后的探测重新预填 -->
        <button v-if="job.status !== 'RUNNING'" class="btn ghost next" data-test="ar-reuse-params"
                v-tip="'把该作业的源索引、策略与执行参数回填向导并回到第一步（settings/mapping 重新探测预填）'"
                @click="reuseJobParams(job)"><Wand2 :size="13" /> 以此参数新建</button>
        <!-- 导出快照：JSON 下载（完整 toMap 快照）+ Markdown 工单贴片（matrixText 导出风格） -->
        <span v-if="job.status !== 'RUNNING'" class="ar-export-row">
          <button class="btn ghost next" data-test="ar-export-json" v-tip="'下载该作业的完整 JSON 快照（toMap 全量字段）'"
                  @click="exportJobSnapshotJson"><Download :size="13" /> 导出 JSON</button>
          <button class="btn ghost next" data-test="ar-export-md" v-tip="'复制该作业的 Markdown 工单贴片（基本信息 + 轮次 + 对账结论）'"
                  @click="exportJobSnapshotMd"><ClipboardList :size="13" /> 复制 Markdown</button>
        </span>
        <button v-if="job.status !== 'RUNNING'" class="btn ghost next" @click="reset"><RotateCcw :size="13" /> 再来一次</button>
      </template>
    </div>

    <!-- 最近作业 -->
    <!-- W1：工具行 kw 过滤（jobId/逻辑名/状态，命中 MarkText 高亮）+
 状态 pill 漏斗（点状态只看该状态，再点取消）+ matrixText TSV/MD 复制（锚在 524 spec）。
 W-B：裸表换 QRT rows 型（525 W5 HealthReport/SqlBridge 同判据）——表头排序/
 列选/列宽记忆/单元格右键菜单/导出四格式（CSV/MD/XLSX/PNG）/按值类型徽标/tfoot 聚合行
 归内核白得；过滤职责仍在宿主（kw+状态漏斗算好 visibleJobs 单一行集喂 :rows，
 所见即所复，与 TSV/MD 导出同一行集）。cell 形态迁 #cell-<col> 作用域槽：jobId 复制芯片/
 MarkText 命中高亮/状态 pill 漏斗/stage pill/TimeCell；行操作迁 #row-actions。
 形态同步更新不回退：状态 cell 接 jobStatusZh 中文+英文小字（.ar-st-en，监控步
 同范式）；锁安全徽标（switchedWithoutLock 红 / lockActive 黄 / gateOutcome 徽）——
 后端 toMap 对 jobs 列表行同样透出三字段（AdhocRebuildJob.toMap），监控步同语义。 -->
    <div class="ar-sec" v-if="allJobs.length || jobsErr">
      <div class="card-t">
<History :size="14" /> 最近作业
        <!-- 导出两钮恒在场 disabled 联动过滤行集（exportEmptyGuard936 口径：无数据 disabled 而非 v-if 消失；
     过滤筛零行时按钮保持座位，铁律 B 位置恒定）。导出函数内空集另有 warning 报真兜底。 -->
        <button class="btn ghost sm" style="margin-left:auto" :disabled="!visibleJobs.length" @click="exportJobsMatrix('md')" v-tip="'复制当前视图为 Markdown 表（群聊/工单直贴）'"><ClipboardList :size="12" /> Markdown</button>
        <button class="btn ghost sm" :disabled="!visibleJobs.length" @click="exportJobsMatrix('tsv')" v-tip="'复制当前视图为 TSV（Excel 可直接粘贴）'"><ClipboardCopy :size="12" /> 导出 TSV</button>
        <button aria-label="刷新任务列表" class="btn ghost sm" :disabled="jobsLoading" @click="loadJobs()" v-tip="'刷新任务列表'"><RefreshCw :size="12" :class="{ spinning: jobsLoading }" /></button>
        <!-- R9 历史治理：批量清理 7 天前终态记录（确认后调批量 DELETE；仅清记录，不影响 ES 索引） -->
        <button class="btn ghost sm" data-test="adhoc-cleanup" :disabled="jobsLoading" v-tip="'清理 7 天前已结束（成功/失败/中止）的作业记录；进行中作业不受影响，仅清记录不影响 ES 索引'" @click="doCleanupJobs"><Trash2 :size="12" /> 清理 7 天前</button>
      </div>
      <!-- 拉取失败错误卡：卡片不消隐（整卡消失会被误读成「没有历史作业」），重试钮就地重拉 -->
      <div v-if="jobsErr" role="alert" class="err-bar ar-jobs-err" data-test="ar-jobs-err">
        <span>{{ jobsErr }}</span>
        <button class="btn ghost sm" data-test="ar-jobs-retry" :disabled="jobsLoading" @click="loadJobs()">重试</button>
      </div>
      <template v-else>
      <!-- 健康摘要条（2026-11-21 对账批）：从已加载 jobs 前端派生（总数/运行中/成功/失败/
           平均轮次耗时/平均速率/冲突总数/停门中），空清单隐藏——不冒充 0；只读展示，点击行为不做 -->
      <div v-if="jobHealth" class="ar-health" data-test="ar-health">
        <span class="chip ar-health-chip" data-test="ar-health-total" v-tip="'当前清单中的作业总数'">总数 {{ jobHealth.total }}</span>
        <span class="chip ar-health-chip" data-test="ar-health-running" v-tip="'status=RUNNING 的作业（含停在 AWAIT_CONFIRM 的等待确认）'">运行中 {{ jobHealth.running }}</span>
        <span class="chip ar-health-chip ar-health-ok" data-test="ar-health-succeeded" v-tip="'status=SUCCEEDED 的作业'">成功 {{ jobHealth.succeeded }}</span>
        <span class="chip ar-health-chip ar-health-bad" data-test="ar-health-failed" v-tip="'status=FAILED 的作业（中止不计入，见状态列）'">失败 {{ jobHealth.failed }}</span>
        <span class="chip ar-health-chip" data-test="ar-health-avg-round" v-tip="'全部作业轮次 roundTookMs 的算术平均（' + (jobHealth.roundCount ?? 0) + ' 轮采样；无轮次不展示数值）'">平均轮次耗时 {{ jobHealth.avgRoundMs != null ? fmtMs(jobHealth.avgRoundMs) : '—' }}</span>
        <span class="chip ar-health-chip" data-test="ar-health-avg-rate" v-tip="'各作业速率（Σ轮次已建 / Σ轮次耗时）的算术平均，仅计有耗时轮次的作业；无可速率作业展示 —'">平均速率 {{ jobHealth.avgRate != null ? fmtNum(jobHealth.avgRate) + ' docs/s' : '—' }}</span>
        <span class="chip ar-health-chip" data-test="ar-health-conflicts" v-tip="'全部作业轮次 versionConflicts 总和（轮次表「冲突跳过」列同数据源）；无冲突字段展示 —'">冲突总数 {{ jobHealth.conflictTotal != null ? fmtNum(jobHealth.conflictTotal) : '—' }}</span>
        <span class="chip ar-health-chip ar-health-gate" data-test="ar-health-gated" v-tip="'RUNNING 且 stage=AWAIT_CONFIRM（业务写入正被阻断，等待人工放行）'">停门中 {{ jobHealth.gated }}</span>
      </div>
      <div class="ar-jobs-tools">
        <!-- kw 过滤改用 SearchFilterBar 统一件（559 TasksView tv-kw 先例；placeholder 逐字保留，
 Esc 清空/Enter 语义内建；ar-jobs-kw 类锚随 input-class 保留在 input 上——524/529 挂载过滤锁同路径零迁，
 落位宽度随改用迁 wrap 根） -->
        <SearchFilterBar v-model="jobKw" class="ar-jobs-kw-wrap" input-class="ar-jobs-kw" placeholder="过滤：jobId / 逻辑名 / 状态" />
        <button v-if="jobKw || jobStatusFilter" class="btn ghost xs" @click="clearJobFilters" v-tip="'清除过滤条件，恢复完整清单'">清除过滤</button>
        <span v-if="jobKw || jobStatusFilter" class="dim ar-jobs-hit">{{ visibleJobs.length }}/{{ allJobs.length }} 条命中</span>
      </div>
      <QueryResultTable :cols="JOB_COLS" :rows="jobsMatrix" sortable
        storage-key="adhoc:jobs" max-height="none" :loading="jobsLoading" export-name="adhoc-jobs"
        :empty-text="jobsEmptyText" empty-hint="点上方「清除过滤」恢复完整清单">
        <template #cell-jobId="{ row }">
          <!-- 行级右键（2026-11-21 对账批）：右键 jobId 单元格出行菜单（复制索引名/详情/
               重跑/调速/中止/治理删除/以此参数新建）；.stop 防冒泡进 QRT 内建单元格菜单 -->
          <span class="mono cpy" v-tip="'点击复制 jobId：' + row[0] + '（右键打开行操作菜单）'" tabindex="0" role="button"
                data-test="ar-job-cell"
                @contextmenu.prevent.stop="openJobRowMenu($event, jobOf(row))"
                @keydown.enter.prevent="copyJobId(String(row[0] ?? ''))" @keydown.space.prevent="copyJobId(String(row[0] ?? ''))" @click.stop="copyJobId(String(row[0] ?? ''))"><MarkText :text="row[0]" :kw="jobKw" /></span>
        </template>
        <template #cell-logicalName="{ row }"><span class="mono"><MarkText :text="row[1]" :kw="jobKw" /></span></template>
        <template #cell-status="{ row }">
          <!-- W1：状态 pill 兼作漏斗——点击只看该状态（aria-pressed 表达按下态），再点取消。
 改用 StatusPill：role/tabindex/aria-pressed/键盘经 attrs 落根（单根透传），
 锚类 ar-st-funnel/ar-st-en 外挂保留；中文主体+英文小字 en 档组件化（MarkText 两处随装
 退役——英文枚举不再吃过滤词高亮，524 spec 同步改锚） -->
          <StatusPill class="ar-st-funnel ar-st-en" :tone="statusTone(row[3])"
                :label="jobStatusZh(String(row[3] ?? '')) || String(row[3] ?? '')"
                :en="jobStatusZh(String(row[3] ?? '')) ? String(row[3] ?? '') : undefined"
                role="button" tabindex="0"
                :aria-pressed="jobStatusFilter === funnelKey(row[3]) ? 'true' : 'false'"
                :title="'点击只看状态 ' + row[3] + '（再点取消）'"
                @keydown.enter.prevent="toggleJobStatusFilter(row[3])" @keydown.space.prevent="toggleJobStatusFilter(row[3])" @click.stop="toggleJobStatusFilter(row[3])" />
          <Tip v-if="jobOf(row).switchedWithoutLock" long :text="SWITCHED_NO_LOCK_TIP"><StatusPill tone="r" label="无锁切换" /></Tip>
          <Tip v-else-if="jobOf(row).lockActive === false" long :text="LOCK_INACTIVE_TIP"><StatusPill tone="y" label="锁保护未生效" /></Tip>
          <StatusPill v-if="jobOf(row).gateOutcome === 'TIMED_OUT'" tone="y" label="确认超时" title="确认门超时：超时方赢得竞争，写阻断已自动解除、别名切换未执行" />
          <StatusPill v-else-if="jobOf(row).gateOutcome === 'ABORTED'" tone="n" label="门已中止" title="确认门以人工中止告终——写阻断已解除、别名切换未执行" />
        </template>
        <template #cell-strategy="{ row }"><!-- 策略裸枚举 → 中文主体+英文小字（status/stage 列同范式；tone 中性不抢状态色；未收录枚举回退原值） -->
          <StatusPill tone="n" :label="jobStrategyZh(row[2]) || String(row[2] ?? '')" :en="jobStrategyZh(row[2]) ? String(row[2] ?? '') : undefined" />
        </template>
        <template #cell-stage="{ row }"><StatusPill class="sm" :tone="stagePill(row[4])" :label="stageZh(row[4]) || String(row[4] ?? '')" :en="stageZh(row[4]) ? String(row[4] ?? '') : undefined" /></template><!-- ：stage 裸串 → stageZh 中文 + 英文小字徽标（监控步同范式；w80：stage 裸串→pill 徽标同谱系） -->
        <template #cell-startedAt="{ row }"><TimeCell :ts="row[5]" /></template>
        <template #cell-tookMs="{ row }"><!-- ：作业耗时徽标（TookBadge 四档语义；后端 AdhocRebuildJob.toMap tookMs=finishedAt-startedAt，运行中约定 -1、字段缺席 null——两者都不冒充 0，走 '—' 档；null 直判防 Number(null)=0 误显 0ms） --><TookBadge v-if="row[6] != null && Number(row[6]) >= 0" :ms="Number(row[6])" title="作业总耗时（启动 → 收尾）" /><span v-else class="dim">—</span></template>
        <template #row-actions="{ row }">
          <button aria-label="查看任务详情" class="btn ghost sm" @click.stop="watchJob(String(row[0] ?? ''))" v-tip="'查看任务详情'"><Eye :size="12" /></button>
          <!-- R3 行级重跑：仅 FAILED/ABORTED 行渲染（打开参数覆盖弹层，语义同监控卡重跑钮） -->
          <button v-if="['FAILED', 'ABORTED'].includes(String(jobOf(row).status))" aria-label="重跑作业" class="btn ghost sm"
                  data-test="adhoc-retry-row" v-tip="'重跑该作业（可选填执行参数覆盖）：' + retrySemanticsHint(jobOf(row))"
                  @click.stop="openRetryModal(jobOf(row))"><RotateCw :size="12" /></button>
          <!-- R9 行级删除：终态才可用，进行中禁用并说明 -->
          <button aria-label="删除记录" class="btn ghost sm" :disabled="jobOf(row).status === 'RUNNING'"
                  v-tip="jobOf(row).status === 'RUNNING' ? '作业进行中，不可删除记录（先中止或等待终态）' : '删除该作业记录（仅清记录，不影响 ES 索引与已迁移数据）'"
                  @click.stop="doDeleteJob(String(row[0] ?? ''))"><Trash2 :size="12" /></button>
        </template>
      </QueryResultTable>
      </template>
    </div>

    <!-- 粘贴导入——原始 JSON 一手进，识别只拆壳不改值（校准铁律）。
 与 Mapping 页「原始 JSON → 复制全部」形成跨页闭环：复制 → 跳托管重建 → 粘贴 → 秒拆双框 -->
    <n-modal v-model:show="pasteImportOpen" preset="card"
             title="粘贴导入 — 识别并拆填 settings / mapping" style="width:680px;max-width:94vw" :bordered="false">
      <div class="pi-hint">
        支持识别：Mapping 页「原始 JSON」复制的完整配置 · GET _mapping / _settings 响应（自动剥索引名外壳）·
        纯 mapping / settings 片段。只拆壳、不改值，与粘贴原文严格一致。贴入后
        <b>Ctrl+Enter</b>（或点下方按钮）解析并填入。
      </div>
      <!-- 裸 textarea 合并 JsonArea——与审编框同一编辑内核（JSON 高亮/合法性圆点/
 格式化·压缩·复制工具条），粘贴导入现场获得同款校验反馈。Ctrl+Enter 走 MonacoEditor
 既有 es-execute action → JsonArea submit 事件 → doPasteImport，与原
 @keydown.enter.ctrl.prevent 行为等价；Esc 关弹窗由 NModal 自身 closeOnEsc 承接
 （footer「取消」同路）。placeholder prop 为 JsonArea 签名保留项（Monaco 无占位渲染），
 操作引导文案由上方 pi-hint 承担。 -->
      <!-- W10：JsonArea rows 定高退役 → fill + 弹性 wrapper（min(60vh, 600px)：
 大屏随视口撑高粘贴区、≥1000px 视口 600px 封顶；小窗按 60vh 收缩不撑破弹窗）。
 定高字面升 adhoc.piH 四档（useTierCycle，首位=原值零漂移），档位钮在弹窗 footer -->
      <div class="pi-ja-wrap" :style="{ height: piH }">
        <JsonArea
          ref="pasteJaEl" v-model="pasteImportText" fill
          placeholder="在此 Ctrl+V 粘贴原始 JSON…（Ctrl+Enter 解析并填入）"
          @submit="doPasteImport"
        />
      </div>
      <!-- 实时校准预览——边贴边回显识别形态/键数/字段数/错误，输错即刻可见 -->
      <div v-if="pasteImportText.trim() && pastePreview" class="pi-preview" :class="pastePreview.ok ? 'ok' : 'bad'" data-test="pi-preview">
        <template v-if="pastePreview.ok">
          <span v-for="(ln, i) in pastePreviewLines(pastePreview)" :key="i" class="pi-pl">{{ ln }}</span>
        </template>
        <span v-else class="pi-pl">{{ pastePreviewLines(pastePreview)[0] }}</span>
      </div>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <!-- 粘贴区高度四档循环钮（adhoc.pasteH data-ar-paste-h 同范式，
 title 实时回显当前档，点击切下一档末档回首档） -->
          <button type="button" class="btn ghost sm" data-ar-pi-h style="margin-right:auto"
                  v-tip="'粘贴区高度档：' + piH + '（点击循环）'" @click="cyclePiH">高</button>
          <button class="btn" @click="pasteImportOpen = false">取消</button>
          <button class="btn primary" :disabled="!pasteImportText.trim()" @click="doPasteImport">
            <ClipboardPaste :size="12" /> 解析并填入
          </button>
        </div>
      </template>
    </n-modal>

    <!-- 从集群复刻——按源连接档案直拉索引结构（既有 /xmigrate/fetch-config 端点，
         connId 服务端取密；浏览器模式 browserXmigrate 直连源档案，两端同契约） -->
    <n-modal v-model:show="cloneImportOpen" preset="card"
             title="从集群复刻 — 按源连接拉取索引结构" style="width:560px;max-width:94vw" :bordered="false">
      <div class="pi-hint">
        源连接取自连接中心已存档案（凭据不出前端）。拉取到的 settings 为白名单精选
        （分片/副本/refresh_interval/max_result_window/analysis/similarity），插件 analyzer
        组件名已按源集群还原；系统只读键不会进入。填入后建议点「仅校验」确认再继续。
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--sp-2)">
        <n-select v-model:value="cloneConnId" :options="cloneConnOpts" size="small" filterable
                  placeholder="选择源连接档案" data-test="ar-clone-conn" />
        <!-- 源索引名 combobox（IndexPicker/usePopupList 同骨架，datalist 退役）：可输可选
             +输入即过滤；清单外索引 Enter 直接拉取（手输兜底语义保留）。弹层就地渲染
             （to=false，嵌 n-modal 场景 IndexPicker to=false 先例——Teleport 关闭随内容
             子树吃 modal 层级，不被 modal 遮挡） -->
        <div class="ar-clone-idx" ref="cloneIdxRootEl">
          <!-- 单行文本统一件承载 combobox 输入位：aria/data-test 随 attrs 透传到真实 input，
               input/focus/keydown 原监听等价接线（统一件只增量补清空钮/状态档，此处不用） -->
          <TextInput :model-value="cloneIndex" input-class="inp mono"
                 role="combobox" aria-autocomplete="list"
                 :aria-expanded="cloneIdxOpen ? 'true' : 'false'"
                 :aria-controls="cloneIdxListId"
                 :aria-activedescendant="cloneIdxOpen && cloneIdxItems[cloneIdxCursor] ? cloneIdxItemId(cloneIdxCursor) : undefined"
                 :placeholder="`源索引名${cloneIndices.length ? '（输入过滤，↓ 或点击展开清单点选）' : '（如 onshore-bond-basic）'}`"
                 data-test="ar-clone-index" @input="onCloneIdxInput" @focus="cloneIdxOpenPanel" @keydown="onCloneIdxKey" />
          <Teleport to="body" :disabled="true">
            <transition name="pop">
              <div v-if="cloneIdxOpen" class="ar-clone-pop float-pop inplace" :style="cloneIdxPopStyle"
                   role="listbox" :id="cloneIdxListId" @mousedown.prevent.stop>
                <div v-if="cloneIdxLoading" class="ar-clone-hint">索引清单拉取中…</div>
                <div v-else-if="!cloneIdxItems.length" class="ar-clone-hint">没有匹配「{{ cloneIndex.trim() }}」的索引——清单外索引名可直接回车拉取</div>
                <div v-else class="ar-clone-list" ref="cloneIdxListEl">
                  <div v-for="(name, i) in cloneIdxItems" :key="name"
                       class="ar-clone-item" :class="{ act: i === cloneIdxCursor }"
                       role="option" :id="cloneIdxItemId(i)" :aria-selected="i === cloneIdxCursor" tabindex="-1"
                       @mouseenter="cloneIdxCursor = i" @click="chooseCloneIdx(name)">
                    <span class="mono">{{ name }}</span>
                  </div>
                </div>
                <div class="ar-clone-ft"><span>{{ cloneIndices.length }} 索引可选</span><span class="dim">↑↓ 选择 · Enter 拉取 · Esc 关闭</span></div>
              </div>
            </transition>
          </Teleport>
        </div>
        <!-- 源集群索引清单状态行（connect-check 拉取；拉取失败不阻塞：手输仍可用，
             弹窗内如实提示——错误文案与弹层内提示共用同一状态源） -->
        <div v-if="cloneIdxLoading" class="dim" style="font-size:var(--fs-xs)">索引清单拉取中…</div>
        <div v-else-if="cloneIdxError" class="dim err-txt" style="font-size:var(--fs-xs)">{{ cloneIdxError }}</div>
        <div v-else-if="cloneIndices.length" class="dim" style="font-size:var(--fs-xs)">
          源集群共 {{ cloneIndices.length }} 个索引可选
        </div>
      </div>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <button class="btn" @click="cloneImportOpen = false">取消</button>
          <button class="btn primary" data-test="ar-clone-fetch"
                  :disabled="!cloneConnId || !cloneIndex.trim() || cloneBusy || !cloneConnOpts.length"
                  @click="doCloneFetch">
            <FileDown :size="12" /> {{ cloneBusy ? '拉取中…' : '拉取并填入' }}
          </button>
        </div>
      </template>
    </n-modal>

    <!-- 重跑参数覆盖弹层（2026-11-21 对账批）：三输入可选填，预填原值、清空后「沿用原值」占位；
         未填字段不进 overrides（后端按沿用处理） -->
    <n-modal v-model:show="retryModalOpen" preset="card" style="width:460px;max-width:94vw" :bordered="false"
             :title="'重跑作业 — ' + (retryTarget?.jobId || '')">
      <div class="pi-hint">
        可选覆盖执行参数：留空（或恢复为预填的原值）即沿用作业当前配置；重跑语义：
        {{ retryTarget ? retrySemanticsHint(retryTarget) : '' }}
      </div>
      <div class="ar-retry-form">
        <div class="ar-retry-row">
          <label class="lbl">限流（docs/s）</label>
          <n-input-number v-model:value="retryRps" size="small" class="ar-num" :min="-1"
                          placeholder="沿用原值" data-test="ar-retry-rps"
                          v-tip="'每秒批次数（requests_per_second）：留空沿用原值，-1 表示不限速'" />
        </div>
        <div class="ar-retry-row">
          <label class="lbl">slices</label>
          <n-input-number v-model:value="retrySlices" size="small" class="ar-num" :min="1"
                          placeholder="沿用原值" data-test="ar-retry-slices"
                          v-tip="'reindex 并行切片数：留空沿用原值，>=1 的整数'" />
        </div>
        <div class="ar-retry-row">
          <label class="lbl">批大小（size）</label>
          <n-input-number v-model:value="retryBatch" size="small" class="ar-num" :min="1"
                          placeholder="沿用原值" data-test="ar-retry-batch"
                          v-tip="'reindex 每批文档数（REST size 键）：留空沿用原值，>=1 的整数'" />
        </div>
        <div class="ar-retry-row ar-retry-preset">
          <label class="lbl">参数预设</label>
          <n-select v-model:value="arPresetId" :options="arPresetOpts" size="small" clearable filterable
                    class="ar-preset-sel" placeholder="选择预设应用参数" data-test="ar-preset-pick"
                    v-tip="'应用已保存的 rps/slices/批大小组合到当前表单'" @update:value="applyArPreset" />
          <TextInput v-model="arPresetName" data-test="ar-preset-name" input-class="inp mono" placeholder="预设名" />
          <button class="btn sm ghost" data-test="ar-preset-save" v-tip="'按预设名保存当前三项参数组合（存在本地）'" @click="saveArPreset">保存预设</button>
          <button class="btn sm ghost" :disabled="!arPresetId" data-test="ar-preset-del" v-tip="'删除当前选中的参数预设'" @click="delArPreset">删除预设</button>
        </div>
        <div v-if="retryErr" class="ar-paste-err" data-test="ar-retry-err">{{ retryErr }}</div>
      </div>
      <template #footer>
        <div style="display:flex;justify-content:flex-end;gap:var(--sp-2)">
          <button class="btn" @click="retryModalOpen = false">取消</button>
          <button class="btn primary" data-test="ar-retry-go" :disabled="!!retryErr" @click="doRetrySubmit">
            <RotateCw :size="12" /> 重跑
          </button>
        </div>
      </template>
    </n-modal>

    <!-- 原始 IO 弹窗（宿主受控开关；rec=最近一条 /adhoc-rebuild/ 记录） -->
    <RawIoModal v-model:show="rawIoShow" :rec="rawIoRec" />
  </div>
</template>

<script setup lang="ts">
/* Adhoc 托管重建五步向导 —— 选索引 → 审编 → 策略 → 预览 → 监控 */
import { ref, computed, watch, onMounted, onActivated, onBeforeUnmount, nextTick, type Ref } from 'vue';
import { NModal } from 'naive-ui'; /* 粘贴导入弹窗——不 import 会被当原生 custom element 渲染（named slot 全丢） */
import { NSelect } from 'naive-ui'; /* 从集群复刻弹窗源连接下拉（同 NModal 理由） */
import { NRadio, NRadioGroup } from 'naive-ui'; /* 策略三选 radio 组（naive 化：键盘/主题统一，NSelect 同理由） */
import { NInputNumber } from 'naive-ui'; /* 追平缓冲/限流/slices 数字框（number|null 双向，草稿域仍存串） */
import { NCheckbox } from 'naive-ui'; /* 页内勾选项（deleteOldIndex/pauseBeforeSwitch 等，AnalyzeView 同先例） */
import { fmtNum, fmtSize, copyText, statusColor, downloadText, fmtHms, fmtMs, dayLabel } from '../utils/format'; /* ：fmtHms/fmtMs 本地实现退役改单源（非法值恒 '—'）；：dayLabel 时间线跨天分组段头 */
import { fmtTime } from '../utils/format'; /* 事件钻取完整时间戳（独立行——上一行尾部被 arRateSpark1122 逐字锁） */
import { sevPill } from '../utils/esEnumZh'; /* W4：severity pill 档收口 esEnumZh（本地 sevPill 退役） */
import { jobStatusZh } from '../utils/esEnumZh'; /* ：jobStatusZh 作业状态中文接线（独立 import 行——既有 sevPill import 行被两处 spec 逐字锁，一字不动） */
import { sevZh, stageZh, roundZh } from '../utils/esEnumZh'; /* ：severity/stage/轮次 phase 中文接线（Lead 跨工蚁契约；独立行——上两行被 spec 逐字锁） */
import { highlightJson } from '../utils/jsonc'; /* ：backfill DSL 高亮 */
import { friendlyApiError } from '../utils/esError'; /* ：裸 e.message 友好化 */
import { errPreHtml, errMeta } from '../utils/errPre'; /* ：探测失败条双参改用（XmigrateView :63 / errMetaPave547 口径） */
import { indexNameProblem } from '../utils/indexNameRule'; /* 索引名硬规则共享口径（ReindexAdvanced 同源） */
import { matrixText } from '../utils/copyMatrix'; /* W1：最近作业 TSV/MD 导出（RT/QRT 共用矩阵内核） */
import { removeSettingKey } from '../utils/removeSettingKey'; /* 报告一键移除共享内核（REMOVE_SETTING 执行体） */
import { addSettingKey } from '../utils/addSettingKey'; /* 报告一键补充共享内核（ADD_SETTING 执行体） */
import { useRoute, useRouter } from 'vue-router';
import {
  Hammer, Search, ChevronRight, ChevronLeft, Play, Loader2,
  CircleStop, RotateCcw, RotateCw, History, RefreshCw, Eye, ShieldCheck, ShieldAlert,
  ClipboardPaste, TriangleAlert, ExternalLink, ClipboardCopy, ClipboardList,
  Terminal, UnfoldVertical, Copy, Download, Info, Braces, FileDown, Trash2, Plus, SearchX, Activity, Wand2, Gauge, BellRing,
} from 'lucide-vue-next';

import PageHeader from '../components/PageHeader.vue';import { api, EP, ioRecorder, type RawIoRec } from '../api'; /* ：EP 供期望配置页外链（DesiredStateController 同前缀）；：ioRecorder 原始 IO 快查 */
import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';
import WorkbenchLayout, { type WorkbenchPaneSpec } from '../components/WorkbenchLayout.vue';
import { useAppStore } from '../stores/app';
import { useAuthStore } from '../stores/auth';
import { shallowEqFields } from '../stores/jobTracker'; /* 轮询回包浅比较单一出处 */
import { isBrowserMode } from '../platform/browserApi';
import IndexPicker from '../components/IndexPicker.vue';
import PickCurrentIdxBtn from '../components/PickCurrentIdxBtn.vue'; /* ：「用当前索引」回填钮统一件（兑现） */
import { askConfirm } from '../composables/confirm';
/* 校验/启动两链执行读秒+竞态作废（IndexHub 三链 P0-A 同范式统一件） */
import { useQueryRun } from '../composables/useQueryRun';
import { useScopedDraft, useScopedDraftState } from '../composables/useScopedDraft';
import { useAutoRefresh } from '../composables/useAutoRefresh';
import { useJobNotify } from '../composables/useJobNotify'; /* 后台通知（停门/终态，桌面通知+标题闪烁双通道，两页共用偏好键） */
import DraftBadge from '../components/DraftBadge.vue';
import JsonArea from '../components/JsonArea.vue';
import TimeCell from '../components/TimeCell.vue';
import MarkText from '../components/MarkText.vue'; /* W1：最近作业过滤命中高亮（全站 <mark> 统一件） */
import TookBadge from '../components/TookBadge.vue'; /* ：校验耗时四档语义徽标 */
import ProgressTrack from '../components/ProgressTrack.vue'; /* 统一进度条（确定/不确定双态）——手搓 linear-gradient 进度条退役 */
import SparkLine from '../components/SparkLine.vue'; /* 速率趋势迷你线（XmigrateView 同款 w=96/h=16 档） */
import { diffConfig, diffConfigSummary, type ConfigDiffRow } from '../utils/configDiff';
import { kindLabel, kindNote, parseExpectedMapping, shouldDiffMapping, partitionDiffRows } from '../utils/configDiffView';
import { assessDateRisks, assessFieldNameMismatch, mergeRiskRows, type RiskRow } from '../utils/dateRisk';
import MonacoEditor from '../components/MonacoEditor.vue';
import QueryResultTable from '../components/QueryResultTable.vue'; /* W-B：最近作业表换 QRT rows 型（排序/列选/右键/导出四格式/按值徽标归内核） */
import SearchFilterBar from '../components/SearchFilterBar.vue'; /* ：最近作业 kw 过滤胶囊统一件（559 TasksView tv-kw 先例） */
/* 原始请求/响应快查弹窗（探测/托管重建执行共用，ioRecorder 记录环取数） */
import RawIoModal from '../components/RawIoModal.vue';
import StatusPill from '../components/StatusPill.vue'; /* ：手滚 pill 改用统一件（ 范式；tone/label/en?/title? 四项契约） */
import Tip from '../components/Tip.vue'; /* 超长悬浮说明统一件（注解推导来源说明） */
import EmptyState from '../components/EmptyState.vue'; /* 深链 ?jobId= 失联空态（作业不存在或已清理） */
import TextInput from '../components/TextInput.vue'; /* 单行文本统一件（目标索引名/复刻源索引/预设名输入收敛） */
import EventReplayBar from '../components/EventReplayBar.vue'; /* 事件回放控制条（与 Xmigrate 同件） */
import { useEventReplay } from '../composables/useEventReplay'; /* 回放内核（虚拟时间轴） */
import MiniTable, { type MiniTableColumn } from '../components/MiniTable.vue'; /* 语义小表统一件（差异比对/轮次表收敛，行交互经 #rows/#tfoot 槽自带） */
import { parseEsConfigPaste, pastePreviewLines, type ParsedEsConfig } from '../utils/esConfigPaste';
import { useIndexFields } from '../composables/useIndexFields';
/* P1：settings/mapping 四编辑框 lint 划线——lintSettingsBody/lintMappingBody 纯函数
 只消费 dslLint 既有出口（禁改 dslLint）；防抖统一件（SearchSandboxView 同款） */
import { lintSettingsBody, lintMappingBody, type Finding } from '../utils/dslLint';
import { useDebounceFn } from '../composables/useDebounceFn';
/* W2：pasteRaw 高度档循环统一件（useTierCycle 三件套：档值数组+usePref+cycle） */
import { useTierCycle } from '../composables/useTierCycle';
import { removeStoredRaw, writeStoredRaw } from '../utils/safeJson';
import { isMenuKey, menuKeyAnchor } from '../utils/menuKey';
import { rowArrowNav } from '../utils/rowNav';
import { usePopupList } from '../composables/usePopupList'; /* 复刻弹窗源索引 combobox（IndexPicker 同骨架，datalist 退役） */

/* 预填即 pretty：压缩单行 JSON 对人审阅障碍极大 */
function prettyJson(s: string): string {
  if (!s) return s;
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}
const STEPS = ['选索引', '审编 settings/mapping', '追平策略', '确认预览', '执行监控'];
const store = useAppStore();

/* ═══ 2026-11-21 对账批：超长 title 迁 Tip long 档 ═══
 监控步与最近作业表同文案两处（无锁切换/锁未生效）抽公共常量，改文案只动一处；
 ETA 公式同理。原生 title 超 60 字符不换行不可滚（Tip 组件契约）。 */
const SWITCHED_NO_LOCK_TIP = '失锁后仍执行了别名切换——另一实例可能在切换窗口内继续写源索引，数据一致性需人工核对';
const LOCK_INACTIVE_TIP = '分布式锁未生效（lock.enabled=false 或未抢到锁）——本次重建没有跨实例互斥保护，请确认没有其他实例在同时重建同一索引';
const ETA_FORMULA_TIP = '预计剩余 =（total − created − updated）/ 速率（估算值，随监控轮询采样刷新；速率缺失时不显示）';

/* 期望配置页外链（宿主 client 侧 /internal/es/index/desired-state.html 自包含单页，
 与 api 请求同 EP 前缀、同集群目标）——步①「业务应用 → desired-state.html」此前只有文案无入口 */
function openDesiredState() {
  if (isBrowserMode) return;
  window.open(EP + '/desired-state.html', '_blank', 'noopener');
}

/* 原始 IO 快查——探测（评估）与托管重建（执行）分节共用，
 取记录环最近一条 /adhoc-rebuild/ 记录开弹窗。
 W3 判空口径统一（546 裁决=notify 不开空弹窗，rawIoPave546 六视图同款
 形态同步更新）：无记录 notify 引导并返回，不再以空 rec 开弹窗（EmptyState 仍归 RawIoModal
 自身兜底）；last('/adhoc-rebuild/') 特征子串逐字保留（rawIo545 spec 字面锁）。
 步②审编校验走 /config-lab/validate（不在 /adhoc-rebuild/ 特征下）——
 last 取数扩回退链：托管链无记录时回落 config-lab 记录（rawIo545 锁同步更新） */
const rawIoShow = ref(false);
const rawIoRec = ref<RawIoRec | null>(null);
function openRawIo() {
  const rec = ioRecorder.last('/adhoc-rebuild/') ?? ioRecorder.last('/config-lab/');
  if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }
  rawIoRec.value = rec;
  rawIoShow.value = true;
}

/* settings/mapping 对照可调工作台声明（拖拽/预设/记忆由 WorkbenchLayout 统一负责） */
const arEdScope = { target: store.target || 'host', route: '/adhoc', mode: 'arEditors', profile: 'standard' as const };

/* 手动模式 settings/mapping 对照（与 411 自动派生模式同款语义） */
const arManualScope = { ...arEdScope, mode: 'arManual' };
/* w80:sized+flex 混合——两组全 flex pane 时中缝拖不动(两侧互相让位),settings 给数值档、
 mapping 吃 flex,柄拖动语义恢复(BE_PANES 参数 260/编辑 flex 同构先例)。
 W4：竖排标题轨退役（/DevToolsView 先例）——title 置空即不渲染，
 settings/mapping 标题语义落各 pane 行首横排（.ar-manual-lb / .ed-col .ed-label，sec-t 档） */
const AR_MANUAL_PANES: WorkbenchPaneSpec[] = [
  { id: 'adhoc.manual-settings', role: 'request', title: '', minSize: 260, defaultSize: 320, collapsible: true },
  { id: 'adhoc.manual-mapping', role: 'response', title: '', minSize: 260, defaultSize: 'flex', collapsible: true },
];
const AR_ED_PANES: WorkbenchPaneSpec[] = [
  { id: 'adhoc.settings', role: 'request', title: '', minSize: 260, defaultSize: 320, collapsible: true },
  { id: 'adhoc.mapping', role: 'response', title: '', minSize: 260, defaultSize: 'flex', collapsible: true },
];
/* 权限门禁——托管重建发起/中止/确认切换=REBUILD 档（rank3+）；
 只读角色可看向导与监控（评估/探测是只读 POST），不给出扳机 */
const auth = useAuthStore();
const canOps = computed(() => auth.canEndpoint('ops', 'POST', '/internal/es/index/adhoc-rebuild/start', store.target));
/* 作业归属（后端 1007）：中止/确认切换是用户级不可逆动作，仅创建者本人或 ADMIN；
   legacy 无 owner 的升级前作业维持连接级语义。同连接同事仍可观测进度。 */
const jobOwner = computed(() => String((job.value as any)?.ownerUsername || '').trim());
const canMutateJob = computed(() => {
  if (!canOps.value) return false;
  if (!jobOwner.value) return true;
  if (auth.isAdmin()) return true;
  return jobOwner.value === (auth.me?.username || '');
});
/* 校验独立权限面：配置校验页写端点（可能与 start 的 ops 档不同权） */
const canValidate = computed(() =>
  auth.canEndpoint('write', 'POST', '/internal/es/index/config-lab/validate', store.target)
  || auth.canEndpoint('ops', 'POST', '/internal/es/index/adhoc-rebuild/start', store.target));
/* 拉取源配置的回退补拉通道 cluster/inspect 是共享读端点（索引/映射/搜索/配置校验/托管
 重建任一页读键可见，与后端 SHARED_READ_PAGES 同源）——纯连接模型缺页时补拉必 403，
 doStart/doAbort 同款闸（探测 prep 快照路径零网络不受闸） */
const canPullSrc = computed(() => auth.canEndpoint('write', 'GET', '/internal/es/index/cluster/inspect', store.target));
/* 期望配置页是宿主 client 侧静态单页（浏览器 window.open 直开不携连接目标头，恒按
 宿主/静态页授权裁决）——纯连接模型点开必得 403 裸页，钮面禁用先给引导；
 探测完成前不禁用（OverviewView 宿主页预判同款，独立部署首屏入口不闪断） */
const canDesiredState = computed(() => !isBrowserMode && (!auth.probed
  || auth.canEndpoint('write', 'GET', EP + '/desired-state.html', 'host')));
/* 草稿：向导全程草稿（按集群目标隔离）。粘贴/审编/表单字段挂载时读一次、
 之后只写不读——切页/失焦/重挂载后现场可复原；doPrepare/校验/prepare 失败不清稿
 （机制保证：只有显式 reset 或改回默认值才清）。 */
/* w45:向导草稿不按集群隔离——粘贴的期望配置/索引名/策略/步骤是用户意图,与顶栏目标
 无关;此前按 target 分键,「host 态粘贴→切生产→稿消失→反复重粘」正是体感最差的来源。
 集群相关风险由 w44 的「Dry-run 实测于:<集群>」行自查。 */
const adhocScope = { route: 'adhoc' };
const indexName = useScopedDraft('index-name', adhocScope).text;
/* 草稿与顶栏全局选中是两份状态（写类视图不开 useIdxState follow， 白名单口径）。
 「初始化回填」刻意不做 setup 一次性读——那会把「全新进入」误判成「有现场」
 （adjudicateEntry 的 hasRestoredScene 以 indexName 非空为据，w29 P2 的开新流程
 契约会被静默改道 resumeScene）；全新进入的全局回落已由 adjudicateEntry ③ 承担。
 这里只补「进页后/空稿时」的缝隙：pickedIdx 真实变化且草稿为空 → 回填（只补空，
 用户已输/已恢复的稿永不覆写，w29 P6 同一条红线）。 */
watch(() => store.pickedIdx, (v) => {
  if (v && !indexName.value) indexName.value = v;
});
/* 「用当前索引」钮的显式覆盖语义（有稿时也在，点击即以顶栏选中为准）随钮迁入
 PickCurrentIdxBtn 统一件——本视图只承接 @pick 回填（改用，就地函数退役） */
/* +1：审编步与手动模式四个编辑框挂 dsl-assist——字段源并轨 useIndexFields
 全站字段源标准（源索引视角：嵌套 a.b.c 与 multi-field 全量在场），bodyKind 按
 settings/mapping 分档（MappingView mpMappingAssist/mpSettingsAssist 先例）。
 字段清单在 doPrepare 探测时同点预载（幂等+缓存，失败零降级=无候选）。
 四个 assist 对象 setup 作用域常量声明——模板内联对象箭头经 _ctx 代理每次渲染换引用，
 Monaco provider 会反复重注册（IndexHub 渗透 spec 红灯实证）。 */
const { fields: arIdxFields, ensure: ensureArFields } = useIndexFields(() => indexName.value);
const arAssistFields = () => arIdxFields.value;
const arSettingsAssist = { fields: arAssistFields, bodyKind: () => 'settings' as const };
const arMappingAssist = { fields: arAssistFields, bodyKind: () => 'mapping' as const };
const arManualSettingsAssist = { fields: arAssistFields, bodyKind: () => 'settings' as const };
const arManualMappingAssist = { fields: arAssistFields, bodyKind: () => 'mapping' as const };
/* W4：粘贴区 Monaco 补全（轨1 残面 R6）——只挂字段候选不传 bodyKind：
 粘贴的是业务期望配置，settings/mapping 形态任意，挂档必误导；lint 也不挂（原文保持零侵入，
 四 JsonArea 框已各自 lint）。字段源并轨 arAssistFields（doPrepare 探测时同点预载） */
const pasteAssist = { fields: arAssistFields };
/* ═══ W2：粘贴编辑器四档高度循环（useTierCycle 三件套 + usePref 落盘，
 ConfigValidatorView 535 W9 同款范式）═══
 默认档=原 min(60vh, 420px) 字面保底（改动前后默认形态高度行为一致），档值升序循环、
 全部为确定解（CSS min() 定高直接绑定，无 min-height 叠加、无 height:100%+静态兄弟）；
 大粘贴场景（千行 mapping）随档撑高，落盘刷新/回页保持 */
const PASTE_H_TIERS: string[] = ['min(60vh, 420px)', 'min(70vh, 560px)', 'min(80vh, 700px)', 'min(92vh, 860px)'];
const { v: pasteH, cycle: cyclePasteH } = useTierCycle('adhoc.pasteH', PASTE_H_TIERS);
/* ═══ ：粘贴导入弹窗 JsonArea 四档高度循环（useTierCycle 统一件，adhoc.pasteH
 同范式同族：60/70/80/92vh 梯，px 封顶随原 600 档同谱系 120px 步进）═══
 默认档=原 min(60vh, 600px) 字面保底（525 W10 弹性档默认形态零漂移），大粘贴场景随档撑高，
 usePref 落盘（adhoc.piH），刷新/回开弹窗保持 */
const PI_H_TIERS: string[] = ['min(60vh, 600px)', 'min(70vh, 720px)', 'min(80vh, 840px)', 'min(92vh, 960px)'];
const { v: piH, cycle: cyclePiH } = useTierCycle('adhoc.piH', PI_H_TIERS);
/* ═══ P1：settings/mapping 四编辑框高度档（useTierCycle 统一件，pasteH/xm.cfgRows 同范式）═══
 原 rows=8/14 写死且 fill 态下 rows 纯装饰（height:100% 接管）——四页唯一高度锁死编辑面。
 四框摘 fill 改 rows 驱动：档值 8/16/28/44 循环，Monaco 高度=rows*19+16 纯内容函数确定解
 （红线：档位驱动 rows、禁 rAF 反馈，零触）；默认 16 档 ≈ 原 40vh 视口弹性档视觉，
 双入口（手动 hd「高」+ 审编卡头「高度」）同一落盘键 adhoc.edH，四框同档联动 */
const ED_ROWS_TIERS = [8, 16, 28, 44];
const { v: edRows, cycle: cycleEdRows } = useTierCycle('adhoc.edH', ED_ROWS_TIERS, 16);
const settingsDraft = useScopedDraft('settings', adhocScope);
const mappingDraft = useScopedDraft('mapping', adhocScope);
const pasteDraft = useScopedDraft('paste-raw', adhocScope);
const destIndex = useScopedDraft('dest-index', adhocScope).text;
/* 目标名建议带时间戳，跨会话恢复会指向旧索引或撞名（实测恢复出 9 天前的
   *_adhoc_2026... 目标名）。进入向导一律清空，由本次 prepare 重新生成；
   用户随后手改的目标名只在本次会话内有效，切源索引也立即作废。 */
const AUTO_DEST_RE = /_adhoc_\d{14}$/;
destIndex.value = '';
/* 换源索引 = 换一轮重建：上一索引的目标名不能跟着走。 */
watch(indexName, () => { destIndex.value = ''; });
const strategy = useScopedDraft('strategy', adhocScope, 'INCREMENTAL').text;
const timeField = useScopedDraft('time-field', adhocScope).text;
/* 时间字段下拉（NSelect）options：首档空串=「不指定」（INCREMENTAL 档带必填副文案，
 与原 option 逐字同源）；候选由探测 timeFieldCandidates map（getter 闭包内引用后置
 声明的 prep——渲染期求值时已初始化） */
const timeFieldOpts = computed(() => [
  { label: '（不指定' + (strategy.value === 'INCREMENTAL' ? ' —— INCREMENTAL 必填' : '') + '）', value: '' },
  ...(prep.value?.timeFieldCandidates || []).map((c: any) => ({ label: `${c.field} (${c.type})`, value: c.field })),
]);
const settingsJson = settingsDraft.text;
const mappingJson = mappingDraft.text;
const pasteRaw = pasteDraft.text;
/* w68:手动 settings/mapping 输入(不经业务侧 JSON,直接贴) */
const manualSettings = useScopedDraft('manual-settings', adhocScope).text;
const manualMapping = useScopedDraft('manual-mapping', adhocScope).text;

/* ═══ P1：settings/mapping 四编辑框 lint 划线接线（SearchSandboxView 范式逐字）═══
 useDebounceFn 250ms + JsonArea setMarkers 透传口 + info→hint 降级（MonacoEditor 结构类型
 只收 warning/hint/error）；档路由：settings 框→lintSettingsBody、mapping 框→lintMappingBody
 （dslLint 纯函数只消费）；非法 JSON 不 lint——JsonArea 合法性圆点已报。四框共用一条防抖
 尾值队列（任一框击键 250ms 后四框统一重估，空框静默清 marker） */
const setJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const mapJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const manualSetJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
const manualMapJaRef = ref<InstanceType<typeof JsonArea> | null>(null);
/* 粘贴区 Monaco ref（K2 五编辑面 Ctrl+I 第一面；@execute 见模板） */
const pasteMcRef = ref<InstanceType<typeof MonacoEditor> | null>(null);

/* ═══ ：五编辑面 Ctrl+I 唤起补全（IndexHubView 1平移，Kibana 控制台同键）═══
 经 getEditor expose 出口（MonacoEditor 组件本体 / JsonArea 转发通道）拿内层 Monaco——组件零触。
 monaco 包走回调内动态 import：本页行为锁 spec（adhocDiffWiring 等）vi.mock MonacoEditor
 「斩断 monaco 导入链」不能被静态链拉进真 monaco。happy-dom stub 无 getEditor/addCommand
 出口 → 守卫跳过（DevToolsView 同口径）。 */
type CtrlIHost = { getEditor?: () => any };
function wireCtrlI(host: Ref<CtrlIHost | null>) {
  watch(host, (mc) => {
    if (!mc) return;
    nextTick(() => {
      const ed = mc.getEditor?.();
      if (!ed || typeof ed.addCommand !== 'function') return;
      void import('monaco-editor/esm/vs/editor/editor.api').then((m) => {
        ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyI, () => {
          ed.trigger('', 'editor.action.triggerSuggest', null);
        });
      }).catch(() => { /* 测试 stub 面/包缺失时静默：补全仍有 Ctrl+Space 既有键 */ });
    });
  }, { immediate: true });
}
wireCtrlI(pasteMcRef);
wireCtrlI(manualSetJaRef);
wireCtrlI(manualMapJaRef);
wireCtrlI(setJaRef);
wireCtrlI(mapJaRef);
function parseArBody(t: string): Record<string, unknown> | null {
  if (!t.trim()) return null;
  try {
    const o = JSON.parse(t);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch { return null; }
}
const queueArLint = useDebounceFn(() => {
  const mark = (r: { value: any }, text: string, lint: (o: unknown) => Finding[]) => {
    const o = parseArBody(text);
    const findings = o ? lint(o) : [];
    r.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));
  };
  mark(setJaRef, settingsJson.value, lintSettingsBody);
  mark(mapJaRef, mappingJson.value, lintMappingBody);
  mark(manualSetJaRef, manualSettings.value, lintSettingsBody);
  mark(manualMapJaRef, manualMapping.value, lintMappingBody);
}, 250);
watch([settingsJson, mappingJson, manualSettings, manualMapping], () => queueArLint(), { immediate: true });

const highlightIdxInput = ref(false);
/* F2：索引选择行容器——applyManual 缺索引名时滚动定位的可靠锚点。
 原先全仓 querySelector 依赖的 .xm-idx-focus-target 根本不存在（恒 miss 后
 落到 document 级 .row .inp，而本视图输入框类是 ipt/ixp-inp，落点不可控）。 */
const idxRowEl = ref<HTMLElement | null>(null);
/* F2：索引名缺失的常驻红字。toast 10s 即消、新手找不到要看哪里；
 模板条件带 !indexName —— 一旦填上名字立即熄灭，不需要额外 watch */
const needIndexForManual = ref(false);
/* w69:双 Tab 模式切换 */
const inputMode = ref<'paste' | 'manual'>('paste');
const draftRestored = computed(() => settingsDraft.restored.value || mappingDraft.restored.value
  || pasteDraft.restored.value);
function clearDrafts() {
  settingsDraft.clear(); mappingDraft.clear(); pasteDraft.clear();
}
const route = useRoute();
const router = useRouter();
/* 索引芯片跳转 + jobId 复制（Xmigrate 同范式） */
function gotoIdx(idx?: string) { if (idx) router.push({ path: '/indices', query: { idx } }); }
function copyJobId(id: string) {
  copyText(id).then(ok => store.notify(ok ? 'success' : 'error', ok ? 'jobId 已复制' : '复制失败'));
}
/* 监控步错误行点击复制完整原文（显示层是友好化摘要，取证需原文） */
function copyJobErr() {
  const raw = String(job.value?.error || '');
  if (!raw) return;
  copyText(raw).then(ok => store.notify(ok ? 'success' : 'error', ok ? '错误详情原文已复制' : '复制失败'));
}

/* 向导 step 落 sessionStorage，切页返回不再弹回流程起点。
 注：草稿已迁 useScopedDraft（按集群目标隔离），旧 useDraft 通道已删。
 带 route.query.index 显式进入时 applyRouteContext 仍会重置流程（见其早返回），
 持久化只在裸路径返回时复原离开时的步骤。 */
const stepDraft = useScopedDraft('step', adhocScope, '0').text;
const step = computed({
  get: () => Number(stepDraft.value) || 0,
  set: (v: number) => { stepDraft.value = String(v); },
});
const preparing = ref(false);
const prepErr = ref(''); // 探测失败原因，供探测卡内联错误条展示
const prepErrRaw = ref<unknown>(null); // ：原始错误对象旁路（errMeta 读 code/endpoint，Xmigrate checkErrRaw 同款）
const prep = ref<any>(null);
/* A3：上一轮 prepare 的建议值快照——用于区分字段是「自动填的」还是「用户手改的」。 */
let lastPrepDest = '';
let lastPrepTimeField = '';

/* stripDsl 自动处置结果说明，常驻审编步顶部 */
const stripNote = ref('');

/* ═══ 确认预览步（step3）目标磁盘占用预估 ═══
 进入 step3 且探测到源物理名时异步调 api.reindexPreview（api.ts 既有端点，浏览器模式同构）。
 预估是增强信息而非门槛：拉取中显示轻量「估算中…」，失败静默降级（整行不渲染，
 不 toast 不阻断预览）；同一 source 记忆缓存，离开重进不重复拉，换源索引即失效重拉。 */
const previewEst = ref<{ estimatedTargetBytes?: number; docs?: number; avgDocBytes?: number } | null>(null);
const previewEstState = ref<'idle' | 'loading' | 'ok' | 'fail'>('idle');
let previewEstSource = '';
let previewEstSeq = 0;
watch(() => [step.value, prep.value?.sourcePhysical] as const, ([s, src]) => {
  const source = String(src || '');
  if (s !== 3 || !source || previewEstSource === source) return;
  previewEstSource = source;
  const seq = ++previewEstSeq;
  previewEstState.value = 'loading';
  previewEst.value = null;
  api.reindexPreview(source).then((r: any) => {
    if (seq !== previewEstSeq || previewEstSource !== source) return; /* 换源后旧包丢弃 */
    previewEst.value = r && typeof r === 'object' ? r : null;
    previewEstState.value = previewEst.value ? 'ok' : 'fail';
  }).catch(() => {
    if (seq !== previewEstSeq) return;
    previewEstState.value = 'fail'; /* 静默降级：不渲染、不播报 */
  });
});

/* 审编步内嵌校验 —— ERROR 不放行，防止带病配置进入重建 */
const validating = ref(false);
/* ═══ ：校验/启动两执行链接 useQueryRun（IndexHub 三链 P0-A 同范式）═══
 api.adhoc.start/api.configLab.validate 签名无 signal 参（api.ts 禁改），signal 落
 「竞态丢弃」消费：begin 即作废上一轮控制器（queryRunRace382 竞态语义随身）——
 旧轮响应返回时 signal.aborted 置位即丢弃，不写状态不推进 step，防旧覆盖新
 （审编步 Enter/主钮连触场景）。控制面无手动取消钮：abort 只断前端等待而后端可能
 已受理，取消面仅保留竞态丢弃，读秒照显（valSecs/startSecs 消费）。 */
const valQr = useQueryRun();
const startQr = useQueryRun();
const valSecs = computed(() => (valQr.elapsedMs.value / 1000).toFixed(1));
const startSecs = computed(() => (startQr.elapsedMs.value / 1000).toFixed(1));
/* w41:校验报告也进草稿——此前是内存态,切页/重挂载即丢,用户回来要重点校验才能再看报告
 (「又要重新点」的真正来源)。报告只读展示用,持久化后回来即见失败原因。
 用 {report} 包装:T extends object 不接受 null,包一层保持可空语义。 */
const valReportDraft = useScopedDraftState<{ report: any }>('val-report', adhocScope, { report: null });
const valReport = computed({
  get: () => valReportDraft.state.value.report,
  set: (v: any) => { valReportDraft.state.value = { report: v }; },
});

/* 状态徽标统一 pill+statusColor（自造 st-tag/st-* 色档退役）。
 W4：本页两档扩展（SUCCEEDED 补 g / ABORTED 中性 n）已上提进
 format.ts statusColor 枚举，jobStatusColor 页内特例退役——调用处直连 statusColor。 */

/* 建议回补 DSL 裸 pre → highlightJson 高亮（先 pretty；输出已转义，v-html 安全） */
const backfillHtml = computed(() => {
  const raw = String(job.value?.report?.suggestedBackfillDsl || '');
  if (!raw) return '';
  let pretty = raw;
  try { pretty = JSON.stringify(JSON.parse(raw), null, 2); } catch { /* 非 JSON 原样展示 */ }
  return highlightJson(pretty);
});

/* 回补 DSL 一键复制（RawIoModal copyReq 三行手法平移）——直切策略人工回补高频 */
async function copyBackfillDsl() {
  const ok = await copyText(String(job.value?.report?.suggestedBackfillDsl || ''));
  store.notify(ok ? 'success' : 'error', ok ? '回补 DSL 已复制' : '复制失败：浏览器拦截了剪贴板');
}

/* ═══ ：报告「一键移除」——issue.fix(REMOVE_SETTING) 的确认后执行体 ═══
 校验识别出的未知/被拒 settings 键（UNKNOWN_SETTING_KEY / dry-run unknown setting），
 确认门通过后由 removeSettingKey 共享内核改写审编框；取消或键已不在都如实反馈。 */
async function applyFixRemoveSetting(iss: any) {
  const key = String(iss?.fix?.key || '').trim();
  if (!key) return;
  const ok = await askConfirm({
    title: '一键移除 settings 键',
    message: `将从审编框 settings 中移除键 "${key}"（校验识别为未知/被目标集群拒绝的配置）。`,
    level: 'warn',
    okText: '移除',
  });
  if (!ok) return;
  const r = removeSettingKey(settingsJson.value, key);
  if (!r.ok) {
    store.notify('error', r.error || '移除失败');
    return;
  }
  settingsJson.value = r.json || '';
  store.notify('success', `已移除 "${key}"；建议重新点「仅校验」确认`);
}

/* ═══ ：报告「一键补充」——issue.fix(ADD_SETTING) 的确认后执行体 ═══
 ES 指路式限制错误（ngram diff 超限等）识别出 settings 缺治理键——源索引带着
 该键建成，粘贴期望配置整体替换后丢失。确认门通过后由 addSettingKey 共享内核
 改写审编框；取消/JSON 损坏都如实反馈。 */
async function applyFixAddSetting(iss: any) {
  const key = String(iss?.fix?.key || '').trim();
  if (!key) return;
  const value = iss?.fix?.value != null ? String(iss.fix.value) : '';
  if (!value) {
    store.notify('warning', '该错误未解析出建议值，请人工确认键值后手填');
    return;
  }
  const ok = await askConfirm({
    title: '一键补充 settings 键',
    message: `将向审编框 settings 补充键 "${key}" = ${value}（校验识别出的缺失限制键，源索引正是带着它建成的）。`,
    okText: '补充',
  });
  if (!ok) return;
  const r = addSettingKey(settingsJson.value, key, value);
  if (!r.ok) {
    store.notify('error', r.error || '补充失败');
    return;
  }
  settingsJson.value = r.json || '';
  store.notify('success', `已补充 "${key}" = ${value}；建议重新点「仅校验」确认`);
}

async function doValidateConfig(advance: boolean) {  /* 权限执行体首行门：覆盖 Enter/程序化通道（按钮 v-if 之外） */
  if (!canValidate.value) { store.notify('warning', '校验需配置校验页或托管重建写权限'); return; }
  validating.value = true;
  const signal = valQr.begin(); /* ：begin 即作废上一轮（queryRunRace382 竞态语义随身） */
  try {
    valReport.value = await api.configLab.validate(
      settingsJson.value.trim() || undefined,
      mappingJson.value.trim() || undefined,
      true,
    );
    /* 旧轮竞态丢弃——signal.aborted 置位说明已有新一轮在校验，不写状态不推进 */
    if (signal.aborted) return;
    if (advance) {
      if (valReport.value.valid && valReport.value.dryRunPassed !== false) {
        step.value = 2;
      } else {
        store.notify('error', '配置校验未通过，请先修复问题（重建中途建索引失败代价更大）');
      }
    }
  } catch (e: any) {
    store.notify('error', friendlyApiError(e) || '校验请求失败'); /* ：裸 e.message → friendlyEsError */
  } finally {
    valQr.finish();
    validating.value = false;
  }
}

/* w80:追平缓冲/破坏性选项并入草稿(与 step/strategy 同稿口径)——此前 bufferMs/deleteOldIndex/
 confirmDirectSwap/pauseBeforeSwitch/expectedFromPaste 是内存 ref,刷新续场后「切换前人工确认门」
 无声关闭(粘贴流 pickPaste 置 pauseBeforeSwitch=true,刷新即丢),用户在不知情下自动翻别名。 */
const bufferMsDraft = useScopedDraft('buffer-ms', adhocScope, '120000');
const bufferMs = computed<number>({
  get: () => { const n = Number(bufferMsDraft.text.value); return Number.isFinite(n) && n >= 0 ? n : 120000; },
  set: (v: number) => { bufferMsDraft.text.value = String(v); },
});
/* +1：追平缓冲失焦钳制——负数/非数字一律归 0（min=0 挡 UI 步进，
 手输负值由这里兜住，后端按 ms 等待，负值语义不明） */
function clampBufferMs() {
  const n = Number(bufferMs.value);
  bufferMs.value = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}
/* NInputNumber 桥接：number|null ↔ 草稿数值（空值回落 0，与 clampBufferMs 同兜底） */
const bufferMsModel = computed<number | null>({
  get: () => bufferMs.value,
  set: (v) => { bufferMs.value = v == null ? 0 : Math.round(v); },
});

/* ═══ 执行参数草稿（限流/slices，bufferMs 同款 useScopedDraft 口径）═══
 两者都按「缺省不发键」协议组装请求体：空/-1/auto 不进 start body（后端缺省即
 不限流/auto 并行），只有正数限流与 >=1 整数 slices 才落键。非法值红字常驻+启动双门。 */
const tuningRpsDraft = useScopedDraft('tuningRps', adhocScope);
/* NInputNumber 桥接：组件 emit number|null，草稿域仍存串（'-1'/'500' 原样可逆） */
const tuningRpsModel = computed<number | null>({
  get: () => { const n = Number(tuningRpsDraft.text.value); return tuningRpsDraft.text.value !== '' && Number.isFinite(n) ? n : null; },
  set: (v) => { tuningRpsDraft.text.value = v == null ? '' : String(v); },
});
const rpsRaw = computed(() => tuningRpsDraft.text.value.trim());
const rpsErr = computed(() => {
  if (rpsRaw.value === '' || rpsRaw.value === '-1') return '';
  const n = Number(rpsRaw.value);
  return Number.isFinite(n) && n > 0 ? '' : '限流需为正数，-1 或留空表示不限';
});
/* 合法限流值：null=不发键（空/-1 不限），正数=发 requestsPerSecond */
const rpsNum = computed<number | null>(() => (!rpsErr.value && rpsRaw.value !== '' && rpsRaw.value !== '-1' ? Number(rpsRaw.value) : null));
/* slices：''（auto 缺省）或 >=1 整数字符串；「自定义」档位是内存态（切回 auto 不清数字稿，
 方便切回），草稿恢复出非空值即自动落自定义档 */
const tuningSlicesDraft = useScopedDraft('tuningSlices', adhocScope);
/* NInputNumber 桥接（tuningRpsModel 同构） */
const tuningSlicesModel = computed<number | null>({
  get: () => { const n = Number(tuningSlicesDraft.text.value); return tuningSlicesDraft.text.value !== '' && Number.isFinite(n) ? n : null; },
  set: (v) => { tuningSlicesDraft.text.value = v == null ? '' : String(v); },
});
const tuningSlicesCustom = ref(tuningSlicesDraft.text.value.trim() !== '');
const tuningSlicesMode = computed<'auto' | 'custom'>({
  get: () => (tuningSlicesCustom.value ? 'custom' : 'auto'),
  set: (v: string) => { tuningSlicesCustom.value = v === 'custom'; },
});
const slicesRaw = computed(() => tuningSlicesDraft.text.value.trim());
const slicesErr = computed(() => {
  if (!tuningSlicesCustom.value) return '';
  const n = Number(slicesRaw.value);
  return slicesRaw.value !== '' && Number.isInteger(n) && n >= 1 ? '' : 'slices 需 >=1，或选 auto';
});
/* 合法 slices 值：null=不发键（auto），>=1 整数=发数字 */
const slicesNum = computed<number | null>(() => (!slicesErr.value && tuningSlicesCustom.value ? Number(slicesRaw.value) : null));
/* slices 档位下拉（NSelect）options：setup 作用域常量（monacoLanguagePenetration 渗透
 spec 同口径——模板内联对象每次渲染换引用）；档值与 tuningSlicesMode computed 同源 */
const SLICES_MODE_OPTS = [
  { label: 'auto（自动）', value: 'auto' },
  { label: '自定义数字', value: 'custom' },
];
const tuningInvalid = computed(() => !!rpsErr.value || !!slicesErr.value);
/* 步 3 预览回显一行（与请求体组装同源；缺省态给「未限流/slices auto」人话） */
const tuningSummary = computed(() =>
  `${rpsNum.value != null ? `限流 ${fmtNum(rpsNum.value)} docs/s` : '未限流'} · slices ${slicesNum.value != null ? slicesNum.value : 'auto'}`);
/* 布尔选项草稿桥：勾选='1'（落盘），取消=默认 ''（等价清除，不残留陈稿） */
const delOldDraft = useScopedDraft('delete-old-index', adhocScope);
const deleteOldIndex = computed<boolean>({
  get: () => delOldDraft.text.value === '1',
  set: (v: boolean) => { delOldDraft.text.value = v ? '1' : ''; },
});
const confirmSwapDraft = useScopedDraft('confirm-direct-swap', adhocScope);
const confirmDirectSwap = computed<boolean>({
  get: () => confirmSwapDraft.text.value === '1',
  set: (v: boolean) => { confirmSwapDraft.text.value = v ? '1' : ''; },
});
/* 切换前人工确认门。粘贴流默认开启（诉求：等待完成再手动确认），手工流默认关 */
const pauseSwitchDraft = useScopedDraft('pause-before-switch', adhocScope);
const pauseBeforeSwitch = computed<boolean>({
  get: () => pauseSwitchDraft.text.value === '1',
  set: (v: boolean) => { pauseSwitchDraft.text.value = v ? '1' : ''; },
});

/* / spec 无 timeField 的 WRITE_BLOCK 走 earlyBlock 全程挡写
 （AdhocRebuildService:235），窗口 = 全量 reindex 全程，必须二次确认才放行。 */
const ackFullBlock = ref(false);
const needAckFullBlock = computed(() => strategy.value === 'WRITE_BLOCK' && !timeField.value);
const canStart = computed(() => !needAckFullBlock.value || ackFullBlock.value);

/* sem-rm 智能纠错：目标物理索引名即时校验——非法字符/大写走 utils/indexNameRule 共享口径
 （ReindexAdvanced destIndexErr 同源）；直连模式下目标=源物理名意味着切换将删除源索引
 本身（核武级配错），即时红字前置警示。
 别名形态下同名不拦（物理名=别名名的场景由别名探测卡已有 warn 语义覆盖）。 */
const destNameErr = computed(() => {
  const name = destIndex.value.trim();
  if (!name) return '';
  const base = indexNameProblem(name);
  if (base) return base;
  if (prep.value && !prep.value.isAlias && name === prep.value.sourcePhysical) return '目标索引名与源物理索引同名——直连模式下切换将删除该索引本身，请换名（如加 -v2 后缀）';
  return '';
});

/* -9 / I-1：改动阻断窗口的两个输入（strategy / timeField）后，上一轮的「已知悉」失效。
 场景：用户在无 timeField 下勾了「接受全程挡写」，回退到策略步选了个 timeField
 （窗口从「全量 reindex 全程」缩到「一轮追平」），又把它清空 —— 此时窗口重新变回
 全程，而 ackFullBlock 仍是 true，警示条一闪而过、按钮直接可点。
 人确认的是「这个大小的窗口我接受」，不是「以后所有窗口我都接受」；
 输入一变，那份确认就不再对应当前事实，必须重新征得。
 （reset() 里的复位是另一回事，那是「再来一轮」的整体清场，管不到同一轮内的改动。） */
watch([strategy, timeField], () => { ackFullBlock.value = false; });

/* 粘贴解析。硬要求：失败必须给出具体原因，且不清空用户已填的表单、不静默回落——
 静默失败会让人以为预填成功了，拿着旧的 settings 去执行重建。 */
const pasteErr = ref('');
const pasteWarn = ref('');   // 警告独立于错误，二者可并存
const pastePicked = ref('');
const pasteList = ref<Array<Record<string, any>>>([]);
const pasteIdx = ref(-1);
/* w80：自动探测幂等游标——同一 alias 只在粘贴选中时自动 doPrepare 一次（见 pickPaste 尾注） */
let lastAutoPreparedAlias = '';
/* #68：粘贴来的期望 mapping 原文，与 mappingJson 分开存。
 mappingJson 是**审编框**——未粘贴时 doPrepare 会把源索引现状写进去，
 届时它装的是「实际」而不是「期望」。拿它当期望会得到一屏假 same。
 这一份只由 pickPaste 写入，缺席时为 ''，语义单一。
 w80：入草稿——它是 cfgDiff 的期望侧源头，刷新续场后丢失会静默变出一屏假 same。 */
const expectedFromPaste = useScopedDraft('expected-mapping', adhocScope).text;
/* 本条 mapping 是否来自注解推导（而非业务侧 @Mapping 原文）。
 只影响提示文案与界面标记，不改审编框内容的用法。 */
const mappingFromDerived = ref(false);

/* ═══ ：手动模式「拉取源配置」（与审编步「粘贴导入」互补双入口）═══
 粘贴导入是「外部期望」，这里是「源现状」：优先吃向导步骤①已探测的 prep 快照
 （prep.settingsJson/mappingJson，零网络），未探测（或探测回 null）时现场
 api.clusterInspect(indexName, 0) 补拉——DslQueryView preloadMapping 同通道；
 解包对齐 ConfigValidatorView doImport（settings/mappings 按索引名键控，取首键）。
 显式用户动作 + askConfirm 确认覆盖：确认通过才写 manualSettings/manualMapping 两个
 草稿 ref（挂载初值与自动预填链零触碰——adhocManualWorkbench426/draftGovernance 口径），
 pretty 口径与 doPrepare 预填一致（prettyJson）。 */
const pullingSrc = ref(false);
async function pullSourceToManual() {
  /* 权限执行体首行门（拉取钮已随 canPullSrc 禁用，此处覆盖程序化通道；doStart/doAbort
     同款）——仅约束会发网络的回退补拉分支，本地 prep 快照路径确认窗随后照常 */
  if (!canPullSrc.value) { store.notify('warning', '拉取源配置需索引、映射、搜索、配置校验或托管重建任一页读权限'); return; }
  if (!indexName.value) { store.notify('warning', '先在上方选择要重建的索引名，才能拉取源配置'); return; }
  /* 闸置位前移到确认窗之前（xmigrateGateExport941 同族口径）：确认窗+clusterInspect 在途全程拉取钮
     :disabled="pullingSrc || !canPullSrc" 即禁用，二击不再穿透双开确认窗；取消路径由 finally 复位防闸死。 */
  if (pullingSrc.value) return;
  pullingSrc.value = true;
  try {
    const ok = await askConfirm({
      title: '拉取源配置到手动编辑框',
      message: `将用源索引「${indexName.value}」当前的 settings / mapping 覆盖两个手动编辑框（已填内容会被覆盖）。`,
      level: 'warn',
      okText: '覆盖填入',
    });
    if (!ok) return;
    let sRaw = prep.value?.settingsJson || '';
    let mRaw = prep.value?.mappingJson || '';
    if (!sRaw && !mRaw) {
      try {
        const r = await api.clusterInspect(indexName.value, 0);
        const firstIdx = Object.keys(r?.settings || {})[0] || Object.keys(r?.mappings || {})[0];
        if (!firstIdx) throw new Error('未取到索引配置');
        sRaw = JSON.stringify(r.settings?.[firstIdx] || {});
        mRaw = JSON.stringify(r.mappings?.[firstIdx] || {});
      } catch (e: any) {
        store.notify('error', '拉取源配置失败：' + (friendlyApiError(e) || '索引不存在或不可达'));
        return;
      }
    }
    manualSettings.value = prettyJson(sRaw);
    manualMapping.value = prettyJson(mRaw);
    store.notify('success', '已拉取源索引配置填入手动编辑框，可继续修改后「应用并进入审编」');
  } finally {
    pullingSrc.value = false;
  }
}

function applyManual() {
  const s = manualSettings.value.trim();
  const m = manualMapping.value.trim();
  const errs: string[] = [];
  if (s) {
    try { JSON.parse(s); } catch (e) { errs.push('settings 不是合法 JSON: ' + String((e as Error).message).slice(0, 60)); }
  }
  if (m) {
    try { JSON.parse(m); } catch (e) { errs.push('mapping 不是合法 JSON: ' + String((e as Error).message).slice(0, 60)); }
  }
  if (errs.length) {
    store.notify('error', errs.join('; '));
    return;
  }
  if (s) settingsJson.value = prettyJson(s);
  if (m) mappingJson.value = prettyJson(m);
  if (!indexName.value) {
    /* F2/w77:滚动到索引输入框 + 高亮边框 — 引导式修正而非仅弹 toast(toast 10s 即消,新手找不到要看哪里)。
 首选本组件的索引选择行（ref 锚点,落点确定）;
 document 级两条链按 F2 要求保留为兜底(选择器修复为「索引选择区输入框」路径)。 */
    const el = idxRowEl.value?.querySelector('input')
      || document.querySelector('.ar-input-tabs')?.nextElementSibling?.querySelector('.inp')
      || document.querySelector('.row .inp');
    (el as HTMLElement | null)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    highlightIdxInput.value = true;
    needIndexForManual.value = true;
    setTimeout(() => { highlightIdxInput.value = false; }, 2500);
    store.notify('warning', '手动配置已暂存 — 请先在下方选择要重建的索引名');
    return;
  }
  store.notify('success', '手动配置已应用' + (s ? '(settings)' : '') + (m ? (s ? '+' : '') + '(mapping)' : '') + '，进入审编步');
  step.value = 1;
}

function applyPaste() {
  pasteErr.value = '';
  pasteWarn.value = '';
  pastePicked.value = '';
  pasteList.value = [];
  pasteIdx.value = -1;
  expectedFromPaste.value = '';
  mappingFromDerived.value = false;  const raw = pasteRaw.value.trim();
  if (!raw) { pasteErr.value = '粘贴内容为空'; return; }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    pasteErr.value = '不是合法 JSON：' + String((e as Error).message).slice(0, 120);
    return;
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const bad = list.findIndex(r => !r || typeof r !== 'object' || !(r as any).alias);
  if (bad >= 0) {
    pasteErr.value = `第 ${bad + 1} 项缺少 alias 字段（期望配置必须含读写别名）`;
    return;
  }
  /* -9 / M-1：settingsJson 缺失是**警告**不是错误，与 mappingJson 同构。
 核实结论（IndexMetaRegistry:95-98 readAnnotationPath）：实体没有 @Setting 时
 getSettingPath 返回 null → readAnnotationPath 直接返回 null → payload 里
 settingsJson 就是 null（RebuildableIndexMeta:44 的注释也明写「可能为 null」）。
 即「有 @Mapping 但没 @Setting」是完全合法的实体形态，而原来的 !settingsJson
 会把它整条**拒绝**，人只能回去手抄 —— 粘贴入口对一类合法输入直接关门。
 ""（空文件）同理。两者都退化成「按 ES 默认建索引」，
 与 mappingJson 为 null 的处置一致，故降级为警告（由 pickPaste 逐条产出）。 */
  pasteList.value = list as Array<Record<string, any>>;
  pickPaste(0);
}

/* ═══ ：步骤②「粘贴导入」——原始 JSON 一手进，识别只拆壳不改值 ═══
 与 Mapping 页「原始 JSON → 复制全部」形成跨页闭环：复制 → 跳托管重建 → 粘贴 → 秒拆双框。
 不走 applyPaste 的业务侧期望配置链路（那条要求 alias 字段），这里是**索引配置原文**直通审编框。 */
const pasteImportOpen = ref(false);
const pasteImportText = ref('');
/* 裸 textarea 退役，ref 换 JsonArea 实例——聚焦走其 expose 的 focus()（转发 Monaco） */
const pasteJaEl = ref<InstanceType<typeof JsonArea> | null>(null);
async function openPasteImport() {
  pasteImportOpen.value = true;
  await nextTick();
  pasteJaEl.value?.focus();
}

/* ═══ ：步骤②「从集群复刻」——跨集群结构直拉（与粘贴导入并列的第三入口）═══
 源=连接中心已存档案（目录本身已按可见性过滤，凭据不出前端），走既有
 xb.fetch-config（服务端 connId 取密 + restoreMaskedAnalyzers 还原插件组件名；
 浏览器模式 browserXmigrate 直连源档案同契约）。settings 为白名单精选，
 系统只读键/null 不会进入——从源头绕开手动拷贝 GET 原文的清理负担。 */
const cloneImportOpen = ref(false);
const cloneConnId = ref('');
const cloneIndex = ref('');
const cloneBusy = ref(false);
/* 源集群索引清单（快速点选）：openCloneImport 选定档案即拉，换源重拉（旧清单是
 上一个源的产物）；失败不阻塞——手输兜底，弹窗内如实提示原因 */
const cloneIndices = ref<any[]>([]);
const cloneIdxLoading = ref(false);
const cloneIdxError = ref('');
const cloneConnOpts = computed(() =>
  store.conns.map(c => ({ label: `${c.name}（${c.host}:${c.port}）`, value: c.id })));
async function loadCloneIndices(connId: string) {
  if (!connId) { cloneIndices.value = []; return; }
  cloneIdxLoading.value = true;
  cloneIdxError.value = '';
  try {
    cloneIndices.value = await api.xb.connectCheck({}, connId) || [];
  } catch (e) {
    cloneIndices.value = [];
    cloneIdxError.value = '索引清单拉取失败（' + (e instanceof Error ? e.message : String(e)) + '），可直接手输索引名';
  } finally {
    cloneIdxLoading.value = false;
  }
}
watch(cloneConnId, v => { cloneIndices.value = []; void loadCloneIndices(v); });
/* 源索引名 combobox（datalist 退役）：候选=清单按当前输入过滤；Enter 三段语义——
 有候选回填并直接拉取（点选/键盘等价），无候选或面板关透发 doCloneFetch（手输兜底） */
const cloneIdxItems = computed<string[]>(() => {
  const kw = cloneIndex.value.trim().toLowerCase();
  const names = cloneIndices.value.map((it: any) => String(it.index));
  return kw ? names.filter((n: string) => n.toLowerCase().includes(kw)) : names;
});
const {
  open: cloneIdxOpen, cursor: cloneIdxCursor, popStyle: cloneIdxPopStyle,
  listId: cloneIdxListId, itemId: cloneIdxItemId,
  rootEl: cloneIdxRootEl, listEl: cloneIdxListEl,
  openPanel: cloneIdxOpenPanel, close: cloneIdxClose, onKey: onCloneIdxKey,
} = usePopupList<string>({
  items: () => cloneIdxItems.value,
  onChoose: name => chooseCloneIdx(name),
  onEnter: () => { void doCloneFetch(); },
  to: () => false, /* 就地渲染：嵌 n-modal 场景（IndexPicker to=false 先例） */
  idPrefix: 'arclone',
  activeSelector: '.ar-clone-item.act',
});
function onCloneIdxInput(e: Event) {
  cloneIndex.value = (e.target as HTMLInputElement).value;
  cloneIdxCursor.value = 0;
  if (!cloneIdxOpen.value) cloneIdxOpenPanel();
}
function chooseCloneIdx(name: string) {
  cloneIndex.value = name;
  cloneIdxClose();
  void doCloneFetch();
}
function openCloneImport() {
  cloneImportOpen.value = true;
  /* 默认选第一个可用档案：源集群通常固定，省一步；选错可改（watch 自动重拉清单） */
  if (!cloneConnId.value) cloneConnId.value = cloneConnOpts.value[0]?.value || '';
  else void loadCloneIndices(cloneConnId.value);
}
async function doCloneFetch() {
  const idx = cloneIndex.value.trim();
  if (!cloneConnId.value || !idx || cloneBusy.value) return;
  cloneBusy.value = true;
  try {
    const r: any = await api.xb.fetchConfig({}, idx, cloneConnId.value);
    if (r && r.settings) settingsJson.value = prettyJson(String(r.settings));
    if (r && r.mapping) mappingJson.value = prettyJson(String(r.mapping));
    cloneImportOpen.value = false;
    const connLabel = cloneConnOpts.value.find(o => o.value === cloneConnId.value)?.label || cloneConnId.value;
    store.notify('success', `已从 ${connLabel} 复刻 ${idx} 结构；建议点「仅校验」确认后再继续`);
  } catch (e) {
    /* 失败不清审编框：原内容是用户现场，拉取失败不等于现场作废 */
    store.notify('error', '拉取失败：' + (e instanceof Error ? e.message : String(e)));
  } finally {
    cloneBusy.value = false;
  }
}
/* 输入即解析（同步纯函数，微秒级无需防抖）——所见即所认 */
const pastePreview = computed<ParsedEsConfig | null>(() =>
  pasteImportText.value.trim() ? parseEsConfigPaste(pasteImportText.value) : null);

function doPasteImport() {
  const r = parseEsConfigPaste(pasteImportText.value);
  if (!r.ok) { store.notify('error', r.error || '无法识别粘贴内容'); return; }
  /* 填入走 prettyJson（与 doPrepare 预填同一 pretty 口径）；值本身解析前后的对象等价——校准不重写 */
  if (r.settings) settingsJson.value = prettyJson(JSON.stringify(r.settings));
  if (r.mappings) mappingJson.value = prettyJson(JSON.stringify(r.mappings));
  store.notify('success', '已导入：' + (r.notes || []).join('；') + '；建议点「仅校验」确认后再继续');
  pasteImportOpen.value = false;
  pasteImportText.value = '';
}

/* Mapping 页「发送到托管重建」直通消费——sessionStorage 契约（REBUILD_HANDOFF_KEY），
 零剪贴板参与必然成功；直达审编步并自动解析拆填。mounted 与 KeepAlive activated 双口消费。 */
const REBUILD_HANDOFF_KEY = 'esquerystudio.rebuild-paste';
function consumeRebuildHandoff() {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(REBUILD_HANDOFF_KEY); } catch { return; }
  if (!raw) return;
  removeStoredRaw(sessionStorage, REBUILD_HANDOFF_KEY);
  const r = parseEsConfigPaste(raw);
  if (!r.ok) { store.notify('error', r.error || '直通内容无法识别'); return; }
  if (r.settings) settingsJson.value = prettyJson(JSON.stringify(r.settings));
  if (r.mappings) mappingJson.value = prettyJson(JSON.stringify(r.mappings));
  if (step.value < 1) step.value = 1;
  store.notify('success', '已从 Mapping 页直通导入：' + (r.notes || []).join('；') + '；建议点「仅校验」确认后再继续');
}

/** 缺失判定：null / undefined / 纯空白都算「业务侧没声明」，与 的 null 透传同构 */
function isAbsent(v: unknown): boolean {
  return v == null || String(v).trim() === '';
}

function pickPaste(i: number) {
  const r = pasteList.value[i];
  if (!r) return;
  pasteIdx.value = i;
  indexName.value = String(r.alias);
  /* -9 / M-1：settingsJson 可能为 null（实体无 @Setting）。
 不能直接 String(r.settingsJson) —— String(null) 是字符串 "null"，
 会被当成一份内容为 null 的配置塞进表单，再送进校验/重建。
 与 mappingJson 的处置对称：缺失即空串，让人看到「这里没有配置」。 */
  settingsJson.value = isAbsent(r.settingsJson) ? '' : prettyJson(String(r.settingsJson));
  /* mapping 三态。业务侧无 @Mapping 时，starter 会把**注解推导**出的那份放进
 payload 的 derivedMappingJson —— 它才是重建实际会应用的 mapping
 （IndexNameResolver.resolveMappingJson 第②级）。宿主 没有接入方的实体类、
 无法自己推导，只能用这份。不读它的话，这里会退化成「没有 mapping」，
 doPrepare 随后把**源索引现状**写进审编框，代码声明的字段类型就静默丢了。 */
  mappingFromDerived.value = isAbsent(r.mappingJson) && !isAbsent(r.derivedMappingJson);
  const effectiveMapping = isAbsent(r.mappingJson) ? r.derivedMappingJson : r.mappingJson;
  mappingJson.value = isAbsent(effectiveMapping) ? '' : prettyJson(String(effectiveMapping));
  /* #68：期望侧另存一份。与 mappingJson 同源同值，但**不会**被 doPrepare 的预填覆盖，
 故 cfgDiff 永远拿的是「业务侧声明」而不是「ES 现状」。
 缺席仍是 ''（isAbsent 已把 null / 空白归一），C-1 的 null 判据照常生效。 */
  expectedFromPaste.value = mappingJson.value;
  strategy.value = 'WRITE_BLOCK';
  pauseBeforeSwitch.value = true;   // 粘贴流默认开人工确认门
  pastePicked.value = String(r.indexKey || r.alias);
  /* 「未声明 mapping / settings」是**警告**不是错误：预填其实成功了。塞进 pasteErr 会因
 模板里 err/ok 互斥而把「已预填」藏掉，使用者看到红字会判定粘贴失败、而表单已被改写——
 那是撒谎的界面。 裁定 mappingJson 为 null 原样透传，此路径必然会走到；
 settingsJson 同样可能为 null（IndexMetaRegistry:95-98，实体无 @Setting），见 M-1。
 两条警告可并存 —— 逐条产出而不是在 applyPaste 里拼一次，
 否则数组多选时切到另一条会把警告冲掉，人以为这条没问题。 */
  pasteWarn.value = [
    /* 三态。原来只分「有/无 mappingJson」，把「无 @Mapping 但有注解推导」也
 说成「将由 ES 动态推断」—— 那是假话，重建会用推导出的那份。 */
    mappingFromDerived.value
      ? '提示：该索引未声明 @Mapping，已采用业务侧注解推导的 mapping（payload 的 derivedMappingJson）—— 它就是重建实际会应用的那份，请照常审阅'
      : isAbsent(r.mappingJson)
        ? '注意：该索引未声明 mapping、也推导不出，重建后将由 ES 动态推断字段类型，请确认这是预期行为'
        : '',
    isAbsent(r.settingsJson)
      ? '注意：该索引未声明 settings，重建后将按 ES 默认值建索引（分片/副本等），请确认这是预期行为'
      : '',
  ].filter(Boolean).join('；');
  loadDateRisks(r);
  /* w80：粘贴成功即自动探测——pasteIdx 已置位，doPrepare 的「粘贴优先」守卫会保住
 刚填入的期望配置，只补 prep（源物理名/文档数/时间字段候选）。
 幂等守卫：同一 alias 只自动探一次，重复点击同一 chip / 多条清单来回切不重复打探测；
 换 alias（多索引清单另选）或 reset 清场后重新粘贴才再探。手动「探测」钮不受限。 */
  const alias = String(r.alias);
  if (alias !== lastAutoPreparedAlias) {
    lastAutoPreparedAlias = alias;
    void doPrepare();
  }
}

/* ── ：date 兼容风险报告（──────────────────────────────────
 粘贴的 payload 带 fields / mappingParsed / sdesVersion，加上 ES 侧的存储形态采样，
 就能查 实测矩阵给出精确判定。判定全在 utils/dateRisk 的纯函数里，此处只负责
 **取数与展示** —— 不在这里解析 mapping、不在这里排序、不在这里编文案。 */
const riskRows = ref<RiskRow[]>([]);
const sampledCount = ref(0);
const samplingMode = ref('');
const riskBusy = ref(false);
const riskErr = ref('');

async function loadDateRisks(picked: Record<string, any>) {
  /* 切换竞态守卫：守卫锚=选中粘贴对象的**身份**（pasteIdx 数值跨 applyPaste 轮会复用，
   值比对会被「重贴后仍选第 0 条」骗过）。chip 连切/整单重贴/reset 清场后，旧采样回包
   落定时选中已漂移则整包丢弃——成功/catch/finally 三支同口径；过期支跳过 finally
   复位，故 reset 侧须显式清 riskBusy（防采样钮卡死）。 */
  const stillPicked = () => pasteList.value[pasteIdx.value] === picked;
  riskRows.value = [];
  riskErr.value = '';
  sampledCount.value = 0;
  samplingMode.value = '';
  const fields = Array.isArray(picked.fields) ? picked.fields : [];
  /* mappingParsed 是 **row 级**（DesiredStatePayload:40），不在 fields 上。
 缺席时按 false 处理：那会让依赖 mapping 的规则走「测不出」降级，
 而不是静默当成「mapping 读懂了」—— 后者会把一堆判定伪装成已确认。 */
  /* w26：体检判定必须与**实际采用的期望 mapping** 同源 —— pickPaste 已在
 mappingJson 缺席时回落 derivedMappingJson(注解推导,同样是重建会应用的那份),
 若仍拿 payload 的原始 mappingParsed=false,会把「derived 明明可用」误报成
 全字段测不出(80 字段刷屏的根因)。据此重算:采用文本能解析出对象型 properties 即可用。 */
  const adoptedMappingText = isAbsent(picked.mappingJson)
    ? (isAbsent(picked.derivedMappingJson) ? '' : String(picked.derivedMappingJson))
    : String(picked.mappingJson);
  let mappingParsed = false;
  try {
    const v = JSON.parse(adoptedMappingText);
    mappingParsed = !!(v && typeof v === 'object' && !Array.isArray(v) && typeof v.properties === 'object');
  } catch { /* 采用文本解析失败 → 维持 false,由 dateRisk 的 per-index 汇总条如实说明 */ }
  /* w27:文本也必须同源传 adopted —— w26 只同源了 mappingParsed 却仍把原始 null 喂给
 判定器,「mapping 可用但零键」的假象让每字段刷 2 条假警告(DYNAMIC/FIELD_NAME)。 */
  const mappingJson = adoptedMappingText || null;

  /* 移交一：**两个函数都要调**。FIELD_NAME_MISMATCH 只由 assessFieldNameMismatch 产出，
 只调 assessDateRisks 会让 的原始案例整类从界面上消失。合并与排序见 mergeRiskRows。 */
  const nameMismatches = assessFieldNameMismatch({ mappingJson, mappingParsed, fields });

  if (!picked.alias) {
    riskRows.value = mergeRiskRows([], nameMismatches);
    return;
  }
  riskBusy.value = true;
  try {
    const r = await api.dateForms(String(picked.alias), 50);
    if (!stillPicked()) return;
    sampledCount.value = Number(r?.sampled || 0);
    samplingMode.value = String(r?.sampling || '');
    riskRows.value = mergeRiskRows(
      assessDateRisks({
        mappingParsed,
        fields,
        /* 端点的 forms（计数树）→ 判定函数的 forms。端点另有一棵 samples 树装样例值，
 两者**不可混淆**（dateRisk.ts 顶注专门拆开过这个命名）。 */
        forms: r?.forms || {},
        sdesVersion: picked.sdesVersion ?? null,
      }),
      nameMismatches,
    );
  } catch (e: any) {
    if (!stillPicked()) return;
    /* 采样失败不阻断粘贴流程，但必须说清「判定不完整」，不许静默当成无风险。
 不依赖采样的那几条（字段名对不齐等）照常展示。 */
    riskRows.value = mergeRiskRows([], nameMismatches);
    riskErr.value = '采样失败，无法判定存储形态：' + friendlyApiError(e);
  } finally {
    if (stillPicked()) riskBusy.value = false;
  }
}

/* 期望 vs 实际比对。prepare 返回源索引现状，与粘贴来的期望做字段级 diff。
 注意 prep.mappingJson 已由 EsIndexAdmin.getMapping → unwrapTypeLayer 剥掉 6.x 的
 type 包层（EsIndexAdmin:165，EsResponseShapeTest 锁定），两侧同为 typeless
 {"properties":...}，此处**不要**再做任何 _doc 处理，否则整棵 mapping 会坍缩。

 #68：cfgDiff 由「期望文本 + 探测结果」派生（见下方 computeDiffRows 顶注），
 不再是一个要靠调用点记得写的 ref —— 粘贴与探测无论谁先谁后都自动重算。 */
const cfgDiff = computed<ConfigDiffRow[]>(() => computeDiffRows(expectedFromPaste.value, prep.value));
const cfgSum = computed(() => diffConfigSummary(cfgDiff.value));

/* 分区呈现——真差异默认展开、等价噪声默认折叠。
 分区逻辑在 partitionDiffRows（已测），此处只持有开合状态。 */
const cfgParts = computed(() => partitionDiffRows(cfgDiff.value));
const benignOpen = ref(false);

/* kind→人话标签、added 提示挂载点已提到 utils/configDiffView.ts 并由真实
 diffConfig 输出驱动的断言看守（-9 / I-4）。模板直接调 kindLabel / kindNote。 */

function fmtVal(v: unknown): string {
  if (v === undefined) return '—';
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/* ═══ 两张只读表的行右键 ═══
 期望/实际差异表与轮次表此前只能看不能取——比对出「哪个字段类型不对」之后，
 要拿路径/值去改注解、贴工单或回给业务方，只能手拖选中再复制。
 一级只留最常用的「复制路径/复制行」，其余收进「复制…」二级（与全站右键同规矩）。
 两张表共用一个菜单状态：同一时刻只会有一个菜单开着。 */
const rowMenu = ref<{ x: number; y: number; title: string; kind: 'diff' | 'round'; row: any } | null>(null);
function openDiffMenu(e: MouseEvent, row: ConfigDiffRow) {
  rowMenu.value = { x: e.clientX, y: e.clientY, title: '差异 · ' + row.path, kind: 'diff', row };
}
function onDiffMenuKey(e: KeyboardEvent, row: ConfigDiffRow) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  rowMenu.value = { ...menuKeyAnchor(e), title: '差异 · ' + row.path, kind: 'diff', row };
}
function openRoundMenu(e: MouseEvent, r: any) {
  rowMenu.value = { x: e.clientX, y: e.clientY, title: '第 ' + r.round + ' 轮 · ' + (roundZh(r.phase) || r.phase), kind: 'round', row: r };
}
function onRoundMenuKey(e: KeyboardEvent, r: any) {
  if (!isMenuKey(e)) return;
  e.preventDefault();
  rowMenu.value = { ...menuKeyAnchor(e), title: '第 ' + r.round + ' 轮 · ' + (roundZh(r.phase) || r.phase), kind: 'round', row: r };
}
/* 轮次耗时取数：服务端 toMap 字段名 roundTookMs、浏览器编排记录为 tookMs——双字段兜底；
   非数/负值/缺省一律 null（不冒充 0ms），表格与右键 TSV 同源 */
function roundTookMsOf(r: any): number | null {
  const v = r?.roundTookMs ?? r?.tookMs;
  const n = Number(v);
  return v != null && Number.isFinite(n) && n >= 0 ? n : null;
}
async function copyWithToast(text: string, okMsg: string) {
  const ok = await copyText(text);
  store.notify(ok ? 'success' : 'error', ok ? okMsg : '复制失败');
}
const rowMenuItems = computed<CcmItem[]>(() => {
  const m = rowMenu.value; if (!m) return [];
  if (m.kind === 'diff') {
    const row = m.row as ConfigDiffRow;
    const line = [row.path, kindLabel(row.kind), fmtVal(row.expected), fmtVal(row.actual)].join('\t');
    return [
      { key: 'diff-copy-path', label: '复制路径', icon: Copy, run: () => copyWithToast(row.path, '已复制路径：' + row.path) },
      { key: 'diff-copy-row', label: '复制整行（TSV，可直接贴表格）', icon: ClipboardList, run: () => copyWithToast(line, '已复制差异行') },
      {
        key: 'diff-group', label: '复制…', icon: Copy, sep: true, children: [
          { key: 'diff-copy-expected', label: '复制期望值 JSON', icon: Braces, run: () => copyWithToast(JSON.stringify(row.expected ?? null, null, 2), '已复制期望值') },
          { key: 'diff-copy-actual', label: '复制实际值 JSON', icon: Braces, run: () => copyWithToast(JSON.stringify(row.actual ?? null, null, 2), '已复制实际值') },
          ...(row.reason ? [{ key: 'diff-copy-reason', label: '复制忽略原因', icon: Info, run: () => copyWithToast(String(row.reason), '已复制原因') }] : []),
        ],
      },
    ];
  }
  const r = m.row as any;
  const num = (v: unknown) => (v != null ? fmtNum(v) : '-');
  const took = roundTookMsOf(r);
  /* TSV 与表格列序同步（轮次/阶段/总计/已建/已更新/冲突跳过/耗时）——耗时以 ms 原值进表，机器可比对 */
  const line = [r.round, roundZh(r.phase) || r.phase, num(r.total), num(r.created), num(r.updated), num(r.versionConflicts), took != null ? String(took) : '-'].join('\t');
  return [
    { key: 'round-copy-row', label: `复制第 ${r.round} 轮数据（TSV）`, icon: ClipboardList, run: () => copyWithToast(line, `已复制第 ${r.round} 轮数据`) },
    { key: 'round-copy-json', label: `复制第 ${r.round} 轮 JSON`, icon: Braces, run: () => copyWithToast(JSON.stringify(r, null, 2), `已复制第 ${r.round} 轮 JSON`) },
    {
      key: 'round-group', label: '更多…', icon: Copy, sep: true, children: [
        { key: 'round-copy-phase', label: '复制阶段名（中文 + 英文原名）', icon: Info, run: () => copyWithToast(`${roundZh(r.phase) || r.phase}（${r.phase}）`, '已复制阶段名') },
        { key: 'round-copy-conflicts', label: '复制冲突数（版本冲突）', icon: ClipboardCopy, run: () => copyWithToast(String(r.versionConflicts ?? 0), '已复制冲突数') },
      ],
    },
  ];
});

/* -9 / C-1：没有期望就没有「期望 vs 实际」这回事。
 原实现在未粘贴时用 {} 当期望，与 ES 读回的整棵 mapping 比，产出几十上百条
 kind:'removed'，类别列写着「实际有，期望没有」—— 用户根本没提供任何期望，
 界面却断言「你的期望里没有这些字段」。

 根因不是少一个 if，而是用 {} 这个**合法值**表示「缺席」：{} 既可能是
 「没提供」也可能是「期望确实为空」。故判据取 parseExpectedMapping 返回的
 null（缺席），而不是「粘贴过没有」—— 粘了但该索引 mappingJson 为 null 时
 pasteIdx >= 0 成立而期望仍缺席，用 pasteIdx 当判据 C-1 会原样复发。
 详见 utils/configDiffView.ts 顶注。

 #68 / 次因：原实现是「computeDiff(p) 写 cfgDiff.value」，且**唯一**调用点在
 doPrepare 里。于是「先探测、后粘贴」这个完全自然的顺序恒不出行且界面零提示 ——
 期望侧后到，而没有任何东西会再算一次。修法不是补一个 watch 去追平两份状态
 （那等于把「何时重算」继续交给调用点记牢），而是把 cfgDiff 改成 computed：
 它由 mappingJson（期望）与 prep（实际）**共同派生**，两侧谁后到都会自动重算，
 顺序不再可能出错。少一个可写状态，也就少一处能忘记同步的地方。

 #68 / 派生化暴露出的一个**旧顺序在偷偷承担**的语义：未粘贴时 doPrepare 会把源索引
 现状**写进 mappingJson 这同一个框**（它既是「期望输入框」又是「预填结果框」）。
 老代码靠「在覆盖之**前**算一次」躲开，即顺序本身充当了判据。改成派生后这层保护没了：
 覆盖后期望文本 == 实际文本，会渲染出一整屏 kind:'same' —— 用户没提供任何期望，
 界面却报「你的期望与实际完全一致」，与 C-1 同类（拿一个并非期望的合法值冒充期望）。
 故判据显式化为 expectedFromPaste：**只有粘贴来的那份文本才是期望**。
 它与 C-1 的 null 判据是**与**的关系，不是替代 —— 粘了但该索引 mappingJson 为 null 时
 仍须缺席（ 的 null 透传路径，e2e 5-4 在跑）。 */
function computeDiffRows(expectText: string, p: any): ConfigDiffRow[] {
  const expectMapping = parseExpectedMapping(expectText);
  if (!shouldDiffMapping(expectMapping)) return [];
  /* 实际侧缺席（源索引无 mapping）退化成 {} 是**对的**：此时「期望有、实际没有」
 确实成立，added 行是真话。与期望侧缺席不对称，因为不对称的是语义本身。 */
  const actualMapping = parseExpectedMapping(String(p?.mappingJson ?? '')) ?? {};
  return diffConfig(expectMapping, actualMapping);
}

/* ── +1：源/目标 mapping 叶子级类型对比 ──────────────────────────
 探测后（prep 在场）用 useIndexFields(源) 与审编框 mappingJson 逐叶对比：
 源字段在目标缺失 / 类型变更 → 以 RiskRow 结构进既有 ar-risk 区（warning 档）；
 目标已置 dynamic:false 且有缺失时升 error（写入将吃 strict 映射拒绝，不只是降级）。
 mappingJson 为空（目标由 ES 动态推断）或不合法时静默不出行——非法 JSON 由
 校验步红字负责，这里不重复播报。对比行数封顶 100，防整树缺席刷屏。 */
function targetLeafTypes(text: string): { types: Map<string, string>; dynamicOff: boolean } | null {
  let root: any;
  try { root = JSON.parse(text); } catch { return null; }
  if (!root || typeof root !== 'object' || Array.isArray(root)) return null;
  const m = root.mappings?.properties ? root.mappings
    : root.properties ? root
      : (Object.values<any>(root).find(v => v && typeof v === 'object' && v.properties) || root);
  const types = new Map<string, string>();
  (function walk(props: any, prefix: string) {
    if (!props || typeof props !== 'object') return;
    for (const [name, def] of Object.entries<any>(props)) {
      const path = prefix ? prefix + '.' + name : name;
      if (def?.type) types.set(path, String(def.type));
      else if (def?.properties) types.set(path, 'object');
      if (def?.fields) for (const [sub, sd] of Object.entries<any>(def.fields)) types.set(path + '.' + sub, String(sd?.type || '?'));
      if (def?.properties) walk(def.properties, path);
    }
  })(m?.properties || {}, '');
  return { types, dynamicOff: m?.dynamic === false };
}

const destTypeRisks = computed<RiskRow[]>(() => destTypeRiskAll.value.slice(0, 100));
/* 截断前的真实总数：标题行计数与尾注都用它——封顶后 rows.length 冒充总数会低估规模 */
const destTypeRiskTotal = computed(() => destTypeRiskAll.value.length);
const destTypeRiskAll = computed<RiskRow[]>(() => {
  if (!prep.value || !mappingJson.value.trim()) return [];
  const t = targetLeafTypes(mappingJson.value);
  if (!t) return [];
  const rows: RiskRow[] = [];
  let missing = 0;
  for (const f of arIdxFields.value) {
    const dt = t.types.get(f.path);
    if (dt == null) {
      missing++;
      rows.push({
        code: 'DEST_FIELD_MISSING',
        level: t.dynamicOff ? 'error' : 'warning',
        field: f.path,
        reason: t.dynamicOff
          ? `源字段在目标 mapping 中缺失且目标已置 dynamic:false——重建后写入含该字段的文档将报 strict 映射错误`
          : `源字段在目标 mapping 中缺失——重建后将由 ES 动态推断类型，首写文档决定类型，可能与源不一致`,
        fix: `在目标 mapping 的 properties 中补上 "${f.path}": { "type": "${f.type}" }`,
      });
    } else if (dt !== f.type && dt !== 'object' && f.type !== 'object') {
      rows.push({
        code: 'DEST_FIELD_TYPE_CHANGED',
        level: 'warning',
        field: f.path,
        reason: `类型变更：源 ${f.type} → 目标 ${dt}——reindex 按目标类型重新解析，格式不符的文档将被丢弃`,
        fix: `确认目标类型正确，或改回 "${f.type}" 保持兼容`,
      });
    }
  }
  return rows;
});

/* 采样风险 + 源/目标类型对比并轨展示（error 档前置排序由 mergeRiskRows 提供） */
const displayRiskRows = computed<RiskRow[]>(() => mergeRiskRows(riskRows.value, destTypeRisks.value));

const starting = ref(false);
const job = ref<any>(null);

/* ═══ 失败文档样本（后端 toMap failures 数组，缺席=旧后端，不渲染不冒充）═══
 元素 {type, reason, index, id}，后端封顶 10 条；<6 条默认全展，>=6 条折叠只显前 5 +
 「展开全部 N 条」；条数变化（轮询刷新）按同一规则重置折叠态，不把上一轮的手动展开
 误带入新一轮样本 */
const failureSamples = computed<any[]>(() => (Array.isArray(job.value?.failures) ? job.value.failures : []));
const failuresCollapsed = ref(false);
/* ═══ 失败聚类 top-N：样本逐条前 10 仍可能多类混叠（mapping 冲突/版本冲突/超时…），
   按「type + reason 首行」归一为聚类键先给分布——「N 类 · top3：类型 x 计数（占比）」
   胶囊行一眼判读主因；点开看分组明细（每组计数+首条完整样本），逐条样本列表保留在下方 ═══ */
interface FailureCluster { key: string; type: string; count: number; first: any }
/* 样本类型标签：type 缺失或空串一律兜底「未分类」（空串下 `?? 'unknown'` 不生效，界面会出空方括号 []） */
function failTypeLabel(f: any): string {
  return String(f?.type ?? '').trim() || '未分类';
}
/* 聚类键的首行归一：多行栈只取首行做键——同类错误的栈尾（线程/行号）各不相同，按全文聚类会退化成逐条；
   首行里的引号段（文档 id、出错取值等逐条不同的内容）整体换成占位 …，单双引号同占位，
   否则同一种错误会按 id 逐条成类。单引号只在行首或空白/开括号之后才算引号起点：英文所有格与
   缩写里的撇号（field's、can't）不是引号，当起点会把后面真正的引号段错配吞掉。
   归一只作用于聚类键，明细行展示的首条样本保持原文 */
function clusterHeadKey(f: any): string {
  const head = String(f?.reason ?? '').split('\n')[0].trim();
  return head.replace(/"[^"]*"|(^|[\s([:,=])'[^']*'/g, (_m, lead?: string) => (lead ?? '') + '…');
}
const failureClusters = computed<FailureCluster[]>(() => {
  const map = new Map<string, FailureCluster>();
  for (const f of failureSamples.value) {
    const type = failTypeLabel(f);
    const key = type + '|' + clusterHeadKey(f);
    const hit = map.get(key);
    if (hit) hit.count += 1;
    else map.set(key, { key, type, count: 1, first: f });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
});
const failureClusterTop = computed(() => failureClusters.value.slice(0, 3));
const failureClusterOpen = ref(false);
function clusterPct(c: FailureCluster): string {
  const total = failureSamples.value.length;
  return total > 0 ? Math.round((c.count / total) * 100) + '%' : '0%';
}
/* 首条完整样本：明细行展示全文（多行 reason 原样换行） */
function clusterHead(f: any): string { return String(f?.reason ?? ''); }
watch(() => failureSamples.value.length, (n) => { failuresCollapsed.value = n >= 6; failureClusterOpen.value = false; }, { immediate: true });
const visibleFailures = computed(() => (failuresCollapsed.value ? failureSamples.value.slice(0, 5) : failureSamples.value));
/* index/id 在场时附注（哪个索引的哪篇文档），两者皆缺返回空串不渲染括号 */
function failureWhere(f: any): string {
  return [f?.index, f?.id].filter(x => x != null && x !== '').join('/');
}
/* 宿主重启孤儿作业：FAILED 且 error 文案含「重启」——作业在宿主内存，重启即失联，
 目标索引保留未切换，唯一合理出路是回向导重新发起（reset 已清场） */
const orphanAfterRestart = computed(() =>
  job.value?.status === 'FAILED' && typeof job.value?.error === 'string' && job.value.error.includes('重启'));

/* w80：阶段徽标档——推进中（含 AWAIT_CONFIRM 等待放行）pill y 醒目；
 终态阶段 pill n 中性（作业终态本身已由状态 pill 承担色语义，阶段不抢戏） */
function stagePill(s: any): 'y' | 'n' {
  const v = String(s || '').toUpperCase();
  return ['DONE', 'SUCCEEDED', 'FAILED', 'ABORTED'].includes(v) ? 'n' : 'y';
}

/* 切换已确认（终追/收尾段）：别名切换已拍板，服务端对中止请求硬拒——前端先禁用中止钮，
 给出原因而不是等人点进去吃报错 */
const switchConfirmed = computed(() =>
  ['FINAL_CATCHUP', 'FINALIZE'].includes(String(job.value?.stage || '').toUpperCase()));

/* StatusPill tone 字面量收窄（BulkEditorView statusPillCls 同法）——
 statusColor/sevPill 返回 string，StatusPill 契约 tone 为五档联合，消费处显式收窄 */
function statusTone(s: any): 'g' | 'y' | 'r' | 'b' | 'n' {
  return statusColor(s) as 'g' | 'y' | 'r' | 'b' | 'n';
}
function sevTone(s: any): 'g' | 'y' | 'r' | 'b' | 'n' {
  return sevPill(s) as 'g' | 'y' | 'r' | 'b' | 'n';
}

/* W4：校验报告 severity → .pill 档映射收口 utils/esEnumZh 的 sevPill
 （error→r / warn→y / info→b / 兜底 n，critical→r），本地实现退役；
 ConfigValidatorView cvSevPill（err/warn/info 别名档）同步并入同源。 */

/* w80：SUCCEEDED 常驻「去查询验证」的数据源——优先作业回传的新索引名，
 回落向导内目标名/建议名（与 doConfirmSwitch toast action 同一深链口径） */
const verifiedTarget = computed(() =>
  job.value?.newIndex || job.value?.targetIndex || destIndex.value || prep.value?.suggestedDest || '');
function goVerifyFromJob() {
  const t = verifiedTarget.value;
  if (t) store.pick(t);
  router.push({ path: '/search', query: t ? { idx: t } : {} });
}

/* 全量 reindex 进度百分比（后端 awaitTask 每秒透出 currentProgress.created/total） */
function reindexPct(j: any): number {
  const p = j?.currentProgress;
  if (!p || !p.total) return 0;
  return Math.min(100, Math.round((p.created || 0) / p.total * 100));
}

/* ═══ W3：全量进度速率观测（XmigrateView rateOf 范式移植，Xm 文件零触碰）═══
 Σcreated 对时间差分：采样源=既有 useAutoRefresh 询（2s 一拍，零新增定时器）——
 watch currentProgress.created 相邻两次采样，差值/时间差 = docs/s；差分 ≤0（未推进/回读
 抖动）不出，不冒充速率。jobId 变更即重置采样基线（换作业不串差）。
 差分成功的拍同时推速率趋势环形窗（cap 60，XM_RATE_CAP 同口径：平段拍不推点，
 窗不被无推进采样灌满；jobId 换即清窗），SparkLine 消费该序列。 */
const rateSample = ref<{ ts: number; created: number } | null>(null);
const reindexRate = ref<number | null>(null);
const RATE_SPARK_CAP = 60;
const rateSpark = ref<number[]>([]);
let rateJid: unknown = null;
watch(() => [job.value?.jobId, job.value?.currentProgress?.created] as const, ([jid, created]) => {
  if (jid == null || typeof created !== 'number') { rateSample.value = null; reindexRate.value = null; rateJid = null; rateSpark.value = []; return; }
  if (jid !== rateJid) { rateJid = jid; rateSample.value = { ts: Date.now(), created }; reindexRate.value = null; rateSpark.value = []; return; }
  const prev = rateSample.value;
  const now = Date.now();
  if (prev && created > prev.created && now > prev.ts) {
    reindexRate.value = Math.round((created - prev.created) / ((now - prev.ts) / 1000));
    rateSpark.value = [...rateSpark.value.slice(-(RATE_SPARK_CAP - 1)), reindexRate.value];
  } else {
    reindexRate.value = null;
  }
  rateSample.value = { ts: now, created };
});

/* ═══ P2：预计剩余 ETA=(total−created−updated)/rate（速率观测行尾随段）═══
 速率=reindexRate 既有差分件；速率缺失/非正数、total 缺席、余量非正一律不出（不冒充）；
 结果 ms 交 TookBadge 四档语义徽标，随询采样刷新 */
const reindexEtaMs = computed<number | null>(() => {
  const p = job.value?.currentProgress;
  if (!p?.total || reindexRate.value == null || reindexRate.value <= 0) return null;
  const remain = Number(p.total) - Number(p.created || 0) - Number(p.updated || 0);
  if (!Number.isFinite(remain) || remain <= 0) return null;
  return Math.round((remain / reindexRate.value) * 1000);
});

/* 已耗时：运行中=now-startedAt（随询刷新，无自建心跳）；终态优先后端 tookMs，缺席用
 finishedAt-startedAt，两者都无 → null（模板走 '—' 档）。终态禁止 Date.now() 递增——
 作业已收尾而读数持续走字是撒谎的界面 */
const jobElapsedMs = computed<number | null>(() => {
  const j = job.value;
  const started = Number(j?.startedAt);
  if (j && j.status !== 'RUNNING') {
    if (j.tookMs != null && Number(j.tookMs) >= 0) return Number(j.tookMs);
    const fin = Number(j.finishedAt);
    if (Number.isFinite(started) && started > 0 && Number.isFinite(fin) && fin >= started) return fin - started;
    return null;
  }
  if (!Number.isFinite(started) || started <= 0) return null;
  return Math.max(0, Date.now() - started);
});
const allJobs = ref<any[]>([]);
/* 轮询合并 useAutoRefresh（Xmigrate 同范式）：KeepAlive 失活/页面隐藏/
 卸载全链停续，取代裸 setInterval + 手写可见性守卫；间隔沿用 2000ms。
 pollJobId 非空 =「有在跑的作业要盯」= ms>0；tick 内见到终态即置空停表。 */
const pollJobId = ref('');
/* 轮询连续失败计数（纯前端）：≥3 次在监控卡头部出示黄条（数据可能已过期），
 成功一拍即清零；上次成功时刻随首拍成功记录。监控数据过期时需要明确提示 */
const pollFailCount = ref(0);
const pollLastOkAt = ref<number | null>(null);
/* 作业清单随监控轮询低频同刷：2s × 15 拍 ≈ 30s 一次（并行作业的 stage/耗时
 不再在最近作业表内停更；jobsLoading 在途闸由 loadJobs 自守） */
let pollJobsRefreshTicks = 0;
const JOBS_REFRESH_EVERY_TICKS = 15;
const jobPoller = useAutoRefresh(async () => {
  const id = pollJobId.value;
  if (!id) return;
  pollJobsRefreshTicks += 1;
  if (pollJobsRefreshTicks >= JOBS_REFRESH_EVERY_TICKS) {
    pollJobsRefreshTicks = 0;
    /* 静默档：轮询触发的清单刷新失败由 jobsErr 错误卡与 poll-stale 黄条讲同一件事，
       再弹 toast 是三重示警噪音（ES 故障期每 30s 一条） */
    void loadJobs({ silent: true });
  }
  try {
    const j = await api.adhoc.status(id);
    if (pollJobId.value !== id) return; // 轮询目标已切：旧拍回包不得覆盖新作业状态
    /* 回包浅比较：status/stage/错误/进度计数未变不赋值——监控卡整棵子树的
       computed 依赖 job.value 引用，2s 一拍全量换身份是页面卡顿主源；
       签名覆盖监控卡显示面（stage 含 AWAIT_CONFIRM 停门档，停门变化必赋值） */
    const p0 = job.value?.currentProgress, p1 = j?.currentProgress;
    const unchanged = shallowEqFields(job.value, j, ['status', 'stage', 'error'])
      && Number(p0?.created ?? -1) === Number(p1?.created ?? -1)
      && Number(p0?.total ?? -1) === Number(p1?.total ?? -1);
    if (!unchanged) job.value = j;
    pollFailCount.value = 0;
    pollLastOkAt.value = Date.now();
    /* 事件时间线随监控轮询节流静默刷新（≥5s 一拍；静默档失败保旧数据不 toast），
       长作业过程事件（GATE_* 门禁轨迹等）不再停在首拍快照 */
    const nowMs = Date.now();
    if (nowMs - eventsSilentAt >= EVENTS_SILENT_MIN_MS) {
      eventsSilentAt = nowMs;
      void loadEvents(id, { silent: true });
    }
    if (j.status !== 'RUNNING') {
      /* w80：终态不在页内 notify——全局 jobTracker 对同一终态跃迁已发通知（见过在跑→终态弹一次），
       页内再弹一次是双 toast。这里只停表 + 刷最近作业列表，状态行由上方 pill 呈现终态 */
      stopPolling();
      loadJobs();
    }
  } catch {
    /* 网络抖动不打断轮询（下一轮重试），但连续失败要计数示警——静默会让监控读数被当成实时；
       切窗后旧拍失败不计数（否则污染新目标的过期示警） */
    if (pollJobId.value !== id) return;
    pollFailCount.value += 1;
  }
}, {
  ms: () => (pollJobId.value ? 2000 : 0),
  guard: () => !!pollJobId.value,
  /* 页面隐藏不弃守：30s 降频保拍，停门（AWAIT_CONFIRM）/终态跃迁在后台标签页
     仍能被轮询拍捕获并触发 useJobNotify（可见页 2s 拍语义不变；失活仍全停）；
     30s 只是放行间隔的下限——实际间隔受浏览器后台标签页定时器节流影响（约 ≥30s，可能更久） */
  hiddenMs: () => (pollJobId.value ? 30000 : 0),
});
jobPoller.setOn(true);

const TERMINAL = new Set(['SUCCEEDED', 'DONE', 'FAILED', 'ABORTED']);
const isTerminal = computed(() => !!job.value && TERMINAL.has(job.value.status));

/* ═══ 后台通知接线（useJobNotify，与跨集群迁移页共用偏好键 job-notify-v1）═══
   轮询拍检测两类跃迁：进 AWAIT_CONFIRM（停门，level gate——业务写入正被阻断且
   30 分钟未确认将超时自动放弃切换，文案必须带上这层后果）与进终态
   （done/failed/aborted）。检测挂 job 状态签名 watch——轮询 tick / doStart /
   watchJob / doAbort 回包都经 job.value 赋值，一处覆盖全部通道。useJobNotify
   内部自判 document.hidden（页面可见时用户在场，页内横幅/状态 pill 已承担示警，
   不重复弹桌面通知）且同 jobId+level 幂等，回前台自动停标题闪烁。 */
const {
  titleEnabled: notifyTitleOn, setTitleEnabled: setNotifyTitle,
  perm: notifyPerm, requestDesktop: requestNotifyDesktop, notify: notifyJob, resetJob: notifyResetJob,
} = useJobNotify();
/* 授权态绑定 composable 的响应式 perm（授权请求回执、回到页面时刷新）。
   denied 是浏览器层的终局拒绝（重授权只能去站点设置）——按钮就地禁用并说明，不让人空点；
   unsupported=环境无 Notification，同样禁用并说明（标题闪烁不受影响） */
const notifyDesktopDenied = computed(() => notifyPerm.value === 'denied');
const notifyDesktopUnsupported = computed(() => notifyPerm.value === 'unsupported');
const notifyDesktopTip = computed(() => notifyDesktopUnsupported.value
  ? '当前环境不支持桌面通知（标题闪烁提醒不受影响）'
  : notifyDesktopDenied.value
    ? '浏览器已拒绝本站桌面通知——需在浏览器站点设置中重新允许（标题闪烁不受影响）'
    : '申请桌面通知授权：页面在后台时停门/终态弹系统通知');
function onNotifyTitleToggle(v: boolean) { setNotifyTitle(!!v); }
async function onNotifyDesktopBtn() {
  const ok = await requestNotifyDesktop();
  store.notify(ok ? 'success' : 'warning', ok
    ? '已开启桌面通知：页面在后台时停门/终态将弹系统通知'
    : '未获得桌面通知授权（标题闪烁仍可用，无需授权）');
}
watch(() => [job.value?.jobId, job.value?.status, job.value?.stage] as const, ([jid, st, stage], old) => {
  if (!jid) return;
  const id = String(jid);
  const stNow = String(st || '').toUpperCase();
  const stageNow = String(stage || '').toUpperCase();
  /* 同一作业状态回到 RUNNING（重跑/续接沿用 jobId）= 新一轮生命周期：清掉该作业已发过的通知键，
     后续停门/终态可再提醒（幂等只在同一轮内去重） */
  if (stNow === 'RUNNING' && old?.[0] === jid && String(old[1] ?? '').toUpperCase() !== 'RUNNING') notifyResetJob(id);
  if (stNow === 'RUNNING' && stageNow === 'AWAIT_CONFIRM') {
    notifyJob(id, 'gate', `重建作业 ${id} 停在确认门：业务写入正被阻断，30 分钟未确认将超时自动放弃切换（按失败收尾），请回页确认或中止`);
  }
  if (TERMINAL.has(stNow) && !TERMINAL.has(String(old?.[1] ?? ''))) {
    const done = stNow === 'SUCCEEDED' || stNow === 'DONE';
    notifyJob(id, done ? 'done' : stNow === 'ABORTED' ? 'aborted' : 'failed', done
      ? `重建作业 ${id} 已完成：写入路由已切换到新索引`
      : stNow === 'ABORTED'
        ? `重建作业 ${id} 已中止：目标索引与已迁移数据保留，可重跑续接`
        : `重建作业 ${id} 失败：${friendlyApiError(job.value?.error) || '详见执行监控的错误信息'}`);
  }
});

/* 追平轮上限按策略：INCREMENTAL 最多 3 轮 range reindex 收敛；WRITE_BLOCK 单窗
   追平只有 1 轮——分母写死 3 会暗示还有后续轮，误导等待 */
const catchupMaxRounds = computed(() => (job.value?.strategy === 'INCREMENTAL' ? 3 : 1));

/* F1：作业执行中。status === 'RUNNING' 已涵盖 AWAIT_CONFIRM——后端等确认门时只翻
 stage（AdhocRebuildService:691 setStage(AWAIT_CONFIRM)）不翻 status，前端轮询也
 正是以 status==='RUNNING' 持续，此刻业务写入可能正被阻断，更得留一条回监控的出路。 */
const hasRunningJob = computed(() => !!job.value && job.value.status === 'RUNNING');

/* F1：步骤条点击。回退照旧（RUNNING 时回退可用是 adhocDiffWiring 的既有契约）；
 前向只放行「执行监控」一步——作业在跑时它是用户在任何位置都能一键回去的家。
 其余前向步骤仍锁：未经探测/校验不得跳页，流程不可倒灌。 */
function onStepChipClick(i: number) {
  if (isTerminal.value) return;
  if (i < step.value) { step.value = i; return; }
  if (i === STEPS.length - 1 && hasRunningJob.value && step.value !== i) step.value = 4;
}

/* 键盘可达：与 onStepChipClick 同一套放行规则——回退步与「返回执行监控」chip
 才是 button（Tab 可达、Enter/Space 触发），其余步骤 tabindex=-1 不进 Tab 序 */
function stepInteractive(i: number): boolean {
  if (isTerminal.value) return false;
  return i < step.value || canReturnToMonitor(i);
}

/* 监控 chip 的「可一键返回」视觉提示（虚线描边 + title），仅当人在别处且作业在跑 */
function canReturnToMonitor(i: number): boolean {
  return i === STEPS.length - 1 && step.value !== STEPS.length - 1 && hasRunningJob.value;
}

const strategyLabel = computed(() =>
  strategy.value === 'INCREMENTAL' ? 'A · 增量追平'
    : strategy.value === 'WRITE_BLOCK' ? 'B · 写阻断窗口' : 'C · 直切 + 回补报告');
/* 策略卡片整卡可点（NRadio 迁移后卡片容器是 div）：禁用档不响应；NRadio 自身点击冒泡
 * 到卡片时值已相同，幂等跳过（不与 NRadioGroup 抢写） */
function pickStrategy(v: string, disabled: boolean) {
  if (disabled || strategy.value === v) return;
  strategy.value = v;
}
/* 作业表 strategy 列中文（status/stage 列同款中文化；未收录枚举回退原值原样） */
function jobStrategyZh(s: any): string {
  const v = String(s || '');
  return v === 'INCREMENTAL' ? '增量追平' : v === 'WRITE_BLOCK' ? '写阻断窗口' : v === 'MANUAL' ? '直切+回补' : '';
}

/* prepare 世代守卫（本文件 watchJob watchSeq 同语言）：探测钮 disabled 是单通道闸，
 IndexPicker @picked 通道绕闸——探测在途换索引再探即双在途，无世代守卫时旧包后到
 覆写新 prep、旧失败 catch 把新成功 prep 清成 null。成功/catch/finally 三支同口径
 （raceGuard858 同款）：过期支整体丢弃且跳过 finally 复位（新在途轮持闸），reset 侧显式清场。 */
let prepSeq = 0;
async function doPrepare() {
  preparing.value = true;
  const seq = ++prepSeq;
  prepErr.value = '';
  prepErrRaw.value = null;
  ensureArFields(); /* +1：补全字段源同点预载（dsl-assist 候选 + 源/目标类型对比共用） */
  try {
    const p = await api.adhoc.prepare(indexName.value);
    if (seq !== prepSeq) return;
    prep.value = p;
    /* 粘贴来的期望配置**优先于**源索引预填。若在此无条件覆盖，
 使用者刚粘贴的 settings/mapping 会被源索引现状悄悄冲掉，
 他却以为正拿着业务侧声明的配置去重建——静默回落到旧配置正是本 Task 要堵的。 */
    if (pasteIdx.value < 0) {
      settingsJson.value = prettyJson(prep.value.settingsJson || '');
      mappingJson.value = prettyJson(prep.value.mappingJson || '');
    }
    /* A3：destIndex / timeField 只覆写「自动填充」的值（空，或仍等于上一轮建议——
 说明用户没碰过）。手改过的目标名/时间字段不许被再次探测冲掉，
 与上方「粘贴来的期望优先于源索引预填」是同一条红线。 */
    const sugDest = prep.value.suggestedDest || '';
    /* 自动建议名（*_adhoc_<14 位时间戳>）必须取当前这一轮的值；手写名才保留。 */
    if (!destIndex.value || destIndex.value === lastPrepDest || AUTO_DEST_RE.test(destIndex.value.trim())) {
      destIndex.value = sugDest;
    }
    lastPrepDest = sugDest;
    /* 同理：粘贴流已把 strategy 钉成 WRITE_BLOCK，不让探测结果改回去 */
    if (pasteIdx.value < 0 && !prep.value.timeFieldCandidates?.length) strategy.value = 'WRITE_BLOCK';
    const sugTf = prep.value.timeFieldCandidates?.[0]?.field || '';
    if (!timeField.value || timeField.value === lastPrepTimeField) timeField.value = sugTf;
    lastPrepTimeField = sugTf;
  } catch (e: any) {
    if (seq !== prepSeq) return;
    /* 裸 e.message → friendlyEsError（toast 与内联错误条同用一份人话文案） */
    const msg = friendlyApiError(e) || '探测失败';
    store.notify('error', msg);
    prepErr.value = msg;
    prepErrRaw.value = e; /* ：原始对象旁路（喂 errMeta 读 code/endpoint） */
    prep.value = null;
  } finally {
    if (seq === prepSeq) preparing.value = false;
  }
}

/* 所属别名 chip 一键换入口：把索引名换成该别名并立即重探。删除物理索引会连带断开其
 所属别名的成员关系，业务侧查询将失效——直连入口下这是用户最短的正确纠正路径。 */
function useAliasAsInput(alias: string) {
  indexName.value = alias;
  void doPrepare();
}

/* ═══ W10：timeField 智能预填（预填兼防呆）═══
 此前时间字段只在 doPrepare/resumeScene 探测点补位；策略步把策略切回 INCREMENTAL 时
 timeField 常为空，「下一步」被禁+红字拦截（346 门），用户得回下拉手动选。
 现落进 INCREMENTAL 档且字段为空时自动预填首位候选（候选唯一/首位=最佳，用户仍可改/清）。
 只盯 INCREMENTAL：WRITE_BLOCK 无 timeField 的「全程挡写警告+已知悉」是确认门语义
 （needAckFullBlock/ackFullBlock），预填会把它静默短路——零触碰。 */
watch(() => [strategy.value, prep.value?.timeFieldCandidates] as const, () => {
  if (strategy.value !== 'INCREMENTAL' || timeField.value) return;
  const first = prep.value?.timeFieldCandidates?.[0]?.field;
  if (first) timeField.value = first;
}, { immediate: true });

/* W10：步卡内单行 input Enter=该步主钮（无 form 包装，轻量函数分派）。
 守卫与主钮 disabled 逐一对应，disabled 时 Enter 静默（与钮同语义）；步骤条 chips
 既有 Enter/Space 键盘口径（adhocStepA11y/）不在此列、零触碰。 */
function destIndexEnter() {
  if (!validating.value) void doValidateConfig(true); /* 审编步主钮「校验并继续」 */
}
function strategyNextEnter() {
  if ((strategy.value !== 'INCREMENTAL' || !!timeField.value) && canStart.value) step.value = 3; /* 策略步主钮「下一步」 */
}

async function doStart() {
  /* 权限执行体首行门（启动钮已有 v-if，此处覆盖 Enter/程序化通道） */
  if (!canOps.value) { store.notify('warning', '重建操作需专项或 ADMIN 角色'); return; }
  /* sem-rm 智能纠错：目标名硬规则未过不放行（红字常驻审编步，这里兜底防绕过） */
  if (destNameErr.value) { store.notify('error', '目标索引名校验未通过——已阻止启动：' + destNameErr.value); return; }
  /* 执行参数（限流/slices）非法值不放行：红字常驻策略步，这里兜底防绕过（Enter/程序化通道） */
  if (tuningInvalid.value) { store.notify('error', '执行参数未通过校验：限流/slices 取值需修正后再启动'); return; }
  starting.value = true;
  const signal = startQr.begin(); /* ：begin 即作废上一轮（竞态丢弃防线） */
  try {
    const r = await api.adhoc.start({
      index: indexName.value,
      strategy: strategy.value,
      destIndex: destIndex.value || undefined,
      settingsJson: settingsJson.value || undefined,
      mappingJson: mappingJson.value || undefined,
      timeField: timeField.value || undefined,
      bufferMs: bufferMs.value,
      deleteOldIndex: deleteOldIndex.value,
      confirmDirectSwap: confirmDirectSwap.value,
      pauseBeforeSwitch: pauseBeforeSwitch.value,
      /* 执行参数「缺省不发键」：rpsNum/slicesNum 为 null（空/-1/auto/非法）时键整体缺席 */
      ...(rpsNum.value != null ? { requestsPerSecond: rpsNum.value } : {}),
      ...(slicesNum.value != null ? { slices: slicesNum.value } : {}),
    });
    /* 旧轮竞态丢弃——启动是控制面写操作，丢弃响应时提示以作业列表为准
 （后端可能已受理，UI 不假装未发生） */
    if (signal.aborted) { store.notify('warning', '启动响应已作废（后端可能已受理，以作业列表为准）'); return; }
    job.value = r.job;
    step.value = 4;
    startPolling(r.jobId);
    loadJobs();
  } catch (e: any) {
    store.notify('error', friendlyApiError(e) || '启动失败'); /* ：裸 e.message → friendlyEsError */
  } finally {
    startQr.finish();
    starting.value = false;
  }
}

function startPolling(jobId: string) {
  pollJobId.value = jobId;
  /* 换监控目标即换一份轮询计数：失败计数/上次成功时刻/清单刷新节拍都随新目标重新起算 */
  pollFailCount.value = 0;
  pollLastOkAt.value = null;
  pollJobsRefreshTicks = 0;
  /* setOn(true) 内部 start()：先停旧表再按当前 ms 排新表（幂等，防双表） */
  jobPoller.setOn(true);
}

function stopPolling() {
  pollJobId.value = '';
  watchSeq += 1; // 离开监控步/reset 后，在途 watchJob 回包整体过期——旧作业回包不得复活轮询
  pollFailCount.value = 0;
  pollJobsRefreshTicks = 0;
  jobPoller.stop();
}

async function doAbort() {
  /* 权限执行体首行门（中止钮已有 v-if，此处覆盖程序化通道） */
  if (!canMutateJob.value) {
    store.notify('warning', jobOwner.value && auth.me?.username !== jobOwner.value && !auth.isAdmin()
      ? `作业由 ${jobOwner.value} 创建：中止仅创建者本人或 ADMIN 可操作`
      : '重建操作需专项或 ADMIN 角色');
    return;
  }
  if (!job.value || aborting.value) return;
  /* 闸置位前移到确认窗之前（xmigrateGateExport941 同族口径）：确认窗挂起期中止钮
     :disabled="aborting" 即禁用，二击不再穿透双开确认窗（confirm.ts 全局单例覆写会把
     第一开按取消静默收掉）；取消路径由 finally 复位防闸死。 */
  aborting.value = true;
  try {
    /* 中止=删半成品新索引+回滚原索引，属破坏性动作：确认窗不提供「本次会话不再询问」 */
    if (!await askConfirm({
      level: 'warn',
      title: '中止重建作业',
      message: '将中止当前作业并 best-effort 取消 ES 侧 reindex task：已写入新索引的数据会保留，作业不可恢复继续，需重新发起。',
      okText: '中止作业',
    })) return;
    job.value = await api.adhoc.abort(job.value.jobId);
  } catch (e: any) { store.notify('error', friendlyApiError(e) || '中止失败'); } /* ：裸 e.message → friendlyEsError */
  finally { aborting.value = false; }
}

/* AWAIT_CONFIRM 期间业务写入正在被阻断，秒数必须自己跳动——
 静止的数字会让人低估已经挡了多久。

 -9 / I-2：原来接的是 useNow —— 那是 为「Xm 前」建的**分钟级**共享心跳
 （composables/useNow.ts:13 是 setInterval(..., 30000)），显示秒数会「7 秒」
 静止 30 秒再跳到「37 秒」，注释写着要跳动而实现没做到。
 useNow 的 30s 绝不能改：它是全站共享单例，NotifyCenter/DslQuery/History 三处在用，
 改成 1s 等于给全站白加 30 倍无谓重渲染。故本视图自建局部 1s 心跳。 */
const blockNow = ref(Date.now());
let blockTimer: any = null;

function startBlockTicker() {
  if (blockTimer) return;
  blockNow.value = Date.now();
  blockTimer = setInterval(() => { blockNow.value = Date.now(); }, 1000);
}

function stopBlockTicker() {
  if (blockTimer) { clearInterval(blockTimer); blockTimer = null; }
}

const confirming = ref(false);
const aborting = ref(false);
const blockedSec = computed(() => {
  const since = job.value?.awaitConfirmSince;
  return since ? Math.max(0, Math.round((blockNow.value - since) / 1000)) : 0;
});

/* ═══ 确认门截止倒计时（服务端 status 快照新字段 gateDeadlineMs，浏览器模式同构）═══
 * 剩余 mm:ss 随 blockNow 1s 心跳跳动；最后 5 分钟转警示红态；字段缺席（旧后端）不渲染，
 * 只保留既有正计时——两端字段都到位后统一渲染同一横幅 */
const gateLeftMs = computed<number | null>(() => {
  const d = Number(job.value?.gateDeadlineMs);
  return Number.isFinite(d) && d > 0 ? d - blockNow.value : null;
});
function fmtMmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
/* 轮询警示条的「上次成功」时刻——fmtHms 走 utils/format 单源（HH:mm:ss；非法值恒 '—'） */
const gateLeftText = computed(() => gateLeftMs.value == null ? '' : fmtMmss(gateLeftMs.value));
const gateUrgent = computed(() => gateLeftMs.value != null && gateLeftMs.value > 0 && gateLeftMs.value <= 5 * 60 * 1000);
const gateExpired = computed(() => gateLeftMs.value != null && gateLeftMs.value <= 0);

/* ═══ 一键重跑（FAILED/ABORTED）═══
 * 语义一句话随策略：增量（且有 timeField）= 从追平点续跑；否则 = 复用目标索引重跑全量。
 * 2026-11-21 对账批升级：重跑先开参数覆盖弹层（rps/slices/batchSize 三输入可选填，
 * 预填原值 + 清空后「沿用原值」占位；未填字段不进 overrides，后端按沿用处理） */
const retrying = ref(false);
function retrySemanticsHint(j: any): string {
  return (j?.strategy === 'INCREMENTAL' && j?.timeField)
    ? '增量重跑：目标索引存活时从追平点续跑（range 重放，幂等覆盖）'
    : '全量重跑：复用目标索引重发全量 reindex（同 _id 覆盖，目标不在时先按源重建）';
}
const retryModalOpen = ref(false);
const retryTarget = ref<any>(null);
const retryRps = ref<number | null>(null);
const retrySlices = ref<number | null>(null);
const retryBatch = ref<number | null>(null);
/* 弹层即时校验（start 同口径）：rps 只接受正数或 -1；slices/batchSize 由 NInputNumber min 钳制 */
const retryErr = computed(() => {
  if (retryRps.value != null && retryRps.value !== -1 && retryRps.value <= 0) {
    return '限流需为正数，-1 或留空表示不限';
  }
  return '';
});
/* ═══ 参数预设（localStorage ar-rebuild-presets）：rps/slices/batchSize 三项组合按名存取 ═══
   XmigrateView xm-batch-presets 同模式（Xm 文件零触碰，本页内同款小实现）：单源写通道
   writeStoredRaw（配额满吞异常回执布尔）+ 读侧坏 JSON 静默丢弃（最坏=预设列表为空，
   不炸页面）。null 项照存（「留空=沿用原值」也是可命名的合法组合）。 */
const AR_PRESETS_KEY = 'ar-rebuild-presets';
const arPresets = ref<Record<string, { rps: number | null; slices: number | null; batch: number | null }>>({});
try {
  const rawPresets = localStorage.getItem(AR_PRESETS_KEY);
  const parsedPresets = rawPresets ? JSON.parse(rawPresets) : null;
  if (parsedPresets && typeof parsedPresets === 'object' && !Array.isArray(parsedPresets)) arPresets.value = parsedPresets;
} catch { /* 坏快照静默丢弃 */ }
const arPresetId = ref<string | null>(null);
const arPresetName = ref('');
const arPresetOpts = computed(() => Object.keys(arPresets.value)
  .sort((a, b) => a.localeCompare(b)).map(k => ({ label: k, value: k })));
function persistArPresets() {
  /* 配额满等写失败：提示但不打断（单源写通道吞异常回执布尔） */
  if (!writeStoredRaw(localStorage, AR_PRESETS_KEY, JSON.stringify(arPresets.value))) {
    store.notify('warning', '参数预设保存失败（本地存储不可用）');
  }
}
function saveArPreset() {
  const name = arPresetName.value.trim();
  if (!name) { store.notify('warning', '先填预设名再保存'); return; }
  arPresets.value = { ...arPresets.value, [name]: { rps: retryRps.value, slices: retrySlices.value, batch: retryBatch.value } };
  persistArPresets();
  arPresetId.value = name;
  store.notify('success', `参数预设「${name}」已保存`);
}
function applyArPreset(v: string | null) {
  if (!v) return;
  const p = arPresets.value[v];
  if (!p) return;
  retryRps.value = p.rps ?? null;
  retrySlices.value = p.slices ?? null;
  retryBatch.value = p.batch ?? null;
  arPresetName.value = v;
  store.notify('info', `已应用参数预设「${v}」`);
}
function delArPreset() {
  const id = arPresetId.value;
  if (!id) return;
  const next = { ...arPresets.value };
  delete next[id];
  arPresets.value = next;
  persistArPresets();
  arPresetId.value = null;
  if (arPresetName.value === id) arPresetName.value = '';
  store.notify('info', `参数预设「${id}」已删除`);
}
function openRetryModal(j: any) {
  if (!canOps.value) { store.notify('warning', '重建操作需专项或 ADMIN 角色'); return; }
  if (!j?.jobId || retrying.value) return;
  retryTarget.value = j;
  /* 预填原值：null（缺省/不限）→ 留空（占位「沿用原值」），正数原值直接可见可改 */
  retryRps.value = Number(j.requestsPerSecond) > 0 ? Number(j.requestsPerSecond) : null;
  retrySlices.value = Number.isInteger(Number(j.slices)) && Number(j.slices) >= 1 ? Number(j.slices) : null;
  retryBatch.value = Number.isInteger(Number(j.batchSize)) && Number(j.batchSize) >= 1 ? Number(j.batchSize) : null;
  retryModalOpen.value = true;
}
async function doRetrySubmit() {
  const j = retryTarget.value;
  if (!j?.jobId || retrying.value || retryErr.value) return;
  retrying.value = true;
  try {
    /* 「未填不发键」：空字段不进 overrides（后端沿用原值）；-1 是显式覆盖为不限速。
       全空时保持单参调用（与既有无覆盖重跑链同一请求形态） */
    const overrides: Record<string, number> = {};
    if (retryRps.value != null) overrides.requestsPerSecond = retryRps.value;
    if (retrySlices.value != null) overrides.slices = retrySlices.value;
    if (retryBatch.value != null) overrides.batchSize = retryBatch.value;
    const hasOverride = Object.keys(overrides).length > 0;
    const r = hasOverride
      ? await api.adhoc.retry(String(j.jobId), overrides)
      : await api.adhoc.retry(String(j.jobId));
    retryModalOpen.value = false;
    job.value = r;
    deepLinkMiss.value = false;
    step.value = 4;
    startPolling(String(r?.jobId || j.jobId));
    /* 重跑即新生命周期：时间线立即重拉（同 jobId 复用时 watch 不触发，必须显式刷新） */
    void loadEvents(String(r?.jobId || j.jobId), { reset: true });
    loadJobs();
    store.notify('success', '已重新发起作业（' + retrySemanticsHint(r) + '）');
  } catch (e: any) {
    store.notify('error', '重跑失败：' + friendlyApiError(e));
  } finally {
    retrying.value = false;
  }
}

/* ═══ 完成校验闭环（SUCCEEDED 后）═══
 * a) 文档数比对：sourceDocCount vs destDocCount（快照已有，缺字段不冒充）；
 * b) 别名模式调既有 aliases 读端点核对别名 write 指向 dest；直连模式如实说明无别名可核对。
 * 校验失败给排查指引，不替用户下「数据一致」的结论 */
const verifyBusy = ref(false);
const verifyResult = ref<any>(null);
const docCountVerify = computed<any | null>(() => {
  const j = job.value;
  if (!j || j.status !== 'SUCCEEDED') return null;
  const src = Number(j.sourceDocCount), dst = Number(j.destDocCount);
  if (!Number.isFinite(src) || !Number.isFinite(dst) || j.sourceDocCount == null || j.destDocCount == null) return null;
  return { match: src === dst, src, dst };
});
/* 文档数比对口径裁决：活取 _count 两侧齐备时活口径为主；源已删/请求失败/活取缺席时
 回落快照（sourceDocCount vs destDocCount）。结论行与排查指引都吃这一个口径 */
const docVerifyVerdict = computed<null | { match: boolean; src: number; dst: number; live: boolean }>(() => {
  if (job.value?.status !== 'SUCCEEDED') return null;
  const lv = verifyResult.value?.live;
  if (lv?.src?.state === 'ok' && lv?.dst?.state === 'ok') {
    return { match: Number(lv.src.count) === Number(lv.dst.count), src: Number(lv.src.count), dst: Number(lv.dst.count), live: true };
  }
  const snap = docCountVerify.value;
  return snap ? { match: !!snap.match, src: Number(snap.src), dst: Number(snap.dst), live: false } : null;
});
/* 别名模式判定：作业快照优先 aliasMode（浏览器模式恒有），缺席时以逻辑名≠源物理名推断
 * （两端 toMap 都有 logicalName/sourcePhysical，判据可靠且方向一致） */
const jobIsAliasMode = computed(() => {
  const j = job.value;
  if (!j) return false;
  if (j.aliasMode != null) return !!j.aliasMode;
  return !!j.logicalName && j.logicalName !== j.sourcePhysical;
});
async function doVerify() {
  const j = job.value;
  if (!j || verifyBusy.value) return;
  verifyBusy.value = true;
  try {
    /* 活取 _count（api.count 既有通道，服务端 /cluster/count + 浏览器直连 _count 同构）：
       快照 sourceDocCount/destDocCount 是收尾时点的读数，源被删或切换后业务已写入时快照
       无法反映现状——能活取就活取。源索引已删（404/index_not_found）如实记 gone；
       其它失败记 unknown（回落快照，不冒充实取读数） */
    const liveCount = async (idx: unknown): Promise<{ state: 'ok'; count: number } | { state: 'gone' } | { state: 'unknown' }> => {
      const name = String(idx ?? '').trim();
      if (!name) return { state: 'unknown' };
      try {
        const r = await api.count(name, '{"query":{"match_all":{}}}');
        const n = Number(r?.count);
        return Number.isFinite(n) ? { state: 'ok', count: n } : { state: 'unknown' };
      } catch (e: any) {
        const msg = String(e?.message ?? e) + ' ' + friendlyApiError(e);
        return /index_not_found|not_found|404|不存在/i.test(msg) ? { state: 'gone' } : { state: 'unknown' };
      }
    };
    const [srcLive, dstLive] = await Promise.all([liveCount(j.sourcePhysical), liveCount(j.destPhysical)]);
    let alias: any = null;
    if (jobIsAliasMode.value) {
      /* 别名通道单独降级：失败不拖垮已活取成功的文档数读数——文档数行照常展示，
         别名行如实标注「核对失败」而非伪装成「未指向」 */
      try {
        const list = await api.aliases();
        const rows = (Array.isArray(list) ? list : []).filter((r: any) => r?.alias === j.logicalName);
        const hit = rows.find((r: any) => r?.index === j.destPhysical);
        alias = {
          checked: true,
          ok: !!hit,
          writeOk: rows.length > 0 ? !!rows.find((r: any) => r?.index === j.destPhysical && (r.isWriteIndex == null || !!r.isWriteIndex)) : false,
          members: rows.map((r: any) => r?.index).filter(Boolean),
        };
      } catch (e: any) {
        alias = { checked: false, error: friendlyApiError(e) };
      }
    }
    verifyResult.value = { alias, live: { src: srcLive, dst: dstLive }, at: Date.now() };
  } catch (e: any) {
    verifyResult.value = { alias: null, error: friendlyApiError(e), at: Date.now() };
  } finally {
    verifyBusy.value = false;
  }
}

/* ═══ 失败处置：复制失败 doc id + 生成回补 query ═══
 * 回补 query 按作业 timeField 生成 time range 重放 DSL（失败窗口 = 启动~收尾）；
 * 无 timeField 时无法生成时间窗，按钮禁用并说明原因 */
const failedDocIds = computed<string[]>(() =>
  failureSamples.value.map((f: any) => String(f?.id ?? '').trim()).filter(Boolean));
async function copyFailedDocIds() {
  const ids = failedDocIds.value;
  if (!ids.length) return;
  const ok = await copyText(ids.join('\n'));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${ids.length} 个失败文档 id` : '复制失败');
}
const backfillGenBlockedReason = computed(() => {
  const j = job.value;
  if (!j) return '';
  if (!j.timeField) return '作业无时间字段，无法生成时间窗回补 query（请按业务主键人工圈定失败范围）';
  if (!j.startedAt) return '作业缺少启动时刻，无法确定回补时间窗起点';
  return '';
});
function buildFailureBackfillDsl(): string {
  const j = job.value || {};
  const from = new Date(Number(j.startedAt)).toISOString();
  const to = j.finishedAt ? new Date(Number(j.finishedAt)).toISOString() : 'now';
  return 'POST _reindex\n{\n  "conflicts": "proceed",\n  "source": {\n    "index": "' + j.sourcePhysical
    + '",\n    "query": { "range": { "' + j.timeField + '": { "gte": "' + from + '", "lte": "' + to + '" } } }\n  },\n'
    + '  "dest": { "index": "' + j.destPhysical + '", "op_type": "create" }\n}';
}
async function copyFailureBackfill() {
  if (backfillGenBlockedReason.value) return;
  const ok = await copyText(buildFailureBackfillDsl());
  store.notify(ok ? 'success' : 'error', ok ? '回补 query 已复制（失败时间窗重放，op_type=create 幂等）' : '复制失败');
}

/* ═══ 动态调速（reindex 执行段）═══ 档位调 throttle 端点（-1 恢复不限速），当前生效速率随轮询回显 */
const throttling = ref(false);
const throttlePick = ref<number>(200);
const THROTTLE_OPTS = [
  { label: '50/s', value: 50 },
  { label: '200/s', value: 200 },
  { label: '不限速', value: -1 },
];
const throttleStageOn = computed(() =>
  !!job.value && job.value.status === 'RUNNING'
  && ['FULL_REINDEX', 'CATCHUP', 'FINAL_CATCHUP'].includes(String(job.value.stage)));
async function doThrottle() {
  const id = job.value?.jobId;
  if (!id || !throttleStageOn.value || throttling.value) return;
  throttling.value = true;
  try {
    const j = await api.adhoc.throttle(String(id), throttlePick.value);
    if (j && typeof j === 'object') job.value = j;
    store.notify('success', throttlePick.value < 0 ? '已恢复不限速' : '已调速为 ' + throttlePick.value + '/s');
  } catch (e: any) {
    store.notify('error', '调速失败：' + friendlyApiError(e));
  } finally {
    throttling.value = false;
  }
}

/* ═══ 历史治理：单条删除（终态可用）+ 批量清理 7 天前终态记录 ═══ */
async function doDeleteJob(jobId: string) {
  if (!jobId) return;
  const ok = await askConfirm({
    level: 'warn',
    title: '删除作业记录',
    message: `将删除作业 ${jobId} 的记录（仅清记录，不影响 ES 索引与已迁移数据）。`,
    okText: '删除记录',
  });
  if (!ok) return;
  try {
    await api.adhoc.deleteJob(jobId);
    store.notify('success', '已删除作业记录');
    loadJobs();
  } catch (e: any) {
    store.notify('error', '删除失败：' + friendlyApiError(e));
  }
}
async function doCleanupJobs() {
  const ok = await askConfirm({
    level: 'warn',
    title: '清理 7 天前的终态作业记录',
    message: '将删除 7 天前已结束（成功/失败/中止）的作业记录；进行中的作业不受影响。仅清记录，不影响 ES 索引。',
    okText: '清理',
  });
  if (!ok) return;
  try {
    const r = await api.adhoc.cleanupJobs(7);
    store.notify('success', `已清理 ${Number(r?.deleted) || 0} 条 7 天前的终态记录`);
    loadJobs();
  } catch (e: any) {
    store.notify('error', '清理失败：' + friendlyApiError(e));
  }
}

/* reindex task 深链（TasksView ?taskId= 先例同款跳法） */
function gotoTask(taskId: string) {
  router.push({ path: '/tasks', query: { taskId } });
}

/* 深链 ?jobId= 的失联空态：作业不在清单（宿主重启内存态丢失/浏览器本机无此记录） */
const deepLinkMiss = ref(false);
/* 深链失败的两态：gone=作业确实不在（404/不存在字样）；false=拉取通道失败（网络/5xx），
   空态文案随之区分——「拉不到」不冒充「不存在」 */
const deepLinkGone = ref(true);

/* 心跳的开关与「阻断横幅是否在渲染」绑定同一个条件（job.stage === 'AWAIT_CONFIRM'），
 而不是散在 5 处 job.value 赋值点上逐个 start/stop —— 那种写法漏掉任何一处
 都会留下一个跑着的定时器，且漏没漏看不出来。watch 保证二者不可能分叉：
 横幅在 ⇔ 心跳在。stage 离开 AWAIT_CONFIRM（确认/中止/失败）即停表。 */
watch(
  () => job.value?.stage === 'AWAIT_CONFIRM',
  (blocked) => { blocked ? startBlockTicker() : stopBlockTicker(); },
  { immediate: true },
);

/* 页面隐藏不空转（stores/jobTracker.ts onVisChange 范式）——业务写入被阻断的读秒
 是给人看的，页面隐藏时 1s 心跳空转纯属浪费：hidden 停表，回前台且横幅仍在（AWAIT_CONFIRM）
 时重启并重取基点（blockedSec 由 awaitConfirmSince 重算，秒数不因停表失真）。卸载清理见下。 */
function onBlockVisChange() {
  if (document.hidden) { stopBlockTicker(); return; }
  if (job.value?.stage === 'AWAIT_CONFIRM') startBlockTicker();
}
document.addEventListener('visibilitychange', onBlockVisChange);

async function doConfirmSwitch() {
  /* 权限执行体首行门（确认切换钮已有 v-if，此处覆盖深链/程序化通道） */
  if (!canMutateJob.value) {
    store.notify('warning', jobOwner.value && auth.me?.username !== jobOwner.value && !auth.isAdmin()
      ? `作业由 ${jobOwner.value} 创建：确认切换仅创建者本人或 ADMIN 可操作`
      : '重建操作需专项或 ADMIN 角色');
    return;
  }
  /* 闸读收本体首行+置位前移（templateSaveGate937 口径：确认窗 await 在闸读之前=闸形同虚设）——critical
     确认窗须手输旧索引名、挂起窗口长，确认切换钮 :disabled="confirming" 在窗期即禁用，
     二击不再穿透双开确认窗；取消路径由 finally 复位防闸死。 */
  if (!job.value || confirming.value) return;
  confirming.value = true;
  try {
    /* 删除旧物理索引不可逆——勾选后切换确认必须过 critical 门。被删对象是物理索引，
     守卫与提示都用物理名（逻辑名可能只是别名，输逻辑名防不住删错另一个物理索引） */
    if (deleteOldIndex.value) {
      const delTarget = job.value?.sourcePhysical || indexName.value;
      const okDel = await askConfirm({
        level: 'critical',
        title: '将删除旧物理索引',
        message: `切换成功后会物理删除旧索引「${delTarget}」及其全部数据，不可恢复。输入旧索引名以确认。`,
        guardText: delTarget,
        okText: '确认切换并删除',
      });
      if (!okDel) return;
    } else {
      /* 未勾删除也要确认切换本身：别名写入路由即刻翻到新索引，生产写入立即改道 */
      const dest = job.value?.destPhysical || destIndex.value || prep.value?.suggestedDest || '';
      const okSwitch = await askConfirm({
        level: 'warn',
        title: '切换写入路由到新索引',
        message: `即将把别名写入路由切换到新索引「${dest || '新目标索引'}」——生产写入会立即打到新索引。`,
        okText: '确认切换',
      });
      if (!okSwitch) return;
    }
    job.value = await api.adhoc.confirmSwitch(job.value.jobId);
    /* 联动性：切换成功 toast 带「去查询验证」动作——重建完成后第一步就是验证数据，
     一键跳查询工作台（带索引深链），免手动导航 */
    const newIndex = job.value?.newIndex || job.value?.targetIndex || '';
    store.notify('success', '已确认切换', {
      duration: 12000,
      action: {
        label: '去查询验证',
        onClick: () => {
          if (newIndex) store.pick(newIndex);
          router.push({ path: '/search', query: newIndex ? { idx: newIndex } : {} });
        },
      },
    });
  } catch (e: any) {
    store.notify('error', '确认失败：' + friendlyApiError(e));
  } finally {
    confirming.value = false;
  }
}

const jobsLoading = ref(false);
/* 拉取失败常驻错误态（错误卡+重试钮在场）：整卡消隐会让人误以为没有历史作业 */
const jobsErr = ref('');
async function loadJobs(opts?: { silent?: boolean }) {
    if (jobsLoading.value) return;
    jobsLoading.value = true;
    jobsErr.value = '';
  /* -A2：内存态辅助卡片——空时整卡消隐是有意设计，但拉取失败不能静默吞。
     silent 档供监控轮询低频同刷用：失败落 jobsErr 错误卡即可，不再叠 toast */
  try { allJobs.value = await api.adhoc.jobs(); } catch (e: any) { allJobs.value = []; jobsErr.value = '作业列表拉取失败：' + friendlyApiError(e); if (!opts?.silent) store.notify('warning', jobsErr.value); } finally { jobsLoading.value = false; }
}

/* ═══ W1：最近作业表内核（kw 过滤 + 状态漏斗 + matrixText 导出）═══
 过滤只动显示与导出行集（visibleJobs），allJobs 仍是刷新拉取的完整清单——
 过滤绝不吞数据：n/m 命中数与「清除过滤」钮在过滤生效时始终可见。 */
const jobKw = ref('');
const jobStatusFilter = ref('');
function funnelKey(s: any): string {
  return String(s || '').toUpperCase();
}
const visibleJobs = computed(() => {
  const kw = jobKw.value.trim().toLowerCase();
  return allJobs.value.filter(j => {
    if (jobStatusFilter.value && funnelKey(j.status) !== jobStatusFilter.value) return false;
    if (!kw) return true;
    return [j.jobId, j.logicalName, j.status].some(v => String(v ?? '').toLowerCase().includes(kw));
  });
});
function toggleJobStatusFilter(s: any) {
  const k = funnelKey(s);
  jobStatusFilter.value = jobStatusFilter.value === k ? '' : k;
}
function clearJobFilters() {
  jobKw.value = '';
  jobStatusFilter.value = '';
}
/* W-B：最近作业表 QRT rows 型矩阵——列序=JOB_COLS（#cell-<col> 槽按列名接线），
 行集仍收口 visibleJobs（kw+状态漏斗过滤后单一来源，表格显示与 TSV/MD 导出所见即所复）。
 数值/epoch 以原始值进矩阵：排序/Σ/采样类型徽标由内核按值口径处理，显示层由槽接管。
 尾追 tookMs 耗时列（后端 toMap 既有字段；运行中 -1/缺席 null 原值进矩阵，
 显示层 #cell-tookMs 分档） */
const JOB_COLS = ['jobId', 'logicalName', 'strategy', 'status', 'stage', 'startedAt', 'tookMs'];
/* 期望 vs 实际差异比对表列声明（MiniTable 声明式表头，行交互经 #rows 槽自带） */
const CFG_DIFF_COLS: MiniTableColumn[] = [
  { key: 'path', label: '路径', mono: true },
  { key: 'kind', label: '类别' },
  { key: 'expected', label: '期望' },
  { key: 'actual', label: '实际' },
  { key: 'note', label: '说明' },
];
/* 重建轮次表列声明（Σ 聚合行经 #tfoot 槽自带；列对齐维持原表全左，行内数字格式由槽内原样承载） */
const ROUND_COLS: MiniTableColumn[] = [
  { key: 'round', label: '轮次' },
  { key: 'phase', label: '阶段' },
  { key: 'total', label: '总计' },
  { key: 'created', label: '已建' },
  { key: 'updated', label: '已更新' },
  { key: 'versionConflicts', label: '冲突跳过' },
  { key: 'took', label: '耗时' },
];
const jobsMatrix = computed<any[][]>(() => visibleJobs.value.map(j => [
  j.jobId ?? null, j.logicalName ?? null, j.strategy ?? null, j.status ?? null, j.stage ?? null, j.startedAt ?? null, j.tookMs ?? null,
]));
/* 矩阵行只有七列（尾追 tookMs）：锁安全徽标/job 附加字段从 allJobs 原行对象取
 （后端 toMap 行级透出 gateOutcome/lockActive/switchedWithoutLock；作业量级小，find 足够） */
function jobOf(row: any[]): any {
  return allJobs.value.find(j => String(j?.jobId) === String(row?.[0])) || {};
}
/* 过滤空集的空态分档（QRT EmptyState 接管旧 nomatch 行）：真无作业 ≠ 过滤无命中 */
const jobsEmptyText = computed(() =>
  (jobKw.value.trim() || jobStatusFilter.value) ? '无匹配作业（过滤生效中）' : '暂无作业记录');

/* ═══ 2026-11-21 对账批：健康摘要条（表上方，从已加载 jobs 前端派生）═══
   纯展示芯片：总数/运行中/成功/失败/平均轮次耗时/平均速率/冲突总数/停门中。
   空清单返回 null 整行隐藏（不冒充 0）；平均轮次耗时无任何轮次采样时该值 null（展示 '—'）。
   平均速率=各作业速率（Σ轮次已建 / Σ轮次耗时秒，roundTookMs/tookMs 双字段兜底同轮次表
   口径）的算术平均，仅计有速率作业（XmigrateView healthSummary avgRate 同语义）；
   冲突总数=Σ轮次 versionConflicts（轮次表「冲突跳过」列同数据源），全缺展示 '—'。 */
const jobHealth = computed<null | {
  total: number; running: number; succeeded: number; failed: number;
  gated: number; avgRoundMs: number | null; roundCount: number;
  avgRate: number | null; conflictTotal: number | null;
}>(() => {
  const js = allJobs.value;
  if (!js.length) return null;
  let running = 0, succeeded = 0, failed = 0, gated = 0;
  let roundSumMs = 0, roundCount = 0;
  const jobRates: number[] = [];
  let conflictSum = 0, conflictHas = false;
  for (const j of js) {
    const st = String(j?.status ?? '');
    const stage = String(j?.stage ?? '');
    if (st === 'RUNNING') running++;
    if (st === 'SUCCEEDED') succeeded++;
    if (st === 'FAILED') failed++;
    if (st === 'RUNNING' && stage === 'AWAIT_CONFIRM') gated++;
    let jobCreated = 0, jobTookMs = 0;
    for (const r of Array.isArray(j?.rounds) ? j.rounds : []) {
      const v = r?.roundTookMs ?? r?.tookMs;
      const n = Number(v);
      if (v != null && Number.isFinite(n) && n >= 0) { roundSumMs += n; roundCount++; jobTookMs += n; }
      const c = Number(r?.created);
      if (r?.created != null && Number.isFinite(c) && c > 0) jobCreated += c;
      const vc = r?.versionConflicts;
      if (vc != null) { conflictHas = true; conflictSum += Number(vc) || 0; }
    }
    /* 作业速率：总耗时不足 1s 不出（防除零与抖动，rateOf 同口径） */
    if (jobCreated > 0 && jobTookMs >= 1000) {
      jobRates.push(Math.round(jobCreated / (jobTookMs / 1000)));
    }
  }
  return {
    total: js.length, running, succeeded, failed, gated,
    avgRoundMs: roundCount ? Math.round(roundSumMs / roundCount) : null,
    roundCount,
    avgRate: jobRates.length ? Math.round(jobRates.reduce((s, v) => s + v, 0) / jobRates.length) : null,
    conflictTotal: conflictHas ? conflictSum : null,
  };
});
/* 毫秒人话——fmtMs 走 utils/format 单源（semFormat duration 档；null 恒 '—'） */

/* ═══ 2026-11-21 对账批：收尾报告对账条视图（report.reconcile 四态 → tone/label）═══
   MATCH=绿（对账一致）/ GAP=黄（差值，补齐路径在 message）/ SOURCE_GONE 与
   UNAVAILABLE=灰（无法对账，如实说明）；字段缺席（旧后端）整行不渲染。 */
const reconcileView = computed<{ status: string; tone: 'g' | 'y' | 'n'; label: string }>(() => {
  const st = String(job.value?.report?.reconcile?.status ?? '');
  if (st === 'MATCH') return { status: st, tone: 'g', label: '对账一致' };
  if (st === 'GAP') return { status: st, tone: 'y', label: '存在缺口' };
  if (st === 'SOURCE_GONE') return { status: st, tone: 'n', label: '源已不存在' };
  return { status: st || 'UNAVAILABLE', tone: 'n', label: '无法对账' };
});
/* 最近作业 TSV/MD 复制（XmigrateView exportTsv/exportMd 同手法；行集=过滤后所见即所复。
 空集 warning 报真（exportEmptyGuard936 同款话术）——恒在场 disabled 的程序化兜底，不造第二措辞） */
async function exportJobsMatrix(fmt: 'tsv' | 'md') {
  const rows = visibleJobs.value;
  if (!rows.length) { store.notify('warning', '无表格结果可导出'); return; }
  const cols = ['jobId', 'logicalName', 'strategy', 'status', 'stage', 'startedAt', 'tookMs'];
  const ok = await copyText(matrixText({ rows, cols, getVal: (r: any, c: string) => r[c] ?? '' }, fmt));
  store.notify(ok ? 'success' : 'error', ok ? `已复制 ${rows.length} 行作业（${fmt.toUpperCase()}）` : '复制失败');
}
/* 轮次表 Σ（null 不计入；全 null 显示 '-'，不冒充 0——fmtNum 的 口径同源） */
function roundSum(k: string): string {
  let has = false, s = 0;
  for (const r of job.value?.rounds || []) {
    const v = r?.[k];
    if (v != null) { has = true; s += Number(v) || 0; }
  }
  return has ? fmtNum(s) : '-';
}

let watchSeq = 0;
function watchJob(jobId: string, fromDeepLink = false) {
  const seq = ++watchSeq; // Eye 连点竞态锚：旧作业回包按世代丢弃（job 写点/轮询劫持/失败踢回三面同口径）
  step.value = 4;
  /* 失败兜底——此前请求失败静默，监控步整块空白用户被困。
   * 深链通道（?jobId=）失败单独落空态：作业不在清单（宿主重启内存态丢失/本机无此记录），
   * 踢回向导步反而掩盖「记录不存在」这个事实 */
  api.adhoc.status(jobId).then(j => {
    if (seq !== watchSeq) return; // 旧作业慢包不得顶掉新作业监控
    job.value = j;
    deepLinkMiss.value = false;
    if (j.status === 'RUNNING') startPolling(jobId);
  }).catch((e: any) => {
    if (seq !== watchSeq) return; // 旧作业失败不得把新监控页踢回首页
    const raw = String(e?.message ?? e) + ' ' + friendlyApiError(e);
    const gone = /不存在|not_found|not found|404/i.test(raw);
    if (fromDeepLink) {
      deepLinkGone.value = gone;
      deepLinkMiss.value = true;
      return;
    }
    store.notify('error', '拉取作业状态失败：' + friendlyApiError(e));
    step.value = 1;
  });
}

/* ═══ 事件时间线（轮次表旁，api.adhoc.events 只读）：job 换成新监控目标
 （watchJob/doStart）按 jobId 拉取一次；重跑（doRetrySubmit）成功后显式重拉——重跑即
 新生命周期，时间线必须反映新事件（同 jobId 复用时 watch 不触发）；监控轮询运行期间
 对事件做节流静默刷新（间隔≥5s，防 2s 轮询打爆 events 端点；静默档错误态不重试）。
 拍失败保旧数据+错误条并存（不把已渲染事件换成错误卡）；job 清场（reset）随之清空，
 不残留上一作业轨迹 ═══ */
const jobEvents = ref<any[]>([]);
const eventsErr = ref('');
const eventsLoading = ref(false);
let eventsSeq = 0;
let eventsSilentAt = 0;
const EVENTS_SILENT_MIN_MS = 5000;
async function loadEvents(jobId: string, opts: { reset?: boolean; silent?: boolean } = {}) {
  if (!jobId) return;
  /* 静默拍已有错误态时跳过（错误条常驻承担可见性；reset 拍/显式拍照常重拉） */
  if (opts.silent && eventsErr.value) return;
  if (opts.reset) { jobEvents.value = []; eventsErr.value = ''; }
  const seq = ++eventsSeq;
  eventsLoading.value = true;
  try {
    const r = await api.adhoc.events(String(jobId));
    if (seq !== eventsSeq) return; /* 旧拍回包不得覆写新目标的事件面 */
    jobEvents.value = Array.isArray(r?.events) ? r.events : [];
    eventsErr.value = '';
  } catch (e: any) {
    if (seq !== eventsSeq) return;
    /* 失败保旧数据：错误条与旧快照并存（不冒充空态） */
    eventsErr.value = friendlyApiError(e);
  } finally {
    if (seq === eventsSeq) eventsLoading.value = false;
  }
}
watch(() => job.value?.jobId, (id, old) => {
  if (id === old) return;
  if (!id) { jobEvents.value = []; eventsErr.value = ''; return; }
  void loadEvents(String(id), { reset: true });
}, { immediate: true });
/* 事件着色：GATE_*（确认门轨迹）琥珀档；终态事件按状态色（statusTone 复用）；
   其余（STARTED 等过程事件）信息蓝档 */
function eventTone(ev: any): 'g' | 'y' | 'r' | 'b' | 'n' {
  const s = String(ev?.status ?? '').toUpperCase();
  if (s.startsWith('GATE_')) return 'y';
  if (['SUCCEEDED', 'FAILED', 'ABORTED', 'DONE'].includes(s)) return statusTone(s);
  return 'b';
}

/* ═══ 2026-11-21 对账批：时间线筛选芯片（全部/门禁/错误/终态）+ 自动滚动 ═══
   分组判据按 stage/status：门禁=GATE_* 或 AWAIT_CONFIRM 阶段；错误=FAILED/ABORTED/LOCK_LOST；
   终态=成功收尾（SUCCEEDED/DONE）。四组互斥可切，空命中给「当前筛选无命中」空态。 */
const EV_FILTERS = [
  { v: 'all', label: '全部', hint: '不过滤，展示全部事件' },
  { v: 'gate', label: '门禁', hint: '确认门轨迹：GATE_* 事件与 AWAIT_CONFIRM 阶段事件' },
  { v: 'error', label: '错误', hint: 'FAILED / ABORTED / LOCK_LOST 事件' },
  { v: 'final', label: '终态', hint: '成功收尾事件（SUCCEEDED / DONE）' },
] as const;
type EvFilter = typeof EV_FILTERS[number]['v'];
const evFilter = ref<EvFilter>('all');
/* 关键字搜索（与档位芯片 AND 叠加，XmigrateView evKw 同款）：命中面=detail 全文 + stage
   枚举（按 stage 搜「GATE」也是合法诉求）；换作业复位（新事件集的旧词命中无意义） */
const evKw = ref('');
const filteredEvents = computed(() => {
  let list = jobEvents.value;
  if (evFilter.value !== 'all') {
    list = list.filter((ev: any) => {
      const s = String(ev?.status ?? '').toUpperCase();
      const stage = String(ev?.stage ?? '').toUpperCase();
      if (evFilter.value === 'gate') return s.startsWith('GATE_') || stage === 'AWAIT_CONFIRM';
      if (evFilter.value === 'error') return ['FAILED', 'ABORTED', 'LOCK_LOST'].includes(s);
      return ['SUCCEEDED', 'DONE'].includes(s);
    });
  }
  const kw = evKw.value.trim().toLowerCase();
  if (kw) list = list.filter((ev: any) => `${ev?.detail ?? ''} ${ev?.stage ?? ''}`.toLowerCase().includes(kw));
  return list;
});
/* ═══ 作业回放：冻结当前筛选后事件集，按虚拟时间轴播放（与 Xmigrate 同内核/同控制条）═══ */
const evReplayOn = ref(false);
const evReplayEvents = ref<any[]>([]);
const evReplay = useEventReplay({ minGapMs: 300, gapCapMs: 1500, tailMs: 900 });
const evTimelineEvents = computed(() => (evReplayOn.value ? evReplayEvents.value : filteredEvents.value));
function enterEvReplay() {
  if (filteredEvents.value.length < 2) return;
  evReplayEvents.value = filteredEvents.value.slice();
  evReplay.load(evReplayEvents.value);
  evReplayOn.value = true;
  evAutoScroll.value = false;
  evOpenKey.value = '';
  evReplay.play();
  void scrollEvReplayCurrent();
}
function exitEvReplay() {
  evReplay.pause();
  evReplayOn.value = false;
  evReplayEvents.value = [];
  evReplay.reset();
  evAutoScroll.value = true;
  void scrollEventsToBottom();
}
async function scrollEvReplayCurrent() {
  await nextTick();
  const wrap = evLineEl.value;
  if (!wrap) return;
  const el = wrap.querySelector('[data-ev-current="true"]') as HTMLElement | null;
  if (!el) return;
  const wr = wrap.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  wrap.scrollTop += (er.top - wr.top) - (wrap.clientHeight - er.height) / 2;
}
watch(() => evReplay.index.value, () => { if (evReplayOn.value) void scrollEvReplayCurrent(); });
/* 换作业/清场退出回放（旧作业快照不得挂到新作业；本拍晚于事件装载 watch，不复用 immediate） */
watch(() => job.value?.jobId, (id, old) => { if (id !== old && evReplayOn.value) exitEvReplay(); });
/* 跨天分组段头：筛选后序列里与前一事件不同天的事件位 → dayLabel 段头（今天/昨天/MM-DD，
   utils/format dayLabel 单源）。非法 ts dayLabel 回 '-' 也按段头换行（脏数据不吞行） */
const eventDayHeads = computed<Record<number, string>>(() => {
  const evs = evTimelineEvents.value;
  const heads: Record<number, string> = {};
  let prevDay = '';
  for (let i = 0; i < evs.length; i++) {
    const d = dayLabel(Number(evs[i]?.ts));
    if (d !== prevDay) { heads[i] = d; prevDay = d; }
  }
  return heads;
});
/* 自动滚动（默认开）：新事件到达或切换筛选后滚到底部（最新事件）；
   关闭后不再抢滚动位置——人正在回看历史时不被打断 */
const evAutoScroll = ref(true);
const evLineEl = ref<HTMLElement | null>(null);
async function scrollEventsToBottom() {
  if (!evAutoScroll.value) return;
  await nextTick();
  const el = evLineEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}
watch(() => jobEvents.value.length, () => { void scrollEventsToBottom(); });
watch(evFilter, () => { void scrollEventsToBottom(); });

/* ═══ 单事件钻取（XmigrateView 同款三件套之一）：行点击/Enter/Space 内联展开——
   完整时间戳（fmtTime 精确到秒，含日期）+ stage/status 枚举 + detail 全文不截断 + 复制钮。
   展开键=筛选后序列行号；事件集刷新拍（轮询静默刷新）行集可能变化，展开态随之复位
   不挂错行（Xmigrate 口径） ═══ */
const evOpenKey = ref('');
function toggleEvOpen(i: number) {
  evOpenKey.value = evOpenKey.value === String(i) ? '' : String(i);
}
async function copyEvDetail(ev: any) {
  const ok = await copyText(String(ev?.detail ?? ''));
  store.notify(ok ? 'success' : 'error', ok ? '已复制事件详情全文' : '复制失败');
}
/* JSONL 导出（XmigrateView exportEventsJsonl 同款）：当前筛选后事件（芯片档+关键字
   叠加的所见集）落文件，每行 {ts,stage,status,detail}——本页事件无 level 字段，
   诚实导出本页字段形态；文件名含 jobId */
function exportEventsJsonl() {
  const list = filteredEvents.value;
  if (!list.length) { store.notify('warning', '当前筛选无命中事件，无内容可导出'); return; }
  const name = `ar-events-${job.value?.jobId || 'job'}.jsonl`;
  const body = list.map(ev => JSON.stringify({
    ts: Number(ev?.ts) || 0,
    stage: String(ev?.stage || ''),
    status: String(ev?.status || ''),
    detail: String(ev?.detail ?? ''),
  })).join('\n');
  downloadText(name, body, 'application/x-ndjson');
  store.notify('success', `已导出 ${list.length} 条事件（JSONL）：${name}`);
}
/* 事件集刷新复位钻取展开；换作业连关键字一起复位（旧词命中对新事件集无意义） */
watch(jobEvents, () => { evOpenKey.value = ''; });
watch(() => job.value?.jobId, (id, old) => { if (id !== old) { evKw.value = ''; evOpenKey.value = ''; } });

/* ═══ 2026-11-21 对账批：作业行级右键菜单（CellContextMenu）═══
   最近作业表右键 jobId 单元格出行操作（操作列保留）：复制索引名/打开详情/重跑（终态，
   开参数覆盖弹层）/调速（运行中，进监控并滚到调速区）/中止（运行中）/治理删除（终态）/
   以此参数新建。按作业状态条件渲染不适用的项，不给死按钮。 */
const jobRowMenu = ref<{ x: number; y: number; title: string; job: any } | null>(null);
function openJobRowMenu(e: MouseEvent, j: any) {
  if (!j?.jobId) return;
  jobRowMenu.value = { x: e.clientX, y: e.clientY, title: '作业 ' + j.jobId, job: j };
}
/* 运行中动作的前置：行不是当前监控目标时先经 watchJob 拉状态（等 job 换 id，上限 2s），
   再执行动作——中止/调速都消费监控态 job.value，直接跑会打到别的作业上 */
async function focusJobThen(j: any, then: () => void) {
  if (job.value?.jobId !== j.jobId) {
    watchJob(String(j.jobId));
    const deadline = Date.now() + 2000;
    while (job.value?.jobId !== j.jobId && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 50));
    }
  }
  await nextTick();
  then();
}
async function scrollJobToThrottle() {
  const el = document.querySelector('[data-test="adhoc-throttle"]');
  if (el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
}
const jobRowMenuItems = computed<CcmItem[]>(() => {
  const m = jobRowMenu.value;
  if (!m) return [];
  const j = m.job;
  const st = String(j?.status ?? '');
  const terminal = ['FAILED', 'ABORTED', 'SUCCEEDED'].includes(st);
  const running = st === 'RUNNING';
  return [
    { key: 'j-copy-idx', label: '复制逻辑索引名', icon: Copy, run: () => copyWithToast(String(j?.logicalName || ''), '已复制索引名：' + j?.logicalName) },
    { key: 'j-open', label: '打开详情（执行监控）', icon: Eye, run: () => watchJob(String(j.jobId)) },
    ...(terminal ? [{ key: 'j-retry', label: '重跑（可覆盖执行参数）', icon: RotateCw, run: () => openRetryModal(j) }] : []),
    ...(running ? [{ key: 'j-throttle', label: '调速（滚到调速区）', icon: Gauge, run: () => { void focusJobThen(j, () => void scrollJobToThrottle()); } }] : []),
    ...(running ? [{ key: 'j-abort', label: '中止作业', icon: CircleStop, run: () => { void focusJobThen(j, () => void doAbort()); } }] : []),
    ...(terminal ? [{ key: 'j-delete', label: '治理删除记录', icon: Trash2, run: () => doDeleteJob(String(j.jobId)) }] : []),
    { key: 'j-reuse', label: '以此参数新建', icon: Wand2, run: () => reuseJobParams(j) },
  ];
});

/* ═══ 2026-11-21 对账批：以此参数新建 ═══
   作业参数回填向导（源索引/策略/时间字段/缓冲/旧索引处置/确认门/执行参数）并回到
   向导首步；settings/mapping 不随作业持久化，由回填后的自动探测重新预填。
   先 reset 整体清场（旧现场不陪新一轮），再写参数——顺序即语义。 */
function reuseJobParams(j: any) {
  reset();
  const idx = String(j?.logicalName || '').trim();
  if (idx) indexName.value = idx;
  if (['INCREMENTAL', 'WRITE_BLOCK', 'MANUAL'].includes(String(j?.strategy))) strategy.value = String(j.strategy);
  if (j?.timeField) timeField.value = String(j.timeField);
  if (Number.isFinite(Number(j?.bufferMs)) && Number(j.bufferMs) >= 0) bufferMs.value = Math.round(Number(j.bufferMs));
  deleteOldIndex.value = !!j?.deleteOldIndex;
  pauseBeforeSwitch.value = !!j?.pauseBeforeSwitch;
  /* 执行参数回填（「缺省不发键」协议的正数档）：slices>=1 进自定义档 */
  const rps = Number(j?.requestsPerSecond);
  tuningRpsDraft.text.value = Number.isFinite(rps) && rps > 0 ? String(Math.round(rps)) : '';
  const slices = Number(j?.slices);
  if (Number.isInteger(slices) && slices >= 1) {
    tuningSlicesDraft.text.value = String(slices);
    tuningSlicesCustom.value = true;
  }
  store.notify('success', '已按作业 ' + (j?.jobId || '') + ' 的参数回填向导，settings/mapping 将重新探测预填');
  if (idx) void doPrepare();
}

/* ═══ 2026-11-21 对账批：导出快照（JSON 下载 + Markdown 工单贴片）═══
   JSON 走 downloadText 统一件（可读时间戳文件名）；Markdown 复用 matrixText 导出
   风格（与最近作业表 TSV/MD 同一矩阵内核）：基本信息表 + 轮次明细表 + 对账结论段。 */
function exportJobSnapshotJson() {
  const j = job.value;
  if (!j?.jobId) return;
  downloadText('adhoc-' + String(j.jobId) + '-snapshot.json', JSON.stringify(j, null, 2), 'application/json');
  store.notify('success', '已下载作业 JSON 快照');
}
async function exportJobSnapshotMd() {
  const j = job.value;
  if (!j?.jobId) { store.notify('warning', '无表格结果可导出'); return; }
  const cols = ['jobId', 'logicalName', 'strategy', 'status', 'stage', 'startedAt', 'finishedAt',
    'tookMs', 'sourcePhysical', 'destPhysical', 'sourceDocCount', 'destDocCount', 'timeField'];
  const parts = [
    '## 托管重建作业快照 ' + String(j.jobId),
    matrixText({ rows: [j], cols, getVal: (r: any, c: string) => r[c] ?? '' }, 'md'),
  ];
  if (Array.isArray(j.rounds) && j.rounds.length) {
    parts.push('### 轮次明细');
    parts.push(matrixText({
      rows: j.rounds,
      cols: ['round', 'phase', 'total', 'created', 'updated', 'versionConflicts', 'roundTookMs'],
      getVal: (r: any, c: string) => r?.[c] ?? '',
    }, 'md'));
  }
  const rec = j?.report?.reconcile;
  if (rec) parts.push('### 文档数对账\n' + String(rec.message || rec.status));
  if (j?.error) parts.push('### 错误\n' + String(j.error));
  const ok = await copyText(parts.join('\n\n'));
  store.notify(ok ? 'success' : 'error', ok ? '已复制 Markdown 工单贴片' : '复制失败');
}

/* ═══ W3：运行中作业重挂提示（job 内存态，刷新后 resumeScene 把 step>3 钳回 3，
 运行中作业失联，唯一回路=最近作业表 Eye 钮）═══
 扫 allJobs（api.adhoc.jobs() 的既有消费形态）复用既有 running 判据 status==='RUNNING'
 （hasRunningJob/询同一字面判据，勿自造）；在 step<4 的向导步骤在场（刷新续场钳回
 step3 的落点同样能看到入口）。「回到监控」复用
 既有 watchJob（拉状态+startPolling 一条龙，不自造轮询），切回后 step=4 本条随条件隐没。
 resumeScene 既有 step 裁决零触碰（adhocStateMachine/adhocStepPersist 锁）；onMounted 的
 loadJobs 既有拉取即为数据源，无需新增扫描点。 */
const runningAdhocJob = computed<any>(() => allJobs.value.find(j => j?.status === 'RUNNING') || null);
/* 提示范围放宽到 step<4：刷新续场会把 step>3 钳回 3（确认预览步），落点在中间步骤的用户
 同样需要重挂入口；进入监控步（step=4）后本条随条件隐没 */
const showReattachHint = computed(() => step.value < 4 && !!runningAdhocJob.value);
function reattachToRunning() {
  const j = runningAdhocJob.value;
  if (j?.jobId) watchJob(String(j.jobId));
}

function reset() {
  stopPolling();
  step.value = 0;
  /* 清场显式失效在途 prepare 世代：在途回包被守卫整体丢弃；其守卫式 finally 会跳过
     过期复位，preparing 须在此显式清（raceGuard858 reset 清 riskBusy 同款，防探测钮卡死） */
  prepSeq += 1;
  preparing.value = false;
  prep.value = null;
  /* 磁盘预估随 prep 一并清场（prep 置 null 后缓存键已换，但同索引新一轮的源数据
     可能已变——删旧索引重建等场景，旧估值不陪下一轮）；在途回包由 seq 失效丢弃 */
  previewEstSeq += 1;
  previewEst.value = null;
  previewEstState.value = 'idle';
  previewEstSource = '';
  /* 执行参数（限流/slices）随清场归缺省（previewEst 同段）：空稿=不发键（恢复到
  默认值等价清除），slices 档位回 auto——否则「再来一次」带着上一轮的限流红字/自定义档误导新一轮 */
  tuningRpsDraft.text.value = '';
  tuningSlicesDraft.text.value = '';
  tuningSlicesCustom.value = false;
  /* 探测失败红条一并入清场清单：清场后红条配着新一轮的干净表单滞留屏上
     （探测失败态与粘贴失败态 pasteErr 同域同律，失败结论不陪下一轮） */
  prepErr.value = '';
  prepErrRaw.value = null;
  job.value = null;
  valReport.value = null;
  confirmDirectSwap.value = false;
  stripNote.value = '';
  /* 深链失联空态与完成校验结果一并清场（不陪下一轮向导） */
  deepLinkMiss.value = false;
  verifyResult.value = null;
  /* 粘贴态与确认门一并复位，否则「再来一次」会带着上一轮的期望配置和
 已勾选的全程挡写知悉，人以为是新的一轮 */
  pasteRaw.value = '';
  pasteErr.value = '';
  pasteWarn.value = '';
  pastePicked.value = '';
  pasteList.value = [];
  pasteIdx.value = -1;
  /* #68：清期望源头即可，cfgDiff 是派生量会自己回到 []（prep 也已置 null）。
 原来这里是 cfgDiff.value = []，那是「手工同步派生状态」的最后一处，
 一并去掉才谈得上「少一处能忘记同步的地方」。 */
  expectedFromPaste.value = '';
  ackFullBlock.value = false;
  pauseBeforeSwitch.value = false;
  /* w80：清场后重新粘贴允许再次自动探测 */
  lastAutoPreparedAlias = '';
  /* F2：「再来一次」整体清场一并熄掉索引名缺失红字 */
  needIndexForManual.value = false;
  /* 风险报告是 loadDateRisks 写入的**非派生**状态（它带一次网络取数，
 做不成 computed），故必须在这里显式清 —— 否则「再来一轮」会把上一个索引的
 风险结论留在屏幕上，配着新索引的名字。riskBusy 同理须在此显式清：
 在途采样被清场后，其守卫式 finally 会认定「已不是选中项」而跳过复位。 */
  riskRows.value = [];
  riskErr.value = '';
  sampledCount.value = 0;
  samplingMode.value = '';
  riskBusy.value = false;
}

/* 热Setting页「转零停机重建」携带 {index, pendingSettings} 上下文预填。
 pendingSettings 为扁平 dot-key 变更集，合并进 prepare 预填的 settingsJson.index；
 上下文损坏时静默忽略，向导零影响。 */
async function applyRouteContext() {
  /* 无显式 ?index= 时回退读全局选中索引——IndexHub 等入口走 store.pick 不传 query，否则落到空向导 */
  const qIndex = typeof route.query.index === 'string' ? route.query.index : (store.pickedIdx || '');
  if (!qIndex) return;
  indexName.value = qIndex;
  await doPrepare();
  if (!prep.value) return;
  /* Mapping 页污染警示条「去零停机重建」携带 stripDsl=污染根清单——
 预剔除这些字段并置 dynamic:false（不防复染的重建等于白做），审编步人工确认后才进重建 */
  const qStrip = typeof route.query.stripDsl === 'string' ? route.query.stripDsl : '';
  if (qStrip && mappingJson.value) {
    try {
      const m = JSON.parse(mappingJson.value);
      const removed: string[] = [];
      for (const root of qStrip.split(',').filter(Boolean)) {
        if (m.properties && m.properties[root]) { delete m.properties[root]; removed.push(root); }
      }
      if (removed.length) {
        m.dynamic = false;
        mappingJson.value = JSON.stringify(m, null, 2);
        stripNote.value = `已自动剔除 ${removed.length} 个疑似 DSL 污染字段（${removed.join('、')}）并置 dynamic:false 防再次污染，确认无误后再继续`;
        store.notify('info', `已剔除 ${removed.length} 个疑似 DSL 污染字段并置 dynamic:false 防再次污染，请在审编步确认`);
      } else {
        /* 零剔除不能静默——prepare/start 走数据面跟随顶栏目标，来源页看到的可能是另一集群的同名索引 */
        stripNote.value = '预填 mapping 中未找到待剔除的污染字段（' + qStrip + '）——本向导的探测与重建作用于顶栏当前选中的目标集群，来源页看到的可能是另一集群的同名索引，请人工核对后再继续';
        store.notify('warning', '未在预填 mapping 中找到待剔除的污染字段，请人工核对（详见审编步提示）');
      }
    } catch { /* mapping 损坏→保持 prepare 原样，人工审编 */ }
  }
  const qPending = typeof route.query.pendingSettings === 'string' ? route.query.pendingSettings : '';
  if (qPending) {
    try {
      const pending = JSON.parse(qPending) as Record<string, any>;
      const parsed = settingsJson.value ? JSON.parse(settingsJson.value) : {};
      if (!parsed.index || typeof parsed.index !== 'object') parsed.index = {};
      let applied = 0;
      for (const [k, v] of Object.entries(pending)) {
        const key = k.startsWith('index.') ? k.slice('index.'.length) : k;
        setDotted(parsed.index, key, v);
        applied++;
      }
      settingsJson.value = JSON.stringify(parsed, null, 2);
      if (applied) store.notify('info', `已带入 ${applied} 项待应用 setting，请在审编步确认`);
    } catch { /* 上下文损坏→仅预填索引名 */ }
  }
  step.value = 1;
}

function setDotted(obj: any, dotPath: string, v: any) {
  const parts = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  const leaf = parts[parts.length - 1];
  if (v === null) delete cur[leaf]; else cur[leaf] = v;
}

/* 草稿（w24）：切页返回不再弹回第一步。三态：
 ① 显式 ?index= 上下文（热Setting/Mapping 页转入）→ 按上下文开新流程（用户带着新意图来，旧稿让位）；
 ② 无 query 但有可恢复草稿（step>0 的向导现场）→ 续现场：保步骤，静默重拉 prep 重建服务端派生态，
 审编/策略等用户编辑稿一律不覆写（doPrepare 的覆写路径只在显式开流时走）；
 ③ 全新进入（无 query 无稿）→ 维持旧行为回落全局选中索引预填。 */
/* 进入裁决(整页导航与 SPA 内重入共用):
 ① 显式 ?index= 上下文(且非同索引返回) → 按上下文开新流程,用后即清 query;
 ② 有现场(到过 step≥1 或 step0 输过索引名) → 续现场;
 ③ 全新 → 回落全局选中索引预填。 */
function adjudicateEntry() {
  /* 深链 ?jobId= 优先于 ?index=：直接定位该作业的执行监控（等价页内 Eye 动作），
   * query 用后即清；作业不在清单时由 watchJob 深链分支落「作业不存在或已清理」空态 */
  const qJobId = typeof route.query.jobId === 'string' ? route.query.jobId.trim() : '';
  if (qJobId) {
    watchJob(qJobId, true);
    router.replace({ query: {} }).catch(() => {});
    return;
  }
  const hasQueryCtx = typeof route.query.index === 'string' && !!route.query.index;
  const hasRestoredScene = step.value > 0 || !!indexName.value;
  /* w27:同一个索引的 query 重入 = 用户从原入口回来看现场,不是新意图 —— 不重置;
 换了索引才是带着新意图来,才走上下文重置。 */
  const sameIndexReturn = hasQueryCtx && hasRestoredScene
    && String(route.query.index) === indexName.value && step.value > 1;
  if (hasQueryCtx && !sameIndexReturn) {
    applyRouteContext().then(() => {
      /* 一次性上下文用后即清(同 dsl.carry 惯例):浏览器回退/侧栏返回不再带着旧 query
 重复触发重置——这正是「切页回来跳回第一步」的第二病根。 */
      router.replace({ query: {} }).catch(() => {});
    });
  } else if (hasRestoredScene) resumeScene();
  else applyRouteContext();
}

/* KeepAlive 回流：视图被缓存时 mounted 不再触发，直通契约改由 activated 消费 */
onActivated(() => { consumeRebuildHandoff(); });

onMounted(() => {
  /* 1125：挂载期读取（作业清单 + 入口裁决里的 prepare/体检采样）同样要过身份门——
     宿主换 token 的窗口里 probed 未落地，旧 target 的作业行/源档案会先拉回来，
     在「作业列表」里呈现出上一账号的现场。不放行则挂起，身份落地补跑一次。 */
  if (adhocReady()) { consumeRebuildHandoff(); loadJobs(); adjudicateEntry(); }
  else adhocPendingBoot = true;
});

/** 与 DslQuery autoRunAllowed 同口径（无鉴权/探测未启动视同身份已定） */
const adhocReady = () => auth.authDisabled || !auth.probeStarted
  || (auth.probed && auth.me != null && auth.canReadPage('adhoc-rebuild', store.target));
let adhocPendingBoot = false;
watch(() => [auth.probed, auth.authDisabled, auth.me?.username, store.target], () => {
  if (!adhocPendingBoot || !adhocReady()) return;
  adhocPendingBoot = false;
  consumeRebuildHandoff();
  void loadJobs();
  adjudicateEntry();
});

/* w29:SPA 内点带 ?index= 的链接进入时组件已挂载、onMounted 不再跑——此前 query 完全无响应。
 仅在 query.index 「从空到有」或「值变化」时裁决;消费后的清空(有→无)不触发。
 同索引返回仍由 sameIndexReturn 保护,不会被这条 watch 意外重置。 */
watch(() => route.query.index, (nv, ov) => {
  if (nv === ov) return;
  if (typeof nv === 'string' && nv) adjudicateEntry();
});

/* 续现场：执行监控步（job 为内存态、跨页不存）钳回确认预览；step>0 时 prep 必须补拉——
 后续步骤的源物理名/文档数等展示都依赖它。只填 prep，不碰任何用户编辑稿。 */
async function resumeScene() {
  if (step.value > 3) step.value = 3;
  /* w27:riskRows/pasteList 是内存态,重挂载即失——体检结果「第一回有、第二回没了」的根因。
 现场还在(pasteList 有选中项)时重跑采样体检,让回到向导的人始终看到同一份风险报告。 */
  if (pasteIdx.value >= 0 && pasteList.value[pasteIdx.value] && !riskRows.value.length && !riskBusy.value) {
    loadDateRisks(pasteList.value[pasteIdx.value]);
  }
  if (!prep.value && indexName.value) {
    /* 与 doPrepare 同一条世代守卫：挂载续场的补拉在途时用户手动探测，慢回包不得覆写新 prep */
    const seq = ++prepSeq;
    preparing.value = true;
    try {
      const p = await api.adhoc.prepare(indexName.value);
      if (seq !== prepSeq) return;
      prep.value = p;
    } catch {
      if (seq !== prepSeq) return;
      prep.value = null; /* 目标不可达等：保留现场可看，续走时 doPrepare/doStart 自会再报 */
    } finally {
      if (seq === prepSeq) preparing.value = false;
    }
  }
  /* 只补空、不覆写：用户没编辑过的字段从 prep 回填(等价首次预填),
 编辑过的草稿(粘贴/手改)原样保留——与 doPrepare 的「粘贴优先」同一条红线。 */
  if (prep.value) {
    if (!settingsJson.value) settingsJson.value = prettyJson(prep.value.settingsJson || '');
    if (!mappingJson.value) mappingJson.value = prettyJson(prep.value.mappingJson || '');
    if (!destIndex.value) destIndex.value = prep.value.suggestedDest || '';
    if (!timeField.value) timeField.value = prep.value.timeFieldCandidates?.[0]?.field || '';
  }
}
/* 两个定时器都必须随组件卸载停掉 —— 卸载后还在跑的 setInterval 是泄漏，
 且 blockNow 每秒写一次会让已销毁组件的 computed 继续被触发。
 visibilitychange 监听一并摘除（与注册同生命周期）。 */
onBeforeUnmount(() => { stopPolling(); stopBlockTicker(); document.removeEventListener('visibilitychange', onBlockVisChange); });
</script>

<style scoped>
/* 页根改 flex+gap 承担区块间距（原 .card margin-bottom:14px 随局部重声明一并退役）；
 页头/草稿徽标行/步骤条的旧 margin-bottom 同步归零，避免与 gap 双重叠加 */
.ahr { display: flex; flex-direction: column; gap: var(--sp-4); position: relative; }
.ahr > .ph { margin-bottom: 0; }
/* P2：执行进度条（ind-bar 全站范式，DevTools dt-progress 同款 absolute 零高度占位
 纯 CSS 动画）——preparing/validating/starting 三执行链任一在途即点亮 */
.ar-progress { position: absolute; top: 0; left: 0; right: 0; color: var(--ac); }
/* 索引芯片（xm-idx-go 同款） */
.ad-idx-go {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; padding: 0; margin-left: 5px; vertical-align: middle;
  border: 1px solid var(--line); border-radius: var(--r-xs);
  background: var(--bg1); color: var(--tx2); cursor: pointer; transition: all .12s;
}
.ad-idx-go:hover { color: var(--ac-hi); border-color: var(--ac-line); background: var(--ac-soft); }
/* 草稿：恢复徽标行（间距归 .ahr 页 gap，仅保留左侧对齐缩进） */
.ar-draft-row { margin: 0 0 0 var(--sp-0); }

/* 页头四件套已收敛 PageHeader 组件（.ph 系列，--sp token 版），本地旧值块删除 */

.steps { display: flex; align-items: center; gap: var(--sp-1); flex-wrap: wrap; }
.step { display: flex; align-items: center; gap: var(--sp-1h); padding: 5px var(--sp-2h); border-radius: 7px; font-size: var(--fs-sm); color: var(--tx2); cursor: default; }
.step.done { color: var(--ok); cursor: pointer; }
.step.locked { cursor: default !important; }
.step.locked:hover { background: transparent; }
/* F1：作业执行中监控步的反向入口提示——虚线描边标示「点这里回到监控」 */
.step.retmon { cursor: pointer; border: 1px dashed var(--info-line); }
.step.retmon:hover { background: var(--bg1); }
/* sem-rm：当前步走 ac 语义档（运行中→ac 标准）——品牌柔底+描边+实心序号圆，
 与 done(ok 绿)/待办(中性灰) 构成三态语言；retmon 虚线 info 蓝保持导航提示 */
.step.act { color: var(--ac); background: var(--ac-soft); border: 1px solid var(--ac-line); font-weight: 600; }
.step.act .s-num { background: var(--ac); border-color: var(--ac); color: var(--bg0); font-weight: 650; }
.s-num { display: inline-flex; align-items: center; justify-content: center; width: 17px; height: 17px; border-radius: 50%; border: 1px solid currentColor; font-size: var(--fs-xs); }
.s-arrow { color: var(--tx2); margin-left: var(--sp-1); }

/* 卡壳与卡头走 theme.css 全局 .card/.card-t（radius 归 --r-l、卡头归 13px/650）：
 卡片间距由 .ahr 页 gap 承担，不再用 margin-bottom 散值 */
/* 卡壳退壳（ P2，Xmigrate 551 先例同刀）：六个步卡/作业卡全局 .card 壳
 （border+bg+radius，theme.css:375）退役 → border-top 分节；卡留白由 .ar-sec 落位 padding 承接，
 语义边框（危险操作描边等）豁免保留；页根 .ahr flex gap 继续承担区块间距 */
.ar-sec { border-top: 1px solid var(--border); padding: var(--sp-3) var(--sp-4); }
.right { margin-left: auto; }
.row { display: flex; align-items: center; gap: var(--sp-2); margin: var(--sp-2h) 0; flex-wrap: wrap; }
/* 目标物理索引名输入 TextInput 化：flex 占位语义由输入件根容器承接
   （grow 皮肤类仍随 inputClass 保留在真实 input 上，选择器锚不漂移） */
.row > .ti { flex: 1; min-width: 260px; }
.lbl { font-size: var(--fs-sm); color: var(--tx2); }
.num { width: 110px; }
/* 时间字段下拉宽度档（原 select.sel 同值随 NSelect 迁移保留；select 元素退役后
 theme.css select[class] 自绘箭头规则不再命中本类——NSelect 自带箭头） */
.sel { min-width: 220px; }
/* slices 档位下拉（NSelect）：与限流数字框同行，收窄不挤占（2 档短清单） */
.ar-tuning-sel { min-width: 140px; }
.next { margin-top: var(--sp-2h); }
/* sem-rm 智能纠错：目标物理索引名即时红字（贴近输入行，err 档） */
.ar-dest-err { margin: -4px 0 var(--sp-2); font-size: var(--fs-sm); color: var(--err); line-height: 1.5; }

.probe { display: flex; flex-direction: column; gap: var(--sp-1h); margin: var(--sp-2h) 0; }
.p-row { display: flex; gap: var(--sp-3); font-size: var(--fs-sm); align-items: baseline; }
.p-row > span:first-child { color: var(--tx2); min-width: 90px; flex-shrink: 0; }
.ok-txt { color: var(--ok); }
.warn-txt { color: var(--warn); }
.err-txt { color: var(--err); }
/* 时间字段候选可点 chip（形态归全局 .chip/.chip.on，本类只管换行排布） */
.ar-tf-chips { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
.ar-tf-chip { cursor: pointer; }

/* 固定等分 grid 退役——对照双栏交给 WorkbenchLayout（拖拽/预设/记忆/窄屏堆叠） */

/* P2：.ed-label 基础档退役——类型归全局 .sec-t（.ar-diff/.report 分节标题挂类升档，
 行首横排 fs-sm/600/tx1），本类只留落位；.ed-col pane 标题走下方既有升档规则不波及 */
.ed-label { margin-bottom: var(--sp-1); }
/* W4：AR_ED 竖排标题轨退役随之——pane 内 settings/mapping 行首标题升 sec-t 档
 （fs-sm/600/tx1，.ar-manual-lb 同档）；作用域限 .ed-col（pane 实例），.ar-diff 的 .ed-label 不受影响 */
.ed-col .ed-label { font-size: var(--fs-sm); font-weight: 600; color: var(--tx1); }
/* ed-col 吃满 pane：slot 直接落在 ResizablePane 的 .rp-content（display:block，无 flex 上下文，
 data-flex-fill/flex:1 均无效——曾因此编辑器塌到 5px 完全无法编辑）。block 父层用 height:100%
 直取 rp-content 确定高度，JsonArea fill 模式内 monaco-host flex:1 跟随。 */
.ed-col { display: flex; flex-direction: column; height: 100%; min-height: 0; }
/* JsonArea .ja 外框视图侧退壳（border:none/radius:0 独立规则追加，
 JsonArea 组件零触）——手动/审编四框在 .ed-col pane 内、粘贴导入框在弹窗 .pi-ja-wrap 内
 （NModal teleport 到 body，类锚与内容同渲染树，scoped :deep 经祖先类命中）。
 卡内卡双层描边根治；背景/圆点/工具条等组件内语义零触 */
.ed-col :deep(.ja) { border: none; border-radius: 0; box-shadow: none; }
.pi-ja-wrap :deep(.ja) { border: none; border-radius: 0; box-shadow: none; }
/* P2：ar-fill-wl 定高档（554-P0 为 fill 链补的 max(280px,40vh) 宿主确定档）随
 高度档退役——四 JsonArea 已摘 fill 改 rows 驱动（Monaco 高度=rows*19+16 纯内容函数，
 无 height:100% 解析路径，塌陷成因整体消失），pane 高度交内容自撑复归 547 裁决；
 类保留作 DOM 锚（411/426/锚字面） */
/* 标明这份 mapping 来自注解推导而非业务侧 @Mapping 原文。
 推导徽标改用 StatusPill b 档（ 语义走组件 title 同步更新），私造规则退役。 */
/* w80：.ta 裸 textarea 死样式删除（textarea 已退役 JsonArea/Monaco，模板零引用） */

.strats { display: flex; flex-direction: column; gap: var(--sp-2); }
.strat { display: flex; gap: var(--sp-2h); padding: var(--sp-2h) var(--sp-3); border: 1px solid var(--line); border-radius: var(--r-m); cursor: pointer; }
.strat.sel { border-color: var(--ac-hi); background: var(--ac-soft); }
.strat.dis { opacity: .45; cursor: not-allowed; }
.strat strong { font-size: var(--fs-sm); color: var(--tx0); font-weight: 650; } /* ：步骤标题 b→strong 语义清理；b 全站 650 兜底不盖 strong，字重同步更新本规则保视觉零变化 */
.strat p { margin: 3px 0 0; font-size: var(--fs-xs); color: var(--tx2); line-height: 1.5; }
.chk { display: flex; align-items: center; gap: 7px; font-size: var(--fs-sm); color: var(--tx1); margin: var(--sp-2h) 0; cursor: pointer; }

/* 自造 st-tag/st-running/st-succeeded/st-done/st-failed/st-aborted 徽标系统退役——
 状态 pill 统一走 theme.css 全局 .pill + utils/statusColor（ W4：
 SUCCEEDED/ABORTED 语义档已上提进 statusColor 枚举本身）。
 轮次阶段标签（info 私造底）亦改用 StatusPill b 档，规则随之退役。 */
/* 状态枚举英文小字（中文主体后缀，XmigrateView .xm-st-en 同款）。
 改用 StatusPill 后，监控步/作业表状态 pill 的小字视觉由组件 .sp-en 承担
 （.ar-st-en 仅作 DOM 锚外挂于 pill 根）；起轮次徽标小字亦归组件，本页
 不再自携小字样式 */

/* ═══ 后台通知偏好组（监控卡头，useJobNotify）：标题闪烁开关 + 桌面通知授权钮 ═══ */
.ar-notify-pref { display: inline-flex; align-items: center; gap: var(--sp-1h); margin-left: var(--sp-2); }
.ar-notify-title { font-size: var(--fs-xs); color: var(--tx2); }

.tbl { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); margin-top: var(--sp-2); }
/* W10：font-weight:400 页内覆写删除——表头字重回 theme.css 全局 .tbl th 600 基线
 （Security 同款由 W9 处理）；本行其余紧凑档（padding/边框）保留，布局零漂移。
 P2：--sp 收口——8px 归 var(--sp-2)（5px 非档位奇数刻意值保字面；
 w10ReduceSteps525/adhocWave544/ 三锁同步更新改锚） */
.tbl th { text-align: left; padding: 5px var(--sp-2); color: var(--tx2); border-bottom: 1px solid var(--line); }
.tbl td { padding: 5px var(--sp-2); border-bottom: 1px dashed var(--line); }
.danger { color: var(--err); }

/* W1：最近作业工具行（kw 过滤 + 清除 + 命中数） */
.ar-jobs-tools { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-2); flex-wrap: wrap; }
/* 2026-11-21 对账批：健康摘要条（表上方，已加载 jobs 前端派生；空清单 v-if 隐藏） */
.ar-health { display: flex; align-items: center; gap: var(--sp-1h); margin-top: var(--sp-2); flex-wrap: wrap; }
.ar-health-chip { font-variant-numeric: tabular-nums; }
.ar-health-ok { color: var(--ok); }
.ar-health-bad { color: var(--err); }
.ar-health-gate { color: var(--warn); }
/* 监控步导出/以此参数新建动作行（ghost 钮组） */
.ar-export-row { display: inline-flex; gap: var(--sp-2); flex-wrap: wrap; }
/* 重跑参数覆盖弹层（2026-11-21 对账批）：三行两列（标签+数字框）+ 参数预设行 */
.ar-retry-form { display: flex; flex-direction: column; gap: var(--sp-2); }
.ar-retry-row { display: flex; align-items: center; gap: var(--sp-2); }
.ar-retry-row .lbl { min-width: 96px; flex-shrink: 0; }
/* 预设行控件多（下拉+名+两钮），窄弹层内允许换行不断溢出 */
.ar-retry-preset { flex-wrap: wrap; }
.ar-preset-sel { width: 160px; }
/* 预设名输入 TextInput 化：定宽落统一件壳（壳默认 width:100% 在 wrap 行会独占一行，改壳 flex 预算） */
.ar-retry-preset :deep(.ti) { flex: 0 1 110px; }
/* 收尾报告对账条（.p-row 已有排版，这里只补落位） */
.ar-reconcile { margin: var(--sp-1) 0; }
/* width:240px → min(240px,100%) 极窄溢出钳制（547 XmigrateView:1291 同款；
 900 档 100% 独占行不变；改用 SFB 后类锚随 input-class 留在 input 上） */
.ar-jobs-kw { width: min(240px, 100%); }
/* SFB 胶囊壳落位宽（TasksView tv-kw-wrap 先例；box-sizing 含壳边框） */
.ar-jobs-kw-wrap { width: min(240px, 100%); box-sizing: border-box; }
.ar-jobs-hit { font-size: var(--fs-xs); }
/* W-B：.ar-jobs-nomatch 空态行随裸表退役——过滤空集由 QRT EmptyState
 （emptyText/emptyHint 动态分档）承担，换壳勿留双份 */
/* 状态 pill 漏斗：可点（漏斗语义）+ 按下态描边（该状态筛选中） */
.pill.ar-st-funnel { cursor: pointer; }
.pill.ar-st-funnel[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--ac-line); }
/* 877 对称对齐：tbody 数字列与 tfoot Σ 同右轴（QRT num-col 全站语言：表头左/数值右/
聚合右）——原表体左对齐致 Σ 与其所合计的数字不共纵轴；阶段胶囊列（第 2 列）除外 */
.ar-rounds tbody td:nth-child(1), .ar-rounds tbody td:nth-child(n+3) { text-align: right; font-variant-numeric: tabular-nums; }
/* 轮次表 Σ 聚合行（DiagView dg-agg 同语言：bg2 底+顶部分隔线，数值右对齐） */
.ar-rounds-agg-row td { background: var(--bg2); border-top: 1px solid var(--line-strong); white-space: nowrap; padding: 5px var(--sp-2); font-size: var(--fs-xs); }
.ar-agg-lb { color: var(--tx2); }
.ar-rounds-agg-num { text-align: right; font-variant-numeric: tabular-nums; color: var(--tx1); }

/* 事件时间线（轮次表旁）：竖向轨道（左侧 2px 线）+ ts/stage 徽标/detail 三段；
 GATE_* 行琥珀行高亮（确认门轨迹一眼可辨），终态着色由 StatusPill tone 承担。
 2026-11-21 对账批：容器限高内滚（自动滚动开关的滚动宿主），长作业时间线不再撑页高 */
.ar-events { margin-top: var(--sp-3); }
.ar-events-t { margin-bottom: var(--sp-2); }
.ar-events-err { font-size: var(--fs-xs); color: var(--err); }
.ar-events-line { display: flex; flex-direction: column; gap: var(--sp-0); border-left: 2px solid var(--line); padding-left: var(--sp-2); margin-left: var(--sp-1); max-height: max(240px, 42vh); overflow-y: auto; }
/* 标题行尾工具组：筛选芯片（全局 .chip 形态）+ 关键字搜索 + JSONL 导出 + 自动滚动开关 */
.ar-ev-tools { display: inline-flex; align-items: center; gap: var(--sp-1); margin-left: var(--sp-2); flex-wrap: wrap; }
.ar-ev-fchip { cursor: pointer; }
.ar-ev-autoscroll { margin-left: var(--sp-2); font-size: var(--fs-xs); color: var(--tx2); }
/* 关键字搜索（XmigrateView .xm-ev-kw 同款窄输入）与导出钮随工具行内联 */
.ar-events :deep(.ar-ev-kw) { width: min(150px, 100%); font-size: var(--fs-xs); padding: var(--sp-0) var(--sp-1h); }
.ar-ev { display: flex; align-items: baseline; gap: var(--sp-2); padding: var(--sp-0) var(--sp-1h); font-size: var(--fs-xs); cursor: pointer; }
.ar-ev:focus-visible { outline: 2px solid var(--ac); outline-offset: -2px; }
.ar-ev.gate { background: color-mix(in srgb, var(--warn) 12%, transparent); }
/* 回放当前事件：品牌左轨常驻到播放推进（与闸门行底色可叠加） */
.ar-ev-current { background: color-mix(in srgb, var(--ac) 9%, transparent); box-shadow: inset 2px 0 0 var(--ac); }
.ar-ev-replay.on { border-color: var(--ac-line); color: var(--ac); background: var(--brand-soft); }
.ar-ev-tools .chip:disabled, .ar-ev-tools .btn:disabled { opacity: .45; cursor: default; }
/* 窄档：事件行两段式（时间+阶段一行，详情整行），阶段词不逐字竖排 */
@media (max-width: 600px) {
  .ar-ev { flex-wrap: wrap; align-items: center; row-gap: var(--sp-0); }
  .ar-ev :deep(.pill) { white-space: nowrap; flex: 0 0 auto; }
  .ar-ev-stage { flex: 0 0 auto; }
  .ar-ev-detail { flex: 1 1 100%; }
}
.ar-ev-ts { color: var(--tx2); flex-shrink: 0; }
.ar-ev-stage { flex-shrink: 0; }
.ar-ev-detail { color: var(--tx2); word-break: break-all; }
/* 单事件钻取展开区（XmigrateView .xm-ev-detail 孪生口径：bg1 底+左线+限高内滚全文） */
.ar-evd { display: flex; flex-direction: column; gap: var(--sp-1); margin: var(--sp-0) 0 var(--sp-1h); padding: var(--sp-1) var(--sp-2); background: var(--bg1); border-left: 2px solid var(--ac-line); border-radius: var(--r-xs); }
.ar-evd-meta { display: flex; align-items: center; gap: var(--sp-1h); flex-wrap: wrap; color: var(--tx2); font-size: var(--fs-2xs); }
.ar-evd-msg { margin: 0; white-space: pre-wrap; word-break: break-all; font-size: var(--fs-xs); color: var(--tx1); max-height: 200px; overflow-y: auto; }
/* 跨天分组段头（dayLabel：今天/昨天/MM-DD）——与 XmigrateView .xm-ev-day 孪生口径
（fs-2xs/tx1/吸顶），吸顶底色取 n-card 容器底（modal 上下文 var(--n-color) 不露深色块） */
.ar-ev-day { font-size: var(--fs-2xs); color: var(--tx1); padding: var(--sp-1) var(--sp-1h) var(--sp-0); font-weight: 600; position: sticky; top: 0; background: var(--n-color, var(--bg1)); z-index: 1; }
.ar-ev-day + .ar-ev { padding-top: var(--sp-0); }
/* 速率趋势迷你线挂载点（Tip 包裹，行内随观测文案） */
.ar-rate-spark { vertical-align: middle; margin-left: var(--sp-1); }
/* 全量进度统一进度条撑满余宽（ProgressTrack xs 档 4px 高，对齐原内联高度） */
.ar-reindex-track { flex: 1; }

.report { margin-top: var(--sp-3); padding-top: var(--sp-2h); border-top: 1px dashed var(--line); }

/* stripDsl 预剔除结果常驻提示（样式对齐 MappingFieldTree 的污染警示条） */
.strip-note {
  display: flex; align-items: center; gap: var(--sp-2); padding: 7px var(--sp-3); margin-bottom: var(--sp-2h); font-size: var(--fs-sm);
  color: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 35%, var(--line));
  background: var(--warn-soft); border-radius: var(--r-m);
}
/* 监控轮询连续失败黄条（strip-note 同谱系 warn 软档）：数据可能已过期时在监控卡头部明示 */
.ar-poll-stale {
  display: flex; align-items: center; gap: var(--sp-2); padding: 7px var(--sp-3); margin-bottom: var(--sp-2h); font-size: var(--fs-sm);
  color: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 35%, var(--line));
  background: var(--warn-soft); border-radius: var(--r-m);
}

/* 内嵌校验面板。：260px 定高 → max(240px, 42vh) 弹性档（同 .ar-diff 42vh 站内口径：
 大屏随视口撑高报告可视区，240px 保底）。 W4：bg0+四边 border 圆角壳退役（卡中卡降层）
 → border-top 分节（xm-group 同刀），内容直贴卡片流；max(240px, 42vh) 滚动钳制口径原样保留 */
.val-box { margin: var(--sp-2h) 0; padding: var(--sp-2h) 0 0; border: 0; border-top: 1px solid var(--line); max-height: max(240px, 42vh); overflow: auto; }
/* 报告头组件化（CV cv-rp-hd 同款三件并排）：主徽章/计数 pill/耗时徽章色档字重全归组件，
 壳类只管横排与换行（flex-wrap 窄屏不挤爆）；Dry-run 目标段尾随 dim */
.val-hd { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-1h); margin-bottom: var(--sp-1h); font-size: var(--fs-sm); color: var(--tx1); }
.val-hd-dry { margin-left: var(--sp-1h); }
.val-iss { display: flex; gap: var(--sp-2); align-items: baseline; padding: 3px 0; font-size: var(--fs-sm); line-height: 1.5; }
/* W10：.val-sev 基础块+三档色块退役——severity 徽标统一 .pill（theme.css 423 起），
 基础档（尺寸/圆角/配色）全由 .pill 承担，本文件只保留 flex 行内不被压缩的布局属性。
 栅格对齐：sev 徽章 en 小字（ERROR/WARN/INFO）长度不一导致错误码列起点错位——
 min-width 定宽收齐（76px 为视觉刻意值豁免保字面，.card 14px 先例同款；--sp 梯无此档） */
.val-iss .pill { flex-shrink: 0; min-width: 76px; }
/* 错误码 chip 化（span.mono→code）：容器皮（bg2/内距/圆角/长串换行）吃全局 code:not(pre code) 档 */
.val-code { flex-shrink: 0; font-size: var(--fs-xs); color: var(--tx2); }
/* 正文列弹性吃满 + 允许收缩（长 mono 路径换行由全局 code 档 overflow-wrap 承接） */
.val-msg { flex: 1; min-width: 0; }
.val-path { color: var(--info); margin-right: var(--sp-1h); font-size: var(--fs-xs); }
/* 修复目标键 chip（fix.key / ADD 的 key=value）：紧贴修复钮前，chip 皮吃全局 code 档 */
.val-fixkey { flex-shrink: 0; }
/* bg0+border+radius 独立代码盒退役 → 柔底承接（uq-result ：内容面
 bg2 豁免可保底色，去 border+radius 卡中卡降层；pre 排版/换行语义零触）。
 补 max(240px, 42vh) 滚动钳（.val-box/.ar-diff 同站内口径）——backfill DSL
 超长时容器内滚动，不再把收尾报告撑出页高 */
.dsl { margin: var(--sp-2) 0 0; padding: var(--sp-2h) var(--sp-3); background: var(--bg2); border: 0; font-size: var(--fs-xs); white-space: pre-wrap; max-height: max(240px, 42vh); overflow: auto; }


/* 从业务侧粘贴期望配置 */
/* w68:手动输入折叠区 */
/* w69:双 Tab 输入模式切换 */
/* 双 Tab 输入模式降全局 seg 档（theme.css .seg 形态：bg2 底+2px 内衬+小 gap+
 --r-m 圆角，on 态 bg3 浮起）——border+通栏大圆角壳与按钮常驻底色退役。
 字面锁 `<div class="ar-input-tabs">`，故以本地规则对齐 seg 档而非挂全局类。
 P2：--sp 收口——容器行 gap/padding 2px 同为 --sp-0 等值（原 534 契约整行锁
 同步更新改锚，w10/adhocWave544/ 同步同步更新） */
.ar-input-tabs { display: inline-flex; gap: var(--sp-0); padding: var(--sp-0); background: var(--bg2); border-radius: var(--r-m); margin-bottom: var(--sp-3); }
.ar-input-tabs button {
  /* W4：--sp 精确等值收口（4=--sp-1、12=--sp-3）；容器行 gap/padding 2px 同为
 --sp-0 等值，但 rebuildFlat534:49 逐字锁 + 对该 spec 仅追加权限 → 保字面（锁面优先） */
  padding: var(--sp-1) var(--sp-3); border: 0; background: transparent; color: var(--tx1);
  font-size: var(--fs-sm); font-weight: 500; cursor: pointer; transition: all var(--tr);
  border-radius: var(--r-s); font-family: var(--font);
}
.ar-input-tabs button:hover { color: var(--tx0); }
.ar-input-tabs button.on { background: var(--bg3); color: var(--tx0); box-shadow: 0 1px 3px rgba(0,0,0,.3); font-weight: 600; }
/* w77:引导高亮 — 提醒用户需要填索引名 */
.ar-highlight { outline: 2px solid var(--ac); border-radius: var(--r-m); animation: ar-pulse 0.8s ease-in-out 3; }
/* w80：品牌色硬编码 rgba(20,184,166,.15)→token 派生——主题换肤/浅色档不再脱钩 */
@keyframes ar-pulse { 50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--ac) 15%, transparent); } }

/* ar-manual 编辑器外框（bg0+border 壳直包 Workbench 双编辑器）退役——内容直贴
 卡片流（扁平语言）；引导标题升 fs-head 档（card-t 同档 fs-md/650）行首横排 */
.ar-manual-hd { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2h); }
.ar-manual-hd strong { font-size: var(--fs-md); font-weight: 650; color: var(--tx0); letter-spacing: var(--ls-tight); } /* ：b→strong 选择器同步更新 */
/* 固定等分 grid 退役——对照双栏交给 WorkbenchLayout。
 行首已填/留空徽标改用 StatusPill n 档，私造规则退役（色档归 pill 单源） */
.ar-manual-lb { display: flex; align-items: center; gap: var(--sp-1h); font-size: var(--fs-sm); color: var(--tx1); margin-bottom: var(--sp-1); font-weight: 600; }
.ar-manual-act { display: flex; align-items: center; gap: var(--sp-2h); margin-top: var(--sp-2h); }
/* F2：索引名缺失常驻红字（颜色复用 .ar-paste-err） */
.ar-manual-idx-miss { margin-top: var(--sp-2); font-size: var(--fs-sm); font-weight: 600; }

/* ar-paste 编辑器外框（bg0+border 壳直包 Monaco）退役——Monaco 直贴卡片流；
 ⚠Monaco height="min(60vh, 420px)" 字面被 rebuildThreeState/adhocDerivedMapping/
 锁，只去壳不改字面；引导标题升 fs-head 档行首横排 */
.ar-paste { margin-bottom: var(--sp-3); }
.ar-paste-hd { display: flex; align-items: center; gap: var(--sp-1h); margin-bottom: var(--sp-2); }
.ar-paste-hd strong { font-size: var(--fs-md); font-weight: 650; color: var(--tx0); letter-spacing: var(--ls-tight); } /* ：b→strong 选择器同步更新 */
.ar-paste-hd .hint { color: var(--tx2); font-size: var(--fs-xs); margin-left: auto; }
.ar-paste-act { display: flex; align-items: center; gap: var(--sp-2h); margin-top: var(--sp-2); flex-wrap: wrap; }
/* 三态必须三色：解析失败(红) / 成功但无 mapping(琥珀) / 成功(绿)。
 err 与 warn 同色会让「失败」和「成功但要留意」长得一样，拆 pasteWarn 就白拆了。 */
.ar-paste-err { color: var(--err); font-size: var(--fs-sm); }
.ar-paste-warn { color: var(--warn); font-size: var(--fs-sm); }
.ar-paste-ok { color: var(--ok); font-size: var(--fs-sm); }
.ar-paste-list { display: flex; flex-wrap: wrap; gap: var(--sp-1h); margin-top: var(--sp-2); }

/* / ：date 兼容风险报告（与 .ar-diff 同款分区样式，不再是卡中卡） */
.ar-risk { margin-top: var(--sp-3); }
.ar-risk-hd { display: flex; align-items: center; gap: var(--sp-1h); margin-bottom: var(--sp-2); }
.ar-risk-hd .hint { color: var(--tx2); font-size: var(--fs-xs); margin-left: auto; }
.ar-risk-err { color: var(--err); font-size: var(--fs-sm); margin-bottom: var(--sp-2); }
/* 私造错误壳退役（border/err-soft/radius/排版归 theme.css .err-bar 单源，
 557 IH .ih-qerr 同刀），类名保留作 DOM 锚，只留落位 margin */
.ar-probe-err { margin-top: var(--sp-2h); }
.ar-risk-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--sp-1h);
  padding: var(--sp-1h) 0; border-top: 1px solid var(--line); font-size: var(--fs-sm); }
.ar-risk-lv { font-weight: 600; text-transform: uppercase; font-size: var(--fs-2xs); }
.ar-risk-row.error .ar-risk-lv { color: var(--err); }
.ar-risk-row.warning .ar-risk-lv { color: var(--warn); }
.ar-risk-row.info .ar-risk-lv, .ar-risk-row.ok .ar-risk-lv { color: var(--tx2); }
.ar-risk-code { color: var(--tx2); font-size: var(--fs-xs); font-family: var(--mono, ui-monospace, monospace); }
.ar-risk-reason { flex: 1 1 100%; color: var(--tx1); line-height: 1.5; }
/* 等宽 + 可选中：人要复制这段照着改代码，不许截断、不许禁选。
 bg0+border+radius 独立代码盒退役 → 柔底承接（.dsl 同刀，uq-result ；
 user-select:text 可选中语义零触） */
.ar-risk-fix { flex: 1 1 100%; margin: var(--sp-1) 0 0; padding: var(--sp-2); background: var(--bg2);
  border: 0; white-space: pre-wrap;
  word-break: break-word; user-select: text; font-size: var(--fs-xs); line-height: 1.5;
  font-family: var(--mono, ui-monospace, monospace); }

/* / spec 全程挡写警告 */
.ar-warn-window {
  display: flex; align-items: center; gap: var(--sp-2h); flex-wrap: wrap; margin-top: var(--sp-2h); padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-s); font-size: var(--fs-sm);
  border: 1px solid color-mix(in srgb, var(--warn) 35%, var(--line));
  background: var(--warn-soft);
}
.ar-warn-window .ar-warn-ack { margin-left: auto; display: flex; align-items: center; gap: 5px; cursor: pointer; }

/* ═══ 执行参数小区（限流/slices，步 2）——「缺省不发键」协议表单容器 ═══ */
.ar-tuning { margin-top: var(--sp-2h); }
.ar-tuning-t { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--sp-1h); font-size: var(--fs-sm); font-weight: 600; color: var(--tx1); margin-bottom: var(--sp-1h); }
.ar-tuning-t .hint { color: var(--tx2); font-size: var(--fs-xs); font-weight: 400; }

/* ═══ 失败文档样本（failures 数组，缺席不渲染）——行密度照 .ar-risk-row 抄，err 色档 ═══ */
.ar-failures { margin-top: var(--sp-2h); }
.ar-failures-t { display: inline-flex; align-items: center; gap: var(--sp-1h); background: none; border: 0; padding: 0; cursor: pointer; color: var(--err); font-size: var(--fs-sm); font-weight: 600; }
.ar-failures-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--sp-1h); padding: var(--sp-1h) 0; border-top: 1px solid var(--line); font-size: var(--fs-xs); color: var(--tx1); word-break: break-word; user-select: text; }
.ar-failures-lv { color: var(--err); font-weight: 600; }
/* ═══ 失败聚类区（type+reason 首行归一）：胶囊摘要行（N 类 · top3 计数占比）+
   展开后的分组明细（每组计数 + 首条完整样本，多行 reason 原样换行）═══ */
.ar-fcluster { margin-bottom: var(--sp-1h); }
.ar-fcluster-sum { display: inline-flex; align-items: baseline; gap: var(--sp-1); flex-wrap: wrap; background: none; border: 0; padding: 0; cursor: pointer; color: var(--err); font-size: var(--fs-xs); font-weight: 600; }
.ar-fcluster-detail { margin-top: var(--sp-1); }
.ar-fcluster-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--sp-1h); padding: var(--sp-1h) 0; border-top: 1px solid var(--line); font-size: var(--fs-xs); color: var(--tx1); word-break: break-word; user-select: text; white-space: pre-wrap; }
.ar-fcluster-lv { color: var(--err); font-weight: 600; }
.ar-fcluster-cnt { color: var(--tx2); flex-shrink: 0; font-variant-numeric: tabular-nums; }
.ar-fcluster-first { color: var(--tx2); }
/* 宿主重启孤儿作业提示：复用 .ar-reattach-hint（info 软档），落位错误行下方 */
.ar-orphan-hint { margin-top: var(--sp-2h); margin-bottom: var(--sp-2h); }

/* 等待人工确认——此刻业务写入正被阻断，必须比普通提示更醒目 */
.ar-await {
  display: flex; align-items: center; gap: var(--sp-2h); flex-wrap: wrap; margin-bottom: var(--sp-2h); padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-s); font-size: var(--fs-sm);
  border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--line));
  background: var(--warn-soft);
}
/* 门截止倒计时（gateDeadlineMs）：常态随心跳跳动；最后 5 分钟整条横幅转警示红态 */
.ar-gate-left { font-weight: 600; }
.ar-gate-left.urgent, .ar-gate-left.expired { color: var(--err); }
.ar-await.ar-await-urgent {
  border-color: color-mix(in srgb, var(--err) 55%, var(--line));
  background: var(--err-soft);
}
/* NCheckbox 迁移档：接管原 .chk 的落位/字号/色（内部布局归组件，不复制 flex 内构） */
.ar-chk { margin: var(--sp-2h) 0; font-size: var(--fs-sm); color: var(--tx1); }
/* NInputNumber 迁移档：原 .ipt.num 定宽承接（组件根宽度档，placeholder 落内部 input） */
.ar-num { width: 130px; }
/* 监控步调速行（档位下拉+应用钮+当前速率回显） */
.ar-throttle { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.ar-throttle-sel { min-width: 110px; }
/* 重跑语义说明（重跑钮旁一句话） */
.ar-retry-hint { display: inline-block; margin-top: calc(-1 * var(--sp-1h)); font-size: var(--fs-xs); }
/* 失败处置动作行（复制失败 id / 生成回补 query） */
.ar-failures-act { display: flex; gap: var(--sp-2); margin-top: var(--sp-1h); flex-wrap: wrap; }
/* 完成校验区（SUCCEEDED 后文档数比对 + 别名指向核对）；标题行与 .ed-label.sec-t 同视觉
   但独立类锚——sec-t 样式档只用于 diff/报告两区，校验区不并入该档 */
.ar-verify { margin-top: var(--sp-2h); }
.ar-verify-t { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-1); font-size: var(--fs-sm); font-weight: 600; color: var(--tx1); }
.ar-verify-guide {
  margin-top: var(--sp-1h); padding: var(--sp-1h) var(--sp-2); font-size: var(--fs-xs); color: var(--warn);
  border: 1px solid color-mix(in srgb, var(--warn) 35%, var(--line)); border-radius: var(--r-s);
  background: var(--warn-soft); line-height: 1.6;
}

/* W3：运行中作业重挂提示条（info 语义软档，非阻断；.ar-await 同族形态降 info 档） */
.ar-reattach-hint {
  display: flex; align-items: center; gap: var(--sp-2h); flex-wrap: wrap; padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-s); font-size: var(--fs-sm);
  border: 1px solid var(--info-line);
  background: var(--info-soft);
}
.ar-reattach-hint .btn { margin-left: auto; flex-shrink: 0; }

/* 期望 vs 实际 diff 表。 W10：320px 定高档退役 → max(240px, 42vh) 弹性档
 （大屏随视口撑高 diff 可视区；240px 保底同 indexHub/RankDebug 42vh 档站内口径） */
.ar-diff { margin-top: var(--sp-3); max-height: max(240px, 42vh); overflow: auto; }
/* diff 表可上百行：容器内滚动时表头吸顶。作用域限定 .ar-diff 内（同 DiagView .dg-nodes 范式），
 本文件其余 .tbl（轮次表/最近作业表）不受影响；底色须不透明，否则滚动内容穿透粘顶行 */
.ar-diff .tbl th { position: sticky; top: 0; background: var(--bg2); z-index: 1; }
/* 期望 vs 实际 diff 表——值列弹性吃满表宽（fixed 布局，弃固定 max-width 压缩） */
.ar-diff .tbl { table-layout: fixed; }
.cd-path { width: 24%; word-break: break-all; }
/* 等价噪声折叠条是 role=button 的可点 tr（点击展开/收起），补手型光标 */
.cd-benign-toggle { cursor: pointer; }
.cd-kind { width: 96px; white-space: nowrap; font-size: var(--fs-xs); }
.cd-l, .cd-r { width: 25%; word-break: break-all; font-size: var(--fs-xs); }
.cd-note { overflow-wrap: anywhere; }
.cd-hint { color: var(--tx2); font-size: var(--fs-xs); line-height: 1.5; }
.cd-added .cd-kind { color: var(--warn); }
.cd-removed .cd-kind { color: var(--info); }
.cd-changed .cd-kind { color: var(--err); }
.cd-conflict .cd-kind { color: var(--err); }

/* ═══ ：粘贴导入弹窗 ═══ */
/* bg2+radius 小卡退役（556 设计稿——弹窗内卡中卡根治）→ 行内弱文
 （.ih-tip 同语言：fs-xs/tx2，IndexHubView .ih-tip 先例）；模板壳与引导文案零触 */
.pi-hint { font-size: var(--fs-xs); color: var(--tx2); line-height: 1.5; margin-bottom: var(--sp-2); }
/* W10：粘贴编辑区弹性档（原 rows=12→244px 定高退役）——JsonArea fill 吃满
 wrapper。：定高字面退役 → :style 绑 adhoc.piH 四档（首位=原 min(60vh, 600px)
 零漂移；档位钮在弹窗 footer，data-ar-pi-h），大粘贴场景随档撑高 */
.pi-ja-wrap { display: flex; flex-direction: column; }
.pi-preview { display: flex; flex-wrap: wrap; gap: var(--sp-1) 14px; margin-top: var(--sp-1h); padding: var(--sp-1h) var(--sp-2h); border-radius: var(--r-s); font-size: var(--fs-xs); }
.pi-preview.ok { background: var(--ok-line); color: var(--tx1); }
.pi-preview.bad { background: var(--err-soft); color: var(--err); }
/* W10：sep 弱化对齐全站 .meta-strip .sep 口径（opacity .45） */
.pi-pl::before { content: '· '; opacity: .45; }
/* .pi-ta 三条规则随裸 textarea 退役——编辑区由 JsonArea（.ja 外壳 + monaco-host）承担 */

/* ═══ 从集群复刻：源索引名 combobox 弹层（datalist 退役）═══
 壳属性（absolute 就地坐标/底/边/阴影/圆角）吃 theme.css .float-pop.inplace 全局档，
 本组只留外裁切/字号/行高差异（IndexPicker .ixp-pop 同款分工） */
.ar-clone-idx { position: relative; display: flex; }
.ar-clone-pop { overflow: hidden; font-size: var(--fs-sm); }
.ar-clone-list { max-height: 240px; overflow: auto; padding: var(--sp-0) 0; }
.ar-clone-item { display: flex; align-items: center; gap: var(--sp-1h); padding: var(--sp-1) var(--sp-2h); cursor: pointer; }
.ar-clone-item.act { background: var(--hover); }
.ar-clone-hint { padding: var(--sp-3) var(--sp-2h); color: var(--muted); }
.ar-clone-ft { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-1) var(--sp-2h); border-top: 1px solid var(--line); color: var(--muted); font-size: var(--fs-xs); }

/* 900 紧凑微调档（ 口径；529 W-D 十五视图同范式）——双 Tab 与侧板
 侧距收窄、作业表工具行 kw 独占一行（.ar-jobs-tools 已 wrap；对照双栏单列归
 WorkbenchLayout 内部窄屏堆叠，本页无裸 grid 分栏）。档内零 ≥300px 裸 width */
@media (max-width: 900px) {
  .ar-input-tabs button { padding: var(--sp-2h) var(--sp-2); }
  .ar-jobs-kw { width: 100%; }
  .ar-jobs-kw-wrap { width: 100%; }
}
</style>
