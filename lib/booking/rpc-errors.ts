import {ApiError} from '@/lib/api/http';

export function bookingRpcError(error: {message: string; code?: string}) {
  const message = error.message;
  if (message.includes('AUTH_REQUIRED')) {
    return new ApiError(401, 'UNAUTHORIZED', 'Authentication is required.');
  }
  if (message.includes('MEMBER_PROFILE_REQUIRED')) {
    return new ApiError(422, 'PROFILE_REQUIRED', 'A linked member profile is required before booking.');
  }
  if (message.includes('BOOKING_NOT_FOUND')) {
    return new ApiError(404, 'NOT_FOUND', 'The booking was not found.');
  }
  if (message.includes('BOOKING_CLOSED') || message.includes('BOOKING_WINDOW_CLOSED')) {
    return new ApiError(409, 'BOOKING_CLOSED', 'This booking or departure is no longer open for changes.');
  }
  if (message.includes('NO_SEATS_AVAILABLE') || error.code === '23505') {
    return new ApiError(409, 'INVENTORY_UNAVAILABLE', 'The requested seats are no longer available. Search again for current availability.');
  }
  if (message.includes('INVALID_') || message.includes('FARE_NOT_FOUND') || message.includes('PASSENGER_NOT_OWNED')) {
    return new ApiError(422, 'INVALID_BOOKING', 'The booking request is no longer valid. Search again and verify the passenger details.');
  }
  return error;
}
