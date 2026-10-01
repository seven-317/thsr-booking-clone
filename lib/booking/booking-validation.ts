import {ApiError, assertObject, requireEnum, requireInteger, requireString} from '@/lib/api/http';
import {isDemoPaymentCard, type DemoPaymentCardInput} from '@/lib/booking/demo-payment';

const ticketTypes = ['adult', 'child', 'disabled', 'senior', 'student'] as const;
const seatTypes = ['STANDARD', 'BUSINESS'] as const;
const seatPreferences = ['none', 'window', 'aisle'] as const;

export function parseCreateBooking(value: unknown) {
  assertObject(value);
  const idempotencyKey = requireString(value.idempotencyKey, 'idempotencyKey', {
    min: 36,
    max: 36,
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  });

  if (!Array.isArray(value.journeys) || value.journeys.length < 1 || value.journeys.length > 2) {
    throw new ApiError(400, 'BAD_REQUEST', 'journeys must contain one or two journeys.');
  }
  const journeys = value.journeys.map((journey, index) => {
    const field = `journeys[${index}]`;
    assertObject(journey, field);
    return {
      scheduleId: requireInteger(journey.scheduleId, `${field}.scheduleId`),
      originStopId: requireInteger(journey.originStopId, `${field}.originStopId`),
      destinationStopId: requireInteger(journey.destinationStopId, `${field}.destinationStopId`),
      seatType: requireEnum(journey.seatType, `${field}.seatType`, seatTypes),
      seatPreference: requireEnum(journey.seatPreference, `${field}.seatPreference`, seatPreferences)
    };
  });

  if (!Array.isArray(value.tickets) || value.tickets.length < 1 || value.tickets.length > 10) {
    throw new ApiError(400, 'BAD_REQUEST', 'tickets must contain between one and ten tickets.');
  }
  if (journeys.length === 2 && value.tickets.length > 5) {
    throw new ApiError(400, 'BAD_REQUEST', 'Round trips are limited to five tickets per journey.');
  }

  const tickets = value.tickets.map((ticket, index) => {
    const field = `tickets[${index}]`;
    assertObject(ticket, field);
    return {
      passengerId: requireInteger(ticket.passengerId, `${field}.passengerId`),
      ticketType: requireEnum(ticket.ticketType, `${field}.ticketType`, ticketTypes)
    };
  });
  if (new Set(tickets.map((ticket) => ticket.passengerId)).size !== tickets.length) {
    throw new ApiError(400, 'BAD_REQUEST', 'Each passenger may appear only once in a booking.');
  }

  return {idempotencyKey, journeys, tickets};
}

export function parseBookingNumber(value: string) {
  return requireString(value, 'bookingNumber', {
    min: 10,
    max: 30,
    pattern: /^HSR[A-Z0-9]+$/
  });
}

export function parseDemoPayment(value: unknown): DemoPaymentCardInput {
  assertObject(value);
  const input = {
    cardNumber: requireString(value.cardNumber, 'cardNumber', {min: 16, max: 23}),
    expiry: requireString(value.expiry, 'expiry', {min: 5, max: 5, pattern: /^\d{2}\/\d{2}$/}),
    securityCode: requireString(value.securityCode, 'securityCode', {min: 3, max: 4, pattern: /^\d{3,4}$/}),
    cardholderName: requireString(value.cardholderName, 'cardholderName', {min: 2, max: 60})
  };

  if (!isDemoPaymentCard(input)) {
    throw new ApiError(400, 'INVALID_DEMO_CARD', 'The demo card details are incorrect.');
  }

  return input;
}
