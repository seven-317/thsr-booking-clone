import 'server-only';

import type {SupabaseClient} from '@supabase/supabase-js';

import type {ScheduleSearchInput, ScheduleSearchResult, TicketType} from '@/lib/supabase/booking';

type DatabaseTrain = {train_id: number; train_number: string; train_type: string};
type DatabaseStop = {
  stop_id: number;
  station_id: number;
  stop_order: number;
  arrival_at: string | null;
  departure_at: string | null;
};
type DatabaseSchedule = {
  schedule_id: number;
  service_date: string;
  status: string;
  trains: DatabaseTrain | DatabaseTrain[];
  train_stops: DatabaseStop[] | null;
};
type DatabaseFare = {fare_type: string; amount: number | string};
type DatabaseSeat = {seat_id: number; train_id: number; seat_position: string};

const fareTypeByTicketType: Record<TicketType, string> = {
  adult: 'FULL',
  child: 'CHILD',
  disabled: 'DISABLED',
  senior: 'SENIOR',
  student: 'STUDENT'
};

function getSingleTrain(value: DatabaseTrain | DatabaseTrain[]) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeTrainNumber(value: string) {
  return value.replace(/^0+/, '') || '0';
}

export async function searchSchedulesOnServer(
  supabase: SupabaseClient,
  input: ScheduleSearchInput
): Promise<ScheduleSearchResult[]> {
  const [scheduleResponse, fareResponse] = await Promise.all([
    supabase
      .from('train_schedules')
      .select(`
        schedule_id,
        service_date,
        status,
        trains!inner(train_id,train_number,train_type),
        train_stops(stop_id,station_id,stop_order,arrival_at,departure_at)
      `)
      .eq('service_date', input.serviceDate)
      .eq('status', 'SCHEDULED'),
    supabase
      .from('fares')
      .select('fare_type,amount')
      .eq('origin_station_id', input.originStationId)
      .eq('destination_station_id', input.destinationStationId)
      .eq('seat_type', input.seatType)
  ]);

  if (scheduleResponse.error) throw scheduleResponse.error;
  if (fareResponse.error) throw fareResponse.error;

  const fares = (fareResponse.data ?? []) as DatabaseFare[];
  const fareByTicketType = Object.fromEntries(
    (Object.entries(fareTypeByTicketType) as [TicketType, string][]).flatMap(([ticketType, fareType]) => {
      const fare = fares.find((candidate) => candidate.fare_type === fareType);
      return fare ? [[ticketType, Number(fare.amount)]] : [];
    })
  ) as Partial<Record<TicketType, number>>;

  const totalFare = (Object.entries(input.ticketCounts) as [TicketType, number][]).reduce(
    (total, [ticketType, count]) => {
      if (count === 0) return total;
      const fare = fareByTicketType[ticketType];
      if (fare === undefined) throw new Error(`Missing ${fareTypeByTicketType[ticketType]} fare for this route.`);
      return total + fare * count;
    },
    0
  );

  const matchingSchedules = ((scheduleResponse.data ?? []) as DatabaseSchedule[])
    .flatMap((schedule) => {
      const train = getSingleTrain(schedule.trains);
      const stops = schedule.train_stops ?? [];
      const originStop = stops.find((stop) => stop.station_id === input.originStationId && stop.departure_at);
      const destinationStop = stops.find((stop) => stop.station_id === input.destinationStationId && stop.arrival_at);
      if (!train || !originStop?.departure_at || !destinationStop?.arrival_at || originStop.stop_order >= destinationStop.stop_order) return [];
      if (input.searchMode === 'train' && normalizeTrainNumber(train.train_number) !== normalizeTrainNumber(input.trainNumber ?? '')) return [];
      if (input.searchMode === 'time' && input.departureTime) {
        const earliestDeparture = Date.parse(`${input.serviceDate}T${input.departureTime}:00+08:00`);
        if (Date.parse(originStop.departure_at) < earliestDeparture) return [];
      }
      return [{schedule, train, stops, originStop, destinationStop}];
    })
    .sort((left, right) => Date.parse(left.originStop.departure_at!) - Date.parse(right.originStop.departure_at!));

  const trainIds = [...new Set(matchingSchedules.map(({train}) => train.train_id))];
  const seatsByTrain = new Map<number, DatabaseSeat[]>();
  if (trainIds.length > 0) {
    let seatQuery = supabase.from('seats').select('seat_id,train_id,seat_position').in('train_id', trainIds).eq('seat_type', input.seatType);
    if (input.seatPreference !== 'none') {
      seatQuery = seatQuery.eq('seat_position', input.seatPreference === 'window' ? 'WINDOW' : 'AISLE');
    }
    const {data, error} = await seatQuery;
    if (error) throw error;
    for (const seat of (data ?? []) as DatabaseSeat[]) {
      seatsByTrain.set(seat.train_id, [...(seatsByTrain.get(seat.train_id) ?? []), seat]);
    }
  }

  const relevantFromStopIds = matchingSchedules.flatMap(({stops, originStop, destinationStop}) =>
    stops
      .filter((stop) => stop.stop_order >= originStop.stop_order && stop.stop_order < destinationStop.stop_order)
      .map((stop) => stop.stop_id)
  );
  const segmentsByFromStop = new Map<number, number>();
  if (relevantFromStopIds.length > 0) {
    const {data, error} = await supabase.from('schedule_segments').select('segment_id,from_stop_id').in('from_stop_id', relevantFromStopIds);
    if (error) throw error;
    for (const segment of data ?? []) segmentsByFromStop.set(segment.from_stop_id as number, segment.segment_id as number);
  }

  const segmentIds = [...segmentsByFromStop.values()];
  const reservedSeatsBySegment = new Map<number, Set<number>>();
  if (segmentIds.length > 0) {
    const {data, error} = await supabase.from('seat_segment_reservations').select('segment_id,seat_id').in('segment_id', segmentIds);
    if (error) throw error;
    for (const reservation of data ?? []) {
      const segmentId = reservation.segment_id as number;
      const reserved = reservedSeatsBySegment.get(segmentId) ?? new Set<number>();
      reserved.add(reservation.seat_id as number);
      reservedSeatsBySegment.set(segmentId, reserved);
    }
  }

  return matchingSchedules.map(({schedule, train, stops, originStop, destinationStop}) => {
    const journeySegmentIds = stops
      .filter((stop) => stop.stop_order >= originStop.stop_order && stop.stop_order < destinationStop.stop_order)
      .map((stop) => segmentsByFromStop.get(stop.stop_id))
      .filter((segmentId): segmentId is number => segmentId !== undefined);
    const matchingSeatCount = (seatsByTrain.get(train.train_id) ?? []).filter((seat) =>
      journeySegmentIds.every((segmentId) => !reservedSeatsBySegment.get(segmentId)?.has(seat.seat_id))
    ).length;

    return {
      scheduleId: schedule.schedule_id,
      trainNumber: train.train_number,
      trainType: train.train_type,
      originStopId: originStop.stop_id,
      destinationStopId: destinationStop.stop_id,
      departureAt: originStop.departure_at!,
      arrivalAt: destinationStop.arrival_at!,
      durationMinutes: Math.round((Date.parse(destinationStop.arrival_at!) - Date.parse(originStop.departure_at!)) / 60000),
      matchingSeatCount,
      fareByTicketType,
      totalFare
    };
  });
}
