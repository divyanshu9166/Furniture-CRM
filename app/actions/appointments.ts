'use server'

import { requireSection } from "@/lib/section-access";

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { createAppointmentSchema } from '@/lib/validations/appointment'

export async function getAppointments() {
  await requireSection("appointments");
  const appointments = await prisma.appointment.findMany({
    include: { contact: true },
    orderBy: { date: 'desc' },
  })

  return {
    success: true,
    data: appointments.map((a: any) => ({
      id: a.id,
      customer: a.contact.name,
      phone: a.contact.phone,
      date: a.date.toISOString().split('T')[0],
      time: a.time,
      purpose: a.purpose,
      status: a.status.charAt(0) + a.status.slice(1).toLowerCase(),
      notes: a.notes,
    })),
  }
}

export async function createAppointment(data: unknown) {
  await requireSection("appointments");
  const parsed = createAppointmentSchema.safeParse(data)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const { customer, phone, date, time, purpose, notes } = parsed.data

  let contact = await prisma.contact.findFirst({ where: { phone } })
  if (!contact) {
    contact = await prisma.contact.create({ data: { name: customer, phone } })
  }

  const appointment = await prisma.appointment.create({
    data: {
      contactId: contact.id,
      date: new Date(date),
      time,
      purpose,
      notes,
    },
  })

  revalidatePath('/appointments')
  return { success: true, data: appointment }
}

export async function updateAppointmentStatus(id: number, status: string) {
  await requireSection("appointments");
  const appointment = await prisma.appointment.update({
    where: { id },
    data: { status },
  })

  revalidatePath('/appointments')
  return { success: true, data: appointment }
}

export async function cancelAppointment(id: number) {
  await requireSection("appointments");
  return updateAppointmentStatus(id, 'Cancelled')
}
