export function extractContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          if (part.type === 'text') return part.text || '';
          if (part.text) return part.text;
        }
        return '';
      })
      .join('\n');
  }
  return content ? String(content) : '';
}

export function parseMessages(messages) {
  if (!Array.isArray(messages)) {
    return { systemPrompt: '', conversationPrompt: '', userPrompt: '' };
  }

  const systemParts = [];
  const conversationTurns = [];

  for (const msg of messages) {
    const role = (msg.role || 'user').toLowerCase();
    const content = extractContent(msg.content);

    if (role === 'system' || role === 'developer') {
      systemParts.push(content);
    } else if (role === 'user') {
      conversationTurns.push({ role: 'User', content });
    } else if (role === 'assistant') {
      conversationTurns.push({ role: 'Assistant', content });
    } else {
      conversationTurns.push({ role, content });
    }
  }

  const systemPrompt = systemParts.join('\n\n').trim();

  // If there's only 1 message and it is a user message
  if (conversationTurns.length === 1 && conversationTurns[0].role === 'User') {
    const userPrompt = conversationTurns[0].content;
    const conversationPrompt = systemPrompt
      ? `${systemPrompt}\n\n${userPrompt}`
      : userPrompt;
    return { systemPrompt, conversationPrompt, userPrompt };
  }

  // Multi-turn conversation format
  const formattedTurns = conversationTurns
    .map(turn => `${turn.role}: ${turn.content}`)
    .join('\n\n');

  const conversationPrompt = systemPrompt
    ? `Instructions:\n${systemPrompt}\n\nConversation History:\n${formattedTurns}\n\nAssistant:`
    : `${formattedTurns}\n\nAssistant:`;

  const lastUserTurn = [...conversationTurns].reverse().find(t => t.role === 'User');
  const userPrompt = lastUserTurn ? lastUserTurn.content : '';

  return { systemPrompt, conversationPrompt, userPrompt };
}
