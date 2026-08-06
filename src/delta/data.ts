import type { DataCheck, DataSource, DeliveryRow, FleetRow, SourcedFact } from './types';

export const DATA_SNAPSHOT = 'August 5, 2026';

export const SOURCES: DataSource[] = [
  {
    id: 'delta-2025-10k',
    publisher: 'Delta Air Lines / SEC EDGAR',
    title: 'Delta Air Lines 2025 Form 10-K',
    url: 'https://www.sec.gov/Archives/edgar/data/27904/000002790426000013/dal-20251231.htm',
    asOf: 'December 31, 2025',
    accessed: DATA_SNAPSHOT,
    note: 'Primary source for the fleet, delivery commitments, fuel use, and fuel expense shown in this case study.',
  },
  {
    id: 'delta-737-800',
    publisher: 'Delta Air Lines',
    title: 'Boeing 737 fleet media kit',
    url: 'https://news.delta.com/mediakit/boeing-737',
    asOf: '2026 fleet media kit',
    accessed: DATA_SNAPSHOT,
    note: 'Confirms Delta operates 77 Boeing 737-800 aircraft.',
  },
  {
    id: 'delta-737-10-order',
    publisher: 'Delta Air Lines',
    title: 'Delta adds fuel-efficient Boeing 737-10 to fleet',
    url: 'https://pro.delta.com/content/agency/gb/en/news/products---services-archive/2022/july-2022/delta-adds-state-of-the-art--fuel-efficient-boeing-737-max-to-fl.html',
    asOf: 'July 18, 2022',
    accessed: DATA_SNAPSHOT,
    note: 'Primary source for the planned 182-seat cabin and Delta\'s stated 20% to 30% fuel-efficiency range versus retiring aircraft.',
  },
  {
    id: 'boeing-737-max',
    publisher: 'Boeing',
    title: '737 MAX family',
    url: 'https://www.boeing.com/commercial/737max',
    asOf: 'Current product page',
    accessed: DATA_SNAPSHOT,
    note: 'Manufacturer source reporting a 20% reduction in fuel use and carbon emissions for the 737 MAX family.',
  },
  {
    id: 'eia-jet-fuel',
    publisher: 'U.S. Energy Information Administration',
    title: 'Weekly U.S. Gulf Coast jet fuel spot price',
    url: 'https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?f=W&n=PET&s=EER_EPJK_PF4_RGC_DPG',
    asOf: 'July 31, 2026',
    accessed: DATA_SNAPSHOT,
    note: 'Market reference only. Delta\'s realized fuel cost can differ because of contracts, refinery results, and hedging.',
  },
  {
    id: 'bts-p52',
    publisher: 'U.S. Bureau of Transportation Statistics',
    title: 'Air Carrier Financial Schedule P-5.2',
    url: 'https://www.transtats.bts.gov/DL_SelectFields.aspx?QO_fu146_anzr=Nv4+Pn44vr4+Sv0n0pvny&gnoyr_VQ=FMK',
    asOf: 'Latest data shown: March 2026',
    accessed: DATA_SNAPSHOT,
    note: 'Official source available for aircraft-type operating and maintenance expense research. It is not used as a Delta-specific model input here.',
  },
];

export const FLEET: FleetRow[] = [
  { model: 'A220-100', owned: 45, financeLease: 0, operatingLease: 0, total: 45, averageAge: 6.0, purchaseCommitments: 0, options: 0, modeled: false },
  { model: 'A220-300', owned: 36, financeLease: 0, operatingLease: 0, total: 36, averageAge: 2.7, purchaseCommitments: 64, options: 0, modeled: false },
  { model: 'A319-100', owned: 57, financeLease: 0, operatingLease: 0, total: 57, averageAge: 23.8, purchaseCommitments: 0, options: 0, modeled: false },
  { model: 'A320-200', owned: 46, financeLease: 0, operatingLease: 0, total: 46, averageAge: 29.0, purchaseCommitments: 0, options: 0, modeled: false },
  { model: 'A321-200', owned: 77, financeLease: 8, operatingLease: 42, total: 127, averageAge: 7.0, purchaseCommitments: 0, options: 0, modeled: false },
  { model: 'A321-200neo', owned: 87, financeLease: 0, operatingLease: 0, total: 87, averageAge: 2.0, purchaseCommitments: 68, options: 70, modeled: false },
  { model: 'A330-200', owned: 11, financeLease: 0, operatingLease: 0, total: 11, averageAge: 20.8, purchaseCommitments: 0, options: 0, modeled: false },
  { model: 'A330-300', owned: 28, financeLease: 0, operatingLease: 3, total: 31, averageAge: 16.9, purchaseCommitments: 0, options: 0, modeled: false },
  { model: 'A330-900neo', owned: 32, financeLease: 2, operatingLease: 5, total: 39, averageAge: 3.0, purchaseCommitments: 0, options: 10, modeled: false },
  { model: 'A350-900', owned: 29, financeLease: 0, operatingLease: 11, total: 40, averageAge: 5.3, purchaseCommitments: 4, options: 10, modeled: false },
  { model: 'A350-1000', owned: 0, financeLease: 0, operatingLease: 0, total: 0, averageAge: null, purchaseCommitments: 20, options: 0, modeled: false },
  { model: 'B717-200', owned: 80, financeLease: 0, operatingLease: 0, total: 80, averageAge: 24.3, purchaseCommitments: 0, options: 0, modeled: false },
  { model: 'B737-800', owned: 73, financeLease: 4, operatingLease: 0, total: 77, averageAge: 24.3, purchaseCommitments: 0, options: 0, modeled: true },
  { model: 'B737-900ER', owned: 119, financeLease: 6, operatingLease: 38, total: 163, averageAge: 10.0, purchaseCommitments: 0, options: 0, modeled: false },
  { model: 'B737-10', owned: 0, financeLease: 0, operatingLease: 0, total: 0, averageAge: null, purchaseCommitments: 100, options: 30, modeled: true },
  { model: 'B757-200', owned: 76, financeLease: 0, operatingLease: 0, total: 76, averageAge: 27.1, purchaseCommitments: 0, options: 0, modeled: false },
  { model: 'B757-300', owned: 16, financeLease: 0, operatingLease: 0, total: 16, averageAge: 22.9, purchaseCommitments: 0, options: 0, modeled: false },
  { model: 'B767-300ER', owned: 37, financeLease: 0, operatingLease: 0, total: 37, averageAge: 29.0, purchaseCommitments: 0, options: 0, modeled: false },
  { model: 'B767-400ER', owned: 21, financeLease: 0, operatingLease: 0, total: 21, averageAge: 25.0, purchaseCommitments: 0, options: 0, modeled: false },
];

export const DELIVERIES: DeliveryRow[] = [
  { model: 'A220-300', year2026: 24, year2027: 18, year2028: 10, after2028: 12, total: 64 },
  { model: 'A321-200neo', year2026: 20, year2027: 42, year2028: 6, after2028: 0, total: 68 },
  { model: 'A350-900', year2026: 4, year2027: 0, year2028: 0, after2028: 0, total: 4 },
  { model: 'A350-1000', year2026: 0, year2027: 8, year2028: 12, after2028: 0, total: 20 },
  { model: 'B737-10', year2026: 0, year2027: 27, year2028: 39, after2028: 34, total: 100 },
];

export const FACTS: SourcedFact[] = [
  { id: 'fleet-total', label: 'Mainline aircraft', value: 989, displayValue: '989 planes', sourceId: 'delta-2025-10k', location: 'Item 2, page 28, mainline aircraft table', status: 'checked' },
  { id: 'fleet-average-age', label: 'Average mainline fleet age', value: 14.8, displayValue: '14.8 years', sourceId: 'delta-2025-10k', location: 'Item 2, page 28, mainline aircraft table', status: 'checked' },
  { id: 'fleet-owned', label: 'Owned mainline aircraft', value: 870, displayValue: '870 planes', sourceId: 'delta-2025-10k', location: 'Item 2, page 28, mainline aircraft table', status: 'checked' },
  { id: 'fleet-finance-lease', label: 'Aircraft under finance leases', value: 20, displayValue: '20 planes', sourceId: 'delta-2025-10k', location: 'Item 2, page 28, mainline aircraft table', status: 'checked' },
  { id: 'fleet-operating-lease', label: 'Aircraft under operating leases', value: 99, displayValue: '99 planes', sourceId: 'delta-2025-10k', location: 'Item 2, page 28, mainline aircraft table', status: 'checked' },
  { id: 'b737-800-count', label: 'Boeing 737-800 fleet', value: 77, displayValue: '77 planes', sourceId: 'delta-2025-10k', location: 'Item 2, page 28, B737-800 row', status: 'checked' },
  { id: 'b737-800-age', label: 'Average age of the 737-800 fleet', value: 24.3, displayValue: '24.3 years', sourceId: 'delta-2025-10k', location: 'Item 2, page 28, B737-800 row', status: 'checked' },
  { id: 'b737-800-seats', label: 'Seats on Delta\'s 737-800', value: 160, displayValue: '160 seats', sourceId: 'delta-737-800', location: 'Delta aircraft specifications', status: 'checked', note: 'Delta configurations may change.' },
  { id: 'b737-10-orders', label: 'Committed Boeing 737-10 orders', value: 100, displayValue: '100 planes', sourceId: 'delta-2025-10k', location: 'Item 2, page 28, aircraft purchase commitments', status: 'checked' },
  { id: 'b737-10-seats', label: 'Planned seats on Delta\'s 737-10', value: 182, displayValue: '182 seats', sourceId: 'delta-737-10-order', location: 'Delta order announcement', status: 'checked' },
  { id: 'b737-10-2027', label: '737-10 deliveries scheduled for 2027', value: 27, displayValue: '27 planes', sourceId: 'delta-2025-10k', location: 'Item 2, page 28, aircraft purchase commitments', status: 'checked' },
  { id: 'b737-10-2028', label: '737-10 deliveries scheduled for 2028', value: 39, displayValue: '39 planes', sourceId: 'delta-2025-10k', location: 'Item 2, page 28, aircraft purchase commitments', status: 'checked' },
  { id: 'b737-10-after-2028', label: '737-10 deliveries scheduled after 2028', value: 34, displayValue: '34 planes', sourceId: 'delta-2025-10k', location: 'Item 2, page 28, aircraft purchase commitments', status: 'checked', note: 'The filing does not assign these 34 aircraft to specific years.' },
  { id: 'purchase-commitments', label: 'Total committed aircraft', value: 256, displayValue: '256 planes', sourceId: 'delta-2025-10k', location: 'Item 2, page 28, aircraft purchase commitments', status: 'checked' },
  { id: 'purchase-commitments-value', label: 'Future aircraft purchase commitments', value: 15.43, displayValue: '$15.43 billion', sourceId: 'delta-2025-10k', location: 'Note 9, page 81', status: 'checked' },
  { id: 'fuel-gallons-2025', label: 'Fuel consumed in 2025', value: 4.269, displayValue: '4.269 billion gallons', sourceId: 'delta-2025-10k', location: 'Fuel table, page 10', status: 'checked' },
  { id: 'fuel-expense-2025', label: 'Fuel expense in 2025', value: 9.819, displayValue: '$9.819 billion', sourceId: 'delta-2025-10k', location: 'Fuel table, page 10', status: 'checked' },
  { id: 'fuel-price-2025', label: 'Delta average fuel price in 2025', value: 2.30, displayValue: '$2.30 per gallon', sourceId: 'delta-2025-10k', location: 'Fuel table, page 10', status: 'checked', note: 'Includes refinery results and hedge activity.' },
  { id: 'fuel-market-latest', label: 'Latest Gulf Coast market reference', value: 3.736, displayValue: '$3.736 per gallon', sourceId: 'eia-jet-fuel', location: 'Weekly series, July 31, 2026', status: 'checked', note: 'This spot price is not Delta\'s realized fuel cost.' },
  { id: 'max-fuel-improvement', label: 'Reported 737 MAX fuel-use improvement', value: 20, displayValue: '20% lower', sourceId: 'boeing-737-max', location: '737 MAX product page', status: 'checked', note: 'Manufacturer comparison. Delta has separately stated a 20% to 30% range versus retiring aircraft.' },
];

export function factById(id: string): SourcedFact {
  const fact = FACTS.find((item) => item.id === id);
  if (!fact) throw new Error(`Unknown fact: ${id}`);
  return fact;
}

export function sourceById(id: string): DataSource {
  const source = SOURCES.find((item) => item.id === id);
  if (!source) throw new Error(`Unknown source: ${id}`);
  return source;
}

export function runDataChecks(): DataCheck[] {
  const fleetTotal = FLEET.reduce((sum, row) => sum + row.total, 0);
  const owned = FLEET.reduce((sum, row) => sum + row.owned, 0);
  const finance = FLEET.reduce((sum, row) => sum + row.financeLease, 0);
  const operating = FLEET.reduce((sum, row) => sum + row.operatingLease, 0);
  const orders = DELIVERIES.reduce((sum, row) => sum + row.total, 0);
  const b737 = DELIVERIES.find((row) => row.model === 'B737-10');
  const impliedFuelExpense = Number(factById('fuel-gallons-2025').value) * Number(factById('fuel-price-2025').value);

  return [
    {
      id: 'fleet-total-check',
      label: 'Fleet rows add to the reported total',
      passed: fleetTotal === Number(factById('fleet-total').value),
      detail: `${fleetTotal} aircraft across the listed mainline fleet types.`,
      factIds: ['fleet-total'],
    },
    {
      id: 'ownership-check',
      label: 'Ownership columns reconcile',
      passed: owned === 870 && finance === 20 && operating === 99 && owned + finance + operating === fleetTotal,
      detail: `${owned} owned + ${finance} finance lease + ${operating} operating lease = ${fleetTotal}.`,
      factIds: ['fleet-owned', 'fleet-finance-lease', 'fleet-operating-lease', 'fleet-total'],
    },
    {
      id: 'orders-check',
      label: 'Delivery commitments add to the reported total',
      passed: orders === Number(factById('purchase-commitments').value),
      detail: `${orders} committed aircraft across five aircraft families.`,
      factIds: ['purchase-commitments'],
    },
    {
      id: 'b737-schedule-check',
      label: 'The 737-10 delivery schedule reconciles',
      passed: Boolean(b737 && b737.year2026 + b737.year2027 + b737.year2028 + b737.after2028 === b737.total),
      detail: '0 in 2026 + 27 in 2027 + 39 in 2028 + 34 after 2028 = 100.',
      factIds: ['b737-10-orders', 'b737-10-2027', 'b737-10-2028', 'b737-10-after-2028'],
    },
    {
      id: 'fuel-check',
      label: 'Fuel gallons and average price reconcile to expense',
      passed: Math.abs(impliedFuelExpense - Number(factById('fuel-expense-2025').value)) < 0.01,
      detail: `4.269 billion gallons x $2.30 is approximately $${impliedFuelExpense.toFixed(3)} billion.`,
      factIds: ['fuel-gallons-2025', 'fuel-price-2025', 'fuel-expense-2025'],
    },
  ];
}
