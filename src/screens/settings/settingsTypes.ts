import type { SettingsSection } from '../../navigation/types';

export type ExpandedSettingsSection = SettingsSection | null;

export type BusySettingsSection =
  | 'account'
  | 'conditions'
  | 'sensitivities'
  | 'symptoms'
  | 'diet'
  | 'notifications'
  | 'delete'
  | null;

export type SettingsStatusFeedback = {
  placement: 'account' | 'health' | 'general';
  message: string;
  tone: 'soft' | 'warm';
};
