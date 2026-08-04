import { z } from "zod";

const dayHoursUpdateSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  isOpen: z.boolean(),
  opensAt: z.string().optional().nullable(),
  closesAt: z.string().optional().nullable(),
});

/** Réglages d'agenda (v1.1, AR-0179) — horaires par jour + capacité par créneau. */
export const businessHoursUpdateSchema = z.object({
  appointmentSlotCapacity: z.coerce.number().int().min(1).max(100).optional(),
  hours: z.array(dayHoursUpdateSchema).length(7),
});
