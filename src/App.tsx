import { useMemo, useState } from 'react'
import data from './assets/data.json'
import stockEnText from './assets/stock-en.csv?raw'
import stockFrText from './assets/stock-fr.csv?raw'
import { calculateMpfCosts } from './lib/mpf'

type Faction = 'colonial' | 'warden'
type FactoryType = 'factory' | 'mpf'
type ResourceKey = 'bmat' | 'rmat' | 'emat' | 'hemat'
type Orders = Record<number, number>
type OrdersByFactory = Record<FactoryType, Orders>

type StockVehicle = {
  name: string
  quantity: number
}

type ParsedStock = {
  name: string
  timestamp: string
  quantities: Record<string, number>
  resources: Record<ResourceKey, number>
  vehicles: Record<string, StockVehicle>
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
  { name: 'Heavy Ammunition', icon: 'heavy_ammunition.webp', tag: 'heavy_ammunition', factory: true, mpf: true },
  { name: 'Utility', icon: 'utility.webp', tag: 'utilities', factory: true, mpf: false },
  { name: 'Resource', icon: 'resource.webp', tag: 'supplies', factory: true, mpf: true },
  { name: 'Medical', icon: 'medical.webp', tag: 'medical', factory: true, mpf: false },
  { name: 'Uniforms', icon: 'uniforms.webp', tag: 'uniforms', factory: true, mpf: true },
  { name: 'Vehicles', icon: 'vehicles.webp', tag: 'vehicles', factory: false, mpf: true },
  { name: 'Shipables', icon: 'shipables.webp', tag: 'shipables', factory: false, mpf: true },
]

const RESOURCE_KEYS: ResourceKey[] = ['bmat', 'rmat', 'emat', 'hemat']

const RESOURCE_META: Record<ResourceKey, { label: string; title: string; icon: string; crateSize: number }> = {
  bmat: { label: 'Bmats', title: 'Basic materials', icon: '/assets/images/resources/bmat.webp', crateSize: 100 },
  rmat: { label: 'Rmats', title: 'Refined materials', icon: '/assets/images/resources/rmat.webp', crateSize: 20 },
  emat: { label: 'Emats', title: 'Explosive materials', icon: '/assets/images/resources/emat.webp', crateSize: 40 },
  hemat: {
    label: 'Hemats',
    title: 'Heavy explosive materials',
    icon: '/assets/images/resources/hemat.webp',
    crateSize: 30,
  },
}

const pageText = 'text-[#f4f1e8]'
const panel = 'overflow-hidden rounded-lg border border-white/10 bg-[#343a36] shadow-[0_18px_45px_rgba(0,0,0,0.24)]'
const titleBar =
  'flex min-h-[42px] items-center justify-between gap-3 border-b border-black/35 border-t border-white/10 bg-[#6f766d] px-3 py-2'
const titleText = 'text-[17px] font-bold uppercase tracking-[0.04em] text-white'
const subLabel = 'text-xs font-bold uppercase tracking-[0.08em] text-[#8fc7a0]'
const field =
  'w-full rounded-md border border-[#1f211f] bg-[#121413] px-3 py-2 text-sm text-[#f4f1e8] outline-none placeholder:text-[#8c9189] focus:border-[#e77c48] focus:ring-2 focus:ring-[#e77c48]/25'
const iconButton =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-white/10 bg-[#2e332f] p-1 shadow-[inset_0_1px_rgba(255,255,255,0.08),0_2px_0_rgba(0,0,0,0.42)] transition hover:-translate-y-px hover:border-white/25 hover:bg-[#434a44]'

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

function emptyResourceTotals(): Record<ResourceKey, number> {
  return { bmat: 0, rmat: 0, emat: 0, hemat: 0 }
}

function splitStockLine(line: string) {
  const separatorIndex = line.lastIndexOf(',')
  if (separatorIndex === -1) return [line.trim(), '']
  return [line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim()]
}

function cleanStockField(value: string) {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1).replace(/""/g, '"')
  return trimmed
}

function normalizeStockKey(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s*\((crate|caisse)\)\s*$/i, '')
    .replace(/\bmag\b/gi, '')
    .replace(/["']/g, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase()
}

function stripStockCrateSuffix(name: string) {
  return name.replace(/\s*\((crate|caisse)\)\s*$/i, '').trim()
}

const STOCK_VEHICLE_NAMES = [
  'R-12 - "Salus" Ambulance',
  'R-12b - "Salva" Flame Truck',
  'Dunne Dousing Engine 3r',
  'Dunne Responder 3e',
  "O'Brien V.101 Freeman",
  "O'Brien v.200 Squire",
  "O'Brien V.190 Knave",
  "O'Brien V.113 Gravekeeper",
  'T3 "Xiphos"',
  "O'Brien V.130 Wild Jack",
  "O'Brien V.121 Highlander",
  'T5 "Percutio"',
  'T8 "Gemini"',
  "O'Brien V.110",
  'BMS - Aquatipper',
  'R-15 - "Chariot"',
  'Dunne Caravaner 2f',
  'BMS - Universal Assembly Rig',
  'BMS - Fabricator',
  'BMS - Class 2 Mobile Auto-Crane',
  'Noble Firebrand Mk. XVII',
  'Noble Widow MK. XIV',
  'GA6 "Cestus"',
  "Duncan's Coin 14.5mm",
  'AA-2 "Battering Ram"',
  'Balfour Rampart 68mm',
  'Collins Cannon 68mm',
  '40-45 "Smelter"',
  'Balfour Wolfhound 40mm',
  'G40 "Sagittarii"',
  'Swallowtail 988/127-2',
  '30-250 "Tisiphone" Field Cannon',
  'Balfour Falconer 250mm',
  'BMS - Packmule Flatbed',
  'BMS - Ironship',
  'Das Krokodil by VAC',
  'Type B - "Lucian"',
  '81f-f Ronan Blackguard',
  'Type C - "Charon"',
  '74b-1 Ronan Gunship',
  'HH-d "Peltast"',
  'HH-a "Javelin"',
  'HH-b "Hoplite"',
  'Niska-Rycker Mk. IX Skycaller',
  'Niska Mk. II Blinder',
  'Niska Mk. III Scar Twin',
  'Niska Mk. I Gun Motor Carriage',
  'BMS - Scrap Hauler',
  'AU-A150 Taurine Rigger',
  'Cnute Cliffwrest',
  'AB-8 "Acheron"',
  'AB-11 "Doru"',
  'Mulloy LPC',
  '945g "Stygian Bolt"',
  'Balfour Stockade 75mm',
  '120-68 "Koronides" Field Gun',
  '40-250 "Alekto" Heavy Cannon',
  'Rycker 4/3-F Wasp Nest',
  'K-81e "Sombre"',
  '68A-4 Ronan Fathomer',
  'HC-2 "Scorpion"',
  'HA-1 "Sagaris"',
  'Sharkey-Devitt Birdeater Mk. I',
  'Devitt-Caine Mk. IV MMR',
  'H-5 "Hatchet"',
  'Devitt Ironhide Mk. IV',
  'H-19 "Vulcan"',
  'H-8 "Kranesca"',
  'H-10 "Pelekys"',
  'Devitt Mk. III',
  'Strider',
  'Rinnspeir Ornitier-Class Gunship',
  '86K-a "Bardiche"',
  'Gallagher Thornfall Mk. VI',
  'Gallagher Highwayman Mk. III',
  'Gallagher Outlaw Mk. II',
  '86K-c "Ranseur"',
  'Gallagher Brigand Mk. I',
  '90T-v "Nemesis"',
  'Silverhand Lordscar - Mk. X',
  '85K-b "Falchion"',
  '85V-g "Talos"',
  '85K-a "Spatha"',
  'Silverhand Chieftain - Mk. VI',
  'Silverhand - Mk. IV',
  'Bellweather by VAC',
  'HC-7 "Ballista"',
  '03MM "Caster"',
  '00MS "Stinger"',
  'Kivela Power Wheel 80-1',
  'King Jester Mk. I-1',
  'King Gallant Mk. II',
  'King Spire Mk. I',
  'UV-05a "Argonaut"',
  'UV-24 "Icarus"',
  'Drummond Spitfire 100d',
  'UV-5c "Odyssey"',
  'Drummond Loscann 55c',
  'Drummond 100a',
  'T12 "Actaeon" Tankette',
  'T14 "Vesta" Tankette',
  'T13 "Deioneus" Rocket Battery',
  'T20 "Ixion" Tankette',
  'Rooster - Lamploader',
  'Rooster - Tumblebox',
  'Rooster - Junkwagon',
  'R-1 Hauler',
  'Dunne Leatherback 2a',
  'RR-3 "Stolon" Tanker',
  'Dunne Fuelrunner 2d',
  'R-5b "Sisyphus" Hauler',
  'Dunne Landrunner 12c',
  'R-17 "Retiarius" Skirmisher',
  'R-9 "Speartip" Escort',
  'R-5 "Atlas" Hauler',
  'Dunne Loadlugger 3c',
  'Dunne Transport',
]

const STOCK_VEHICLE_KEYS = new Set(STOCK_VEHICLE_NAMES.map(normalizeStockKey))
const vehicleItemByStockKey = new Map<string, Item>(
  items
    .filter((item) => item.itemCategory === 'vehicles' || item.itemCategory === 'shipables')
    .map((item) => [normalizeStockKey(item.itemName), item]),
)

function parseQuantityField(value: string) {
  const cleaned = cleanStockField(value).replace(/\s/g, '')
  if (!/^\d+$/.test(cleaned)) return null
  return Number.parseInt(cleaned, 10)
}

const STOCK_DATA_ALIASES: Array<[stockName: string, itemName: string]> = [
  ['9mm', '9mm SMG'],
  ['Neville Anti-Tank Rifle', '135 Neville Anti-Tank Rifle'],
  ['Flare Mortar Shell', 'Mortar Flare Shell'],
  ['Shrapnel Mortar Shell', 'Mortar Shrapnel Shell'],
  ['RPG', 'R.P.G Shell'],
  ['Shatter Missile', 'Shatter Missle'],
  ['E681-B Hullbreaker Mine', 'E6881-B Hullbreaker Mine'],
  ['Liaison Transmitter', 'Liason Transmitter'],
  ['Leary Snare Trap 20', 'Leary Snare Trap 127'],
  ['BMS - Universal Assembly Rig', 'BMS - Universal Assemly Rig'],
]

const STOCK_RESOURCE_NAMES: Record<ResourceKey, string> = {
  bmat: 'Basic Materials',
  rmat: 'Refined Materials',
  emat: 'Explosive Powder',
  hemat: 'Heavy Explosive Powder',
}

const stockResourceKeyByStockKey = new Map<string, ResourceKey>(
  RESOURCE_KEYS.map((key) => [normalizeStockKey(STOCK_RESOURCE_NAMES[key]), key]),
)

const dataItemKeyByNameKey = new Map(items.map((item) => [normalizeStockKey(item.itemName), normalizeStockKey(item.itemName)]))
const manualDataItemKeyByStockKey = new Map(
  STOCK_DATA_ALIASES.map(([stockName, itemName]) => [normalizeStockKey(stockName), normalizeStockKey(itemName)]),
)

function readStockNames(text: string) {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawName, rawQuantity] = splitStockLine(line)
      return { name: stripStockCrateSuffix(cleanStockField(rawName)), quantity: parseQuantityField(rawQuantity) }
    })
    .filter((row) => row.quantity !== null)
    .map((row) => row.name)
}

function dataItemKeyForStockName(name: string) {
  const key = normalizeStockKey(name)
  return manualDataItemKeyByStockKey.get(key) ?? dataItemKeyByNameKey.get(key) ?? key
}

function buildStockAliasKeys() {
  const aliases = new Map(dataItemKeyByNameKey)
  const englishNames = readStockNames(stockEnText)
  const localizedStockNames = [readStockNames(stockFrText)]

  for (const name of englishNames) aliases.set(normalizeStockKey(name), dataItemKeyForStockName(name))

  for (const stockNames of localizedStockNames) {
    stockNames.forEach((name, index) => {
      const englishName = englishNames[index]
      if (englishName) aliases.set(normalizeStockKey(name), dataItemKeyForStockName(englishName))
    })
  }

  return aliases
}

const stockAliasKeys = buildStockAliasKeys()

function resolveStockKey(name: string) {
  const key = normalizeStockKey(name)
  return stockAliasKeys.get(key) ?? key
}

function parseStockText(text: string): ParsedStock {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const [firstName, firstValue] = splitStockLine(lines[0] ?? '')
  const firstLineIsStockItem = parseQuantityField(firstValue) !== null
  const dataLines = firstLineIsStockItem ? lines : lines.slice(1)
  const quantities: Record<string, number> = {}
  const resources = emptyResourceTotals()
  const vehicles: Record<string, StockVehicle> = {}

  for (const line of dataLines) {
    const [rawName, rawQuantity] = splitStockLine(line)
    const name = cleanStockField(rawName)
    const quantity = parseQuantityField(rawQuantity)

    if (quantity === null) continue

    const key = resolveStockKey(name)

    if (/\s*\((crate|caisse)\)\s*$/i.test(name)) {
      quantities[key] = quantity

      const resourceKey = stockResourceKeyByStockKey.get(key)
      if (resourceKey) resources[resourceKey] = quantity

      continue
    }

    if (quantity > 0 && (STOCK_VEHICLE_KEYS.has(key) || vehicleItemByStockKey.has(key))) {
      vehicles[key] = { name, quantity }
    }
  }

  return {
    name: firstLineIsStockItem ? '' : cleanStockField(firstName),
    timestamp: firstLineIsStockItem ? '' : cleanStockField(firstValue),
    quantities,
    resources,
    vehicles,
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

      for (const key of RESOURCE_KEYS) totals[key] += (item.cost[key] ?? 0) * quantity
    }

    return totals
  }, [activeOrders])

  const mpfCosts = useMemo(() => calculateMpfCosts(items, activeOrders).mpfTotals, [activeOrders])
  const displayCosts = factoryType === 'factory' ? factoryCosts : mpfCosts

  const crateTotals = useMemo(() => {
    const totals: Record<ResourceKey, number> = { bmat: 0, rmat: 0, emat: 0, hemat: 0 }
    for (const key of RESOURCE_KEYS) totals[key] = Math.ceil((displayCosts[key] ?? 0) / RESOURCE_META[key].crateSize)
    return totals
  }, [displayCosts])

  const totalCrates = RESOURCE_KEYS.reduce((sum, key) => sum + crateTotals[key], 0)
  const stockCrates = Object.values(parsedStock.quantities).reduce((sum, quantity) => sum + quantity, 0)
  const stockVehicles = useMemo(
    () =>
      Object.entries(parsedStock.vehicles)
        .map(([key, vehicle]) => ({ ...vehicle, key, item: vehicleItemByStockKey.get(key) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })),
    [parsedStock.vehicles],
  )

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
      if (nextQuantity > 0) nextOrders[index] = nextQuantity
      else delete nextOrders[index]
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
      for (let instance = 0; instance < quantity; instance += 1) entries.push({ index, item, instance })
    }

    return entries
  }

  function categoryWarning(category: Category, count: number) {
    if (factoryType === 'factory' && count > 4) return 'Warn: factory in-game only supports up to 4 orders.'
    if (factoryType === 'mpf') {
      const limit = category.tag === 'vehicles' || category.tag === 'shipables' ? 5 : 9
      if (count > limit) return `Warn: MPF in-game only supports up to ${limit} orders for ${category.name}.`
    }
    return null
  }

  function getStockQuantity(item: Item) {
    return parsedStock.quantities[resolveStockKey(item.itemName)] ?? 0
  }

  return (
    <div className={`min-h-screen bg-[#052334] ${pageText}`}>
      <div className="mx-auto max-w-370 px-3.5 py-6">
        <header className="mb-6 mx-22 rounded-lg border border-[#f4f1e8]/10 bg-[#0a0f12]/60 p-4.5 shadow-[0_18px_45px_rgba(0,0,0,0.24)]">
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-[#8fc7a0]">Foxhole</p>
          <h1 className="m-0 text-[clamp(32px,4vw,52px)] leading-none text-white">Poilu Calculator ❤️ </h1>
        </header>

        <main className="grid items-start justify-center gap-7 xl:grid-cols-[minmax(0,684px)_minmax(360px,560px)]">
          <section className="flex w-full flex-col">
            <form className={panel}>
              <div className={titleBar}>
                <h2 className={titleText}>Settings</h2>
              </div>

              <div className="bg-[#343a36] p-4">
                <p className="mb-3.5 text-sm text-[#d8d5cc]">
                  Shortcut:{' '}
                  <kbd className="mx-0.5 inline-block rounded border border-[#cfc9bb] bg-[#f4f1e8] px-1.5 py-0.5 font-mono text-[0.86em] text-[#222] shadow-[0_1px_#cfc9bb]">
                    Shift
                  </kbd>{' '}
                  +{' '}
                  <kbd className="mx-0.5 inline-block rounded border border-[#cfc9bb] bg-[#f4f1e8] px-1.5 py-0.5 font-mono text-[0.86em] text-[#222] shadow-[0_1px_#cfc9bb]">
                    Left Click
                  </kbd>{' '}
                  to set full queue from empty.
                </p>

                <div className="grid gap-3.5 md:grid-cols-2">
                  <div className="rounded-md border border-white/10 bg-black/20 p-3">
                    <p className={subLabel}>Faction</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(['colonial', 'warden'] as const).map((option) => (
                        <button
                          className={`rounded border px-3 py-2 text-sm transition ${
                            faction === option
                              ? 'border-[#f1a878] bg-[#e77c48] text-white'
                              : 'border-white/10 bg-[#2e332f] text-[#f4f1e8] hover:border-white/25 hover:bg-[#434a44]'
                          }`}
                          key={option}
                          onClick={() => updateFaction(option)}
                          type="button"
                        >
                          {option === 'colonial' ? 'Colonial' : 'Warden'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-white/10 bg-black/20 p-3">
                    <p className={subLabel}>Type of Factory Used</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(['factory', 'mpf'] as const).map((option) => (
                        <button
                          className={`rounded border px-3 py-2 text-sm transition ${
                            factoryType === option
                              ? 'border-[#8fc7a0] bg-[#1f5f3e] text-white'
                              : 'border-white/10 bg-[#2e332f] text-[#f4f1e8] hover:border-white/25 hover:bg-[#434a44]'
                          }`}
                          key={option}
                          onClick={() => setFactoryType(option)}
                          type="button"
                        >
                          {option === 'factory' ? 'Factory' : 'Mass Production Factory'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className={titleBar}>
                <h2 className={titleText}>Stock</h2>
                {parsedStock.name && (
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[#f4f1e8]">
                    {parsedStock.name}
                  </span>
                )}
              </div>

              <div className="border-b border-white/5 bg-[#343a36] p-4">
                <textarea
                  aria-label="Paste stock CSV"
                  className={`${field} min-h-28 resize-y`}
                  onChange={(event) => setStockText(event.target.value)}
                  placeholder="Paste stock CSV"
                  value={stockText}
                />
                <div className="flex flex-wrap items-center gap-2 pt-3 text-sm text-[#d8d5cc]">
                  <span className="rounded border border-white/10 bg-black/20 px-2.5 py-1">
                    Current Stock: <strong className="text-white">{parsedStock.name || 'None'}</strong>
                  </span>
                  {parsedStock.timestamp && (
                    <span className="rounded border border-white/10 bg-black/20 px-2.5 py-1">
                      {parsedStock.timestamp}
                    </span>
                  )}
                  <span className="rounded border border-white/10 bg-black/20 px-2.5 py-1">
                    {parsedStock.rowCount} crate lines
                  </span>
                  <span className="rounded border border-white/10 bg-black/20 px-2.5 py-1">
                    {stockCrates} crates
                  </span>
                  {stockText && (
                    <button
                      className="ml-auto rounded border border-white/10 bg-[#5b2922] px-3 py-1.5 text-white hover:bg-[#7d3329]"
                      onClick={resetStock}
                      type="button"
                    >
                      Clear Stock
                    </button>
                  )}
                </div>
              </div>

              <div className={titleBar}>
                <h2 className={titleText}>Items</h2>
                <label htmlFor="search" className="sr-only">
                  Search Items
                </label>
                <input
                  className={`${field} max-w-[280px] py-1.5`}
                  id="search"
                  name="itemSearch"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`search ${faction} items`}
                  type="text"
                  value={query}
                />
              </div>
            </form>

            <div className="flex flex-wrap gap-2 bg-[#343a36] p-2.5">
              {availableCategories.map((category) => (
                <button
                  className={`${iconButton} ${
                    !query.trim() && selectedCategory === category.tag ? 'border-[#f1a878] bg-[#e77c48]' : ''
                  }`}
                  key={category.tag}
                  onClick={() => setCurrentCategory(category.tag)}
                  title={category.name}
                  type="button"
                >
                  <img className="h-9 w-9 object-contain" src={tabImage(category.icon)} alt="" />
                  <span className="sr-only">{category.name}</span>
                </button>
              ))}
            </div>

            <section className="grid w-full max-w-[684px] grid-cols-2 gap-2 rounded-b-lg border border-t-0 border-white/10 bg-[#080a09] p-2 min-[384px]:grid-cols-3 min-[496px]:grid-cols-4 min-[608px]:grid-cols-5 min-[720px]:grid-cols-6">
              {filteredItems.map(({ item, index }) => {
                const disabled = isItemDisabledForMpf(index, item)
                const stockQuantity = getStockQuantity(item)
                const costLabel = RESOURCE_KEYS.map((key) => resourceLabel(key, item.cost[key]))
                  .filter(Boolean)
                  .join(' ')

                return (
                  <div className="group relative min-w-0" key={`${item.itemName}-${index}`}>
                    <button
                      aria-label={`Add ${item.itemName}. Costs ${costLabel}`}
                      className={`cursor-pointer relative flex aspect-square w-full items-center justify-center rounded-md border border-white/10 bg-[#4b514d] p-3 shadow-[inset_0_1px_rgba(255,255,255,0.08)] transition hover:-translate-y-px hover:border-[#e77c48]/60 hover:bg-[#616862] active:translate-y-0 active:bg-[#343a36] ${
                        disabled ? 'cursor-not-allowed bg-[#202321] opacity-50' : 'cursor-pointer'
                      }`}
                      disabled={disabled}
                      onClick={(event) => addItem(index, event.shiftKey)}
                      type="button"
                    >
                      <img className="object-contain" src={itemImage(item.imgName)} alt="" />
                      <span
                        className={`absolute bottom-1.5 right-1.5 min-w-7 rounded-full border px-2 py-0.5 text-center text-xs ${
                          stockQuantity > 0
                            ? 'border-[#f1a878] bg-[#e77c48] text-white shadow-[0_0_0_2px_rgba(8,10,9,0.65)]'
                            : 'border-white/15 bg-[#080a09]/90 text-[#c8c4bb]'
                        }`}
                      >
                        {stockQuantity}
                      </span>
                    </button>

                    <div className="pointer-events-none absolute left-1/2 bottom-[calc(100%+8px)] z-10 hidden w-80 max-w-[calc(100vw-40px)] max-h-[70vh] -translate-x-1/2 overflow-y-auto rounded-md border border-white/15 bg-[#0c0f0d] text-sm text-[#e9e5dc] shadow-[0_18px_42px_rgba(0,0,0,0.4)] group-hover:block group-has-[button:disabled]:hidden">
                      <p className="m-0 bg-[#6f766d] px-3 py-2 text-white">{item.itemName}</p>
                      <div className="p-3">
                        {item.itemClass && <p className="mb-1.5 text-[#d5ad74]">{item.itemClass}</p>}
                        <p className="mb-1.5">{item.itemDesc}</p>
                        {item.highVelocityBonus && <p className="mb-1.5 text-[#d5ad74]">{item.highVelocityBonus}</p>}
                        {item.ammoUsed && <p className="mb-1.5 text-[#d4d4d4]">{item.ammoUsed}</p>}
                        {item.isMountable && (
                          <p className="mb-1.5 text-[#d5ad74]">This can be attached to certain vehicles</p>
                        )}
                        {item.damageType && <p className="mb-1.5 text-[#e77c48]">{item.damageType}</p>}
                        {item.damageDesc && <p className="mb-1.5 text-[#d5ad74]">{item.damageDesc}</p>}
                        {item.vehiclePen && <p className="mb-1.5 text-[#d5ad74]">{item.vehiclePen}</p>}
                        {item.vehiclePenChance && <p className="mb-1.5 text-[#d5ad74]">{item.vehiclePenChance}</p>}
                        {item.outfitBuffs?.map((buff) => (
                          <p className="mb-1.5 text-[#d5ad74]" key={buff}>
                            {buff}
                          </p>
                        ))}
                        <p className="mb-1.5 text-[#e77c48]">
                          Produces a crate of {item.numberProduced ?? 1}x {item.itemName}(s)
                        </p>
                        {item.isTeched && <p className="mb-1.5 text-[#75aee6]">Requires Tech</p>}
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {RESOURCE_KEYS.map((key) =>
                            item.cost[key] ? (
                              <div
                                className="flex min-w-[118px] items-center justify-between rounded border border-white/10 bg-[#343a36]"
                                key={key}
                              >
                                <img className="ml-1.5 h-7 w-7" src={RESOURCE_META[key].icon} alt="" />
                                <div className="px-2.5 py-2 text-white">{item.cost[key]}</div>
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

          <aside className={`${panel} w-full xl:sticky xl:top-[18px]`}>
            <div className="px-3.5 pb-1 pt-3.5">
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/15 pb-2.5 text-lg font-bold text-white">
                Total Costs
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2.5">
                {RESOURCE_KEYS.map((key) => (
                  <div key={key}>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-[0.08em] text-[#8fc7a0]">
                      {RESOURCE_META[key].label}
                    </span>
                    <div className="flex min-h-[52px] items-center justify-between rounded-md border border-white/10 bg-[#424942]">
                      <img className="ml-2 h-8 w-8" src={RESOURCE_META[key].icon} alt={RESOURCE_META[key].title} />
                      <span className="p-2.5">{displayCosts[key] ?? 0}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/15 pb-2.5 text-lg font-bold text-white">
                <span>Crate Amounts ({totalCrates})</span>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2.5">
                {RESOURCE_KEYS.map((key) => (
                  <div key={key}>
                    <span className="mb-1 block text-xs font-bold uppercase tracking-[0.08em] text-[#8fc7a0]">
                      {RESOURCE_META[key].label}
                    </span>
                    <div className="flex min-h-[52px] items-center justify-between rounded-md border border-white/10 bg-[#424942]">
                      <img className="ml-2 h-8 w-8" src="/assets/images/resources/crate.webp" alt="" />
                       <span className="flex flex-col items-end gap-0.5 p-2.5 text-right">
                        <span>{crateTotals[key]}</span>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8fc7a0]">
                          Stock : {parsedStock.resources[key]}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/15 pb-2.5 text-lg font-bold text-white">
                <span>Véhicules en stock</span>
                <span className="rounded-full border border-white/10 bg-[#2d342f] px-2.5 py-1 text-sm text-[#d8d5cc]">
                  {stockVehicles.length}
                </span>
              </div>
              <div className="mb-4 rounded-md border border-white/10 bg-[#424942] p-2.5">
                {stockVehicles.length === 0 ? (
                  <p className="m-0 rounded-md border border-white/10 bg-[#2d342f] px-3 py-3 text-sm text-[#d8d5cc]">
                    Il n'y a pas de véhicule en stock
                  </p>
                ) : (
                  <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1">
                    {stockVehicles.map((vehicle) => (
                      <div
                        className="flex min-h-[58px] items-center gap-2.5 rounded-md border border-white/10 bg-[#2d342f] px-2 py-2"
                        key={vehicle.key}
                      >
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-[#252b27] p-1.5">
                          <img
                            className="h-full w-full object-contain"
                            src={vehicle.item ? itemImage(vehicle.item.imgName) : tabImage('vehicles.webp')}
                            alt=""
                          />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{vehicle.name}</span>
                        <span className="rounded-full border border-[#f1a878] bg-[#e77c48] px-2.5 py-1 text-sm font-bold text-white">
                          x{vehicle.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-3.5 py-3.5">
              <h3 className="m-0 flex-1 border-b border-white/15 pb-2.5 text-lg font-bold text-white">
                Manage Crate Orders
              </h3>
              <button
                className="h-[42px] w-[46px] shrink-0 rounded-md border border-white/15 bg-[#4b2520] p-1.5 hover:bg-[#753127]"
                onClick={resetOrders}
                title="Delete All Crates"
                type="button"
              >
                <img src="/assets/images/resources/clear.webp" alt="" />
                <span className="sr-only">Delete All Crates</span>
              </button>
            </div>

            <div className="pb-1">
              {availableCategories.map((category) => {
                const orders = categoryOrders(category.tag)
                const warning = categoryWarning(category, orders.length)

                return (
                  <div className="mx-3.5 mb-2.5 rounded-md border border-white/10 bg-[#424942] p-2.5" key={category.tag}>
                    <div className="flex min-h-11 items-center gap-2.5">
                      <img
                        className="h-[42px] w-[42px] shrink-0 rounded bg-[#252b27] p-1"
                        src={tabImage(category.icon)}
                        alt=""
                      />
                      {orders.length === 0 && <p className="m-0 text-[#d8d5cc]">No items added.</p>}
                      <div className="flex h-11 min-w-0 flex-1 gap-2 overflow-x-auto overflow-y-hidden py-0.5">
                        {orders.map((order) => (
                          <button
                            className="h-10 w-10 min-w-10 rounded border border-white/10 bg-[#2d342f] p-0.5 hover:border-[#e77c48] hover:bg-[#7d3329]"
                            key={`${order.index}-${order.instance}`}
                            onClick={() => removeItem(order.index)}
                            title={order.item.itemName}
                            type="button"
                          >
                            <img className="h-full w-full object-contain" src={itemImage(order.item.imgName)} alt="" />
                            <span className="sr-only">{order.item.itemName}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {warning && <div className="mt-2 rounded bg-[#fc0] px-2 py-1.5 text-[#2a2100]">{warning}</div>}
                  </div>
                )
              })}
            </div>
          </aside>
        </main>
      </div>
    </div>
  )
}

export default App
