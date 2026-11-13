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
  eq(Buffer.from(img.data.base64, 'base64').toString(), 'fake-image-bytes', 'base64 是真实图片内容')
  eq(img.data.done, true, '小图一次返回完（done=true）')
  eq(img.data.size, 16, '返回原始字节数')
  const over = await call(userObj.getImageData, 'cloud://env-test/chat1.jpg', 999)
  eq(over.code, 400, '偏移量超出图片大小被拒')
  const badImg = await call(userObj.getImageData, 'not-a-file')
  eq(badImg.code, 400, '非法地址被拒')

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
