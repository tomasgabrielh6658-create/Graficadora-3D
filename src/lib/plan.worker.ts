import { computePlan, serializePlan, type PlanReq } from './planners'

self.onmessage = (e: MessageEvent<{ id: number; req: PlanReq }>) => {
  const { id, req } = e.data
  try {
    postMessage({ id, res: serializePlan(computePlan(req)) })
  } catch (err) {
    postMessage({ id, error: (err as Error).message })
  }
}
