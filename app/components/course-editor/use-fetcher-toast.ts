import { useEffect, useRef } from "react";
import { toast } from "sonner";

type Fetcher = {
  state: string;
  data: { success?: boolean; error?: string } | undefined;
};

/** Toasts the result of a course editor action once the fetcher settles. */
export function useFetcherToast(
  fetcher: Fetcher,
  successMessage: string,
  onSuccess?: () => void
) {
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    if (fetcher.data?.success) {
      onSuccessRef.current?.();
      toast.success(successMessage);
    }
    if (fetcher.data?.error) {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data, successMessage]);
}
