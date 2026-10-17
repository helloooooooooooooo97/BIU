/** Vite serve uses jsxDEV; map it to production jsx so first paint is not the dev runtime. */
export { Fragment, jsx, jsxs } from 'react/jsx-runtime'
export { jsx as jsxDEV, jsxs as jsxsDEV } from 'react/jsx-runtime'
