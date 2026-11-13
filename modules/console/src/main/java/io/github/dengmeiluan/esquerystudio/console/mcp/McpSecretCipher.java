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

package io.github.dengmeiluan.esquerystudio.console.mcp;

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
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * MCP 完整 key 的落盘加密器。
 *
 * <p>需求是「完整保存密钥」：服务端以后必须能再次取回完整 key，而不只是 SHA-256 哈希。
 * 直接存明文会把凭据暴露在 ES 索引/数据库备份、慢日志和运维查询里，因此落盘前用
 * AES-256-GCM 加密，密文格式 {@code v1:base64(iv||ciphertext)}。</p>
 *
 * <p>主密钥来源（按优先级）：</p>
 * <ol>
 *   <li>配置 {@code esquerystudio.mcp.key-encryption-key}（Base64 或任意口令，推荐生产使用）；</li>
 *   <li>配置文件 {@code esquerystudio.mcp.token}（服务级 Bearer token，已有部署无需新增配置）；</li>
 *   <li>本地密钥文件 {@code ~/.esquerystudio/mcp-secret.key}（首次启动自动生成，0600）。</li>
 * </ol>
 *
 * <p>多实例部署必须使用前两种之一，保证每个实例拿到同一主密钥；本地文件只适合单实例。
 * 主密钥不可用时不落明文：{@link #encrypt(String)} 返回 null，UI 会明确提示该 key 无法回显。</p>
 */
public class McpSecretCipher {

    private static final Logger LOG = LoggerFactory.getLogger(McpSecretCipher.class);
    private static final String PREFIX = "v1:";
    private static final byte[] AAD = "esquerystudio-mcp-key".getBytes(StandardCharsets.UTF_8);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final SecretKeySpec key;

    public McpSecretCipher(String configuredKey) {
        this(configuredKey, defaultKeyFile());
    }

    McpSecretCipher(String configuredKey, Path keyFile) {
        this.key = new SecretKeySpec(deriveKey(configuredKey, keyFile), "AES");
    }

    /** 加密完整 key；主密钥不可用时返回 null（绝不静默落明文）。 */
    public String encrypt(String plain) {
        if (plain == null || plain.isEmpty()) return null;
        try {
            byte[] iv = new byte[12];
            RANDOM.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
            cipher.updateAAD(AAD);
            byte[] enc = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[iv.length + enc.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(enc, 0, out, iv.length, enc.length);
            return PREFIX + Base64.getEncoder().encodeToString(out);
        } catch (Exception e) {
            LOG.warn("[mcp] 完整 key 加密失败，本次不落盘：{}", e.getMessage(), e);
            return null;
        }
    }

    /** 解密完整 key；密文损坏/主密钥变化返回 null，由 UI 明确提示轮换。 */
    public String decrypt(String stored) {
        if (stored == null || !stored.startsWith(PREFIX)) return null;
        try {
            byte[] raw = Base64.getDecoder().decode(stored.substring(PREFIX.length()));
            if (raw.length <= 12) return null;
            byte[] iv = new byte[12];
            System.arraycopy(raw, 0, iv, 0, 12);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
            cipher.updateAAD(AAD);
            byte[] plain = cipher.doFinal(raw, 12, raw.length - 12);
            return new String(plain, StandardCharsets.UTF_8);
        } catch (Exception e) {
            LOG.warn("[mcp] 完整 key 解密失败（主密钥变化或密文损坏）：{}", e.getMessage(), e);
            return null;
        }
    }

    /** 主密钥是否可用于落盘/回显；测试与 UI 边界说明使用。 */
    public boolean available() {
        return key != null;
    }

    private static byte[] deriveKey(String configured, Path keyFile) {
        String material = configured == null ? "" : configured.trim();
        if (material.isEmpty()) {
            material = readOrCreateFileKey(keyFile);
        }
        if (material.isEmpty()) {
            /* 最后兜底：进程内随机密钥。不会把明文写盘，但重启后旧密文不可解。 */
            byte[] random = new byte[32];
            RANDOM.nextBytes(random);
            material = Base64.getEncoder().encodeToString(random);
            LOG.warn("[mcp] 无法获得稳定主密钥，完整 key 仅在本进程内可回显；"
                    + "生产请配置 esquerystudio.mcp.key-encryption-key 或 esquerystudio.mcp.token");
        }
        return sha256(material);
    }

    private static String readOrCreateFileKey(Path keyFile) {
        try {
            if (keyFile != null && Files.exists(keyFile)) {
                String value = new String(Files.readAllBytes(keyFile), StandardCharsets.UTF_8).trim();
                if (!value.isEmpty()) return value;
            }
            if (keyFile == null) return "";
            Path parent = keyFile.getParent();
            if (parent != null) Files.createDirectories(parent);
            byte[] random = new byte[32];
            RANDOM.nextBytes(random);
            String value = Base64.getEncoder().encodeToString(random);
            Files.write(keyFile, value.getBytes(StandardCharsets.UTF_8),
                    StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING, StandardOpenOption.WRITE);
            try {
                Files.setPosixFilePermissions(keyFile,
                        java.util.EnumSet.of(java.nio.file.attribute.PosixFilePermission.OWNER_READ,
                                java.nio.file.attribute.PosixFilePermission.OWNER_WRITE));
            } catch (UnsupportedOperationException | IOException ignore) {
                /* Windows 等不支持 POSIX 权限；文件仍在用户目录下。 */
            }
            LOG.info("[mcp] 已生成完整 key 主密钥文件：{}", keyFile);
            return value;
        } catch (Exception e) {
            LOG.warn("[mcp] 读写主密钥文件失败（{}），回退进程内密钥：{}", keyFile, e.getMessage(), e);
            return "";
        }
    }

    private static Path defaultKeyFile() {
        try {
            return Paths.get(System.getProperty("user.home", "."), ".esquerystudio", "mcp-secret.key");
        } catch (Exception e) {
            return null;
        }
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
