import { Toaster } from "sonner";
import { useTheme } from "~/modules/theme";

export function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster theme={theme} position="bottom-right" richColors closeButton />
  );
}
