"use client";

import {
  PinAuthorizationModal,
  type PinAuthorizationSuccess,
} from "@/components/pos/PinAuthorizationModal";

export type ManagerPinSuccess = PinAuthorizationSuccess;

interface ManagerPinModalProps {
  open: boolean;
  onClose: () => void;
  onVerified: (result: ManagerPinSuccess) => void;
}

/** @deprecated Prefer PinAuthorizationModal — kept for existing POS imports. */
export function ManagerPinModal({
  open,
  onClose,
  onVerified,
}: ManagerPinModalProps) {
  return (
    <PinAuthorizationModal
      open={open}
      action="return_mode"
      onClose={onClose}
      onVerified={onVerified}
    />
  );
}
