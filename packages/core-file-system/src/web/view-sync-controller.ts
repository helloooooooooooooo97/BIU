/**
 * Coordinates explicit user view selection against asynchronous router updates
 * (`routeViewId`) and background saved-view refreshes (`pullSavedViews`),
 * preventing A -> B -> A -> B active-view highlight flicker under the same collection.
 */
export class ViewSyncController {
  private pending: { path: string; id: string } | null = null

  /**
   * Records an explicit user view selection when navigation to `viewId` is
   * pending router confirmation.
   */
  markSelect(path: string, viewId: string, routeViewId: string | undefined, willNavigate: boolean): void {
    this.pending = willNavigate && routeViewId !== viewId ? { path, id: viewId } : null
  }

  /** Clears any pending selection (e.g. when switching collections). */
  clear(): void {
    this.pending = null
  }

  /**
   * Evaluates whether a layout-effect route adoption should be skipped because
   * `routeViewId` still reflects the previous view before router propagation.
   * Automatically clears the pending guard once `pathChanged` or `routeViewId`
   * catches up to the selected view.
   */
  shouldSkipRouteAdopt(path: string, routeViewId: string | undefined, pathChanged: boolean): boolean {
    if (pathChanged) {
      this.pending = null
      return false
    }
    if (!this.pending || this.pending.path !== path) return false
    if (routeViewId === this.pending.id) {
      this.pending = null
      return false
    }
    return true
  }

  /**
   * Resolves which view ID should remain active after an asynchronous saved-view
   * refresh completes, prioritizing explicit pending selection -> live active ID
   * -> live route view ID.
   */
  resolveSyncedViewId(
    path: string,
    activeViewId: string | null | undefined,
    routeViewId: string | undefined,
  ): string | undefined {
    const pendingId = this.pending?.path === path ? this.pending.id : null
    return pendingId ?? activeViewId ?? routeViewId ?? undefined
  }
}
