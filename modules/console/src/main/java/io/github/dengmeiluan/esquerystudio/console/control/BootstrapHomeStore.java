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

package io.github.dengmeiluan.esquerystudio.console.control;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.dengmeiluan.esquerystudio.console.xmigrate.RemoteClusterConn;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

/**
 * 控制集群自举档案（宿主应用无 ES 时，把用户在首连向导录入的控制集群连接
 * 持久化到本地磁盘，重启后免向导自动重连——对标 Kibana 的 {@code kibana.yml} 角色，
 * 但档案由平台自身管理（原子写 + 密码加密），宿主零配置。
 *
 * <p><b>安全</b>：密码 AES-256-GCM 加密存储（{@code esquerystudio-home.key} 32 字节随机密钥，
 * 首次生成；12 字节随机 IV 前置密文一起 Base64）。档案与密钥同目录，语义 = 「持有该机器
 * 文件系统权限即持有控制台」，与本地配置文件明文密码的传统模式相比只强不弱。</p>
 *
 * <p><b>原子性</b>：写档案先落临时文件再 {@code ATOMIC_MOVE}，崩溃不留半截档案。</p>
 *
 * @author aicoding
 */
public class BootstrapHomeStore {

    private static final Logger LOG = LoggerFactory.getLogger(BootstrapHomeStore.class);

    private static final String HOME_FILE = "esquerystudio-home.json";
    private static final String KEY_FILE = "esquerystudio-home.key";
    private static final int GCM_IV_LEN = 12;
    private static final int GCM_TAG_BITS = 128;

    private final Path homeDir;
    private final ObjectMapper mapper = new ObjectMapper();
    private final SecureRandom random = new SecureRandom();

    /**
     * @param configuredDir esquerystudio.elasticsearch.console.home-dir（可空）
     * @param appName       spring.application.name（可空，空取 default）
     */
    public BootstrapHomeStore(String configuredDir, String appName) {
        String app = (appName == null || appName.trim().isEmpty()) ? "default" : appName.trim();
        if (configuredDir != null && !configuredDir.trim().isEmpty()) {
            this.homeDir = Paths.get(configuredDir.trim());
        } else {
            this.homeDir = Paths.get(System.getProperty("user.home"), ".esquerystudio", app);
        }
    }

    public Path dir() {
        return homeDir;
    }

    public boolean exists() {
        return Files.isRegularFile(homeDir.resolve(HOME_FILE));
    }

    /** 读自举档案；不存在/损坏 → null（损坏时告警，交由上层进入 SETUP 流程重绑）。 */
    public synchronized RemoteClusterConn load() {
        Path file = homeDir.resolve(HOME_FILE);
        if (!Files.isRegularFile(file)) {
            return null;
        }
        try {
            byte[] raw = Files.readAllBytes(file);
            @SuppressWarnings("unchecked")
            Map<String, Object> m = mapper.readValue(raw, Map.class);
            RemoteClusterConn conn = new RemoteClusterConn();
            conn.setScheme(str(m.get("scheme"), "http"));
            conn.setHost(str(m.get("host"), null));
            conn.setPort(m.get("port") instanceof Number ? ((Number) m.get("port")).intValue() : 9200);
            conn.setUsername(str(m.get("username"), null));
            String enc = str(m.get("passwordEnc"), null);
            if (enc != null && !enc.isEmpty()) {
                conn.setPassword(decrypt(enc));
            }
            conn.validate();
            return conn;
        } catch (Exception e) {
            LOG.warn("[BootstrapHomeStore] 自举档案损坏或不可读（将进入 Setup 流程）: {} - {}", file, e.getMessage(), e);
            return null;
        }
    }

    /** 原子写自举档案（密码加密）。 */
    public synchronized void save(RemoteClusterConn conn) {
        conn.validate();
        try {
            Files.createDirectories(homeDir);
            Map<String, Object> m = new HashMap<>();
            m.put("scheme", conn.getScheme());
            m.put("host", conn.getHost());
            m.put("port", conn.getPort());
            m.put("username", conn.getUsername());
            m.put("passwordEnc", conn.getPassword() == null || conn.getPassword().isEmpty()
                    ? "" : encrypt(conn.getPassword()));
            m.put("boundAt", System.currentTimeMillis());
            byte[] json = mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(m);
            Path tmp = homeDir.resolve(HOME_FILE + ".tmp");
            Files.write(tmp, json);
            try {
                Files.move(tmp, homeDir.resolve(HOME_FILE), StandardCopyOption.REPLACE_EXISTING,
                        StandardCopyOption.ATOMIC_MOVE);
            } catch (java.nio.file.AtomicMoveNotSupportedException e) {
                Files.move(tmp, homeDir.resolve(HOME_FILE), StandardCopyOption.REPLACE_EXISTING);
            }
            LOG.info("[BootstrapHomeStore] 自举档案已写入: {} -> {}", homeDir.resolve(HOME_FILE), conn.endpoint());
        } catch (IOException e) {
            throw new IllegalStateException("写入控制集群自举档案失败: " + e.getMessage(), e);
        }
    }

    public synchronized void delete() {
        try {
            Files.deleteIfExists(homeDir.resolve(HOME_FILE));
        } catch (IOException e) {
            LOG.warn("[BootstrapHomeStore] 删除自举档案失败: {}", e.getMessage(), e);
        }
    }

    // ---------------- AES-GCM ----------------

    private String encrypt(String plain) {
        try {
            byte[] iv = new byte[GCM_IV_LEN];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(loadOrCreateKey(), "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] cipherText = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[iv.length + cipherText.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(cipherText, 0, out, iv.length, cipherText.length);
            return Base64.getEncoder().encodeToString(out);
        } catch (Exception e) {
            throw new IllegalStateException("加密控制集群密码失败: " + e.getMessage(), e);
        }
    }

    private String decrypt(String encoded) {
        try {
            byte[] all = Base64.getDecoder().decode(encoded);
            byte[] iv = new byte[GCM_IV_LEN];
            System.arraycopy(all, 0, iv, 0, GCM_IV_LEN);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(loadOrCreateKey(), "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] plain = cipher.doFinal(all, GCM_IV_LEN, all.length - GCM_IV_LEN);
            return new String(plain, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("解密控制集群密码失败（密钥文件可能被更换）: " + e.getMessage(), e);
        }
    }

    private byte[] loadOrCreateKey() throws IOException {
        Path keyFile = homeDir.resolve(KEY_FILE);
        if (Files.isRegularFile(keyFile)) {
            byte[] key = Base64.getDecoder().decode(new String(
                    Files.readAllBytes(keyFile), StandardCharsets.US_ASCII).trim());
            if (key.length != 32) {
                throw new IOException("密钥文件长度非法: " + keyFile);
            }
            return key;
        }
        Files.createDirectories(homeDir);
        byte[] key = new byte[32];
        random.nextBytes(key);
        Files.write(keyFile, Base64.getEncoder().encodeToString(key).getBytes(StandardCharsets.US_ASCII));
        LOG.info("[BootstrapHomeStore] 生成控制台密钥文件: {}", keyFile);
        return key;
    }

    private static String str(Object v, String dft) {
        return v == null ? dft : String.valueOf(v);
    }
}
