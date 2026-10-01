import type {BookingDraft} from '@/lib/supabase/booking';

export const bookingDraftStorageKey = 'thsr-booking-draft-v1';

export function readBookingDraft() {
  const raw = window.sessionStorage.getItem(bookingDraftStorageKey);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as BookingDraft;
    if (!value || !Array.isArray(value.journeys) || value.journeys.length < 1) return null;
    return value;
  } catch {
    return null;
  }
}

export function writeBookingDraft(draft: BookingDraft) {
  window.sessionStorage.setItem(bookingDraftStorageKey, JSON.stringify(draft));
}

export function clearBookingDraft() {
  window.sessionStorage.removeItem(bookingDraftStorageKey);
}
