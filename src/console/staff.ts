import type { StaffMember } from './alarms'

/** The ward these beds belong to, as it appears in messages. */
export const WARD_NAME = 'Ward A'

/**
 * Demo duty roster. Names are fictional and the numbers are deliberately
 * invalid, so nothing here can reach a real phone.
 */
export const DEMO_STAFF: StaffMember[] = [
  { id: 'n1', name: 'Nurse Kulkarni', role: 'nurse', phone: '+91 00000 00001' },
  { id: 'd1', name: 'Dr Mehta', role: 'doctor', phone: '+91 00000 00002' },
]
