import { useMemo } from "react";
import { buildMessageContextOptions, buildMessageParticipantOptions, normalizeMessageThread } from "../lib/appHelpers.jsx";

// Message threads plus the participant and context pickers.
export function useMessagingViews({ state, creditRecords }) {
  const messageConversations = useMemo(
    () => (state.conversations || []).map(normalizeMessageThread),
    [state.conversations],
  );
  const messageParticipantOptions = useMemo(
    () => buildMessageParticipantOptions(state.settings, state.employees),
    [state.settings, state.employees],
  );
  const messageContextOptions = useMemo(
    () =>
      buildMessageContextOptions({
        customers: state.customers,
        orders: state.orders,
        credits: creditRecords,
        tickets: state.supportTickets || [],
      }),
    [state.customers, state.orders, creditRecords, state.supportTickets],
  );
  return { messageConversations, messageParticipantOptions, messageContextOptions };
}
