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

package io.github.dengmeiluan.esquerystudio.console.multicluster;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.EnumSet;

/**
 * 连接档案凭据静态加密（AES-256-GCM）。
 *
 * <p>此前连接密码/ApiKey 以明文落控制集群索引（或 JDBC 表）——任何能直连控制存储的
 * 主体（或索引泄露事件）即取得全部目标集群凭据。本内核把落库值统一加密：</p>
 * <ul>
 *   <li>密文形态 {@code enc:v1:<base64(iv[12] || ciphertext+tag[16]>)}；</li>
 *   <li>密钥源：显式配置 {@code esquerystudio.elasticsearch.console.auth.conn-secret}（base64 的 32 字节）
 *       优先——多实例部署必须显式配置共享同一密钥；未配置时自动生成并落自举档案目录
 *       {@code ~/.esquerystudio/<appName>/conn.key}（单实例零配置可用，尽力收敛文件权限）；</li>
 *   <li><b>存量明文兼容</b>：读取无前缀值原样返回（透明兼容），保存一律加密——存量档案
 *       被再次编辑/同步时自动升级为密文；</li>
 *   <li>带前缀但解密失败=显性异常（密钥轮换错误绝不能静默把密文当明文用）；</li>
 *   <li>{@code null} 实例（旧构造的 store）=完全旁路，读写原样——既有测试与未升级装配零影响。</li>
 * </ul>
 *
 * @author aicoding
 */
public final class ConnCrypto {

    private static final Logger LOG = LoggerFactory.getLogger(ConnCrypto.class);

    static final String PREFIX = "enc:v1:";
    private static final int GCM_IV_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;
    private static final String KEY_FILE = "conn.key";

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    private ConnCrypto(byte[] keyBytes) {
        this.key = new SecretKeySpec(keyBytes, "AES");
    }

    /**
     * 解析加密器：显式配置优先（base64 的 32 字节，其他长度 fail-fast）；
     * 未配置时读/生成 {@code <dir>/conn.key}。dir 为 null 时不落盘（每次调用新密钥，
     * 仅供测试；生产装配必须传自举档案目录）。
     */
    public static ConnCrypto resolve(String configuredSecret, Path homeDir) {
        if (configuredSecret != null && !configuredSecret.trim().isEmpty()) {
            byte[] keyBytes;
            try {
                keyBytes = Base64.getDecoder().decode(configuredSecret.trim());
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("conn-secret 必须是 base64 编码的 32 字节 AES 密钥");
            }
            if (keyBytes.length != 32) {
                throw new IllegalArgumentException("conn-secret 必须是 32 字节 AES 密钥的 base64（实际 " + keyBytes.length + " 字节）");
            }
            return new ConnCrypto(keyBytes);
        }
        Path file = homeDir == null ? null : homeDir.resolve(KEY_FILE);
        if (file != null && Files.isRegularFile(file)) {
            try {
                return new ConnCrypto(Base64.getDecoder().decode(
                        new String(Files.readAllBytes(file), StandardCharsets.UTF_8).trim()));
            } catch (Exception e) {
                throw new IllegalStateException("读取连接加密密钥失败 " + file + ": " + e.getMessage(), e);
            }
        }
        byte[] keyBytes = new byte[32];
        randomStatic().nextBytes(keyBytes);
        if (file != null) {
            try {
                Files.createDirectories(homeDir);
                Files.write(file, Base64.getEncoder().encodeToString(keyBytes).getBytes(StandardCharsets.UTF_8));
                restrictPermissions(file);
                LOG.info("[ConnCrypto] 已生成连接档案加密密钥并落盘 {}（多实例部署请改用显式配置"
                        + " esquerystudio.elasticsearch.console.auth.conn-secret 共享同一密钥）", file);
            } catch (IOException e) {
                throw new IllegalStateException("无法写入连接加密密钥文件 " + file + ": " + e.getMessage(), e);
            }
        }
        return new ConnCrypto(keyBytes);
    }

    private static SecureRandom randomStatic() {
        return new SecureRandom();
    }

    /** 尽力收敛密钥文件为属主可读写（POSIX；Windows/不支持时静默跳过）。 */
    private static void restrictPermissions(Path file) {
        try {
            Files.setPosixFilePermissions(file, EnumSet.of(
                    PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE));
        } catch (Exception ignore) {
            /* 非 POSIX 文件系统：跳过（Windows ACL 由目录继承约束） */
        }
    }

    /** 加密明文（null/空串直通——无凭据的档案不产生密文噪音）。 */
    public String encrypt(String plain) {
        if (plain == null || plain.isEmpty()) {
            return plain;
        }
        try {
            byte[] iv = new byte[GCM_IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] ct = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ct, 0, out, iv.length, ct.length);
            return PREFIX + Base64.getEncoder().encodeToString(out);
        } catch (Exception e) {
            throw new IllegalStateException("连接凭据加密失败: " + e.getMessage(), e);
        }
    }

    /**
     * 解密存储值：无前缀=存量明文原样返回（透明兼容）；带前缀解密失败=显性异常
     * （密钥不一致时宁可连接失败也不静默降级——把密文当明文发给 ES 只会制造歧义报错）。
     */
    public String decrypt(String stored) {
        if (stored == null || !stored.startsWith(PREFIX)) {
            return stored;
        }
        byte[] all;
        try {
            all = Base64.getDecoder().decode(stored.substring(PREFIX.length()));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("连接凭据密文损坏（base64 非法）");
        }
        if (all.length <= GCM_IV_BYTES) {
            throw new IllegalArgumentException("连接凭据密文损坏（长度非法）");
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key,
                    new GCMParameterSpec(GCM_TAG_BITS, all, 0, GCM_IV_BYTES));
            byte[] plain = cipher.doFinal(all, GCM_IV_BYTES, all.length - GCM_IV_BYTES);
            return new String(plain, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalArgumentException(
                    "连接凭据解密失败：conn-secret 与加密时使用的密钥不一致，请核对配置或恢复密钥文件");
        }
    }
}
