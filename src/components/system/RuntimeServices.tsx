import { ReactNode } from 'react';

import { NotificationResponseBridge } from './bridges/NotificationResponseBridge';
import { NotificationSchedulerBridge } from './bridges/NotificationSchedulerBridge';
import { PostHogIdentityBridge } from './bridges/PostHogIdentityBridge';
import { RemoteBootstrapBridge } from './bridges/RemoteBootstrapBridge';
import { RevenueCatBillingBridge } from './bridges/RevenueCatBillingBridge';
import { SessionBridge } from './bridges/SessionBridge';

type RuntimeServicesProps = {
  children: ReactNode;
};

export function RuntimeServices({ children }: RuntimeServicesProps) {
  return (
    <>
      <SessionBridge />
      <PostHogIdentityBridge />
      <RemoteBootstrapBridge />
      <RevenueCatBillingBridge />
      <NotificationResponseBridge />
      <NotificationSchedulerBridge />
      {children}
    </>
  );
}
