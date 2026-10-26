import type { Context } from 'cordis'
import { pluginsCollection } from './collection.ts'
import { openStore } from './store.ts'

export const name = 'core-plugin-system'
export const inject = ['http', 'hub']

export {
  PluginStoreService,
  defaultPluginDir,
  defaultStatePath,
} from './store.ts'
export { pluginsCollection } from './collection.ts'
export { WORKBENCH_STAGES, parseWorkbench } from '../workbench.ts'

export async function apply(ctx: Context) {
  const store = await openStore(ctx)
  ctx.inject(['database'], (inner) => {
    inner.database.register(pluginsCollection(store))
  })
}
