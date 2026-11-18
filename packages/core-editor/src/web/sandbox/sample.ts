export const SANDBOX_SAMPLE = `export default function App() {
  const T = 'var(--biu-color-text)'
  const M = 'var(--biu-color-text-muted)'
  const S = 'var(--biu-stroke-width)'
  const bg = 'var(--biu-color-bg)'
  const sv = 'var(--biu-color-surface, var(--biu-color-bg))'

  const mix = (c, p) => \`color-mix(in srgb, \${c} \${p}%, transparent)\`
  const line = mix(T, 10)
  const wash = (c, p) => \`color-mix(in srgb, \${c} \${p}%, var(--biu-color-bg))\`


  const C = {
    blue: 'var(--biu-color-ink-blue)',
    purple: 'var(--biu-color-ink-purple)',
    green: 'var(--biu-color-ink-green)',
    orange: 'var(--biu-color-ink-orange)',
    red: 'var(--biu-color-ink-red)',
    pink: 'var(--biu-color-ink-pink)',
    gold: 'var(--biu-color-ink-gold)',
    gray: 'var(--biu-color-ink-gray)',
  }

  const Card = ({ label, accent, children }) => (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
      background: sv, border: \`\${S} solid \${line}\`, borderRadius: 'var(--biu-radius-lg, 18px)',
    }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '15px 15px 9px' }}>
        {children}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '8px 12px 11px', borderTop: \`\${S} solid \${mix(T, 6)}\`,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent || mix(T, 25), flex: 'none' }} />
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em', color: T }}>{label}</span>
      </div>
    </div>
  )

  const Chip = ({ color, children }) => (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, width: 'fit-content',
      fontSize: 10.5, fontWeight: 600,
      color, background: wash(color, 10),
      borderRadius: 999, padding: '3.5px 10px', whiteSpace: 'nowrap',
    }}>{children}</span>
  )

  const row = { display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, color: T }
  const dot = (c, s) => ({ width: s, height: s, borderRadius: '50%', background: c, flex: 'none' })

  // heroicon 全部来自宿主注入的 ui.icons（@heroicons/react/16/solid），无需 import
  const {
    MagnifyingGlassIcon, FunnelIcon, ArrowsUpDownIcon, ArrowPathIcon,
    DocumentTextIcon, Bars3Icon, TableCellsIcon, Squares2X2Icon,
    CheckIcon, ArrowTrendingUpIcon, ClockIcon, ChevronRightIcon,
    DocumentDuplicateIcon, CubeIcon,
    LockClosedIcon, UserGroupIcon, LinkIcon, TagIcon, CloudIcon,
    FolderIcon, FolderOpenIcon, DocumentIcon, ChartBarIcon, CircleStackIcon,
    ShieldCheckIcon, PlusIcon, PuzzlePieceIcon,
    PencilSquareIcon, EllipsisHorizontalIcon,
  } = ui.icons

  // 统一尺寸的图标封装，颜色跟随 currentColor
  const Ico = ({ as: C, size = 12, style }) => (
    <C width={size} height={size} style={{ flex: 'none', display: 'block', ...style }} />
  )

  return (
    <div style={{
      boxSizing: 'border-box', width: '100%', minHeight: '100%', margin: 0,
      padding: '28px 32px', background: bg, color: T,
      font: 'inherit',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', system-ui, sans-serif",
      WebkitFontSmoothing: 'antialiased',
      // 画布铺满，内容整体垂直+水平居中（放大放映时也居中）
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 1240, display: 'grid', gap: 12, alignContent: 'center' }}>

        {/* 上排 · 3 卡 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>

          <Card label="AI 代理协作" accent={C.blue}>
            <div style={{ display: 'grid', gap: 7 }}>
              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                <span style={{ width: 15, height: 15, borderRadius: '50%', background: \`linear-gradient(150deg, \${C.blue}, \${C.purple})\`, flex: 'none' }} />
                <span style={{ flex: 1, height: 7, borderRadius: 999, background: mix(T, 9) }} />
              </div>
              <div style={{ display: 'flex', paddingLeft: 22 }}>
                <span style={{ flex: 1, height: 7, borderRadius: 999, background: wash(C.blue, 18) }} />
              </div>
              <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                <span style={{ width: 15, height: 15, borderRadius: '50%', background: \`linear-gradient(150deg, \${C.orange}, \${C.pink})\`, flex: 'none' }} />
                <span style={{ flex: .85, height: 7, borderRadius: 999, background: mix(T, 9) }} />
              </div>
            </div>
          </Card>

          <Card label="魔法光标 · 点哪管哪" accent={C.orange}>
            <div style={{
              position: 'relative', display: 'grid', gridTemplateColumns: '24px 1fr', gap: 5,
              flex: 1, minHeight: 0,
            }}>
              {/* 侧栏 */}
              <div style={{
                display: 'grid', gap: 3, alignContent: 'start', padding: '2px 4px 0 0',
                borderRight: \`1px solid \${mix(T, 8)}\`,
              }}>
                {[0, 1, 2, 3].map(k => (
                  <div key={k} style={{
                    height: 3.5, borderRadius: 2,
                    background: k === 0 ? wash(C.blue, 45) : mix(T, 11),
                    width: k === 0 ? '100%' : '78%',
                  }} />
                ))}
              </div>

              <div style={{ display: 'grid', gap: 4, alignContent: 'center' }}>
                {/* 内容标题 */}
                <div style={{ height: 4, borderRadius: 2, background: mix(T, 18), width: '46%' }} />

                {/* 被引用的卡片 */}
                <div style={{
                  display: 'grid', gap: 3, padding: '5px 5px', borderRadius: 5,
                  background: wash(C.orange, 11),
                  boxShadow: \`inset 0 0 0 1.5px \${wash(C.orange, 55)}\`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 6.5, fontWeight: 700, color: C.orange }}>需求文档</span>
                    <span style={{
                      marginLeft: 'auto', fontSize: 5.5, fontWeight: 700, color: C.orange,
                      background: wash(C.orange, 22), borderRadius: 3, padding: '0.5px 3px',
                    }}>已引用</span>
                  </div>
                  <div style={{ height: 2, borderRadius: 1, background: wash(C.orange, 28), width: '86%' }} />
                </div>

                {/* 简易对话框 */}
                <div style={{
                  display: 'grid', gap: 3.5, padding: '5px 5px', borderRadius: 5,
                  border: \`1px solid \${wash(C.blue, 35)}\`, background: wash(C.blue, 7),
                }}>
                  {/* 气泡：agent 说的话 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flex: 'none',
                      background: \`linear-gradient(150deg, \${C.blue}, \${C.purple})\`,
                    }} />
                    <span style={{ fontSize: 5.5, color: T, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      已选中，要我改什么？
                    </span>
                  </div>
                  {/* 输入框 */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 3, height: 11,
                    borderRadius: 3, background: mix(T, 5), padding: '0 4px',
                    border: \`1px solid \${mix(T, 10)}\`,
                  }}>
                    <span style={{
                      width: 0.8, height: 5, background: C.blue, borderRadius: 0.5,
                    }} />
                    <span style={{ fontSize: 5, color: M }}>输入指令</span>
                    <span style={{
                      marginLeft: 'auto', fontSize: 5, fontWeight: 700, color: 'var(--biu-color-bg)',
                      background: C.blue, borderRadius: 2, padding: '1px 3px',
                    }}>↵</span>
                  </div>
                </div>
              </div>

              {/* 魔法光标 + Agent 徽标，压在引用卡与对话框之间 */}
              <div style={{
                position: 'absolute', right: 1, top: 30,
                display: 'flex', alignItems: 'flex-start', gap: 2,
              }}>
                <svg width="9" height="9" viewBox="0 0 16 16" fill="none" style={{ filter: \`drop-shadow(0 1px 2px \${mix(T, 35)})\` }}>
                  <path d="M2 1.5 L2 13 L5.3 10.2 L7.6 14.5 L9.9 13.3 L7.7 9.2 L12.2 9 L2 1.5 Z"
                    fill={C.blue} stroke="var(--biu-color-bg)" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </Card>

          <Card label="多 Agent 协同任务看板" accent={C.green}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, alignItems: 'start' }}>
              {[
                ['待办', C.gray, [['竞品调研', 'A', C.blue, null], ['写接口文档', 'B', C.purple, null]]],
                ['进行中', C.blue, [['重构编辑器', 'A', C.blue, 65], ['跑回归测试', 'C', C.orange, 30]]],
                ['完成', C.green, [['整理需求', 'B', C.purple, 100], ['搭建站点', 'A', C.blue, 100], ['查资料', 'C', C.orange, 100]]],
              ].map(([col, c, tasks]) => (
                <div key={col} style={{ display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 2px' }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: c }} />
                    <span style={{ fontSize: 8.5, color: c, fontWeight: 700, letterSpacing: '0.02em' }}>{col}</span>
                    <span style={{ fontSize: 7.5, color: M, marginLeft: 'auto' }}>{tasks.length}</span>
                  </div>
                  {tasks.map(([name, who, wc, pct]) => (
                    <div key={name} style={{
                      display: 'grid', gap: 3, borderRadius: 6, padding: '4px 5px',
                      background: wash(c, 7), border: \`1px solid \${wash(c, 22)}\`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span style={{
                          width: 11, height: 11, borderRadius: '50%', flex: 'none',
                          background: wash(wc, 18), color: wc,
                          fontSize: 6.5, fontWeight: 700, display: 'grid', placeItems: 'center',
                        }}>{who}</span>
                        <span style={{ fontSize: 7.5, color: T, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                      </div>
                      {pct !== null && (
                        <div style={{ height: 2.5, borderRadius: 2, background: mix(T, 10), position: 'relative' }}>
                          <span style={{ position: 'absolute', inset: 0, width: \`\${pct}%\`, borderRadius: 2, background: wc }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* 中排：左栏 2 卡 + 中心 + 右栏 2 卡 */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 320px', gap: 12 }}>

          <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 12 }}>
            <Card label="Block 导航栏 · 每个 block 自带操作条" accent={C.purple}>
              <div style={{ display: 'grid', gap: 4, flex: 1, minHeight: 0, alignContent: 'center' }}>

                {/* 同一套导航栏，挂在不同类型的 block 上 */}
                {[
                  [DocumentTextIcon, '文档', C.blue],
                  [ChartBarIcon, '视图', C.green],
                ].map(([G, t, c]) => (
                  <div key={t} style={{
                    display: 'grid', gap: 3, padding: '3px 4px 4px', borderRadius: 6,
                    background: mix(T, 3), border: \`1px solid \${mix(T, 10)}\`,
                  }}>
                    {/* ── 导航栏：图标 · 名称 · 操作 ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Ico as={G} size={7} style={{ color: c }} />
                      <span style={{ fontSize: 6.5, fontWeight: 700, color: T }}>{t}</span>
                      <span style={{ flex: 1 }} />
                      {[PencilSquareIcon, ArrowsUpDownIcon, EllipsisHorizontalIcon].map((A, k) => (
                        <Ico key={k} as={A} size={6} style={{ color: M }} />
                      ))}
                    </div>
                    {/* ── block 内容 ── */}
                    <div style={{ display: 'grid', gap: 2 }}>
                      <span style={{ height: 2, borderRadius: 1, width: '82%', background: wash(c, 30) }} />
                      <span style={{ height: 2, borderRadius: 1, width: '58%', background: mix(T, 12) }} />
                    </div>
                  </div>
                ))}

                {/* 导航栏统一：插件 block 完全同一套皮 */}
                <div style={{
                  display: 'grid', gap: 3, padding: '3px 4px 4px', borderRadius: 6,
                  background: wash(C.purple, 7), border: \`1px dashed \${wash(C.purple, 46)}\`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Ico as={PuzzlePieceIcon} size={7} style={{ color: C.purple }} />
                    <span style={{ fontSize: 6.5, fontWeight: 700, color: C.purple }}>插件 block</span>
                    <span style={{ flex: 1 }} />
                    <Ico as={PencilSquareIcon} size={6} style={{ color: wash(C.purple, 60) }} />
                    <Ico as={ArrowsUpDownIcon} size={6} style={{ color: wash(C.purple, 60) }} />
                    <Ico as={EllipsisHorizontalIcon} size={6} style={{ color: wash(C.purple, 60) }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <span style={{ fontSize: 6, color: M }}>同一套导航栏，装上就是原生的</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: 6.5, color: M }}>文档 / 视图 / 插件 共用一条导航栏</span>
                  <span style={{ flex: 1 }} />
                  <span style={{
                    fontSize: 6, fontWeight: 700, color: 'var(--biu-color-bg)',
                    background: C.purple, borderRadius: 3, padding: '1px 4px',
                  }}>NEW</span>
                </div>
              </div>
            </Card>
            <Card label="页面内混合 block" accent={C.green}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 8, color: M, letterSpacing: '0.01em' }}>结构化与非结构化并存</div>
                {/* 非结构化：长文 */}
                <div style={{
                  display: 'grid', gap: 2, borderRadius: 6, padding: '4px 6px',
                  border: \`1px solid \${wash(C.gray, 24)}\`, background: wash(C.gray, 5),
                }}>
                  <span style={{ fontSize: 7.5, color: M, fontWeight: 600, letterSpacing: '0.02em' }}>长文</span>
                  <div style={{ height: 2.5, borderRadius: 2, background: mix(T, 13) }} />
                  <div style={{ height: 2.5, borderRadius: 2, background: mix(T, 13), width: '72%' }} />
                </div>
                {/* 结构化：字段 / 表格 */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4, borderRadius: 6, padding: '4px 6px',
                  border: \`1px solid \${wash(C.green, 30)}\`, background: wash(C.green, 6), fontSize: 8,
                }}>
                  <span style={{ color: C.green, fontWeight: 700, flex: '0 0 auto' }}>电影</span>
                  <span style={{ color: T, fontWeight: 600 }}>爱乐之城</span>
                  <span style={{ color: M, marginLeft: 'auto', fontSize: 7.5 }}>2016</span>
                </div>
                {/* 结构化：图表 */}
                <div style={{
                  display: 'flex', alignItems: 'flex-end', gap: 2, height: 18,
                  borderRadius: 6, padding: '3px 6px', border: \`1px solid \${wash(C.blue, 26)}\`, background: wash(C.blue, 5),
                }}>
                  {[40, 70, 55, 90, 65, 75].map((h, i) => (
                    <span key={i} style={{ flex: 1, height: \`\${h}%\`, borderRadius: 1.5, background: wash(C.blue, 55) }} />
                  ))}
                </div>
                {/* 视频编辑器块 */}
                <div style={{
                  display: 'grid', gap: 3, borderRadius: 6, padding: '4px 6px',
                  border: \`1px solid \${wash(C.pink, 28)}\`, background: wash(C.pink, 5),
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 7.5, color: C.pink, fontWeight: 600, letterSpacing: '0.02em' }}>视频编辑</span>
                    <span style={{ flex: 1, height: 2.5, borderRadius: 2, background: wash(C.pink, 40) }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 12 }}>
                    <span style={{ fontSize: 7.5, color: C.pink, flex: '0 0 auto' }}>▶</span>
                    <div style={{ height: 7, flex: '0 0 22%', borderRadius: 2, background: wash(C.pink, 45) }} />
                    <div style={{ height: 7, flex: '0 0 34%', borderRadius: 2, background: wash(C.pink, 30) }} />
                    <div style={{ height: 7, flex: '0 0 18%', borderRadius: 2, background: wash(C.pink, 45) }} />
                    <div style={{ flex: 1, height: 1, background: wash(C.pink, 30) }} />
                  </div>
                </div>
                {/* 沙箱块 */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4, borderRadius: 6, padding: '4px 6px',
                  border: \`1px dashed \${wash(C.purple, 45)}\`, background: wash(C.purple, 5), fontSize: 8,
                }}>
                  <Ico as={CubeIcon} size={9} style={{ color: C.purple }} />
                  <span style={{ color: C.purple, fontWeight: 600 }}>沙箱</span>
                  <span style={{ flex: 1 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 6px)', gap: 1.5 }}>
                    {[0, 1, 2, 3, 4, 5].map(k => (
                      <span key={k} style={{ width: 6, height: 6, borderRadius: 1.5, background: wash(C.purple, k % 2 ? 20 : 38) }} />
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* 中心：固定墨黑块 */}
          <div style={{
            position: 'relative', overflow: 'hidden',
            borderRadius: 'var(--biu-radius-lg, 18px)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            minHeight: 424,
            background: '#111111', color: '#ffffff',
            border: \`\${S} solid \${mix(T, 12)}\`,
            boxShadow: \`0 1px 0 \${mix('#ffffff', 6)} inset\`,
          }}>
            {/* 光晕 */}
            <div style={{
              position: 'absolute', left: '-16%', bottom: '-42%', width: '132%', height: '78%',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 40% 26%, rgba(255,255,255,.10), transparent 72%)',
            }} />
            {/* 极细网格，和卡片底色呼应 */}
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }} />

            <div style={{
              position: 'relative', fontSize: 'clamp(52px, 6vw, 76px)', fontWeight: 700,
              letterSpacing: '-0.045em', lineHeight: 1,
            }}>BIU</div>

            <div style={{
              position: 'relative', marginTop: 12,
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '5px 12px 5px 8px',
              borderRadius: 999,
              background: 'rgba(255,255,255,.07)',
              border: '1px solid rgba(255,255,255,.12)',
            }}>
              <Ico as={TagIcon} size={15} style={{ color: 'rgba(255,255,255,.9)' }} />
              <span style={{
                fontSize: 14, fontWeight: 600, letterSpacing: '0.02em',
                lineHeight: 1, fontVariantNumeric: 'tabular-nums',
              }}>v0.1.3</span>
            </div>

            <div style={{
              position: 'relative', marginTop: 16,
              fontSize: 'clamp(13px, 1.2vw, 16px)', opacity: .72,
              textAlign: 'center', lineHeight: 1.7,
            }}>一个页面<br />装下所有形态</div>

            {/* 底部：形态小图标，呼应四周卡片 */}
            <div style={{
              position: 'relative', marginTop: 28, display: 'flex', alignItems: 'center', gap: 10,
              opacity: .7,
            }}>
              {[DocumentTextIcon, TableCellsIcon, Squares2X2Icon, CubeIcon].map((G, k) => (
                <span key={k} style={{
                  width: 34, height: 34, borderRadius: 9,
                  display: 'grid', placeItems: 'center',
                  background: 'rgba(255,255,255,.09)',
                  border: '1px solid rgba(255,255,255,.10)',
                }}><Ico as={G} size={18} /></span>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 12 }}>
            <Card label="页面内视图模式" accent={C.blue}>
              <div style={{ display: 'grid', gap: 4, gridTemplateRows: 'auto 1fr', flex: 1, minHeight: 0 }}>

                {/* 视图切换条 */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 2, padding: '2px 3px',
                  borderRadius: 5, background: mix(T, 5), border: \`1px solid \${mix(T, 9)}\`,
                }}>
                  {[['文档', C.green], ['大纲', C.orange], ['表格', C.blue], ['沙盒', C.purple]].map(([k, c]) => (
                    <span key={k} style={{
                      flex: 1, textAlign: 'center', fontSize: 5.5, fontWeight: 700,
                      padding: '1.5px 0', borderRadius: 3,
                      color: k === '大纲' ? c : M,
                      background: k === '大纲' ? wash(c, 16) : 'transparent',
                    }}>{k}</span>
                  ))}
                </div>

                {/* 四格：每种视图的缩略长相 */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3,
                  gridTemplateRows: '1fr 1fr', flex: 1, minHeight: 0,
                }}>
                  {/* 文档 */}
                  <div style={{
                    display: 'grid', gap: 2, padding: '3px 4px', borderRadius: 4,
                    border: \`1px solid \${wash(C.green, 26)}\`, background: wash(C.green, 5),
                    alignContent: 'start',
                  }}>
                    <span style={{ fontSize: 5, fontWeight: 700, color: C.green }}>文档</span>
                    <div style={{ height: 2.5, borderRadius: 1, background: mix(T, 16), width: '78%', marginTop: 1 }} />
                    {[95, 88, 92, 70, 84, 60].map((w, k) => (
                      <div key={k} style={{ height: 2, borderRadius: 1, background: mix(T, 11), width: \`\${w}%\` }} />
                    ))}
                  </div>

                  {/* 大纲 —— 当前选中，高亮 */}
                  <div style={{
                    display: 'grid', gap: 2, padding: '3px 4px', borderRadius: 4,
                    background: wash(C.orange, 11), boxShadow: \`inset 0 0 0 1.2px \${wash(C.orange, 50)}\`,
                    alignContent: 'start',
                  }}>
                    <span style={{ fontSize: 5, fontWeight: 700, color: C.orange }}>大纲</span>
                    {[0, 1, 1, 2, 1, 2].map((ind, k) => (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 2, paddingLeft: ind * 4 }}>
                        <span style={{ width: 1.5, height: 1.5, borderRadius: '50%', background: wash(C.orange, 60) }} />
                        <span style={{ height: 2, borderRadius: 1, background: wash(C.orange, 30), width: k === 0 ? '52%' : '62%' }} />
                      </div>
                    ))}
                  </div>

                  {/* 表格 */}
                  <div style={{
                    display: 'grid', gap: 1.5, padding: '3px 4px', borderRadius: 4,
                    border: \`1px solid \${wash(C.blue, 26)}\`, background: wash(C.blue, 5),
                    alignContent: 'start',
                  }}>
                    <span style={{ fontSize: 5, fontWeight: 700, color: C.blue }}>表格</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, marginTop: 1 }}>
                      {Array.from({ length: 15 }).map((_, k) => (
                        <span key={k} style={{
                          height: 3, borderRadius: 0.5,
                          background: k < 3 ? wash(C.blue, 22) : mix(T, 9),
                        }} />
                      ))}
                    </div>
                  </div>

                  {/* 沙盒 */}
                  <div style={{
                    position: 'relative', padding: '3px 4px', borderRadius: 4,
                    border: \`1px dashed \${wash(C.purple, 40)}\`, background: wash(C.purple, 5),
                    overflow: 'hidden',
                  }}>
                    <span style={{ fontSize: 5, fontWeight: 700, color: C.purple }}>沙盒</span>
                    <div style={{ position: 'absolute', left: 14, top: 9, width: 14, height: 8, borderRadius: 1.5, background: wash(C.purple, 28) }} />
                    <div style={{ position: 'absolute', right: 5, top: 12, width: 9, height: 6, borderRadius: 1.5, background: wash(C.blue, 22) }} />
                    <div style={{ position: 'absolute', right: 8, bottom: 4, width: 12, height: 4, borderRadius: 1.5, background: wash(C.pink, 22) }} />
                  </div>
                </div>
              </div>
            </Card>
            <Card label="沙盒 · 自由布局" accent={C.purple}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, flex: 1, minHeight: 96 }}>

                {/* 左：渲染出来的网页 */}
                <div style={{
                  position: 'relative', borderRadius: 6, overflow: 'hidden',
                  border: \`1px solid \${wash(C.purple, 24)}\`, background: mix(T, 3),
                  display: 'flex', flexDirection: 'column',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 2, padding: '3px 4px',
                    borderBottom: \`1px solid \${mix(T, 8)}\`, background: mix(T, 5),
                  }}>
                    <span style={{ width: 3, height: 3, borderRadius: '50%', background: wash(C.orange, 55) }} />
                    <span style={{ width: 3, height: 3, borderRadius: '50%', background: wash(C.gold, 55) }} />
                    <span style={{ width: 3, height: 3, borderRadius: '50%', background: wash(C.green, 55) }} />
                  </div>

                  <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                    {/* 标题 + 副标 */}
                    <div style={{ position: 'absolute', left: 4, top: 5, fontSize: 7, fontWeight: 700, color: T, letterSpacing: '-0.01em' }}>标题</div>
                    <div style={{ position: 'absolute', left: 4, top: 16, width: '46%', height: 2, borderRadius: 1, background: mix(T, 16) }} />
                    {/* 按钮 */}
                    <div style={{
                      position: 'absolute', left: 4, top: 24, padding: '2px 5px', borderRadius: 3,
                      background: C.blue, color: 'var(--biu-color-bg)', fontSize: 5.5, fontWeight: 700,
                    }}>按钮</div>
                    {/* 图表 —— 右上，被按钮和标题夹住 */}
                    <div style={{
                      position: 'absolute', right: 4, top: 5, width: 28, height: 21,
                      borderRadius: 3, border: \`1px solid \${wash(C.purple, 40)}\`, background: wash(C.purple, 10),
                      display: 'flex', alignItems: 'flex-end', gap: 1.5, padding: '2px 3px',
                    }}>
                      {[50, 80, 60, 95].map((h, k) => (
                        <span key={k} style={{ flex: 1, height: \`\${h}%\`, borderRadius: 0.5, background: wash(C.purple, 55) }} />
                      ))}
                    </div>
                    {/* 卡片组 —— 中部两个小方块 */}
                    <div style={{ position: 'absolute', left: 4, right: 4, top: 38, display: 'flex', gap: 3 }}>
                      <div style={{ flex: 1, height: 14, borderRadius: 3, background: wash(C.orange, 14), border: \`1px solid \${wash(C.orange, 30)}\` }} />
                      <div style={{ flex: 1, height: 14, borderRadius: 3, background: wash(C.pink, 14), border: \`1px solid \${wash(C.pink, 30)}\` }} />
                      <div style={{ flex: 1, height: 14, borderRadius: 3, background: wash(C.gold, 14), border: \`1px solid \${wash(C.gold, 30)}\` }} />
                    </div>
                    {/* 图片/色带占位 */}
                    <div style={{
                      position: 'absolute', left: 4, top: 56, width: 34, height: 12, borderRadius: 3,
                      background: \`linear-gradient(100deg, \${wash(C.purple, 30)}, \${wash(C.blue, 18)})\`,
                    }} />
                    {/* 小标签 —— 压在色带上 */}
                    <div style={{
                      position: 'absolute', left: 30, top: 52, padding: '1.5px 4px', borderRadius: 3,
                      background: C.green, color: 'var(--biu-color-bg)', fontSize: 5.5, fontWeight: 700,
                      transform: 'rotate(-5deg)',
                    }}>自由</div>
                    {/* 底部横条 */}
                    <div style={{
                      position: 'absolute', left: 4, bottom: 4, right: 4, height: 11,
                      borderRadius: 3, background: wash(C.green, 14),
                      display: 'flex', alignItems: 'center', padding: '0 3px',
                    }}>
                      <span style={{ fontSize: 5.5, color: C.green, fontWeight: 700 }}>任意排布</span>
                    </div>
                  </div>
                </div>

                {/* 右：代码面板（色条示意，不写具体代码） */}
                <div style={{
                  borderRadius: 6, overflow: 'hidden',
                  border: \`1px solid \${mix(T, 12)}\`, background: mix(T, 4),
                  display: 'flex', flexDirection: 'column',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 2, padding: '3px 4px',
                    borderBottom: \`1px solid \${mix(T, 8)}\`,
                  }}>
                    <span style={{ fontSize: 6.5, color: M, fontWeight: 600 }}>App.jsx</span>
                    <span style={{ fontSize: 6, color: C.green, marginLeft: 'auto' }}>●</span>
                  </div>
                  <div style={{ padding: '5px 4px', display: 'grid', gap: 3, alignContent: 'start' }}>
                    {[
                      [0, 62, C.gray], [1, 40, C.blue], [2, 34, C.orange],
                      [1, 46, C.purple], [2, 30, C.orange], [2, 38, C.orange],
                      [1, 52, C.green], [0, 28, C.gray],
                      [0, 68, C.gray], [1, 44, C.blue], [2, 36, C.orange],
                      [1, 50, C.pink], [0, 34, C.gray],
                    ].map(([ind, w, c], k) => (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 2, paddingLeft: ind * 4 }}>
                        <span style={{
                          height: 2.5, borderRadius: 1.5, width: \`\${w}%\`,
                          background: wash(c, 55),
                        }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* 下排 · 3 卡 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>

          <Card label="私人空间 / 云端空间" accent={C.gray}>
            <div style={{ display: 'grid', gap: 6, justifyItems: 'start' }}>
              <Chip color={C.gray}><Ico as={LockClosedIcon} size={10} />私人空间</Chip>
              <Chip color={C.blue}><Ico as={CloudIcon} size={10} />云端空间</Chip>
            </div>
          </Card>

          <Card label="标签 · 多属性" accent={C.purple}>
            <div style={{ display: 'grid', gap: 5, alignContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Chip color={C.purple}><Ico as={TagIcon} size={9} />影片</Chip>
              </div>
              <div style={{ display: 'grid', gap: 3 }}>
                {[['导演', '查泽雷'], ['年份', '2016'], ['评分', '8.4']].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 7.5 }}>
                    <span style={{ color: M, minWidth: 22 }}>{k}</span>
                    <span style={{ color: T, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 7, color: M }}>同一标签，多个属性</div>
            </div>
          </Card>


          <Card label="Page all-in-one" accent={C.blue}>
            <div style={{ display: 'grid', gap: 6, alignContent: 'center' }}>
              {/* 同一份内容，被反复复用成不同形态 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
                {[[DocumentTextIcon, C.blue], [Squares2X2Icon, C.green], [TableCellsIcon, C.purple]].map(([G, c], k) => (
                  <div key={k} style={{
                    display: 'grid', gap: 3, padding: '4px 3px', borderRadius: 5,
                    background: wash(c, 7), border: \`1px solid \${wash(c, 26)}\`,
                    justifyItems: 'center',
                  }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: 4, display: 'grid', placeItems: 'center',
                      background: wash(c, 18),
                    }}>
                      <Ico as={G} size={8} style={{ color: c }} />
                    </span>
                    <span style={{ height: 2, width: '80%', borderRadius: 1, background: wash(c, 32) }} />
                    <span style={{ height: 2, width: '54%', borderRadius: 1, background: mix(T, 11) }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Ico as={ArrowPathIcon} size={7} style={{ color: C.blue }} />
                <span style={{ fontSize: 7.5, color: M }}>同一份内容，复用成三种形态</span>
                <span style={{ flex: 1 }} />
                <span style={{
                  fontSize: 6, fontWeight: 700, color: C.blue,
                  background: wash(C.blue, 14), borderRadius: 3, padding: '1px 4px',
                }}>×3</span>
              </div>
            </div>
          </Card>

        </div>

      </div>

      </div>
  )
}
`
