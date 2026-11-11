# 校递达后端开发指南

## 一、项目概述

当前项目使用 **uniCloud** 云开发，数据存储在前端本地 Storage，需要迁移到云端数据库实现多端数据同步。

---

## 二、数据库设计

### 2.1 需要创建的数据表

在 `uniCloud-aliyun/database/` 目录下创建以下 schema 文件：

#### 1. `xyyx-tasks.schema.json` - 任务表

```json
{
  "bsonType": "object",
  "required": ["title", "type", "money", "publisher_id"],
  "properties": {
    "_id": { "description": "任务ID" },
    "title": { "bsonType": "string", "description": "任务标题" },
    "type": { "bsonType": "int", "description": "任务类型: 1快递代取 2代带餐食 3其他" },
    "typeText": { "bsonType": "string", "description": "类型文字" },
    "thing": { "bsonType": "string", "description": "物品名称" },
    "description": { "bsonType": "string", "description": "任务描述" },
    "money": { "bsonType": "double", "description": "报酬金额" },
    "itemSize": { "bsonType": "string", "description": "物品大小" },
    "timeOption": { "bsonType": "string", "description": "送达时间" },
    "origin": {
      "bsonType": "object",
      "properties": {
        "name": { "bsonType": "string" },
        "latitude": { "bsonType": "double" },
        "longitude": { "bsonType": "double" }
      }
    },
    "destination": {
      "bsonType": "object",
      "properties": {
        "name": { "bsonType": "string" },
        "latitude": { "bsonType": "double" },
        "longitude": { "bsonType": "double" }
      }
    },
    "status": { "bsonType": "int", "description": "状态: 1待接单 2进行中 3已完成 4已取消" },
    "publisher_id": { "bsonType": "string", "description": "发布者ID" },
    "publisher_name": { "bsonType": "string", "description": "发布者昵称" },
    "publisher_avatar": { "bsonType": "string", "description": "发布者头像" },
    "runner_id": { "bsonType": "string", "description": "接单者ID" },
    "runner_name": { "bsonType": "string", "description": "接单者昵称" },
    "runner_avatar": { "bsonType": "string", "description": "接单者头像" },
    "create_time": { "bsonType": "timestamp", "description": "创建时间" },
    "accept_time": { "bsonType": "timestamp", "description": "接单时间" },
    "complete_time": { "bsonType": "timestamp", "description": "完成时间" },
    "cancel_time": { "bsonType": "timestamp", "description": "取消时间" },
    "cancel_reason": { "bsonType": "string", "description": "取消原因" }
  }
}
```

#### 2. `xyyx-users.schema.json` - 用户扩展信息表

```json
{
  "bsonType": "object",
  "required": ["user_id"],
  "properties": {
    "_id": { "description": "记录ID" },
    "user_id": { "bsonType": "string", "description": "关联uni-id-users的_id" },
    "nickname": { "bsonType": "string", "description": "昵称" },
    "avatar": { "bsonType": "string", "description": "头像URL" },
    "mobile": { "bsonType": "string", "description": "手机号" },
    "school": { "bsonType": "string", "description": "学校" },
    "published_count": { "bsonType": "int", "description": "发布任务数" },
    "accepted_count": { "bsonType": "int", "description": "接单任务数" },
    "total_income": { "bsonType": "double", "description": "总收入" },
    "balance": { "bsonType": "double", "description": "余额" },
    "create_time": { "bsonType": "timestamp" },
    "update_time": { "bsonType": "timestamp" }
  }
}
```

#### 3. `xyyx-orders.schema.json` - 订单记录表

```json
{
  "bsonType": "object",
  "required": ["task_id", "user_id", "order_type"],
  "properties": {
    "_id": { "description": "订单ID" },
    "task_id": { "bsonType": "string", "description": "关联任务ID" },
    "user_id": { "bsonType": "string", "description": "用户ID" },
    "order_type": { "bsonType": "string", "description": "published/accepted" },
    "status": { "bsonType": "int", "description": "订单状态" },
    "create_time": { "bsonType": "timestamp" }
  }
}
```

#### 4. `xyyx-transactions.schema.json` - 交易记录表

```json
{
  "bsonType": "object",
  "required": ["user_id", "amount", "type"],
  "properties": {
    "_id": { "description": "交易ID" },
    "user_id": { "bsonType": "string", "description": "用户ID" },
    "task_id": { "bsonType": "string", "description": "关联任务ID" },
    "amount": { "bsonType": "double", "description": "金额" },
    "type": { "bsonType": "string", "description": "income/expense/refund" },
    "description": { "bsonType": "string", "description": "交易描述" },
    "create_time": { "bsonType": "timestamp" }
  }
}
```

### 2.2 更新 db_init.json

```json
{
  "opendb-device": {},
  "opendb-open-data": {},
  "opendb-verify-codes": {},
  "uni-id-device": {},
  "uni-id-log": {},
  "uni-id-permissions": {},
  "uni-id-roles": {},
  "uni-id-users": {},
  "xyyx-tasks": {},
  "xyyx-users": {},
  "xyyx-orders": {},
  "xyyx-transactions": {}
}
```

---

## 三、云函数开发

### 3.1 创建业务云函数

在 `uniCloud-aliyun/cloudfunctions/` 目录下创建：

#### 1. `xyyx-task` - 任务相关操作

```
xyyx-task/
├── index.obj.js      # 云对象入口
├── package.json
└── lib/
    ├── publish.js    # 发布任务
    ├── list.js       # 获取任务列表
    ├── detail.js     # 获取任务详情
    ├── accept.js     # 接单
    ├── complete.js   # 完成任务
    ├── cancel.js     # 取消任务
    └── abandon.js    # 放弃任务
```

#### 2. `xyyx-user` - 用户相关操作

```
xyyx-user/
├── index.obj.js      # 云对象入口
├── package.json
└── lib/
    ├── get-info.js       # 获取用户信息
    ├── update-info.js    # 更新用户信息
    ├── get-stats.js      # 获取统计数据
    └── get-orders.js     # 获取用户订单
```

### 3.2 云对象示例代码

#### `xyyx-task/index.obj.js`

```js
'use strict';

const db = uniCloud.database();
const dbCmd = db.command;
const tasksCollection = db.collection('xyyx-tasks');
const ordersCollection = db.collection('xyyx-orders');
const usersCollection = db.collection('xyyx-users');

module.exports = {
  async publish(data) {
    const { title, type, money, thing, description, origin, destination, itemSize, timeOption } = data;
    
    const uid = this.getUniIdToken().uid;
    if (!uid) {
      return { code: 401, msg: '请先登录' };
    }
    
    const userRes = await usersCollection.doc(uid).get();
    const user = userRes.data[0] || {};
    
    const typeTextMap = { 1: '快递代取', 2: '代带餐食', 3: '其他' };
    
    const taskData = {
      title,
      type,
      typeText: typeTextMap[type] || '其他',
      thing,
      description,
      money: parseFloat(money),
      itemSize,
      timeOption,
      origin,
      destination,
      status: 1,
      publisher_id: uid,
      publisher_name: user.nickname || '微信用户',
      publisher_avatar: user.avatar || '',
      create_time: Date.now()
    };
    
    const res = await tasksCollection.add(taskData);
    
    await ordersCollection.add({
      task_id: res.id,
      user_id: uid,
      order_type: 'published',
      status: 1,
      create_time: Date.now()
    });
    
    await usersCollection.doc(uid).update({
      published_count: dbCmd.inc(1)
    });
    
    return { code: 0, msg: '发布成功', data: { id: res.id } };
  },
  
  async getList(params) {
    const { status, type, page = 1, pageSize = 20 } = params;
    
    let query = tasksCollection.where({ status: status || 1 });
    
    if (type) {
      query = query.where({ type });
    }
    
    const countRes = await query.count();
    const listRes = await query
      .orderBy('create_time', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();
    
    return {
      code: 0,
      data: {
        list: listRes.data,
        total: countRes.total,
        page,
        pageSize
      }
    };
  },
  
  async accept(taskId) {
    const uid = this.getUniIdToken().uid;
    if (!uid) {
      return { code: 401, msg: '请先登录' };
    }
    
    const userRes = await usersCollection.doc(uid).get();
    const user = userRes.data[0] || {};
    
    const taskRes = await tasksCollection.doc(taskId).get();
    const task = taskRes.data[0];
    
    if (!task) {
      return { code: 404, msg: '任务不存在' };
    }
    
    if (task.status !== 1) {
      return { code: 400, msg: '任务已被接取' };
    }
    
    if (task.publisher_id === uid) {
      return { code: 400, msg: '不能接取自己发布的任务' };
    }
    
    await tasksCollection.doc(taskId).update({
      status: 2,
      runner_id: uid,
      runner_name: user.nickname || '跑腿员',
      runner_avatar: user.avatar || '',
      accept_time: Date.now()
    });
    
    await ordersCollection.add({
      task_id: taskId,
      user_id: uid,
      order_type: 'accepted',
      status: 2,
      create_time: Date.now()
    });
    
    await usersCollection.doc(uid).update({
      accepted_count: dbCmd.inc(1)
    });
    
    return { code: 0, msg: '接单成功' };
  },
  
  async complete(taskId) {
    const uid = this.getUniIdToken().uid;
    if (!uid) {
      return { code: 401, msg: '请先登录' };
    }
    
    const taskRes = await tasksCollection.doc(taskId).get();
    const task = taskRes.data[0];
    
    if (!task || task.runner_id !== uid) {
      return { code: 403, msg: '无权操作' };
    }
    
    await tasksCollection.doc(taskId).update({
      status: 3,
      complete_time: Date.now()
    });
    
    await ordersCollection.where({
      task_id: taskId,
      user_id: uid
    }).update({ status: 3 });
    
    await usersCollection.doc(uid).update({
      total_income: dbCmd.inc(task.money)
    });
    
    return { code: 0, msg: '任务完成' };
  },
  
  async cancel(taskId, reason) {
    const uid = this.getUniIdToken().uid;
    if (!uid) {
      return { code: 401, msg: '请先登录' };
    }
    
    const taskRes = await tasksCollection.doc(taskId).get();
    const task = taskRes.data[0];
    
    if (!task || task.publisher_id !== uid) {
      return { code: 403, msg: '无权操作' };
    }
    
    if (task.status !== 1) {
      return { code: 400, msg: '只能取消待接单的任务' };
    }
    
    await tasksCollection.doc(taskId).update({
      status: 4,
      cancel_time: Date.now(),
      cancel_reason: reason || '用户取消'
    });
    
    await ordersCollection.where({ task_id: taskId }).update({ status: 4 });
    
    return { code: 0, msg: '已取消' };
  }
};
```

#### `xyyx-user/index.obj.js`

```js
'use strict';

const db = uniCloud.database();
const dbCmd = db.command;
const usersCollection = db.collection('xyyx-users');
const ordersCollection = db.collection('xyyx-orders');
const tasksCollection = db.collection('xyyx-tasks');

module.exports = {
  async getInfo() {
    const uid = this.getUniIdToken().uid;
    if (!uid) {
      return { code: 401, msg: '请先登录' };
    }
    
    const res = await usersCollection.doc(uid).get();
    
    if (res.data.length === 0) {
      const newUser = {
        _id: uid,
        nickname: '',
        avatar: '',
        mobile: '',
        school: '浙江中医药大学',
        published_count: 0,
        accepted_count: 0,
        total_income: 0,
        balance: 0,
        create_time: Date.now(),
        update_time: Date.now()
      };
      await usersCollection.add(newUser);
      return { code: 0, data: newUser };
    }
    
    return { code: 0, data: res.data[0] };
  },
  
  async updateInfo(data) {
    const uid = this.getUniIdToken().uid;
    if (!uid) {
      return { code: 401, msg: '请先登录' };
    }
    
    const { nickname, avatar, mobile } = data;
    
    await usersCollection.doc(uid).update({
      nickname,
      avatar,
      mobile,
      update_time: Date.now()
    });
    
    return { code: 0, msg: '更新成功' };
  },
  
  async getMyOrders(params) {
    const uid = this.getUniIdToken().uid;
    if (!uid) {
      return { code: 401, msg: '请先登录' };
    }
    
    const { orderType, status, page = 1, pageSize = 20 } = params;
    
    let query = ordersCollection.where({ user_id: uid });
    
    if (orderType) {
      query = query.where({ order_type: orderType });
    }
    if (status) {
      query = query.where({ status });
    }
    
    const ordersRes = await query
      .orderBy('create_time', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();
    
    const taskIds = ordersRes.data.map(o => o.task_id);
    const tasksRes = await tasksCollection.where({
      _id: dbCmd.in(taskIds)
    }).get();
    
    const taskMap = {};
    tasksRes.data.forEach(t => { taskMap[t._id] = t; });
    
    const list = ordersRes.data.map(order => ({
      ...order,
      task: taskMap[order.task_id] || {}
    }));
    
    return { code: 0, data: { list } };
  }
};
```

---

## 四、前端改造

### 4.1 修改 store/index.js

将本地存储操作替换为云函数调用：

```js
import { myRequest } from '@/common/oyyl-js/request'

const callCloudFunction = async (cloudObjectName, method, params) => {
  const clientInfo = uni.getStorageSync('uniIdToken');
  return await uniCloud.importObject(cloudObjectName)[method](params);
};

// actions 中替换
async publishTask({ commit, state }, taskData) {
  const xyyxTask = uniCloud.importObject('xyyx-task');
  const res = await xyyxTask.publish(taskData);
  if (res.code === 0) {
    return res.data;
  }
  throw new Error(res.msg);
},

async getTaskList({ commit }, params) {
  const xyyxTask = uniCloud.importObject('xyyx-task');
  const res = await xyyxTask.getList(params);
  return res.data;
},

async acceptTask({ commit }, { taskId }) {
  const xyyxTask = uniCloud.importObject('xyyx-task');
  const res = await xyyxTask.accept(taskId);
  if (res.code !== 0) {
    throw new Error(res.msg);
  }
}
```

### 4.2 修改页面调用

```js
// pages/xyyx/index/index.vue
async loadTasks() {
  const xyyxTask = uniCloud.importObject('xyyx-task');
  const res = await xyyxTask.getList({ status: 1, page: 1, pageSize: 20 });
  this.taskList = res.data.list;
}

// pages/xyyx/release-requirements/release-requirements.vue
async submitTask() {
  const xyyxTask = uniCloud.importObject('xyyx-task');
  await xyyxTask.publish(this.formData);
  uni.showToast({ title: '发布成功', icon: 'success' });
}
```

---

## 五、开发步骤

### 第一步：创建数据库表
1. 在 `uniCloud-aliyun/database/` 创建 schema 文件
2. 右键 `db_init.json` -> 初始化云数据库

### 第二步：创建云函数
1. 在 `uniCloud-aliyun/cloudfunctions/` 创建 `xyyx-task` 和 `xyyx-user`
2. 编写 `package.json` 和 `index.obj.js`
3. 右键云函数目录 -> 上传并部署

### 第三步：修改前端代码
1. 修改 `store/index.js` 使用云函数
2. 修改各页面调用方式
3. 移除本地存储逻辑

### 第四步：测试验证
1. 测试发布任务
2. 测试接单流程
3. 测试用户信息同步
4. 测试多端数据同步

---

## 六、注意事项

1. **权限控制**：在云对象中使用 `this.getUniIdToken()` 获取用户信息
2. **数据校验**：云函数中需要对传入参数进行校验
3. **事务处理**：涉及多表操作时使用数据库事务
4. **错误处理**：统一返回格式 `{ code, msg, data }`
5. **分页查询**：列表接口支持分页，避免一次加载过多数据
