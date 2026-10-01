export const DEMO_PAYMENT_CARD = {
  number: '4242424242424242',
  displayNumber: '4242 4242 4242 4242',
  expiry: '12/34',
  securityCode: '123',
  cardholderName: 'THSR TEST'
} as const;

export type DemoPaymentCardInput = {
  cardNumber: string;
  expiry: string;
  securityCode: string;
  cardholderName: string;
};

export function isDemoPaymentCard(input: DemoPaymentCardInput) {
  return input.cardNumber.replace(/\D/g, '') === DEMO_PAYMENT_CARD.number
    && input.expiry.trim() === DEMO_PAYMENT_CARD.expiry
    && input.securityCode.trim() === DEMO_PAYMENT_CARD.securityCode
    && input.cardholderName.trim().toUpperCase() === DEMO_PAYMENT_CARD.cardholderName;
}
