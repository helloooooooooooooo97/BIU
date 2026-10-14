import { renderToStaticMarkup } from 'react-dom/server'
import { BRAND_DEFAULT, BrandMark } from './brand-mark.tsx'

/** 标签页图标最小只有 16px：圆放到最大，线宽按 16px 保底，免得缩小后糊掉。 */
export function buildFaviconSvg() {
  const markup = renderToStaticMarkup(
    <BrandMark
      colors={[BRAND_DEFAULT.c0, BRAND_DEFAULT.c1, BRAND_DEFAULT.c2]}
      stroke={BRAND_DEFAULT.stroke}
      strokeWidth={BRAND_DEFAULT.strokeWidth}
      lineWidth={BRAND_DEFAULT.lineWidth}
      background={BRAND_DEFAULT.background}
      showBackground
      circleRatio={1}
      displayWidth={16}
      title="BIU"
    />,
  )
  return `${markup.replace(/ role="img" aria-label="BIU"/, '')}\n`
}
