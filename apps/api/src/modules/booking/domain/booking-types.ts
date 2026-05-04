import type { BookingStatus } from "@prisma/client";

export interface BookingEntity {
  id: string;
  customerId: string;
  priceQuoteId: string;
  status: BookingStatus;
  version: number;
  createdAt: Date;
}
