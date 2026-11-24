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

import org.junit.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 批次 1005：连接档案凭据静态加密——AES-256-GCM roundtrip、存量明文透明兼容、
 * 错误密钥显性失败、密钥文件持久化（重启后同密钥）。
 */
public class ConnCrypto1005Test {

    private static String keyB64() {
        byte[] b = new byte[32];
        new java.security.SecureRandom().nextBytes(b);
        return Base64.getEncoder().encodeToString(b);
    }

    @Test
    public void 加解密roundtrip与密文形态() {
        ConnCrypto c = ConnCrypto.resolve(keyB64(), null);
        String cipher = c.encrypt("p@ss中文密码!");
        assertTrue("密文必须带版本前缀（读侧据此区分存量明文）", cipher.startsWith("enc:v1:"));
        assertTrue("密文不得含明文片段", cipher.indexOf("p@ss") < 0);
        assertEquals("解密必须还原明文", "p@ss中文密码!", c.decrypt(cipher));
        /* 同明文两次加密的 IV 随机=密文不同（GCM 语义） */
        assertNotEquals(cipher, c.encrypt("p@ss中文密码!"));
    }

    @Test
    public void 存量明文透明兼容() {
        ConnCrypto c = ConnCrypto.resolve(keyB64(), null);
        assertEquals("无前缀=存量明文原样返回", "legacy-plain", c.decrypt("legacy-plain"));
        assertEquals("null 直通", null, c.decrypt(null));
        assertEquals("空串直通", "", c.encrypt(""));
        assertEquals("null 直通（无凭据档案）", null, c.encrypt(null));
    }

    @Test
    public void 错误密钥显性失败绝不静默降级() {
        ConnCrypto a = ConnCrypto.resolve(keyB64(), null);
        ConnCrypto b = ConnCrypto.resolve(keyB64(), null);
        String cipher = a.encrypt("the-secret");
        try {
            b.decrypt(cipher);
            fail("密钥不一致必须显性失败（把密文当明文用只会制造歧义连接错误）");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("conn-secret"));
        }
    }

    @Test
    public void 密钥文件持久化_重启后同密钥() throws Exception {
        Path dir = Files.createTempDirectory("conn-crypto-test");
        String plain = "restart-survivor";
        String cipher1;
        {
            ConnCrypto first = ConnCrypto.resolve(null, dir);
            cipher1 = first.encrypt(plain);
        }
        /* 新实例（模拟重启）：从密钥文件加载同一密钥，旧密文必须可解 */
        ConnCrypto second = ConnCrypto.resolve(null, dir);
        assertEquals(plain, second.decrypt(cipher1));
        assertTrue("密钥文件必须落盘在自举档案目录", Files.isRegularFile(dir.resolve("conn.key")));
    }

    @Test
    public void 显式配置密钥_长度校验failFast() {
        /* 正确长度可用 */
        ConnCrypto c = ConnCrypto.resolve(keyB64(), null);
        assertEquals("ok", c.decrypt(c.encrypt("ok")));
        /* 非 32 字节 fail-fast */
        try {
            ConnCrypto.resolve(Base64.getEncoder().encodeToString(new byte[16]), null);
            fail("16 字节密钥必须拒绝");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("32"));
        }
        /* 非 base64 fail-fast */
        try {
            ConnCrypto.resolve("not-base64!!!", null);
            fail("非 base64 必须拒绝");
        } catch (IllegalArgumentException expected) {
            // ok
        }
    }
}
