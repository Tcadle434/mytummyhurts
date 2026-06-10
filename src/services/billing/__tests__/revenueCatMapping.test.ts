import { describe, expect, it } from 'vitest';
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

import {
  buildRevenueCatBillingSnapshot,
  buildRevenueCatPlanDisplay,
  revenueCatSnapshotToBillingSyncRequest,
  selectRevenueCatPackage,
} from '../revenueCatMapping';

describe('RevenueCat mapping', () => {
  it('uses monthly and annual packages for native paywall display', () => {
    const offering = mockOffering();

    expect(selectRevenueCatPackage(offering, 'monthly')?.identifier).toBe('$rc_monthly');
    expect(selectRevenueCatPackage(offering, 'annual')?.identifier).toBe('$rc_annual');
    expect(buildRevenueCatPlanDisplay(offering)).toEqual({
      monthly: { price: '$6.99/mo' },
      annual: { price: '$34.99/yr' },
    });
  });

  it('maps an active trial entitlement to a RevenueCat billing sync request', () => {
    const snapshot = buildRevenueCatBillingSnapshot(
      mockCustomerInfo({
        periodType: 'TRIAL',
        expirationDate: '2026-06-16T12:00:00Z',
        productIdentifier: 'monthly',
      }),
      {
        transaction: {
          transactionIdentifier: 'tx_123',
          productIdentifier: 'monthly',
          purchaseDate: '2026-06-09T12:00:00Z',
          purchaseToken: null,
        },
        now: new Date('2026-06-09T12:00:00Z'),
        revenueCatAppUserId: 'user-123',
      },
    );

    expect(snapshot).toMatchObject({
      entitlementActive: true,
      status: 'trialing',
      planCode: 'monthly',
      productId: 'monthly',
      trialEndsAt: '2026-06-16T12:00:00Z',
      transactionId: 'tx_123',
    });
    expect(revenueCatSnapshotToBillingSyncRequest(snapshot, 40)).toMatchObject({
      provider: 'revenuecat',
      providerSubscriptionId: 'user-123',
      status: 'trialing',
      planCode: 'monthly',
      monthlyAllowance: 40,
    });
  });

  it('does not unlock when the entitlement is missing', () => {
    const snapshot = buildRevenueCatBillingSnapshot(mockCustomerInfo({ includeEntitlement: false }));

    expect(snapshot.entitlementActive).toBe(false);
    expect(snapshot.status).toBe('expired');
  });
});

function mockOffering(): PurchasesOffering {
  const monthlyPackage = mockPackage('$rc_monthly', 'monthly', '$6.99');
  const annualPackage = mockPackage('$rc_annual', 'annual', '$34.99');
  return {
    identifier: 'default',
    serverDescription: 'Default',
    metadata: {},
    availablePackages: [monthlyPackage, annualPackage],
    monthly: monthlyPackage,
    annual: annualPackage,
    lifetime: null,
    sixMonth: null,
    threeMonth: null,
    twoMonth: null,
    weekly: null,
    webCheckoutUrl: null,
  } as unknown as PurchasesOffering;
}

function mockPackage(identifier: string, productId: string, priceString: string): PurchasesPackage {
  return {
    identifier,
    product: {
      identifier: productId,
      priceString,
    },
  } as unknown as PurchasesPackage;
}

function mockCustomerInfo({
  includeEntitlement = true,
  periodType = 'NORMAL',
  expirationDate = '2026-07-09T12:00:00Z',
  productIdentifier = 'annual',
}: {
  includeEntitlement?: boolean;
  periodType?: string;
  expirationDate?: string;
  productIdentifier?: string;
} = {}): CustomerInfo {
  const entitlement = {
    identifier: 'MyTummyHurts Pro',
    isActive: includeEntitlement,
    willRenew: true,
    periodType,
    latestPurchaseDate: '2026-06-09T12:00:00Z',
    latestPurchaseDateMillis: 1781006400000,
    originalPurchaseDate: '2026-06-09T12:00:00Z',
    originalPurchaseDateMillis: 1781006400000,
    expirationDate,
    expirationDateMillis: 1781611200000,
    store: 'APP_STORE',
    productIdentifier,
    productPlanIdentifier: null,
    isSandbox: true,
    unsubscribeDetectedAt: null,
    unsubscribeDetectedAtMillis: null,
    billingIssueDetectedAt: null,
    billingIssueDetectedAtMillis: null,
    ownershipType: 'PURCHASED',
    verification: 'NOT_REQUESTED',
  };

  return {
    entitlements: {
      active: includeEntitlement ? { 'MyTummyHurts Pro': entitlement } : {},
      all: includeEntitlement ? { 'MyTummyHurts Pro': entitlement } : {},
      verification: 'NOT_REQUESTED',
    },
    activeSubscriptions: includeEntitlement ? [productIdentifier] : [],
    allPurchasedProductIdentifiers: includeEntitlement ? [productIdentifier] : [],
    latestExpirationDate: includeEntitlement ? expirationDate : null,
    firstSeen: '2026-06-09T12:00:00Z',
    originalAppUserId: 'user-123',
    requestDate: '2026-06-09T12:00:00Z',
    allExpirationDates: includeEntitlement ? { [productIdentifier]: expirationDate } : {},
    allPurchaseDates: includeEntitlement ? { [productIdentifier]: '2026-06-09T12:00:00Z' } : {},
    originalApplicationVersion: null,
    originalPurchaseDate: null,
    managementURL: null,
    nonSubscriptionTransactions: [],
    subscriptionsByProductIdentifier: includeEntitlement
      ? {
          [productIdentifier]: {
            productIdentifier,
            purchaseDate: '2026-06-09T12:00:00Z',
            originalPurchaseDate: '2026-06-09T12:00:00Z',
            expiresDate: expirationDate,
            store: 'APP_STORE',
            unsubscribeDetectedAt: null,
            isSandbox: true,
            billingIssuesDetectedAt: null,
            ownershipType: 'PURCHASED',
            periodType,
            refundedAt: null,
            storeTransactionId: 'tx_123',
          },
        }
      : {},
  } as unknown as CustomerInfo;
}
