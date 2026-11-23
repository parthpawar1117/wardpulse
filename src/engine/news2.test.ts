import { describe, expect, it } from 'vitest'
import { hrPoints, news2Subset, spo2Points } from './news2'

describe('spo2Points (NEWS2 SpO2 scale 1)', () => {
  it.each([
    [100, 0],
    [96, 0],
    [95, 1],
    [94, 1],
    [93, 2],
    [92, 2],
    [91, 3],
    [80, 3],
  ])('SpO2 %i scores %i', (spo2, points) => {
    expect(spo2Points(spo2)).toBe(points)
  })
})

describe('hrPoints (NEWS2 pulse)', () => {
  it.each([
    [35, 3],
    [40, 3],
    [41, 1],
    [50, 1],
    [51, 0],
    [90, 0],
    [91, 1],
    [110, 1],
    [111, 2],
    [130, 2],
    [131, 3],
    [180, 3],
  ])('HR %i scores %i', (hr, points) => {
    expect(hrPoints(hr)).toBe(points)
  })
})

describe('news2Subset', () => {
  it('adds the two parameter scores and marks the result partial', () => {
    const r = news2Subset({ hr: 115, spo2: 94 })
    expect(r).toEqual({ score: 3, hr: 2, spo2: 1, band: 'low', redFlag: false, partial: true })
  })

  it('flags a single parameter scoring 3 even when the total is low', () => {
    const r = news2Subset({ hr: 80, spo2: 90 })
    expect(r?.score).toBe(3)
    expect(r?.redFlag).toBe(true)
    expect(r?.band).toBe('low-medium')
  })

  it('reaches the medium band at 5 points', () => {
    expect(news2Subset({ hr: 135, spo2: 93 })?.band).toBe('medium')
  })

  it('rounds fractional readings before scoring', () => {
    expect(news2Subset({ hr: 90.4, spo2: 95.6 })?.score).toBe(0)
  })

  it('returns null when either vital is missing', () => {
    expect(news2Subset({ hr: null, spo2: 97 })).toBeNull()
    expect(news2Subset({ hr: 80, spo2: null })).toBeNull()
  })
})
