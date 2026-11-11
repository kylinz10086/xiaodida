'use strict'
/**
 * 一次性测试数据准备（临时函数，验证完会改成空实现）
 *
 * 目的：把一条待接单的测试订单"转"成别人发布的，这样骑手账号才能抢
 * （业务规则不允许接自己发布的单，这条规则不能为了测试而放开）。
 */
const db = uniCloud.database()

exports.main = async () => {
	const col = db.collection('xyyx-tasks')
	const res = await col.where({ status: 1, pay_status: 'paid' }).limit(5).get()
	const tasks = res.data || []
	const target = tasks.find((t) => t.publisher_id !== 'test_publisher_b')
	if (!target) {
		return { ok: true, changed: 0, msg: '没有需要处理的订单' }
	}
	await col.doc(target._id).update({
		publisher_id: 'test_publisher_b',
		publisher_nickname: '同学B',
		origin_publisher_id: target.publisher_id
	})
	console.log('[z-test] 已把订单', target._id, '的发布者改成 test_publisher_b')
	return { ok: true, changed: 1, taskId: target._id }
}
