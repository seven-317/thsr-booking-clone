import {ApiError, assertObject, requireEnum, requireString} from '@/lib/api/http';

const passengerTypes = ['ADULT', 'CHILD', 'SENIOR', 'DISABLED'] as const;

function parseEmail(value: unknown) {
  return requireString(value, 'email', {
    min: 5,
    max: 254,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  }).toLowerCase();
}

export function parseSignIn(value: unknown) {
  assertObject(value);
  return {
    email: parseEmail(value.email),
    password: requireString(value.password, 'password', {min: 8, max: 128})
  };
}

export function parseSignUp(value: unknown) {
  assertObject(value);
  const password = requireString(value.password, 'password', {min: 8, max: 128});
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) {
    throw new ApiError(400, 'BAD_REQUEST', 'password must contain at least one letter and one number.');
  }

  return {
    name: requireString(value.name, 'name', {min: 1, max: 100}),
    email: parseEmail(value.email),
    password
  };
}

export function parsePassenger(value: unknown) {
  assertObject(value);
  return {
    name: requireString(value.name, 'name', {min: 1, max: 100}),
    idNumber: requireString(value.idNumber, 'idNumber', {
      min: 6,
      max: 32,
      pattern: /^[A-Z0-9-]+$/i
    }).toUpperCase(),
    passengerType: requireEnum(value.passengerType, 'passengerType', passengerTypes)
  };
}
