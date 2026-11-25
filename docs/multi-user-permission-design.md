# BIU 多人协作权限体系探讨与改造方案

> 本文档整理了围绕 BIU 多人协作权限体系的全部讨论问题、核心设计取舍，以及基于 **「用户子集（Member View）× 二维数据子集（Data View：行 + 列）」** 初衷的最终落地方案与现有代码改造清单。

---

## 一、讨论问题总览

本次探讨依次覆盖了以下核心问题：

1. **现状诊断**：现有权限体系在多人协作场景下存在哪些具体隐患与漏洞？
2. **业界参考**：有哪些成熟的权限模型与产品范式可以借鉴？
3. **贴合 BIU 初衷**：围绕 BIU「一切皆路径 + 声明式 + 人与 Agent 同一操作者模型」的基因，权限应该怎么抽象？
4. **核心模型定型**：坚持「用户子集匹配数据子集」的初衷是否可行？业界有哪些先例？最终如何设计？
5. **二维裁剪与数据边界**：如何补齐**列级权限（可见列 / 可写列）**？数据子集具体覆盖 BIU 中的哪些表和资源？
6. **多类视图的平衡**：页面内嵌数据库视图、页面/记录自带呈现视图、外部 `/views` 三者之间是什么关系？无编辑权能否改页面自带视图？

---

## 二、现有权限体系在多人协作下的核心问题

结合 `packages/host-account` 与 `packages/core-file-system` 的当前实现，主要存在 6 类隐患：

1. **「动态视图即权限」带来的提权与隔离漏洞（高危）**
   - `packages/host-account/src/host/authorization.ts` 中 `/views` 直接按 `membership` 给非 `viewer` 成员赋予 `manager`，**未排除 `member_kind === 'external' | 'guest'`**（外部协作者在 `store.ts` 中写入的是 `role = 'member', member_kind = 'external'`）。
   - `packages/core-file-system/src/host/saved-views.ts` 对非索引表视图不做创建者隔离，且 `saved_views` / `saved_view_tombstones` **缺少 `workspace_id` 隔离**。普通成员甚至外部协作者可篡改被 `view_grants` 或 `member_view` 引用的视图 `filters`，从而动态扩大自身权限。
   - 删除视图时（`http-routes.ts`）只清理了外链 `shares.revokeView`，未级联清理 `view_grants` 和 `record_grants(subject_type='member_view')`。

2. **跨页文件读写与空间级接口侧信道泄露（高危）**
   - `store.ts` 的 `memberActivity` 只校验了 `requireMember`，导致任意成员（含 `external / guest / viewer`）都能看到其他成员操作过的**私密记录标题、详情及授权列表**。
   - `http-routes.ts` 的 `serveDbFile` / `putDbFile` 只校验了对 query 参数 `path` 的读写权，**未校验文件名 `:name` 本身是否归属于 `path`**，存在拿自己页面 `path` 跨页读写他人 `view-*.jsx` / 附件文件的风险。

3. **状态机冲突与合并不一致**
   - `store.ts` 的 `reconcileRecordScope` 在每次增删协作者后都会强行把 `resource_policies.access_mode` 覆写成 `'restricted'` 或 `'private'`：给全空间可见（`members`）或继承父级（`inherit`）的记录单独加一个协作者，会**瞬间导致原全员失权或切断父子继承链**。
   - `authorization.ts` 中 `effectiveRole` 命中 `directRole` 就提前返回（可能导致隐式降权），而与 `dataViewRole` 合并时又取 `maxRole`，两套合并规则矛盾。
   - `updateMemberRole`、`addGroupMemberByEmail` 变更后遗漏 `authorization.invalidateAll()`；`legacy` 兜底分支未排除 `external / guest`。

4. **离职 / 移出成员后的「孤儿资产」与外链脱钩**
   - `removeMember` 未转移被移除成员名下的私密记录（`owner_account_id`），且空间 Owner 对他人私密记录无接管权，导致永久孤儿数据。
   - 公开外链（`shares-store`）独立于 `AuthorizationService` 运行，原分享人离职或记录改私密后不会自动失效；`EditLock`、`session_execution_leases` 及 `granted_by` 视图授权也未同步清理。

5. **AI Agent 与 MCP 代理边界缺失**
   - `Actor` 已定义 `type: 'agent'`，但业务代码中从未真正构造使用，Agent 仍直接借壳人类账号全权运行，共享会话场景存在 Confused Deputy（诱导越权）风险。
   - MCP 凭证目前仅有工具白名单 `allowedTools`，缺少数据范围（表/视图/只读）约束。

6. **权限粒度偏粗且缺少列级控制**
   - 线性 `ROLE_RANK` 缺少 `commenter`（仅查看 + 批注）角色，无法区分“可编辑不可分享”“可改部分列不可改敏感列”。
   - 内部协作的 `view_grants` 目前仅控制行级可见性，未在后端对记录字段、汇总统计和查询条件做列级裁剪。

---

## 三、业界参考与「用户子集 × 数据子集」初衷验证

### 1. 「用户子集 × 数据子集」并非孤例
这一模型在结构化与企业级系统中非常成熟：
- **Salesforce（Criteria-based Sharing Rules）**：用户集合 × 条件记录子集。
- **飞书多维表格 / 钉钉多维表 / 明道云**：部门/角色/人员子集 × 行列筛选子集。
- **AWS IAM（ABAC）**：Principal Tags（用户标签子集）匹配 Resource Tags（资源标签子集）。
- **PostgreSQL RLS**：用户属性动态匹配行级策略。

普通文档工具少用它，主要是因为静态文件夹更直观、且传统工具的成员不是一张可建视图的表；而 BIU 天生万物皆表，**底层坚持「用户子集 × 数据子集」统一建模，表层提供 80% 静态常用操作（私密 / 空间 / 指定人 / 继承）+ 20% 动态视图分权，是极具差异化的架构优势**。

### 2. 吸收的成熟工程原则
- **轻量 ReBAC（Google Zanzibar / OpenFGA）**：所有 Allow 规则统一取并集，不互相覆写。
- **Google Drive 正交槽位**：通用访问/继承 与 指定协作者正交叠加；成员离职强制所有权转移。
- **飞书多维表格**：绑定了权限的视图自动锁定边界条件（`filters + columns`），防止普通成员改筛选提权。
- **Capability 矩阵 + 权限衰减（GitHub App / OAuth Scope）**：用能力集合替代线性整数；Agent / MCP / 外链权限永远满足 `Effective = 触发者权限 ∩ 代理自身 Scope`。

---

## 四、最终权限设计方案

### 1. 四个核心原语

1. **统一主体（Principal）**
   - `user:<accountId>`（内部成员 / 外部协作者 / 访客）
   - `group:<groupId>`（成员组）
   - `member_view:<viewId>`（动态用户子集，全空间内部成员即 `builtin-all` 内部成员视图）
   - `agent:<sessionId>`（AI Agent 实例）
   - `token:<tokenId>`（公开外链 & MCP 凭证）

2. **原子能力集合（Capabilities）**
   - 基础动作：`read`、`comment`、`write`、`delete`、`move`、`grant`
   - 插件扩展：`action:<name>`（由插件在 schema 中声明等价的基础能力，未声明默认 `write`）
   - UI 预设角色：
     - `viewer` = `{ read }`
     - `commenter` = `{ read, comment }`
     - `editor` = `{ read, comment, write }`
     - `manager` = `{ read, comment, write, delete, move, grant }`
     - `owner` = `manager` + 转让所有权 / 不可被他人移除

3. **二维数据子集（Row + Column）**
   一条授权规则表达为：
   $$\text{用户子集} \xrightarrow{\ \text{行能力} + \text{可读列} / \text{可写列}\ } \text{数据子集（单条 / 子树 / 数据视图）}$$
   - **行维度**：单条路径、父子继承子树、或数据视图的 `filters / filterTree`。
   - **列维度**：`readable_columns`（默认继承绑定视图的 `columns`，含正文 `$content` 和标签属性列 `tag::<id>::<key>`）、`writable_columns`（支持可见但只读）、`denied_columns`（高敏列显式剔除）。

4. **权限天花板（Ceiling）**
   - `workspace_role === 'viewer'` → 上限 `{ read, comment }`
   - `member_kind === 'external' | 'guest'` → 硬性禁止空间级聚合接口（`/`、`/workspace-members` 全表、`/views` 写、`memberActivity`）
   - `agent` / `mcp` / `public-link` → 受各自 `scope` 衰减约束

---

### 2. 唯一统一的求值公式（零歧义）

对任意请求 `(actor, verb, path, record?)`：

1. **准入与硬边界**：校验空间成员身份；`external / guest` 直接拦截空间级聚合路径；`public-link` 校验签发人仍在空间内且未过期。
2. **收集命中的所有授权（纯并集，绝不截断）**：
   - `owner` 归属 + 单条直接授权 + 成员组/成员视图授权 + 父子继承（仅当 `inherit_parent = 1`）+ 命中的数据视图授权。
3. **行能力合并（Allow 并集 − Deny 差集 ∩ Ceiling）**：
   $$\text{EffectiveCaps} = \left(\left(\bigcup \text{Allow}\right) \setminus \left(\bigcup \text{Deny}\right)\right) \cap \text{Ceiling}$$
4. **列集合合并（同条记录多授权叠加）**：
   - $\text{ReadableCols} = \left(\bigcup \text{命中授权的可读列}\right) \setminus \text{DeniedCols}$
   - $\text{WritableCols} = \left(\bigcup \text{命中写授权的可写列}\right) \setminus \text{DeniedCols}$
5. **Agent / MCP 代理衰减**：
   - 交互触发：$\text{Effective} = \text{Eval}(\text{触发者}) \cap \text{Scope}(\text{Agent})$
   - 后台自动 / MCP：$\text{Effective} = \text{Eval}(\text{委托人/签发人}) \cap \text{Scope}(\text{Agent/MCP})$

---

### 3. 数据子集覆盖范围（4 层边界划分）

| 层级 | 包含的数据 / 表 | 权限治理方式 |
| :--- | :--- | :--- |
| **一级业务表** | `/pages`、`/tasks`、`/agents`、`/skills`、`/plugins`、`/mcp` 及**所有插件自定义表** | **直接由「用户子集 × 二维数据子集（行+列+正文）」覆盖** |
| **从属/派生数据** | `/editor-blocks`、`/comments`、附件/媒体、`/events`、`/tags`、`/trash`、`/data` | **严格跟随宿主记录的行列权限投影**，不脱离宿主单独放行 |
| **控制面表** | `/workspace-members`（用户子集源）、`/views`（视图容器）、未来的 `/grants` | 仅内部成员可读；成员划分子集字段与已绑定授权的视图（`filters + columns`）**仅 Admin/Owner 或授权管理者可改** |
| **私有与运行时数据** | `/notices`、`workspace_activity_log`、`auth_sessions`、`mcp_credentials`、LLM 密钥、`EditLock`、本机 `host-fs/terminal` | 按个人私有或空间管理面硬隔离；活动流按源记录 `read` 权限过滤 |

---

### 4. 页面内视图与外部视图的平衡规则

| 维度 | 外部视图（`/views`） | 页面内嵌数据库视图（`database-block`） | 页面/记录自带呈现视图（`record_views`） |
| :--- | :--- | :--- | :--- |
| **定位** | 表的顶层视图；绑定授权后成为**权限数据子集** | 嵌在文档里的**局部观察窗口**（`assets/database-*.json`） | 单条记录/页面的**自定义呈现壳子**（`views / propViews / layouts / view-*.jsx`） |
| **从属关系** | 从属于表 | 配置从属宿主页面，**数据权限不从属页面** | 完全从属于宿主页面/记录 |
| **数据可见性** | 定义行+列权限边界 | 默认 `块筛选 ∩ 查看者源表权限`；仅具备源表 `grant` 权时可在分享页时**显式勾选随页签发只读子集** | 跟随宿主页面权限；沙箱代码访问数据时仍受当前查看者行列裁剪 |
| **配置修改权** | 未锁定：内部成员；绑定授权后锁定 `filters + columns`（仅 Admin/Owner） | 具备宿主页面 `write` 权 | 具备宿主页面 `write` 权（无编辑权仅可切换查看，不可保存修改；可执行 JSX 脚本禁外部人写） |

---

### 5. 动态子集的 4 根关键安全护栏

1. **Policy-Locked View（授权视图锁定）**：一旦视图被 `view_grants` / `member_view` / 外链引用，自动锁定 `filters`、`filterTree`、`columns` 与删除权；个人列宽/排序偏好走本地覆盖，不可突破白名单。
2. **锚点字段保护**：被授权视图用作行筛选条件的字段，对普通协作者默认列级只读（或写入时校验是否扩大外部受众，无 `grant` 权则拦截），避免把机密推入外部视图或把自己改出视图。
3. **后端真裁剪 + 查询防侧信道**：读接口、SSE 推送、MCP、`db_stat`、列汇总（`columnSummaries`）统一做后端字段裁剪；`filters / filterTree / sorts / groupBy / query` 禁止引用当前用户不可读的列，杜绝二分探测。
4. **可观测性（Dry-run + Explain）**：修改已绑定授权的视图前展示“新增/收回影响的成员数与记录数”；记录权限面板展示命中的每一条 `(成员视图 X) → (数据视图 Y)` 路径。

---

## 五、现有业务系统分阶段改造清单

### Phase 0（P0：立刻止血，堵死高危越权与泄露）
- [ ] **锁定 `/views` 与补齐隔离**（`authorization.ts`、`saved-views.ts`、`http-routes.ts`）
  - `/views` 鉴权排除 `external / guest`；
  - 已绑定授权的视图锁定 `filters / filterTree / columns` 修改与删除；删视图时同步处理 `view_grants` 和 `member_view`；
  - `saved_views` 与 `saved_view_tombstones` 增加 `workspace_id` 字段。
- [ ] **堵住跨页文件访问漏洞**（`http-routes.ts` `serveDbFile` / `putDbFile`）
  - 校验 `:name` 文件归属与 `path` 一致，防止拿自己的 `path` 跨页读取或覆写他人的 `view-*.jsx` / `database-*.json` / 附件。
- [ ] **收紧 `memberActivity` 与空间级接口**（`store.ts`）
  - 禁止 `external / guest` 调用 `memberActivity / groups / groupMembers / externallySharedRecords`；
  - `memberActivity` 的活动记录按当前查看者 `resource:read` 过滤，非管理员隐藏他人 `grants` 明细。
- [ ] **补齐缓存失效与 `legacy` 收紧**（`store.ts`、`authorization.ts`）
  - `updateMemberRole`、`addGroupMemberByEmail` 后调用 `authorization.invalidateAll()`；
  - `legacy` 分支排除 `external / guest`。

### Phase 1（P1：核心模型收口与列级权限落地）
- [ ] **移除 `reconcileRecordScope` 对 `access_mode` 的覆写**（`store.ts`），使通用访问/继承与 `record_grants` 正交叠加。
- [ ] **统一求值引擎为 `Allow 并集 − Deny 差集 ∩ Ceiling`**（`authorization.ts`），去掉 `directRole` 截断。
- [ ] **升级线性 `ROLE_RANK` 为能力集合**（`authorization.ts`），补出 `commenter` 角色并支持插件 schema 声明 `db_action` 能力。
- [ ] **落地列级权限与后端真裁剪**（`view_grants`、`access-policy.ts`、`core-file-system/src/host/index.ts`、`query-logic.ts`）：
  - 支持 `readable_columns / writable_columns / denied_columns`；
  - 读出口、SSE、MCP、`columnSummaries` 统一做字段裁剪；
  - 写入口逐字段校验 `writable_columns`；
  - 查询入口拦截不可读列的 `filters / sorts / groupBy / query`。

### Phase 2（P2：动态子集协作体验护栏）
- [ ] **锚点字段写入扩散拦截**：编辑被 `view_grants` 引用的筛选字段时，校验受众扩大权限或设为默认只读；成员表划分子集字段限 Admin/Owner 可写。
- [ ] **视图变更 Dry-run 影响预览 & 权限命中解释**：完善 `access-explanation.ts` 与干跑 Diff 接口。
- [ ] **移动记录（`move`）权限扩张保护**：移入更公开父级时默认保持独立权限，显式确认才切换继承。

### Phase 3（P3：离职治理、外链联动与 AI Agent / MCP 闭环）
- [ ] **`removeMember` 资产交接与全量清理**（`store.ts`）：支持 `transferToAccountId` 转交私密记录，同步清理 `granted_by` 视图授权、外链、`EditLock`、`session_execution_leases`。
- [ ] **落地 Agent / MCP 数据子集交集（Scope）**（`authorization.ts`、`host-sessions`、`host-mcp`）：真正启用 `Actor(agent)` 与 `Eval(触发者) ∩ Scope(Agent/MCP)`。
- [ ] **页面内嵌数据库块随页显式授权**：分享页面时支持具备源表 `grant` 权的用户一键派发只读数据子集，并与页面分享生命周期联动。
