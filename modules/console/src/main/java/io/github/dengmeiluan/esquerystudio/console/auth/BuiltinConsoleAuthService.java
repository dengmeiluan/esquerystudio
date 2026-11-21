/*
 * Copyright 2026 Meiluan Deng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package io.github.dengmeiluan.esquerystudio.console.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.RestHighLevelClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 内置控制台账号服务（账号存 ES 索引 {@code esquerystudio_user}，无任何外部依赖。
 *
 * <p>核心语义（与用户约定一致）：<b>用户索引里一个账号都没有时，用兜底默认账号
 * {@code admin / esquerystudio}（可配置）登录，角色 ADMIN；一旦 ES 里建立了任何账号，
 * 兜底账号即失效，一切以 ES 里的用户为准。</b></p>
 *
 * <ul>
 *   <li>密码：PBKDF2WithHmacSHA256（纯 JDK，salt 16B + 迭代 31000），不落明文。</li>
 *   <li>token：无状态 HMAC-SHA256 签名（username.role.expires.flag.epoch.sig），TTL 可配置；
 *       secret 未配置时启动随机生成（重启后 token 全失效，需重新登录）。非兜底 token 每次校验
 *       回查用户档案纪元（epoch）——改密/改角色/删号后旧 token 立即作废，不再等到 TTL 过期。</li>
 *   <li>ES IO 全部走 low-level REST（不碰 spring-data-es 版本敏感面，利于跨 SB 2.3~2.7 宿主）。</li>
 * </ul>
 *
 * @author aicoding
 */
public class BuiltinConsoleAuthService implements EsConsoleAuthorizer {

    private static final Logger LOG = LoggerFactory.getLogger(BuiltinConsoleAuthService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** 请求头（前端 api.ts 统一附带）。 */
    public static final String TOKEN_HEADER = "X-ESQueryStudio-Token";

    private static final int PBKDF2_ITERATIONS = 31_000;
    private static final int PBKDF2_KEY_BITS = 256;
    private static final int SALT_BYTES = 16;

    private final java.util.function.Supplier<RestHighLevelClient> client;
    private final String userIndex;
    private final String fallbackUsername;
    private final String fallbackPassword;
    private final long tokenTtlMs;
    private final byte[] hmacSecret;
    /** 内置账号登录总开关：false 时 /auth/login 一律 401（委托部署防默认兜底账号后门）。 */
    private final boolean loginEnabled;

    public BuiltinConsoleAuthService(java.util.function.Supplier<RestHighLevelClient> client, String userIndex,
                                     String fallbackUsername, String fallbackPassword,
                                     long tokenTtlMs, String configuredSecret) {
        this(client, userIndex, fallbackUsername, fallbackPassword, tokenTtlMs, configuredSecret, true);
    }

    public BuiltinConsoleAuthService(java.util.function.Supplier<RestHighLevelClient> client, String userIndex,
                                     String fallbackUsername, String fallbackPassword,
                                     long tokenTtlMs, String configuredSecret, boolean loginEnabled) {
        this.client = client;
        this.userIndex = userIndex;
        this.fallbackUsername = fallbackUsername;
        this.fallbackPassword = fallbackPassword;
        this.tokenTtlMs = tokenTtlMs;
        this.loginEnabled = loginEnabled;
        if (!loginEnabled) {
            LOG.info("[esquerystudio-auth] 内置账号登录已关闭（检测到宿主鉴权委托）：/auth/login 不再接受本地账号，"
                    + "如需保留请显式配置 esquerystudio.elasticsearch.console.auth.builtin-login-enabled=true");
        } else if (isDefaultFallbackCredential()) {
            /* 默认口令 + 内置登录 = 公开已知凭据的 ADMIN 入口。独立部署必须首登改密；
               此处只告警不阻断（阻断会让空库部署无法首登），但必须是 ERROR 级、不可静默。 */
            LOG.error("[esquerystudio-auth] 兜底账号仍使用默认口令（{} / ***）：任何能访问 /auth/login 的人"
                    + "都可获得 ADMIN。请立即修改 esquerystudio.elasticsearch.console.auth.fallback-username/password，"
                    + "或关闭内置登录（builtin-login-enabled=false）", fallbackUsername);
        }
        if (configuredSecret != null && !configuredSecret.trim().isEmpty()) {
            this.hmacSecret = configuredSecret.trim().getBytes(StandardCharsets.UTF_8);
        } else {
            byte[] random = new byte[32];
            new SecureRandom().nextBytes(random);
            this.hmacSecret = random;
            LOG.info("[esquerystudio-auth] 未配置 token secret，已随机生成（实例重启后需重新登录；" +
                    "多实例部署请配置 esquerystudio.elasticsearch.console.auth.token-secret 保证 token 互通）");
        }
    }

    /** 兜底账号是否仍是出厂默认（admin / esquerystudio）。 */
    private boolean isDefaultFallbackCredential() {
        return "admin".equals(fallbackUsername) && "esquerystudio".equals(fallbackPassword);
    }

    /** 登录控制器用：默认口令必须只允许本机登录（公开已知凭据不能作为远程 ADMIN 入口）。 */
    public boolean usesFactoryDefaultCredential() {
        return isDefaultFallbackCredential();
    }

    /** 内置登录是否可用（/auth/login 与 setup/status 的 builtinLogin 回显同源）。 */
    public boolean isLoginEnabled() {
        return loginEnabled;
    }

    /** 令牌有效期（登出吊销兜底用：委托未给出 exp 时按此刻 + TTL 登记）。 */
    public long getTokenTtlMs() {
        return tokenTtlMs;
    }

    /* ==================================================================================== */
    /* 登录 / token                                                                          */
    /* ==================================================================================== */

    /**
     * 登录：ES 有账号按 ES 校验；一个账号都没有时按兜底默认账号。
     *
     * @return {token, username, role, fallback, expiresAt}；凭证错误返回 null
     */
    public Map<String, Object> login(String username, String password) throws IOException {
        if (!loginEnabled) {
            /* 委托部署的默认形态：本地登录通道整体关闭，身份只能来自宿主。
               不返回 null 以免被当作「密码错误」掩盖配置语义——调用方按 isLoginEnabled() 给明确 403。 */
            return null;
        }
        if (username == null || username.trim().isEmpty() || password == null || password.isEmpty()) {
            // 空用户名会拼出 /_doc/ 空 id 请求导致 ES 405，此处直接按凭证错误处理
            return null;
        }
        Map<String, Object> user = findUser(username);
        ConsolePrincipal principal = null;
        if (user != null) {
            if (verifyPassword(username, password, user)) {
                principal = new ConsolePrincipal(username, ConsoleRole.parse(String.valueOf(user.get("role"))), false);
            }
        } else if (!hasAnyUser() && fallbackUsername.equals(username)
                /* 常量时间比较：默认口令逐字符短路的时序差可被用来猜口令（即使已限本机） */
                && MessageDigest.isEqual(fallbackPassword.getBytes(StandardCharsets.UTF_8),
                        password.getBytes(StandardCharsets.UTF_8))) {
            // 兜底默认账号：仅在用户索引完全为空时生效
            principal = new ConsolePrincipal(username, ConsoleRole.ADMIN, true);
        }
        if (principal == null) {
            return null;
        }
        long expiresAt = System.currentTimeMillis() + tokenTtlMs;
        long epoch = user != null ? readEpoch(user) : 0L;
        String token = issueToken(principal, expiresAt, epoch);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("token", token);
        out.put("username", principal.getUsername());
        out.put("role", principal.getRole().name());
        out.put("fallback", principal.isFallback());
        out.put("expiresAt", expiresAt);
        return out;
    }

    @Override
    public ConsolePrincipal authenticate(HttpServletRequest request) {
        String token = request.getHeader(TOKEN_HEADER);
        if (token == null || token.isEmpty()) {
            String auth = request.getHeader("Authorization");
            if (auth != null && auth.startsWith("Bearer ")) {
                token = auth.substring(7);
            }
        }
        return verifyToken(token);
    }

    /** 签发 token：b64(username).role.expires.flag.epoch.b64(hmac(username|role|expires|flag|epoch))。
     * epoch=签发时用户档案的纪元（账号任何变更都会递增），校验时回查不符即吊销。 */
    private String issueToken(ConsolePrincipal p, long expiresAt, long epoch) {
        String userB64 = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(p.getUsername().getBytes(StandardCharsets.UTF_8));
        String flag = p.isFallback() ? "F" : "N";
        String payload = userB64 + "." + p.getRole().name() + "." + expiresAt + "." + flag + "." + epoch;
        return payload + "." + hmac(payload);
    }

    /** 校验 token：签名 + TTL + 纪元回查（非兜底）+ 兜底账号仍有效性（有真实账号后兜底 token 立即作废）。
     * 五段形态为纪元字段引入前的存量 token（隐含 epoch=0）：升级部署后未变更过的账号会话不中断，
     * 一旦账号有任何变更（改密/改角色/重建）纪元递增、存量 token 与新 token 一起吊销。 */
    public ConsolePrincipal verifyToken(String token) {
        /* 内置登录关闭=委托部署：宿主撤销会话后，浏览器里残留的旧内置 token 不得成为
           绕过宿主授权的第二条身份（其 grantedPages=null 会直接关闭页面门）。
           关闭后不再签发新 token，因此拒绝存量 token 不误伤任何正常会话。 */
        if (!loginEnabled) {
            return null;
        }
        if (token == null || token.isEmpty()) {
            return null;
        }
        String[] parts = token.split("\\.");
        if (parts.length != 5 && parts.length != 6) {
            return null;
        }
        String payload = parts[0] + "." + parts[1] + "." + parts[2] + "." + parts[3]
                + (parts.length == 6 ? "." + parts[4] : "");
        if (!constantTimeEquals(hmac(payload), parts[parts.length - 1])) {
            return null;
        }
        long expiresAt;
        long tokenEpoch;
        try {
            expiresAt = Long.parseLong(parts[2]);
            tokenEpoch = parts.length == 6 ? Long.parseLong(parts[4]) : 0L;
        } catch (NumberFormatException e) {
            return null;
        }
        if (System.currentTimeMillis() > expiresAt) {
            return null;
        }
        /* 登出/被盗 token 的服务端吊销面：签名与 TTL 合法但已在吊销表的立即拒绝。
           只登记通过完整校验链的 token，过期项在此永远不会误伤（TTL 检查先行）。 */
        if (revokedTokens.containsKey(tokenFingerprint(token))) {
            return null;
        }
        String username = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8);
        boolean fallback = "F".equals(parts[3]);
        if (fallback) {
            // 兜底 token 只在「仍然没有任何账号」时有效，防止建号后旧兜底 token 越权
            try {
                if (hasAnyUser()) {
                    return null;
                }
            } catch (IOException e) {
                /* 静默拒绝→WARN——合法兜底 token 被用户索引 IO 失败静默拒绝
                   =用户锁死且零日志（登录失败与「建号后兜底失效」从外表无法分辨）；拒绝语义
                   本身不变（吞异常契约：校验失败一律 null），只补留痕与 username 上下文 */
                LOG.warn("[esquerystudio-auth] 兜底 token 因用户索引 IO 失败被按无效拒绝 username={}：{}",
                        username, e.getMessage(), e);
                return null;
            }
            return new ConsolePrincipal(username, ConsoleRole.parse(parts[1]), fallback);
        }
        /* 纪元回查（吊销面）：删号（档案消失）/改密/改角色（纪元递增）后旧 token 立即作废，
           角色以最新档案为准——降权后即使纪元校验被绕过也不沿用签发时的旧角色。 */
        final Map<String, Object> user;
        try {
            user = findUser(username);
        } catch (IOException e) {
            LOG.warn("[esquerystudio-auth] token 纪元回查因用户索引 IO 失败被按无效拒绝 username={}：{}",
                    username, e.getMessage(), e);
            return null;
        }
        if (user == null) {
            return null;
        }
        if (readEpoch(user) != tokenEpoch) {
            return null;
        }
        return new ConsolePrincipal(username, ConsoleRole.parse(String.valueOf(user.get("role"))), false);
    }

    /** 用户档案纪元（缺省 0=纪元字段引入前建立的存量账号）。 */
    private static long readEpoch(Map<String, Object> user) {
        Object epoch = user.get("epoch");
        return epoch instanceof Number ? ((Number) epoch).longValue() : 0L;
    }

    /* ==================================================================================== */
    /* 登出吊销（无状态 token 的服务端失效面）                                                */
    /* ==================================================================================== */

    /** 已登出 token 指纹 → 原 token 到期时间。内存封顶防灌水；实例重启即清空
     *  （secret 随机生成的部署重启后 token 本就全部失效），其余靠 TTL 自然过期淘汰。 */
    private final Map<String, Long> revokedTokens = new java.util.concurrent.ConcurrentHashMap<>();

    private static final int REVOKED_TOKEN_CAP = 10_000;

    /**
     * 登出吊销：只有通过完整校验链（签名+TTL+纪元回查）的真实有效 token 才入吊销表——
     * 伪造串不占内存，灌水打不满封顶值。返回是否实际登记。
     */
    public boolean revokeToken(String token) {
        if (token == null || token.isEmpty() || verifyToken(token) == null) {
            return false;
        }
        long now = System.currentTimeMillis();
        if (revokedTokens.size() >= REVOKED_TOKEN_CAP) {
            revokedTokens.entrySet().removeIf(e -> e.getValue() <= now);
            if (revokedTokens.size() >= REVOKED_TOKEN_CAP) {
                /* 持任一有效凭据循环 login/logout 同样能灌满封顶（成功登录不节流、
                   每次签发的 token 唯一）——拒绝新吊销会让所有人的被盗 token 在 TTL
                   内不可吊销。驱逐最早到期的条目腾位：被驱逐者要么接近自然过期、
                   要么是灌水条目，短窗口复活风险远小于「全部吊销失效」。 */
                revokedTokens.entrySet().stream()
                        .min(java.util.Comparator.comparingLong(Map.Entry::getValue))
                        .ifPresent(e -> revokedTokens.remove(e.getKey()));
                LOG.warn("[esquerystudio-auth] 登出吊销表已满，已驱逐最早到期条目为新吊销腾位");
            }
        }
        revokedTokens.put(tokenFingerprint(token), tokenExpiresAt(token));
        return true;
    }

    /** 吊销表当前登记数（运维观测用）。 */
    public int revokedTokenCount() {
        return revokedTokens.size();
    }

    private static long tokenExpiresAt(String token) {
        try {
            return Long.parseLong(token.split("\\.")[2]);
        } catch (Exception e) {
            return 0L;
        }
    }

    private static String tokenFingerprint(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16))
                        .append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (Exception e) {
            // 摘要不可用（JDK 异常配置）：退化为可重复的视图哈希，吊销语义保持
            return "h" + token.hashCode();
        }
    }

    /* ==================================================================================== */
    /* 用户管理（ADMIN）                                                                      */
    /* ==================================================================================== */

    /**
     * 页面授权/委派会话不得管理本地账号：本地账号是全局身份（grantedPages=null，
     * 走内置登录），一旦创建即可绕过页面门与连接写键——security 连接写键不能越出页面模型。
     * 仅 ADMIN 可管理全局账号。
     *
     * <p>不能只卡 {@code isDelegated()}：自定义授权器/内置授权器返回的「非委派 + 非空
     * grantedPages」身份同样是页面模型身份（连接模型下页面写键短路角色门），
     * 若能建号就等于用一页授权换来一个跨全部连接的全局账号。</p>
     */
    private static void forbidDelegatedLocalUserWrite(ConsolePrincipal actor) {
        if (actor == null) {
            return;
        }
        /* 委派/页面模型身份一律不得管理本地账号——**先于角色判断**。
           原实现 `if (role >= ADMIN) return;` 把「委派 ADMIN」也放行了：产线实账
           deng_test_x2 正是 role=ADMIN + delegated=true + authSource=delegate，
           它因此可以创建本地账号，在宿主授权体系之外另造一个不受宿主管控的全局身份。
           本地账号只能由内置（非委派、无 grantedPages）的 ADMIN 管理。 */
        if (actor.isDelegated() || actor.getGrantedPages() != null) {
            throw new IllegalArgumentException(
                    "页面授权/委派会话不得创建/修改/删除本地账号（本地账号是全局身份，仅内置 ADMIN 可管理）");
        }
        if (actor.getRole().atLeast(ConsoleRole.ADMIN)) {
            return;
        }
        /* 非 ADMIN 且非页面模型身份（内置低权账号）：旧语义允许落到后续角色校验，
           这里保持原样——真正的角色越界由 upsertUser 的角色比较兜底。 */
    }

    /** 用户列表（不含密码哈希）。 */
    public List<Map<String, Object>> listUsers() throws IOException {
        List<Map<String, Object>> out = new ArrayList<>();
        Map<String, Object> resp = perform("POST", "/" + userIndex + "/_search",
                "{\"size\":100,\"sort\":[{\"username.keyword\":{\"order\":\"asc\",\"unmapped_type\":\"keyword\"}}]}");
        if (resp == null) {
            return out;
        }
        for (Map<String, Object> hit : extractHits(resp)) {
            @SuppressWarnings("unchecked")
            Map<String, Object> src = (Map<String, Object>) hit.get("_source");
            if (src == null) {
                continue;
            }
            Map<String, Object> u = new LinkedHashMap<>();
            u.put("username", src.get("username"));
            u.put("role", src.get("role"));
            u.put("updatedAt", src.get("updatedAt"));
            u.put("updatedBy", src.get("updatedBy"));
            out.add(u);
        }
        return out;
    }

    /** 新建/覆盖用户（password 为空表示只改角色）。 */
    public synchronized void upsertUser(ConsolePrincipal actor, String username, String password, ConsoleRole role) throws IOException {
        forbidDelegatedLocalUserWrite(actor);
        if (username == null || username.trim().isEmpty()) {
            throw new IllegalArgumentException("username 不可为空");
        }
        /* 用户名会进 token 载荷、审计档与日志：CR/LF/控制符可在日志与流水里伪造行，
           白名单式拒绝（字母数字 + 常规可见 ASCII + 中文等非控制 Unicode）。 */
        if (username.chars().anyMatch(c -> c < 0x20 || c == 0x7F)) {
            throw new IllegalArgumentException("username 不得包含控制字符");
        }
        if (role == null) {
            throw new IllegalArgumentException("role 不可为空");
        }
        username = username.trim();
        Map<String, Object> existing = findUser(username);
        /* 防提权（security 页写键持有人可管理普通账号，但不得越出自身权限）：
           1) 只能授予不高于自己的角色——否则 OPERATOR 可自授/授他人 rank3；
           2) 不能改写高于自己角色的账号；
           3) 不能重置既有账号密码（账号接管）——改密走「修改我的密码」（校验旧密码）。
              新建账号必须给初始密码，属建号而非接管，放行。 */
        boolean settingPassword = password != null && !password.isEmpty();
        boolean self = actor != null && username.equals(actor.getUsername());
        if (actor != null && !actor.getRole().atLeast(ConsoleRole.ADMIN)) {
            if (role.rankValue() > actor.getRole().rankValue()) {
                throw new IllegalArgumentException("不能授予高于自身角色（" + actor.getRole().name()
                        + "）的权限：ADMIN 及更高角色仅 ADMIN 可授予");
            }
            if (existing != null) {
                ConsoleRole existingRole = ConsoleRole.parse(String.valueOf(existing.get("role")));
                if (existingRole.rankValue() > actor.getRole().rankValue()) {
                    throw new IllegalArgumentException("不能修改高于自身角色的账号：ADMIN 账号仅 ADMIN 可修改");
                }
                if (settingPassword && !self) {
                    throw new IllegalArgumentException(
                            "非 ADMIN 不能重置他人密码；如需改自己的密码请使用「修改我的密码」");
                }
            }
        }
        forbidDelegatedLocalUserWrite(actor);
        Map<String, Object> doc = new LinkedHashMap<>();
        doc.put("username", username);
        doc.put("role", role.name());
        doc.put("updatedAt", System.currentTimeMillis());
        doc.put("updatedBy", actor == null ? "system" : actor.getUsername());
        /* 纪元递增：账号任何变更（改密/改角色/重建）都使既有 token 全部吊销（verifyToken 回查）。
           新建用随机正值而不是固定 1：删号→同名重建若从 1 重新计数，旧账号未变更时签发的
           token（epoch=1）会在新账号上重新通过校验，等于回收旧凭据。随机值使重建前后不重叠。
           存量档案无字段按 0 读，首次变更写 1=存量五段 token（隐含 epoch=0）同时吊销。 */
        long epoch;
        if (existing == null) {
            epoch = new SecureRandom().nextLong() & 0x7fffffffffffffffL;
            if (epoch == 0) epoch = 1;
        } else {
            epoch = readEpoch(existing) + 1L;
        }
        doc.put("epoch", epoch);
        if (password != null && !password.isEmpty()) {
            byte[] salt = new byte[SALT_BYTES];
            new SecureRandom().nextBytes(salt);
            doc.put("salt", Base64.getEncoder().encodeToString(salt));
            doc.put("iterations", PBKDF2_ITERATIONS);
            doc.put("passwordHash", Base64.getEncoder().encodeToString(pbkdf2(password, salt, PBKDF2_ITERATIONS)));
        } else if (existing != null) {
            // 只改角色：保留原密码要素
            doc.put("salt", existing.get("salt"));
            doc.put("iterations", existing.get("iterations"));
            doc.put("passwordHash", existing.get("passwordHash"));
        } else {
            throw new IllegalArgumentException("新建用户必须提供密码");
        }
        // 降级/删除保护：不能把最后一个 ADMIN 降级
        if (existing != null && ConsoleRole.parse(String.valueOf(existing.get("role"))) == ConsoleRole.ADMIN
                && role != ConsoleRole.ADMIN && countAdmins() <= 1) {
            throw new IllegalStateException("不能降级最后一个 ADMIN 账号");
        }
        perform("PUT", "/" + userIndex + "/_doc/" + urlEncode(username) + "?refresh=true",
                MAPPER.writeValueAsString(doc));
    }

    /** 修改自己的密码（校验旧密码；兜底账号引导为「建立首个真实账号」）。 */
    public void changePassword(ConsolePrincipal actor, String oldPassword, String newPassword) throws IOException {
        if (newPassword == null || newPassword.length() < 6) {
            throw new IllegalArgumentException("新密码至少 6 位");
        }
        if (actor.isFallback()) {
            // 兜底账号改密 = 建立首个真实账号（admin/ADMIN），此后兜底失效
            if (!fallbackPassword.equals(oldPassword)) {
                throw new IllegalArgumentException("旧密码不正确");
            }
            upsertUser(actor, actor.getUsername(), newPassword, ConsoleRole.ADMIN);
            return;
        }
        Map<String, Object> user = findUser(actor.getUsername());
        if (user == null) {
            /* 本地无档案不是密码错：委派身份在宿主侧改密，本地档案被删走管理员通道，
               报「旧密码不正确」只会让人反复重试正确的密码。 */
            throw new IllegalArgumentException(actor.isDelegated()
                    ? "当前为宿主委派身份，请在宿主系统修改密码"
                    : "本地账号不存在（可能已被删除），请联系管理员重建");
        }
        if (!verifyPassword(actor.getUsername(), oldPassword, user)) {
            throw new IllegalArgumentException("旧密码不正确");
        }
        upsertUser(actor, actor.getUsername(), newPassword, ConsoleRole.parse(String.valueOf(user.get("role"))));
    }

    /** 删除用户（保护最后一个 ADMIN；非 ADMIN 不得删除 ADMIN 账号）。 */
    public synchronized void deleteUser(String username, ConsolePrincipal actor) throws IOException {
        forbidDelegatedLocalUserWrite(actor);
        Map<String, Object> existing = findUser(username);
        if (existing == null) {
            return;
        }
        ConsoleRole existingRole = ConsoleRole.parse(String.valueOf(existing.get("role")));
        if (actor != null && !actor.getRole().atLeast(ConsoleRole.ADMIN)
                && existingRole.rankValue() >= actor.getRole().rankValue()) {
            /* 同级也不允许：删掉同权账号是降级 DoS（可借此清空 rank3 岗位） */
            throw new IllegalArgumentException("仅 ADMIN 可删除同级或更高角色的账号");
        }
        if (existingRole == ConsoleRole.ADMIN && countAdmins() <= 1) {
            throw new IllegalStateException("不能删除最后一个 ADMIN 账号");
        }
        perform("DELETE", "/" + userIndex + "/_doc/" + urlEncode(username) + "?refresh=true", null);
    }

    /** 用户索引是否为空（决定兜底账号是否生效）。 */
    public boolean hasAnyUser() throws IOException {
        Map<String, Object> resp = perform("GET", "/" + userIndex + "/_count", null);
        if (resp == null) {
            return false;
        }
        Object count = resp.get("count");
        return count instanceof Number && ((Number) count).longValue() > 0;
    }

    /* ==================================================================================== */
    /* 内部工具                                                                              */
    /* ==================================================================================== */

    private Map<String, Object> findUser(String username) throws IOException {
        Map<String, Object> resp = perform("GET", "/" + userIndex + "/_doc/" + urlEncode(username), null);
        if (resp == null || !Boolean.TRUE.equals(resp.get("found"))) {
            return null;
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> src = (Map<String, Object>) resp.get("_source");
        return src;
    }

    private long countAdmins() throws IOException {
        Map<String, Object> resp = perform("POST", "/" + userIndex + "/_count",
                "{\"query\":{\"term\":{\"role.keyword\":\"ADMIN\"}}}");
        if (resp == null) {
            return 0;
        }
        Object count = resp.get("count");
        return count instanceof Number ? ((Number) count).longValue() : 0;
    }

    private boolean verifyPassword(String username, String password, Map<String, Object> user) {
        try {
            byte[] salt = Base64.getDecoder().decode(String.valueOf(user.get("salt")));
            int iterations = user.get("iterations") instanceof Number
                    ? ((Number) user.get("iterations")).intValue() : PBKDF2_ITERATIONS;
            byte[] expected = Base64.getDecoder().decode(String.valueOf(user.get("passwordHash")));
            byte[] actual = pbkdf2(password, salt, iterations);
            return MessageDigest.isEqual(expected, actual);
        } catch (Exception e) {
            // 全静默→WARN——档案要素损坏（坏 Base64/迭代数坏值等）时登录失败
            // 与「密码错误」从外表无法分辨且零日志；拒绝语义不变（吞异常契约：一律 false），
            // 只补留痕。密码材料零入日志：仅 username + throwable（哈希/salt 绝不打）
            LOG.warn("[esquerystudio-auth] 密码校验失败（用户档案要素损坏?，按凭证错误拒绝）username={}",
                    username, e);
            return false;
        }
    }

    private static byte[] pbkdf2(String password, byte[] salt, int iterations) {
        try {
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, PBKDF2_KEY_BITS);
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (Exception e) {
            throw new IllegalStateException("PBKDF2 计算失败", e);
        }
    }

    private String hmac(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hmacSecret, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC 计算失败", e);
        }
    }

    private static boolean constantTimeEquals(String a, String b) {
        return a != null && b != null
                && MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    private static String urlEncode(String s) {
        try {
            return java.net.URLEncoder.encode(s, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            return s;
        }
    }

    /** 低层 REST 调用；404（索引不存在/文档不存在）宽容返回 null 或 found=false 原文。 */
    @SuppressWarnings("unchecked")
    private Map<String, Object> perform(String method, String path, String body) throws IOException {
        Request req = new Request(method, path);
        if (body != null) {
            req.setJsonEntity(body);
        }
        try {
            Response resp = client.get().getLowLevelClient().performRequest(req);
            String text = org.apache.http.util.EntityUtils.toString(resp.getEntity());
            return text == null || text.isEmpty() ? null : MAPPER.readValue(text, Map.class);
        } catch (org.elasticsearch.client.ResponseException e) {
            if (e.getResponse().getStatusLine().getStatusCode() == 404) {
                return null;
            }
            throw e;
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> extractHits(Map<String, Object> searchResp) {
        Object hitsWrap = searchResp.get("hits");
        if (!(hitsWrap instanceof Map)) {
            return java.util.Collections.emptyList();
        }
        Object hits = ((Map<String, Object>) hitsWrap).get("hits");
        return hits instanceof List ? (List<Map<String, Object>>) hits : java.util.Collections.emptyList();
    }
}
