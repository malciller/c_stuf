// Log view - handles parsing and rendering log messages

export function addMessage(streamName, message) {
  try {
    const messagesEl = document.getElementById(`messages-${streamName}`);
    if (!messagesEl) {
      return;
    }

    const messageEl = document.createElement('div');
    messageEl.className = 'mb-2 p-3 rounded-lg border-l-4 font-mono text-sm log-entry';

    let logData;
    try {
      logData = JSON.parse(message);
    } catch (e) {
      // Fallback for non-JSON messages
      const timestamp = new Date().toLocaleTimeString();
      const sanitizedMessage = String(message).replace(/[<>]/g, '');
      messageEl.className += ' bg-slate-800 border-slate-600';
      messageEl.innerHTML = `
        <div class="flex items-start space-x-2">
          <span class="text-slate-400 text-xs whitespace-nowrap">[${timestamp}]</span>
          <span class="text-slate-200">${sanitizedMessage}</span>
        </div>
      `;
      messagesEl.appendChild(messageEl);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return;
    }

    // Parse structured log data
    const { type, timestamp, level = 'INFO', section = 'unknown', message: logMessage, id } = logData;

    if (type !== 'log') {
      // Handle non-log messages
      const displayTimestamp = timestamp || new Date().toLocaleTimeString();
      const sanitizedMessage = String(message).replace(/[<>]/g, '');
      messageEl.className += ' bg-slate-800 border-slate-600';
      messageEl.innerHTML = `
        <div class="flex items-start space-x-2">
          <span class="text-slate-400 text-xs whitespace-nowrap">[${displayTimestamp}]</span>
          <span class="text-slate-200">${sanitizedMessage}</span>
        </div>
      `;
      messagesEl.appendChild(messageEl);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return;
    }

    // Color coding based on log level
    let levelColor = 'border-slate-500 bg-slate-800';
    let levelTextColor = 'text-slate-300';
    let messageColor = 'text-slate-200';

    switch (level.toUpperCase()) {
      case 'ERROR':
        levelColor = 'border-red-500 bg-red-950/30';
        levelTextColor = 'text-red-300';
        messageColor = 'text-red-100';
        break;
      case 'WARN':
      case 'WARNING':
        levelColor = 'border-yellow-500 bg-yellow-950/30';
        levelTextColor = 'text-yellow-300';
        messageColor = 'text-yellow-100';
        break;
      case 'INFO':
        levelColor = 'border-blue-500 bg-blue-950/30';
        levelTextColor = 'text-blue-300';
        messageColor = 'text-blue-100';
        break;
      case 'DEBUG':
        levelColor = 'border-gray-500 bg-gray-950/30';
        levelTextColor = 'text-gray-300';
        messageColor = 'text-gray-100';
        break;
      default:
        levelColor = 'border-slate-500 bg-slate-800';
        levelTextColor = 'text-slate-300';
        messageColor = 'text-slate-200';
    }

    messageEl.className += ` ${levelColor}`;

    const displayTimestamp = timestamp || new Date().toLocaleTimeString();
    const sanitizedMessage = String(logMessage).replace(/[<>]/g, '');

    messageEl.innerHTML = `
      <div class="flex items-start space-x-3">
        <span class="text-slate-400 text-xs whitespace-nowrap font-bold">${displayTimestamp}</span>
        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${levelTextColor} bg-slate-700/50 whitespace-nowrap">
          ${level}
        </span>
        <span class="text-slate-300 text-xs whitespace-nowrap">${section}</span>
        ${id ? `<span class="text-slate-500 text-xs whitespace-nowrap">#${id}</span>` : ''}
        <span class="${messageColor} flex-1 break-words">${sanitizedMessage}</span>
      </div>
    `;

    messagesEl.appendChild(messageEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Limit number of log messages to prevent memory issues
    while (messagesEl.children.length > 100) {
      messagesEl.removeChild(messagesEl.firstChild);
    }
  } catch (error) {
    console.error(`addMessage: Error adding message for stream ${streamName}:`, error);
  }
}

