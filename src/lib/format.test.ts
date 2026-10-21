import { describe, it, expect } from 'vitest'
import {
  formatINR,
  formatINRExact,
  todayYmd,
  addDaysYmd,
  formatDateTimeIST,
  formatMinutes,
  percentOf,
  nowHM,
  TZ,
} from './format'

describe('formatINR', () => {
  it('formats with Indian grouping and no decimals', () => {
    expect(formatINR(1250)).toBe('₹1,250')
    expect(formatINR(100000)).toBe('₹1,00,000')
    expect(formatINR(1234567.6)).toBe('₹12,34,568')
    expect(formatINR(0)).toBe('₹0')
    expect(formatINR(null)).toBe('₹0')
  })

  it('shows paise only when present', () => {
    expect(formatINRExact(1250)).toBe('₹1,250')
    expect(formatINRExact(1250.5)).toBe('₹1,250.50')
  })
})

describe('Asia/Kolkata dates', () => {
  it('computes today in IST', () => {
    // 2026-10-21 20:00 UTC = 2026-10-22 01:30 IST
    expect(todayYmd(TZ, new Date('2026-10-21T20:00:00Z'))).toBe('2026-10-22')
    expect(todayYmd(TZ, new Date('2026-10-21T10:00:00Z'))).toBe('2026-10-21')
  })

  it('adds days across month boundaries', () => {
    expect(addDaysYmd('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysYmd('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('formats sheet datetime text as IST', () => {
    expect(formatDateTimeIST('2026-10-21 08:30')).toContain('21 Oct 2026')
    expect(formatDateTimeIST('')).toBe('—')
    expect(formatDateTimeIST(null)).toBe('—')
  })

  it('formats durations', () => {
    expect(formatMinutes(95)).toBe('1h 35m')
    expect(formatMinutes(45)).toBe('45m')
    expect(formatMinutes(120)).toBe('2h')
  })

  it('computes percentages safely', () => {
    expect(percentOf(250, 1000)).toBe(25)
    expect(percentOf(10, 0)).toBe(0)
  })

  it('produces HH:mm now in IST', () => {
    expect(nowHM()).toMatch(/^\d{2}:\d{2}$/)
  })
})
