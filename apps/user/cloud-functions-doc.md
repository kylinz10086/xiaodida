# 校递达 - 云函数文档

## 架构概览

整个后端由 **1个云对象** + **2个数据表** 组成，精简无冗余。

| 组件 | 名称 | 说明 |
|------|------|------|
| 云对象 | `xyyx` | 所有业务逻辑统一入口 |
| 数据表 | `xyyx-tasks` | 任务数据 |
| 数据表 | `xyyx-users` | 用户数据 |

---

## 云对象 `xyyx`

路径：`uniCloud-aliyun/cloudfunctions/xyyx/index.obj.js`

前端调用方式：
```javascript
const xyyx = uniCloud.importObject('xyyx');
const res = await xyyx.方法名(参数);
```

所有方法返回格式：`{ code: 0, msg: '...', data: {...} }`，`code !== 0` 表示失败。

---

### 1. `getTaskList(params)`

**用途**：获取任务市场列表（首页任务大厅展示）

**参数**：
| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| status | int | 否 | 1 | 任务状态筛选，1=待接单 |
| type | int | 否 | - | 任务类型筛选，1=快递 2=带餐 3=其他 |
| page | int | 否 | 1 | 页码 |
| pageSize | int | 否 | 50 | 每页条数 |

**返回**：`{ list: [], total, page, pageSize }`

**调用场景**：首页加载任务列表

---

### 2. `getTaskDetail(taskId)`

**用途**：获取单个任务详情

**参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| taskId | string | 是 | 任务ID |

**返回**：任务完整对象

**调用场景**：任务详情页展示

---

### 3. `publishTask(data)`

**用途**：发布新任务

**参数** `data` 对象：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 任务标题 |
| type | int | 是 | 任务类型 1=快递 2=带餐 3=其他 |
| money | number | 是 | 悬赏金额 |
| description | string | 否 | 详细描述 |
| itemType | string | 否 | 物品类型 |
| itemSize | string | 否 | 物品大小 |
| itemWeight | string | 否 | 物品重量 |
| timeOption | string | 否 | 时间选项 |
| deadline | string | 否 | 截止时间 |
| origin | object | 否 | 取件地点 `{name, position}` |
| destination | object | 否 | 送达地点 `{name, position}` |
| phoneNumber | string | 否 | 联系电话 |
| wechatId | string | 否 | 微信号 |
| remark | string | 否 | 备注 |
| images | array | 否 | 图片URL列表 |

**返回**：`{ id: '新任务ID' }`

**副作用**：用户 `published_count` +1

**调用场景**：发布需求页提交

---

### 4. `acceptTask(taskId)`

**用途**：跑腿员接单

**参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| taskId | string | 是 | 任务ID |

**校验**：
- 任务必须为待接单状态（status=1）
- 不能接自己发布的任务

**副作用**：
- 任务状态 → 2（进行中）
- 记录 runner_id / runner_name / runner_avatar / accept_time
- 用户 `accepted_count` +1

**调用场景**：任务列表/详情页点击接单

---

### 5. `completeTask(taskId)`

**用途**：跑腿员标记任务完成

**参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| taskId | string | 是 | 任务ID |

**校验**：只有接单者（runner_id）可操作

**副作用**：
- 任务状态 → 3（已完成）
- 记录 complete_time
- 跑腿员 `total_income` += 任务金额

**调用场景**：跑腿员在订单页确认完成

---

### 6. `confirmTask(taskId)`

**用途**：发布者确认任务完成

**参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| taskId | string | 是 | 任务ID |

**校验**：只有发布者（publisher_id）可操作

**副作用**：
- 任务状态 → 3（已完成）
- 记录 complete_time

**调用场景**：发布者在订单页确认完成

---

### 7. `cancelTask(taskId, reason)`

**用途**：发布者取消任务

**参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| taskId | string | 是 | 任务ID |
| reason | string | 否 | 取消原因 |

**校验**：
- 只有发布者可操作
- 只能取消待接单状态（status=1）的任务

**副作用**：
- 任务状态 → 4（已取消）
- 记录 cancel_time / cancel_reason
- 发布者 `published_count` -1

**调用场景**：发布者取消订单、编辑重新发布时先取消旧任务

---

### 8. `abandonTask(taskId)`

**用途**：跑腿员放弃已接任务

**参数**：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| taskId | string | 是 | 任务ID |

**校验**：只有接单者（runner_id）可操作

**副作用**：
- 任务状态恢复为 1（待接单）
- 清除 runner_id / runner_name / runner_avatar / accept_time
- 跑腿员 `accepted_count` -1

**调用场景**：跑腿员放弃订单

---

### 9. `getMyTasks(params)`

**用途**：获取当前用户相关的所有任务（发布的+接取的）

**参数**：
| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| role | string | 否 | - | 筛选角色：`publisher` 仅发布的，`runner` 仅接取的，不传则全部 |
| status | int | 否 | - | 按状态筛选 |
| page | int | 否 | 1 | 页码 |
| pageSize | int | 否 | 50 | 每页条数 |

**返回**：`{ list: [], total, page, pageSize }`

每条任务额外附带 `role` 字段（`publisher` 或 `runner`），标识当前用户在该任务中的角色。

**调用场景**：订单页加载我的订单列表

---

### 10. `getUserInfo()`

**用途**：获取当前登录用户信息

**参数**：无

**返回**：用户完整对象（nickname, avatar, mobile, school, published_count, accepted_count, total_income 等）

**特殊逻辑**：若用户首次登录（`xyyx-users` 中无记录），自动创建默认用户记录。

**调用场景**：我的页面加载用户信息

---

### 11. `updateUserInfo(data)`

**用途**：更新当前用户信息

**参数** `data` 对象：
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| nickname | string | 否 | 昵称 |
| avatar | string | 否 | 头像URL |
| mobile | string | 否 | 手机号 |

**调用场景**：我的页面编辑昵称/头像/手机号

---

## 数据表结构

### `xyyx-tasks`

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 任务ID |
| title | string | 任务标题 |
| type | int | 类型：1快递 2带餐 3其他 |
| typeText | string | 类型文字 |
| description | string | 详细描述 |
| money | double | 悬赏金额 |
| itemSize | string | 物品大小 |
| itemType | string | 物品类型 |
| itemWeight | string | 物品重量 |
| timeOption | string | 时间选项 |
| deadline | string | 截止时间 |
| origin | object | 取件地点 `{name, position}` |
| destination | object | 送达地点 `{name, position}` |
| status | int | 状态：1待接单 2进行中 3已完成 4已取消 |
| publisher_id | string | 发布者ID |
| publisher_name | string | 发布者昵称 |
| publisher_avatar | string | 发布者头像 |
| runner_id | string | 接单者ID |
| runner_name | string | 接单者昵称 |
| runner_avatar | string | 接单者头像 |
| phoneNumber | string | 联系电话 |
| wechatId | string | 微信号 |
| remark | string | 备注 |
| images | array | 图片列表 |
| create_time | int | 创建时间戳 |
| accept_time | int | 接单时间戳 |
| complete_time | int | 完成时间戳 |
| cancel_time | int | 取消时间戳 |
| cancel_reason | string | 取消原因 |

### `xyyx-users`

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 用户ID（与uni-id-users一致） |
| nickname | string | 昵称 |
| avatar | string | 头像URL |
| mobile | string | 手机号 |
| school | string | 学校 |
| published_count | int | 发布任务数 |
| accepted_count | int | 接单任务数 |
| total_income | double | 总收入 |
| create_time | int | 创建时间戳 |
| update_time | int | 更新时间戳 |

---

## 任务状态流转

```
发布 → [1 待接单] → 接单 → [2 进行中] → 完成/确认 → [3 已完成]
                  ↓                        ↓
              取消 → [4 已取消]         放弃 → [1 待接单]（回归市场）
```

| 操作 | 执行者 | 前置状态 | 目标状态 |
|------|--------|----------|----------|
| publishTask | 发布者 | - | 1 |
| acceptTask | 跑腿员 | 1 | 2 |
| completeTask | 跑腿员 | 2 | 3 |
| confirmTask | 发布者 | 2 | 3 |
| cancelTask | 发布者 | 1 | 4 |
| abandonTask | 跑腿员 | 2 | 1 |
