import { mapRevenueCatSubscriberToBilling } from './revenueCat.ts';

Deno.test('mapRevenueCatSubscriberToBilling maps an active trial entitlement', () => {
  const billing = mapRevenueCatSubscriberToBilling(
    {
      subscriber: {
        original_app_user_id: 'user-123',
        entitlements: {
          'MyTummyHurts Pro': {
            product_identifier: 'monthly',
            purchase_date: '2026-06-09T12:00:00Z',
            expires_date: '2026-06-16T12:00:00Z',
          },
        },
        subscriptions: {
          monthly: {
            purchase_date: '2026-06-09T12:00:00Z',
            expires_date: '2026-06-16T12:00:00Z',
            period_type: 'trial',
            store_transaction_id: 'tx_123',
            original_transaction_id: 'original_tx_123',
          },
        },
      },
    },
    {
      appUserId: 'user-123',
      entitlementId: 'MyTummyHurts Pro',
      now: new Date('2026-06-10T12:00:00Z'),
    },
  );

  if (billing.status !== 'trialing') {
    throw new Error(`Expected trialing, received ${billing.status}`);
  }
  if (billing.planCode !== 'monthly') {
    throw new Error(`Expected monthly, received ${billing.planCode}`);
  }
  if (billing.trialEndsAt !== '2026-06-16T12:00:00Z') {
    throw new Error(`Expected trial end, received ${billing.trialEndsAt ?? 'null'}`);
  }
});

Deno.test('mapRevenueCatSubscriberToBilling maps missing entitlement to expired', () => {
  const billing = mapRevenueCatSubscriberToBilling(
    {
      subscriber: {
        original_app_user_id: 'user-123',
        entitlements: {},
        subscriptions: {},
      },
    },
    {
      appUserId: 'user-123',
      entitlementId: 'MyTummyHurts Pro',
      now: new Date('2026-06-10T12:00:00Z'),
    },
  );

  if (billing.status !== 'expired') {
    throw new Error(`Expected expired, received ${billing.status}`);
  }
});

Deno.test('mapRevenueCatSubscriberToBilling maps annual paid entitlement to active', () => {
  const billing = mapRevenueCatSubscriberToBilling(
    {
      subscriber: {
        original_app_user_id: 'user-123',
        entitlements: {
          'MyTummyHurts Pro': {
            product_identifier: 'annual',
            purchase_date: '2026-06-09T12:00:00Z',
            expires_date: '2027-06-09T12:00:00Z',
          },
        },
        subscriptions: {
          annual: {
            purchase_date: '2026-06-09T12:00:00Z',
            expires_date: '2027-06-09T12:00:00Z',
            period_type: 'normal',
          },
        },
      },
    },
    {
      appUserId: 'user-123',
      entitlementId: 'MyTummyHurts Pro',
      now: new Date('2026-06-10T12:00:00Z'),
    },
  );

  if (billing.status !== 'active') {
    throw new Error(`Expected active, received ${billing.status}`);
  }
  if (billing.planCode !== 'annual') {
    throw new Error(`Expected annual, received ${billing.planCode}`);
  }
});
