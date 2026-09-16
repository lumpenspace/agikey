function invalid(message) {
  throw Object.assign(new Error(message), { statusCode: 400 });
}

export function validateMessages(messages) {
  if (!Array.isArray(messages)) invalid('messages must be an array');
  for (const message of messages) {
    if (!message || !['user', 'assistant', 'system', 'developer'].includes(message.role)) invalid('Each message needs a supported role');
    if (typeof message.content !== 'string') invalid('Only text message content is supported');
  }
}

export function validateBody(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') invalid('Request body must be a JSON object');
  if (body.messages !== undefined) validateMessages(body.messages);
  if (body.model !== undefined && (typeof body.model !== 'string' || !body.model.trim())) invalid('model must be a non-empty string');
  if (body.stream !== undefined && typeof body.stream !== 'boolean') invalid('stream must be a boolean');
  for (const field of ['id', 'conversation_id']) {
    if (body[field] !== undefined && (typeof body[field] !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body[field]))) invalid(`${field} must contain 1–128 letters, numbers, underscores or hyphens`);
  }
  for (const field of ['title', 'content']) {
    if (body[field] !== undefined && typeof body[field] !== 'string') invalid(`${field} must be a string`);
  }
  if (body.metadata !== undefined && (!body.metadata || typeof body.metadata !== 'object' || Array.isArray(body.metadata))) invalid('metadata must be an object');
  if (body.role !== undefined && body.role !== 'user') invalid('Conversation turns must have role user');
  if (body.message !== undefined) validateMessages([body.message]);
  if (body.prompt !== undefined && (typeof body.prompt !== 'string' || !body.prompt.trim())) invalid('prompt must be a non-empty string; batch prompts are not supported');
  for (const field of ['temperature', 'max_tokens', 'max_completion_tokens', 'tools', 'tool_choice', 'n', 'stop', 'top_p', 'seed', 'logprobs', 'presence_penalty', 'frequency_penalty']) {
    if (body[field] !== undefined) invalid(`${field} is not supported by this gateway`);
  }
  if (body.reasoning_effort !== undefined && !['low', 'medium', 'high'].includes(body.reasoning_effort)) invalid('reasoning_effort must be low, medium or high');
  if (body.response_format !== undefined) {
    const format = body.response_format;
    if (!format || !['json_object', 'json_schema'].includes(format.type)) invalid('response_format must be json_object or json_schema');
    if (format.type === 'json_schema' && (!format.json_schema?.schema || typeof format.json_schema.schema !== 'object' || Array.isArray(format.json_schema.schema))) invalid('json_schema.schema must be an object');
  }
}
