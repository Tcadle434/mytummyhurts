export type ToastTone = 'success' | 'info' | 'error';

export type ToastPayload = {
  id?: string;
  message: string;
  detail?: string;
  tone?: ToastTone;
  durationMs?: number | null;
};

type ToastCommand =
  | {
      type: 'show';
      toast: ToastPayload;
    }
  | {
      type: 'hide';
      id?: string;
    };

type ToastListener = (command: ToastCommand) => void;

const listeners = new Set<ToastListener>();

export function showToast(toast: ToastPayload) {
  listeners.forEach((listener) => listener({ type: 'show', toast }));
}

export function hideToast(id?: string) {
  listeners.forEach((listener) => listener({ type: 'hide', id }));
}

export function subscribeToToasts(listener: ToastListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
