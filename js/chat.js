document.addEventListener('DOMContentLoaded', () => {
  const chatContainer = document.getElementById('kw-chat-widget');
  const chatMessages = document.getElementById('kw-chat-messages');
  const chatForm = document.getElementById('kw-chat-form');
  const chatInput = document.getElementById('kw-chat-input');
  const chatSendBtn = document.getElementById('kw-chat-send');
  const chatToggleBtn = document.getElementById('kw-chat-toggle');

  if (chatToggleBtn) {
    chatToggleBtn.addEventListener('click', () => {
      chatContainer.classList.toggle('minimized');
      chatToggleBtn.textContent = chatContainer.classList.contains('minimized') ? '+' : '−';
    });
  }

  // Dynamic Topic Inspector: Detects context keywords from the reasoning stream
  function detectThoughtTopic(text) {
    const lower = text.toLowerCase();
    
    if (lower.includes('event') || lower.includes('schedule') || lower.includes('time') || lower.includes('date')) {
      return 'Thinking about events & schedule...';
    }
    if (lower.includes('song') || lower.includes('request') || lower.includes('queue') || lower.includes('music')) {
      return 'Thinking about song requests...';
    }
    if (lower.includes('vrchat') || lower.includes('world') || lower.includes('instance') || lower.includes('join')) {
      return 'Thinking about VRChat world details...';
    }
    if (lower.includes('role') || lower.includes('staff') || lower.includes('team') || lower.includes('host')) {
      return 'Thinking about community roles & team...';
    }
    if (lower.includes('context') || lower.includes('database') || lower.includes('search') || lower.includes('query')) {
      return 'Analyzing database context...';
    }

    return 'Thinking...';
  }

  // Handle Streaming Chat Submission
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = chatInput.value.trim();
    if (!prompt) return;

    // 1. Render User Message
    appendMessage(prompt, 'user');
    chatInput.value = '';
    chatInput.disabled = true;
    chatSendBtn.disabled = true;

    // 2. Create AI Message Bubble Container
    const aiMsgDiv = document.createElement('div');
    aiMsgDiv.classList.add('kw-message', 'kw-message-ai');

    // Collapsible Live-Thinking Container (default to open while streaming)
    const detailsEl = document.createElement('details');
    detailsEl.className = 'kw-thought-container';
    detailsEl.open = true; 

    const summaryEl = document.createElement('summary');
    summaryEl.className = 'kw-thought-summary';
    
    const headerTextSpan = document.createElement('span');
    headerTextSpan.textContent = '🧠 Thinking...';
    summaryEl.appendChild(headerTextSpan);

    const thoughtContentEl = document.createElement('div');
    thoughtContentEl.className = 'kw-thought-content';

    detailsEl.appendChild(summaryEl);
    detailsEl.appendChild(thoughtContentEl);
    aiMsgDiv.appendChild(detailsEl);

    // Main Response Text Container
    const answerContainer = document.createElement('div');
    aiMsgDiv.appendChild(answerContainer);

    chatMessages.appendChild(aiMsgDiv);
    scrollToBottom();

    // 3. Keep scroll pinned as thinking container resizes
    const resizeObserver = new ResizeObserver(() => {
      scrollToBottom();
    });
    resizeObserver.observe(aiMsgDiv);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        throw new Error('Server returned an error response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let rawAnswerText = '';
      let reasoningText = '';
      let isInsideThinkTag = false;
      let hasThinkingStarted = false;
      let streamBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split('\n');
        
        // Keep unfinished last line in the buffer
        streamBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine.startsWith('data: ')) continue;

          const dataStr = trimmedLine.replace('data: ', '').trim();
          if (dataStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta || {};
            
            // Extract tokens across common API schemas (DeepSeek / OpenAI / Custom)
            const explicitReasoning = delta.reasoning_content || delta.thinking || parsed.reasoning || '';
            const standardContent = delta.content || parsed.response || '';

            // Handle dedicated reasoning payload fields
            if (explicitReasoning) {
              hasThinkingStarted = true;
              reasoningText += explicitReasoning;
              thoughtContentEl.textContent = reasoningText;
              headerTextSpan.textContent = `🧠 ${detectThoughtTopic(reasoningText)}`;
              continue;
            }

            // Handle inline <think> tag markers in content stream
            if (standardContent) {
              let chunkText = standardContent;

              if (chunkText.includes('<think>') || chunkText.includes('<thought>')) {
                isInsideThinkTag = true;
                hasThinkingStarted = true;
                chunkText = chunkText.replace(/<think>|<thought>/g, '');
              }

              if (chunkText.includes('</think>') || chunkText.includes('</thought>')) {
                isInsideThinkTag = false;
                const parts = chunkText.split(/<\/think>|<\/thought>/);
                reasoningText += parts[0];
                rawAnswerText += parts[1] || '';
                thoughtContentEl.textContent = reasoningText;
                headerTextSpan.textContent = '🧠 Thought Process';
                detailsEl.open = false; // Automatically collapse once thinking ends
                chunkText = '';
              }

              if (isInsideThinkTag) {
                reasoningText += chunkText;
                thoughtContentEl.textContent = reasoningText;
                headerTextSpan.textContent = `🧠 ${detectThoughtTopic(reasoningText)}`;
              } else if (chunkText) {
                rawAnswerText += chunkText;
                if (window.marked) {
                  answerContainer.innerHTML = marked.parse(rawAnswerText);
                } else {
                  answerContainer.textContent = rawAnswerText;
                }
              }
            }

          } catch (err) {
            // Ignore partial fragment JSON parse errors
          }
        }
      }

      // Finalize display after completion
      if (hasThinkingStarted && reasoningText.trim().length > 0) {
        headerTextSpan.textContent = '🧠 Thought Process';
        detailsEl.open = false; // Collapse thinking tray when answer is ready
      } else {
        // Clean up container if model provided no reasoning steps
        detailsEl.remove();
      }

    } catch (error) {
      console.error('Chat API Error:', error);
      answerContainer.textContent = 'Sorry, something went wrong. Please try again.';
    } finally {
      resizeObserver.disconnect();
      chatInput.disabled = false;
      chatSendBtn.disabled = false;
      chatInput.focus();
      scrollToBottom();
    }
  });

  function appendMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('kw-message', `kw-message-${sender}`);

    if (sender === 'user') {
      msgDiv.textContent = text;
    } else if (window.marked) {
      msgDiv.innerHTML = marked.parse(text);
    } else {
      msgDiv.textContent = text;
    }

    chatMessages.appendChild(msgDiv);
    scrollToBottom();
    return msgDiv;
  }

  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
});