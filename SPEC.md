# MythicPets - 神话宠物链游

## 1. Project Overview

**项目名称**: MythicPets（神话宠物）
**项目类型**: Web3 宠物养成 + 战斗链游
**链**: Base (Layer 2)
**目标用户**: 加密爱好者、休闲游戏玩家

---

## 2. Core Features

### 2.1 钱包登录
- RainbowKit 多钱包支持（500+ 钱包）
- 支持: MetaMask, Coinbase Wallet, Rainbow, Trust, Ledger, WalletConnect
- 中英文双语界面

### 2.2 宠物系统
- **NFT 宠物**: ERC-721 标准
- **属性**: 名称、等级、经验值、攻击力、防御力、生命值、稀有度
- **稀有度**: 普通(Common)、稀有(Rare)、史诗(Epic)、传说(Legendary)、神话(Mythic)
- **免费领取**: 每个钱包可领取一只初始宠物

### 2.3 战斗系统
- **回合制对战**: 玩家 vs AI 怪物
- **技能**: 普通攻击、特殊技能
- **升级**: 战斗胜利获得经验值，升级提升属性

### 2.4 代币经济
- **$MYTH 代币**: ERC-20 游戏货币
- **获取方式**: 战斗胜利、每日签到、任务奖励
- **用途**: 购买道具、刷新宠物技能、解锁新功能

### 2.5 繁殖系统
- 两只宠物可繁殖新 NFT
- 新宠物继承部分父母属性
- 稀有宠物可在 OpenSea 等市场交易

---

## 3. Technical Architecture

### Frontend
- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **3D 渲染**: React Three Fiber + Drei
- **钱包**: RainbowKit + wagmi
- **样式**: Tailwind CSS
- **国际化**: react-i18next

### Smart Contracts
- **宠物 NFT**: ERC-721 (OpenZeppelin)
- **代币**: ERC-20 (OpenZeppelin)
- **部署**: Base Sepolia (测试) → Base (主网)

### 存储
- **元数据**: IPFS (宠物图片、属性)
- **链上**: 宠物 NFT 数据、代币余额

---

## 4. UI/UX Design

### 4.1 视觉风格
- **主题**: 神话/奇幻风格
- **主色调**: 
  - 主色: #6366F1 (Indigo)
  - 次色: #8B5CF6 (Purple)
  - 强调: #F59E0B (Gold)
  - 背景: #0F172A (深蓝黑)
- **字体**: 中文思源黑体 + English (Inter)

### 4.2 页面结构
1. **首页/Landing**: 登录入口、游戏介绍
2. **主页/Dashboard**: 宠物列表、状态概览
3. **战斗/Battle**: 回合制战斗界面
4. **繁殖/Breed**: 宠物繁殖界面
5. **市场/Market**: NFT 交易市场（跳转）

### 4.3 响应式
- 移动端优先设计
- 支持 320px - 1920px 屏幕

---

## 5. Internationalization (i18n)

### 支持语言
- 中文 (zh-CN) - 默认
- English (en)

### 切换方式
- 页面顶部语言切换按钮
- 自动检测浏览器语言

---

## 6. Development Phases

### Phase 1: MVP (Week 1)
- [x] 项目初始化
- [ ] 钱包登录集成
- [ ] 智能合约部署
- [ ] 宠物领取功能
- [ ] 基础战斗系统

### Phase 2: 扩展 (Week 2)
- [ ] 繁殖系统
- [ ] 代币经济
- [ ] 道具系统
- [ ] 排行榜

### Phase 3: 完善 (Week 3)
- [ ] 高级战斗模式
- [ ] NFT 交易市场集成
- [ ] 社交功能
- [ ] 移动端优化

---

## 7. Success Metrics

- 100+ 钱包注册
- 500+ 宠物 NFT 铸造
- 日活 50+ 用户
- $MYTH 代币持有人在 100+

---

## 8. Risks & Mitigations

| 风险 | 缓解措施 |
|------|----------|
| 智能合约漏洞 | 使用 OpenZeppelin 标准库、代码审计 |
| Gas 费用高 | 使用 Base L2，费用低 |
| 用户门槛高 | 免费领取宠物，无需初始资金 |
| 游戏性不足 | 快速迭代，根据用户反馈优化 |

---

## 9. Team

- **开发**: 银月 AI 助手
- **创意**: 龙伟
- **代码托管**: https://github.com/longwei3/mythic-pets

---

*Last Updated: 2026-02-23*
