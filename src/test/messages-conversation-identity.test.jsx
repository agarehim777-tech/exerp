import { fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MessagesPageV2 } from '../components/AppWidgets.jsx';

it('selects the linked support conversation by stable identity despite identical titles', () => {
  const select = vi.fn();
  const { container } = render(<MessagesPageV2
    conversations={[
      { id: 'thread-other', title: 'Support', person: 'Agent', messages: [] },
      { id: 'thread-ticket', title: 'Support', person: 'Agent', ticketId: 'ticket-42', messages: [] },
    ]}
    conversationId="thread-other" setConversationId={select}
    draftMessage="" setDraftMessage={vi.fn()} sendMessage={vi.fn()}
    canManage={false} currentUser={{ name: 'Tester' }}
  />);
  const linked = container.querySelector('.conversation-row[data-conversation-id="thread-ticket"]');
  expect(linked).not.toBeNull();
  fireEvent.click(linked);
  expect(select).toHaveBeenCalledWith('thread-ticket');
  expect(container.querySelectorAll('.conversation-row')).toHaveLength(2);
});
