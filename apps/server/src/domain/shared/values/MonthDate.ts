import { Schema } from "effect"

// Month-truncated date schema for partition keys (YYYY-MM-01 format only)
export const MonthDate = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-01$/),
  Schema.brand("MonthDate")
)

export type MonthDate = Schema.Schema.Type<typeof MonthDate>

// Utility functions for month date operations
export const createMonthDate = (date: Date): MonthDate => {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}-01` as MonthDate
}

export const parseMonthDate = (monthDate: MonthDate): Date => {
  return new Date(`${monthDate}T00:00:00.000Z`)
}

export const getCurrentMonthDate = (): MonthDate => {
  return createMonthDate(new Date())
}
