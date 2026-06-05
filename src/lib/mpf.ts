type ResourceKey = 'bmat' | 'rmat' | 'emat' | 'hemat'

type MpfItem = {
  itemCategory?: string
  cost?: Partial<Record<ResourceKey, number>>
}

const RESOURCE_KEYS: ResourceKey[] = ['bmat', 'rmat', 'emat', 'hemat']

export function calculateMpfCosts(items: MpfItem[], orders: Record<number, number>) {
  const perCategoryUnits: Record<string, MpfItem[]> = {}
  const perCategoryCounts: Record<string, number> = {}

  for (const [rawIndex, quantity] of Object.entries(orders)) {
    const item = items[Number(rawIndex)]
    if (!item) continue

    const category = item.itemCategory || 'misc'
    perCategoryUnits[category] = perCategoryUnits[category] || []
    perCategoryCounts[category] = (perCategoryCounts[category] || 0) + quantity

    for (let index = 0; index < quantity; index += 1) {
      perCategoryUnits[category].push(item)
    }
  }

  const totals: Record<ResourceKey, number> = { bmat: 0, rmat: 0, emat: 0, hemat: 0 }
  const warnings: string[] = []

  for (const [category, units] of Object.entries(perCategoryUnits)) {
    let queuePosition = 1

    for (const unit of units) {
      const cost = unit.cost || {}
      const discountStep = Math.min(queuePosition, 5)
      const discountFactor = 1 - discountStep / 10

      for (const key of RESOURCE_KEYS) {
        const base = Math.max(0, Math.floor(cost[key] || 0))
        totals[key] += Math.floor(base * discountFactor)
      }

      queuePosition += 1
    }

    const count = units.length
    const limit = category === 'vehicles' || category === 'shipables' ? 5 : 9

    if (count > limit) {
      warnings.push(`${category}: ${count} crates exceed MPF recommended limit (${limit})`)
    }
  }

  return { mpfTotals: totals, perCategoryCounts, warnings }
}

export default calculateMpfCosts
