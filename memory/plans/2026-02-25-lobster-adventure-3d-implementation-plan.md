# 龙虾历险记（3D）- Implementation Plan

**Goal:** 在现有 Web2 账号体系下交付可玩的 3D 海底探索闯关 MVP（探索、战斗、采集、结算、成长闭环）
**Approach:** 采用 Next.js + React Three Fiber + Drei 的轻量 3D 架构，首版不引入真实物理引擎，使用逻辑碰撞与范围判定
**Estimated Total Time:** 1080 分钟（约 4-5 个开发日）

## Checkpoint 1: 场景入口与工程骨架（~120 min）
- [ ] Task 1: 新增 3D 路由页面骨架（~4 min）
  - **Action:** 创建 `src/app/adventure3d/page.tsx`，渲染基础容器与占位 HUD
  - **Verify:** 访问 `/adventure3d` 页面可加载且无控制台报错
- [ ] Task 2: 新增模块目录结构（~5 min）
  - **Action:** 创建 `src/features/adventure3d/{core,scene,systems,ui,entities,save,config}`
  - **Verify:** 目录结构完整，可被 TypeScript 正常解析
- [ ] Task 3: 定义运行态类型（~4 min）
  - **Action:** 在 `core/types.ts` 定义 `RunState / PlayerState / EnemyState / RewardState`
  - **Verify:** 类型被 page 与系统模块正常导入
- [ ] Task 4: 建立单局状态仓库（~5 min）
  - **Action:** 新建 `core/runStore.ts`，实现 `startRun/pauseRun/finishRun/resetRun`
  - **Verify:** 页面按钮可驱动状态切换并实时显示
- [ ] Task 5: 配置常量文件（~4 min）
  - **Action:** 新建 `config/gameBalance.ts`，放置基础血量、伤害、掉落倍率
  - **Verify:** 常量变更可在页面读取并生效
- [ ] Task 6: 接入 RequireAuth（~3 min）
  - **Action:** 在 3D 页面包裹 `RequireAuth`
  - **Verify:** 未登录访问时跳转 `/auth`
- [ ] Task 7: 新增导航入口（~4 min）
  - **Action:** 在 `src/app/page.tsx` 增加“3D冒险”入口链接
  - **Verify:** 首页点击后可进入 `/adventure3d`
- [ ] Task 8: 文案国际化占位（~5 min）
  - **Action:** 在 `src/lib/locales/zh.ts` 与 `src/lib/locales/en.ts` 增加 `adventure3d` 基础文案
  - **Verify:** 中英文切换时新文案同步变化

## Checkpoint 2: 海底场景与相机系统（~150 min）
- [ ] Task 1: 搭建 Canvas 与基础场景（~5 min）
  - **Action:** 在 `scene/AdventureScene.tsx` 初始化 `Canvas`、相机、灯光
  - **Verify:** 页面显示 3D 画面而非空白
- [ ] Task 2: 海底地形与边界（~5 min）
  - **Action:** 添加简化地面 Mesh 与边界体积判定
  - **Verify:** 玩家移动不会越界
- [ ] Task 3: 背景体积雾与色调（~4 min）
  - **Action:** 设置场景 fog 与环境色营造深海层次
  - **Verify:** 画面呈现明显海底氛围
- [ ] Task 4: 海草/岩石实例化（~5 min）
  - **Action:** 使用 `InstancedMesh` 放置装饰物
  - **Verify:** 物件数量提升后帧率仍稳定
- [ ] Task 5: 主相机跟随（~5 min）
  - **Action:** 实现第三人称平滑跟随与转向
  - **Verify:** 角色移动时镜头平滑无抖动
- [ ] Task 6: 相机边界限制（~4 min）
  - **Action:** 限制相机最小/最大俯仰和缩放
  - **Verify:** 无法进入穿模角度
- [ ] Task 7: 小地图占位（~4 min）
  - **Action:** 在 HUD 放置简化小地图（先静态框）
  - **Verify:** UI 层不遮挡关键战斗信息
- [ ] Task 8: 场景加载状态（~4 min）
  - **Action:** 增加 loading 进度提示与失败兜底
  - **Verify:** 弱网/慢机时有明确加载反馈

## Checkpoint 3: 玩家控制与动作反馈（~150 min）
- [ ] Task 1: 键鼠输入映射（~5 min）
  - **Action:** 创建 `systems/inputSystem.ts`，支持 WASD/Shift/Space/鼠标
  - **Verify:** 键位可驱动移动、冲刺、普攻
- [ ] Task 2: 角色移动系统（~5 min）
  - **Action:** `systems/movementSystem.ts` 实现速度、加速度、阻尼
  - **Verify:** 操作手感流畅，停止无突兀漂移
- [ ] Task 3: 目标锁定（~5 min）
  - **Action:** 实现最近敌人自动锁定与手动切换
  - **Verify:** 战斗时攻击目标稳定
- [ ] Task 4: 普攻判定（~4 min）
  - **Action:** 扇形/球形范围判定命中敌人
  - **Verify:** 命中时敌方血量减少且不会多次重复结算
- [ ] Task 5: 技能 CD 与资源消耗（~4 min）
  - **Action:** 在 runStore 加入技能冷却与能量消耗
  - **Verify:** CD 未完成时按钮禁用，能量不足不可释放
- [ ] Task 6: 受击反馈（~4 min）
  - **Action:** 增加受击闪烁、屏幕震动、飘字
  - **Verify:** 命中反馈明显且不影响帧率
- [ ] Task 7: 玩家死亡与复活点（~5 min）
  - **Action:** 实现 HP=0 触发 checkpoint 复活
  - **Verify:** 死亡后可在最近检查点继续
- [ ] Task 8: 输入可配置占位（~3 min）
  - **Action:** 抽离按键映射常量，预留设置面板接口
  - **Verify:** 改按键不改系统主逻辑

## Checkpoint 4: 敌人 AI、战斗回路与掉落（~180 min）
- [ ] Task 1: 敌人实体工厂（~5 min）
  - **Action:** 创建 `entities/enemyFactory.ts`，支持普通/精英参数模板
  - **Verify:** 可批量生成不同敌人且属性正确
- [ ] Task 2: AI 状态机（~5 min）
  - **Action:** `systems/enemyAiSystem.ts` 实现巡逻/警戒/追击/攻击/回归
  - **Verify:** 敌人在不同距离触发对应状态
- [ ] Task 3: 敌人攻击判定（~5 min）
  - **Action:** 实现敌方攻击范围与攻击前摇
  - **Verify:** 玩家可通过走位规避部分伤害
- [ ] Task 4: 仇恨与脱战逻辑（~4 min）
  - **Action:** 增加脱战重置与生命回复策略
  - **Verify:** 拉怪距离过远会重置战斗
- [ ] Task 5: 掉落系统（~5 min）
  - **Action:** `systems/lootSystem.ts` 根据敌人类型产出资源与 `$MYTH`
  - **Verify:** 击杀后固定概率掉落且可被拾取
- [ ] Task 6: 关卡波次推进（~5 min）
  - **Action:** 增加“清怪后开门/解锁区域”机制
  - **Verify:** 玩家可从区 1 推进到区 2
- [ ] Task 7: Boss 原型（~5 min）
  - **Action:** 实装 1 个 Boss（3 招式轮换 + 读条提示）
  - **Verify:** Boss 可完整执行技能循环并可被击败
- [ ] Task 8: 战斗日志/调试面板（~4 min）
  - **Action:** 添加开发调试开关显示 DPS、TTK、命中率
  - **Verify:** 调参时可快速观测平衡性

## Checkpoint 5: 采集、成长与结算闭环（~120 min）
- [ ] Task 1: 采集点生成系统（~4 min）
  - **Action:** `systems/gatherSystem.ts` 生成海底采集节点
  - **Verify:** 地图可见采集点并可交互
- [ ] Task 2: 采集交互与读条（~4 min）
  - **Action:** 实现按键采集、打断、完成奖励
  - **Verify:** 采集中移动会中断并重置进度
- [ ] Task 3: 局内强化面板（~5 min）
  - **Action:** 提供 3 选 1 强化（攻击/防御/CD）
  - **Verify:** 选择后角色属性即时变化
- [ ] Task 4: 结算评分规则（~5 min）
  - **Action:** 根据通关时间、击杀、采集、剩余生命计算评分
  - **Verify:** 同局重复测试评分稳定可解释
- [ ] Task 5: 奖励回写经济系统（~4 min）
  - **Action:** 通过 `src/lib/economy.ts` 写入 `$MYTH` 奖励
  - **Verify:** 结算后主页/市场可看到余额变化
- [ ] Task 6: 新手引导步骤（~4 min）
  - **Action:** 添加首局 4 步引导（移动/攻击/采集/结算）
  - **Verify:** 首次进入能完成核心学习路径

## Checkpoint 6: 存档、账号隔离与稳定性（~120 min）
- [ ] Task 1: 账号隔离存档键（~4 min）
  - **Action:** 基于 `getScopedStorageKey` 设计 `adventure3d-save` 键
  - **Verify:** A/B 两个账号进度互不影响
- [ ] Task 2: 存档结构与版本号（~4 min）
  - **Action:** 在 `save/profileSave.ts` 定义 `version` 与迁移函数
  - **Verify:** 升级字段后旧存档可自动迁移
- [ ] Task 3: 自动保存策略（~5 min）
  - **Action:** 关键事件触发保存（过区、拾取稀有掉落、击败 Boss）
  - **Verify:** 强刷页面后恢复到最近检查点
- [ ] Task 4: 崩溃恢复兜底（~4 min）
  - **Action:** 对 JSON 解析失败加回退与告警
  - **Verify:** 损坏存档不会导致页面白屏
- [ ] Task 5: 平衡参数热更新入口（~5 min）
  - **Action:** 预留 URL 参数或 local config 覆盖 balance
  - **Verify:** 不改代码可快速调怪物血量/掉率
- [ ] Task 6: 关键错误埋点（~4 min）
  - **Action:** 增加统一 error boundary 与 console 分层日志
  - **Verify:** 运行异常可定位到模块级别

## Checkpoint 7: UI、音效与性能收尾（~180 min）
- [ ] Task 1: HUD 完整化（~5 min）
  - **Action:** 血量、能量、技能 CD、任务目标、区域进度全量显示
  - **Verify:** 战斗时不依赖控制台即可掌握状态
- [ ] Task 2: 暂停/设置面板（~5 min）
  - **Action:** 提供音量、画质、灵敏度与返回首页按钮
  - **Verify:** 设置改动即时生效并持久化
- [ ] Task 3: 海底舒缓 BGM 接入（~4 min）
  - **Action:** 在 `src/lib/sounds.ts` 增加 3D 冒险专用 BGM 控制
  - **Verify:** 进入关卡自动淡入，离开页面自动停止
- [ ] Task 4: 事件音效分层（~4 min）
  - **Action:** 攻击、受击、掉落、升级、结算分别配置
  - **Verify:** 音效不互相盖住，且可独立开关
- [ ] Task 5: 低画质模式（~5 min）
  - **Action:** 关闭阴影/降低粒子/减少实例数量
  - **Verify:** 中端设备帧率显著提升
- [ ] Task 6: 首屏与资源优化（~5 min）
  - **Action:** 拆分重资源、延迟加载非首屏模块
  - **Verify:** `/adventure3d` 首屏可交互时间下降
- [ ] Task 7: 可访问性与移动端操作（~5 min）
  - **Action:** 增加触屏按钮布局与焦点可见性
  - **Verify:** 移动端可完成基础闯关
- [ ] Task 8: 回归测试清单执行（~5 min）
  - **Action:** 手测首页、登录、市场、战斗、采集与 3D 模式切换
  - **Verify:** 新增功能不破坏既有页面流程

## Verification Criteria
- [ ] 所有 checkpoint 任务完成并自检通过
- [ ] 3D 模式完成“探索→战斗→采集→结算→成长”闭环
- [ ] Web2 账号隔离存档可复现，A/B 账号数据不串
- [ ] `$MYTH` 奖励与现有经济页面一致
- [ ] 桌面端稳定可玩（目标 60fps），移动端可运行（目标 30fps）
- [ ] 用户确认玩法与体验达到 MVP 预期
