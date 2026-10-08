import type { Prisma } from '@prisma/client'
import { activeStaff, assertId, billingContact, nextDocumentId } from './documents'
import { assertCustomTransition } from './rules'
import type { CreateCustomOrderInput, ScheduleVisitInput, UpdateMeasurementsInput, UpdateVisitInput } from '../validations/custom-order'

type Tx = Prisma.TransactionClient
export async function lockedCustomOrder(tx: Tx, id: number, staffId?: number) {
  assertId(id)
  await tx.$queryRaw`SELECT id FROM "CustomOrder" WHERE id = ${id} FOR UPDATE`
  const order = await tx.customOrder.findUnique({ where: { id } })
  if (!order) throw new Error('Custom order not found')
  if (staffId !== undefined && order.assignedStaffId !== staffId) throw new Error('Access denied: this order is not assigned to you')
  if (order.status === 'DELIVERED') throw new Error('Delivered custom orders cannot be changed')
  return order
}

export async function createCustom(tx: Tx, input: CreateCustomOrderInput, actor: string) {
  await activeStaff(tx, input.assignedStaffId)
  if (input.scheduleVisit) await activeStaff(tx, input.visitStaffId || input.assignedStaffId)
  if (input.referenceProductId && !await tx.product.findUnique({ where: { id: input.referenceProductId } })) throw new Error('Reference product not found')
  const contact = await billingContact(tx, input)
  const displayId = await nextDocumentId(tx, 'customOrder', 'CUS-')
  const { customer: _customer, phone: _phone, scheduleVisit, visitDate, visitTime, visitStaffId, estimatedDelivery, ...rest } = input
  const order = await tx.customOrder.create({ data: { ...rest, phone: contact.phone, contactId: contact.id, displayId, date: new Date(), estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null, referenceImages: input.referenceImages || [], photos: [], timeline: { create: { date: new Date(), event: 'Order Created', status: 'done', updatedBy: actor } } } })
  if (scheduleVisit) await scheduleCustomVisit(tx, { customOrderId: order.id, staffId: visitStaffId || input.assignedStaffId!, date: visitDate!, time: visitTime! }, actor)
  return order
}

export async function scheduleCustomVisit(tx: Tx, input: ScheduleVisitInput, actor: string) {
  const order = await lockedCustomOrder(tx, input.customOrderId)
  await activeStaff(tx, input.staffId)
  const contact = await tx.contact.findUniqueOrThrow({ where: { id: order.contactId } })
  const displayId = await nextDocumentId(tx, 'fieldVisit', `FV-${String(order.id).padStart(3, '0')}-`, 1)
  const visit = await tx.fieldVisit.create({ data: { displayId, staffId: input.staffId, customOrderId: order.id, customer: contact.name, address: order.address, date: new Date(), time: input.time, scheduledDate: new Date(input.date), scheduledTime: input.time, status: 'Scheduled', type: 'Measurement', notes: input.notes || `Custom order ${order.displayId}` } })
  await tx.customOrder.update({ where: { id: order.id }, data: { assignedStaffId: input.staffId } })
  await tx.customOrderTimeline.create({ data: { customOrderId: order.id, date: new Date(), event: 'Visit Scheduled', notes: `${input.date} at ${input.time}`, status: 'pending', updatedBy: actor } })
  return visit
}

export async function transitionCustom(tx: Tx, id: number, status: 'MEASUREMENT_SCHEDULED' | 'IN_PRODUCTION' | 'QUALITY_CHECK' | 'DELIVERED', actor: string) {
  const order = await lockedCustomOrder(tx, id)
  if (order.status === status) return order
  const jobs = await tx.productionOrder.findMany({ where: { customOrderId: id }, select: { status: true, qualityStatus: true } })
  const inventory = await tx.customOrderInventory.findMany({ where: { customOrderId: id } })
  assertCustomTransition(order.status, status, jobs, inventory)
  if (status === 'DELIVERED') {
    if (await tx.fieldVisit.count({ where: { customOrderId: id, status: { in: ['Scheduled', 'In Progress'] } } })) throw new Error('Complete or cancel outstanding field visits before delivery')
    await tx.customOrderInventory.updateMany({ where: { customOrderId: id, status: 'READY' }, data: { status: 'DELIVERED' } })
  }
  const updated = await tx.customOrder.update({ where: { id }, data: { status } })
  await tx.customOrderTimeline.create({ data: { customOrderId: id, date: new Date(), event: `Status updated to ${status}`, status: 'done', updatedBy: actor } })
  return updated
}

export async function measureCustom(tx: Tx, input: UpdateMeasurementsInput, urls: string[], actor: string, staffId?: number) {
  const order = await lockedCustomOrder(tx, input.customOrderId, staffId)
  const measurements = Object.fromEntries(Object.entries(input.measurements).filter(([, value]) => value !== undefined))
  await tx.customOrder.update({ where: { id: order.id }, data: { measurements, photos: [...new Set([...order.photos, ...urls])] } })
  await tx.customOrderTimeline.create({ data: { customOrderId: order.id, date: new Date(), event: 'Measurements updated', status: 'done', updatedBy: actor } })
}

export async function changeVisit(tx: Tx, input: UpdateVisitInput, actor: string, staffId?: number) {
  assertId(input.visitId)
  // Lock parent first, same ordering as schedule/delivery, to avoid deadlocks.
  const initial = await tx.fieldVisit.findUnique({ where: { id: input.visitId }, select: { customOrderId: true } })
  if (initial?.customOrderId) await lockedCustomOrder(tx, initial.customOrderId)
  await tx.$queryRaw`SELECT id FROM "FieldVisit" WHERE id = ${input.visitId} FOR UPDATE`
  const visit = await tx.fieldVisit.findUnique({ where: { id: input.visitId } })
  if (!visit) throw new Error('Visit not found')
  if (staffId !== undefined && visit.staffId !== staffId) throw new Error('Access denied: visit is assigned to another staff member')
  if (['Completed', 'Cancelled'].includes(visit.status)) throw new Error('A completed/cancelled visit cannot be reopened or completed again')
  const status = input.status || visit.status
  if (visit.status === 'In Progress' && status === 'Scheduled') throw new Error('An in-progress visit cannot return to scheduled')
  const photos = [...new Set([...visit.photoUrls, ...(input.photoUrls || [])])]
  const updated = await tx.fieldVisit.update({ where: { id: visit.id }, data: { status, ...(input.measurements ? { measurements: Object.fromEntries(Object.entries(input.measurements).filter(([, value]) => value !== undefined)) } : {}), ...(input.staffNotes !== undefined ? { staffNotes: input.staffNotes } : {}), photoUrls: photos, photos: photos.length, completedAt: status === 'Completed' ? new Date() : null } })
  if (status === 'Completed' && visit.customOrderId) {
    const order = await tx.customOrder.findUniqueOrThrow({ where: { id: visit.customOrderId } })
    const measurements = input.measurements ? Object.fromEntries(Object.entries(input.measurements).filter(([, value]) => value !== undefined)) : visit.measurements
    await tx.customOrder.update({ where: { id: order.id }, data: { ...(measurements ? { measurements: measurements as Prisma.InputJsonValue } : {}), photos: [...new Set([...order.photos, ...photos])] } })
    await tx.customOrderTimeline.create({ data: { customOrderId: order.id, date: new Date(), event: `Visit completed by ${actor}`, notes: input.staffNotes, status: 'done', updatedBy: actor } })
  }
  return updated
}
