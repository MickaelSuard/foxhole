import { useMemo, useState } from 'react'
import './App.css'
import data from './assets/data.json'
import { calculateMpfCosts } from './lib/mpf'

type Faction = 'colonial' | 'warden'
type FactoryType = 'factory' | 'mpf'
type ResourceKey = 'bmat' | 'rmat' | 'emat' | 'hemat'
type Orders = Record<number, number>
type OrdersByFactory = Record<FactoryType, Orders>

type ParsedStock = {
  name: string
  timestamp: string
  quantities: Record<string, number>
  rowCount: number
}

type Item = {
  faction: string[]
  imgName: string
  itemName: string
  itemDesc: string
  itemCategory: string
  itemClass?: string
  ammoUsed?: string
  numberProduced?: number
  isTeched?: boolean
  isMpfCraftable?: boolean
  craftLocation: string[]
  cost: Partial<Record<ResourceKey, number>>
  highVelocityBonus?: string
  isMountable?: boolean
  damageType?: string
  damageDesc?: string
  vehiclePen?: string
  vehiclePenChance?: string
  outfitBuffs?: string[]
}

type Category = {
  name: string
  icon: string
  tag: string
  factory: boolean
  mpf: boolean
}

const items = data as Item[]

const CATEGORIES: Category[] = [
  { name: 'Small Arms', icon: 'small_arms.webp', tag: 'small_arms', factory: true, mpf: true },
  { name: 'Heavy Arms', icon: 'heavy_arms.webp', tag: 'heavy_arms', factory: true, mpf: true },
  {
    name: 'Heavy Ammunition',
    icon: 'heavy_ammunition.webp',
    tag: 'heavy_ammunition',
    factory: true,
    mpf: true,
  },
  { name: 'Utility', icon: 'utility.webp', tag: 'utilities', factory: true, mpf: false },
  { name: 'Resource', icon: 'resource.webp', tag: 'supplies', factory: true, mpf: true },
  { name: 'Medical', icon: 'medical.webp', tag: 'medical', factory: true, mpf: false },
  { name: 'Uniforms', icon: 'uniforms.webp', tag: 'uniforms', factory: true, mpf: true },
  { name: 'Vehicles', icon: 'vehicles.webp', tag: 'vehicles', factory: false, mpf: true },
  { name: 'Shipables', icon: 'shipables.webp', tag: 'shipables', factory: false, mpf: true },
]

const RESOURCE_KEYS: ResourceKey[] = ['bmat', 'rmat', 'emat', 'hemat']

const RESOURCE_META: Record<ResourceKey, { label: string; title: string; icon: string; crateSize: number }> = {
  bmat: {
    label: 'Bmats',
    title: 'Basic materials',
    icon: '/assets/images/resources/bmat.webp',
    crateSize: 100,
  },
  rmat: {
    label: 'Rmats',
    title: 'Refined materials',
    icon: '/assets/images/resources/rmat.webp',
    crateSize: 20,
  },
  emat: {
    label: 'Emats',
    title: 'Explosive materials',
    icon: '/assets/images/resources/emat.webp',
    crateSize: 40,
  },
  hemat: {
    label: 'Hemats',
    title: 'Heavy explosive materials',
    icon: '/assets/images/resources/hemat.webp',
    crateSize: 30,
  },
}

function emptyOrders(): OrdersByFactory {
  return { factory: {}, mpf: {} }
}

function itemImage(imgName: string) {
  return `/assets/images/items/${imgName}`
}

function tabImage(icon: string) {
  return `/assets/images/tabs/${icon}`
}

function getFullQueueSize(factoryType: FactoryType, item: Item) {
  if (factoryType === 'factory') return 4
  if (item.itemCategory === 'vehicles' || item.itemCategory === 'shipables') return 5
  return 9
}

function resourceLabel(key: ResourceKey, value?: number) {
  if (!value) return ''
  return `${value} ${RESOURCE_META[key].title}`
}

function splitStockLine(line: string) {
  const separatorIndex = line.lastIndexOf(',')

  if (separatorIndex === -1) {
    return [line.trim(), '']
  }

  return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()]
}

function cleanStockField(value: string) {
  const trimmed = value.trim()

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"')
  }

  return trimmed
}

function normalizeStockKey(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s*\(crate\)\s*$/i, '')
    .replace(/\bmag\b/gi, '')
    .replace(/["']/g, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase()
}

function parseStockText(text: string): ParsedStock {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const [stockName, timestamp] = splitStockLine(lines[0] ?? '')
  const quantities: Record<string, number> = {}

  for (const line of lines.slice(1)) {
    const [rawName, rawQuantity] = splitStockLine(line)
    const name = cleanStockField(rawName)
    const isCrate = /\(crate\)\s*$/i.test(name)
    const quantity = Number.parseInt(cleanStockField(rawQuantity), 10)

    if (!isCrate || Number.isNaN(quantity)) continue

    quantities[normalizeStockKey(name)] = quantity
  }

  return {
    name: cleanStockField(stockName),
    timestamp: cleanStockField(timestamp),
    quantities,
    rowCount: Object.keys(quantities).length,
  }
}

function App() {
  const [faction, setFaction] = useState<Faction>('colonial')
  const [factoryType, setFactoryType] = useState<FactoryType>('factory')
  const [query, setQuery] = useState('')
  const [stockText, setStockText] = useState('')
  const [currentCategory, setCurrentCategory] = useState<string | null>('small_arms')
  const [ordersByFactory, setOrdersByFactory] = useState<OrdersByFactory>(() => emptyOrders())

  const activeOrders = ordersByFactory[factoryType]
  const parsedStock = useMemo(() => parseStockText(stockText), [stockText])

  const availableCategories = useMemo(
    () => CATEGORIES.filter((category) => category[factoryType]),
    [factoryType],
  )

  const selectedCategory = availableCategories.some((category) => category.tag === currentCategory)
    ? currentCategory
    : (availableCategories[0]?.tag ?? null)

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.faction.includes(faction))
      .filter(({ item }) => item.craftLocation.includes(factoryType))
      .filter(({ item }) => {
        if (normalizedQuery) return item.itemName.toLowerCase().includes(normalizedQuery)
        return item.itemCategory === selectedCategory
      })
  }, [faction, factoryType, query, selectedCategory])

  const factoryCosts = useMemo(() => {
    const totals: Record<ResourceKey, number> = { bmat: 0, rmat: 0, emat: 0, hemat: 0 }

    for (const [rawIndex, quantity] of Object.entries(activeOrders)) {
      const item = items[Number(rawIndex)]
      if (!item) continue

      for (const key of RESOURCE_KEYS) {
        totals[key] += (item.cost[key] ?? 0) * quantity
      }
    }

    return totals
  }, [activeOrders])

  const mpfCosts = useMemo(() => {
    return calculateMpfCosts(items, activeOrders).mpfTotals
  }, [activeOrders])

  const displayCosts = factoryType === 'factory' ? factoryCosts : mpfCosts

  const crateTotals = useMemo(() => {
    const totals: Record<ResourceKey, number> = { bmat: 0, rmat: 0, emat: 0, hemat: 0 }

    for (const key of RESOURCE_KEYS) {
      totals[key] = Math.ceil((displayCosts[key] ?? 0) / RESOURCE_META[key].crateSize)
    }

    return totals
  }, [displayCosts])

  const totalCrates = RESOURCE_KEYS.reduce((sum, key) => sum + crateTotals[key], 0)

  function resetOrders() {
    setOrdersByFactory(emptyOrders())
  }

  function resetStock() {
    setStockText('')
  }

  function updateFaction(nextFaction: Faction) {
    setFaction(nextFaction)
    setOrdersByFactory(emptyOrders())
  }

  function addItem(index: number, fullQueue = false) {
    const item = items[index]
    if (!item || isItemDisabledForMpf(index, item)) return

    const amount = fullQueue ? getFullQueueSize(factoryType, item) : 1

    setOrdersByFactory((current) => ({
      ...current,
      [factoryType]: {
        ...current[factoryType],
        [index]: (current[factoryType][index] ?? 0) + amount,
      },
    }))
  }

  function removeItem(index: number) {
    setOrdersByFactory((current) => {
      const nextOrders = { ...current[factoryType] }
      const nextQuantity = (nextOrders[index] ?? 0) - 1

      if (nextQuantity > 0) {
        nextOrders[index] = nextQuantity
      } else {
        delete nextOrders[index]
      }

      return { ...current, [factoryType]: nextOrders }
    })
  }

  function isItemDisabledForMpf(index: number, item: Item) {
    if (factoryType !== 'mpf') return false

    return Object.keys(activeOrders).some((rawIndex) => {
      const orderIndex = Number(rawIndex)
      return orderIndex !== index && items[orderIndex]?.itemCategory === item.itemCategory
    })
  }

  function categoryOrders(categoryTag: string) {
    const entries: Array<{ index: number; item: Item; instance: number }> = []

    for (const [rawIndex, quantity] of Object.entries(activeOrders)) {
      const index = Number(rawIndex)
      const item = items[index]

      if (item?.itemCategory !== categoryTag) continue

      for (let instance = 0; instance < quantity; instance += 1) {
        entries.push({ index, item, instance })
      }
    }

    return entries
  }

  function categoryWarning(category: Category, count: number) {
    if (factoryType === 'factory' && count > 4) {
      return 'Warn: factory in-game only supports up to 4 orders.'
    }

    if (factoryType === 'mpf') {
      const limit = category.tag === 'vehicles' || category.tag === 'shipables' ? 5 : 9
      if (count > limit) {
        return `Warn: MPF in-game only supports up to ${limit} orders for ${category.name}.`
      }
    }

    return null
  }

  function getStockQuantity(item: Item) {
    return parsedStock.quantities[normalizeStockKey(item.itemName)] ?? 0
  }

  return (
    <div>
      <header>
        <h1>Poilu Calculator</h1>
      </header>

      <main>
        <section className="items-list">
          <form>
            <div className="title-bar">
              <h2>Settings</h2>
            </div>
            <div className="settings-bar">
              <p>
                Shortcut: <kbd>Shift</kbd> + <kbd>Left Click</kbd> to set full queue from empty.
              </p>
              <div className="settings-form">
                <div className="settings-form__column">
                  <fieldset>
                    <legend>Faction:</legend>
                    <input
                      checked={faction === 'colonial'}
                      id="colonial"
                      name="faction"
                      onChange={() => updateFaction('colonial')}
                      type="radio"
                      value="colonial"
                    />
                    <label htmlFor="colonial">Colonial</label>
                    <input
                      checked={faction === 'warden'}
                      id="warden"
                      name="faction"
                      onChange={() => updateFaction('warden')}
                      type="radio"
                      value="warden"
                    />
                    <label htmlFor="warden">Warden</label>
                  </fieldset>
                </div>
                <div className="settings-form__column">
                  <fieldset>
                    <legend>Type of Factory Used:</legend>
                    <input
                      checked={factoryType === 'factory'}
                      id="factory"
                      name="factoryType"
                      onChange={() => setFactoryType('factory')}
                      type="radio"
                      value="factory"
                    />
                    <label htmlFor="factory">Factory</label>
                    <input
                      checked={factoryType === 'mpf'}
                      id="mpf"
                      name="factoryType"
                      onChange={() => setFactoryType('mpf')}
                      type="radio"
                      value="mpf"
                    />
                    <label htmlFor="mpf">Mass Production Factory</label>
                  </fieldset>
                </div>
              </div>
            </div>

            <div className="title-bar">
              <h2>Stock</h2>
              {parsedStock.name && <span className="stock-title">{parsedStock.name}</span>}
            </div>
            <div className="stock-bar">
              <textarea
                aria-label="Paste stock CSV"
                className="stock-input"
                onChange={(event) => setStockText(event.target.value)}
                placeholder="Paste stock CSV"
                value={stockText}
              />
              <div className="stock-summary">
                <span>
                  Current Stock:{' '}
                  <strong>{parsedStock.name || 'None'}</strong>
                </span>
                {parsedStock.timestamp && <span>{parsedStock.timestamp}</span>}
                <span>{parsedStock.rowCount} crate lines</span>
                {stockText && (
                  <button onClick={resetStock} type="button">
                    Clear Stock
                  </button>
                )}
              </div>
            </div>

            <div className="title-bar">
              <h2>Items</h2>
              <label htmlFor="search" className="sr-only">
                Search Items
              </label>
              <input
                id="search"
                name="itemSearch"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`search ${faction} items`}
                type="text"
                value={query}
              />
            </div>
          </form>

          <div className="category-bar">
            {availableCategories.map((category) => (
              <button
                className={!query.trim() && selectedCategory === category.tag ? 'active' : ''}
                data-tab={category.tag}
                key={category.tag}
                onClick={() => setCurrentCategory(category.tag)}
                style={{ backgroundImage: `url('${tabImage(category.icon)}')` }}
                title={category.name}
                type="button"
              >
                <span className="sr-only">{category.name}</span>
              </button>
            ))}
          </div>

          <section className="items">
            {filteredItems.map(({ item, index }) => {
              const disabled = isItemDisabledForMpf(index, item)
              const stockQuantity = getStockQuantity(item)
              const costLabel = RESOURCE_KEYS.map((key) => resourceLabel(key, item.cost[key]))
                .filter(Boolean)
                .join(' ')

              return (
                <div className="item" key={`${item.itemName}-${index}`}>
                  <div className="item__wrapper">
                    <button
                      aria-label={`Add ${item.itemName}. Costs ${costLabel}`}
                      className="item__icon"
                      disabled={disabled}
                      onClick={(event) => addItem(index, event.shiftKey)}
                      style={{ backgroundImage: `url('${itemImage(item.imgName)}')` }}
                      type="button"
                    >
                      <span className="sr-only">Add {item.itemName}.</span>
                    </button>
                    <span className={`item__stock-badge ${stockQuantity > 0 ? 'has-stock' : ''}`}>
                      {stockQuantity}
                    </span>
                  </div>
                  <div className="item__tooltip">
                    <p className="item__title">{item.itemName}</p>
                    <div className="item__frame">
                      {item.itemClass && <p className="orange">{item.itemClass}</p>}
                      <p>{item.itemDesc}</p>
                      {item.highVelocityBonus && <p className="orange">{item.highVelocityBonus}</p>}
                      {item.ammoUsed && <p className="gray">{item.ammoUsed}</p>}
                      {item.isMountable && <p className="orange">This can be attached to certain vehicles</p>}
                      {item.damageType && <p className="angry-orange">{item.damageType}</p>}
                      {item.damageDesc && <p className="orange">{item.damageDesc}</p>}
                      {item.vehiclePen && <p className="orange">{item.vehiclePen}</p>}
                      {item.vehiclePenChance && <p className="orange">{item.vehiclePenChance}</p>}
                      {item.outfitBuffs?.map((buff) => (
                        <p className="orange" key={buff}>
                          {buff}
                        </p>
                      ))}
                      <p className="angry-orange">
                        Produces a crate of {item.numberProduced ?? 1}x {item.itemName}(s)
                      </p>
                      {item.isTeched && <p className="blue">Requires Tech</p>}
                      <div className="resource">
                        {RESOURCE_KEYS.map((key) =>
                          item.cost[key] ? (
                            <div className="resource-container" key={key}>
                              <img src={RESOURCE_META[key].icon} alt={RESOURCE_META[key].title} />
                              <div>{item.cost[key]}</div>
                            </div>
                          ) : null,
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </section>
        </section>

        <section className="items-output">
          <div className="crate-display">
            <div className="heading-title">Total Costs</div>
            <div className="resources">
              {RESOURCE_KEYS.map((key) => (
                <div className="container" key={key}>
                  <span className="title">{RESOURCE_META[key].label}</span>
                  <div className="resource">
                    <img src={RESOURCE_META[key].icon} alt={RESOURCE_META[key].title} />
                    <span>{displayCosts[key] ?? 0}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="crate-display">
            <div className="heading-title">
              <span>Crate Amounts ({totalCrates})</span>
            </div>
            <div className="resources">
              {RESOURCE_KEYS.map((key) => (
                <div className="container" key={key}>
                  <span className="title">{RESOURCE_META[key].label}</span>
                  <div className="resource">
                    <img src="/assets/images/resources/crate.webp" alt={`${RESOURCE_META[key].title} crates`} />
                    <span>{crateTotals[key]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="delete-button">
            <h3 className="heading-title">Manage Crate Orders</h3>
            <button
              onClick={resetOrders}
              style={{ backgroundImage: "url('/assets/images/resources/clear.webp')" }}
              type="button"
            >
              Delete All Crates
            </button>
          </div>

          <div>
            {availableCategories.map((category) => {
              const orders = categoryOrders(category.tag)
              const warning = categoryWarning(category, orders.length)

              return (
                <div className="categoryContainer" key={category.tag}>
                  <div className="categoryContainerFlex">
                    <img src={tabImage(category.icon)} alt="" className="categoryImage" />
                    {orders.length === 0 && <p className="message">No items added.</p>}
                    <div className="buttonContainer">
                      {orders.map((order) => (
                        <button
                          className="categorySubject"
                          key={`${order.index}-${order.instance}`}
                          onClick={() => removeItem(order.index)}
                          style={{ backgroundImage: `url('${itemImage(order.item.imgName)}')` }}
                          title={order.item.itemName}
                          type="button"
                        >
                          {order.item.itemName}
                        </button>
                      ))}
                    </div>
                  </div>
                  {warning && <div className="warning">{warning}</div>}
                </div>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
