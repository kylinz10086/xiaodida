'use strict'
/**
 * 图片相关回归测试（头像 / 聊天图片 / 订单图片与留痕）
 *
 * 守的是这几个已经踩过的坑：
 *   1. 头像存成 data URI 被服务端 300 字上限挡掉 → 头像永远存不进去；
 *   2. 聊天图片只存 cloud://，小程序显示要临时链接，域名没配/链接过期就全裂；
 *      现在必须把缩略图 data URI 一起存下来；
 *   3. 列表接口不该带缩略图（会把返回体撑爆），只有详情接口带。
 *
 * 运行：node tests/image-flow.spec.js
 */

const { createEnv } = require('./fake-uni')

let passed = 0
const failures = []

function ok(cond, label, extra) {
  if (cond) {
    passed++
    console.log('  [OK] ' + label)
  } else {
    failures.push(label + (extra ? ' -> ' + JSON.stringify(extra) : ''))
    console.log('  [FAIL] ' + label + (extra ? ' -> ' + JSON.stringify(extra) : ''))
  }
}

function eq(actual, expect, label) {
  ok(actual === expect, label, { actual, expect })
}

const THUMB = 'data:image/jpeg;base64,' + 'A'.repeat(1800)

async function main() {
  const env = createEnv({ uid: 'pub-1' })
  const { C, userObj, riderObj, meta, addDoc, get, setUid, call } = env

  addDoc('xyyx-users', { _id: 'pub-1', nickname: '发布者', role: 'user', rider_status: 0, mobile: '13800000001' })
  addDoc('xyyx-users', { _id: 'rider-1', nickname: '骑手', role: 'rider', rider_status: 2, mobile: '13800000002' })
  addDoc('xyyx-users', { _id: 'guest-1', nickname: '路人', role: 'user', rider_status: 0 })

  console.log('\n[1] 头像 data URI 能存进去（不再被 300 字上限挡住）')
  const avatar = 'data:image/jpeg;base64,' + 'A'.repeat(4000)
  setUid('pub-1')
  const saveAvatar = await call(userObj.updateProfile, { avatar, ...meta() })
  eq(saveAvatar.code, 0, '保存头像成功: ' + saveAvatar.msg)
  eq(get('xyyx-users', 'pub-1').avatar, avatar, '库里就是压缩后的 data URI')
  const profile = await call(userObj.getProfile)
  eq(profile.data.avatar, avatar, 'getProfile 原样返回头像')

  console.log('\n[2] 头像格式 / 大小仍有校验')
  const tooBig = await call(userObj.updateProfile, {
    avatar: 'data:image/jpeg;base64,' + 'A'.repeat(30000),
    ...meta()
  })
  eq(tooBig.code, 400, '超过 16KB 被拒')
  const badScheme = await call(userObj.updateProfile, { avatar: 'javascript:alert(1)', ...meta() })
  eq(badScheme.code, 400, '非图片格式被拒')

  console.log('\n[3] 发布订单时图片缩略图一起存')
  const fileIds = ['cloud://env-test/a.jpg', 'cloud://env-test/b.jpg']
  const publish = await call(userObj.publishTask, {
    title: '帮我取个快递',
    type: 1,
    amount: 5,
    mobile: '13800000001',
    origin: { name: '菜鸟驿站', detail: '3 号楼', latitude: 30.1, longitude: 120.1 },
    destination: { name: '宿舍 6 号楼', detail: '502', latitude: 30.2, longitude: 120.2 },
    images: fileIds,
    image_thumbs: [THUMB, THUMB],
    ...meta()
  })
  eq(publish.code, 0, '发布成功: ' + publish.msg)
  const taskId = publish.data.id
  const task = get('xyyx-tasks', taskId)
  eq(task.images.length, 2, 'fileID 存了 2 个')
  eq(task.image_thumbs.length, 2, '缩略图存了 2 个')
  eq(task.image_thumbs[0], THUMB, '缩略图内容一致')
  eq(task.publisher_avatar, avatar, '订单里带上发布者头像')

  console.log('\n[4] 详情给缩略图，列表不给（避免返回体爆炸）')
  const detail = await call(userObj.getTaskDetail, taskId)
  eq(detail.code, 0, '详情 ok')
  eq(detail.data.image_thumbs.length, 2, '发布者详情能看到缩略图')
  eq(detail.data.pick_proof_thumb, '', '还没留痕就是空串')

  setUid('guest-1')
  // 发布后还没付款，不会进大厅；这里直接把它标成已支付，验证「列表不带缩略图」
  await C.db.collection('xyyx-tasks').doc(taskId).update({
    pay_status: 'paid',
    paid_cent: 500,
    status: C.STATUS.PENDING
  })
  const hall = await call(userObj.listHall, {})
  const hallItem = (hall.data.list || []).find((x) => x._id === taskId)
  ok(!!hallItem, '大厅能看到这单')
  eq((hallItem.image_thumbs || []).length, 0, '大厅列表不带缩略图')
  eq(hallItem.pick_proof_thumb, '', '大厅也看不到留痕缩略图')

  console.log('\n[5] 聊天图片：缩略图跟着消息走')
  setUid('rider-1')
  const grab = await call(riderObj.grabTask, taskId, meta())
  eq(grab.code, 0, '骑手抢单 ok: ' + grab.msg)
  const sendImg = await call(riderObj.sendChat, taskId, 'cloud://env-test/chat1.jpg', meta(), 'image', THUMB)
  eq(sendImg.code, 0, '图片消息发送 ok: ' + sendImg.msg)
  eq(sendImg.data.thumb, THUMB, '返回值里带缩略图')
  const sendText = await call(riderObj.sendChat, taskId, '你好，我到了', meta(), 'text', THUMB)
  eq(sendText.code, 0, '文本消息发送 ok: ' + sendText.msg)
  eq(sendText.data.thumb, '', '文本消息不带缩略图')

  setUid('pub-1')
  const chat = await call(userObj.getChat, taskId)
  eq(chat.code, 0, '拉聊天记录 ok: ' + chat.msg)
  const imgMsg = chat.data.list.find((m) => m.type === 'image')
  ok(!!imgMsg, '能找到图片消息')
  eq(imgMsg.thumb, THUMB, '接收方也拿到缩略图（不用临时链接）')
  eq(imgMsg.content, 'cloud://env-test/chat1.jpg', '原图 fileID 仍然保留')

  const badThumb = await call(riderObj.sendChat, taskId, 'cloud://env-test/chat2.jpg', meta(), 'image', 'not-an-image')
  eq(badThumb.code, 400, '伪造的缩略图被拒')

  console.log('\n[6] 取件留痕缩略图')
  setUid('rider-1')
  const picked = await call(riderObj.markPicked, taskId, meta(), 'cloud://env-test/pick.jpg', THUMB)
  eq(picked.code, 0, '标记取件 ok: ' + picked.msg)
  const taskAfter = get('xyyx-tasks', taskId)
  eq(taskAfter.pick_proof, 'cloud://env-test/pick.jpg', '留痕 fileID 落库')
  eq(taskAfter.pick_proof_thumb, THUMB, '留痕缩略图落库')

  setUid('pub-1')
  const pubDetail = await call(userObj.getTaskDetail, taskId)
  eq(pubDetail.data.pick_proof_thumb, THUMB, '发布者详情能拿到留痕缩略图')

  console.log('\n[7] 高清头像只给本人，不进列表')
  const hd = 'data:image/jpeg;base64,' + 'B'.repeat(50000)
  const saveHd = await call(userObj.updateProfile, { avatar_hd: hd, ...meta() })
  eq(saveHd.code, 0, '保存高清头像 ok: ' + saveHd.msg)
  const profile2 = await call(userObj.getProfile)
  eq(profile2.data.avatar_hd, hd, 'getProfile 返回高清头像')
  eq(profile2.data.avatar, avatar, '压缩版头像没被覆盖')

  setUid('rider-1')
  const chat2 = await call(riderObj.getChat, taskId)
  eq(chat2.data.peer.avatar, avatar, '聊天里对方头像用压缩版（返回体不至于太大）')
  eq(chat2.data.peer.avatar_hd, undefined, '聊天接口不下发高清头像')

  console.log('\n[8] 服务端取图（不依赖 downloadFile 域名）')
  setUid('pub-1')
  const img = await call(userObj.getImageData, 'cloud://env-test/chat1.jpg')
  eq(img.code, 0, '取图 ok: ' + img.msg)
  eq(img.data.mime, 'image/jpeg', 'mime 正确')
  const got = Buffer.from(img.data.base64, 'base64')
  eq(got[0], 0xff, 'JPEG 文件头正确（0xFF）')
  eq(got[1], 0xd8, 'JPEG 文件头正确（0xD8）')
  eq(img.data.done, true, '小图一次返回完（done=true）')
  eq(img.data.size, got.length, '返回原始字节数')
  const over = await call(userObj.getImageData, 'cloud://env-test/chat1.jpg', 999)
  eq(over.code, 400, '偏移量超出图片大小被拒')
  const badImg = await call(userObj.getImageData, 'not-a-file')
  eq(badImg.code, 400, '非法地址被拒')

  console.log('\n[9] 图片字节直存数据库（1.11.0，看图不碰云存储）')
  // 400KB → base64 约 546KB：既能进库（≤620KB），又必须按 400KB 切成 2 片，
  // 正好验证分片 / 4 字符对齐 / 拼接
  const bigBuf = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.alloc(400 * 1024, 7),
    Buffer.from([0xff, 0xd9])
  ])
  const bigB64 = bigBuf.toString('base64')
  await C.saveImageData('cloud://env-test/db.jpg', bigB64, { size: bigBuf.length })

  const p1 = await call(userObj.getImageData, 'cloud://env-test/db.jpg', 0)
  eq(p1.code, 0, '直存取图 ok: ' + p1.msg)
  eq(p1.data.source, 'db', 'source=db（没有去读云存储）')
  eq(p1.data.done, false, '300KB 图需要分片')
  let acc = p1.data.base64
  let off = p1.data.offset + p1.data.chunk
  let done = p1.data.done
  let guard = 0
  while (!done && guard++ < 20) {
    const p = await call(userObj.getImageData, 'cloud://env-test/db.jpg', off)
    eq(p.code, 0, '第 ' + (guard + 1) + ' 片 ok')
    acc += p.data.base64
    off = p.data.offset + p.data.chunk
    done = p.data.done
  }
  ok(acc === bigB64, '分片拼回来和原 base64 完全一致')
  eq(Buffer.from(acc, 'base64').length, bigBuf.length, '解码后字节数一致')
  eq(p1.data.size, bigBuf.length, 'size 是解码后的字节数')
  eq(p1.data.chunk % 4, 0, '分片长度是 4 的倍数（base64 对齐）')

  console.log('\n[10] 老图自愈：读云存储成功后自动补存')
  const firstRead = await call(userObj.getImageData, 'cloud://env-test/heal.jpg', 0)
  eq(firstRead.code, 0, '老图第一次能读出来')
  eq(firstRead.data.source, 'store', '第一次走云存储')
  const secondRead = await call(userObj.getImageData, 'cloud://env-test/heal.jpg', 0)
  eq(secondRead.data.source, 'db', '第二次直接命中直存（已自愈）')
  ok(secondRead.data.base64 === firstRead.data.base64, '两次取到的内容一致')

  console.log('\n[11] 超大图不进数据库（避免文档过大）')
  const huge = Buffer.alloc(700 * 1024, 9)
  huge[0] = 0xff
  huge[1] = 0xd8
  const key = await C.saveImageData('cloud://env-test/huge.jpg', huge.toString('base64'))
  eq(key, '', '超过 620KB 不写库')
  const hugeRead = await call(userObj.getImageData, 'cloud://env-test/huge.jpg', 0)
  eq(hugeRead.data.source, 'store', '超大图仍能通过云存储读出来')

  console.log('\n-----------------------------')
  console.log('passed ' + passed + ', failed ' + failures.length)
  if (failures.length) {
    failures.forEach((f) => console.log('  FAILED: ' + f))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
