// PROTOTYPE — throwaway. Variant C's full-page Notification inbox (#16).
import { useOutletContext } from "react-router";
import { VariantCInbox, type Feed } from "~/components/prototype-notification-feed";

export default function PrototypeNotifications() {
  const { feed } = useOutletContext<{ feed: Feed }>();
  return <VariantCInbox feed={feed} />;
}
