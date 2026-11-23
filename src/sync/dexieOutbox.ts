import Dexie, { type EntityTable } from 'dexie'
import type { Outbox, UplinkRecord } from './outbox'

/** Rows carry an auto-increment id so the oldest record always goes first. */
type Row = UplinkRecord & { id?: number }

/**
 * The outbox kept in the browser's IndexedDB (through Dexie), so queued
 * readings survive a closed tab, a crash or a power cut until the uplink is back.
 */
export function createDexieOutbox(name = 'wardpulse'): Outbox {
  const db = new Dexie(name) as Dexie & { outbox: EntityTable<Row, 'id'> }
  // '++id' orders rows by arrival; '&key' is a unique index, so a repeat key is refused.
  db.version(1).stores({ outbox: '++id, &key' })

  return {
    async add(records) {
      try {
        await db.outbox.bulkAdd(records)
      } catch (err) {
        // Records already queued fail the unique index; the rest are still added.
        if (!(err instanceof Dexie.BulkError)) throw err
      }
    },
    peek: async (limit) => (await db.outbox.orderBy('id').limit(limit).toArray()).map(({ id: _id, ...r }) => r),
    remove: async (keys) => {
      await db.outbox.where('key').anyOf(keys).delete()
    },
    count: () => db.outbox.count(),
    clear: () => db.outbox.clear(),
  }
}
