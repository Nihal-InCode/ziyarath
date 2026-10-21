export type Role = 'admin' | 'coordinator'

export interface User {
  userId: string
  name: string
  email: string
  role: Role
  tripIds: string[]
  active: boolean
  tripNames?: string[]
  createdAt?: string
}

export interface TripRef {
  tripId: string
  name: string
}

export interface Bootstrap {
  user: User
  trips: TripRef[]
  categories: { name: string }[]
  settings: {
    arrivalToleranceMinutes: number
    receiptsEnabled: boolean
    allowRatingUpdates: boolean
    currency: string
    timeZone: string
  }
  serverTime: string
}

export interface Expense {
  expenseId: string
  tripId: string
  tripName?: string
  expenseDate: string
  submittedAt: string
  coordinatorId: string
  coordinatorName: string
  reason: string
  category: string
  amount: number
  notes: string
  receiptReference: string
  status: 'active' | 'void'
  createdAt: string
  updatedAt: string
  lastEditedBy: string
}

export interface ExpenseListResult {
  rows: Expense[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
  countedTotal: number
}

export interface TripSnapshot {
  tripId: string
  name: string
  active: boolean
  startDate?: string
  endDate?: string
  hasBudget: boolean
  totalBudget: number | null
  spent: number
  remaining: number | null
  usedPercent: number | null
  level: BudgetLevel
  expenseCount: number
  voidCount: number
  latestExpenseAt: string
  todaySpent: number
}

export type BudgetLevel = 'ok' | 'warning' | 'high' | 'exceeded' | 'unknown'

export interface AdminSummary {
  trips: TripSnapshot[]
  combined: {
    totalBudget: number | null
    spent: number
    remaining: number | null
    usedPercent: number | null
    hasBudget: boolean
    level: BudgetLevel
    expenseCount: number
    activeTrips: number
    activeCoordinators: number
  }
  generatedAt: string
}

export interface GroupRow {
  key: string
  total: number
  count: number
  name?: string
  tripId?: string
}

export interface CoordinatorDashboard {
  trip: TripRef
  budget: {
    hasBudget: boolean
    totalBudget: number | null
    spent: number
    remaining: number | null
    usedPercent: number | null
    level: BudgetLevel
    tripSpentTotal: number
  }
  totals: { expenseCount: number; todaySpent: number; todayYmd: string }
  recent: Expense[]
  byCategory: GroupRow[]
  byDay: { date: string; total: number; count: number }[]
  itinerary: ItineraryStop[]
}

export interface ItineraryStop {
  stopId: string
  sequence: number
  locationName: string
  plannedArrival: string
  plannedDeparture: string
  expectedDuration: string
  notes: string
  plannedArrivalMs: number | null
  arrived: boolean
  actualArrival: string | null
  arrivalStatus: string | null
  delayMinutes: number
  delayText: string | null
  scheduleStatus: string
  delayReason: string
}

export interface ProgressRow {
  progressId: string
  stopId: string
  locationName: string
  coordinatorId: string
  actualArrival: string
  delayMinutes: number
  status: string
  delayReason: string
  notes: string
  submittedAt: string
}

export interface Rating {
  ratingId: string
  tripId: string
  stopId: string
  reviewerId: string
  destination: number
  accommodation: number
  food: number
  transport: number
  overall: number
  feedback: string
  submittedAt: string
  locationName?: string
}

export interface RatingAverages {
  count: number
  destination: number | null
  accommodation: number | null
  food: number | null
  transport: number | null
  overall: number | null
}

export interface RatingsSummary {
  averages: RatingAverages
  byStop: (RatingAverages & { stopId: string; locationName: string })[]
  feedback: { stopId: string; locationName: string; overall: number; feedback: string; submittedAt: string }[]
}

export interface ReportResult {
  totals: { count: number; total: number; voidCount: number }
  byDay: { date: string; total: number; count: number }[]
  byCategory: GroupRow[]
  byCoordinator: GroupRow[]
  byTrip: { tripId: string; name: string; total: number; count: number }[]
  budgets: {
    tripId: string
    name: string
    totalBudget: number | null
    hasBudget: boolean
    spent: number
    remaining: number | null
    usedPercent: number | null
    level: BudgetLevel
  }[]
  rows: Expense[]
  filters: { from: string | null; to: string | null; tripIds: string[] }
  generatedAt: string
}

export interface ExpenseHistoryEntry {
  auditId: string
  userName: string
  action: string
  timestamp: string
  changeSummary: string
}

export interface ReceiptUpload {
  receiptId: string
  fileId: string
  name: string
  size: number
  uploadedAt: string
}
