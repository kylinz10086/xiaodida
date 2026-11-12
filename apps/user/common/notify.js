/**
 * 订阅消息
 *
 * 模板 id 要在微信公众平台申请后填进来；没配置时整个流程静默跳过，
 * 不能因为没模板就报错或卡住下单。
 *
 * 模板规划（运营需要在后台申请）：
 *   taskAccepted  —— 骑手接单通知（发给发布者）
 *   taskDelivered —— 订单送达通知（发给发布者）
 *   riderNewTask  —— 大厅有新任务（可选，发给骑手）
 */
export const TEMPLATES = {
	taskAccepted: '',
	taskDelivered: '',
	riderNewTask: ''
}

/** 请求订阅授权；没配置模板 / 用户拒绝都返回 false，不抛错 */
export function requestNotify(types) {
	const list = (Array.isArray(types) ? types : [types])
		.map((t) => TEMPLATES[t])
		.filter((id) => !!id)
	if (!list.length) return Promise.resolve(false)
	return new Promise((resolve) => {
		uni.requestSubscribeMessage({
			tmplIds: list.slice(0, 3),
			success: () => resolve(true),
			fail: () => resolve(false)
		})
	})
}
