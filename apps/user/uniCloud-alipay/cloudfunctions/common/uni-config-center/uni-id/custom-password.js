'use strict'
/**
 * uni-id 自定义密码策略：scrypt + 每用户随机盐 + 全局 pepper
 *
 * 为什么不用默认的 hmac-sha256：默认实现只做一次 HMAC，等于把「加盐」这件事
 * 交给了全局密钥；一旦库被拖走，弱口令可以被彩虹表式地对撞。
 * scrypt 是内存硬的（memory-hard），单次 ~50ms，暴力破解成本高几个数量级。
 *
 * 存储格式（存在 uni-id-users.password 里）：
 *     scrypt$v1$<salt_base64>$<hash_base64>
 * 盐是每用户随机的 16 字节，和哈希一起存；pepper 放 config，不进数据库。
 *
 * 兼容性：不含 scrypt$ 前缀的旧密码一律判定为不匹配（旧实现是明文存储，必须让用户重设）。
 */

const crypto = require('crypto')

const VERSION_PREFIX = 'scrypt$v1$'
const SALT_BYTES = 16
const KEY_LEN = 32
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }

function getPepper(passwordSecret) {
  const value = passwordSecret && passwordSecret.value
  if (typeof value !== 'string' || value.length < 16) {
    throw new Error(
      '[custom-password] 未配置 pepper：请在 uni-config-center/uni-id/config.json 的 passwordSecret[0].value 填入至少 16 位的随机串'
    )
  }
  return value
}

function scryptHashSync(password, salt, pepper) {
  const material = Buffer.concat([salt, Buffer.from(pepper, 'utf8')])
  return crypto.scryptSync(String(password), material, KEY_LEN, SCRYPT_PARAMS)
}

function safeEqual(a, b) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

module.exports = {
  /**
   * 生成密码哈希。返回 { passwordHash, version }，uni-id 会分别写入
   * uni-id-users.password 与 password_secret_version。
   */
  encryptPassword({ password, clientInfo, passwordSecret }) {
    if (!password) throw new Error('[custom-password] 密码不能为空')
    const pepper = getPepper(passwordSecret)
    const salt = crypto.randomBytes(SALT_BYTES)
    const hash = scryptHashSync(password, salt, pepper)
    return {
      passwordHash: `${VERSION_PREFIX}${salt.toString('base64')}$${hash.toString('base64')}`,
      version: passwordSecret.version
    }
  },

  /**
   * 校验密码。旧版（明文/其它算法）密码一律拒绝，强制重设。
   */
  verifyPassword({ password, userRecord, passwordSecret }) {
    if (!password) return false
    const stored = userRecord && (userRecord.password || userRecord.password_hash)
    if (typeof stored !== 'string' || !stored.startsWith(VERSION_PREFIX)) return false
    try {
      const pepper = getPepper(passwordSecret)
      const rest = stored.slice(VERSION_PREFIX.length)
      const sep = rest.indexOf('$')
      if (sep <= 0) return false
      const salt = Buffer.from(rest.slice(0, sep), 'base64')
      const expected = Buffer.from(rest.slice(sep + 1), 'base64')
      const actual = scryptHashSync(password, salt, pepper)
      return safeEqual(actual, expected)
    } catch (e) {
      return false
    }
  },

  // 供单元测试/脚本使用
  _internal: { VERSION_PREFIX }
}
