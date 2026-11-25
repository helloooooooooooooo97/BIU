import type { IncomingMessage, ServerResponse } from 'node:http'

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * Declares how a route behaves when the desktop host is viewing a linked cloud workspace:
 * - 'workspace': automatically reverse-proxied to the remote cloud host
 * - 'host': always handled by the local host process (e.g. cloud login, device prefs, update)
 * - 'public': unauthenticated / share-link route
 */
export type RouteScope = 'workspace' | 'host' | 'public'

export interface RouteOptions {
  scope?: RouteScope
}

export interface RouteContext {
  req: IncomingMessage
  res: ServerResponse
  params: Record<string, string>
  query: URLSearchParams
  json<T = unknown>(): Promise<T>
  bytes(): Promise<Buffer>
  send(status: number, body: unknown): void
}

export type RouteHandler = (ctx: RouteContext) => void | Promise<void>

export interface PageSpec {
  id: string
  title: string
  subtitle: string
  plugin: string
  kind: string
}

export const HUB_CHANGE = 'hub/change' as const
export const HUB_CHANNEL_SNAPSHOT = 'snapshot' as const
export const HUB_CHANNEL_EVENT = 'event' as const
