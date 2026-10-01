import {ApiError, assertObject, requireEnum, requireInteger, requireString} from '@/lib/api/http';
import {
  type ScheduleSearchInput,
  type SeatPreference,
  type SeatType,
  type TicketCounts,
  type TicketType
} from '@/lib/supabase/booking';

const ticketTypes = ['adult', 'child', 'disabled', 'senior', 'student'] as const satisfies readonly TicketType[];
const seatTypes = ['STANDARD', 'BUSINESS'] as const satisfies readonly SeatType[];
const seatPreferences = ['none', 'window', 'aisle'] as const satisfies readonly SeatPreference[];
const searchModes = ['time', 'train'] as const;

function parseTicketCounts(value: unknown, field: string) {
  assertObject(value, field);
  const result = {} as TicketCounts;
  for (const ticketType of ticketTypes) {
    result[ticketType] = requireInteger(value[ticketType], `${field}.${ticketType}`, 0, 10);
  }
  return result;
}

export function parseScheduleSearch(value: unknown, field: string): ScheduleSearchInput {
  assertObject(value, field);
  const searchMode = requireEnum(value.searchMode, `${field}.searchMode`, searchModes);
  const serviceDate = requireString(value.serviceDate, `${field}.serviceDate`, {
    min: 10,
    max: 10,
    pattern: /^\d{4}-\d{2}-\d{2}$/
  });
  const [year, month, day] = serviceDate.split('-').map(Number);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    throw new ApiError(400, 'BAD_REQUEST', `${field}.serviceDate is not a valid date.`);
  }

  const ticketCounts = parseTicketCounts(value.ticketCounts, `${field}.ticketCounts`);
  const totalTickets = Object.values(ticketCounts).reduce((sum, count) => sum + count, 0);
  if (totalTickets < 1 || totalTickets > 10) {
    throw new ApiError(400, 'BAD_REQUEST', `${field}.ticketCounts must contain between 1 and 10 tickets.`);
  }

  const originStationId = requireInteger(value.originStationId, `${field}.originStationId`);
  const destinationStationId = requireInteger(value.destinationStationId, `${field}.destinationStationId`);
  if (originStationId === destinationStationId) {
    throw new ApiError(400, 'BAD_REQUEST', 'Origin and destination stations must be different.');
  }

  const input: ScheduleSearchInput = {
    originStationId,
    destinationStationId,
    serviceDate,
    searchMode,
    seatType: requireEnum(value.seatType, `${field}.seatType`, seatTypes),
    seatPreference: requireEnum(value.seatPreference, `${field}.seatPreference`, seatPreferences),
    ticketCounts
  };

  if (searchMode === 'time') {
    input.departureTime = requireString(value.departureTime, `${field}.departureTime`, {
      min: 5,
      max: 5,
      pattern: /^(?:[01]\d|2[0-3]):[0-5]\d$/
    });
  } else {
    input.trainNumber = requireString(value.trainNumber, `${field}.trainNumber`, {
      min: 1,
      max: 4,
      pattern: /^\d{1,4}$/
    });
  }

  return input;
}

export function parseSearchRequest(value: unknown) {
  assertObject(value);
  assertObject(value.captcha, 'captcha');
  if (!Array.isArray(value.journeys) || value.journeys.length < 1 || value.journeys.length > 2) {
    throw new ApiError(400, 'BAD_REQUEST', 'journeys must contain one or two searches.');
  }

  const journeys = value.journeys.map((journey, index) => parseScheduleSearch(journey, `journeys[${index}]`));
  if (journeys.length === 2 && journeys.some((journey) => Object.values(journey.ticketCounts).reduce((sum, count) => sum + count, 0) > 5)) {
    throw new ApiError(400, 'BAD_REQUEST', 'Round trips are limited to five tickets per journey.');
  }

  return {
    captcha: {
      challengeId: requireString(value.captcha.challengeId, 'captcha.challengeId', {
        min: 36,
        max: 36,
        pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      }),
      answer: requireString(value.captcha.answer, 'captcha.answer', {
        min: 6,
        max: 6,
        pattern: /^[2-9]{6}$/
      })
    },
    journeys
  };
}
