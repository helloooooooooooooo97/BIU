import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SiteChrome, SiteFaq, SiteFinalCta, type SiteAction } from './site-chrome.tsx'
import { usePageMeta } from './use-page-meta.ts'
import { IndustryInteractiveDemo } from '../industry-demos.tsx'
import type { DemoPageSpec } from '../scene-page-demo.tsx'

export type CustomPlugin = {
  name: string
  body: string
}

export type RoleWorkflow = {
  id: string
  role: string
  pageTitle: string
  summary: string
  deliverTo: string
  blocks: string[]
  customPlugins: CustomPlugin[]
  demo: DemoPageSpec
}

export type UseCase = {
  slug: string
  index: string
  /** 顶层行业名称 */
  title: string
  /** 行业概览 */
  summary: string
  /** 覆盖的典型角色 */
  roleLabels: string[]
  /** 典型交付物 */
  output: string
  /** 该行业下不同角色的具体页面方案（含仿真 Demo 页） */
  roles: RoleWorkflow[]
  /** 传统多工具拼凑的痛点 */
  pain: string[]
  /** BIU 的解决方式 */
  how: { title: string; body: string }[]
  /** 常见问题 */
  faq: [string, string][]
  /** 行业代表性插件 */
  blocks: string[]
}

const DEMO_LABELS_ZH: SceneDemoLabels = {
  demoBadge: 'BIU 仿真页面示例 · 可交互体验',
  shareLabel: '整页分享链接',
  customBadge: 'AI 定制插件',
  builtInBadge: '内置插件',
  totalLabel: '实时测算合计',
  aiLabel: 'AI 协作者',
}

export const USE_CASES: UseCase[] = [
  {
    slug: 'tech',
    index: '01',
    title: '科技与互联网',
    summary: '将需求文档、可交互原型、排障终端与任务看板整合进不同角色的专属页面，减少研发、产品与设计在多套工具间的上下文切换。',
    roleLabels: ['产品经理', '研发工程师', '交互设计师', '独立开发者'],
    output: '可交互 PRD · 可执行排障手册 · 多智能体研发看板',
    blocks: ['HTML', 'Excalidraw 画板', '页面终端', '代码运行块', '任务'],
    roles: [
      {
        id: 'pm',
        role: '产品经理',
        pageTitle: 'v2.4 结账页改版 · PRD 与原型评审',
        summary: '将需求说明、业务流程图、可交互 HTML 原型与评审意见集中于同一页面，评审会可直接全屏演示并同步拆解任务。',
        deliverTo: '分享给研发与业务方：在会议中直接演示可交互原型，确认方案后即可在同页拆解开发任务。',
        blocks: ['HTML', 'Excalidraw 画板', '表格', '任务'],
        customPlugins: [
          { name: '方案投票与评审意见卡', body: '并排呈现两套交互方案，参会成员直接投票并记录意见，决策过程留存于原页。' },
          { name: '上线埋点验收清单', body: '依据需求自动生成验收条目，产品与测试逐项核对确认。' },
        ],
        demo: {
          title: 'v2.4 结账页改版 · PRD 与原型评审',
          badge: '科技与互联网 / 产品经理',
          props: [
            ['负责人', '林岚（产品）'],
            ['评审状态', '待研发确认'],
            ['关联目标', '支付转化率 +4.5%'],
          ],
          intro: '本次改版将两步结账流程合并为单页快捷支付。下方附带核心指标目标与上线核对清单，评审确认后可直接拆解至任务看板。',
          blocks: [
            {
              kind: 'metrics',
              plugin: '核心目标卡片',
              custom: true,
              title: '改版前后关键指标对比',
              items: [
                { label: '结账流失率', value: '38% → 24%', hint: '目标下降 14pp' },
                { label: '平均完成耗时', value: '62s → 19s', hint: '减少 2 次页面跳转' },
                { label: '客单价提升', value: '+3.2%', hint: '快捷加购推荐位' },
              ],
            },
            {
              kind: 'checklist',
              plugin: '上线验收清单',
              custom: true,
              title: '评审结论与上线前核对（点击可切换状态）',
              items: [
                { label: '默认选中上次支付方式，减少一次弹窗确认', meta: '方案 A · 5 票通过', done: true },
                { label: '自动匹配最大面额优惠券，并支持手动切换', meta: '前后端联调', done: true },
                { label: '支付失败时保留表单内容，支持一键重试', meta: '待补充埋点', done: false },
                { label: '灰度 10% 流量观察 24 小时后全量发布', meta: '发布负责人：周舟', done: false },
              ],
            },
          ],
          aiPrompt: '已读取本页引用的《用户支付流失反馈表》：建议将发票信息移至支付完成后补充填写，可减少两项必填字段。是否为您将上述事项拆解至任务看板？',
        },
      },
      {
        id: 'engineer',
        role: '研发工程师',
        pageTitle: '订单超时排查 · 可执行排障手册',
        summary: '将系统架构图、诊断脚本、交互终端与接口检查卡片整合于一页，响应线上故障时可直接运行诊断命令并记录结论。',
        deliverTo: '供值班同事与团队长期维护：替代容易过期的静态文档，打开页面即可执行诊断与核查。',
        blocks: ['页面终端', '代码运行块', '浏览器', '任务'],
        customPlugins: [
          { name: 'API 健康检查与联调卡', body: '将常用诊断接口与返回结果保留在文档中，一键触发验证。' },
          { name: '发布与回滚核对单', body: '汇总数据库变更、灰度开关与回滚命令，降低发布风险。' },
        ],
        demo: {
          title: '订单超时排查 · 可执行排障手册',
          badge: '科技与互联网 / 研发工程师',
          props: [
            ['服务名称', 'order-gateway'],
            ['最近演练', '2026-11-18'],
            ['值班频道', '#oncall-core'],
          ],
          intro: '当 P99 延迟超过 800ms 或支付回调出现积压时，请按顺序执行下方诊断步骤并勾选止血项。',
          blocks: [
            {
              kind: 'code',
              plugin: '代码运行块',
              title: '步骤 1：检查队列积压与慢查询阈值',
              lang: 'bash · 页面内直接运行',
              code: 'curl -s https://api.internal/health/queue | jq "{lag: .pending, p99_ms: .latency_p99}"',
              output: '{ "lag": 142, "p99_ms": 918 }  # ⚠ lag > 100，建议执行步骤 2 扩容消费者',
            },
            {
              kind: 'checklist',
              plugin: '回滚与止血清单',
              custom: true,
              title: '止血操作核对（点击可切换状态）',
              items: [
                { label: '将 payment-worker 并发数由 8 临时调整至 16', meta: '已确认无锁冲突', done: true },
                { label: '暂停非核心积分同步回调，优先保障主订单落库', meta: 'Feature Flag: sync_points=off', done: false },
                { label: '提取近 10 分钟慢 SQL 交由智能体生成索引优化建议', meta: '指派给 @DBA-Agent', done: false },
              ],
            },
          ],
          aiPrompt: '已对照近一周提交记录：第 3 条慢查询源于 commit 8f21a 新增的未命中索引字段，已起草迁移 SQL 待您确认执行。',
        },
      },
    ],
    pain: [
      '需求文档、交互原型、任务排期与排障脚本分散在多个独立工具中，信息同步成本高。',
      '传统文档工具仅支持静态图文与外部链接，原型无法演示、脚本无法执行，知识库极易过期。',
      '团队成员各自与对话式 AI 交互，方案与排查过程滞留在零散对话中，难以沉淀为团队资产。',
    ],
    how: [
      { title: '文档、原型与终端融为一体', body: '将可交互 HTML 原型、代码运行块与页面终端直接嵌入文档，阅读即操作。' },
      { title: '团队与多智能体基于看板协同', body: '将需求拆解为包含负责人与依赖关系的任务卡，智能体直接读取本页上下文推进执行。' },
      { title: '按需定制研发辅助工具', body: '评审投票卡、埋点验收单或接口检查工具均可由 AI 生成并嵌入页面，无需单独维护内部系统。' },
    ],
    faq: [
      ['能否与现有的 GitHub 或 Jira 并行使用？', '可以。通过 MCP 连接外部仓库与工单系统，智能体可直接读取并同步相关上下文。'],
      ['代码与排障手册能否仅保留在本地？', '可以。选择本机空间后，所有文档与脚本均存储于本地电脑，离线亦可正常访问。'],
    ],
  },
  {
    slug: 'education',
    index: '02',
    title: '教育、培训与知识服务',
    summary: '涵盖技术面试辅导、互动式课件与企业内训，将讲义、白板、代码运行与随堂测验组合于一页，分享链接即可直接学习与练习。',
    roleLabels: ['技术/求职导师', '高校与 K12 教师', '知识专栏作者', '企业内训师'],
    output: '算法辅导页 · 互动课件 · 随堂练习与复盘记录',
    blocks: ['Excalidraw 画板', '算法题卡片', '代码运行块', 'HTML', '表格'],
    roles: [
      {
        id: 'mentor',
        role: '技术 / 求职导师',
        pageTitle: '第 4 周 · 树与动态规划面试辅导',
        summary: '将思路白板、算法题卡、在线代码运行与 Offer 对比表整合在同一页面，作为完整的辅导方案交付给学员。',
        deliverTo: '分享链接给学员：无需安装本地开发环境，在浏览器中即可查看板书、编写代码并运行测试用例。',
        blocks: ['Excalidraw 画板', '算法题卡片', '代码运行块', '表格'],
        customPlugins: [
          { name: '刷题进度与薄弱项统计', body: '按题型自动汇总通过率，清晰呈现下一阶段的复习重点。' },
          { name: '模拟面试倒计时评分卡', body: '提供 45 分钟计时与思路、代码、边界分项评分，复盘记录与当场代码同页留存。' },
        ],
        demo: {
          title: '第 4 周 · 树与动态规划面试辅导',
          badge: '教育与培训 / 面试辅导导师',
          props: [
            ['学员', '陈同学（后端方向）'],
            ['目标岗位', '基础架构 / 后端研发'],
            ['距离一面', '12 天'],
          ],
          intro: '本周重点训练二叉树路径问题与背包状态压缩。参考上方白板的状态转移分析，在下方编写代码并验证全部边界用例。',
          blocks: [
            {
              kind: 'code',
              plugin: '算法题卡片 + 代码运行块',
              title: '随堂练习：二叉树中的最大路径和',
              lang: 'Python 3 · 3/3 测试用例通过（42ms）',
              code: 'def max_path_sum(root):\n    best = -10**9\n    def dfs(node):\n        nonlocal best\n        if not node: return 0\n        l, r = max(0, dfs(node.left)), max(0, dfs(node.right))\n        best = max(best, node.val + l + r)\n        return node.val + max(l, r)\n    dfs(root)\n    return best',
              output: 'PASS [1,2,3] => 6  |  PASS [-10,9,20,null,null,15,7] => 42  |  PASS [-3] => -3',
            },
            {
              kind: 'table',
              plugin: 'Offer 对比表',
              title: '面试进展与 Offer 对比',
              columns: ['公司与部门', '当前阶段', '薪酬预估', '核心考察方向'],
              rows: [
                ['A 公司 · 云原生团队', '已发 Offer', '42w', '高并发与图论'],
                ['B 公司 · 存储引擎', '二面待定', '45w', '树形 DP 与系统设计'],
                ['C 公司 · AI 基础设施', '一面通过', '48w', '分布式调度与编码'],
              ],
            },
          ],
          aiPrompt: '已按评分标准完成检查：时间复杂度为 O(N) 符合预期，建议在面试阐述时主动说明空树与全负数节点的边界处理，已补充至复盘要点。',
        },
      },
      {
        id: 'teacher',
        role: '教师 / 课程讲师',
        pageTitle: '第 3 讲 · 复利曲线与现金流折现',
        summary: '在图文讲义中直接嵌入可视化原理演示与随堂自测卡，帮助学生通过交互理解抽象概念，无需依赖昂贵的网校平台。',
        deliverTo: '分享给全班学生：单节课即为一个可交互页面，打开即可完成原理演示与课后自测。',
        blocks: ['HTML', 'Excalidraw 画板', '页面目录'],
        customPlugins: [
          { name: '随堂测验与解析卡', body: '提交选项后即时展示得分与解析，自动标记错题，减轻人工批改负担。' },
          { name: '知识点抽认卡', body: '将本节核心概念整理为翻面记忆卡，便于课后快速复习。' },
        ],
        demo: {
          title: '第 3 讲 · 复利曲线与现金流折现',
          badge: '教育与培训 / 课程讲师',
          props: [
            ['课程名称', '金融工程导论'],
            ['当前课时', '第 3 / 12 讲'],
            ['作业截止', '本周五 22:00'],
          ],
          intro: '通过下方不同年化收益率的对比结果，直观理解复利效应与折现率敏感性，并完成本节核心知识点核对。',
          blocks: [
            {
              kind: 'metrics',
              plugin: '互动原理演示块',
              custom: true,
              title: '10 万元本金在不同年化收益率下的 10 年终值',
              items: [
                { label: '年化 3%（定存）', value: '¥134,392', hint: '累计收益 +34.4%' },
                { label: '年化 7%（指数）', value: '¥196,715', hint: '累计收益 +96.7%' },
                { label: '年化 12%（成长）', value: '¥310,585', hint: '累计收益 +210.6%' },
              ],
            },
            {
              kind: 'checklist',
              plugin: '随堂掌握度自测',
              custom: true,
              title: '本节核心检查点（点击可勾选）',
              items: [
                { label: '能够清晰区分名义利率与实际年化收益率', meta: '概念理解', done: true },
                { label: '能够运用 72 法则估算资产翻倍周期', meta: '速算练习', done: true },
                { label: '完成下方两道折现率敏感性计算题', meta: '课后作业', done: false },
              ],
            },
          ],
          aiPrompt: '如需为下一期班级更新随堂练习，我可以保留相同知识点结构，自动生成 5 道新题及详细解析。',
        },
      },
    ],
    pain: [
      '静态 PDF 与普通文档缺乏互动性，代码运行、画板推导与随堂测验均需跳转至外部平台。',
      '现成网校系统费用高且定制受限，个人讲师或小团队难以低成本构建专属教学工具。',
      '每节课的讲义、板书、作业与批改反馈散落在群聊与网盘中，学生复习检索困难。',
    ],
    how: [
      { title: '讲义与互动练习同页呈现', body: '白板、代码运行、可视化演示与随堂自测直接嵌入课程正文，学练同步完成。' },
      { title: '单页即课程，链接直达', body: '无需学生注册多个平台，打开分享链接即可直接操作页面内的全部教学工具。' },
      { title: '零门槛定制教学插件', body: '只需清晰描述希望呈现的互动演示或测验规则，即可由 AI 生成插件并加入课件。' },
    ],
    faq: [
      ['学生打开分享链接需要安装客户端吗？', '不需要。整页分享会一并打包正文、附件与插件，学生在浏览器中打开即可使用。'],
      ['课程内容的数据归属如何保障？', '本机空间的数据全部存储于个人电脑，BIU 开源且免费，课程资产完全归创作者所有。'],
    ],
  },
  {
    slug: 'media',
    index: '03',
    title: '媒体、内容与品牌营销',
    summary: '覆盖视频制作、分镜脚本与品牌活动统筹，将素材、时间线预览、封面对比与预算测算集中在一页，让创作者、后期与合作方高效对齐。',
    roleLabels: ['视频编导 / 创作者', '内容运营', '品牌市场', '增长投放'],
    output: '视频全流程制作页 · 活动统筹页 · 渠道预算表',
    blocks: ['视频编排', 'Excalidraw 画板', 'HTML', '表格'],
    roles: [
      {
        id: 'creator',
        role: '视频编导 / 创作者',
        pageTitle: 'EP.18 深度评测 · 从脚本到粗剪制作间',
        summary: '将选题思路、分镜画板、口播稿、时间线粗剪预览与多平台封面对比收拢于一页，版本修改实时同步。',
        deliverTo: '分享给后期剪辑或合作方：在一页内审阅脚本、分镜与粗剪时间线，直接记录修改意见。',
        blocks: ['视频编排', 'Excalidraw 画板', 'HTML', '表格'],
        customPlugins: [
          { name: '口播提词与时长估算器', body: '依据语速自动计算各段落时长，对超时段落进行高亮提示，便于撰稿阶段控制节奏。' },
          { name: '多平台封面标题预览卡', body: '模拟 B 站、YouTube、小红书的列表卡片样式，直观对比备选封面与标题。' },
        ],
        demo: {
          title: 'EP.18 深度评测 · 从脚本到粗剪制作间',
          badge: '媒体与营销 / 视频编导',
          props: [
            ['目标时长', '8 分 30 秒'],
            ['发布平台', 'B 站 · YouTube · 小红书'],
            ['当前阶段', '粗剪审核中'],
          ],
          intro: '前 30 秒直接给出对比结论提升完播率，中段拆解三个典型工作场景。下方时间线块已配置画面与口播轨道。',
          blocks: [
            {
              kind: 'timeline',
              plugin: '视频编排块',
              title: '时间线脚本实时预览（总长 08:24）',
              tracks: [
                {
                  name: '画面轨',
                  segments: [
                    { label: '00:00 开场引入', span: 2 },
                    { label: '00:45 痛点对比', span: 3 },
                    { label: '02:30 实操演示', span: 5 },
                    { label: '06:50 总结引导', span: 2 },
                  ],
                },
                {
                  name: '口播与字幕',
                  segments: [
                    { label: '核心观点 (120字)', span: 2 },
                    { label: '三组案例拆解 (480字)', span: 4 },
                    { label: '实机录屏讲解 (620字)', span: 4 },
                    { label: '结尾收束', span: 2 },
                  ],
                },
              ],
            },
            {
              kind: 'table',
              plugin: '多平台标题封面对比',
              custom: true,
              title: '备选标题与封面视觉方案',
              columns: ['发布平台', '拟定标题', '封面视觉重点', '状态'],
              rows: [
                ['B 站', '告别多工具切换：用一个页面组合整套工作流', '高对比大字 + 实机界面', '已定稿'],
                ['YouTube', 'One Page Replaced 5 Apps in My Daily Workflow', '极简深色 + 对比结构', '待定图'],
                ['小红书', '效率工具整理：把常用小软件装进同一个页面', '清爽卡片截图', '撰稿中'],
              ],
            },
          ],
          aiPrompt: '按您 210 字/分钟的常速估算，第二段口播超出约 22 秒，已为您精简两句过渡表述，确认后可直接替换正文。',
        },
      },
      {
        id: 'marketing',
        role: '品牌市场 / 活动运营',
        pageTitle: '春季发布会 · 活动统筹与预算页',
        summary: '将活动排期、渠道预算实时测算器、物料清单与落地页预览整合于一页，跨部门同步清晰高效。',
        deliverTo: '分享给管理层与合作代理：打开链接即可查看预算构成、物料进度与关键节点。',
        blocks: ['表格', 'HTML', 'Excalidraw 画板'],
        customPlugins: [
          { name: '渠道预算分配测算器', body: '勾选投放渠道与场次，实时计算总预算与预期获客成本。' },
          { name: '物料交付追踪清单', body: '为海报、视频与新闻稿指定负责人及截止时间，自动标示延期风险。' },
        ],
        demo: {
          title: '春季发布会 · 活动统筹与预算页',
          badge: '媒体与营销 / 市场活动',
          props: [
            ['上线日期', '2026-12-10'],
            ['预算上限', '¥120,000'],
            ['核心目标', '预约线索 3,000+'],
          ],
          intro: '通过下方预算测算器勾选不同推广组合，实时核对是否在 12 万元预算范围内，同步跟进各项物料进度。',
          blocks: [
            {
              kind: 'calculator',
              plugin: '渠道预算测算器',
              custom: true,
              title: '投放渠道组合测算（点击可切换选项）',
              currency: '¥',
              unit: '',
              items: [
                { id: 'kol', label: '科技垂类创作者深度评测（6 位）', price: 48000, note: '预估曝光 45w', defaultOn: true },
                { id: 'live', label: '线上直播推流与现场搭建', price: 26000, note: '多平台同步直播', defaultOn: true },
                { id: 'ads', label: '信息流精准再营销投放', price: 32000, note: '覆盖近期官网访客', defaultOn: true },
                { id: 'offline', label: '线下快闪体验展位', price: 35000, note: '可选增项', defaultOn: false },
              ],
            },
          ],
          aiPrompt: '当前所选组合合计 ¥106,000，剩余 ¥14,000 机动预算。是否将 6 位创作者的排期同步写入下方追踪表？',
        },
      },
    ],
    pain: [
      '选题、分镜、文稿、素材与修改意见分散在不同软件与聊天记录中，难以确认最新版本。',
      '传统文档工具无法承载时间线预览、预算测算与多平台封面对比，仍需频繁切换专业工具。',
      '与外部后期或合作方对接时反复传输文件包，沟通成本高且版本容易混乱。',
    ],
    how: [
      { title: '创意、预览与排期同页协同', body: '将分镜画板、时间线视频编排与排期表置于同一页面，修改文稿后即可查看效果。' },
      { title: '组件视图统一管理多期内容', body: '分散在各页面中的视频编排块会自动汇聚为结构化总表，便于全局筛选与调度。' },
      { title: '单页交付外部合作方', body: '对方打开分享链接即可审阅脚本、预览时间线并勾选确认项，无需反复打包传输。' },
    ],
    faq: [
      ['视频编排块支持实时合成预览吗？', '支持。通过时间线脚本组织镜头、字幕与素材，可在页面内直接实时预览效果。'],
      ['大体积视频素材如何管理？', '素材作为附件保存于所选空间（本机空间直接存于本地硬盘），不影响正文编辑流畅度。'],
    ],
  },
  {
    slug: 'consulting',
    index: '04',
    title: '专业服务与企业交付',
    summary: '面向咨询顾问、设计开发外包团队与律师法务，将静态方案文档升级为可交互测算、可核对进度的客户专属交付门户。',
    roleLabels: ['咨询顾问', '设计/开发代理团队', '律师与法务', '独立服务者'],
    output: '客户交付门户 · 交互报价器 · 合同条款审查页',
    blocks: ['表格', 'HTML', '页面目录', '浏览器'],
    roles: [
      {
        id: 'consultant',
        role: '咨询顾问 / 代理团队',
        pageTitle: '企业数字化升级 · 客户方案与报价门户',
        summary: '将方案说明、交互式报价计算器、阶段里程碑与资料清单整合于一页，以定制化软件的体验交付专业服务。',
        deliverTo: '分享专属链接给客户：客户可自行调整服务模块测算预算，并在线核对项目进度与启动资料。',
        blocks: ['表格', 'HTML', '页面目录'],
        customPlugins: [
          { name: '交互式报价与 ROI 计算器', body: '客户勾选服务模块与实施周期，实时呈现总预算与预期回报，减少反复核对。' },
          { name: '里程碑验收与资料清单', body: '清晰列明各阶段交付物、负责人及待客户提供材料，协作进度透明可控。' },
        ],
        demo: {
          title: '企业数字化升级 · 客户方案与报价门户',
          badge: '专业服务 / 咨询顾问',
          props: [
            ['客户名称', '星河制造（华东）'],
            ['项目顾问', '顾明'],
            ['报价有效期', '2026-12-31'],
          ],
          intro: '结合上周现场调研结果，下方将可选服务拆分为四个模块。您可直接勾选测算总预算，并核对首阶段启动资料清单。',
          blocks: [
            {
              kind: 'calculator',
              plugin: '交互报价计算器',
              custom: true,
              title: '按需选择服务模块（点击实时测算总价）',
              currency: '¥',
              unit: '（含税）',
              items: [
                { id: 'audit', label: '业务流程诊断与瓶颈报告', price: 35000, note: '2 周交付 · 含现场访谈', defaultOn: true },
                { id: 'proto', label: '核心工单与库存工作台搭建', price: 68000, note: '4 周交付 · 含 5 套定制插件', defaultOn: true },
                { id: 'train', label: '团队实操培训与手册交付', price: 15000, note: '2 场全员工作坊', defaultOn: true },
                { id: 'retainer', label: '季度持续优化与顾问支持', price: 24000, note: '可选 · 按季结算', defaultOn: false },
              ],
            },
            {
              kind: 'checklist',
              plugin: '里程碑与资料清单',
              custom: true,
              title: '启动前资料核对（点击可切换状态）',
              items: [
                { label: '提供近 3 个月订单与退换货脱敏样本表', meta: '客户运营部提供', done: true },
                { label: '确认 3 位关键岗位访谈名单与日程', meta: '已预约本周四下午', done: true },
                { label: '确认最终报价组合并签署项目启动单', meta: '待客户确认', done: false },
              ],
            },
          ],
          aiPrompt: '已根据客户所选的 3 个模块自动起草 6 周实施排期与合同附件摘要，是否直接插入页面底部？',
        },
      },
      {
        id: 'legal',
        role: '律师 / 企业法务',
        pageTitle: 'A 轮融资协议 · 条款审查与风险清单',
        summary: '将协议修订要点、风险分级对比与待协商清单集中在一页，帮助创始团队与投资方高效聚焦核心谈判条款。',
        deliverTo: '分享给客户或管理层：将冗长的法律文本转化为结构化的风险分级表与修订建议。',
        blocks: ['表格', '页面目录', 'HTML'],
        customPlugins: [
          { name: '条款风险分级对比表', body: '按高、中、低风险归类修订条款，并列呈现对方诉求与我方建议措辞。' },
          { name: '交割先决条件追踪单', body: '逐条追踪工商变更、董事会决议与签字页进度。' },
        ],
        demo: {
          title: 'A 轮融资协议 · 条款审查与风险清单',
          badge: '专业服务 / 律师与法务',
          props: [
            ['委托方', '某 AI 科技公司'],
            ['审查版本', 'SPA v3（投资方修订）'],
            ['高风险项', '2 项待重点协商'],
          ],
          intro: '已完成投资方 v3 修订稿的逐条比对，核心分歧集中于回购触发条件与反稀释条款，建议优先就下表前两项作出书面反馈。',
          blocks: [
            {
              kind: 'table',
              plugin: '条款风险对比块',
              custom: true,
              title: '关键修订条款审查结论',
              columns: ['条款章节', '风险等级', '对方修订要点', '我方建议'],
              rows: [
                ['第 8.2 条 回购权', '高风险', '连带创始人个人无限责任', '限定为以创始人所持公司股权为限'],
                ['第 6.1 条 反稀释', '中风险', '改为完全棘轮条款', '坚持广义加权平均计算方式'],
                ['第 11.4 条 信息权', '低风险', '增加月度现金流简报', '可接受，调整为季报后 15 日内提交'],
              ],
            },
          ],
          aiPrompt: '已在本地空间完成协议比对（未上传至外部云盘）。是否为您起草前两条的英文修订建议稿？',
        },
      },
    ],
    pain: [
      '静态 PDF 与演示文稿缺乏交互能力，客户每次调整需求范围均需人工重算报价并重发文件。',
      '通用型 CRM 与客户门户流程固化，而为特定业务定制独立系统的研发与维护成本过高。',
      '律师与咨询顾问处理的合同及客户资料高度敏感，不便上传至第三方纯云端服务。',
    ],
    how: [
      { title: '将静态方案升级为交互工具', body: '在方案正文中直接嵌入 AI 定制的报价测算器、对比表与验收单，提升专业交付体验。' },
      { title: '一客一页，数据严格隔离', body: '同一套插件模板可复用于多位客户，各自保留独立数据，分享链接仅包含当前页面内容。' },
      { title: '敏感底稿全程留存本地', body: '合同原文与内部复盘存放于本机空间，仅将整理好的对外交付页发送给客户。' },
    ],
    faq: [
      ['向客户分享交付页时，会暴露其他客户资料吗？', '不会。整页分享仅打包当前页面的正文、附件与插件，工作区内的其余资料完全隔离。'],
      ['不具备编程背景能否制作交互报价器？', '可以。清晰描述报价条目与计算规则后，由智能体生成插件并在页面内试运行即可。'],
    ],
  },
  {
    slug: 'ecommerce',
    index: '05',
    title: '电商、零售与消费品牌',
    summary: '将 SKU 选品毛利测算、竞品价格追踪与达人合作 Brief 整合在同一页面，帮助商品运营与品牌推广团队高效协同决策。',
    roleLabels: ['选品与商品运营', '达人媒介', '大促项目经理', '品牌主理人'],
    output: 'SKU 毛利测算页 · 达人合作 Brief · 大促统筹页',
    blocks: ['表格', 'HTML', 'Excalidraw 画板', '浏览器'],
    roles: [
      {
        id: 'merchandising',
        role: '选品与商品运营',
        pageTitle: '冬季新品 · SKU 选品评估与毛利测算页',
        summary: '将供应链成本、退货损耗、保本 ROI 测算与竞品差评拆解集中于一页，选品会议可直接调整参数完成定价决策。',
        deliverTo: '分享给管理层与采购团队：现场调整成本与售价假设即可查看净利率变化，减少公式维护误差。',
        blocks: ['表格', 'HTML', '浏览器'],
        customPlugins: [
          { name: 'SKU 毛利与盈亏平衡测算器', body: '输入采购价、平台扣点、运费与退货率，自动计算保本 ROI 与单件净利润。' },
          { name: '竞品卖点与差评拆解表', body: '汇总竞品高频负面评价，由智能体提炼新品的差异化切入点。' },
        ],
        demo: {
          title: '冬季新品 · SKU 选品评估与毛利测算页',
          badge: '电商与消费 / 选品运营',
          props: [
            ['商品类目', '居家保暖小家电'],
            ['建议零售价', '¥299'],
            ['目标净利率', '≥ 22%'],
          ],
          intro: '本期初筛三款样机，重点核算履约成本与退货损耗，确保在投放 ROI 不低于 2.5 时具备稳定盈利空间。',
          blocks: [
            {
              kind: 'metrics',
              plugin: 'SKU 毛利测算块',
              custom: true,
              title: '主推款 A（售价 ¥299）单件成本与利润拆解',
              items: [
                { label: '出厂与包材成本', value: '¥88', hint: '占售价 29.4%' },
                { label: '平台扣点与运费险', value: '¥36', hint: '含 8% 退货摊销' },
                { label: '毛利率 / 保本 ROI', value: '58.5% / 1.71', hint: '投放 ROI ≥ 2.5 净利 ¥55/单' },
              ],
            },
            {
              kind: 'table',
              plugin: '竞品对标表',
              title: '主流平台 Top 3 竞品价格与痛点对比',
              columns: ['竞品型号', '日常到手价', '月销预估', '高频痛点（切入机会）'],
              rows: [
                ['竞品甲', '¥269', '1.8w', '运行风噪偏大、初期有异味'],
                ['竞品乙', '¥349', '9,200', '机身偏大占用桌面空间'],
                ['我方主推款 A', '¥299', '新品测款', '32dB 静音 + 倾倒自动断电'],
              ],
            },
          ],
          aiPrompt: '已分析引用的 200 条竞品中差评：41% 提及“初次开机有异味”，建议详情页首屏展示材质检测报告并突出零异味卖点。',
        },
      },
      {
        id: 'influencer',
        role: '达人媒介 / 品牌推广',
        pageTitle: '双十二达人合作 · 一页式 Brief 与寄样确认',
        summary: '将产品核心卖点、必拍画面、合规禁用词与寄样档期确认单打包为单页链接，替代零散的文档与聊天说明。',
        deliverTo: '分享给合作达人或 MCN 机构：打开链接即可完整查阅拍摄规范并勾选确认档期。',
        blocks: ['HTML', 'Excalidraw 画板', '表格'],
        customPlugins: [
          { name: '拍摄要点与合规核对卡', body: '明确标注核心卖点与广告法红线词汇，降低成片返工率。' },
          { name: '寄样规格与档期确认单', body: '达人打开页面即可核对样品明细与发布排期。' },
        ],
        demo: {
          title: '双十二达人合作 · 一页式 Brief 与寄样确认',
          badge: '电商与消费 / 达人媒介',
          props: [
            ['合作达人', '@小鹿居家日记'],
            ['预计发布时间', '12 月 6 日 19:00'],
            ['推广商品', '主推款 A 礼盒装'],
          ],
          intro: '本页汇总了本次合作的全部拍摄重点与合规核对项。如对脚本节奏有调整建议，可直接在本页备注。',
          blocks: [
            {
              kind: 'checklist',
              plugin: '拍摄与合规核对单',
              custom: true,
              title: '交片前必核要点（点击可切换状态）',
              items: [
                { label: '前 5 秒展示实测分贝仪（32dB 静音对比）', meta: '核心卖点 1', done: true },
                { label: '口播清晰传达“双十二立减 50 + 赠滤网”机制', meta: '转化权益', done: true },
                { label: '规避“最省电 / 绝对安全”等广告法禁用表述', meta: '合规必查', done: false },
              ],
            },
          ],
          aiPrompt: '已结合该达人往期高赞内容风格生成 3 版开场脚本草案，确认后可附于页面下方供其参考。',
        },
      },
    ],
    pain: [
      '选品清单、成本公式、竞品分析与达人排期分散在大量表格与即时通讯群组中，大促期间极易出错。',
      '对外发送合作 Brief 多依赖长文档或分段聊天消息，合作方容易遗漏关键拍摄与合规要求。',
      '毛利测算与 ROI 模拟高度依赖复杂表格公式，多人协作时容易误改。',
    ],
    how: [
      { title: '成本测算与资料分析同页完成', body: '将毛利测算器、竞品对标表与卖点规划整合在一页，会议现场即可完成定价评估。' },
      { title: '标准化 Brief 一页触达合作方', body: '复用页面模板快速生成专属达人合作页，卖点、分镜与核对清单清晰呈现。' },
      { title: '智能体辅助洞察评论与撰稿', body: '直接引用竞品评论表，由 AI 提炼用户痛点并辅助生成详情页与口播脚本框架。' },
    ],
    faq: [
      ['外部达人打开合作页需要注册账号吗？', '不需要。整页分享后直接发送链接，对方在浏览器中即可查阅与核对。'],
      ['多个 SKU 页面如何进行横向汇总对比？', '工作区内的页面与表格天然互通，可建立总表按毛利率或阶段统一筛选全部选品页。'],
    ],
  },
  {
    slug: 'finance',
    index: '06',
    title: '金融、投资与行业研究',
    summary: '将研报资料、估值敏感性测算、竞品对比矩阵与投委决策留痕汇集在同一研究空间，数据支持本地存储，让研究结论持续沉淀并可随时追问。',
    roleLabels: ['行业研究员', '投资经理', '经营与财务分析'],
    output: '投研与尽调空间 · 估值测算页 · 季度经营复盘',
    blocks: ['浏览器', '表格', 'Excalidraw 画板', 'HTML'],
    roles: [
      {
        id: 'investor',
        role: '投资经理 / 行业研究员',
        pageTitle: 'AI 基础设施赛道 · 项目尽调与估值页',
        summary: '将项目概况、估值敏感性情景、竞品矩阵与尽调清单集中于一页，投委会讨论时可随时调整假设并核查原始出处。',
        deliverTo: '分享给投委会成员：在一页内完整审阅核心指标、估值区间与访谈依据，所有修订均可追溯。',
        blocks: ['表格', '浏览器', 'HTML', 'Excalidraw 画板'],
        customPlugins: [
          { name: '估值敏感性交互测算块', body: '快速切换增速与估值倍数假设，实时查看对应估值区间与回报倍数。' },
          { name: '尽调资料核验清单', body: '逐项跟踪客户访谈、财务核查与法务尽调进度，并关联原始证据。' },
        ],
        demo: {
          title: 'AI 基础设施赛道 · 项目尽调与估值页',
          badge: '金融与投研 / 投资经理',
          props: [
            ['标的项目', 'Project Nova（B 轮）'],
            ['项目负责人', '沈越'],
            ['当前状态', '预审通过 · 深度尽调中'],
          ],
          intro: '标的近 12 个月 ARR 增长 3.1 倍，NDR 达 128%。下方汇总核心经营指标与退出估值情景，原始访谈纪要已归档于同一空间。',
          blocks: [
            {
              kind: 'metrics',
              plugin: '核心经营指标卡',
              custom: true,
              title: '关键财务与客户留存指标',
              items: [
                { label: '当前 ARR', value: '$14.2M', hint: '同比增长 +210%' },
                { label: '净美元留存（NDR）', value: '128%', hint: '大客户增购显著' },
                { label: '毛利率 / 回收期', value: '79% / 11 月', hint: '优于行业中位数' },
              ],
            },
            {
              kind: 'table',
              plugin: '估值情景矩阵',
              custom: true,
              title: '2028 年退出估值敏感性分析（ARR × 倍数）',
              columns: ['情景假设', '2028E ARR', '退出倍数', '对应估值', '预期回报倍数'],
              rows: [
                ['保守情景', '$45M', '10x', '$450M', '2.5x'],
                ['基准情景', '$68M', '12x', '$816M', '4.5x'],
                ['乐观情景', '$95M', '15x', '$1.42B', '7.9x'],
              ],
            },
          ],
          aiPrompt: '已交叉核对本空间内 4 份客户访谈纪要：其中 3 家大客户提及“部署周期由 3 周缩短至 2 天”是核心复购原因，已标注对应出处。',
        },
      },
      {
        id: 'fpna',
        role: '财务 / 经营分析',
        pageTitle: 'Q4 经营复盘与下季度预算模拟页',
        summary: '将收入拆解、费用核对与新增投入模拟器整合在同一页面，管理层会议中可实时评估不同预算方案对现金跑道的影响。',
        deliverTo: '分享给管理层与部门负责人：替代冗长的静态汇报文档，在一页内清晰评估经营指标与预算选项。',
        blocks: ['表格', 'HTML', '页面目录'],
        customPlugins: [
          { name: '招聘与现金流跑道模拟器', body: '勾选不同招聘计划与投入项，实时计算月度净支出与现金跑道变化。' },
          { name: '预算偏差归因表', body: '自动标出超预算 10% 以上的科目并汇总业务部门说明。' },
        ],
        demo: {
          title: 'Q4 经营复盘与下季度预算模拟页',
          badge: '金融与投研 / 经营分析',
          props: [
            ['复盘周期', '2026 Q4'],
            ['当前现金跑道', '26 个月'],
            ['汇报对象', '管理层例会'],
          ],
          intro: '通过下方预算模拟器勾选下季度可选投入项，实时评估新增支出对现金跑道的影响。',
          blocks: [
            {
              kind: 'calculator',
              plugin: '季度新增投入模拟器',
              custom: true,
              title: '下季度新增预算选项（点击实时测算）',
              currency: '¥',
              unit: '/ 季度',
              items: [
                { id: 'rd', label: '新增 3 名核心研发工程师', price: 360000, note: '加速云端版上线', defaultOn: true },
                { id: 'gpu', label: '模型推理与测试算力扩容', price: 120000, note: '支撑 5x 日活增长', defaultOn: true },
                { id: 'mkt', label: '海外社区与开发者大会赞助', price: 180000, note: '可选增长投入', defaultOn: false },
              ],
            },
          ],
          aiPrompt: '当前所选新增投入为 ¥480,000/季度，现金跑道将由 26 个月调整为 23.5 个月，整体处于安全区间。',
        },
      },
    ],
    pain: [
      '研报、访谈纪要、财务模型与对比表分散在数十个标签页与文件夹中，检索与复盘成本高。',
      '投研与财务数据高度敏感，不便随意上传至第三方公有云 AI 服务。',
      '通过常规对话式 AI 整理的研究结论滞留在聊天记录中，难以在后续报告中持续复用。',
    ],
    how: [
      { title: '资料、模型与结论沉淀于同一空间', body: '网页研报、访谈笔记与对比矩阵集中管理，智能体直接引用原始资料作答，结论有据可查。' },
      { title: '本机空间保障数据边界', body: '敏感尽调与财务底稿存储于本地电脑并支持离线查阅，调用模型时仅发送当前选中的片段。' },
      { title: '维度与假设随时演进', body: '对比矩阵为真实结构化表格，新增评估维度或嵌入测算插件均无需推翻重构。' },
    ],
    faq: [
      ['尽调资料能否完全保留在本地？', '可以。选择本机空间后，页面、表格与 PDF 附件仅存储于本地电脑，不上传至官方服务器。'],
      ['如何确保智能体回答基于真实资料？', '可通过 @ 明确指定智能体仅读取选中的访谈纪要与表格，上下文范围精确可控。'],
    ],
  },
]

export const USE_CASE_CATEGORIES = USE_CASES

function BlockChips({ blocks }: { blocks: string[] }) {
  return (
    <ul className="site-block-chips" aria-label="常用插件">
      {blocks.map((name) => <li key={name}>{name}</li>)}
    </ul>
  )
}

/** 行业与场景总览页 */
export function MarketingUseCases({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  usePageMeta({
    title: '场景',
    description: '科技与互联网、教育培训、媒体营销、专业服务、电商消费、金融投研 —— 了解不同行业下的各个角色如何在 BIU 中组合内置插件与 AI 定制插件。',
    path: '/use-cases',
  })

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">行业与场景</p>
        <h1>面向不同行业与角色的定制化工作页</h1>
        <p className="site-page-lead">
          BIU 并非局限于单一岗位的固定模板。进入任意行业，即可查看不同角色如何组合内置插件与 AI 定制插件，并直接体验对应的仿真页面示例。
        </p>
      </section>

      <section className="site-usecase-grid" aria-label="场景">
        {USE_CASES.map((useCase) => (
          <Link key={useCase.slug} to={`/use-cases/${useCase.slug}`} className="site-usecase-card">
            <span className="site-solution-index">{useCase.index} · {useCase.roleLabels.join(' · ')}</span>
            <h2>{useCase.title}</h2>
            <p>{useCase.summary}</p>
            <div className="site-usecase-card-blocks">
              <BlockChips blocks={useCase.blocks} />
            </div>
          </Link>
        ))}
      </section>

      <section className="site-usecase-open" data-reveal>
        <div>
          <p className="site-section-label">覆盖更多行业</p>
          <h2>未列出您所在的行业或岗位？</h2>
          <p>
            BIU 的插件能力不受限于官方预设。无论是医疗健康、智能制造、人力资源还是个人研究，只需清晰描述您的业务流程，即可由 AI 定制专属的页面插件。
          </p>
        </div>
        <Link className="site-cta-secondary" to="/product#plugins">了解插件定制方式 →</Link>
      </section>

      <SiteFinalCta title="从您所在的行业与角色开始" />
    </SiteChrome>
  )
}

/** 行业场景详情页：角色切换 + 可交互仿真 BIU 页面 Demo + 插件清单 + 痛点与方案 */
export function MarketingUseCaseDetail({ onLogin, onStart }: { onLogin: SiteAction; onStart: SiteAction }) {
  const { slug } = useParams<{ slug: string }>()
  const useCase = USE_CASES.find((item) => item.slug === slug)
  const [activeRoleIdx, setActiveRoleIdx] = useState(0)

  useEffect(() => {
    setActiveRoleIdx(0)
  }, [slug])

  usePageMeta({
    title: useCase ? `${useCase.title} · 场景` : '场景',
    description: useCase ? useCase.summary : 'BIU 的行业与角色工作场景。',
    path: `/use-cases/${slug ?? ''}`,
  })

  if (!useCase) {
    return (
      <SiteChrome onLogin={onLogin} onStart={onStart}>
        <section className="site-page-hero">
          <p className="site-section-label">场景</p>
          <h1>未找到该场景</h1>
          <p className="site-page-lead"><Link to="/use-cases">返回场景总览</Link></p>
        </section>
      </SiteChrome>
    )
  }

  const activeRole = useCase.roles[activeRoleIdx] ?? useCase.roles[0]!
  const others = USE_CASES.filter((item) => item.slug !== useCase.slug)

  return (
    <SiteChrome onLogin={onLogin} onStart={onStart}>
      <section className="site-page-hero" data-reveal>
        <p className="site-section-label">行业场景 · {useCase.index}</p>
        <h1>{useCase.title}</h1>
        <p className="site-page-lead">{useCase.summary}</p>
        <p className="site-usecase-output">典型交付：{useCase.output}</p>
        <p className="site-usecase-note">适用角色：{useCase.roleLabels.join(' · ')}</p>
      </section>

      <section className="site-usecase-demo-section" aria-label="场景页面示例" data-reveal>
        <div className="site-usecase-demo-head">
          <p className="site-section-label">跨品类插件联动演示</p>
          <h2>多个原本独立的软件，在同一页共享数据并实时联动</h2>
        </div>

        <IndustryInteractiveDemo key={useCase.slug} slug={useCase.slug} locale="zh" />
      </section>

      <section className="site-usecase-blocks" data-reveal>
        <h2>该行业下不同角色的插件组合</h2>
        <div className="site-demo-tabs" role="tablist" aria-label="切换行业角色">
          {useCase.roles.map((role, index) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeRoleIdx === index}
              className={activeRoleIdx === index ? 'is-active' : ''}
              key={role.id}
              onClick={() => setActiveRoleIdx(index)}
            >
              {role.role}
            </button>
          ))}
        </div>
        <p className="site-usecase-role-lead">{activeRole.summary}</p>
        <p className="site-usecase-note">交付方式：{activeRole.deliverTo}</p>
        <BlockChips blocks={activeRole.blocks} />
        <h3 className="site-usecase-custom-heading">可由 AI 为「{activeRole.role}」按需定制的专属插件</h3>
        <div className="site-usecase-custom-grid">
          {activeRole.customPlugins.map((plugin) => (
            <article key={plugin.name}>
              <strong>{plugin.name}</strong>
              <p>{plugin.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-usecase-pain" data-reveal>
        <h2>传统工作方式的痛点</h2>
        <ul>
          {useCase.pain.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section className="site-usecase-how">
        <h2 data-reveal>BIU 的解决方式</h2>
        <div className="site-usecase-how-grid">
          {useCase.how.map((item) => (
            <article key={item.title} data-reveal>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <SiteFaq title="关于此行业场景" items={useCase.faq} />

      <section className="site-usecase-more" data-reveal>
        <h2>其他行业场景</h2>
        <div className="site-usecase-more-links">
          {others.map((item) => (
            <Link key={item.slug} to={`/use-cases/${item.slug}`}>{item.title} →</Link>
          ))}
        </div>
      </section>

      <SiteFinalCta title="构建属于您所在行业的工作页面" />
    </SiteChrome>
  )
}
